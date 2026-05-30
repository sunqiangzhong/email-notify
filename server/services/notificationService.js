/**
 * 通知服务
 * 
 * 支持多种通知渠道:
 * - 企业微信应用 (wecom_app)
 * - 企业微信群机器人 (wecom_webhook)
 * - Server酱 (server_chan)
 * - Telegram (telegram)
 * - 钉钉机器人 (dingtalk)
 * - 飞书机器人 (feishu)
 * - 自定义 Webhook (custom_webhook)
 */
const axios = require('axios');
const crypto = require('crypto');
const { getDB } = require('../models/db');

/**
 * 检查邮件是否匹配过滤规则
 */
function matchesFilter(emailData, filter) {
  if (!filter || !filter.active) return { match: true, reason: '过滤器未启用' };

  const keywords = (filter.keywords || []).map(k => k.trim().toLowerCase()).filter(k => k.length > 0);

  if (keywords.length === 0) return { match: true, reason: '无关键词规则' };

  const textToMatch = `${emailData.subject} ${emailData.snippet} ${emailData.senderName} ${emailData.senderEmail}`.toLowerCase();

  const matchedKeywords = keywords.filter(kw => textToMatch.includes(kw));

  if (filter.matchType === 'all') {
    if (matchedKeywords.length === keywords.length) {
      return { match: true, reason: `匹配所有关键词: ${matchedKeywords.join(', ')}` };
    }
    return { match: false, reason: `未匹配所有关键词` };
  } else {
    if (matchedKeywords.length > 0) {
      return { match: true, reason: `匹配关键词: ${matchedKeywords.join(', ')}` };
    }
    return { match: false, reason: `未匹配关键词过滤规则 [${keywords.join(', ')}]` };
  }
}

/**
 * 构建消息内容
 */
function buildMessageContent(emailData, format = 'markdown') {
  if (format === 'markdown') {
    return [
      `📬 **新邮件通知**`,
      ``,
      `**发件人**: ${emailData.senderName} <${emailData.senderEmail}>`,
      `**收件箱**: ${emailData.toEmail}`,
      `**主 题**: ${emailData.subject}`,
      `**时 间**: ${new Date(emailData.receivedAt).toLocaleString('zh-CN')}`,
      ``,
      `---`,
      `${emailData.snippet}`,
    ].join('\n');
  }

  return [
    `新邮件通知`,
    `发件人: ${emailData.senderName} <${emailData.senderEmail}>`,
    `收件箱: ${emailData.toEmail}`,
    `主题: ${emailData.subject}`,
    `时间: ${new Date(emailData.receivedAt).toLocaleString('zh-CN')}`,
    ``,
    emailData.snippet,
  ].join('\n');
}

/**
 * 发送企业微信应用消息
 */
async function sendWecomApp(config, emailData) {
  const { corpId, agentId, appSecret, proxyUrl } = config;
  const baseUrl = proxyUrl || 'https://qyapi.weixin.qq.com';

  // 获取 access_token
  const tokenRes = await axios.get(`${baseUrl}/cgi-bin/gettoken`, {
    params: { corpid: corpId, corpsecret: appSecret },
    timeout: 10000,
  });

  if (tokenRes.data.errcode !== 0) {
    throw new Error(`获取 access_token 失败: ${tokenRes.data.errmsg}`);
  }

  const accessToken = tokenRes.data.access_token;
  const content = buildMessageContent(emailData, 'markdown');

  // 发送消息
  const sendRes = await axios.post(`${baseUrl}/cgi-bin/message/send?access_token=${accessToken}`, {
    touser: '@all',
    msgtype: 'markdown',
    agentid: parseInt(agentId),
    markdown: { content },
  }, { timeout: 10000 });

  if (sendRes.data.errcode !== 0) {
    throw new Error(`发送消息失败: ${sendRes.data.errmsg}`);
  }

  return { success: true, target: '企业微信应用' };
}

/**
 * 发送企业微信群机器人消息
 */
