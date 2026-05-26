/**
 * 邮箱控制器
 * 处理邮箱账户的 CRUD 操作
 */
const { v4: uuidv4 } = require('uuid');
const { emailsDb } = require('../models/database');
const { testImapConnection, startEmailMonitor, fetchRecentEmails, fetchEmailBody } = require('../services/mailService');

/**
 * 获取当前用户的所有邮箱
 * GET /api/emails
 */
const getAll = async (req, res) => {
  try {
    const userId = req.user.userId;
    const emails = emailsDb.get('emails').filter({ userId }).value();
    return res.json({
      success: true,
      code: 'EMAILS_FOUND',
      message: '获取邮箱列表成功',
      data: emails,
    });
  } catch (error) {
    console.error('获取邮箱列表错误:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
};

/**
 * 获取单个邮箱详情
 * GET /api/emails/:id
 */
const getById = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const email = emailsDb.get('emails').find({ userId, id }).value();
    if (!email) {
      return res.status(404).json({
        success: false,
        code: 'EMAIL_NOT_FOUND',
        message: '邮箱不存在',
      });
    }

    return res.json({
      success: true,
      code: 'EMAIL_FOUND',
      message: '获取邮箱详情成功',
      data: email,
    });
  } catch (error) {
    console.error('获取邮箱详情错误:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
};

/**
 * 创建新邮箱账户
 * POST /api/emails
 */
const create = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, email, password, imapHost, imapPort, useSSL, useProxy, proxyId, active } = req.body;

    // 验证必填字段
    if (!name || !email || !password || !imapHost) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: '名称、邮箱地址、密码和IMAP服务器为必填项',
      });
    }

    const newEmail = {
      id: uuidv4(),
      userId,
      name,
      email,
      password, // 实际生产环境应该加密存储
      imapHost,
      imapPort: imapPort || 993,
      useSSL: useSSL !== false,
      useProxy: useProxy || false,
      proxyId: proxyId || null,
      active: active !== false,
      lastSync: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    emailsDb.get('emails').push(newEmail).write();

    // 异步启动邮箱监听（不阻塞响应）
    if (newEmail.active) {
      startEmailMonitor(newEmail).catch(err => {
        console.error(`邮箱 ${newEmail.email} 监听启动失败:`, err.message);
      });
    }

    return res.status(201).json({
      success: true,
      code: 'EMAIL_CREATED',
      message: '邮箱创建成功',
      data: newEmail,
    });
  } catch (error) {
    console.error('创建邮箱错误:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
};

/**
 * 更新邮箱账户
 * PUT /api/emails/:id
 */
const update = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { name, email, password, imapHost, imapPort, useSSL, useProxy, proxyId, active } = req.body;

    const existingEmail = emailsDb.get('emails').find({ userId, id }).value();
    if (!existingEmail) {
      return res.status(404).json({
        success: false,
        code: 'EMAIL_NOT_FOUND',
        message: '邮箱不存在',
      });
    }

    const updateData = {
      name: name || existingEmail.name,
      email: email || existingEmail.email,
      password: password || existingEmail.password,
      imapHost: imapHost || existingEmail.imapHost,
      imapPort: imapPort || existingEmail.imapPort,
      useSSL: useSSL !== undefined ? useSSL : existingEmail.useSSL,
      useProxy: useProxy !== undefined ? useProxy : existingEmail.useProxy,
      proxyId: proxyId !== undefined ? proxyId : existingEmail.proxyId,
      active: active !== undefined ? active : existingEmail.active,
      updatedAt: new Date().toISOString(),
    };

    emailsDb.get('emails').find({ userId, id }).assign(updateData).write();

    return res.json({
      success: true,
      code: 'EMAIL_UPDATED',
      message: '邮箱更新成功',
      data: { ...existingEmail, ...updateData },
    });
  } catch (error) {
    console.error('更新邮箱错误:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
};

/**
 * 删除邮箱账户
 * DELETE /api/emails/:id
 */
const remove = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const existingEmail = emailsDb.get('emails').find({ userId, id }).value();
    if (!existingEmail) {
      return res.status(404).json({
        success: false,
        code: 'EMAIL_NOT_FOUND',
        message: '邮箱不存在',
      });
    }

    emailsDb.get('emails').remove({ userId, id }).write();

    return res.json({
      success: true,
      code: 'EMAIL_DELETED',
      message: '邮箱删除成功',
    });
  } catch (error) {
    console.error('删除邮箱错误:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
};

/**
 * 测试邮箱连接（新建时）
 * POST /api/emails/test-connection
 */
const testConnection = async (req, res) => {
  try {
    const { email, password, imapHost, imapPort, useSSL, useProxy, proxyHost, proxyPort, proxyType } = req.body;

    if (!email || !password || !imapHost) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: '邮箱地址、密码和IMAP服务器为必填项',
      });
    }

    const emailConfig = { email, password, imapHost, imapPort: imapPort || 993, useSSL: useSSL !== false };
    let proxyConfig = null;
    if (useProxy && proxyHost && proxyPort) {
      proxyConfig = { host: proxyHost, port: proxyPort, type: proxyType || 'socks5' };
    }

    const result = await testImapConnection(emailConfig, proxyConfig);

    if (result.success) {
      return res.json({ success: true, code: 'CONNECTION_SUCCESS', message: '邮箱连接测试成功', data: { server: imapHost, responseTime: result.responseTime } });
    } else {
      return res.status(400).json({ success: false, code: 'CONNECTION_FAILED', message: result.error || '邮箱连接测试失败', data: { errorCode: result.errorCode } });
    }
  } catch (error) {
    console.error('测试邮箱连接错误:', error);
    return res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: '服务器内部错误' });
  }
};

