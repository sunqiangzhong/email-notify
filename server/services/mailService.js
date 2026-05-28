/**
 * 邮件服务 - 核心引擎
 * 
 * 职责:
 *   1. 为每个激活的邮箱建立 IMAP 连接 (定时轮询)
 *   2. 捕获新邮件，触发通知流程
 *   3. 管理连接池生命周期
 *   4. 提供邮件拉取和正文获取功能
 */
const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const { EventEmitter } = require('events');
const { getDB } = require('../models/db');
const { createProxyAgent } = require('./proxyService');
const { processNotification } = require('./notificationService');
const config = require('../config');

// 连接池: Map<accountId, { connection, timer, status }>
const connectionPool = new Map();

// 新邮件事件发射器，供 SSE 端点订阅
const emailEmitter = new EventEmitter();
emailEmitter.setMaxListeners(50);

/**
 * 为单个邮箱构建 IMAP 连接配置
 */
function buildImapConfig(account, proxyConfig) {
  const imapConfig = {
    imap: {
      user: account.email,
      password: account.password,
      host: account.imapHost,
      port: account.imapPort || 993,
      tls: account.useSSL !== false,   // 字段名是 useSSL，不是 ssl
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: config.imapConnectTimeout,
      connTimeout: config.imapConnectTimeout,
    },
  };

  // 如果有代理，使用代理 agent（代理对象存在即视为可用）
  if (proxyConfig) {
    const agent = createProxyAgent(proxyConfig);
    if (agent) {
      imapConfig.imap.agent = agent;
    }
  }

  return imapConfig;
}

/**
 * 获取邮箱的代理配置
 */
function getProxyForAccount(account) {
  const db = getDB();
  if (account.useProxy && account.proxyId) {
    return db.data.proxies.find(p => p.id === account.proxyId) || null;
  }
  return db.data.proxies.find(p => p.userId === account.userId) || null;
}

/**
 * 从 imap-simple 解析的 header 对象中提取收件人地址字段
 * imap-simple 将所有 header 值包装为数组，单值字段为 [value]，地址字段为 [[{name, address}]]
 * 也可能返回字符串格式如 "Name <email@example.com>"
 * @param {*} field - header 字段值
 * @returns {{name: string, address: string}} 第一个地址对象
 */
