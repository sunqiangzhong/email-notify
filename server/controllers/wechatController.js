/**
 * 微信通知配置控制器
 */
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../models/db');
const { testNotification } = require('../services/notificationService');

/**
 * GET /api/wechat
 * 获取当前用户的微信通知配置
 */
async function getWechatConfig(req, res, next) {
  try {
    const db = getDB();
    const config = db.data.wechatConfigs.find(w => w.userId === req.userId);

    if (!config) {
      return res.json({
        provider: 'server_chan',
        token: '',
        secret: '',
        webhookUrl: '',
        rules: {
          enableFilter: false,
          keywords: '',
          dndEnabled: false,
          dndStart: '22:00',
          dndEnd: '08:00',
        },
      });
    }

    res.json(config);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/wechat
 * 更新微信通知配置 (upsert)
 */
async function updateWechatConfig(req, res, next) {
  try {
    const db = getDB();
    const { provider, token, secret, webhookUrl, rules } = req.body;

    let config = db.data.wechatConfigs.find(w => w.userId === req.userId);

    if (config) {
      if (provider !== undefined) config.provider = provider;
      if (token !== undefined) config.token = token;
      if (secret !== undefined) config.secret = secret;
      if (webhookUrl !== undefined) config.webhookUrl = webhookUrl;
      if (rules !== undefined) config.rules = { ...config.rules, ...rules };
    } else {
      config = {
        id: uuidv4(),
        userId: req.userId,
        provider: provider || 'server_chan',
        token: token || '',
        secret: secret || '',
        webhookUrl: webhookUrl || '',
        rules: rules || {
          enableFilter: false,
          keywords: '',
          dndEnabled: false,
          dndStart: '22:00',
          dndEnd: '08:00',
        },
      };
      db.data.wechatConfigs.push(config);
    }

    await db.write();
    res.json(config);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/wechat/test
 * 测试微信通知推送
 */
async function testWechat(req, res, next) {
  try {
    const result = await testNotification(req.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { getWechatConfig, updateWechatConfig, testWechat };