async function sendWecomWebhook(config, emailData) {
  const { webhookUrl, mentionedList } = config;
  const content = buildMessageContent(emailData, 'markdown');

  const payload = {
    msgtype: 'markdown',
    markdown: { content },
  };

  if (mentionedList) {
    payload.markdown.mentioned_list = mentionedList.split(',').map(s => s.trim());
  }

  const res = await axios.post(webhookUrl, payload, { timeout: 10000 });

  if (res.data.errcode !== 0) {
    throw new Error(`发送消息失败: ${res.data.errmsg}`);
  }

  return { success: true, target: '企业微信群机器人' };
}

/**
 * 发送 Server酱 消息
 */
async function sendServerChan(config, emailData) {
  const { sendKey, channel } = config;
  const title = emailData.subject.substring(0, 50);
  const content = buildMessageContent(emailData, 'markdown');

  const res = await axios.post(`https://sctapi.ftqq.com/${sendKey}.send`, {
    title,
    desp: content,
    channel: channel || '9',
  }, { timeout: 10000 });

  if (res.data.code !== 0) {
    throw new Error(`发送消息失败: ${res.data.message}`);
  }

  return { success: true, target: 'Server酱' };
}

/**
 * 发送 Telegram 消息
 */
async function sendTelegram(config, emailData) {
  const { botToken, chatId, apiProxy } = config;
  const baseUrl = apiProxy || 'https://api.telegram.org';
  const content = buildMessageContent(emailData, 'markdown');

  const res = await axios.post(`${baseUrl}/bot${botToken}/sendMessage`, {
    chat_id: chatId,
    text: content,
    parse_mode: 'Markdown',
  }, { timeout: 10000 });

  if (!res.data.ok) {
    throw new Error(`发送消息失败: ${res.data.description}`);
  }

  return { success: true, target: 'Telegram' };
}

/**
 * 发送钉钉机器人消息
 */
async function sendDingtalk(config, emailData) {
  const { webhookUrl, secret } = config;
  const content = buildMessageContent(emailData, 'markdown');

  let url = webhookUrl;
  if (secret) {
    const timestamp = Date.now();
    const stringToSign = `${timestamp}\n${secret}`;
    const sign = encodeURIComponent(crypto.createHmac('sha256', secret).update(stringToSign).digest('base64'));
    url = `${webhookUrl}&timestamp=${timestamp}&sign=${sign}`;
  }

  const res = await axios.post(url, {
    msgtype: 'markdown',
    markdown: {
      title: emailData.subject.substring(0, 50),
      text: content,
    },
  }, { timeout: 10000 });

  if (res.data.errcode !== 0) {
    throw new Error(`发送消息失败: ${res.data.errmsg}`);
  }

  return { success: true, target: '钉钉机器人' };
}

/**
 * 发送飞书机器人消息
 */
async function sendFeishu(config, emailData) {
  const { webhookUrl, secret } = config;
  const content = buildMessageContent(emailData, 'text');

  let url = webhookUrl;
  const payload = {};

  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const stringToSign = `${timestamp}\n${secret}`;
    const sign = crypto.createHmac('sha256', stringToSign).update('').digest('base64');
    payload.timestamp = timestamp;
    payload.sign = sign;
  }

  payload.msg_type = 'text';
  payload.content = { text: content };

  const res = await axios.post(url, payload, { timeout: 10000 });

  if (res.data.code !== 0) {
    throw new Error(`发送消息失败: ${res.data.msg}`);
  }

  return { success: true, target: '飞书机器人' };
}

/**
 * 发送自定义 Webhook 消息
 */