function extractFirstAddress(field) {
  const result = { name: '', address: '' };
  try {
    if (!field) return result;
    // 已是 {name, address} 对象
    if (field.name && field.address) {
      result.name = field.name; result.address = field.address; return result;
    }
    // 字符串格式: "Name <email>" 或纯 email
    if (typeof field === 'string') {
      const parsed = parseAddressString(field);
      if (parsed) return parsed;
      return result;
    }
    // 已是数组，查找第一个含 address 的元素
    const arr = Array.isArray(field) ? field : [field];
    for (const item of arr) {
      if (!item) continue;
      // 对象格式 {name, address}
      if (typeof item === 'object' && item.address) {
        result.name = item.name || ''; result.address = item.address; return result;
      }
      // 字符串格式: "Name <email>" 或纯 email
      if (typeof item === 'string') {
        const parsed = parseAddressString(item);
        if (parsed) return parsed;
      }
      // 嵌套数组 [[{name, address}]] 或 [["Name <email>"]]
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

/**
 * 解析 "Display Name <email@example.com>" 或纯 email 格式的地址字符串
 */
function parseAddressString(str) {
  if (!str || typeof str !== 'string') return null;
  str = str.trim();
  // "Name <email>" 格式
  const match = str.match(/^"?([^"<]*)"?\s*<([^>]+)>/);
  if (match) {
    return { name: match[1].trim(), address: match[2].trim() };
  }
  // 纯 email 格式
  if (str.includes('@') && !str.includes(' ')) {
    return { name: '', address: str };
  }
  return null;
}

/**
 * 解析邮件 Date 头字段，返回 ISO 字符串
 *
 * 常见坑点:
 *   - RFC 2822 允许用括号标注时区缩写如 (CST), (PDT), (EST)
 *     JS 的 new Date() 不认识这些缩写，会返回 Invalid Date 或错误时间
 *   - 某些客户端发送畸形 Date 头
 *
 * 策略:
 *   1. 先去掉 `(XYZ)` 时区缩写再解析（字符串本身已包含 UTC offset 如 +0800）
 *   2. 验证日期范围合理性（1990 ~ 当前+1天）
 *   3. 全部失败则返回 fallback（默认当前时间）
 *
 * @param {string} dateStr - 原始 Date 头字符串
 * @param {string} fallback - 解析失败时的替代值（ISO 字符串）
 * @returns {string} ISO 8601 日期字符串
 */
function parseEmailDate(dateStr, fallback) {
  if (!dateStr || typeof dateStr !== 'string') return fallback || new Date().toISOString();

  const now = Date.now();
  const minTs = new Date('1990-01-01').getTime();
  const maxTs = now + 86400000; // 当前时间 +1 天，容忍客户端时钟微小偏差

  const validate = (ts) => {
    return !isNaN(ts) && ts >= minTs && ts <= maxTs;
  };

  // 去掉 (CST) (PDT) (EST) (UTC+8) 等括号时区缩写，保留字符串中已有的数字偏移如 +0800
  const normalized = dateStr.replace(/\s*\([^)]+\)\s*$/, '').trim();

  const d1 = new Date(normalized);
  if (validate(d1.getTime())) return d1.toISOString();

  const d2 = new Date(dateStr);
  if (validate(d2.getTime())) return d2.toISOString();

  return fallback || new Date().toISOString();
}

/**
 * 从 imap-simple 解析的 header 对象中提取单值字段（如 subject、date）
 * @param {*} field - header 字段值
 * @returns {string} 字符串值
 */
function extractSingleValue(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (Array.isArray(field)) return typeof field[0] === 'string' ? field[0] : '';
  return String(field);
}

/**
 * 解析 IMAP 消息列表并持久化到 accountEmails 集合（去重）
 * @param {Array} messages - imap-simple 返回的消息数组
 * @param {object} account - 邮箱账户对象
 */
async function parseAndCacheEmails(messages, account) {
  const db = getDB();
  const { v4: uuidv4 } = require('uuid');
  const now = new Date().toISOString();

  for (const msg of messages) {
    const uid = msg.attributes.uid;

    // 去重：同一 accountId 下已存在该 uid 则跳过
    const exists = db.data.accountEmails.some(
      e => e.accountId === account.id && e.uid === uid
    );
    if (exists) continue;

    try {
      const headerPart = msg.parts.find(p => p.which === 'HEADER');
      if (!headerPart) continue;

      const body = headerPart.body;

      let fromName = '', fromAddress = '', toAddr = account.email, subject = '(无主题)', date = now;

      // 缓存旧邮件时，日期解析失败用极早时间做 fallback，避免旧邮件被误排到最前面
      const OLD_DATE_FALLBACK = '2000-01-01T00:00:00.000Z';

      if (Buffer.isBuffer(body) || typeof body === 'string') {
        // 原始头文本，用 simpleParser 解析
        const parsed = await simpleParser(body);
        const from = extractFirstAddress(parsed.from?.value);
        fromName = from.name; fromAddress = from.address;
        toAddr = extractFirstAddress(parsed.to?.value).address || account.email;
        subject = parsed.subject || '(无主题)';
        date = parsed.date instanceof Date && !isNaN(parsed.date.getTime())
          ? parsed.date.toISOString()
          : parseEmailDate(extractSingleValue(body.date), OLD_DATE_FALLBACK);
      } else if (body && typeof body === 'object') {
        // imap-simple 解析后的对象格式（from/to 为字符串数组如 ["Name <email>"]）
        const from = extractFirstAddress(body.from);
        fromName = from.name; fromAddress = from.address;

        // 如果对象格式解析失败，尝试回退：将对象转为原始头文本再用 simpleParser 解析
        if (!fromAddress) {
          try {
            const rawHeader = reconstructRawHeader(body);
            if (rawHeader) {
              const parsed = await simpleParser(rawHeader);
              const fallbackFrom = extractFirstAddress(parsed.from?.value);
              fromName = fallbackFrom.name;
              fromAddress = fallbackFrom.address;
              if (!toAddr || toAddr === account.email) {
                toAddr = extractFirstAddress(parsed.to?.value).address || account.email;
              }
            }
          } catch (_) {}
        }

        subject = extractSingleValue(body.subject) || '(无主题)';
        const dateStr = extractSingleValue(body.date);
        date = parseEmailDate(dateStr, OLD_DATE_FALLBACK);

        if (!toAddr || toAddr === account.email) {
          toAddr = extractFirstAddress(body.to).address || account.email;
        }
      } else {
        continue;
      }

      db.data.accountEmails.push({
        id: uuidv4(),
        accountId: account.id,
        userId: account.userId,
        uid,
        fromName,
        fromAddress,
        to: toAddr,
        subject,
        date,
        hasAttachments: false,
        attachmentsCount: 0,
        fetchedAt: now,
      });
    } catch (parseErr) {
      console.error('[MAIL] parseAndCacheEmails error:', parseErr.message);
    }
  }

  await db.write();
  const cached = db.data.accountEmails.filter(e => e.accountId === account.id);
  const withSender = cached.filter(e => e.fromAddress).length;
  console.log(`[MAIL-CACHE] ${account.email}: ${cached.length} total, ${withSender} with sender info`);
}

/**
 * 将 imap-simple 解析后的 header 对象重建为 RFC 822 原始头文本
 * 用于 simpleParser 回退解析
 */
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
            lines.push(`${headerName}: ${item}`);
          } else if (item && typeof item === 'object') {
            // 地址对象 {name, address}
            if (item.address) {
              const display = item.name ? `"${item.name}" <${item.address}>` : item.address;
              lines.push(`${headerName}: ${display}`);
            } else {
              lines.push(`${headerName}: ${JSON.stringify(item)}`);
            }
          }
        }
      } else if (typeof value === 'string') {
        lines.push(`${headerName}: ${value}`);
      } else if (typeof value === 'object' && value.address) {
        const display = value.name ? `"${value.name}" <${value.address}>` : value.address;
        lines.push(`${headerName}: ${display}`);
      }
    }

    return lines.length > 0 ? lines.join('\r\n') + '\r\n' : null;
  } catch (_) {
    return null;
  }
}

