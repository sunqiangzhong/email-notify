/**
 * 邮件日志控制器
 */
const { getDB } = require('../models/db');

/**
 * GET /api/logs
 * 获取当前用户的邮件日志
 */
async function getLogs(req, res, next) {
  try {
    const db = getDB();
    let logs = db.data.emailLogs.filter(l => l.userId === req.userId);

    // 按时间倒序
    logs.sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));

    // 分页
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const start = (page - 1) * limit;
    const end = start + limit;

    const total = logs.length;
    const items = logs.slice(start, end);

    res.json({
      total,
      page,
      limit,
      items,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/logs/stats
 * 获取日志统计
 */
async function getLogStats(req, res, next) {
  try {
    const db = getDB();
    const logs = db.data.emailLogs.filter(l => l.userId === req.userId);

    const total = logs.length;
    const forwarded = logs.filter(l => l.forwardStatus === 'forwarded').length;
    const failed = logs.filter(l => l.forwardStatus === 'failed').length;
    const sending = logs.filter(l => l.forwardStatus === 'sending').length;

    // 最近24小时
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last24h = logs.filter(l => new Date(l.receivedAt) > oneDayAgo).length;

    res.json({
      total,
      forwarded,
      failed,
      sending,
      last24h,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/logs/:id
 * 删除单条日志
 */
async function deleteLog(req, res, next) {
  try {
    const db = getDB();
    const index = db.data.emailLogs.findIndex(l => l.id === req.params.id && l.userId === req.userId);

    if (index === -1) {
      return res.status(404).json({ error: '日志不存在' });
    }

    db.data.emailLogs.splice(index, 1);
    await db.write('emailLogs');

    res.json({ message: '日志已删除' });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/logs
 * 清空当前用户的所有日志
 */
async function clearLogs(req, res, next) {
  try {
    const db = getDB();
    db.data.emailLogs = db.data.emailLogs.filter(l => l.userId !== req.userId);
    await db.write('emailLogs');

    res.json({ message: '所有日志已清空' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getLogs, getLogStats, deleteLog, clearLogs };
