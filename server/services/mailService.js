/**
 * Mail Service - Core Engine (IMAP IDLE mode)
 */
const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const { EventEmitter } = require('events');
const { getDB } = require('../models/db');
const { createProxyAgent } = require('./proxyService');
const { processNotification } = require('./notificationService');
const config = require('../config');

// 日期解析失败时的 fallback：老邮件用极早时间，避免被误排到最前面
const OLD_DATE_FALLBACK = '2000-01-01T00:00:00.000Z';

const connectionPool = new Map();
const emailEmitter = new EventEmitter();
emailEmitter.setMaxListeners(50);
let backgroundSyncTimer = null;

function buildImapConfig(account, proxyConfig) {
  const imapConfig = {
    imap: {
      user: account.email,
      password: account.password,
      host: account.imapHost,
      port: account.imapPort || 993,
      tls: account.useSSL !== false,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: config.imapConnectTimeout,
      connTimeout: config.imapConnectTimeout,
      keepalive: {
        idleInterval: config.idleReissueInterval || 1740000,
        forceNoop: false,
      },
    },
  };
  if (proxyConfig) {
    const agent = createProxyAgent(proxyConfig);
    if (agent) imapConfig.imap.agent = agent;
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
  // useProxy=false: do NOT silently fall back to a user-level proxy
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

async function parseAndCacheEmails(messages, account) {
  const db = getDB();
  const { v4: uuidv4 } = require('uuid');
  const now = new Date().toISOString();
  for (const msg of messages) {
    const uid = msg.attributes.uid;
    const exists = db.data.accountEmails.some(e => e.accountId === account.id && e.uid === uid);
    if (exists) continue;
    try {
      const headerPart = msg.parts.find(p => p.which === 'HEADER');
      if (!headerPart) continue;
      const body = headerPart.body;
      let fromName = '', fromAddress = '', toAddr = account.email, subject = '(no subject)', date = now;
      if (Buffer.isBuffer(body) || typeof body === 'string') {
        const parsed = await simpleParser(body);
        const from = extractFirstAddress(parsed.from?.value);
        fromName = from.name; fromAddress = from.address;
        toAddr = extractFirstAddress(parsed.to?.value).address || account.email;
        subject = parsed.subject || '(no subject)';
        date = parsed.date instanceof Date && !isNaN(parsed.date.getTime())
          ? parsed.date.toISOString()
          : parseEmailDate(extractSingleValue(body.date), OLD_DATE_FALLBACK);
      } else if (body && typeof body === 'object') {
        const from = extractFirstAddress(body.from);
        fromName = from.name; fromAddress = from.address;
        if (!fromAddress) {
          try {
            const rawHeader = reconstructRawHeader(body);
            if (rawHeader) {
              const parsed = await simpleParser(rawHeader);
              const fallbackFrom = extractFirstAddress(parsed.from?.value);
              fromName = fallbackFrom.name; fromAddress = fallbackFrom.address;
              if (!toAddr || toAddr === account.email) {
                toAddr = extractFirstAddress(parsed.to?.value).address || account.email;
              }
            }
          } catch (_) {}
        }
        subject = extractSingleValue(body.subject) || '(no subject)';
        date = parseEmailDate(extractSingleValue(body.date), OLD_DATE_FALLBACK);
        if (!toAddr || toAddr === account.email) {
          toAddr = extractFirstAddress(body.to).address || account.email;
        }
      } else {
        continue;
      }
      db.data.accountEmails.push({
        id: uuidv4(), accountId: account.id, userId: account.userId, uid,
        fromName, fromAddress, to: toAddr, subject, date,
        hasAttachments: false, attachmentsCount: 0, fetchedAt: now,
      });
    } catch (parseErr) {
      console.error('[MAIL] parseAndCacheEmails error:', parseErr.message);
    }
  }
  await db.write();
  const cached = db.data.accountEmails.filter(e => e.accountId === account.id);
  const withSender = cached.filter(e => e.fromAddress).length;
  console.log('[MAIL-CACHE] ' + account.email + ': ' + cached.length + ' total, ' + withSender + ' with sender info');
}

function reconstructRawHeader(body) {
  try {
    const lines = [];
    const fieldMap = {
      from: 'From', to: 'To', cc: 'Cc', bcc: 'Bcc',
      subject: 'Subject', date: 'Date', 'message-id': 'Message-ID',
      'reply-to': 'Reply-To', 'return-path': 'Return-Path',
    };
    for (const [key, value] of Object.entries(body)) {
      if (!value) continue;
      const headerName = fieldMap[key.toLowerCase()] || key;
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string') {
            lines.push(headerName + ': ' + item);
          } else if (item && typeof item === 'object') {
            if (item.address) {
              const display = item.name ? '"' + item.name + '" <' + item.address + '>' : item.address;
              lines.push(headerName + ': ' + display);
            } else {
              lines.push(headerName + ': ' + JSON.stringify(item));
            }
          }
        }
      } else if (typeof value === 'string') {
        lines.push(headerName + ': ' + value);
      } else if (typeof value === 'object' && value.address) {
        const display = value.name ? '"' + value.name + '" <' + value.address + '>' : value.address;
        lines.push(headerName + ': ' + display);
      }
    }
    return lines.length > 0 ? lines.join('\r\n') + '\r\n' : null;
  } catch (_) {
    return null;
  }
}

