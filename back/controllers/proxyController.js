/**
 * 代理控制器
 * 处理代理配置的 CRUD 操作
 */
const { v4: uuidv4 } = require('uuid');
const net = require('net');
const { proxiesDb } = require('../models/database');

/**
 * 获取当前用户的所有代理配置
 * GET /api/proxies
 */
const getAll = async (req, res) => {
  try {
    const userId = req.user.userId;
    const proxies = proxiesDb.get('proxies').filter({ userId }).value();
    return res.json({
      success: true,
      code: 'PROXIES_FOUND',
      message: '获取代理列表成功',
      data: proxies,
    });
  } catch (error) {
    console.error('获取代理列表错误:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
};

/**
 * 获取单个代理配置详情
 * GET /api/proxies/:id
 */
const getById = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const proxy = proxiesDb.get('proxies').find({ userId, id }).value();
    if (!proxy) {
      return res.status(404).json({
        success: false,
        code: 'PROXY_NOT_FOUND',
        message: '代理配置不存在',
      });
    }

    return res.json({
      success: true,
      code: 'PROXY_FOUND',
      message: '获取代理详情成功',
      data: proxy,
    });
  } catch (error) {
    console.error('获取代理详情错误:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
};

/**
 * 创建新代理配置
 * POST /api/proxies
 */
const create = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, type, host, port, username, password } = req.body;

    // 验证必填字段
    if (!name || !type || !host || !port) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: '名称、类型、主机和端口为必填项',
      });
    }

    // 验证代理类型
    const validTypes = ['socks5', 'socks4', 'http', 'https'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_TYPE',
        message: `代理类型必须是以下之一: ${validTypes.join(', ')}`,
      });
    }

    const newProxy = {
      id: uuidv4(),
      userId,
      name,
      type,
      host,
      port: parseInt(port),
      username: username || null,
      password: password || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    proxiesDb.get('proxies').push(newProxy).write();

    return res.status(201).json({
      success: true,
      code: 'PROXY_CREATED',
      message: '代理配置创建成功',
      data: newProxy,
    });
  } catch (error) {
    console.error('创建代理配置错误:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
};

/**
 * 更新代理配置
 * PUT /api/proxies/:id
 */
const update = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { name, type, host, port, username, password } = req.body;

    const existingProxy = proxiesDb.get('proxies').find({ userId, id }).value();
    if (!existingProxy) {
      return res.status(404).json({
        success: false,
        code: 'PROXY_NOT_FOUND',
        message: '代理配置不存在',
      });
    }

    // 验证代理类型（如果提供）
    if (type) {
      const validTypes = ['socks5', 'socks4', 'http', 'https'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_TYPE',
          message: `代理类型必须是以下之一: ${validTypes.join(', ')}`,
        });
      }
    }

    const updateData = {
      name: name || existingProxy.name,
      type: type || existingProxy.type,
      host: host || existingProxy.host,
      port: port ? parseInt(port) : existingProxy.port,
      username: username !== undefined ? username : existingProxy.username,
      password: password !== undefined ? password : existingProxy.password,
      updatedAt: new Date().toISOString(),
    };

    proxiesDb.get('proxies').find({ userId, id }).assign(updateData).write();

    return res.json({
      success: true,
      code: 'PROXY_UPDATED',
      message: '代理配置更新成功',
      data: { ...existingProxy, ...updateData },
    });
  } catch (error) {
    console.error('更新代理配置错误:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
};

/**
 * 删除代理配置
 * DELETE /api/proxies/:id
 */
const remove = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const existingProxy = proxiesDb.get('proxies').find({ userId, id }).value();
    if (!existingProxy) {
      return res.status(404).json({
        success: false,
        code: 'PROXY_NOT_FOUND',
        message: '代理配置不存在',
      });
    }

    proxiesDb.get('proxies').remove({ userId, id }).write();

    return res.json({
      success: true,
      code: 'PROXY_DELETED',
      message: '代理配置删除成功',
    });
  } catch (error) {
    console.error('删除代理配置错误:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
};

/**
 * TCP 连通性测试（单个目标）
 */
const tcpPing = (host, port, timeout = 5000) => {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(timeout);

    socket.once('connect', () => {
      const latency = Date.now() - start;
      socket.destroy();
      resolve({ success: true, latency });
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve({ success: false, error: '连接超时' });
    });

    socket.once('error', (err) => {
      socket.destroy();
      resolve({ success: false, error: err.message });
    });

    socket.connect(port, host);
  });
};

/**
 * 多场景连通性测试
 * POST /api/proxies/test-connectivity
 * Body: { host, port, type }
 */
const testConnectivity = async (req, res) => {
  try {
    const { host, port, type } = req.body;

    const targets = [
      { name: 'Google', host: 'google.com', port: 443 },
      { name: 'GitHub', host: 'github.com', port: 443 },
      { name: 'YouTube', host: 'youtube.com', port: 443 },
      { name: 'Baidu', host: 'baidu.com', port: 443 },
      { name: 'QQ邮箱 IMAP', host: 'imap.qq.com', port: 993 },
      { name: 'Gmail IMAP', host: 'imap.gmail.com', port: 993 },
    ];

    // 先测试代理本身是否可达
    let proxyOk = false;
    let proxyLatency = null;
    if (host && port) {
      const proxyResult = await tcpPing(host, parseInt(port), 5000);
      proxyOk = proxyResult.success;
      proxyLatency = proxyResult.latency;
    }

    // 测试各目标站点
    const results = await Promise.all(
      targets.map(async (t) => {
        const r = await tcpPing(t.host, t.port, 5000);
        return { name: t.name, host: t.host, port: t.port, ...r };
      })
    );

    return res.json({
      success: true,
      data: {
        proxy: { host, port, type, reachable: proxyOk, latency: proxyLatency },
        targets: results,
      },
    });
  } catch (error) {
    console.error('连通性测试错误:', error);
    return res.status(500).json({ success: false, message: '测试失败' });
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove,
  testConnectivity,
};
