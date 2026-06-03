/**
 * 邮箱账户控制器
 */
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../models/db');
const mailService = require('../services/mailService');

// IMAP host presets
const IMAP_PRESETS = {
  qq: { host: 'imap.qq.com', port: 993, ssl: true },
  gmail: { host: 'imap.gmail.com', port: 993, ssl: true },
  outlook: { host: 'imap-mail.outlook.com', port: 993, ssl: true },
  '163': { host: 'imap.163.com', port: 993, ssl: true },
  custom: { host: '', port: 993, ssl: true },
};

function findVisibleProxy(db, proxyId, userId) {
  if (!proxyId) return null;
  const proxy = db.data.proxies.find(p => p.id === proxyId && p.userId === userId);
  if (proxy) return proxy;
  if (db.data.users.length <= 1) {
    return db.data.proxies.find(p => p.id === proxyId) || null;
  }
  return null;
}

async function getAccounts(req, res, next) {
  try {
    const db = getDB();
    const accounts = db.data.accounts
      .filter(a => a.userId === req.userId)
      .map(({ password, ...rest }) => rest);
    res.json({ success: true, data: accounts });
  } catch (err) { next(err); }
}

async function getAccountById(req, res, next) {
  try {
    const db = getDB();
    const account = db.data.accounts.find(a => a.id === req.params.id && a.userId === req.userId);
    if (!account) return res.status(404).json({ success: false, code: 'EMAIL_NOT_FOUND', message: '邮箱不存在' });
    const { password, ...safeAccount } = account;
    res.json({ success: true, data: safeAccount });
  } catch (err) { next(err); }
}