async function sendCustomWebhook(config, emailData) {
  const { webhookUrl, method, headers, bodyTemplate } = config;

  let body;
  if (bodyTemplate) {
    body = bodyTemplate
      .replace(/\{\{title\}\}/g, emailData.subject.substring(0, 50))
      .replace(/\{\{content\}\}/g, buildMessageContent(emailData, 'text'));
  } else {
    body = {
      title: emailData.subject.substring(0, 50),
      content: buildMessageContent(emailData, 'text'),
      email: emailData,
    };
  }

  const reqConfig = {
    method: method || 'POST',
    url: webhookUrl,
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
      ...(headers ? JSON.parse(headers) : {}),
    },
  };

  if (method === 'GET') {
    reqConfig.params = typeof body === 'object' ? body : { content: body };
  } else {
    reqConfig.data = body;
  }

  const res = await axios(reqConfig);

  if (res.status >= 400) {
    throw new Error(`发送消息失败: HTTP ${res.status}`);
  }

  return { success: true, target: '自定义Webhook' };
}

/**
 * 根据通知类型发送消息
 */
async function sendByType(type, config, emailData) {
  switch (type) {
    case 'wecom_app':
      return sendWecomApp(config, emailData);
    case 'wecom_webhook':
      return sendWecomWebhook(config, emailData);
    case 'server_chan':
      return sendServerChan(config, emailData);
    case 'telegram':
      return sendTelegram(config, emailData);
    case 'dingtalk':
      return sendDingtalk(config, emailData);
    case 'feishu':
      return sendFeishu(config, emailData);
    case 'custom_webhook':
      return sendCustomWebhook(config, emailData);
    default:
      throw new Error(`不支持的通知渠道类型: ${type}`);
  }
}

/**
 * 处理新邮件的通知流程
 */
async function processNotification(userId, emailData, logId) {
  const db = getDB();

  // 获取用户的所有活跃通知渠道
  const notifications = db.data.notifications.filter(n => n.userId === userId && n.active);

  if (notifications.length === 0) {
    console.log(`[NOTIFY] No active notifications for user ${userId}, skipping`);
    updateLogStatus(logId, 'no_channel', null, '未配置通知渠道');
    return;
  }

  // 获取用户的过滤规则
  const filters = db.data.filters.filter(f => f.userId === userId && f.active);

  // 检查过滤规则
  for (const filter of filters) {
    const filterResult = matchesFilter(emailData, filter);
    if (!filterResult.match) {
      console.log(`[NOTIFY] Email filtered out: ${filterResult.reason}`);
      updateLogStatus(logId, 'filtered', null, `已过滤: ${filterResult.reason}`);
      return;
    }
  }

  // 发送到所有活跃的通知渠道
  let lastResult = null;
  for (const notification of notifications) {
    try {
      const result = await sendByType(notification.type, notification.config, emailData);
      if (result.success) {
        console.log(`[NOTIFY] Notification sent via ${result.target}`);
        lastResult = result;
      }
    } catch (err) {
      console.error(`[NOTIFY] Failed to send via ${notification.name}: ${err.message}`);
      lastResult = { success: false, error: err.message };
    }
  }

  if (lastResult && lastResult.success) {
    updateLogStatus(logId, 'forwarded', lastResult.target);
  } else {
    updateLogStatus(logId, 'failed', null, lastResult?.error || '发送失败');
  }
}

/**
 * 更新邮件日志状态
 */
function updateLogStatus(logId, status, target, error) {
  const db = getDB();
  const log = db.data.emailLogs.find(l => l.id === logId);
  if (log) {
    log.forwardStatus = status;
    if (target) log.forwardTarget = target;
    if (error) log.errorDetails = error;
    db.write().catch(err => console.error('[DB] Failed to update log status:', err));
  }
}

/**
 * 测试通知发送
 */
async function testSend(notification) {
  const testEmailData = {
    subject: '🧪 测试邮件 - 系统连接验证',
    senderName: '系统测试',
    senderEmail: 'test@system.local',
    toEmail: 'test@example.com',
    snippet: '这是一封测试邮件，用于验证通知推送是否正常工作。',
    receivedAt: new Date().toISOString(),
  };

  try {
    return await sendByType(notification.type, notification.config, testEmailData);
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  processNotification,
  testSend,
  sendByType,
  matchesFilter,
};
