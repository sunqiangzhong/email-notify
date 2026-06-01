/**
 * Mail Service - Core Engine (IMAP IDLE mode)
 * 使用 imapflow 替代 imap-simple，提供更稳定的 IDLE 连接
 */
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { EventEmitter } = require('events');
const { getDB } = require('../models/db');
const { createProxyAgent } = require('./proxyService');
const { processNotification } = require('./notificationService');
const config = require('../config');

// 日期解析失败时的 fallback
const OLD_DATE_FALLBACK = '2000-01-01T00:00:00.000Z';

const connectionPool = new Map();
const emailEmitter = new EventEmitter();
emailEmitter.setMaxListeners(50);
let backgroundSyncTimer = null;

// 构建 ImapFlow 配置
function buildImapConfig(account, proxyConfig) {
  const imapConfig = {
    host: account.imapHost,
    port: account.imapPort || 993,
    secure: account.useSSL !== false,
    auth: {
      user: account.email,
      pass: account.password,
    },
    tls: {
      rejectUnauthorized: false,
      minVersion: 'TLSv1',
    },
    connectionTimeout: config.imapConnectTimeout || 30000,
    greetingTimeout: config.imapConnectTimeout || 30000,
    socketTimeout: config.imapConnectTimeout || 30000,
    logger: false,
    emitLogs: false,
  };

  // 添加代理支持（imapflow 原生支持 SOCKS/HTTP 代理）
  if (proxyConfig) {
    const { type, host, port, username, password } = proxyConfig;
    const normalizedType = (type || '').toLowerCase();
    let proxyUrl = '';

    if (normalizedType === 'socks5' || normalizedType === 'socks4') {
      const auth = username ? `${encodeURIComponent(username)}:${encodeURIComponent(password || '')}@` : '';
      proxyUrl = `${normalizedType}://${auth}${host}:${port}`;
    } else if (normalizedType === 'http' || normalizedType === 'https') {
      const auth = username ? `${encodeURIComponent(username)}:${encodeURIComponent(password || '')}@` : '';
      proxyUrl = `http://${auth}${host}:${port}`;
    }

    if (proxyUrl) {
      imapConfig.proxy = proxyUrl;
    }
  }

  return imapConfig;
}

function getProxyForAccount(account) {
  const db = getDB();
  if (account.useProxy && account.proxyId) {
    const proxy = db.data.proxies.find(p => p.id === account.proxyId);
    if (proxy) {
      console.log('[MAIL] Using explicit proxy for ' + account.email + ': ' + proxy.name + ' (' + proxy.type + '://' + proxy.host + ':' + proxy.port + ')');
    }
    return proxy || null;
  }
  return null;
}

function extractFirstAddress(field) {
  const result = { name: '', address: '' };
  try {
    if (!field) return result;
    if (field.name && field.address) {
      result.name = field.name; result.address = field.address; return result;
    }
    if (typeof field === 'string') {
      const parsed = parseAddressString(field);
      if (parsed) return parsed;
      return result;
    }
    const arr = Array.isArray(field) ? field : [field];
    for (const item of arr) {
      if (!item) continue;
      if (typeof item === 'object' && item.address) {
        result.name = item.name || ''; result.address = item.address; return result;
      }
      if (typeof item === 'string') {
        const parsed = parseAddressString(item);
        if (parsed) return parsed;
      }
      if (Array.isArray(item)) {
        for (const sub of item) {
          if (!sub) continue;
          if (typeof sub === 'object' && sub.address) {
            result.name = sub.name || ''; result.address = sub.address; return result;
          }
          if (typeof sub === 'string') {
            const parsed = parseAddressString(sub);
            if (parsed) return parsed;
          }
        }
      }
    }
  } catch (_) {}
  return result;
}

function parseAddressString(str) {
  if (!str || typeof str !== 'string') return null;
  str = str.trim();
  const match = str.match(/^"?([^"<]*)"?\s*<([^>]+)>/);
  if (match) return { name: match[1].trim(), address: match[2].trim() };
  if (str.includes('@') && !str.includes(' ')) return { name: '', address: str };
  return null;
}

