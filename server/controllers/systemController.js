/**
 * 系统诊断控制器
 */
const os = require('os');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const mailService = require('../services/mailService');
const {
  emitter: logEmitter,
  getRecentLogs,
  addFilterType,
  removeFilterType,
  addFilterPattern,
  setFilterEnabled,
  isFilterEnabled,
} = require('../services/logEmitter');
const { checkTcp, PRESET_TARGETS } = require('../services/connectivityService');

async function getStatus(req, res, next) {
  try {
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();

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

async function pingDiagnostics(req, res, next) {
  try {
    const targets = [
      ...PRESET_TARGETS.email,
      ...PRESET_TARGETS.notification,
    ];

    const results = await Promise.all(
      targets.map(async (t) => {
        const tcpResult = await checkTcp(t.host, t.port);
        return {
          name: t.name,
          host: t.host,
          port: t.port,
          success: tcpResult.reachable,
          latency: tcpResult.latency,
          error: tcpResult.reachable ? undefined : '连接超时',
        };
      })
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
  if (d > 0) parts.push(d + '天');
  if (h > 0) parts.push(h + '小时');
  if (m > 0) parts.push(m + '分钟');
  if (s > 0 || parts.length === 0) parts.push(s + '秒');
  return parts.join(' ');
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function streamLogs(req, res, next) {
  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const recentLogs = getRecentLogs();
    res.write('event: init\ndata: ' + JSON.stringify(recentLogs) + '\n\n');

    const onLog = (entry) => {
      res.write('event: log\ndata: ' + JSON.stringify(entry) + '\n\n');
    };

    logEmitter.on('log', onLog);

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30000);

    req.on('close', () => {
      logEmitter.removeListener('log', onLog);
      clearInterval(heartbeat);
    });
  } catch (err) {
    next(err);
  }
}

async function getLogFilterConfig(req, res, next) {
  try {
    res.json({
      enabled: isFilterEnabled(),
      // 可以添加更多配置返回
    });
  } catch (err) {
    next(err);
  }
}

async function updateLogFilterConfig(req, res, next) {
  try {
    const { enabled, addTypes, removeTypes } = req.body;

    if (typeof enabled === 'boolean') {
      setFilterEnabled(enabled);
    }

    if (Array.isArray(addTypes)) {
      addTypes.forEach(type => addFilterType(type));
    }

    if (Array.isArray(removeTypes)) {
      removeTypes.forEach(type => removeFilterType(type));
    }

    res.json({
      success: true,
      enabled: isFilterEnabled(),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getStatus, pingDiagnostics, streamLogs, getLogFilterConfig, updateLogFilterConfig };
