require('./services/logEmitter');

const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { initDB } = require('./models/db');
const { seedAdmin } = require('./services/seedService');
const mailService = require('./services/mailService');
const errorHandler = require('./middlewares/errorHandler');

const authRoutes = require('./routes/auth');
const emailsRoutes = require('./routes/emails');
const proxiesRoutes = require('./routes/proxies');
const notificationsRoutes = require('./routes/notifications');
const logsRoutes = require('./routes/logs');
const systemRoutes = require('./routes/system');
const adminRoutes = require('./routes/admin');
const connectivityRoutes = require('./routes/connectivity');
const tokenRoutes = require('./routes/token');
const updateRoutes = require('./routes/update');

const app = express();

app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// HTTP 请求日志（可通过环境变量 LOG_HTTP_REQUESTS=true 开启）
const LOG_HTTP_REQUESTS = process.env.LOG_HTTP_REQUESTS === 'true';
if (LOG_HTTP_REQUESTS) {
  app.use((req, _res, next) => {
    const ts = new Date().toISOString();
    console.log('[' + ts + '] ' + req.method + ' ' + req.url);
    next();
  });
}

app.use('/api/auth', authRoutes);
app.use('/api/emails', emailsRoutes);
app.use('/api/proxies', proxiesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/system/connectivity', connectivityRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/token', tokenRoutes);
app.use('/api/update', updateRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use(errorHandler);

async function bootstrap() {
  try {
    await initDB();
    console.log('[DB] Database initialized successfully');

    // 等待数据库完全加载配置（包括代理配置）
    console.log('[DB] Waiting for all configurations to load...');
    await new Promise(resolve => setTimeout(resolve, 500));

    await seedAdmin();
    console.log('[AUTH] Default admin user ready');

    // 验证代理配置已加载
    const { getDB } = require('./models/db');
    const db = getDB();
    const proxies = db.data.proxies || [];
    console.log('[PROXY] Loaded ' + proxies.length + ' proxy configuration(s)');

    if (proxies.length > 0) {
      proxies.forEach(p => {
        console.log('[PROXY] - ' + (p.name || p.type) + ': ' + p.host + ':' + p.port);
      });
    }

    // 启动邮件服务（内部会优先处理使用代理的账户）
    await mailService.startAll();
    console.log('[MAIL] Email polling engine started');

    // 注册企业微信自定义菜单
    try {
      const wechatCmd = require('./services/wechatCommandService');
      const wechatConfig = db.data.notifications.find(n => n.type === 'wecom_app' && n.active);
      if (wechatConfig && wechatConfig.config.corpId && wechatConfig.config.appSecret) {
        await wechatCmd.createMenus(wechatConfig.config);
        console.log('[WECHAT] 自定义菜单注册完成');
      }
    } catch (err) {
      console.error('[WECHAT] 菜单注册失败（不影响启动）:', err.message);
    }

    app.listen(config.port, '0.0.0.0', () => {
      console.log('[SERVER] Mul-Email Server running on port ' + config.port);
      console.log('[SERVER] Data directory: ' + config.dataDir);
      console.log('[SERVER] System ready!');
    });
  } catch (err) {
    console.error('[FATAL] Bootstrap failed:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  console.log('[SERVER] SIGTERM received, shutting down...');
  await mailService.stopAll();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[SERVER] SIGINT received, shutting down...');
  await mailService.stopAll();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('[SERVER] Uncaught exception (kept alive):', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[SERVER] Unhandled rejection (kept alive):', reason);
});

bootstrap();

module.exports = app;
