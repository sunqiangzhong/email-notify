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

const app = express();

app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  const ts = new Date().toISOString();
  console.log('[' + ts + '] ' + req.method + ' ' + req.url);
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/emails', emailsRoutes);
app.use('/api/proxies', proxiesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/system/connectivity', connectivityRoutes);
app.use('/api/admin', adminRoutes);

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

    await seedAdmin();
    console.log('[AUTH] Default admin user ready');

    await mailService.startAll();
    console.log('[MAIL] Email polling engine started');

    app.listen(config.port, '0.0.0.0', () => {
      console.log('[SERVER] Mul-Email Server running on port ' + config.port);
      console.log('[SERVER] Data directory: ' + config.dataDir);
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
