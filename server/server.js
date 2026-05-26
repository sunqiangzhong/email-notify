const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { initDB } = require('./models/db');
const { seedAdmin } = require('./services/seedService');
const mailService = require('./services/mailService');
const errorHandler = require('./middlewares/errorHandler');

// Route imports
const authRoutes = require('./routes/auth');
const accountsRoutes = require('./routes/accounts');
const proxyRoutes = require('./routes/proxy');
const wechatRoutes = require('./routes/wechat');
const logsRoutes = require('./routes/logs');
const systemRoutes = require('./routes/system');
const adminRoutes = require('./routes/admin');

const app = express();

// ──────────────────────────────────────────
// Middleware
// ──────────────────────────────────────────
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, _res, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.url}`);
  next();
});

// ──────────────────────────────────────────
// Routes
// ──────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/proxy', proxyRoutes);
app.use('/api/wechat', wechatRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/admin', adminRoutes);

// Health check (no auth required)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Global error handler
app.use(errorHandler);

// ──────────────────────────────────────────
// Bootstrap
// ──────────────────────────────────────────
async function bootstrap() {
  try {
    // 1. Initialize JSON database
    await initDB();
    console.log('[DB] Database initialized successfully');

    // 2. Seed default admin user
    await seedAdmin();
    console.log('[AUTH] Default admin user ready');

    // 3. Start email polling engine
    await mailService.startAll();
    console.log('[MAIL] Email polling engine started');

    // 4. Start HTTP server
    app.listen(config.port, '0.0.0.0', () => {
      console.log(`[SERVER] Mul-Email Server running on port ${config.port}`);
      console.log(`[SERVER] Data directory: ${config.dataDir}`);
    });
  } catch (err) {
    console.error('[FATAL] Bootstrap failed:', err);
    process.exit(1);
  }
}

// Graceful shutdown
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

bootstrap();

module.exports = app;