/**
 * 连接单个邮箱并轮询新邮件
 */
async function connectAndPoll(account) {
  const db = getDB();
  const proxyConfig = getProxyForAccount(account);

  try {
    console.log(`[MAIL] Connecting to ${account.email} (${account.imapHost})...`);

    const imapConfig = buildImapConfig(account, proxyConfig);
    const connection = await imaps.connect(imapConfig);

    // 捕获底层 imap 连接的异步错误（TLS 握手失败等），防止进程崩溃
    const rawConn = connection.imap || connection.source || connection;
    rawConn.on('error', (err) => {
      console.error(`[MAIL] Connection error for ${account.email}:`, err.message);
    });
    if (rawConn !== connection) {
      connection.on('error', (err) => {
        console.error(`[MAIL] Connection error for ${account.email}:`, err.message);
      });
    }

    // 更新状态为在线
    const dbAccount = db.data.accounts.find(a => a.id === account.id);
    if (dbAccount) {
      dbAccount.status = 'online';
      dbAccount.lastSync = new Date().toISOString();
      await db.write();
    }

    console.log(`[MAIL] Connected to ${account.email}`);

    // 打开收件箱
    await connection.openBox('INBOX');

    // 记录已处理的邮件 UID，避免重复触发通知
    const processedUIDs = new Set();

    // 首次加载：拉取最近邮件头并持久化到数据库，标记所有已有 UID 为已处理
    const headerFetchOptions = {
      bodies: ['HEADER'],
      markSeen: false,
      struct: false,
    };
    const initialMessages = await connection.search(['ALL'], headerFetchOptions);
    if (initialMessages.length > 0) {
      // 标记所有已有邮件为已处理，避免重启后重复触发通知
      for (const msg of initialMessages) {
        processedUIDs.add(msg.attributes.uid);
      }
      const maxUID = Math.max(...initialMessages.map(m => m.attributes.uid));
      console.log(`[MAIL] ${account.email}: Initial scan, ${initialMessages.length} emails, latest UID=${maxUID}`);
      // 清理缓存中发件人为空的旧数据，强制重新解析
      const staleCount = db.data.accountEmails.filter(
        e => e.accountId === account.id && !e.fromAddress
      ).length;
      if (staleCount > 0) {
        db.data.accountEmails = db.data.accountEmails.filter(
          e => !(e.accountId === account.id && !e.fromAddress)
        );
        console.log(`[MAIL] ${account.email}: Cleaned ${staleCount} stale cache entries (empty sender)`);
      }
      // 将已有邮件持久化到 accountEmails 集合
      await parseAndCacheEmails(initialMessages, account);
    }

    // 定时轮询（使用完整 body 获取以便触发通知）
    const pollFetchOptions = {
      bodies: ['HEADER', 'TEXT', ''],
      markSeen: false,
      struct: true,
    };
    const pollInterval = Math.max(config.mailPollInterval, 30000); // 最少30秒
    const timer = setInterval(async () => {
      try {
        const messages = await connection.search(['ALL'], pollFetchOptions);
        const newMessages = messages.filter(m => !processedUIDs.has(m.attributes.uid));

        for (const msg of newMessages) {
          processedUIDs.add(msg.attributes.uid);

          // 解析邮件内容
          const all = msg.parts.find(p => p.which === '');
          if (!all) continue;

          const parsed = await simpleParser(all.body);
          const from = extractFirstAddress(parsed.from?.value);

          const emailData = {
            subject: parsed.subject || '(无主题)',
            senderName: from.name || from.address || '未知',
            senderEmail: from.address || 'unknown',
            toEmail: account.email,
            snippet: (parsed.text || '').substring(0, 200).trim(),
            receivedAt: new Date().toISOString(),
          };

          console.log(`[MAIL] New email from ${emailData.senderEmail}: ${emailData.subject}`);

          // 写入日志
          const { v4: uuidv4 } = require('uuid');
          const logEntry = {
            id: uuidv4(),
            userId: account.userId,
            accountId: account.id,
            subject: emailData.subject,
            senderName: emailData.senderName,
            senderEmail: emailData.senderEmail,
            toEmail: emailData.toEmail,
            receivedAt: emailData.receivedAt,
            forwardStatus: 'sending',
            snippet: emailData.snippet,
          };

          db.data.emailLogs.push(logEntry);
          await db.write();

          // 触发通知流程
          processNotification(account.userId, emailData, logEntry.id);

          // 广播新邮件事件，供 SSE 推送端点使用
          emailEmitter.emit('new_email', {
            userId: account.userId,
            accountId: account.id,
            accountEmail: account.email,
            logId: logEntry.id,
            subject: emailData.subject,
            senderName: emailData.senderName,
            senderEmail: emailData.senderEmail,
            toEmail: emailData.toEmail,
            receivedAt: emailData.receivedAt,
            snippet: emailData.snippet,
          });
        }

        // 将新邮件也持久化到 accountEmails 集合
        if (newMessages.length > 0) {
          await parseAndCacheEmails(newMessages, account);
        }

        // 更新 lastSync
        const dbAccount = db.data.accounts.find(a => a.id === account.id);
        if (dbAccount) {
          dbAccount.lastSync = new Date().toISOString();
          await db.write();
        }
      } catch (pollErr) {
        console.error(`[MAIL] Poll error for ${account.email}:`, pollErr.message);
        // 尝试重连
        try {
          await connection.openBox('INBOX');
        } catch (reconnErr) {
          console.error(`[MAIL] Reconnect failed for ${account.email}, will retry next cycle`);
        }
      }
    }, pollInterval);

    // 保存连接信息
    connectionPool.set(account.id, {
      connection,
      timer,
      status: 'connected',
      account,
    });

    // 连接关闭时清理
    connection.on('close', () => {
      console.log(`[MAIL] Connection closed for ${account.email}`);
      clearInterval(timer);
      connectionPool.delete(account.id);
      // 更新状态
      const dbAccount = db.data.accounts.find(a => a.id === account.id);
      if (dbAccount) {
        dbAccount.status = 'error';
        db.write().catch(() => {});
      }
    });

    connection.on('error', (err) => {
      console.error(`[MAIL] Connection error for ${account.email}:`, err.message);
    });

  } catch (err) {
    console.error(`[MAIL] Failed to connect to ${account.email}:`, err.message);

    // 更新状态为错误
    const dbAccount = db.data.accounts.find(a => a.id === account.id);
    if (dbAccount) {
      dbAccount.status = 'error';
      await db.write();
    }
  }
}

