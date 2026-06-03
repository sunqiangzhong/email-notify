/**
 * 数据库层 - MySQL 存储 (兼容 lowdb API)
 *
 * 所有表数据加载到内存, db.data.tableName 访问, db.write() 同步到 MySQL.
 * 并发写入通过队列串行化, 不会损坏数据.
 */

const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

const TABLES = ['users', 'accounts', 'proxies', 'notifications', 'filters', 'emailLogs', 'accountEmails', 'settings'];

const JSON_COLUMNS = {
  notifications: ['config'],
  filters: ['keywords'],
};

let pool = null;
let db = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: parseInt(process.env.MYSQL_PORT || '3306', 10),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || 'mul_email_pass',
      database: process.env.MYSQL_DATABASE || 'mul_email',
      waitForConnections: true,
      connectionLimit: 10,
      charset: 'utf8mb4',
      connectTimeout: 10000,
    });
  }
  return pool;
}

// Serializes concurrent writes
let writeQueue = Promise.resolve();

function makeTracked(arr, tableName, dirtySet) {
  // 脏行追踪：只重写实际变更的行
  arr._dirtyRows = new Set();
  const mutatingMethods = ['push', 'splice', 'pop', 'shift', 'unshift', 'sort', 'reverse', 'fill'];
  for (const m of mutatingMethods) {
    const original = arr[m].bind(arr);
    arr[m] = function (...args) {
      dirtySet.add(tableName);
      arr._dirtyRows.add('*'); // 结构性变更，标记全量写入
      return original(...args);
    };
  }
  return arr;
}

/**
 * 标记某一行已修改（供外部调用，如 db.data.accounts[i].name = 'x' 后手动标记）
 */
function markRowDirty(arr, index) {
  if (arr._dirtyRows) arr._dirtyRows.add(index);
}

async function initSchema() {
  const conn = getPool();
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  // Strip comment lines first, then split by semicolons
  const cleaned = schema.replace(/^--.*$/gm, '');
  const statements = cleaned.split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of statements) {
    try {
      await conn.query(stmt);
    } catch (err) {
      if (err.errno !== 1050 && !err.message.includes('Duplicate')) {
        console.error('[DB] Schema error:', err.message);
      }
    }
  }
}

/**
 * 为已有表添加唯一约束
 * 先清理重复数据，再添加约束
 */
async function addUniqueConstraints() {
  const conn = getPool();

  // accounts 表：email 唯一
  try {
    // 先清理重复邮箱（保留 id 最大的）
    await conn.query(`
      DELETE a1 FROM accounts a1
      INNER JOIN accounts a2
      WHERE a1.email = a2.email AND a1.id < a2.id
    `);
    await conn.query('ALTER TABLE `accounts` ADD UNIQUE INDEX `uk_accounts_email` (`email`)');
    console.log('[DB] 添加唯一约束: accounts.email');
  } catch (err) {
    if (err.errno !== 1061) { // 1061 = Duplicate key name (已存在)
      // 1062 = Duplicate entry (还有重复数据)
      if (err.errno === 1062) {
        console.warn('[DB] accounts 表仍有重复邮箱，跳过添加约束');
      }
    }
  }

  // notifications 表：userId + type 唯一
  try {
    await conn.query(`
      DELETE n1 FROM notifications n1
      INNER JOIN notifications n2
      WHERE n1.userId = n2.userId AND n1.type = n2.type AND n1.id < n2.id
    `);
    await conn.query('ALTER TABLE `notifications` ADD UNIQUE INDEX `uk_notifications_user_type` (`userId`, `type`)');
    console.log('[DB] 添加唯一约束: notifications(userId, type)');
  } catch (err) {
    if (err.errno !== 1061) {
      if (err.errno === 1062) {
        console.warn('[DB] notifications 表仍有重复数据，跳过添加约束');
      }
    }
  }
}

// 大表启动时最多加载的行数（防止启动时 OOM）
const MAX_LOAD_ROWS = {
  emailLogs: 10000,
  accountEmails: 10000,
};
// 大表排序列（用于限制加载行数）
const LOAD_ORDER_BY = {
  emailLogs: 'receivedAt',
  accountEmails: 'date',
};