function parseEmailDate(dateStr, fallback) {
  if (!dateStr || typeof dateStr !== 'string') return fallback || OLD_DATE_FALLBACK;
  const now = Date.now();
  const minTs = new Date('1990-01-01').getTime();
  const maxTs = now + 86400000;
  const validate = (ts) => !isNaN(ts) && ts >= minTs && ts <= maxTs;
  const normalized = dateStr.replace(/\s*\([^)]+\)\s*$/, '').trim();
  const d1 = new Date(normalized);
  if (validate(d1.getTime())) return d1.toISOString();
  const d2 = new Date(dateStr);
  if (validate(d2.getTime())) return d2.toISOString();
  return fallback || OLD_DATE_FALLBACK;
}

function extractSingleValue(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (Array.isArray(field)) return typeof field[0] === 'string' ? field[0] : '';
  return String(field);
}

// 从 imapflow 的 envelope 解析邮件信息
function parseEnvelope(envelope) {
  if (!envelope) return { fromName: '', fromAddress: '', subject: '(no subject)', date: new Date().toISOString() };

  let fromName = '', fromAddress = '';
  if (envelope.from && envelope.from.length > 0) {
    fromName = envelope.from[0].name || '';
    fromAddress = envelope.from[0].address || '';
  }

  let subject = envelope.subject || '(no subject)';
  let date = envelope.date ? new Date(envelope.date).toISOString() : new Date().toISOString();

  return { fromName, fromAddress, subject, date };
}

async function parseAndCacheEmails(messages, account) {
  const db = getDB();
  const { v4: uuidv4 } = require('uuid');
  const now = new Date().toISOString();
  const newEmailIds = []; // 记录新插入邮件的 id 和 uid

  for (const msg of messages) {
    const uid = msg.uid;
    const exists = db.data.accountEmails.some(e => e.accountId === account.id && e.uid === uid);
    if (exists) continue;

    try {
      let fromName = '', fromAddress = '', subject = '(no subject)', date = now;

      // 优先使用 envelope（更快）
      if (msg.envelope) {
        const parsed = parseEnvelope(msg.envelope);
        fromName = parsed.fromName;
        fromAddress = parsed.fromAddress;
        subject = parsed.subject;
        date = parsed.date;
      }
      // 如果有 source，用 mailparser 解析
      else if (msg.source) {
        const parsed = await simpleParser(msg.source);
        const from = extractFirstAddress(parsed.from?.value);
        fromName = from.name;
        fromAddress = from.address;
        subject = parsed.subject || '(no subject)';
        date = parsed.date instanceof Date && !isNaN(parsed.date.getTime())
          ? parsed.date.toISOString()
          : parseEmailDate(extractSingleValue(parsed.headers?.get('date')), OLD_DATE_FALLBACK);
      }

      const emailId = uuidv4();
      db.data.accountEmails.push({
        id: emailId, accountId: account.id, userId: account.userId, uid,
        fromName, fromAddress, to: account.email, subject, date,
        hasAttachments: false, attachmentsCount: 0, fetchedAt: now,
      });
      newEmailIds.push({ uid, emailId });
    } catch (parseErr) {
      console.error('[MAIL] parseAndCacheEmails error:', parseErr.message);
    }
  }

  await db.write('accountEmails');
  return newEmailIds;
}

