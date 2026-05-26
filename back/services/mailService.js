/**
 * 邮件服务模块 — IMAP IDLE 模式 + SOCKS5 代理支持
 *
 * 代理原理：通过 socks 库在 TCP 层建立隧道，再叠加 TLS
 */
const imapsimple = require('imap-simple');
const Imap = require('imap');
const tls = require('tls');
const { simpleParser } = require('mailparser');
const { SocksClient } = require('socks');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { emailsDb, proxiesDb, notificationsDb, filtersDb } = require('../models/database');
const { sendNotification, checkFilters } = require('./notificationService');
const logEmitter = require('./logEmitter');

const activeConnections = new Map();

/**
 * 获取邮箱的代理配置
 */
const getProxyConfig = (emailDoc) => {
  const { userId, useProxy, proxyId } = emailDoc;
  if (!useProxy || !proxyId) return null;
  const proxy = proxiesDb.get('proxies').find({ userId, id: proxyId }).value();
  if (!proxy) return null;
  return { host: proxy.host, port: proxy.port, type: proxy.type, username: proxy.username, password: proxy.password };
};

/**
 * 通过 SOCKS5 代理创建 IMAP 连接
 * 核心：先建立 TCP 隧道，再叠加 TLS，再用 imap-simple 包装
 */
const connectImapWithProxy = async (emailConfig, proxyConfig) => {
  const { email, password, imapHost, imapPort, useSSL } = emailConfig;
  const port = imapPort || 993;
  const useTls = useSSL !== false;

  // 1. 通过 SOCKS5 建立 TCP 隧道
  const socksType = proxyConfig.type === 'socks4' ? 4 : 5;
  const { socket: tcpSocket } = await SocksClient.createConnection({
    proxy: {
      host: proxyConfig.host,
      port: proxyConfig.port,
      type: socksType,
      userId: proxyConfig.username || undefined,
      password: proxyConfig.password || undefined,
    },
    command: 'connect',
    destination: { host: imapHost, port: port },
  });

  // 2. 在 TCP 上叠加 TLS
  let finalSocket = tcpSocket;
  if (useTls) {
    finalSocket = await new Promise((resolve, reject) => {
      const tlsSocket = tls.connect({
        socket: tcpSocket,
        servername: imapHost,
        rejectUnauthorized: false,
      }, () => {
        resolve(tlsSocket);
      });
      tlsSocket.on('error', reject);
      setTimeout(() => reject(new Error('TLS 握手超时')), 10000);
    });
  }

  // 3. 用 node-imap 直接创建连接，传入已建立的 socket
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: email,
      password: password,
      host: imapHost,
      port: port,
      tls: useTls,
      tlsOptions: { socket: finalSocket },
      authTimeout: 15000,
      connTimeout: 15000,
      keepalive: true,
    });

    imap.once('ready', () => resolve(imap));
    imap.once('error', reject);
    imap.connect();
  });
};

/**
 * 不使用代理的 imap-simple 连接
 */
const connectImapDirect = async (emailConfig) => {
  const config = {
    imap: {
      user: emailConfig.email,
      password: emailConfig.password,
      host: emailConfig.imapHost,
      port: emailConfig.imapPort || 993,
      tls: emailConfig.useSSL !== false,
      authTimeout: 15000,
      connTimeout: 15000,
      keepalive: true,
      tlsOptions: { rejectUnauthorized: false },
    },
  };
  return await imapsimple.connect(config);
};

/**
 * 统一的 IMAP 连接入口
 */
const connectImap = async (emailConfig, proxyConfig = null) => {
  if (proxyConfig) {
    return await connectImapWithProxy(emailConfig, proxyConfig);
  }
  return await connectImapDirect(emailConfig);
};

/**
 * 测试 IMAP 连接
 */