async function loadAll() {
  const conn = getPool();
  const data = {};
  const dirty = new Set();
  for (const table of TABLES) {
    try {
      // 对大表限制加载行数，防止启动时内存暴涨
      const limit = MAX_LOAD_ROWS[table];
      let sql;
      if (limit) {
        const orderCol = LOAD_ORDER_BY[table] || 'createdAt';
        sql = 'SELECT * FROM `' + table + '` ORDER BY COALESCE(`' + orderCol + '`, \'2000-01-01\') DESC LIMIT ' + limit;
      } else {
        sql = 'SELECT * FROM `' + table + '`';
      }
      const [rows] = await conn.query(sql);
      const jsonCols = JSON_COLUMNS[table] || [];
      for (const row of rows) {
        for (const col of jsonCols) {
          if (row[col] && typeof row[col] === 'string') {
            try { row[col] = JSON.parse(row[col]); } catch (_) {}
          }
        }
      }
      data[table] = makeTracked(rows, table, dirty);
    } catch (err) {
      if (err.code === 'ER_NO_SUCH_TABLE') {
        data[table] = makeTracked([], table, dirty);
      } else {
        throw err;
      }
    }
  }
  return { data, dirty };
}

// 将 ISO datetime 转换为 MySQL datetime 格式
function toMySQLDatetime(val) {
  if (!val || typeof val !== 'string') return val;
  // 处理 ISO 8601 格式 (2026-05-30T14:56:01.342Z)
  if (val.includes('T') && val.includes('Z')) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 19).replace('T', ' ');
    }
  }
  return val;
}

// datetime 类型的列
const DATETIME_COLUMNS = ['createdAt', 'updatedAt', 'lastSync', 'date', 'receivedAt', 'fetchedAt'];

async function flushToMySQL(data, dirty) {
  if (dirty.size === 0) return;
  const conn = getPool();
  const tablesToFlush = [...dirty];
  dirty.clear();

  for (const table of tablesToFlush) {
    const rows = data[table];
    const jsonCols = JSON_COLUMNS[table] || [];
    const dirtyRows = rows._dirtyRows;
    const isFullFlush = !dirtyRows || dirtyRows.has('*');
    if (dirtyRows) dirtyRows.clear();

    if (rows.length === 0) {
      try { await conn.query('TRUNCATE TABLE `' + table + '`'); } catch (_) {}
      continue;
    }

    // settings 表只有 key, value, updatedAt 三个字段，过滤掉其他字段
    let columns = Object.keys(rows[0]);
    if (table === 'settings') {
      columns = columns.filter(c => ['key', 'value', 'updatedAt'].includes(c));
    }
    const colList = columns.map(c => '`' + c + '`').join(',');

    // 决定要写入的行：全量 or 仅脏行
    let rowsToWrite;
    if (isFullFlush) {
      rowsToWrite = rows;
    } else {
      rowsToWrite = [...dirtyRows].filter(i => typeof i === 'number' && i >= 0 && i < rows.length).map(i => rows[i]);
      if (rowsToWrite.length === 0) continue;
    }

    const chunkSize = 100;

    for (let i = 0; i < rowsToWrite.length; i += chunkSize) {
      const chunk = rowsToWrite.slice(i, i + chunkSize);
      if (chunk.length === 0) continue;

      const placeholders = chunk.map(() => '(' + columns.map(() => '?').join(',') + ')').join(',');
      const values = [];
      for (const row of chunk) {
        for (const col of columns) {
          let val = row[col];
          if (jsonCols.includes(col) && val !== null && val !== undefined) {
            val = JSON.stringify(val);
          }
          // 转换 datetime 格式
          if (DATETIME_COLUMNS.includes(col)) {
            val = toMySQLDatetime(val);
          }
          values.push(val === undefined ? null : val);
        }
      }

      try {
        await conn.query('REPLACE INTO `' + table + '` (' + colList + ') VALUES ' + placeholders, values);
      } catch (err) {
        console.error('[DB] Write error for ' + table + ':', err.message);
        dirty.add(table);
      }
    }
  }
}

// 每个用户的最大日志条数
// 每个账户的最大缓存邮件数
const MAX_EMAIL_LOGS_PER_USER = parseInt(process.env.MAX_EMAIL_LOGS_PER_USER || '1000', 10);
const MAX_ACCOUNT_EMAILS_PER_ACCOUNT = parseInt(process.env.MAX_ACCOUNT_EMAILS_PER_ACCOUNT || '500', 10);
const DATA_PRUNE_INTERVAL = parseInt(process.env.DATA_PRUNE_INTERVAL || String(30 * 60 * 1000), 10);
let isPruning = false;

