/**
 * 通知控制器
 * 处理微信通知配置的 CRUD 操作
 */
const { v4: uuidv4 } = require('uuid');
const { notificationsDb, filtersDb } = require('../models/database');

/**
 * 获取当前用户的所有通知配置
 * GET /api/notifications
 */
const getAll = async (req, res) => {
  try {
    const userId = req.user.userId;
    const notifications = notificationsDb.get('notifications').filter({ userId }).value();
    return res.json({
      success: true,
      code: 'NOTIFICATIONS_FOUND',
      message: '获取通知配置列表成功',
      data: notifications,
    });
  } catch (error) {
    console.error('获取通知配置列表错误:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
};

/**
 * 获取单个通知配置详情
 * GET /api/notifications/:id
 */
const getById = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const notification = notificationsDb.get('notifications').find({ userId, id }).value();
    if (!notification) {
      return res.status(404).json({
        success: false,
        code: 'NOTIFICATION_NOT_FOUND',
        message: '通知配置不存在',
      });
    }

    return res.json({
      success: true,
      code: 'NOTIFICATION_FOUND',
      message: '获取通知配置详情成功',
      data: notification,
    });
  } catch (error) {
    console.error('获取通知配置详情错误:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
};

/**
 * 创建新通知配置
 * POST /api/notifications
 */
const create = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, type, webhookUrl, secret, active } = req.body;

    // 验证必填字段
    if (!name || !type || !webhookUrl) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: '名称、类型和Webhook URL为必填项',
      });
    }

    // 验证通知类型
    const validTypes = ['serverchan', 'wecom', 'custom'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_TYPE',
        message: `通知类型必须是以下之一: ${validTypes.join(', ')}`,
      });
    }

    const newNotification = {
      id: uuidv4(),
      userId,
      name,
      type,
      webhookUrl,
      secret: secret || null,
      active: active !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    notificationsDb.get('notifications').push(newNotification).write();

    return res.status(201).json({
      success: true,
      code: 'NOTIFICATION_CREATED',
      message: '通知配置创建成功',
      data: newNotification,
    });
  } catch (error) {
    console.error('创建通知配置错误:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
};

/**
 * 更新通知配置
 * PUT /api/notifications/:id
 */
const update = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { name, type, webhookUrl, secret, active } = req.body;

    const existingNotification = notificationsDb.get('notifications').find({ userId, id }).value();
    if (!existingNotification) {
      return res.status(404).json({
        success: false,
        code: 'NOTIFICATION_NOT_FOUND',
        message: '通知配置不存在',
      });
    }

    // 验证通知类型（如果提供）
    if (type) {
      const validTypes = ['serverchan', 'wecom', 'custom'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_TYPE',
          message: `通知类型必须是以下之一: ${validTypes.join(', ')}`,
        });
      }
    }

    const updateData = {
      name: name || existingNotification.name,
      type: type || existingNotification.type,
      webhookUrl: webhookUrl || existingNotification.webhookUrl,
      secret: secret !== undefined ? secret : existingNotification.secret,
      active: active !== undefined ? active : existingNotification.active,
      updatedAt: new Date().toISOString(),
    };

    notificationsDb.get('notifications').find({ userId, id }).assign(updateData).write();

    return res.json({
      success: true,
      code: 'NOTIFICATION_UPDATED',
      message: '通知配置更新成功',
      data: { ...existingNotification, ...updateData },
    });
  } catch (error) {
    console.error('更新通知配置错误:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
};

/**
 * 删除通知配置
 * DELETE /api/notifications/:id
 */
const remove = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const existingNotification = notificationsDb.get('notifications').find({ userId, id }).value();
    if (!existingNotification) {
      return res.status(404).json({
        success: false,
        code: 'NOTIFICATION_NOT_FOUND',
        message: '通知配置不存在',
      });
    }

    notificationsDb.get('notifications').remove({ userId, id }).write();

    return res.json({
      success: true,
      code: 'NOTIFICATION_DELETED',
      message: '通知配置删除成功',
    });
  } catch (error) {
    console.error('删除通知配置错误:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
};

/**
 * 测试通知发送
 * POST /api/notifications/:id/test
 */
const testSend = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const notification = notificationsDb.get('notifications').find({ userId, id }).value();
    if (!notification) {
      return res.status(404).json({
        success: false,
        code: 'NOTIFICATION_NOT_FOUND',
        message: '通知配置不存在',
      });
    }

    // 发送测试通知
    const { sendNotification } = require('../services/notificationService');
    const testEmail = {
      from: 'test@example.com',
      subject: '测试邮件通知',
      text: '这是一封测试邮件，用于验证通知配置是否正常工作。',
      date: new Date(),
    };

    const result = await sendNotification(notification, testEmail);

    if (result.success) {
      return res.json({
        success: true,
        code: 'TEST_SUCCESS',
        message: '测试通知发送成功',
      });
    } else {
      return res.status(400).json({
        success: false,
        code: 'TEST_FAILED',
        message: result.error || '测试通知发送失败',
      });
    }
  } catch (error) {
    console.error('测试通知发送错误:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
};

// ============ 过滤规则 CRUD ============

/**
 * 获取当前用户的所有过滤规则
 * GET /api/filters
 */
const getAllFilters = async (req, res) => {
  try {
    const userId = req.user.userId;
    const filters = filtersDb.get('filters').filter({ userId }).value();
    return res.json({
      success: true,
      code: 'FILTERS_FOUND',
      message: '获取过滤规则列表成功',
      data: filters,
    });
  } catch (error) {
    console.error('获取过滤规则列表错误:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
};

/**
 * 创建新过滤规则
 * POST /api/filters
 */
const createFilter = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, emailId, notificationId, keywords, matchType, active } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: '规则名称为必填项',
      });
    }

    const newFilter = {
      id: uuidv4(),
      userId,
      name,
      emailId: emailId || null,        // null 表示匹配所有邮箱
      notificationId: notificationId || null, // null 表示使用默认通知
      keywords: keywords || [],         // 关键词数组
      matchType: matchType || 'any',    // any=任意匹配, all=全部匹配
      active: active !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    filtersDb.get('filters').push(newFilter).write();

    return res.status(201).json({
      success: true,
      code: 'FILTER_CREATED',
      message: '过滤规则创建成功',
      data: newFilter,
    });
  } catch (error) {
    console.error('创建过滤规则错误:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
};

/**
 * 更新过滤规则
 * PUT /api/filters/:id
 */
const updateFilter = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { name, emailId, notificationId, keywords, matchType, active } = req.body;

    const existingFilter = filtersDb.get('filters').find({ userId, id }).value();
    if (!existingFilter) {
      return res.status(404).json({
        success: false,
        code: 'FILTER_NOT_FOUND',
        message: '过滤规则不存在',
      });
    }

    const updateData = {
      name: name || existingFilter.name,
      emailId: emailId !== undefined ? emailId : existingFilter.emailId,
      notificationId: notificationId !== undefined ? notificationId : existingFilter.notificationId,
      keywords: keywords || existingFilter.keywords,
      matchType: matchType || existingFilter.matchType,
      active: active !== undefined ? active : existingFilter.active,
      updatedAt: new Date().toISOString(),
    };

    filtersDb.get('filters').find({ userId, id }).assign(updateData).write();

    return res.json({
      success: true,
      code: 'FILTER_UPDATED',
      message: '过滤规则更新成功',
      data: { ...existingFilter, ...updateData },
    });
  } catch (error) {
    console.error('更新过滤规则错误:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
};

/**
 * 删除过滤规则
 * DELETE /api/filters/:id
 */
const removeFilter = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const existingFilter = filtersDb.get('filters').find({ userId, id }).value();
    if (!existingFilter) {
      return res.status(404).json({
        success: false,
        code: 'FILTER_NOT_FOUND',
        message: '过滤规则不存在',
      });
    }

    filtersDb.get('filters').remove({ userId, id }).write();

    return res.json({
      success: true,
      code: 'FILTER_DELETED',
      message: '过滤规则删除成功',
    });
  } catch (error) {
    console.error('删除过滤规则错误:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove,
  testSend,
  getAllFilters,
  createFilter,
  updateFilter,
  removeFilter,
};
