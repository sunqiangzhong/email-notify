/**
 * 代理服务 - 构建带代理的 HTTP/IMAP Agent
 */
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const axios = require('axios');
const config = require('../config');

/**
 * 根据代理配置创建代理 Agent
 * @param {object} proxyConfig - { enabled, type, host, port, username, password }
 * @returns {Agent|null}
 */
function createProxyAgent(proxyConfig) {
  // 代理对象存在即视为可用（数据库中的代理对象没有 enabled 字段）
  if (!proxyConfig) {
    return null;
  }

  const { type: rawType, host, port, username, password } = proxyConfig;
  const type = (rawType || '').toUpperCase();

  if (!host || !port) {
    return null;
  }

  let proxyUrl;
  const auth = username ? `${encodeURIComponent(username)}:${encodeURIComponent(password || '')}@` : '';

  if (type === 'SOCKS5') {
    proxyUrl = `socks5://${auth}${host}:${port}`;
    return new SocksProxyAgent(proxyUrl);
  } else if (type === 'HTTP') {
    proxyUrl = `http://${auth}${host}:${port}`;
    return new HttpsProxyAgent(proxyUrl);
  }

  return null;
}

/**
 * 测试代理连接
 * @param {object} proxyConfig
 * @returns {Promise<{success: boolean, latency: number|null, error?: string}>}
 */
async function testProxyConnection(proxyConfig) {
  if (!proxyConfig) {
    return { success: true, latency: null, message: '代理未启用，将直连' };
  }

  const agent = createProxyAgent(proxyConfig);
  if (!agent) {
    return { success: false, latency: null, error: '无效的代理配置' };
  }

  const startTime = Date.now();

  try {
    const response = await axios.get('https://httpbin.org/ip', {
      httpAgent: agent,
      httpsAgent: agent,
      timeout: config.proxyTestTimeout,
    });

    const latency = Date.now() - startTime;
    return {
      success: true,
      latency,
      ip: response.data.origin,
      message: `代理连接成功，延迟 ${latency}ms`,
    };
  } catch (err) {
    const latency = Date.now() - startTime;
    return {
      success: false,
      latency: -1,
      error: err.message || '代理连接失败',
    };
  }
}

/**
 * 测试代理连通性（详细测试）
 * @param {object} proxyConfig - { host, port, type }
 * @returns {Promise<object>}
 */
async function testConnectivity(proxyConfig) {
  const { host, port, type } = proxyConfig;

  // 测试代理服务器本身的连通性
  const proxyResult = await testProxyReachability(host, port, type);

  // 测试通过代理访问常见服务
  const targets = [
    { name: 'Google', host: 'www.google.com', port: 443 },
    { name: 'GitHub', host: 'github.com', port: 443 },
    { name: '企业微信', host: 'qyapi.weixin.qq.com', port: 443 },
  ];

  const targetResults = [];

  if (proxyResult.reachable) {
    // 通过代理测试目标服务
    const agent = createProxyAgent({ enabled: true, type, host, port });

    for (const target of targets) {
      try {
        const startTime = Date.now();
        await axios.get(`https://${target.host}`, {
          httpsAgent: agent,
          timeout: 10000,
        });
        targetResults.push({
          ...target,
          success: true,
          latency: Date.now() - startTime,
        });
      } catch (err) {
        targetResults.push({
          ...target,
          success: false,
          error: err.message,
        });
      }
    }
  } else {
    // 代理不可达，所有目标都标记为失败
    for (const target of targets) {
      targetResults.push({
        ...target,
        success: false,
        error: '代理不可达',
      });
    }
  }

  return {
    proxy: {
      host,
      port,
      type,
      reachable: proxyResult.reachable,
      latency: proxyResult.latency,
    },
    targets: targetResults,
  };
}

/**
 * 测试代理服务器是否可达
 * @param {string} host
 * @param {number} port
 * @param {string} type
 * @returns {Promise<{reachable: boolean, latency: number|null}>}
 */
async function testProxyReachability(host, port, type) {
  const net = require('net');
  const startTime = Date.now();

  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 5000;

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      const latency = Date.now() - startTime;
      socket.destroy();
      resolve({ reachable: true, latency });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ reachable: false, latency: null });
    });

    socket.on('error', () => {
      socket.destroy();
      resolve({ reachable: false, latency: null });
    });

    socket.connect(port, host);
  });
}

module.exports = { createProxyAgent, testProxyConnection, testConnectivity };
