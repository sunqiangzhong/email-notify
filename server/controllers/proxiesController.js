/**
 * 代理配置控制器
 */
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../models/db');
const { testProxyConnection } = require('../services/proxyService');
const { fullConnectivityTest, PRESET_TARGETS } = require('../services/connectivityService');
const mailService = require('../services/mailService');

async function getProxies(req, res, next) {
  try {
    const db = getDB();
    const proxies = db.data.proxies.filter(p => p.userId === req.userId);
    res.json({ success: true, data: proxies });
  } catch (err) {
    next(err);
  }
}

async function getProxyById(req, res, next) {
  try {
    const db = getDB();
    const proxy = db.data.proxies.find(p => p.id === req.params.id && p.userId === req.userId);
    if (!proxy) {
      return res.status(404).json({ success: false, code: 'PROXY_NOT_FOUND', message: '代理配置不存在' });
    }
    res.json({ success: true, data: proxy });
  } catch (err) {
    next(err);
  }
}

async function createProxy(req, res, next) {
  try {
    const db = getDB();
    const { name, type, host, port, username, password } = req.body;

    if (!host || !port) {
      return res.status(400).json({ success: false, code: 'MISSING_FIELDS', message: '主机和端口不能为空' });
    }

    // 幂等：同一用户 + 同 host + 同端口 = 更新，避免重复创建
    const existing = db.data.proxies.find(
      p => p.userId === req.userId && p.host === host && p.port === parseInt(port, 10)
    );

    let proxy;
    if (existing) {
      existing.name = name || existing.name;
      existing.type = type || existing.type;
      existing.username = username != null ? username : existing.username;
      existing.password = password != null ? password : existing.password;
      existing.updatedAt = new Date().toISOString();
      proxy = existing;
    } else {
      proxy = {
        id: uuidv4(),
        userId: req.userId,
        name: name || `${(type || 'socks5').toUpperCase()} Proxy`,
        type: type || 'socks5',
        host,
        port: parseInt(port, 10),
        username: username || '',
        password: password || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.data.proxies.push(proxy);
    }

    await db.write('proxies');

    // 重启已使用该代理的活跃账户以使更新生效
    const affectedAccounts = db.data.accounts.filter(
      a => a.userId === req.userId && a.active !== false && a.useProxy && a.proxyId === proxy.id
    );
    for (const account of affectedAccounts) {
      try { await mailService.restartAccount(account.id); } catch (_) {}
    }

    const message = existing
      ? '代理更新成功'
      : '代理创建成功';
    res.status(existing ? 200 : 201).json({ success: true, code: 'PROXY_SAVED', message, data: proxy });
  } catch (err) {
    next(err);
  }
}

async function updateProxy(req, res, next) {
  try {
    const db = getDB();
    const proxy = db.data.proxies.find(p => p.id === req.params.id && p.userId === req.userId);

    if (!proxy) {
      return res.status(404).json({ success: false, code: 'PROXY_NOT_FOUND', message: '代理配置不存在' });
    }

    const { name, type, host, port, username, password } = req.body;

    if (name !== undefined) proxy.name = name;
    if (type !== undefined) proxy.type = type;
    if (host !== undefined) proxy.host = host;
    if (port !== undefined) proxy.port = port;
    if (username !== undefined) proxy.username = username;
    if (password !== undefined) proxy.password = password;
    proxy.updatedAt = new Date().toISOString();

    await db.write('proxies');

    // 重启已使用该代理的活跃账户以使更新生效
    const affectedAccounts = db.data.accounts.filter(
      a => a.userId === req.userId && a.active !== false && a.useProxy && a.proxyId === proxy.id
    );
    for (const account of affectedAccounts) {
      try { await mailService.restartAccount(account.id); } catch (_) {}
    }

    res.json({ success: true, code: 'PROXY_UPDATED', message: '代理更新成功', data: proxy });
  } catch (err) {
    next(err);
  }
}

async function deleteProxy(req, res, next) {
  try {
    const db = getDB();
    const index = db.data.proxies.findIndex(p => p.id === req.params.id && p.userId === req.userId);

    if (index === -1) {
      return res.status(404).json({ success: false, code: 'PROXY_NOT_FOUND', message: '代理配置不存在' });
    }

    const proxyId = db.data.proxies[index].id;
    db.data.proxies.splice(index, 1);

    // 清除所有引用此代理的邮箱账户的代理设置
    const affectedAccounts = db.data.accounts.filter(a => a.userId === req.userId && a.proxyId === proxyId);
    for (const account of affectedAccounts) {
      account.useProxy = false;
      account.proxyId = null;
      account.updatedAt = new Date().toISOString();
    }

    await db.write('proxies', 'accounts');

    // 重启受影响的账户（切换到直连模式）
    for (const account of affectedAccounts) {
      try { await mailService.restartAccount(account.id); } catch (_) {}
    }

    res.json({ success: true, code: 'PROXY_DELETED', message: '代理删除成功' });
  } catch (err) {
    next(err);
  }
}

async function testConnectivity(req, res, next) {
  try {
    const { host, port, type } = req.body;

    if (!host || !port) {
      return res.status(400).json({ success: false, code: 'MISSING_FIELDS', message: '主机和端口不能为空' });
    }

    const targets = [...PRESET_TARGETS.network, ...PRESET_TARGETS.email];
    const result = await fullConnectivityTest(
      { host, port: parseInt(port), type: type || 'socks5' },
      targets
    );

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getProxies,
  getProxyById,
  createProxy,
  updateProxy,
  deleteProxy,
  testConnectivity,
};