/**
 * 启动所有激活邮箱的连接
 */
async function startAll() {
  const db = getDB();
  const activeAccounts = db.data.accounts.filter(a => a.active !== false);

  console.log(`[MAIL] Starting ${activeAccounts.length} email connections...`);

  for (const account of activeAccounts) {
    await connectAndPoll(account);
  }
}

/**
 * 停止所有连接
 */
async function stopAll() {
  console.log(`[MAIL] Stopping all connections (${connectionPool.size} active)...`);

  for (const [accountId, pool] of connectionPool) {
    try {
      clearInterval(pool.timer);
      if (pool.connection && pool.connection.close) {
        pool.connection.close();
      }
      console.log(`[MAIL] Stopped connection for ${pool.account.email}`);
    } catch (err) {
      console.error(`[MAIL] Error stopping connection ${accountId}:`, err.message);
    }
  }

  connectionPool.clear();
}

/**
 * 测试邮箱连接（详细诊断，参照 MoviePilot 站点连通性风格）
 * 返回: responseTime, serverGreeting, inboxInfo, tlsStatus, accountEmail, provider
 */
async function testConnection(accountData, proxyConfig) {
  const startTime = Date.now();
  const tlsStatus = accountData.useSSL !== false;

  try {
    const imapConfig = buildImapConfig(accountData, proxyConfig);
    const connection = await imaps.connect(imapConfig);
    const connectTime = Date.now() - startTime;

    // 获取服务器信息（imap-simple 底层 imap 对象）
    let serverGreeting = '';
    try {
      const rawConn = connection.imap || connection.source || connection;
      if (rawConn && rawConn.serverGreeting) {
        serverGreeting = typeof rawConn.serverGreeting === 'string'
          ? rawConn.serverGreeting
          : (rawConn.serverGreeting.text || String(rawConn.serverGreeting));
      }
    } catch (_) {}

    // 打开 INBOX 获取统计信息
    const openStart = Date.now();
    const box = await connection.openBox('INBOX');
    const openTime = Date.now() - openStart;

    const inboxTotal = box?.messages?.total ?? box?.total ?? 0;
    const inboxUnseen = box?.messages?.new ?? box?.unseen ?? 0;

    connection.end();

    // 推断邮箱服务商
    const host = (accountData.imapHost || '').toLowerCase();
    let provider = 'custom';
    if (host.includes('qq')) provider = 'qq';
    else if (host.includes('gmail')) provider = 'gmail';
    else if (host.includes('outlook') || host.includes('hotmail')) provider = 'outlook';
    else if (host.includes('163')) provider = '163';

    return {
      success: true,
      message: '邮箱连接测试成功',
      data: {
        responseTime: connectTime,
        openTime,
        serverHost: accountData.imapHost,
        serverPort: accountData.imapPort || 993,
        serverGreeting: serverGreeting || accountData.imapHost,
        tlsStatus,
        accountEmail: accountData.email,
        provider,
        inbox: {
          total: inboxTotal,
          unseen: inboxUnseen,
        },
      },
    };
  } catch (err) {
    const elapsed = Date.now() - startTime;
    return {
      success: false,
      error: err.message || '连接失败',
      message: err.message || '连接失败',
      data: {
        responseTime: elapsed,
        serverHost: accountData.imapHost,
        serverPort: accountData.imapPort || 993,
        serverGreeting: '',
        tlsStatus,
        accountEmail: accountData.email,
        provider: 'custom',
        inbox: { total: 0, unseen: 0 },
      },
    };
  }
}

