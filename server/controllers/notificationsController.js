/**
 * 通知渠道控制器
 * 支持多种通知渠道：企业微信应用、Server酱、企业微信Webhook、Telegram、自定义Webhook
 */
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../models/db');
const notificationService = require('../services/notificationService');
const wechatCommandService = require('../services/wechatCommandService');

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
    const notifications = db.data.notifications.filter(n => n.userId === req.userId);
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

    // 去重：同一类型的通知渠道不允许重复创建
    const existing = db.data.notifications.find(n => n.type === type);
    if (existing) {
      return res.status(409).json({
        success: false,
        code: 'DUPLICATE',
        message: `${NOTIFICATION_TYPES[type]?.name || type} 渠道已存在（名称: ${existing.name}），请勿重复添加。如需修改请点击编辑`,
      });
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

    // 企业微信应用：验证 EncodingAESKey 长度
    if (type === 'wecom_app' && config?.encodingAesKey) {
      const keyLen = Buffer.from(config.encodingAesKey + '=', 'base64').length;
      if (keyLen !== 32) {
        console.error(`[NOTIFY] EncodingAESKey 长度异常: 原始=${config.encodingAesKey.length}字符, 解码后=${keyLen}字节, 值="${config.encodingAesKey}"`);
        return res.status(400).json({
          success: false,
          code: 'INVALID_CONFIG',
          message: `EncodingAESKey 长度无效（应为43个字符，当前${config.encodingAesKey.length}个字符），请从企业微信后台重新复制`,
        });
      }
    }

    // 打印保存的配置（隐藏敏感值）
    console.log(`[NOTIFY] 创建通知渠道: type=${type}, name=${name}`);
    // 过滤掩码值（防止前端误传）
    let safeConfig = config || {};
    for (const [key, value] of Object.entries(safeConfig)) {
      if (isMaskedValue(value)) {
        console.warn(`[NOTIFY] 创建时发现掩码值，已移除: ${key}="${value}"`);
        safeConfig = { ...safeConfig };
        delete safeConfig[key];
      }
    }
    if (safeConfig) {
      for (const [key, value] of Object.entries(safeConfig)) {
        if (SENSITIVE_FIELDS.includes(key)) {
          console.log(`[NOTIFY]   ${key}: *** (${typeof value === 'string' ? value.length : '?'}字符)`);
        } else {
          console.log(`[NOTIFY]   ${key}: ${value}`);
        }
      }
    }

    const notification = {
      id: uuidv4(),
      userId: req.userId,
      name,
      type,
      config: safeConfig,
      active: active !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.data.notifications.push(notification);
    await db.write('notifications');

    // 如果是启用的企业微信自建应用，自动注册自定义菜单
    if (notification.type === 'wecom_app' && notification.active) {
      const { corpId, appSecret, agentId } = notification.config || {};
      if (corpId && appSecret && agentId) {
        wechatCommandService.createMenus(notification.config).catch(err => {
          console.error('[WECHAT] 自动创建菜单失败:', err.message);
        });
      }
    }

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
 * 检测是否是掩码值（如 '••••••', '***', '[已隐藏...]' 等）
 */
function isMaskedValue(val) {
  if (typeof val !== 'string') return false;
  // 全是特殊字符（•、*、.、# 等）
  if (/^[•*.\-#]+$/.test(val)) return true;
  // 包含"已隐藏"或"masked"
  if (val.includes('已隐藏') || val.includes('masked')) return true;
  return false;
}

/**
 * 清理配置更新：过滤掉掩码值和空值，避免覆盖真实数据
 */
function cleanConfigForUpdate(newConfig) {
  if (!newConfig || typeof newConfig !== 'object') return newConfig;
  const cleaned = { ...newConfig };
  for (const key of Object.keys(cleaned)) {
    // 过滤掩码值
    if (isMaskedValue(cleaned[key])) {
      console.log(`[NOTIFY] 过滤掩码字段: ${key}="${cleaned[key]}"`);
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

      // 企业微信应用：验证 EncodingAESKey 长度
      if (notification.type === 'wecom_app' && cleanedConfig.encodingAesKey) {
        const keyLen = Buffer.from(cleanedConfig.encodingAesKey + '=', 'base64').length;
        if (keyLen !== 32) {
          console.error(`[NOTIFY] EncodingAESKey 长度异常: 原始=${cleanedConfig.encodingAesKey.length}字符, 解码后=${keyLen}字节, 值="${cleanedConfig.encodingAesKey}"`);
          return res.status(400).json({
            success: false,
            code: 'INVALID_CONFIG',
            message: `EncodingAESKey 长度无效（应为43个字符，当前${cleanedConfig.encodingAesKey.length}个字符），请从企业微信后台重新复制`,
          });
        }
      }

      // 打印更新的配置（隐藏敏感值）
      console.log(`[NOTIFY] 更新通知渠道: id=${notification.id}, type=${notification.type}`);
      for (const [key, value] of Object.entries(cleanedConfig)) {
        if (SENSITIVE_FIELDS.includes(key)) {
          console.log(`[NOTIFY]   ${key}: *** (${typeof value === 'string' ? value.length : '?'}字符)`);
        } else {
          console.log(`[NOTIFY]   ${key}: ${value}`);
        }
      }

      notification.config = { ...notification.config, ...cleanedConfig };
    }
    if (active !== undefined) notification.active = active;
    notification.updatedAt = new Date().toISOString();

    await db.write('notifications');

    // 如果是启用的企业微信自建应用，自动更新/注册自定义菜单
    if (notification.type === 'wecom_app' && notification.active) {
      const { corpId, appSecret, agentId } = notification.config || {};
      if (corpId && appSecret && agentId) {
        wechatCommandService.createMenus(notification.config).catch(err => {
          console.error('[WECHAT] 自动更新菜单失败:', err.message);
        });
      }
    }

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
    await db.write('notifications');

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
    await db.write('filters');

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

    await db.write('filters');

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
    await db.write('filters');

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

/**
 * GET /api/notifications/debug
 * 诊断：查看数据库中通知配置的实际存储值
 */
async function debugNotifications(req, res, next) {
  try {
    const db = getDB();
    const notifications = db.data.notifications
      .filter(n => n.userId === req.userId)
      .map(n => ({
        id: n.id,
        name: n.name,
        type: n.type,
        active: n.active,
        config: Object.fromEntries(
          Object.entries(n.config || {}).map(([k, v]) => {
            if (SENSITIVE_FIELDS.includes(k) && v) {
              return [k, `[已隐藏, ${String(v).length}字符]`];
            }
            // 对非敏感字段也显示长度，便于诊断
            if (typeof v === 'string' && v.length > 0) {
              return [k, `${v} (${v.length}字符)`];
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
 * POST /api/notifications/:id/wechat-menus
 * 注册企业微信自建应用自定义菜单
 */
async function createWechatMenus(req, res, next) {
  try {
    const db = getDB();
    const notification = db.data.notifications.find(n => n.id === req.params.id && n.userId === req.userId);

    if (!notification) {
      return res.status(404).json({ success: false, code: 'NOTIFICATION_NOT_FOUND', message: '通知渠道不存在' });
    }

    if (notification.type !== 'wecom_app') {
      return res.status(400).json({ success: false, code: 'INVALID_CHANNEL_TYPE', message: '该通知渠道不是企业微信应用，无法创建自定义菜单' });
    }

    const { corpId, appSecret, agentId } = notification.config || {};
    if (!corpId || !appSecret || !agentId) {
      return res.status(400).json({ success: false, code: 'MISSING_CONFIG', message: '企业微信应用配置不完整，创建菜单需要填写 企业ID (CorpID), 应用 AgentId 以及 应用 Secret' });
    }

    console.log(`[WECHAT] 手动注册企业微信自定义菜单，channelId=${notification.id}`);
    const success = await wechatCommandService.createMenus(notification.config);

    if (success) {
      res.json({ success: true, message: '企业微信自定义菜单创建/重置成功！' });
    } else {
      res.status(500).json({ success: false, message: '企业微信自定义菜单创建失败，请查看控制台日志' });
    }
  } catch (err) {
    console.error('[WECHAT] 手动创建菜单失败:', err.message);
    res.status(500).json({ success: false, code: 'WECHAT_MENU_ERROR', message: err.message });
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
  debugNotifications,
  createWechatMenus,
  NOTIFICATION_TYPES,
};
