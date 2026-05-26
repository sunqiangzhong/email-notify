/**
 * 代理配置控制器
 */
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../models/db');
const { testProxyConnection } = require('../services/proxyService');

/**
 * GET /api/proxy
 * 获取当前用户的代理配置
 */
async function getProxy(req, res, next) {
  try {
    const db = getDB();
    const proxy = db.data.proxies.find(p => p.userId === req.userId);

    if (!proxy) {
      // 返回默认配置
      return res.json({
        enabled: false,
        type: 'SOCKS5',
        host: '',
        port: 1080,
        username: '',
        password: '',
        latency: null,
      });
    }

    res.json(proxy);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/proxy
 * 更新代理配置 (upsert)
 */
async function updateProxy(req, res, next) {
  try {
    const db = getDB();
    const { enabled, type, host, port, username, password } = req.body;

    let proxy = db.data.proxies.find(p => p.userId === req.userId);

    if (proxy) {
      // 更新
      if (enabled !== undefined) proxy.enabled = enabled;
      if (type !== undefined) proxy.type = type;
      if (host !== undefined) proxy.host = host;
      if (port !== undefined) proxy.port = port;
      if (username !== undefined) proxy.username = username;
      if (password !== undefined) proxy.password = password;
    } else {
      // 创建
      proxy = {
        id: uuidv4(),
        userId: req.userId,
        enabled: enabled || false,
        type: type || 'SOCKS5',
        host: host || '',
        port: port || 1080,
        username: username || '',
        password: password || '',
        latency: null,
      };
      db.data.proxies.push(proxy);
    }

    await db.write();
    res.json(proxy);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/proxy/test
 * 测试代理连接
 */
async function testProxy(req, res, next) {
  try {
    const db = getDB();
    const proxyConfig = req.body.enabled !== undefined
      ? req.body
      : db.data.proxies.find(p => p.userId === req.userId);

    if (!proxyConfig || !proxyConfig.enabled) {
      return res.json({ success: true, latency: null, message: '代理未启用，将直连' });
    }

    const result = await testProxyConnection(proxyConfig);

    // 更新延迟记录
    const dbProxy = db.data.proxies.find(p => p.userId === req.userId);
    if (dbProxy) {
      dbProxy.latency = result.latency;
      await db.write();
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { getProxy, updateProxy, testProxy };
