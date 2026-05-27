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
const { getDB } = require('../models/db');
const { createProxyAgent } = require('./proxyService');
const { processNotification } = require('./notificationService');
const config = require('../config');

// 连接池: Map<accountId, { connection, timer, status }>
const connectionPool = new Map();

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
      tls: account.ssl !== false,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: config.imapConnectTimeout,
      connTimeout: config.imapConnectTimeout,
    },
  };

  // 如果有代理，使用代理 agent
  if (proxyConfig && proxyConfig.enabled) {
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
 * 连接单个邮箱并轮询新邮件
 */
async function connectAndPoll(account) {
  const db = getDB();
  const proxyConfig = getProxyForAccount(account);

  try {
    console.log(`[MAIL] Connecting to ${account.email} (${account.imapHost})...`);

    const imapConfig = buildImapConfig(account, proxyConfig);
    const connection = await imaps.connect(imapConfig);

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

    // 记录已处理的邮件 UID，避免重复
    const processedUIDs = new Set();

    // 获取最近的邮件 UID
    const searchCriteria = ['ALL'];
    const fetchOptions = {
      bodies: ['HEADER', 'TEXT', ''],
      markSeen: false,
      struct: true,
    };

    // 首次加载：只标记当前最新 UID，不触发通知
    const initialMessages = await connection.search(searchCriteria, fetchOptions);
    if (initialMessages.length > 0) {
      const maxUID = Math.max(...initialMessages.map(m => m.attributes.uid));
      processedUIDs.add(maxUID);
      console.log(`[MAIL] ${account.email}: Initial scan, latest UID=${maxUID}`);
    }

    // 定时轮询
    const pollInterval = Math.max(config.mailPollInterval, 30000); // 最少30秒
    const timer = setInterval(async () => {
      try {
        const messages = await connection.search(searchCriteria, fetchOptions);
        const newMessages = messages.filter(m => !processedUIDs.has(m.attributes.uid));

        for (const msg of newMessages) {
          processedUIDs.add(msg.attributes.uid);

          // 解析邮件内容
          const all = msg.parts.find(p => p.which === '');
          if (!all) continue;

          const parsed = await simpleParser(all.body);

          const emailData = {
            subject: parsed.subject || '(无主题)',
            senderName: parsed.from?.value?.[0]?.name || parsed.from?.value?.[0]?.address || '未知',
            senderEmail: parsed.from?.value?.[0]?.address || 'unknown',
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
 * 测试邮箱连接
 */
async function testConnection(accountData, proxyConfig) {
  try {
    const imapConfig = buildImapConfig(accountData, proxyConfig);
    const connection = await imaps.connect(imapConfig);
    await connection.openBox('INBOX');
    connection.end();
    return { success: true, message: '邮箱连接测试成功' };
  } catch (err) {
    return { success: false, error: err.message || '连接失败' };
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
 * 拉取最近邮件（分页）
 * @param {object} account - 邮箱账户对象
 * @param {number} page - 页码（从1开始）
 * @param {number} pageSize - 每页数量
 * @returns {Promise<{emails: Array, pagination: object}>}
 */
async function fetchRecent(account, page = 1, pageSize = 10) {
  const proxyConfig = getProxyForAccount(account);

  try {
    const imapConfig = buildImapConfig(account, proxyConfig);
    const connection = await imaps.connect(imapConfig);
    await connection.openBox('INBOX');

    // 搜索所有邮件
    const searchCriteria = ['ALL'];
    const fetchOptions = {
      bodies: ['HEADER'],
      markSeen: false,
      struct: false,
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    connection.end();

    // 按 UID 降序排序（最新的在前）
    messages.sort((a, b) => b.attributes.uid - a.attributes.uid);

    // 计算分页
    const total = messages.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, total);
    const pageMessages = messages.slice(startIndex, endIndex);

    // 解析邮件头
    const emails = [];
    for (const msg of pageMessages) {
      try {
        const headerPart = msg.parts.find(p => p.which === 'HEADER');
        if (!headerPart) continue;

        const parsed = await simpleParser(headerPart.body);

        emails.push({
          uid: msg.attributes.uid,
          id: `${account.id}_${msg.attributes.uid}`,
          fromName: parsed.from?.value?.[0]?.name || '',
          fromAddress: parsed.from?.value?.[0]?.address || '',
          to: parsed.to?.value?.[0]?.address || account.email,
          subject: parsed.subject || '(无主题)',
          snippet: '',
          date: parsed.date?.toISOString() || new Date().toISOString(),
          hasAttachments: false,
          attachmentsCount: 0,
        });
      } catch (parseErr) {
        console.error('[MAIL] Parse header error:', parseErr.message);
      }
    }

    return {
      emails,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    };
  } catch (err) {
    console.error(`[MAIL] fetchRecent error for ${account.email}:`, err.message);
    throw err;
  }
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
};
