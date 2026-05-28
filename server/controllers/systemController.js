/**
 * 系统诊断控制器
 */
const os = require('os');
const fs = require('fs');
const path = require('path');
const tcpPing = require('tcp-ping');
const config = require('../config');
const mailService = require('../services/mailService');
const { emitter: logEmitter, getRecentLogs } = require('../services/logEmitter');

/**
 * 获取 TCP ping 延迟
 */
function pingHost(host, port = 443) {
  return new Promise((resolve) => {
    tcpPing.ping({ address: host, port, timeout: 5000, attempts: 3 }, (err, data) => {
      if (err) {
        resolve({ host, port, latency: -1, error: err.message });
      } else {
        const avg = data.results && data.results.length > 0
          ? Math.round(data.results.reduce((sum, r) => sum + (r.time || 0), 0) / data.results.length)
          : -1;
        resolve({
          host,
          port,
          latency: avg,
          max: data.max ? Math.round(data.max) : null,
          min: data.min ? Math.round(data.min) : null,
        });
      }
    });
  });
}

/**
 * GET /api/system/status
 * 系统运行状态
 */
async function getStatus(req, res, next) {
  try {
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();

    // 检查数据目录读写权限
    let dataDirWritable = false;
    let dataDirExists = false;
    try {
      dataDirExists = fs.existsSync(config.dataDir);
      if (dataDirExists) {
        fs.accessSync(config.dataDir, fs.constants.R_OK | fs.constants.W_OK);
        dataDirWritable = true;
      }
    } catch (e) {
      // not writable
    }

    // 获取连接池状态
    const mailPool = mailService.getPoolStatus();

    res.json({
      uptime: Math.round(uptime),
      uptimeFormatted: formatUptime(uptime),
      memory: {
        rss: formatBytes(memUsage.rss),
        heapUsed: formatBytes(memUsage.heapUsed),
        heapTotal: formatBytes(memUsage.heapTotal),
        external: formatBytes(memUsage.external),
        rssBytes: memUsage.rss,
        heapUsedBytes: memUsage.heapUsed,
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        cpuCount: os.cpus().length,
        totalMemory: formatBytes(os.totalmem()),
        freeMemory: formatBytes(os.freemem()),
        loadAvg: os.loadavg().map(l => l.toFixed(2)),
      },
      dataDir: {
        path: config.dataDir,
        exists: dataDirExists,
        writable: dataDirWritable,
      },
      mailPool: {
        activeConnections: Object.keys(mailPool).length,
        connections: mailPool,
      },
      version: '1.0.0',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/system/ping
 * 网络诊断: ping 邮箱服务器和微信 API
 */
async function pingDiagnostics(req, res, next) {
  try {
    const targets = [
      { name: 'QQ邮箱 IMAP', host: 'imap.qq.com', port: 993 },
      { name: 'Gmail IMAP', host: 'imap.gmail.com', port: 993 },
      { name: 'Outlook IMAP', host: 'imap-mail.outlook.com', port: 993 },
      { name: 'Server酱 API', host: 'sctapi.ftqq.com', port: 443 },
      { name: '企业微信 API', host: 'qyapi.weixin.qq.com', port: 443 },
      { name: 'PushDeer API', host: 'api2.pushdeer.com', port: 443 },
    ];

    const results = await Promise.all(
      targets.map(t => pingHost(t.host, t.port).then(r => ({ ...t, ...r })))
    );

    res.json({
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (err) {
    next(err);
  }
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}天`);
  if (h > 0) parts.push(`${h}小时`);
  if (m > 0) parts.push(`${m}分钟`);
  if (s > 0 || parts.length === 0) parts.push(`${s}秒`);
  return parts.join(' ');
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * GET /api/system/logs
 * Server-Sent Events 实时日志流
 */
function streamLogs(req, res, next) {
  try {
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁用 nginx 缓冲
    res.flushHeaders();

    // 发送初始日志（最近缓冲区）
    const recentLogs = getRecentLogs();
    res.write(`event: init\ndata: ${JSON.stringify(recentLogs)}\n\n`);

    // 监听新日志事件
    const onLog = (entry) => {
      res.write(`event: log\ndata: ${JSON.stringify(entry)}\n\n`);
    };

    logEmitter.on('log', onLog);

    // 心跳：每 30 秒发送一次注释，防止连接被代理/负载均衡器断开
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30000);

    // 客户端断开连接时清理
    req.on('close', () => {
      logEmitter.removeListener('log', onLog);
      clearInterval(heartbeat);
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getStatus, pingDiagnostics, streamLogs };