/**
 * 重启单个邮箱的连接
 */
async function restartAccount(accountId) {
  const pool = connectionPool.get(accountId);
  if (pool) {
    clearInterval(pool.timer);
    if (pool.connection && pool.connection.close) {
      pool.connection.close();
    }
    connectionPool.delete(accountId);
  }

  const db = getDB();
  const account = db.data.accounts.find(a => a.id === accountId);
  if (account && account.active !== false) {
    await connectAndPoll(account);
  }
}

/**
 * 拉取最近邮件（分页） - 从 accountEmails 数据库缓存读取，避免频繁 IMAP 请求
 * @param {object} account - 邮箱账户对象
 * @param {number} page - 页码（从1开始）
 * @param {number} pageSize - 每页数量
 * @returns {Promise<{emails: Array, pagination: object}>}
 */
async function fetchRecent(account, page = 1, pageSize = 10) {
  const db = getDB();

  // 从缓存中读取该账户的邮件，按 date 降序排序；date 相同时用 uid 降序兜底
  const allEmails = db.data.accountEmails
    .filter(e => e.accountId === account.id)
    .sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      // 无效日期放最末尾
      const va = isNaN(da) ? -Infinity : da;
      const vb = isNaN(db) ? -Infinity : db;
      if (vb !== va) return vb - va;
      // 日期相同按 uid 降序（uid 越大越新）
      return (b.uid || 0) - (a.uid || 0);
    });

  const total = allEmails.length;
  const totalPages = Math.ceil(total / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, total);
  const pageEmails = allEmails.slice(startIndex, endIndex);

  const emails = pageEmails.map(e => ({
    uid: e.uid,
    id: e.id,
    fromName: e.fromName || '',
    fromAddress: e.fromAddress || '',
    to: e.to || account.email,
    subject: e.subject || '(无主题)',
    snippet: '',
    date: e.date,
    hasAttachments: e.hasAttachments || false,
    attachmentsCount: e.attachmentsCount || 0,
  }));

  return {
    emails,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
  };
}

