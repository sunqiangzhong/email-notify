/**
 * 数据库层 - 基于 lowdb 的 JSON 文件存储
 *
 * 数据结构:
 *   users:         [{ id, username, password, name, email, avatarColor, role, disabled, status, createdAt }]
 *   accounts:      [{ id, userId, email, password, type, status, imapHost, imapPort, ssl, lastChecked, enabled }]
 *   proxies:       [{ id, userId, name, type, host, port, username, password, createdAt, updatedAt }]
 *   notifications: [{ id, userId, name, type, config, active, createdAt, updatedAt }]
 *   filters:       [{ id, userId, name, emailId, notificationId, keywords, matchType, active, createdAt, updatedAt }]
 *   emailLogs:     [{ id, userId, accountId, subject, senderName, senderEmail, toEmail, receivedAt, forwardStatus, forwardTarget, errorDetails, snippet }]
 *   accountEmails: [{ id, accountId, userId, uid, fromName, fromAddress, to, subject, date, hasAttachments, attachmentsCount, fetchedAt }]
 */

const path = require('path');
const fs = require('fs');
const config = require('../config');

let db = null;

const defaultData = {
  users: [],
  accounts: [],
  proxies: [],
  notifications: [],
  filters: [],
  emailLogs: [],
  accountEmails: [],
};

async function initDB() {
  fs.mkdirSync(config.dataDir, { recursive: true });

  const dbPath = path.join(config.dataDir, 'db.json');

  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify(defaultData, null, 2), 'utf-8');
    console.log('[DB] Created new database at ' + dbPath);
  }

  const { Low } = await import('lowdb');
  const { JSONFile } = await import('lowdb/node');

  const adapter = new JSONFile(dbPath);
  db = new Low(adapter);

  await db.read();

  if (!db.data) {
    db.data = Object.assign({}, defaultData);
  }

  for (const key of Object.keys(defaultData)) {
    if (!db.data[key]) {
      db.data[key] = defaultData[key];
    }
  }

  if (db.data.wechatConfigs && db.data.wechatConfigs.length > 0) {
    console.log('[DB] Migrating wechatConfigs to notifications...');
    for (const wc of db.data.wechatConfigs) {
      const existing = db.data.notifications.find(function(n) { return n.userId === wc.userId; });
      if (!existing) {
        db.data.notifications.push({
          id: wc.id || require('uuid').v4(),
          userId: wc.userId,
          name: '\u4f01\u4e1a\u5fae\u4fe1\u901a\u77e5',
          type: 'wecom_app',
          config: {
            corpId: '',
            agentId: '',
            appSecret: '',
            webhookUrl: wc.webhookUrl || '',
            sendKey: wc.token || '',
          },
          active: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }
    delete db.data.wechatConfigs;
  }

  await db.write();
  console.log('[DB] Loaded database from ' + dbPath);
  return db;
}

function getDB() {
  if (!db) {
    throw new Error('Database not initialized. Call initDB() first.');
  }
  return db;
}

module.exports = { initDB, getDB };
