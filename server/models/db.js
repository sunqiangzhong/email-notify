/**
 * 数据库层 - 基于 lowdb 的 JSON 文件存储
 * 
 * 数据结构:
 *   users:     [{ id, username, password, name, email, avatarColor, role, disabled, status, createdAt }]
 *   accounts:  [{ id, userId, email, password, type, status, imapHost, imapPort, ssl, lastChecked, enabled }]
 *   proxies:   [{ id, userId, enabled, type, host, port, username, password }]
 *   wechatConfigs: [{ id, userId, provider, token, secret, webhookUrl, rules }]
 *   emailLogs: [{ id, userId, accountId, subject, senderName, senderEmail, toEmail, receivedAt, forwardStatus, forwardTarget, errorDetails, snippet }]
 */

const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const path = require('path');
const fs = require('fs');
const config = require('../config');

let db = null;

const defaultData = {
  users: [],
  accounts: [],
  proxies: [],
  wechatConfigs: [],
  emailLogs: [],
};

async function initDB() {
  // Ensure data directory exists
  fs.mkdirSync(config.dataDir, { recursive: true });

  const dbPath = path.join(config.dataDir, 'db.json');

  // If DB file doesn't exist, create it with defaults
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify(defaultData, null, 2), 'utf-8');
    console.log(`[DB] Created new database at ${dbPath}`);
  }

  const adapter = new JSONFile(dbPath);
  db = new Low(adapter);

  await db.read();

  // Ensure data is not null (lowdb can return null for corrupt files)
  if (!db.data) {
    db.data = { ...defaultData };
  }

  // Ensure all collections exist (for schema upgrades)
  for (const key of Object.keys(defaultData)) {
    if (!db.data[key]) {
      db.data[key] = defaultData[key];
    }
  }

  await db.write();
  console.log(`[DB] Loaded database from ${dbPath}`);
  return db;
}

function getDB() {
  if (!db) {
    throw new Error('Database not initialized. Call initDB() first.');
  }
  return db;
}

module.exports = { initDB, getDB };
