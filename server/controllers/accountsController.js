/**
 * 邮箱账户控制器
 */
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../models/db');
const mailService = require('../services/mailService');

// IMAP 主机预设
const IMAP_PRESETS = {
  qq: { host: 'imap.qq.com', port: 993, ssl: true },
  gmail: { host: 'imap.gmail.com', port: 993, ssl: true },
  outlook: { host: 'imap-mail.outlook.com', port: 993, ssl: true },
  163: { host: 'imap.163.com', port: 993, ssl: true },
  custom: { host: '', port: 993, ssl: true },
};

/**
 * GET /api/accounts
 * 获取当前用户的所有邮箱账户
 */
async function getAccounts(req, res, next) {
  try {
    const db = getDB();
    const accounts = db.data.accounts.filter(a => a.userId === req.userId);
    res.json(accounts);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/accounts
 * 新增邮箱账户
 */
async function createAccount(req, res, next) {
  try {
    const { email, password, type, imapHost, imapPort, ssl } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: '邮箱地址和授权码/密码不能为空' });
    }

    const db = getDB();

    // 检查重复
    const existing = db.data.accounts.find(a => a.userId === req.userId && a.email === email);
    if (existing) {
      return res.status(409).json({ error: '该邮箱账户已存在' });
    }

    // 根据 type 自动填充 IMAP 配置
    const preset = IMAP_PRESETS[type] || IMAP_PRESETS.custom;

    const account = {
      id: uuidv4(),
      userId: req.userId,
      email,
      password,
      type: type || 'custom',
      status: 'connecting',
      imapHost: imapHost || preset.host,
      imapPort: imapPort || preset.port,
      ssl: ssl !== undefined ? ssl : preset.ssl,
      enabled: true,
      lastChecked: null,
      createdAt: new Date().toISOString(),
    };

    db.data.accounts.push(account);
    await db.write();

    // 启动这个账户的邮件监听
    mailService.restartAccount(account.id);

    // 返回时隐藏密码
    const { password: _, ...safeAccount } = account;
    res.status(201).json(safeAccount);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/accounts/:id
 * 更新邮箱账户
 */
async function updateAccount(req, res, next) {
  try {
    const db = getDB();
    const account = db.data.accounts.find(a => a.id === req.params.id && a.userId === req.userId);

    if (!account) {
      return res.status(404).json({ error: '邮箱账户不存在' });
    }

    const { email, password, type, imapHost, imapPort, ssl, enabled } = req.body;

    if (email !== undefined) account.email = email;
    if (password !== undefined) account.password = password;
    if (type !== undefined) account.type = type;
    if (imapHost !== undefined) account.imapHost = imapHost;
    if (imapPort !== undefined) account.imapPort = imapPort;
    if (ssl !== undefined) account.ssl = ssl;
    if (enabled !== undefined) account.enabled = enabled;

    await db.write();

    // 重启该账户的邮件监听
    if (account.enabled) {
      await mailService.restartAccount(account.id);
    }

    const { password: _, ...safeAccount } = account;
    res.json(safeAccount);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/accounts/:id
 * 删除邮箱账户
 */
async function deleteAccount(req, res, next) {
  try {
    const db = getDB();
    const index = db.data.accounts.findIndex(a => a.id === req.params.id && a.userId === req.userId);

    if (index === -1) {
      return res.status(404).json({ error: '邮箱账户不存在' });
    }

    db.data.accounts.splice(index, 1);
    await db.write();

    res.json({ message: '邮箱账户已删除' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/accounts/test
 * 测试邮箱连接
 */
async function testAccount(req, res, next) {
  try {
    const { email, password, type, imapHost, imapPort, ssl } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: '邮箱地址和授权码/密码不能为空' });
    }

    const preset = IMAP_PRESETS[type] || IMAP_PRESETS.custom;
    const accountData = {
      email,
      password,
      imapHost: imapHost || preset.host,
      imapPort: imapPort || preset.port,
      ssl: ssl !== undefined ? ssl : preset.ssl,
    };

    // 获取用户的代理配置
    const db = getDB();
    const proxyConfig = db.data.proxies.find(p => p.userId === req.userId);

    const result = await mailService.testConnection(accountData, proxyConfig);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  testAccount,
  IMAP_PRESETS,
};
