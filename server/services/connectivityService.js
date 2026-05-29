/**
 * 连通性测试服务
 *
 * 设计参照 MoviePilot 站点连通性测试:
 *   - 每个站点独立测试，返回标准化结果
 *   - 支持 TCP Socket 级别检查和 HTTP 级别检查
 *   - 支持通过代理测试
 *   - 可单独测试某个目标，也可批量测试
 */

const net = require('net');
const axios = require('axios');
const { createProxyAgent } = require('./proxyService');

// ──────────────────────────────────────────────
// 预定义测试目标
// ──────────────────────────────────────────────

const PRESET_TARGETS = {
  // 邮件服务器
  email: [
    { name: 'QQ邮箱 IMAP', host: 'imap.qq.com', port: 993, category: 'email' },
    { name: 'Gmail IMAP', host: 'imap.gmail.com', port: 993, category: 'email' },
    { name: 'Outlook IMAP', host: 'imap-mail.outlook.com', port: 993, category: 'email' },
    { name: '163邮箱 IMAP', host: 'imap.163.com', port: 993, category: 'email' },
  ],
  // 通知服务
  notification: [
    { name: 'Server酱 API', host: 'sctapi.ftqq.com', port: 443, category: 'notification' },
    { name: '企业微信 API', host: 'qyapi.weixin.qq.com', port: 443, category: 'notification' },
    { name: 'PushDeer API', host: 'api2.pushdeer.com', port: 443, category: 'notification' },
  ],
  // 通用网络
  network: [
    { name: 'Google', host: 'www.google.com', port: 443, category: 'network' },
    { name: 'GitHub', host: 'github.com', port: 443, category: 'network' },
    { name: 'Baidu', host: 'www.baidu.com', port: 443, category: 'network' },
    { name: 'YouTube', host: 'www.youtube.com', port: 443, category: 'network' },
  ],
};

// 默认超时 (ms)
const DEFAULT_TIMEOUT = 5000;

// ──────────────────────────────────────────────
// TCP Socket 级别检查
// ──────────────────────────────────────────────

/**
 * 测试 TCP 连通性（参照 MoviePilot 的 socket.connect 方式）
 * @param {string} host
 * @param {number} port
 * @param {number} timeout - 超时毫秒数
 * @returns {Promise<{reachable: boolean, latency: number|null}>}
 */
