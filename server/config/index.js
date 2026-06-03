require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const path = require('path');

module.exports = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET || 'fallback-secret-change-me',
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123456',
    email: process.env.ADMIN_EMAIL || 'admin@system.local',
  },
  dataDir: path.resolve(__dirname, '..', process.env.DATA_DIR || './data'),
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim()),
  proxyTestTimeout: parseInt(process.env.PROXY_TEST_TIMEOUT || '10000', 10),
  imapConnectTimeout: parseInt(process.env.IMAP_CONNECT_TIMEOUT || '30000', 10),
  notificationTimeout: parseInt(process.env.NOTIFICATION_TIMEOUT || '15000', 10),

  // API 令牌（用于外部访问）
  apiToken: process.env.API_TOKEN || '',

  // IMAP IDLE mode config
  safetyPollInterval: parseInt(process.env.SAFETY_POLL_INTERVAL || '0', 10),
  idleReissueInterval: parseInt(process.env.IDLE_REISSUE_INTERVAL || '1740000', 10),
  reconnectBaseDelay: parseInt(process.env.RECONNECT_BASE_DELAY || '30000', 10),
  backgroundSyncInterval: parseInt(process.env.BACKGROUND_SYNC_INTERVAL || '0', 10),
};