async function processNewMessage(msg, account, processedUIDs, emailIdMap) {
  const db = getDB();
  const uid = msg.uid;
  processedUIDs.add(uid);

  let emailData;
  try {
    // 使用 envelope 获取基本信息
    if (msg.envelope) {
      const parsed = parseEnvelope(msg.envelope);
      emailData = {
        uid,
        subject: parsed.subject,
        senderName: parsed.fromName || parsed.fromAddress || 'unknown',
        senderEmail: parsed.fromAddress || 'unknown',
        toEmail: account.email,
        snippet: '',
        receivedAt: parsed.date,
      };
    }
    // 使用 source 解析完整信息
    else if (msg.source) {
      const parsed = await simpleParser(msg.source);
      const from = extractFirstAddress(parsed.from?.value);
      const emailDate = parsed.date instanceof Date && !isNaN(parsed.date.getTime())
        ? parsed.date.toISOString()
        : parseEmailDate(parsed.headers?.get('date')?.toString(), new Date().toISOString());

      emailData = {
        uid,
        subject: parsed.subject || '(no subject)',
        senderName: from.name || from.address || 'unknown',
        senderEmail: from.address || 'unknown',
        toEmail: account.email,
        snippet: (parsed.text || '').substring(0, 200).trim(),
        receivedAt: emailDate,
      };
    } else {
      return;
    }
  } catch (err) {
    console.error('[MAIL] processNewMessage parse error:', err.message);
    return;
  }

  console.log('[MAIL] New email from ' + emailData.senderEmail + ': ' + emailData.subject);

  const { v4: uuidv4 } = require('uuid');
  const logEntry = {
    id: uuidv4(), userId: account.userId, accountId: account.id,
    subject: emailData.subject, senderName: emailData.senderName,
    senderEmail: emailData.senderEmail, toEmail: emailData.toEmail,
    receivedAt: emailData.receivedAt, forwardStatus: 'sending', snippet: emailData.snippet,
  };
  db.data.emailLogs.push(logEntry);
  await db.write('emailLogs');

  processNotification(account.userId, emailData, logEntry.id);

  // 从 emailIdMap 中获取正确的 emailId
  const emailIdEntry = emailIdMap ? emailIdMap.find(e => e.uid === uid) : null;
  const emailId = emailIdEntry?.emailId || null;

  emailEmitter.emit('new_email', {
    userId: account.userId, accountId: account.id, accountEmail: account.email,
    uid, logId: logEntry.id, emailId,
    subject: emailData.subject, senderName: emailData.senderName,
    senderEmail: emailData.senderEmail, toEmail: emailData.toEmail,
    receivedAt: emailData.receivedAt, snippet: emailData.snippet,
  });
}

function cleanupPoolEntry(accountId, keepEntry = false) {
  const pool = connectionPool.get(accountId);
  if (!pool) return;
  if (pool.safetyTimer) clearInterval(pool.safetyTimer);
  if (pool.reconnectTimer) clearTimeout(pool.reconnectTimer);
  if (pool.client) {
    try {
      pool.client.close();
    } catch (_) {}
  }
  if (!keepEntry) {
    connectionPool.delete(accountId);
  } else {
    pool.client = null;
    pool.safetyTimer = null;
  }
}

function scheduleReconnect(accountId, delay) {
  let pool = connectionPool.get(accountId);
  if (!pool) {
    const db = getDB();
    const account = db.data.accounts.find(a => a.id === accountId);
    if (!account) return;
    pool = {
      client: null, safetyTimer: null, reconnectTimer: null, status: 'reconnecting',
      account, processedUIDs: new Set(),
    };
    connectionPool.set(accountId, pool);
  }
  const jitter = Math.floor(Math.random() * 5000);
  const totalDelay = delay + jitter;
  console.log('[MAIL] Reconnecting ' + pool.account.email + ' in ' + Math.round(totalDelay / 1000) + 's...');
  pool.status = 'reconnecting';
  pool.reconnectTimer = setTimeout(async () => {
    cleanupPoolEntry(accountId);
    const db = getDB();
    const account = db.data.accounts.find(a => a.id === accountId);
    if (account && account.active !== false) {
      await connectAndIdle(account);
    }
  }, totalDelay);
}