/**
 * 测试已有邮箱连接（使用存储的密码）
 * POST /api/emails/:id/test
 */
const testExistingConnection = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const existingEmail = emailsDb.get('emails').find({ userId, id }).value();
    if (!existingEmail) {
      return res.status(404).json({ success: false, code: 'EMAIL_NOT_FOUND', message: '邮箱不存在' });
    }

    // 获取代理配置（如果启用）
    let proxyConfig = null;
    if (existingEmail.useProxy && existingEmail.proxyId) {
      const proxy = proxiesDb.get('proxies').find({ userId, id: existingEmail.proxyId }).value();
      if (proxy) {
        proxyConfig = { host: proxy.host, port: proxy.port, type: proxy.type, username: proxy.username, password: proxy.password };
      }
    }

    const emailConfig = {
      email: existingEmail.email,
      password: existingEmail.password,
      imapHost: existingEmail.imapHost,
      imapPort: existingEmail.imapPort,
      useSSL: existingEmail.useSSL,
    };

    const result = await testImapConnection(emailConfig, proxyConfig);

    if (result.success) {
      return res.json({ success: true, code: 'CONNECTION_SUCCESS', message: '邮箱连接测试成功', data: { server: existingEmail.imapHost, responseTime: result.responseTime } });
    } else {
      return res.status(400).json({ success: false, code: 'CONNECTION_FAILED', message: result.error || '邮箱连接测试失败', data: { errorCode: result.errorCode } });
    }
  } catch (error) {
    console.error('测试已有邮箱连接错误:', error);
    return res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: '服务器内部错误' });
  }
};

/**
 * 拉取最近邮件（分页）
 * GET /api/emails/:id/messages?page=1&pageSize=10
 */
const fetchRecent = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;

    const existingEmail = emailsDb.get('emails').find({ userId, id }).value();
    if (!existingEmail) {
      return res.status(404).json({ success: false, code: 'EMAIL_NOT_FOUND', message: '邮箱不存在' });
    }

    console.log(`[API] 用户请求拉取 ${existingEmail.email} 第${page}页 每页${pageSize}封`);
    const result = await fetchRecentEmails(id, page, pageSize);

    return res.json({
      success: true,
      code: 'EMAILS_FETCHED',
      message: `成功拉取 ${result.emails.length} 封邮件`,
      data: result.emails,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('拉取最近邮件错误:', error);
    return res.status(500).json({
      success: false,
      code: 'FETCH_FAILED',
      message: error.message || '拉取邮件失败',
    });
  }
};

/**
 * 获取单封邮件正文
 * GET /api/emails/:id/messages/:uid/body
 */
const getEmailBody = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id, uid } = req.params;

    const existingEmail = emailsDb.get('emails').find({ userId, id }).value();
    if (!existingEmail) {
      return res.status(404).json({ success: false, code: 'EMAIL_NOT_FOUND', message: '邮箱不存在' });
    }

    const body = await fetchEmailBody(id, parseInt(uid));
    return res.json({ success: true, data: body });
  } catch (error) {
    console.error('获取邮件正文错误:', error);
    return res.status(500).json({ success: false, message: error.message || '获取正文失败' });
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove,
  testConnection,
  testExistingConnection,
  fetchRecent,
  getEmailBody,
};
