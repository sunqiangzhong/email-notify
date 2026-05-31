/**
 * 通知渠道控制器
 * 支持多种通知渠道：企业微信应用、Server酱、企业微信Webhook、Telegram、自定义Webhook
 */
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../models/db');
const notificationService = require('../services/notificationService');

// 通知渠道类型配置
const NOTIFICATION_TYPES = {
  wecom_app: {
    name: '企业微信应用',
    description: '通过企业微信自建应用发送消息',
    fields: [
      { key: 'corpId', label: '企业ID (CorpID)', required: true, hint: '企业微信后台「企业信息」中的企业ID' },
      { key: 'agentId', label: '应用 AgentId', required: true, hint: '企业微信自建应用的 AgentId' },
      { key: 'appSecret', label: '应用 Secret', required: true, hint: '企业微信自建应用的 AppSecret' },
      { key: 'proxyUrl', label: 'API 代理地址', required: false, hint: '企业微信API代理地址，默认 https://qyapi.weixin.qq.com', default: 'https://qyapi.weixin.qq.com' },
      { key: 'token', label: 'Token', required: false, hint: '企业微信自建应用「API接收消息」配置中的 Token（用于接收消息回调）' },
      { key: 'encodingAesKey', label: 'EncodingAESKey', required: false, hint: '企业微信自建应用「API接收消息」配置中的 EncodingAESKey' },
      { key: 'adminUsers', label: '管理员白名单', required: false, hint: '可接收管理命令的用户ID列表，多个用逗号分隔' },
    ],
  },
  wecom_webhook: {
    name: '企业微信群机器人',
    description: '通过企业微信群机器人 Webhook 发送消息',
    fields: [
      { key: 'webhookUrl', label: 'Webhook URL', required: true, hint: '企业微信群机器人的 Webhook 地址' },
      { key: 'mentionedList', label: '@提醒列表', required: false, hint: '需要@的成员UserID列表，多个用逗号分隔，@all表示@所有人' },
    ],
  },
  server_chan: {
    name: 'Server酱',
    description: '通过 Server酱 推送消息到微信',
    fields: [
      { key: 'sendKey', label: 'SendKey', required: true, hint: 'Server酱的 SendKey，从 https://sct.ftqq.com/ 获取' },
      { key: 'channel', label: '推送通道', required: false, hint: '推送通道：9=微信服务号，旧版=方糖服务号', default: '9' },
    ],
  },
  telegram: {
    name: 'Telegram',
    description: '通过 Telegram Bot 发送消息',
    fields: [
      { key: 'botToken', label: 'Bot Token', required: true, hint: 'Telegram Bot Token，格式：123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11' },
      { key: 'chatId', label: 'Chat ID', required: true, hint: '接收消息的用户、群组或频道的 Chat ID' },
      { key: 'apiProxy', label: 'API 代理', required: false, hint: 'Telegram API 代理地址（国内网络需要）' },
    ],
  },
  dingtalk: {
    name: '钉钉机器人',
    description: '通过钉钉群机器人发送消息',
    fields: [
      { key: 'webhookUrl', label: 'Webhook URL', required: true, hint: '钉钉群机器人的 Webhook 地址' },
      { key: 'secret', label: '加签密钥', required: false, hint: '钉钉机器人安全设置中的加签密钥' },
    ],
  },
  feishu: {
    name: '飞书机器人',
    description: '通过飞书群机器人发送消息',
    fields: [
      { key: 'webhookUrl', label: 'Webhook URL', required: true, hint: '飞书群机器人的 Webhook 地址' },
      { key: 'secret', label: '签名密钥', required: false, hint: '飞书机器人安全设置中的签名密钥' },
    ],
  },
  custom_webhook: {
    name: '自定义 Webhook',
    description: '通过自定义 HTTP Webhook 发送消息',
    fields: [
      { key: 'webhookUrl', label: 'Webhook URL', required: true, hint: '自定义 Webhook 的 URL 地址' },
      { key: 'method', label: '请求方法', required: false, hint: 'HTTP 请求方法', default: 'POST' },
      { key: 'headers', label: '自定义请求头', required: false, hint: 'JSON 格式的自定义请求头，如 {"Authorization": "Bearer xxx"}' },
      { key: 'bodyTemplate', label: '请求体模板', required: false, hint: '支持 {{title}} 和 {{content}} 变量的请求体模板' },
    ],
  },
};