async function connectAndIdle(account) {
  const db = getDB();
  const proxyConfig = getProxyForAccount(account);
  const processedUIDs = new Set();

  try {
    console.log('[MAIL-IDLE] Connecting to ' + account.email + ' (' + account.imapHost + ')...');

    const imapConfig = buildImapConfig(account, proxyConfig);
    const client = new ImapFlow(imapConfig);

    // 连接
    await client.connect();
    console.log('[MAIL-IDLE] Connected to ' + account.email);

    // 更新状态
    const dbAccount = db.data.accounts.find(a => a.id === account.id);
    if (dbAccount) {
      dbAccount.status = 'online';
      dbAccount.lastSync = new Date().toISOString();
      await db.write('accounts');
    }

    // 打开 INBOX
    const mailbox = await client.mailboxOpen('INBOX');
    console.log('[MAIL-IDLE] Opened INBOX for ' + account.email + ', messages: ' + mailbox.exists);

    // 初始扫描：安全获取最近的 100 封邮件的 envelope，防止大型邮箱卡死，并兼容空邮箱
    console.log('[MAIL-IDLE] ' + account.email + ': Starting initial scan...');
    const initialMessages = [];
    if (mailbox.exists > 0) {
      const startSeq = Math.max(1, mailbox.exists - 99);
      const fetchRange = `${startSeq}:*`;
      for await (const message of client.fetch(fetchRange, { uid: true, envelope: true })) {
        initialMessages.push(message);
        processedUIDs.add(message.uid);
      }
    }

    if (initialMessages.length > 0) {
      console.log('[MAIL-IDLE] ' + account.email + ': Initial scan, ' + initialMessages.length + ' emails');
      // 清理旧的缓存
      const staleCount = db.data.accountEmails.filter(e => e.accountId === account.id && !e.fromAddress).length;
      if (staleCount > 0) {
        db.data.accountEmails = db.data.accountEmails.filter(e => !(e.accountId === account.id && !e.fromAddress));
      }
      await parseAndCacheEmails(initialMessages, account);
    }

    // 监听新邮件事件（imapflow 的 'exists' 事件）
    client.on('exists', async (data) => {
      console.log('[MAIL-IDLE] ' + account.email + ': New message(s) detected, total: ' + data.count);
      try {
        // 获取新邮件：仅拉取最近的 20 封邮件做差异比对，极速响应，防止大型邮箱超时
        const newMessages = [];
        if (data.count > 0) {
          const fetchRange = `${Math.max(1, data.count - 19)}:*`;
          for await (const message of client.fetch(fetchRange, { uid: true, envelope: true })) {
            if (!processedUIDs.has(message.uid)) {
              newMessages.push(message);
            }
          }
        }

        if (newMessages.length > 0) {
          console.log('[MAIL-IDLE] ' + account.email + ': Found ' + newMessages.length + ' new message(s)');
          // 先更新缓存，再发通知
          const emailIdMap = await parseAndCacheEmails(newMessages, account);
          for (const msg of newMessages) {
            await processNewMessage(msg, account, processedUIDs, emailIdMap);
          }
        }

        const dbAcc = db.data.accounts.find(a => a.id === account.id);
        if (dbAcc) {
          dbAcc.lastSync = new Date().toISOString();
          await db.write('accounts');
        }
      } catch (err) {
        console.error('[MAIL-IDLE] Error processing new mail for ' + account.email + ':', err.message);
      }
    });

    // 监听连接关闭
    client.on('close', () => {
      console.log('[MAIL-IDLE] Connection closed for ' + account.email);
      cleanupPoolEntry(account.id, true);
      const dbAcc = db.data.accounts.find(a => a.id === account.id);
      if (dbAcc) {
        dbAcc.status = 'reconnecting';
        db.write('accounts').catch(() => {});
      }
      scheduleReconnect(account.id, config.reconnectBaseDelay || 30000);
    });

    // 监听错误（触发重连）
    client.on('error', (err) => {
      console.error('[MAIL-IDLE] Connection error for ' + account.email + ':', err.message);
      // 错误时触发重连
      cleanupPoolEntry(account.id, true);
      const dbAcc = db.data.accounts.find(a => a.id === account.id);
      if (dbAcc) {
        dbAcc.status = 'reconnecting';
        dbAcc.lastError = err.message;
        db.write('accounts').catch(() => {});
      }
      scheduleReconnect(account.id, config.reconnectBaseDelay || 30000);
    });

    // 保存到连接池
    connectionPool.set(account.id, {
      client, safetyTimer: null, reconnectTimer: null, status: 'idle',
      account, processedUIDs, lastActivity: Date.now(),
    });

    // 启动 IDLE（imapflow 自动管理）
    console.log('[MAIL-IDLE] ' + account.email + ': IDLE active');

    // 心跳检测 + Safety poll
    const safetyInterval = config.safetyPollInterval || 120000; // 默认 2 分钟
    const safetyTimer = setInterval(async () => {
      try {
        const pool = connectionPool.get(account.id);
        if (!pool || pool.status !== 'idle') return;

        // 检查连接是否还活着
        if (!client.usable) {
          console.log('[MAIL-IDLE] Connection not usable for ' + account.email + ', reconnecting...');
          cleanupPoolEntry(account.id, true);
          scheduleReconnect(account.id, 5000); // 5秒后重连
          return;
        }

        // 更新活跃时间
        pool.lastActivity = Date.now();

        // 仅拉取最近的 20 封邮件做安全轮询差异比对，防止大型邮箱超时
        const newMessages = [];
        const currentCount = client.mailbox ? client.mailbox.exists : 0;
        if (currentCount > 0) {
          const fetchRange = `${Math.max(1, currentCount - 19)}:*`;
          for await (const message of client.fetch(fetchRange, { uid: true, envelope: true })) {
            if (!processedUIDs.has(message.uid)) {
              newMessages.push(message);
            }
          }
        }

        if (newMessages.length > 0) {
          console.log('[MAIL-IDLE] Safety poll found ' + newMessages.length + ' new message(s) for ' + account.email);
          const emailIdMap = await parseAndCacheEmails(newMessages, account);
          for (const msg of newMessages) {
            await processNewMessage(msg, account, processedUIDs, emailIdMap);
          }
        }

        const dbAcc = db.data.accounts.find(a => a.id === account.id);
        if (dbAcc) {
          dbAcc.lastSync = new Date().toISOString();
          await db.write('accounts');
        }
      } catch (pollErr) {
        console.error('[MAIL-IDLE] Safety poll error for ' + account.email + ':', pollErr.message);
        // 轮询出错时触发重连
        cleanupPoolEntry(account.id, true);
        scheduleReconnect(account.id, config.reconnectBaseDelay || 30000);
      }
    }, safetyInterval);

    // 更新 safetyTimer
    const pool = connectionPool.get(account.id);
    if (pool) pool.safetyTimer = safetyTimer;

  } catch (err) {
    const errMsg = err.message || String(err);
    const isAuth = errMsg.includes('Invalid credentials') || errMsg.includes('AUTHENTICATE') || errMsg.includes('auth') || errMsg.includes('LOGIN');
    const isTimeout = errMsg.includes('timeout') || errMsg.includes('ETIMEDOUT') || errMsg.includes('ECONNREFUSED');
    const isTls = errMsg.includes('SSL') || errMsg.includes('TLS') || errMsg.includes('certificate');

    let hint = '';
    if (isAuth) hint = ' → 请检查授权码/密码是否正确';
    else if (isTimeout) hint = ' → 连接超时，请检查网络或配置代理';
    else if (isTls) hint = ' → TLS/SSL 错误，请检查 SSL 设置';

    console.error('[MAIL-IDLE] Failed to connect to ' + account.email + ': ' + errMsg + hint);

    const dbAccount = db.data.accounts.find(a => a.id === account.id);
    if (dbAccount) {
      dbAccount.status = 'error';
      dbAccount.lastError = errMsg;
      await db.write('accounts');
    }

    scheduleReconnect(account.id, config.reconnectBaseDelay || 30000);
  }
}