function exceedsOwnerLimit(rows, ownerKey, limit) {
  const counts = new Map();
  for (const row of rows) {
    const owner = row[ownerKey] || 'unknown';
    const next = (counts.get(owner) || 0) + 1;
    if (next > limit) return true;
    counts.set(owner, next);
  }
  return false;
}

function shouldPruneAfterWrite(tableNames, data) {
  const names = tableNames.length > 0 ? tableNames : ['emailLogs', 'accountEmails'];
  if (names.includes('emailLogs') && exceedsOwnerLimit(data.emailLogs, 'userId', MAX_EMAIL_LOGS_PER_USER)) {
    return true;
  }
  if (names.includes('accountEmails') && exceedsOwnerLimit(data.accountEmails, 'accountId', MAX_ACCOUNT_EMAILS_PER_ACCOUNT)) {
    return true;
  }
  return false;
}

/**
 * 清理过期数据，防止内存无限增长
 * 在启动时和定期任务中调用
 */
async function pruneOldData(data, dirty) {
  let prunedLogs = 0;
  let prunedEmails = 0;

  // 1. 清理 emailLogs：每个用户只保留最近 N 条
  const logsByUser = {};
  for (const log of data.emailLogs) {
    const uid = log.userId || 'unknown';
    if (!logsByUser[uid]) logsByUser[uid] = [];
    logsByUser[uid].push(log);
  }
  let needPruneLogs = false;
  for (const logs of Object.values(logsByUser)) {
    if (logs.length > MAX_EMAIL_LOGS_PER_USER) { needPruneLogs = true; break; }
  }
  if (needPruneLogs) {
    const beforeLen = data.emailLogs.length;
    const newLogs = [];
    for (const logs of Object.values(logsByUser)) {
      if (logs.length > MAX_EMAIL_LOGS_PER_USER) {
        logs.sort((a, b) => new Date(b.receivedAt || b.createdAt || 0).getTime() - new Date(a.receivedAt || a.createdAt || 0).getTime());
        newLogs.push(...logs.slice(0, MAX_EMAIL_LOGS_PER_USER));
      } else {
        newLogs.push(...logs);
      }
    }
    data.emailLogs = makeTracked(newLogs, 'emailLogs', dirty);
    dirty.add('emailLogs');
    prunedLogs = beforeLen - newLogs.length;
  }

  // 2. 清理 accountEmails：每个账户只保留最近 N 条
  const emailsByAccount = {};
  for (const email of data.accountEmails) {
    const aid = email.accountId || 'unknown';
    if (!emailsByAccount[aid]) emailsByAccount[aid] = [];
    emailsByAccount[aid].push(email);
  }
  let needPruneEmails = false;
  for (const emails of Object.values(emailsByAccount)) {
    if (emails.length > MAX_ACCOUNT_EMAILS_PER_ACCOUNT) { needPruneEmails = true; break; }
  }
  if (needPruneEmails) {
    const beforeLen = data.accountEmails.length;
    const newEmails = [];
    for (const emails of Object.values(emailsByAccount)) {
      if (emails.length > MAX_ACCOUNT_EMAILS_PER_ACCOUNT) {
        emails.sort((a, b) => new Date(b.date || b.fetchedAt || 0).getTime() - new Date(a.date || a.fetchedAt || 0).getTime());
        newEmails.push(...emails.slice(0, MAX_ACCOUNT_EMAILS_PER_ACCOUNT));
      } else {
        newEmails.push(...emails);
      }
    }
    data.accountEmails = makeTracked(newEmails, 'accountEmails', dirty);
    dirty.add('accountEmails');
    prunedEmails = beforeLen - newEmails.length;
  }

  if (prunedLogs > 0 || prunedEmails > 0) {
    console.log(`[DB] 数据清理: 移除 ${prunedLogs} 条过期日志, ${prunedEmails} 条过期邮件缓存`);

    // 同步清理 MySQL 中的过期数据（TRUNCATE 后由下次 flushToMySQL 重新写入保留的数据）
    const conn = getPool();
    if (prunedLogs > 0) {
      try {
        await conn.query('TRUNCATE TABLE `emailLogs`');
        dirty.add('emailLogs');
        if (data.emailLogs._dirtyRows) data.emailLogs._dirtyRows.add('*');
      } catch (err) {
        console.error('[DB] 清理 MySQL emailLogs 失败:', err.message);
      }
    }
    if (prunedEmails > 0) {
      try {
        await conn.query('TRUNCATE TABLE `accountEmails`');
        dirty.add('accountEmails');
        if (data.accountEmails._dirtyRows) data.accountEmails._dirtyRows.add('*');
      } catch (err) {
        console.error('[DB] 清理 MySQL accountEmails 失败:', err.message);
      }
    }
  }
}

