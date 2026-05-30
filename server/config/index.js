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

  // IMAP IDLE mode config
  // Safety poll interval (ms): fallback when IDLE disconnects, default 5 min
  safetyPollInterval: parseInt(process.env.SAFETY_POLL_INTERVAL || '300000', 10),
  // IDLE reissue interval (ms): re-issue IDLE before server timeout (RFC < 29 min)
  idleReissueInterval: parseInt(process.env.IDLE_REISSUE_INTERVAL || '1740000', 10),
  // Reconnect base delay (ms): first reconnect wait (0-5s jitter added)
  reconnectBaseDelay: parseInt(process.env.RECONNECT_BASE_DELAY || '30000', 10),
  // Background sync interval (ms): periodically re-scan INBOX as IDLE fallback, 0 to disable
  backgroundSyncInterval: parseInt(process.env.BACKGROUND_SYNC_INTERVAL || '0', 10),
};