const testImapConnection = async (emailConfig, proxyConfig = null) => {
  const startTime = Date.now();
  try {
    const connection = await connectImap(emailConfig, proxyConfig);

    // 如果是 imap-simple 返回的对象，有 openBox 方法
    if (connection.openBox) {
      await connection.openBox('INBOX');
      connection.end();
    } else {
      // node-imap 原生对象
      await new Promise((resolve, reject) => {
        connection.openBox('INBOX', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      connection.end();
    }

    return { success: true, responseTime: Date.now() - startTime };
  } catch (error) {
    return { success: false, error: error.message, errorCode: error.code || 'UNKNOWN' };
  }
};

/**
 * 用原生 IMAP fetch 拉取邮件
 */
const imapFetch = (imap, range, options) => {
  return new Promise((resolve, reject) => {
    const results = [];
    const fetch = imap.seq.fetch(range, options);
    fetch.on('message', (msg, seqno) => {
      const item = { seqno, uid: null, body: '' };
      msg.on('attributes', (attrs) => { item.uid = attrs.uid; });
      msg.on('body', (stream) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.once('end', () => { item.body = Buffer.concat(chunks).toString('utf8'); });
      });
      msg.once('end', () => { results.push(item); });
    });
    fetch.once('error', (err) => reject(err));
    fetch.once('end', () => resolve(results));
  });
};

/**
 * 解析邮件 header
 */
const parseHeader = async (headerStr, emailId, uid) => {
  const parsed = await simpleParser(headerStr);
  let fromName = '未知发件人';
  let fromAddress = '';
  if (parsed.from && parsed.from.value && parsed.from.value.length > 0) {
    fromName = parsed.from.value[0].name || parsed.from.value[0].address || '未知发件人';
    fromAddress = parsed.from.value[0].address || '';
  }
  return {
    uid, id: emailId + '-' + uid,
    fromName, fromAddress,
    to: parsed.to ? parsed.to.text : '',
    subject: parsed.subject || '（无主题）',
    snippet: '',
    date: parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString(),
    hasAttachments: false, attachmentsCount: 0,
  };
};

/**
 * 拉取最近邮件（分页）
 */
const fetchRecentEmails = async (emailId, page, pageSize) => {
  page = page || 1; pageSize = pageSize || 10;
  const emailDoc = emailsDb.get('emails').find({ id: emailId }).value();
  if (!emailDoc) throw new Error('邮箱配置不存在');

  const proxyConfig = getProxyConfig(emailDoc);
  const emailConfig = { email: emailDoc.email, password: emailDoc.password, imapHost: emailDoc.imapHost, imapPort: emailDoc.imapPort, useSSL: emailDoc.useSSL };

  let connection;
  try {
    connection = await connectImap(emailConfig, proxyConfig);

    // 获取底层 imap 对象
    const imap = connection.imap || connection;
    const openBox = (name) => new Promise((resolve, reject) => {
      imap.openBox(name, true, (err, box) => err ? reject(err) : resolve(box));
    });

    const box = await openBox('INBOX');
    const total = box.messages.total;
    if (total === 0) return { emails: [], pagination: { page, pageSize, total: 0, totalPages: 0 } };

    const totalPages = Math.ceil(total / pageSize);
    const endSeq = total - (page - 1) * pageSize;
    const startSeq = Math.max(1, endSeq - pageSize + 1);
    if (startSeq > total) return { emails: [], pagination: { page, pageSize, total, totalPages } };

    const messages = await imapFetch(imap, startSeq + ':' + endSeq, { bodies: 'HEADER', struct: false });
    const emails = [];
    for (const msg of messages) {
      if (!msg.body) continue;
      emails.push(await parseHeader(msg.body, emailId, msg.uid || msg.seqno));
    }
    emails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return { emails, pagination: { page, pageSize, total, totalPages } };
  } finally {
    if (connection) { try { connection.end(); } catch (e) {} }
  }
};

/**
 * 拉取单封邮件正文
 */
const fetchEmailBody = async (emailId, uid) => {
  const emailDoc = emailsDb.get('emails').find({ id: emailId }).value();
  if (!emailDoc) throw new Error('邮箱配置不存在');

  const proxyConfig = getProxyConfig(emailDoc);
  const emailConfig = { email: emailDoc.email, password: emailDoc.password, imapHost: emailDoc.imapHost, imapPort: emailDoc.imapPort, useSSL: emailDoc.useSSL };

  let connection;
  try {
    connection = await connectImap(emailConfig, proxyConfig);
    const imap = connection.imap || connection;

    const messages = await new Promise((resolve, reject) => {
      const results = [];
      const f = imap.fetch([uid], { bodies: '' });
      f.on('message', (msg) => {
        const item = { body: '' };
        msg.on('body', (stream) => {
          const chunks = [];
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.once('end', () => { item.body = Buffer.concat(chunks).toString('utf8'); });
        });
        msg.once('end', () => results.push(item));
      });
      f.once('error', reject);
      f.once('end', () => resolve(results));
    });

    if (messages.length === 0) throw new Error('邮件不存在');
    const parsed = await simpleParser(messages[0].body);
    return { text: parsed.text || '', html: parsed.html || '' };
  } finally {
    if (connection) { try { connection.end(); } catch (e) {} }
  }
};

// ============================================================
//  IDLE 监听
// ============================================================

const handleNewMail = async (emailDoc, imap) => {
  const { id, userId, email } = emailDoc;
  try {
    const openBox = (name) => new Promise((resolve, reject) => {
      imap.openBox(name, false, (err, box) => err ? reject(err) : resolve(box));
    });
    const box = await openBox('INBOX');
    const total = box.messages.total;
    const lastTotal = emailDoc._lastTotal || 0;
    if (total <= lastTotal) {
      emailsDb.get('emails').find({ id }).assign({ _lastTotal: total }).write();
      return;
    }

    const newCount = total - lastTotal;
    logEmitter.addLog({ level: 'info', type: 'mail', message: email + ' 发现 ' + newCount + ' 封新邮件' });
    console.log('[IDLE] 📬 ' + email + ' 发现 ' + newCount + ' 封新邮件');

    const messages = await imapFetch(imap, (lastTotal + 1) + ':' + total, { bodies: 'HEADER', struct: false });
    for (const msg of messages) {
      if (!msg.body) continue;
      const parsed = await simpleParser(msg.body);
      let fromName = '未知发件人';
      if (parsed.from && parsed.from.value && parsed.from.value.length > 0) {
        fromName = parsed.from.value[0].name || parsed.from.value[0].address || '未知发件人';
      }
      const emailData = { from: fromName, to: parsed.to ? parsed.to.text : '', subject: parsed.subject || '（无主题）', text: '', date: parsed.date || new Date(), attachments: 0 };
      logEmitter.addLog({ level: 'success', type: 'mail', message: '新邮件: ' + emailData.subject, data: { from: fromName } });
      console.log('[IDLE] 📬 ' + emailData.subject + ' (来自 ' + fromName + ')');

      const shouldNotify = await checkFilters(userId, id, emailData);
      if (shouldNotify) {
        const notifications = notificationsDb.get('notifications').filter({ userId, active: true }).value();
        for (const notif of notifications) {
          try {
            await sendNotification(notif, emailData);
            logEmitter.addLog({ level: 'success', type: 'notification', message: '通知已推送: ' + notif.name });
          } catch (err) {
            console.error('[IDLE] ✗ 通知失败:', notif.name, err.message);
          }
        }
      }
    }
    emailsDb.get('emails').find({ id }).assign({ _lastTotal: total, lastSync: new Date().toISOString() }).write();
  } catch (error) {
    console.error('[IDLE] ' + email + ' 处理失败:', error.message);
  }
};

const startEmailMonitor = async (emailDoc) => {
  const { id, email, imapHost, imapPort } = emailDoc;

  if (activeConnections.has(id)) {
    try { activeConnections.get(id).end(); } catch (e) {}
    activeConnections.delete(id);
  }

  try {
    const proxyConfig = getProxyConfig(emailDoc);
    const emailConfig = { email: emailDoc.email, password: emailDoc.password, imapHost, imapPort, useSSL: emailDoc.useSSL };

    logEmitter.addLog({ level: 'info', type: 'connection', message: '正在连接 ' + email + '...' });
    console.log('[IDLE] 正在连接 ' + email + ' (' + imapHost + ':' + imapPort + ')...');

    const imap = await connectImap(emailConfig, proxyConfig);
    const nativeImap = imap.imap || imap;

    const openBox = (name) => new Promise((resolve, reject) => {
      nativeImap.openBox(name, false, (err, box) => err ? reject(err) : resolve(box));
    });
    const box = await openBox('INBOX');
    const total = box.messages.total;

    emailsDb.get('emails').find({ id }).assign({ _lastTotal: total }).write();
    emailDoc._lastTotal = total;
    activeConnections.set(id, imap);

    logEmitter.addLog({ level: 'success', type: 'connection', message: email + ' IDLE 连接就绪，收件箱 ' + total + ' 封' });
    console.log('[IDLE] ✓ ' + email + ' 连接成功，收件箱 ' + total + ' 封');

    nativeImap.on('update', () => handleNewMail(emailDoc, nativeImap));
    nativeImap.on('mail', () => handleNewMail(emailDoc, nativeImap));

    nativeImap.once('close', () => {
      console.log('[IDLE] ' + email + ' 连接关闭，30秒后重连');
      activeConnections.delete(id);
      setTimeout(() => startEmailMonitor(emailDoc), 30000);
    });
    nativeImap.once('error', (err) => {
      console.error('[IDLE] ' + email + ' 错误:', err.message);
      activeConnections.delete(id);
      setTimeout(() => startEmailMonitor(emailDoc), 30000);
    });
  } catch (error) {
    console.error('[IDLE] ✗ ' + email + ' 启动失败:', error.message);
    logEmitter.addLog({ level: 'error', type: 'connection', message: email + ' 连接失败: ' + error.message });
    setTimeout(() => startEmailMonitor(emailDoc), 60000);
  }
};

const startAllMonitors = async () => {
  const activeEmails = emailsDb.get('emails').filter({ active: true }).value();
  console.log('[IDLE] 找到 ' + activeEmails.length + ' 个活跃邮箱');
  for (const email of activeEmails) {
    startEmailMonitor(email).catch(e => console.error('[IDLE] 启动异常:', e.message));
    await new Promise(r => setTimeout(r, 1000));
  }
};

const stopAllMonitors = () => {
  for (const [id, conn] of activeConnections) {
    try { conn.end(); } catch (e) {}
  }
  activeConnections.clear();
};

const getMonitorStatus = () => {
  const status = [];
  for (const [id, conn] of activeConnections) {
    const email = emailsDb.get('emails').find({ id }).value();
    const nativeImap = conn.imap || conn;
    status.push({
      emailId: id, email: email ? email.email : 'Unknown',
      connected: nativeImap._state === 'authenticated',
      mode: 'IDLE', lastSync: email ? email.lastSync : null,
    });
  }
  return status;
};

module.exports = {
  testImapConnection, fetchRecentEmails, fetchEmailBody,
  startEmailMonitor, startAllMonitors, stopAllMonitors, getMonitorStatus,
};