async function startAll() {
  const db = getDB();
  const activeAccounts = db.data.accounts.filter(a => a.active !== false);
  console.log('[MAIL-IDLE] Starting ' + activeAccounts.length + ' email IDLE connections...');
  for (const account of activeAccounts) {
    await connectAndIdle(account);
  }

  // Background sync
  const syncInterval = typeof config.backgroundSyncInterval === 'number' ? config.backgroundSyncInterval : 120000;
  if (syncInterval > 0) {
    backgroundSyncTimer = setInterval(async () => {
      const db2 = getDB();
      const accounts = db2.data.accounts.filter(a => a.active !== false);
      for (const account of accounts) {
        try {
          await forceSyncAccount(account);
        } catch (_) {}
      }
    }, syncInterval);
    console.log('[MAIL-SYNC] Background sync enabled, interval=' + Math.round(syncInterval / 1000) + 's');
  }
}

async function stopAll() {
  if (backgroundSyncTimer) {
    clearInterval(backgroundSyncTimer);
    backgroundSyncTimer = null;
  }
  console.log('[MAIL-IDLE] Stopping all connections (' + connectionPool.size + ' active)...');
  for (const [accountId, pool] of connectionPool) {
    try {
      if (pool.safetyTimer) clearInterval(pool.safetyTimer);
      if (pool.reconnectTimer) clearTimeout(pool.reconnectTimer);
      if (pool.client) await pool.client.close();
      console.log('[MAIL-IDLE] Stopped connection for ' + pool.account.email);
    } catch (err) {
      console.error('[MAIL-IDLE] Error stopping connection ' + accountId + ':', err.message);
    }
  }
  connectionPool.clear();
}