async function processNewMessage(msg, account, processedUIDs) {
  const db = getDB();
  processedUIDs.add(msg.attributes.uid);
  const all = msg.parts.find(p => p.which === '');
  if (!all) return;
  const parsed = await simpleParser(all.body);
  const from = extractFirstAddress(parsed.from?.value);
  // 优先使用邮件 Date header，解析失败才用当前时间（新邮件场景 fallback 合理）
  const emailDate = parsed.date instanceof Date && !isNaN(parsed.date.getTime())
    ? parsed.date.toISOString()
    : parseEmailDate(parsed.headers?.get('date')?.toString(), new Date().toISOString());
  const emailData = {
    subject: parsed.subject || '(no subject)',
    senderName: from.name || from.address || 'unknown',
    senderEmail: from.address || 'unknown',
    toEmail: account.email,
    snippet: (parsed.text || '').substring(0, 200).trim(),
    receivedAt: emailDate,
  };
  console.log('[MAIL] New email from ' + emailData.senderEmail + ': ' + emailData.subject);
  const { v4: uuidv4 } = require('uuid');
  const logEntry = {
    id: uuidv4(), userId: account.userId, accountId: account.id,
    subject: emailData.subject, senderName: emailData.senderName,
    senderEmail: emailData.senderEmail, toEmail: emailData.toEmail,
    receivedAt: emailData.receivedAt, forwardStatus: 'sending', snippet: emailData.snippet,
  };
  db.data.emailLogs.push(logEntry);
  await db.write();
  processNotification(account.userId, emailData, logEntry.id);
  emailEmitter.emit('new_email', {
    userId: account.userId, accountId: account.id, accountEmail: account.email,
    logId: logEntry.id, subject: emailData.subject, senderName: emailData.senderName,
    senderEmail: emailData.senderEmail, toEmail: emailData.toEmail,
    receivedAt: emailData.receivedAt, snippet: emailData.snippet,
  });
}

function cleanupPoolEntry(accountId) {
  const pool = connectionPool.get(accountId);
  if (!pool) return;
  if (pool.safetyTimer) clearInterval(pool.safetyTimer);
  if (pool.reconnectTimer) clearTimeout(pool.reconnectTimer);
  if (pool.connection && pool.handlers) {
    try {
      pool.connection.removeListener('mail', pool.handlers.onMail);
      pool.connection.removeListener('close', pool.handlers.onClose);
      pool.connection.removeListener('error', pool.handlers.onError);
    } catch (_) {}
  }
  connectionPool.delete(accountId);
}