/**
 * 获取单封邮件正文
 * @param {object} account - 邮箱账户对象
 * @param {number} uid - 邮件 UID
 * @returns {Promise<{text: string, html: string}>}
 */
async function fetchBody(account, uid) {
  const proxyConfig = getProxyForAccount(account);

  try {
    const imapConfig = buildImapConfig(account, proxyConfig);
    const connection = await imaps.connect(imapConfig);
    await connection.openBox('INBOX');

    // 搜索指定 UID 的邮件
    const searchCriteria = [['UID', `${uid}:${uid}`]];
    const fetchOptions = {
      bodies: [''],
      markSeen: false,
      struct: true,
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    connection.end();

    if (messages.length === 0) {
      throw new Error('邮件不存在');
    }

    const msg = messages[0];
    const allPart = msg.parts.find(p => p.which === '');
    if (!allPart) {
      throw new Error('无法获取邮件内容');
    }

    const parsed = await simpleParser(allPart.body);

    return {
      text: parsed.text || '',
      html: parsed.html || '',
      subject: parsed.subject || '',
      from: parsed.from?.text || '',
      to: parsed.to?.text || '',
      date: parsed.date?.toISOString() || '',
    };
  } catch (err) {
    console.error(`[MAIL] fetchBody error for ${account.email} UID ${uid}:`, err.message);
    throw err;
  }
}

/**
 * 获取连接池状态
 */
function getPoolStatus() {
  const status = {};
  for (const [id, pool] of connectionPool) {
    status[id] = {
      email: pool.account.email,
      status: pool.status,
    };
  }
  return status;
}

module.exports = {
  startAll,
  stopAll,
  testConnection,
  restartAccount,
  fetchRecent,
  fetchBody,
  getPoolStatus,
  emailEmitter,
};
