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
 * GET /api/emails
 * 获取当前用户的所有邮箱账户
 */
async function getAccounts(req, res, next) {
  try {
    const db = getDB();
    const accounts = db.data.accounts
      .filter(a => a.userId === req.userId)
      .map(({ password, ...rest }) => rest);
    res.json({ success: true, data: accounts });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/emails/:id
 * 获取单个邮箱详情
 */
async function getAccountById(req, res, next) {
  try {
    const db = getDB();
    const account = db.data.accounts.find(a => a.id === req.params.id && a.userId === req.userId);
    if (!account) {
      return res.status(404).json({ success: false, code: 'EMAIL_NOT_FOUND', message: '邮箱不存在' });
    }
    const { password, ...safeAccount } = account;
    res.json({ success: true, data: safeAccount });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/emails
 * 新增邮箱账户
 */
async function createAccount(req, res, next) {
  try {
    const { name, email, password, type, imapHost, imapPort, useSSL, useProxy, proxyId, active } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, code: 'MISSING_FIELDS', message: '邮箱地址和授权码/密码不能为空' });
    }

    const db = getDB();

    // 检查重复
    const existing = db.data.accounts.find(a => a.userId === req.userId && a.email === email);
    if (existing) {
      return res.status(409).json({ success: false, code: 'DUPLICATE', message: '该邮箱账户已存在' });
    }

    // 根据 type 自动填充 IMAP 配置
    const preset = IMAP_PRESETS[type] || IMAP_PRESETS.custom;

    const account = {
      id: uuidv4(),
      userId: req.userId,
      name: name || email.split('@')[0],
      email,
      password,
      type: type || 'custom',
      status: 'connecting',
      imapHost: imapHost || preset.host,
      imapPort: imapPort || preset.port,
      useSSL: useSSL !== undefined ? useSSL : preset.ssl,
      useProxy: useProxy || false,
      proxyId: proxyId || null,
      active: active !== false,
      lastSync: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.data.accounts.push(account);
    await db.write();

    // 启动这个账户的邮件监听
    if (account.active) {
      mailService.restartAccount(account.id);
    }

    // 返回时隐藏密码
    const { password: _, ...safeAccount } = account;
    res.status(201).json({ success: true, code: 'EMAIL_CREATED', message: '邮箱创建成功', data: safeAccount });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/emails/:id
 * 更新邮箱账户
 */
async function updateAccount(req, res, next) {
  try {
    const db = getDB();
    const account = db.data.accounts.find(a => a.id === req.params.id && a.userId === req.userId);

    if (!account) {
      return res.status(404).json({ success: false, code: 'EMAIL_NOT_FOUND', message: '邮箱不存在' });
    }

    const { name, email, password, type, imapHost, imapPort, useSSL, useProxy, proxyId, active } = req.body;

    if (name !== undefined) account.name = name;
    if (email !== undefined) account.email = email;
    if (password !== undefined) account.password = password;
    if (type !== undefined) account.type = type;
    if (imapHost !== undefined) account.imapHost = imapHost;
    if (imapPort !== undefined) account.imapPort = imapPort;
    if (useSSL !== undefined) account.useSSL = useSSL;
    if (useProxy !== undefined) account.useProxy = useProxy;
    if (proxyId !== undefined) account.proxyId = proxyId;
    if (active !== undefined) account.active = active;
    account.updatedAt = new Date().toISOString();

    await db.write();

    // 重启该账户的邮件监听
    if (account.active) {
      await mailService.restartAccount(account.id);
    }

    const { password: _, ...safeAccount } = account;
    res.json({ success: true, code: 'EMAIL_UPDATED', message: '邮箱更新成功', data: safeAccount });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/emails/:id
 * 删除邮箱账户
 */
async function deleteAccount(req, res, next) {
  try {
    const db = getDB();
    const index = db.data.accounts.findIndex(a => a.id === req.params.id && a.userId === req.userId);

    if (index === -1) {
      return res.status(404).json({ success: false, code: 'EMAIL_NOT_FOUND', message: '邮箱不存在' });
    }

    db.data.accounts.splice(index, 1);
    await db.write();

    res.json({ success: true, code: 'EMAIL_DELETED', message: '邮箱删除成功' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/emails/test-connection
 * 测试邮箱连接（新建时）
 */
async function testAccount(req, res, next) {
  try {
    const { email, password, type, imapHost, imapPort, useSSL, useProxy, proxyHost, proxyPort, proxyType } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, code: 'MISSING_FIELDS', message: '邮箱地址和授权码/密码不能为空' });
    }

    const preset = IMAP_PRESETS[type] || IMAP_PRESETS.custom;
    const accountData = {
      email,
      password,
      imapHost: imapHost || preset.host,
      imapPort: imapPort || preset.port,
      useSSL: useSSL !== undefined ? useSSL : preset.ssl,
    };

    // 获取代理配置
    let proxyConfig = null;
    if (useProxy && proxyHost && proxyPort) {
      proxyConfig = { host: proxyHost, port: proxyPort, type: proxyType || 'socks5' };
    } else {
      const db = getDB();
      proxyConfig = db.data.proxies.find(p => p.userId === req.userId);
    }

    const result = await mailService.testConnection(accountData, proxyConfig);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/emails/:id/test
 * 测试已有邮箱连接
 */
async function testExistingAccount(req, res, next) {
  try {
    const db = getDB();
    const account = db.data.accounts.find(a => a.id === req.params.id && a.userId === req.userId);

    if (!account) {
      return res.status(404).json({ success: false, code: 'EMAIL_NOT_FOUND', message: '邮箱不存在' });
    }

    // 获取代理配置
    let proxyConfig = null;
    if (account.useProxy && account.proxyId) {
      proxyConfig = db.data.proxies.find(p => p.id === account.proxyId && p.userId === req.userId);
    }

    const accountData = {
      email: account.email,
      password: account.password,
      imapHost: account.imapHost,
      imapPort: account.imapPort,
      useSSL: account.useSSL,
    };

    const result = await mailService.testConnection(accountData, proxyConfig);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/emails/:id/messages
 * 拉取最近邮件（分页）
 */
async function fetchRecentEmails(req, res, next) {
  try {
    const db = getDB();
    const account = db.data.accounts.find(a => a.id === req.params.id && a.userId === req.userId);

    if (!account) {
      return res.status(404).json({ success: false, code: 'EMAIL_NOT_FOUND', message: '邮箱不存在' });
    }

    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;

    const result = await mailService.fetchRecent(account, page, pageSize);
    res.json({
      success: true,
      code: 'EMAILS_FETCHED',
      message: `成功拉取 ${result.emails.length} 封邮件`,
      data: result.emails,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/emails/:id/messages/:uid/body
 * 获取单封邮件正文
 */
async function fetchEmailBody(req, res, next) {
  try {
    const db = getDB();
    const account = db.data.accounts.find(a => a.id === req.params.id && a.userId === req.userId);

    if (!account) {
      return res.status(404).json({ success: false, code: 'EMAIL_NOT_FOUND', message: '邮箱不存在' });
    }

    const uid = parseInt(req.params.uid);
    const body = await mailService.fetchBody(account, uid);
    res.json({ success: true, data: body });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/emails/stream
 * Server-Sent Events 实时新邮件推送
 */
function streamNewEmails(req, res, next) {
  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // 心跳，防止连接被代理/负载均衡器断开
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30000);

    // 监听新邮件事件，只推送给当前用户的邮件
    const onNewEmail = (emailData) => {
      if (emailData.userId === req.userId) {
        res.write(`event: new_email\ndata: ${JSON.stringify(emailData)}\n\n`);
      }
    };

    mailService.emailEmitter.on('new_email', onNewEmail);

    req.on('close', () => {
      mailService.emailEmitter.removeListener('new_email', onNewEmail);
      clearInterval(heartbeat);
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
  testAccount,
  testExistingAccount,
  fetchRecentEmails,
  fetchEmailBody,
  streamNewEmails,
  IMAP_PRESETS,
};