function scheduleReconnect(accountId, delay) {
  const pool = connectionPool.get(accountId);
  if (!pool) return;
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
    const connection = await imaps.connect(imapConfig);
    const rawConn = connection.imap || connection.source || connection;
    rawConn.on('error', (err) => {
      console.error('[MAIL-IDLE] Raw connection error for ' + account.email + ':', err.message);
    });
    const dbAccount = db.data.accounts.find(a => a.id === account.id);
    if (dbAccount) {
      dbAccount.status = 'online';
      dbAccount.lastSync = new Date().toISOString();
      await db.write();
    }
    console.log('[MAIL-IDLE] Connected to ' + account.email + ', opening INBOX...');
    await connection.openBox('INBOX');

    // Initial full scan
    const headerFetchOptions = { bodies: ['HEADER'], markSeen: false, struct: false };
    const initialMessages = await connection.search(['ALL'], headerFetchOptions);
    if (initialMessages.length > 0) {
      for (const msg of initialMessages) processedUIDs.add(msg.attributes.uid);
      const maxUID = Math.max(...initialMessages.map(m => m.attributes.uid));
      console.log('[MAIL-IDLE] ' + account.email + ': Initial scan, ' + initialMessages.length + ' emails, latest UID=' + maxUID);
      const staleCount = db.data.accountEmails.filter(e => e.accountId === account.id && !e.fromAddress).length;
      if (staleCount > 0) {
        db.data.accountEmails = db.data.accountEmails.filter(e => !(e.accountId === account.id && !e.fromAddress));
        console.log('[MAIL-IDLE] ' + account.email + ': Cleaned ' + staleCount + ' stale cache entries');
      }
      await parseAndCacheEmails(initialMessages, account);
    }

    // IDLE mail event handler
    const onMail = async (numNewMsgs) => {
      console.log('[MAIL-IDLE] ' + account.email + ': IDLE detected ' + numNewMsgs + ' new message(s)');
      try {
        const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], markSeen: false, struct: true };
        const messages = await connection.search(['ALL'], fetchOptions);
        const newMessages = messages.filter(m => !processedUIDs.has(m.attributes.uid));
        for (const msg of newMessages) await processNewMessage(msg, account, processedUIDs);
        if (newMessages.length > 0) await parseAndCacheEmails(newMessages, account);
        const dbAcc = db.data.accounts.find(a => a.id === account.id);
        if (dbAcc) { dbAcc.lastSync = new Date().toISOString(); await db.write(); }
      } catch (err) {
        console.error('[MAIL-IDLE] Error processing new mail for ' + account.email + ':', err.message);
      }
    };

    const onClose = () => {
      console.log('[MAIL-IDLE] Connection closed for ' + account.email);
      cleanupPoolEntry(account.id);
      const dbAcc = db.data.accounts.find(a => a.id === account.id);
      if (dbAcc) { dbAcc.status = 'reconnecting'; db.write().catch(() => {}); }
      scheduleReconnect(account.id, config.reconnectBaseDelay || 30000);
    };

    const onError = (err) => {
      console.error('[MAIL-IDLE] Connection error for ' + account.email + ':', err.message);
    };

    connection.on('mail', onMail);
    connection.on('close', onClose);
    connection.on('error', onError);

    // Safety poll (fallback for silent IDLE drops)
    const safetyInterval = config.safetyPollInterval || 300000;
    const safetyTimer = setInterval(async () => {
      try {
        const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], markSeen: false, struct: true };
        const messages = await connection.search(['ALL'], fetchOptions);
        const newMessages = messages.filter(m => !processedUIDs.has(m.attributes.uid));
        if (newMessages.length > 0) {
          console.log('[MAIL-IDLE] Safety poll found ' + newMessages.length + ' new message(s) for ' + account.email);
          for (const msg of newMessages) await processNewMessage(msg, account, processedUIDs);
          await parseAndCacheEmails(newMessages, account);
        }
        const dbAcc = db.data.accounts.find(a => a.id === account.id);
        if (dbAcc) { dbAcc.lastSync = new Date().toISOString(); await db.write(); }
      } catch (pollErr) {
        console.error('[MAIL-IDLE] Safety poll error for ' + account.email + ':', pollErr.message);
      }
    }, safetyInterval);

    connectionPool.set(account.id, {
      connection, safetyTimer, reconnectTimer: null, status: 'idle',
      account, processedUIDs, handlers: { onMail, onClose, onError },
    });
    console.log('[MAIL-IDLE] ' + account.email + ': IDLE active, safety poll every ' + Math.round(safetyInterval / 1000) + 's');
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
    if (dbAccount) { dbAccount.status = 'error'; dbAccount.lastError = errMsg; await db.write(); }
    scheduleReconnect(account.id, config.reconnectBaseDelay || 30000);
  }
}