async function createAccount(req, res, next) {
  try {
    const { name, email, authCode, type, imapHost, imapPort, useSSL, useProxy, proxyId, active } = req.body;
    const password = req.body.password || authCode;
    if (!email || !password) return res.status(400).json({ success: false, code: 'MISSING_FIELDS', message: '邮箱地址和授权码/密码不能为空' });
    const db = getDB();
    // 全局去重：同一邮箱不允许重复添加（跨用户也检查）
    const existing = db.data.accounts.find(a => a.email === email);
    if (existing) {
      return res.status(409).json({ success: false, code: 'DUPLICATE', message: `邮箱 ${email} 已存在（账户: ${existing.name || existing.email}），请勿重复添加` });
    }
    const preset = IMAP_PRESETS[type] || IMAP_PRESETS.custom;
    const selectedProxy = useProxy && proxyId ? findVisibleProxy(db, proxyId, req.userId) : null;
    const account = {
      id: uuidv4(), userId: req.userId, name: name || email.split('@')[0], email, password,
      type: type || 'custom', status: 'connecting',
      imapHost: imapHost || preset.host, imapPort: imapPort || preset.port,
      useSSL: useSSL !== undefined ? useSSL : preset.ssl,
      useProxy: !!selectedProxy, proxyId: selectedProxy ? selectedProxy.id : null,
      active: active !== false, lastSync: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    db.data.accounts.push(account);
    await db.write('accounts');
    if (account.active) mailService.restartAccount(account.id);
    const { password: _, ...safeAccount } = account;
    res.status(201).json({ success: true, code: 'EMAIL_CREATED', message: '邮箱创建成功', data: safeAccount });
  } catch (err) { next(err); }
}

async function updateAccount(req, res, next) {
  try {
    const db = getDB();
    const account = db.data.accounts.find(a => a.id === req.params.id && a.userId === req.userId);
    if (!account) return res.status(404).json({ success: false, code: 'EMAIL_NOT_FOUND', message: '邮箱不存在' });
    const { name, email, authCode, type, imapHost, imapPort, useSSL, useProxy, proxyId, active } = req.body;
    const password = req.body.password || authCode;
    if (name !== undefined) account.name = name;
    if (email !== undefined) account.email = email;
    if (password) account.password = password;
    if (type !== undefined) account.type = type;
    if (imapHost !== undefined) account.imapHost = imapHost;
    if (imapPort !== undefined) account.imapPort = imapPort;
    if (useSSL !== undefined) account.useSSL = useSSL;
    if (useProxy !== undefined || proxyId !== undefined) {
      const selectedProxy = useProxy && proxyId ? findVisibleProxy(db, proxyId, req.userId) : null;
      account.useProxy = !!selectedProxy;
      account.proxyId = selectedProxy ? selectedProxy.id : null;
    }
    if (active !== undefined) account.active = active;
    account.updatedAt = new Date().toISOString();
    await db.write('accounts');
    if (account.active) {
      await mailService.restartAccount(account.id);
    } else {
      await mailService.stopAccount(account.id);
    }
    const { password: _, ...safeAccount } = account;
    res.json({ success: true, code: 'EMAIL_UPDATED', message: '邮箱更新成功', data: safeAccount });
  } catch (err) { next(err); }
}

async function deleteAccount(req, res, next) {
  try {
    const db = getDB();
    const index = db.data.accounts.findIndex(a => a.id === req.params.id && a.userId === req.userId);
    if (index === -1) return res.status(404).json({ success: false, code: 'EMAIL_NOT_FOUND', message: '邮箱不存在' });
    await mailService.stopAccount(db.data.accounts[index].id);
    db.data.accounts.splice(index, 1);
    await db.write('accounts');
    res.json({ success: true, code: 'EMAIL_DELETED', message: '邮箱删除成功' });
  } catch (err) { next(err); }
}

async function testAccount(req, res, next) {
  try {
    const { email, password, type, imapHost, imapPort, useSSL, useProxy, proxyHost, proxyPort, proxyType } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, code: 'MISSING_FIELDS', message: '邮箱地址和授权码/密码不能为空' });
    const preset = IMAP_PRESETS[type] || IMAP_PRESETS.custom;
    const accountData = {
      email, password,
      imapHost: imapHost || preset.host, imapPort: imapPort || preset.port,
      useSSL: useSSL !== undefined ? useSSL : preset.ssl,
    };
    let proxyConfig = null;
    if (useProxy) {
      if (proxyHost && proxyPort) {
        proxyConfig = { host: proxyHost, port: proxyPort, type: proxyType || 'socks5' };
      } else {
        const db = getDB();
        const proxyId = req.body.proxyId;
        if (proxyId) {
          proxyConfig = findVisibleProxy(db, proxyId, req.userId);
        } else {
          proxyConfig = db.data.proxies.find(p => p.userId === req.userId);
        }
      }
    }
    const result = await mailService.testConnection(accountData, proxyConfig);
    res.json(result);
  } catch (err) { next(err); }
}

async function testExistingAccount(req, res, next) {
  try {
    const db = getDB();
    const account = db.data.accounts.find(a => a.id === req.params.id && a.userId === req.userId);
    if (!account) return res.status(404).json({ success: false, code: 'EMAIL_NOT_FOUND', message: '邮箱不存在' });
    let proxyConfig = null;
    if (account.useProxy && account.proxyId) {
      proxyConfig = findVisibleProxy(db, account.proxyId, req.userId);
    }
    const accountData = {
      email: account.email, password: account.password,
      imapHost: account.imapHost, imapPort: account.imapPort, useSSL: account.useSSL,
    };
    const result = await mailService.testConnection(accountData, proxyConfig);
    res.json(result);
  } catch (err) { next(err); }
}

async function fetchRecentEmails(req, res, next) {
  try {
    const db = getDB();
    const account = db.data.accounts.find(a => a.id === req.params.id && a.userId === req.userId);
    if (!account) return res.status(404).json({ success: false, code: 'EMAIL_NOT_FOUND', message: '邮箱不存在' });
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const result = await mailService.fetchRecent(account, page, pageSize);
    res.json({
      success: true, code: 'EMAILS_FETCHED',
      message: '成功拉取 ' + result.emails.length + ' 封邮件',
      data: result.emails, pagination: result.pagination,
    });
  } catch (err) { next(err); }
}

