/**
 * 多邮箱聚合与微信通知管理系统 - 后端入口
 */
const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
require('dotenv').config();

const config = require('./config');
const { initDefaultAdmin } = require('./controllers/authController');
const { startAllMonitors, stopAllMonitors } = require('./services/mailService');
const logEmitter = require('./services/logEmitter');

// 路由
const authRoutes = require('./routes/auth');
const emailRoutes = require('./routes/emails');
const proxyRoutes = require('./routes/proxies');
const notificationRoutes = require('./routes/notifications');
const systemRoutes = require('./routes/system');

const app = express();

// 中间件
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 请求日志
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (!req.path.includes('/api/logs')) { // 不打印日志轮询
      console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/proxies', proxyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/system', systemRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ success: true, code: 'HEALTHY', message: '服务运行正常', timestamp: new Date().toISOString() });
});

// 日志接口（REST 轮询用）
app.get('/api/logs', (req, res) => {
  const count = parseInt(req.query.count) || 50;
  res.json({ success: true, data: logEmitter.getRecent(count) });
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, code: 'NOT_FOUND', message: `接口不存在: ${req.method} ${req.originalUrl}` });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: '服务器内部错误' });
});

// ============ 启动 HTTP + WebSocket ============

const PORT = config.port;
const HOST = config.host;

const server = http.createServer(app);

// WebSocket 服务
const wss = new WebSocketServer({ server, path: '/ws/logs' });

wss.on('connection', (ws, req) => {
  console.log('[WS] 新的日志客户端连接');

  // 发送最近 20 条历史日志
  const recentLogs = logEmitter.getRecent(20);
  ws.send(JSON.stringify({ type: 'init', data: recentLogs }));

  // 实时推送新日志
  const onLog = (log) => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'log', data: log }));
    }
  };
  logEmitter.on('log', onLog);

  ws.on('close', () => {
    console.log('[WS] 日志客户端断开');
    logEmitter.off('log', onLog);
  });

  ws.on('error', () => {
    logEmitter.off('log', onLog);
  });
});

server.listen(PORT, HOST, async () => {
  console.log('='.repeat(50));
  console.log('多邮箱聚合与微信通知管理系统');
  console.log('='.repeat(50));
  console.log(`HTTP 服务: http://${HOST}:${PORT}`);
  console.log(`WebSocket: ws://${HOST}:${PORT}/ws/logs`);
  console.log(`数据目录: ${config.dataDir}`);
  console.log('='.repeat(50));

  await initDefaultAdmin();

  try {
    await startAllMonitors();
  } catch (error) {
    console.error('启动邮箱监听失败:', error);
  }
});

// 优雅关闭
const gracefulShutdown = async (signal) => {
  console.log(`\n收到 ${signal} 信号，开始优雅关闭...`);
  stopAllMonitors();
  wss.close();
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('未捕获的异常:', err);
  gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  console.error('未处理的 Promise 拒绝:', reason);
});

module.exports = app;