async function startAll() {
  const db = getDB();
  const activeAccounts = db.data.accounts.filter(a => a.active !== false);
  console.log('[MAIL-IDLE] Starting ' + activeAccounts.length + ' email IDLE connections...');
  for (const account of activeAccounts) await connectAndIdle(account);

  // Background sync: periodically re-scan all accounts as a fallback for IDLE failures
  const syncInterval = typeof config.backgroundSyncInterval === 'number' ? config.backgroundSyncInterval : 120000;
  if (syncInterval > 0) {
    backgroundSyncTimer = setInterval(async () => {
      const db2 = getDB();
      const accounts = db2.data.accounts.filter(a => a.active !== false);
      for (const account of accounts) {
        try {
          await forceSyncAccount(account);
        } catch (_) { /* logged inside forceSyncAccount */ }
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
      if (pool.connection && pool.connection.close) pool.connection.close();
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
    const connection = await imaps.connect(imapConfig);
    const connectTime = Date.now() - startTime;
    let serverGreeting = '';
    try {
      const rawConn = connection.imap || connection.source || connection;
      if (rawConn && rawConn.serverGreeting) {
        serverGreeting = typeof rawConn.serverGreeting === 'string'
          ? rawConn.serverGreeting
          : (rawConn.serverGreeting.text || String(rawConn.serverGreeting));
      }
    } catch (_) {}
    const openStart = Date.now();
    const box = await connection.openBox('INBOX');
    const openTime = Date.now() - openStart;
    const inboxTotal = box?.messages?.total ?? box?.total ?? 0;
    const inboxUnseen = box?.messages?.new ?? box?.unseen ?? 0;
    connection.end();
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
        serverPort: accountData.imapPort || 993, serverGreeting: serverGreeting || accountData.imapHost,
        tlsStatus, accountEmail: accountData.email, provider,
        inbox: { total: inboxTotal, unseen: inboxUnseen },
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
    const connection = await imaps.connect(imapConfig);
    await connection.openBox('INBOX');
    const searchCriteria = [['UID', uid + ':' + uid]];
    const fetchOptions = { bodies: [''], markSeen: false, struct: true };
    const messages = await connection.search(searchCriteria, fetchOptions);
    connection.end();
    if (messages.length === 0) throw new Error('邮件不存在');
    const msg = messages[0];
    const allPart = msg.parts.find(p => p.which === '');
    if (!allPart) throw new Error('无法获取邮件内容');
    const parsed = await simpleParser(allPart.body);
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
  // Include accounts not in pool (e.g. error/reconnecting) with lastError
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

/**
 * Force re-scan an account's INBOX and update the cache.
 * Returns { total, newCount } so the caller can report the result.
 */
async function forceSyncAccount(account) {
  const db = getDB();
  const proxyConfig = getProxyForAccount(account);
  let connection;
  try {
    console.log('[MAIL-SYNC] Force sync started for ' + account.email);
    const imapConfig = buildImapConfig(account, proxyConfig);
    connection = await imaps.connect(imapConfig);
    await connection.openBox('INBOX');

    const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], markSeen: false, struct: true };
    const messages = await connection.search(['ALL'], fetchOptions);

    const existingUIDs = new Set(
      db.data.accountEmails
        .filter(e => e.accountId === account.id)
        .map(e => e.uid)
    );
    const newMessages = messages.filter(m => !existingUIDs.has(m.attributes.uid));

    if (newMessages.length > 0) {
      console.log('[MAIL-SYNC] ' + account.email + ': Found ' + newMessages.length + ' new emails to cache');
      // Process each new message: write to emailLogs, emit SSE, send notifications
      const processedUIDs = new Set([...existingUIDs]);
      for (const msg of newMessages) {
        await processNewMessage(msg, account, processedUIDs);
      }
      // Also update accountEmails cache
      await parseAndCacheEmails(newMessages, account);
    }

    // Update account status
    const dbAccount = db.data.accounts.find(a => a.id === account.id);
    if (dbAccount) {
      dbAccount.status = 'online';
      dbAccount.lastSync = new Date().toISOString();
      dbAccount.lastError = null;
      await db.write();
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
      await db.write();
    }
    throw err;
  } finally {
    if (connection) {
      try { connection.end(); } catch (_) {}
    }
  }
}

module.exports = {
  startAll, stopAll, testConnection, restartAccount,
  fetchRecent, fetchBody, getPoolStatus, forceSyncAccount, emailEmitter,
};
