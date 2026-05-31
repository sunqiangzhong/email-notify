/**
 * API 令牌路由
 * 参考 MoviePilot 实现
 */
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const { apiTokenMiddleware, getConfiguredApiToken } = require('../middlewares/apiToken');
const { getDB } = require('../models/db');
const { processNotification } = require('../services/notificationService');

// ============ 令牌管理（需要 JWT 认证）============

/**
 * GET /api/token
 * 获取当前配置的 API 令牌信息
 */
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const token = getConfiguredApiToken();

    res.json({
      success: true,
      data: {
        token: token || null,
        hasToken: !!token,
        message: token
          ? 'API 令牌已配置'
          : 'API 令牌未配置，请在环境变量中设置 API_TOKEN',
      }
    });
  } catch (err) {
    next(err);
  }
});

// ============ 外部 API（通过令牌认证）============

/**
 * GET /api/token/status
 * 通过令牌获取系统状态
 */
router.get('/status', apiTokenMiddleware, async (req, res, next) => {
  try {
    const db = getDB();
    const accounts = db.data.accounts.filter(a => a.active !== false);

    res.json({
      success: true,
      data: {
        status: 'running',
        accounts: accounts.map(a => ({
          email: a.email,
          status: a.status,
          lastSync: a.lastSync,
        })),
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/token/notify
 * 通过令牌发送通知
 * Body: { subject, senderName, senderEmail, toEmail, snippet }
 */
router.post('/notify', apiTokenMiddleware, async (req, res, next) => {
  try {
    const db = getDB();
    const { subject, senderName, senderEmail, toEmail, snippet } = req.body;

    if (!subject) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: '缺少必要字段: subject'
      });
    }

    // 获取第一个用户的 ID（用于发送通知）
    const user = db.data.users[0];
    if (!user) {
      return res.status(500).json({
        success: false,
        code: 'NO_USER',
        message: '系统中没有用户，无法发送通知'
      });
    }

    const emailData = {
      subject: subject || '(无主题)',
      senderName: senderName || 'unknown',
      senderEmail: senderEmail || 'unknown',
      toEmail: toEmail || '',
      snippet: snippet || '',
      receivedAt: new Date().toISOString(),
    };

    // 生成日志 ID
    const { v4: uuidv4 } = require('uuid');
    const logId = uuidv4();

    // 写入日志
    const logEntry = {
      id: logId,
      userId: user.id,
      accountId: 'external',
      subject: emailData.subject,
      senderName: emailData.senderName,
      senderEmail: emailData.senderEmail,
      toEmail: emailData.toEmail,
      receivedAt: emailData.receivedAt,
      forwardStatus: 'sending',
      snippet: emailData.snippet,
    };
    db.data.emailLogs.push(logEntry);
    await db.write();

    // 发送通知
    await processNotification(user.id, emailData, logId);

    res.json({
      success: true,
      message: '通知已发送',
      data: { logId }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/token/emails
 * 通过令牌获取最近邮件
 */
router.get('/emails', apiTokenMiddleware, async (req, res, next) => {
  try {
    const db = getDB();
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;

    // 获取所有邮箱账户
    const accounts = db.data.accounts.filter(a => a.active !== false);

    // 获取所有邮件
    const allEmails = [];
    for (const account of accounts) {
      const emails = db.data.accountEmails
        .filter(e => e.accountId === account.id)
        .map(e => ({
          ...e,
          accountEmail: account.email,
        }));
      allEmails.push(...emails);
    }

    // 按时间排序
    allEmails.sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db2 = new Date(b.date).getTime();
      return db2 - da;
    });

    // 分页
    const total = allEmails.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, total);
    const pageEmails = allEmails.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: pageEmails,
      pagination: { page, pageSize, total, totalPages }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
