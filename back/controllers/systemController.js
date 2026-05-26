/**
 * 系统控制器
 * 提供系统状态和网络诊断接口
 */
const os = require('os');
const fs = require('fs');
const path = require('path');
const tcpPing = require('tcp-ping');
const config = require('../config');
const { getMonitorStatus } = require('../services/mailService');

/**
 * 获取系统运行状态
 * GET /api/system/status
 */
const getStatus = async (req, res) => {
  try {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    const dataDir = config.dataDir;

    // 检查数据目录读写权限
    let dataDirWritable = false;
    try {
      const testFile = path.join(dataDir, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      dataDirWritable = true;
    } catch (e) {
      dataDirWritable = false;
    }

    return res.json({
      success: true,
      code: 'STATUS_OK',
      message: '系统状态获取成功',
      data: {
        uptime: Math.floor(uptime),
        uptimeFormatted: formatUptime(uptime),
        memory: {
          total: formatBytes(os.totalmem()),
          free: formatBytes(os.freemem()),
          used: formatBytes(os.totalmem() - os.freemem()),
          usagePercent: ((1 - os.freemem() / os.totalmem()) * 100).toFixed(2),
          heapUsed: formatBytes(memoryUsage.heapUsed),
          heapTotal: formatBytes(memoryUsage.heapTotal),
          rss: formatBytes(memoryUsage.rss),
        },
        cpu: {
          cores: os.cpus().length,
          model: os.cpus()[0]?.model || 'Unknown',
          loadAvg: os.loadavg(),
        },
        platform: {
          os: os.platform(),
          arch: os.arch(),
          hostname: os.hostname(),
          nodeVersion: process.version,
        },
        dataDir: {
          path: dataDir,
          writable: dataDirWritable,
        },
        monitors: getMonitorStatus(),
      },
    });
  } catch (error) {
    console.error('获取系统状态错误:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
};

/**
 * 网络延迟测试
 * GET /api/system/ping
 */
const ping = async (req, res) => {
  try {
    const targets = [
      { name: 'QQ邮箱 IMAP', host: 'imap.qq.com', port: 993 },
      { name: 'Gmail IMAP', host: 'imap.gmail.com', port: 993 },
      { name: 'Server酱', host: 'sctapi.ftqq.com', port: 443 },
      { name: '企业微信', host: 'qyapi.weixin.qq.com', port: 443 },
    ];

    const results = await Promise.all(
      targets.map((target) => testTcpPing(target))
    );

    return res.json({
      success: true,
      code: 'PING_OK',
      message: '网络延迟测试完成',
      data: results,
    });
  } catch (error) {
    console.error('网络延迟测试错误:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
};

/**
 * TCP Ping 测试
 */
const testTcpPing = (target) => {
  return new Promise((resolve) => {
    tcpPing.ping(
      {
        address: target.host,
        port: target.port,
        timeout: 5000,
        attempts: 3,
      },
      (err, data) => {
        if (err) {
          resolve({
            name: target.name,
            host: target.host,
            port: target.port,
            success: false,
            error: err.message,
          });
        } else {
          resolve({
            name: target.name,
            host: target.host,
            port: target.port,
            success: true,
            avg: data.avg ? data.avg.toFixed(2) : null,
            min: data.min ? data.min.toFixed(2) : null,
            max: data.max ? data.max.toFixed(2) : null,
          });
        }
      }
    );
  });
};

/**
 * 格式化运行时间
 */
const formatUptime = (seconds) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分钟`);
  if (secs > 0) parts.push(`${secs}秒`);

  return parts.join(' ') || '0秒';
};

/**
 * 格式化字节数
 */
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

module.exports = {
  getStatus,
  ping,
};
