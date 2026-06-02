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
  const mutatingMethods = ['push', 'splice', 'pop', 'shift', 'unshift', 'sort', 'reverse', 'fill'];
  for (const m of mutatingMethods) {
    const original = arr[m].bind(arr);
    arr[m] = function (...args) {
      dirtySet.add(tableName);
      return original(...args);
    };
  }
  return arr;
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

async function loadAll() {
  const conn = getPool();
  const data = {};
  const dirty = new Set();
  for (const table of TABLES) {
    try {
      const [rows] = await conn.query('SELECT * FROM `' + table + '`');
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

    if (rows.length === 0) {
      try { await conn.query('TRUNCATE TABLE `' + table + '`'); } catch (_) {}
      continue;
    }

    const columns = Object.keys(rows[0]);
    const colList = columns.map(c => '`' + c + '`').join(',');
    const chunkSize = 100;

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
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

  // Build the db object that getDB() returns — same shape as lowdb
  db = {
    data,
    write: (...tableNames) => {
      for (const table of tableNames) {
        if (table && TABLES.includes(table)) {
          dirty.add(table);
        }
      }
      return flushToMySQL(data, dirty);
    }
  };
  return db;
}

function getDB() {
  if (!db) throw new Error('Database not initialized. Call initDB() first.');
  return db;
}

module.exports = { initDB, getDB };
