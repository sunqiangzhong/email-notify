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

module.exports = { createProxyAgent, testProxyConnection };