async function testConnection(accountData, proxyConfig) {
  const startTime = Date.now();
  const tlsStatus = accountData.useSSL !== false;

  try {
    const imapConfig = buildImapConfig(accountData, proxyConfig);
    const client = new ImapFlow(imapConfig);

    await client.connect();
    const connectTime = Date.now() - startTime;

    const mailbox = await client.mailboxOpen('INBOX');
    const openTime = Date.now() - startTime - connectTime;

    const inboxTotal = mailbox.exists || 0;

    await client.close();

    const host = (accountData.imapHost || '').toLowerCase();
    let provider = 'custom';
    if (host.includes('qq')) provider = 'qq';
    else if (host.includes('gmail')) provider = 'gmail';
    else if (host.includes('outlook') || host.includes('hotmail')) provider = 'outlook';
    else if (host.includes('163')) provider = '163';

    return {
      success: true, message: '邮箱连接测试成功',
      data: {
        responseTime: connectTime, openTime, serverHost: accountData.imapHost,
        serverPort: accountData.imapPort || 993, serverGreeting: accountData.imapHost,
        tlsStatus, accountEmail: accountData.email, provider,
        inbox: { total: inboxTotal, unseen: 0 },
      },
    };
  } catch (err) {
    const elapsed = Date.now() - startTime;
    return {
      success: false, error: err.message || '连接失败', message: err.message || '连接失败',
      data: {
        responseTime: elapsed, serverHost: accountData.imapHost,
        serverPort: accountData.imapPort || 993, serverGreeting: '',
        tlsStatus, accountEmail: accountData.email, provider: 'custom',
        inbox: { total: 0, unseen: 0 },
      },
    };
  }
}

async function restartAccount(accountId) {
  cleanupPoolEntry(accountId);
  const db = getDB();
  const account = db.data.accounts.find(a => a.id === accountId);
  if (account && account.active !== false) await connectAndIdle(account);
}

async function fetchRecent(account, page, pageSize) {
  page = page || 1;
  pageSize = pageSize || 10;
  const db = getDB();

  const allEmails = db.data.accountEmails
    .filter(e => e.accountId === account.id)
    .sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db2 = new Date(b.date).getTime();
      const va = isNaN(da) ? -Infinity : da;
      const vb = isNaN(db2) ? -Infinity : db2;
      if (vb !== va) return vb - va;
      return (b.uid || 0) - (a.uid || 0);
    });

  const total = allEmails.length;
  const totalPages = Math.ceil(total / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, total);
  const pageEmails = allEmails.slice(startIndex, endIndex);

  const emails = pageEmails.map(e => ({
    uid: e.uid, id: e.id, fromName: e.fromName || '', fromAddress: e.fromAddress || '',
    to: e.to || account.email, subject: e.subject || '(no subject)', snippet: '',
    date: e.date, hasAttachments: e.hasAttachments || false, attachmentsCount: e.attachmentsCount || 0,
  }));

  return { emails, pagination: { page, pageSize, total, totalPages } };
}