async function fetchEmailBody(req, res, next) {
  try {
    const db = getDB();
    const account = db.data.accounts.find(a => a.id === req.params.id && a.userId === req.userId);
    if (!account) return res.status(404).json({ success: false, code: 'EMAIL_NOT_FOUND', message: '邮箱不存在' });
    const uid = parseInt(req.params.uid);
    const body = await mailService.fetchBody(account, uid);
    res.json({ success: true, data: body });
  } catch (err) { next(err); }
}

function streamNewEmails(req, res, next) {
  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const heartbeat = setInterval(() => { res.write(': heartbeat\n\n'); }, 30000);
    const onNewEmail = (emailData) => {
      if (emailData.userId === req.userId) {
        res.write('event: new_email\ndata: ' + JSON.stringify(emailData) + '\n\n');
      }
    };
    mailService.emailEmitter.on('new_email', onNewEmail);
    req.on('close', () => {
      mailService.emailEmitter.removeListener('new_email', onNewEmail);
      clearInterval(heartbeat);
    });
  } catch (err) { next(err); }
}

async function liveStreamEmails(req, res, next) {
  try {
    const db = getDB();
    const accountId = req.query.accountId;
    if (!accountId) return res.status(400).json({ success: false, code: 'MISSING_ACCOUNT_ID', message: '缺少 accountId 参数' });
    const account = db.data.accounts.find(a => a.id === accountId && a.userId === req.userId);
    if (!account) return res.status(404).json({ success: false, code: 'EMAIL_NOT_FOUND', message: '邮箱不存在' });
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const initialData = await mailService.fetchRecent(account, page, pageSize);
    res.write('event: init\ndata: ' + JSON.stringify(initialData) + '\n\n');
    const heartbeat = setInterval(() => { res.write(': heartbeat\n\n'); }, 30000);
    const onNewEmail = (emailData) => {
      if (emailData.userId === req.userId && emailData.accountId === accountId) {
        res.write('event: new_email\ndata: ' + JSON.stringify(emailData) + '\n\n');
      }
    };
    mailService.emailEmitter.on('new_email', onNewEmail);
    req.on('close', () => {
      mailService.emailEmitter.removeListener('new_email', onNewEmail);
      clearInterval(heartbeat);
    });
  } catch (err) { next(err); }
}

async function reconnectAccount(req, res, next) {
  try {
    const db = getDB();
    const account = db.data.accounts.find(a => a.id === req.params.id && a.userId === req.userId);
    if (!account) return res.status(404).json({ success: false, code: 'EMAIL_NOT_FOUND', message: '邮箱不存在' });
    await mailService.restartAccount(account.id);
    res.json({ success: true, code: 'RECONNECTING', message: '正在重新连接 ' + account.email });
  } catch (err) { next(err); }
}

async function syncAccount(req, res, next) {
  try {
    const db = getDB();
    const account = db.data.accounts.find(a => a.id === req.params.id && a.userId === req.userId);
    if (!account) return res.status(404).json({ success: false, code: 'EMAIL_NOT_FOUND', message: '邮箱不存在' });
    const result = await mailService.forceSyncAccount(account);
    res.json({
      success: true, code: 'SYNC_COMPLETE',
      message: '同步完成，共 ' + result.total + ' 封邮件，新增 ' + result.newCount + ' 封',
      data: result,
    });
  } catch (err) { next(err); }
}

module.exports = {
  getAccounts, getAccountById, createAccount, updateAccount, deleteAccount,
  testAccount, testExistingAccount, fetchRecentEmails, fetchEmailBody,
  streamNewEmails, liveStreamEmails, reconnectAccount, syncAccount, IMAP_PRESETS,
};