async function initDB() {
  const conn = getPool();

  // Wait for MySQL to be ready (retry up to 30s)
  let ready = false;
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      await conn.query('SELECT 1');
      ready = true;
      break;
    } catch (err) {
      console.log('[DB] Waiting for MySQL... (attempt ' + attempt + '/30)');
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  if (!ready) {
    throw new Error('MySQL not reachable after 30 attempts');
  }
  console.log('[DB] Connected to MySQL');

  await initSchema();
  console.log('[DB] Schema ready');

  // 添加唯一约束（去重后再加，避免已有重复数据导致失败）
  await addUniqueConstraints();

  const { data, dirty } = await loadAll();
  console.log('[DB] Loaded: ' + TABLES.map(t => t + '=' + data[t].length).join(', '));

  // 启动时自动去重
  let dedupCount = 0;
  let settingsFixCount = 0;

  for (const setting of data.settings) {
    if (!setting.id) {
      setting.id = uuidv4();
      settingsFixCount++;
    }
    if (!setting.userId) {
      setting.userId = 'system';
      settingsFixCount++;
    }
    if (!setting.createdAt) {
      setting.createdAt = setting.updatedAt || new Date().toISOString();
      settingsFixCount++;
    }
  }

  // 邮箱账户去重（同一邮箱只保留最新的）
  const seenEmails = new Map();
  for (let i = data.accounts.length - 1; i >= 0; i--) {
    const acc = data.accounts[i];
    if (seenEmails.has(acc.email)) {
      data.accounts.splice(i, 1);
      dedupCount++;
    } else {
      seenEmails.set(acc.email, i);
    }
  }

  // 通知渠道去重（同一类型只保留最新的）
  const seenTypes = new Map();
  for (let i = data.notifications.length - 1; i >= 0; i--) {
    const notif = data.notifications[i];
    if (seenTypes.has(notif.type)) {
      data.notifications.splice(i, 1);
      dedupCount++;
    } else {
      seenTypes.set(notif.type, i);
    }
  }

  if (dedupCount > 0) {
    console.log(`[DB] 自动去重: 移除 ${dedupCount} 条重复数据`);
    dirty.add('accounts');
    dirty.add('notifications');
  }

  if (settingsFixCount > 0) {
    console.log(`[DB] 修复 settings 记录: ${settingsFixCount} 处缺失字段`);
    dirty.add('settings');
  }

  // 启动时清理过期数据，防止内存无限增长
  await pruneOldData(data, dirty);

  // Build the db object that getDB() returns — same shape as lowdb
  db = {
    data,
    write: async (...tableNames) => {
      for (const table of tableNames) {
        if (table && TABLES.includes(table)) {
          dirty.add(table);
        }
      }
      await flushToMySQL(data, dirty);

      if (!isPruning && shouldPruneAfterWrite(tableNames, data)) {
        isPruning = true;
        try {
          await pruneOldData(data, dirty);
          await flushToMySQL(data, dirty);
        } finally {
          isPruning = false;
        }
      }
    }
  };

  // 定时清理过期数据（每 6 小时执行一次）
  setInterval(async () => {
    try {
      await pruneOldData(data, dirty);
      await flushToMySQL(data, dirty);
    } catch (err) {
      console.error('[DB] 定时清理失败:', err.message);
    }
  }, DATA_PRUNE_INTERVAL);

  return db;
}

function getDB() {
  if (!db) throw new Error('Database not initialized. Call initDB() first.');
  return db;
}

module.exports = { initDB, getDB, pruneOldData, markRowDirty };