function checkTcp(host, port, timeout = DEFAULT_TIMEOUT) {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const socket = new net.Socket();

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

// ──────────────────────────────────────────────
// HTTP 级别检查
// ──────────────────────────────────────────────

/**
 * 通过 HTTP(S) 请求测试站点可达性
 * @param {string} host
 * @param {number} port
 * @param {object} [proxyConfig] - 代理配置 {type, host, port, username, password}
 * @param {number} [timeout] - 超时毫秒数
 * @returns {Promise<{success: boolean, latency: number|null, status: number|null, error?: string}>}
 */
async function checkHttp(host, port, proxyConfig, timeout = DEFAULT_TIMEOUT) {
  const scheme = port === 443 ? 'https' : 'http';
  const url = `${scheme}://${host}`;
  const startTime = Date.now();

  try {
    const axiosConfig = {
      timeout,
      // 只需要验证可达性，不需要完整页面
      maxRedirects: 3,
      validateStatus: () => true, // 任何 HTTP 状态码都视为"可达"
    };

    // 如果有代理配置，附加代理 agent
    if (proxyConfig) {
      const agent = createProxyAgent(proxyConfig);
      if (agent) {
        axiosConfig.httpsAgent = agent;
        axiosConfig.httpAgent = agent;
      }
    }

    const response = await axios.get(url, axiosConfig);
    const latency = Date.now() - startTime;

    return {
      success: true,
      latency,
      status: response.status,
    };
  } catch (err) {
    const latency = Date.now() - startTime;
    return {
      success: false,
      latency,
      status: null,
      error: err.message || '连接失败',
    };
  }
}

// ──────────────────────────────────────────────
// 单个目标测试（标准化结果）
// ──────────────────────────────────────────────

/**
 * 测试单个目标的连通性
 * 返回标准化结果格式，参照 MoviePilot 设计
 *
 * @param {object} target - {name, host, port, category?}
 * @param {object} [options] - {proxyConfig, timeout, mode}
 *   mode: 'tcp' | 'http' | 'auto' (默认 auto = 先 tcp 再 http)
 * @returns {Promise<{name, host, port, category, success, latency, mode, error?}>}
 */
async function testSingleTarget(target, options = {}) {
  const { proxyConfig, timeout = DEFAULT_TIMEOUT, mode = 'auto' } = options;
  const { name, host, port, category = 'custom' } = target;

  if (!host || !port) {
    return {
      name,
      host,
      port,
      category,
      success: false,
      latency: null,
      mode: 'tcp',
      error: '主机或端口未指定',
    };
  }

  // TCP 模式: 仅做 socket 连通性检查
  if (mode === 'tcp') {
    const tcpResult = await checkTcp(host, port, timeout);
    return {
      name,
      host,
      port,
      category,
      success: tcpResult.reachable,
      latency: tcpResult.latency,
      mode: 'tcp',
      error: tcpResult.reachable ? undefined : 'TCP 连接超时或被拒绝',
    };
  }

  // HTTP 模式: 仅做 HTTP 请求检查
  if (mode === 'http') {
    const httpResult = await checkHttp(host, port, proxyConfig, timeout);
    return {
      name,
      host,
      port,
      category,
      success: httpResult.success,
      latency: httpResult.latency,
      mode: 'http',
      status: httpResult.status,
      error: httpResult.error,
    };
  }

  // Auto 模式 (默认): 先 TCP 检查，成功后再做 HTTP 检查
  const tcpResult = await checkTcp(host, port, timeout);

  if (!tcpResult.reachable) {
    return {
      name,
      host,
      port,
      category,
      success: false,
      latency: null,
      mode: 'tcp',
      error: 'TCP 连接超时或被拒绝',
    };
  }

  // TCP 可达，尝试 HTTP 检查
  const httpResult = await checkHttp(host, port, proxyConfig, timeout);

  return {
    name,
    host,
    port,
    category,
    success: httpResult.success,
    latency: httpResult.latency || tcpResult.latency,
    mode: 'http',
    status: httpResult.status,
    error: httpResult.error,
  };
}

// ──────────────────────────────────────────────
// 批量测试
// ──────────────────────────────────────────────

/**
 * 批量测试多个目标（并行）
 *
 * @param {Array} targets - [{name, host, port, category?}, ...]
 * @param {object} [options] - {proxyConfig, timeout, mode}
 * @returns {Promise<Array>} 标准化结果数组
 */
async function testMultipleTargets(targets, options = {}) {
  const results = await Promise.all(
    targets.map(target => testSingleTarget(target, options))
  );
  return results;
}

/**
 * 测试代理服务器本身是否可达
 * @param {object} proxyConfig - {host, port, type}
 * @param {number} [timeout]
 * @returns {Promise<{host, port, type, reachable, latency}>}
 */
async function testProxyReachability(proxyConfig, timeout = DEFAULT_TIMEOUT) {
  const { host, port, type } = proxyConfig;
  const tcpResult = await checkTcp(host, port, timeout);

  return {
    host,
    port,
    type,
    reachable: tcpResult.reachable,
    latency: tcpResult.latency,
  };
}

/**
 * 完整连通性测试: 代理可达性 + 目标站点测试
 *
 * @param {object} proxyConfig - {host, port, type}
 * @param {Array} [targets] - 自定义目标列表，为空则测试全部预设
 * @param {object} [options] - {timeout, mode}
 * @returns {Promise<{proxy, targets, summary}>}
 */
async function fullConnectivityTest(proxyConfig, targets, options = {}) {
  const { timeout = DEFAULT_TIMEOUT, mode = 'auto' } = options;

  // 1. 测试代理可达性
  const proxyResult = await testProxyReachability(proxyConfig, timeout);

  // 2. 确定要测试的目标列表
  const testTargets = targets || [
    ...PRESET_TARGETS.network,
    ...PRESET_TARGETS.email,
  ];

  // 3. 如果代理可达，通过代理测试目标；否则直连测试
  const targetOptions = {
    timeout,
    mode,
    proxyConfig: proxyResult.reachable ? proxyConfig : null,
  };

  const targetResults = await testMultipleTargets(testTargets, targetOptions);

  // 4. 汇总结果
  const successCount = targetResults.filter(r => r.success).length;

  return {
    proxy: proxyResult,
    targets: targetResults,
    summary: {
      total: targetResults.length,
      success: successCount,
      failed: targetResults.length - successCount,
      proxyUsed: proxyResult.reachable,
    },
  };
}

module.exports = {
  checkTcp,
  checkHttp,
  testSingleTarget,
  testMultipleTargets,
  testProxyReachability,
  fullConnectivityTest,
  PRESET_TARGETS,
};
