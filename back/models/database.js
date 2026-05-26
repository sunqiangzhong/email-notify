/**
 * 数据库模块 - 使用 lowdb + JSON 文件存储
 * 所有数据持久化到 /app/data/*.json
 */
const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const config = require('../config');

const dataDir = config.dataDir;

// 确保数据目录存在
const fs = require('fs');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 用户数据库
const usersAdapter = new FileSync(path.join(dataDir, 'users.json'));
const usersDb = low(usersAdapter);
usersDb.defaults({ users: [] }).write();

// 邮箱数据库
const emailsAdapter = new FileSync(path.join(dataDir, 'emails.json'));
const emailsDb = low(emailsAdapter);
emailsDb.defaults({ emails: [] }).write();

// 代理数据库
const proxiesAdapter = new FileSync(path.join(dataDir, 'proxies.json'));
const proxiesDb = low(proxiesAdapter);
proxiesDb.defaults({ proxies: [] }).write();

// 通知配置数据库
const notificationsAdapter = new FileSync(path.join(dataDir, 'notifications.json'));
const notificationsDb = low(notificationsAdapter);
notificationsDb.defaults({ notifications: [] }).write();

// 过滤规则数据库
const filtersAdapter = new FileSync(path.join(dataDir, 'filters.json'));
const filtersDb = low(filtersAdapter);
filtersDb.defaults({ filters: [] }).write();

module.exports = {
  usersDb,
  emailsDb,
  proxiesDb,
  notificationsDb,
  filtersDb,
};
