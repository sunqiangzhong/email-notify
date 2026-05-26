/**
 * 应用配置模块
 * 从环境变量读取所有敏感配置
 */
const path = require('path');
require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiresIn: '7d',
  },
  defaultAdmin: {
    username: process.env.DEFAULT_ADMIN_USER || 'admin',
    password: process.env.DEFAULT_ADMIN_PASS || 'admin123',
  },
  dataDir: path.resolve(process.env.DATA_DIR || './data'),
  logLevel: process.env.LOG_LEVEL || 'info',
};