/**
 * GET /api/notifications
 * 获取当前用户的所有通知渠道配置
 */
async function getNotifications(req, res, next) {
  try {
    const db = getDB();
    const notifications = db.data.notifications
      .filter(n => n.userId === req.userId)
      .map(n => ({
        ...n,
        // 隐藏敏感字段
        config: Object.fromEntries(
          Object.entries(n.config || {}).map(([k, v]) => {
            if (['appSecret', 'secret', 'botToken', 'sendKey'].includes(k) && v) {
              return [k, '••••••'];
            }
            return [k, v];
          })
        ),
      }));
    res.json({ success: true, data: notifications });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/notifications/:id
 * 获取单个通知渠道配置
 */
async function getNotificationById(req, res, next) {
  try {
    const db = getDB();
    const notification = db.data.notifications.find(n => n.id === req.params.id && n.userId === req.userId);
    if (!notification) {
      return res.status(404).json({ success: false, code: 'NOTIFICATION_NOT_FOUND', message: '通知渠道不存在' });
    }
    res.json({ success: true, data: notification });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/notifications
 * 创建通知渠道配置
 */
async function createNotification(req, res, next) {
  try {
    const db = getDB();
    const { name, type, config, active } = req.body;

    if (!name || !type) {
      return res.status(400).json({ success: false, code: 'MISSING_FIELDS', message: '名称和类型不能为空' });
    }

    if (!NOTIFICATION_TYPES[type]) {
      return res.status(400).json({ success: false, code: 'INVALID_TYPE', message: '无效的通知渠道类型' });
    }

    // 验证必填字段
    const typeConfig = NOTIFICATION_TYPES[type];
    for (const field of typeConfig.fields) {
      if (field.required && (!config || !config[field.key])) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_FIELDS',
          message: `${field.label} 不能为空`,
        });
      }
    }

    const notification = {
      id: uuidv4(),
      userId: req.userId,
      name,
      type,
      config: config || {},
      active: active !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.data.notifications.push(notification);
    await db.write();

    res.status(201).json({ success: true, code: 'NOTIFICATION_CREATED', message: '通知渠道创建成功', data: notification });
  } catch (err) {
    next(err);
  }
}

/**
 * 敏感字段列表
 */
const SENSITIVE_FIELDS = ['appSecret', 'secret', 'botToken', 'sendKey'];

/**
 * 清理配置更新：过滤掉脱敏值和空值，避免覆盖真实数据
 */
function cleanConfigForUpdate(newConfig) {
  if (!newConfig || typeof newConfig !== 'object') return newConfig;
  const cleaned = { ...newConfig };
  for (const key of Object.keys(cleaned)) {
    // 过滤脱敏值（如 '••••••'）
    if (SENSITIVE_FIELDS.includes(key) && typeof cleaned[key] === 'string' && cleaned[key].includes('•')) {
      delete cleaned[key];
      continue;
    }
    // 过滤空字符串（防止可选字段被清空）
    if (cleaned[key] === '') {
      delete cleaned[key];
    }
  }
  return cleaned;
}

/**
 * PUT /api/notifications/:id
 * 更新通知渠道配置
 */
async function updateNotification(req, res, next) {
  try {
    const db = getDB();
    const notification = db.data.notifications.find(n => n.id === req.params.id && n.userId === req.userId);

    if (!notification) {
      return res.status(404).json({ success: false, code: 'NOTIFICATION_NOT_FOUND', message: '通知渠道不存在' });
    }

    const { name, type, config, active } = req.body;

    if (name !== undefined) notification.name = name;
    if (type !== undefined) notification.type = type;
    if (config !== undefined) {
      // 清理配置：过滤脱敏值和空值，防止覆盖真实数据
      const cleanedConfig = cleanConfigForUpdate(config);
      notification.config = { ...notification.config, ...cleanedConfig };
    }
    if (active !== undefined) notification.active = active;
    notification.updatedAt = new Date().toISOString();

    await db.write();

    res.json({ success: true, code: 'NOTIFICATION_UPDATED', message: '通知渠道更新成功', data: notification });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/notifications/:id
 * 删除通知渠道配置
 */
async function deleteNotification(req, res, next) {
  try {
    const db = getDB();
    const index = db.data.notifications.findIndex(n => n.id === req.params.id && n.userId === req.userId);

    if (index === -1) {
      return res.status(404).json({ success: false, code: 'NOTIFICATION_NOT_FOUND', message: '通知渠道不存在' });
    }

    db.data.notifications.splice(index, 1);
    await db.write();

    res.json({ success: true, code: 'NOTIFICATION_DELETED', message: '通知渠道删除成功' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/notifications/:id/test
 * 测试通知发送
 */
async function testSend(req, res, next) {
  try {
    const db = getDB();
    const notification = db.data.notifications.find(n => n.id === req.params.id && n.userId === req.userId);

    if (!notification) {
      return res.status(404).json({ success: false, code: 'NOTIFICATION_NOT_FOUND', message: '通知渠道不存在' });
    }

    const result = await notificationService.testSend(notification);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/notifications/filters
 * 获取当前用户的所有过滤规则
 */
async function getFilters(req, res, next) {
  try {
    const db = getDB();
    const filters = db.data.filters.filter(f => f.userId === req.userId);
    res.json({ success: true, data: filters });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/notifications/filters
 * 创建过滤规则
 */
async function createFilter(req, res, next) {
  try {
    const db = getDB();
    const { name, emailId, notificationId, keywords, matchType, active } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, code: 'MISSING_FIELDS', message: '规则名称不能为空' });
    }

    const filter = {
      id: uuidv4(),
      userId: req.userId,
      name,
      emailId: emailId || null,
      notificationId: notificationId || null,
      keywords: keywords || [],
      matchType: matchType || 'any',
      active: active !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.data.filters.push(filter);
    await db.write();

    res.status(201).json({ success: true, code: 'FILTER_CREATED', message: '过滤规则创建成功', data: filter });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/notifications/filters/:id
 * 更新过滤规则
 */
async function updateFilter(req, res, next) {
  try {
    const db = getDB();
    const filter = db.data.filters.find(f => f.id === req.params.id && f.userId === req.userId);

    if (!filter) {
      return res.status(404).json({ success: false, code: 'FILTER_NOT_FOUND', message: '过滤规则不存在' });
    }

    const { name, emailId, notificationId, keywords, matchType, active } = req.body;

    if (name !== undefined) filter.name = name;
    if (emailId !== undefined) filter.emailId = emailId;
    if (notificationId !== undefined) filter.notificationId = notificationId;
    if (keywords !== undefined) filter.keywords = keywords;
    if (matchType !== undefined) filter.matchType = matchType;
    if (active !== undefined) filter.active = active;
    filter.updatedAt = new Date().toISOString();

    await db.write();

    res.json({ success: true, code: 'FILTER_UPDATED', message: '过滤规则更新成功', data: filter });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/notifications/filters/:id
 * 删除过滤规则
 */
async function deleteFilter(req, res, next) {
  try {
    const db = getDB();
    const index = db.data.filters.findIndex(f => f.id === req.params.id && f.userId === req.userId);

    if (index === -1) {
      return res.status(404).json({ success: false, code: 'FILTER_NOT_FOUND', message: '过滤规则不存在' });
    }

    db.data.filters.splice(index, 1);
    await db.write();

    res.json({ success: true, code: 'FILTER_DELETED', message: '过滤规则删除成功' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/notifications/types
 * 获取支持的通知类型配置
 */
async function getNotificationTypes(req, res, next) {
  try {
    res.json({ success: true, data: NOTIFICATION_TYPES });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getNotifications,
  getNotificationById,
  createNotification,
  updateNotification,
  deleteNotification,
  testSend,
  getFilters,
  createFilter,
  updateFilter,
  deleteFilter,
  getNotificationTypes,
  NOTIFICATION_TYPES,
};