async function fetchBody(account, uid) {
  const proxyConfig = getProxyForAccount(account);

  try {
    const imapConfig = buildImapConfig(account, proxyConfig);
    const client = new ImapFlow(imapConfig);

    await client.connect();
    await client.mailboxOpen('INBOX');

    // 获取邮件内容
    const messages = [];
    for await (const message of client.fetch({ uid: parseInt(uid) }, { uid: true, source: true })) {
      messages.push(message);
    }

    await client.close();

    if (messages.length === 0) throw new Error('邮件不存在');

    const msg = messages[0];
    if (!msg.source) throw new Error('无法获取邮件内容');

    const parsed = await simpleParser(msg.source);
    return {
      text: parsed.text || '', html: parsed.html || '',
      subject: parsed.subject || '', from: parsed.from?.text || '',
      to: parsed.to?.text || '', date: parsed.date?.toISOString() || '',
    };
  } catch (err) {
    console.error('[MAIL] fetchBody error for ' + account.email + ' UID ' + uid + ':', err.message);
    throw err;
  }
}

function getPoolStatus() {
  const status = {};
  const db = getDB();

  for (const [id, pool] of connectionPool) {
    status[id] = {
      email: pool.account.email, status: pool.status,
      mode: 'IDLE', processedCount: pool.processedUIDs ? pool.processedUIDs.size : 0,
    };
  }

  for (const account of db.data.accounts) {
    if (!status[account.id] && account.active !== false) {
      status[account.id] = {
        email: account.email, status: account.status || 'unknown',
        mode: 'disconnected', processedCount: 0,
        lastError: account.lastError || null,
      };
    }
  }

  return status;
}

async function forceSyncAccount(account) {
  const db = getDB();
  const proxyConfig = getProxyForAccount(account);

  try {
    console.log('[MAIL-SYNC] Force sync started for ' + account.email);

    const imapConfig = buildImapConfig(account, proxyConfig);
    const client = new ImapFlow(imapConfig);

    await client.connect();
    const mailbox = await client.mailboxOpen('INBOX');

    // 获取最近的 500 封邮件做同步，平衡性能与准确度，防止大型邮箱超时
    const messages = [];
    if (mailbox.exists > 0) {
      const startSeq = Math.max(1, mailbox.exists - 499);
      for await (const message of client.fetch(`${startSeq}:*`, { uid: true, envelope: true })) {
        messages.push(message);
      }
    }

    await client.close();

    const existingUIDs = new Set(
      db.data.accountEmails
        .filter(e => e.accountId === account.id)
        .map(e => e.uid)
    );

    const newMessages = messages.filter(m => !existingUIDs.has(m.uid));

    if (newMessages.length > 0) {
      console.log('[MAIL-SYNC] ' + account.email + ': Found ' + newMessages.length + ' new emails to cache');
      const emailIdMap = await parseAndCacheEmails(newMessages, account);

      const processedUIDs = new Set([...existingUIDs]);
      for (const msg of newMessages) {
        await processNewMessage(msg, account, processedUIDs, emailIdMap);
      }
    }

    // 更新状态
    const dbAccount = db.data.accounts.find(a => a.id === account.id);
    if (dbAccount) {
      dbAccount.status = 'online';
      dbAccount.lastSync = new Date().toISOString();
      dbAccount.lastError = null;
      await db.write('accounts');
    }

    const total = db.data.accountEmails.filter(e => e.accountId === account.id).length;
    console.log('[MAIL-SYNC] ' + account.email + ': Sync complete — ' + total + ' total, ' + newMessages.length + ' new');
    return { total, newCount: newMessages.length };
  } catch (err) {
    console.error('[MAIL-SYNC] Force sync failed for ' + account.email + ':', err.message);
    const dbAccount = db.data.accounts.find(a => a.id === account.id);
    if (dbAccount) {
      dbAccount.status = 'error';
      dbAccount.lastError = err.message;
      await db.write('accounts');
    }
    throw err;
  }
}

module.exports = {
  startAll, stopAll, testConnection, restartAccount,
  fetchRecent, fetchBody, getPoolStatus, forceSyncAccount, emailEmitter,
};
