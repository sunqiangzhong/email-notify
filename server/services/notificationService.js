/**
 * 微信通知服务
 * 
 * 支持: Server酱 / 企业微信 / PushDeer / 自定义 Webhook
 * 包含: 关键词过滤 + 免打扰时间
 */
const axios = require('axios');
const { getDB } = require('../models/db');

/**
 * 检查当前是否在免打扰时段
 */
function isInDNDPeriod(rules) {
  if (!rules || !rules.dndEnabled) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = (rules.dndStart || '22:00').split(':').map(Number);
  const [endH, endM] = (rules.dndEnd || '08:00').split(':').map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  // 处理跨午夜的情况 (如 22:00 - 08:00)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

/**
 * 检查邮件是否匹配过滤规则
 */
function matchesFilter(emailData, rules) {
  // 如果未启用过滤，全部通过
  if (!rules || !rules.enableFilter) return { match: true, reason: '过滤器未启用' };

  const keywords = (rules.keywords || '')
    .split(',')
    .map(k => k.trim().toLowerCase())
    .filter(k => k.length > 0);

  // 没有关键词，全部通过
  if (keywords.length === 0) return { match: true, reason: '无关键词规则' };

  const textToMatch = `${emailData.subject} ${emailData.snippet} ${emailData.senderName} ${emailData.senderEmail}`.toLowerCase();

  const matchedKeywords = keywords.filter(kw => textToMatch.includes(kw));

  if (matchedKeywords.length > 0) {
    return { match: true, reason: `匹配关键词: ${matchedKeywords.join(', ')}` };
  }

  return { match: false, reason: `未匹配关键词过滤规则 [${keywords.join(', ')}]` };
}

/**
 * 根据 provider 发送微信通知
 */
async function sendNotification(provider, token, secret, webhookUrl, emailData) {
  const title = emailData.subject.substring(0, 50);
  const content = [
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

  const plainText = [
    `新邮件通知`,
    `发件人: ${emailData.senderName} <${emailData.senderEmail}>`,
    `收件箱: ${emailData.toEmail}`,
    `主题: ${emailData.subject}`,
    `时间: ${new Date(emailData.receivedAt).toLocaleString('zh-CN')}`,
    ``,
    emailData.snippet,
  ].join('\n');

  try {
    switch (provider) {
      case 'server_chan': {
        // Server酱: https://sctapi.ftqq.com/{key}.send
        const url = webhookUrl || `https://sctapi.ftqq.com/${token}.send`;
        await axios.post(url, {
          title: title,
          desp: content,
        }, { timeout: 10000 });
        return { success: true, target: 'Server酱' };
      }

      case 'work_wechat': {
        // 企业微信群机器人 Webhook
        const url = webhookUrl;
        if (!url) throw new Error('企业微信 Webhook URL 未配置');
        await axios.post(url, {
          msgtype: 'markdown',
          markdown: {
            content: content,
          },
        }, { timeout: 10000 });
        return { success: true, target: '企业微信' };
      }

      case 'push_deer': {
        // PushDeer
        const url = webhookUrl || 'https://api2.pushdeer.com/message/push';
        await axios.post(url, {
          pushkey: token,
          text: title,
          desp: content,
          type: 'markdown',
        }, { timeout: 10000 });
        return { success: true, target: 'PushDeer' };
      }

      case 'custom_webhook': {
        // 自定义 Webhook
        const url = webhookUrl;
        if (!url) throw new Error('自定义 Webhook URL 未配置');
        await axios.post(url, {
          title: title,
          content: plainText,
          markdown: content,
          email: emailData,
        }, {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
        });
        return { success: true, target: '自定义Webhook' };
      }

      default:
        throw new Error(`不支持的通知渠道: ${provider}`);
    }
  } catch (err) {
    return {
      success: false,
      error: err.response?.data?.message || err.message || '推送失败',
    };
  }
}

/**
 * 处理新邮件的通知流程
 */
async function processNotification(userId, emailData, logId) {
  const db = getDB();

  // 获取用户的微信配置
  const wechatConfig = db.data.wechatConfigs.find(w => w.userId === userId);
  if (!wechatConfig) {
    console.log(`[NOTIFY] No WeChat config for user ${userId}, skipping`);
    updateLogStatus(logId, 'failed', null, '未配置微信通知');
    return;
  }

  // 检查免打扰时段
  if (isInDNDPeriod(wechatConfig.rules)) {
    console.log(`[NOTIFY] User ${userId} in DND period, skipping`);
    updateLogStatus(logId, 'failed', null, '免打扰时段');
    return;
  }

  // 检查关键词过滤
  const filterResult = matchesFilter(emailData, wechatConfig.rules);
  if (!filterResult.match) {
    console.log(`[NOTIFY] Email filtered out: ${filterResult.reason}`);
    updateLogStatus(logId, 'failed', null, `已过滤: ${filterResult.reason}`);
    return;
  }

  // 发送通知
  const result = await sendNotification(
    wechatConfig.provider,
    wechatConfig.token,
    wechatConfig.secret,
    wechatConfig.webhookUrl,
    emailData
  );

  if (result.success) {
    console.log(`[NOTIFY] Notification sent via ${result.target}`);
    updateLogStatus(logId, 'forwarded', result.target);
  } else {
    console.error(`[NOTIFY] Notification failed: ${result.error}`);
    updateLogStatus(logId, 'failed', null, result.error);
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
    db.write();
  }
}

/**
 * 测试微信通知发送
 */
async function testNotification(userId) {
  const db = getDB();
  const wechatConfig = db.data.wechatConfigs.find(w => w.userId === userId);

  if (!wechatConfig) {
    return { success: false, error: '未配置微信通知' };
  }

  const testEmailData = {
    subject: '🧪 测试邮件 - 系统连接验证',
    senderName: '系统测试',
    senderEmail: 'test@system.local',
    toEmail: 'test@example.com',
    snippet: '这是一封测试邮件，用于验证微信通知推送是否正常工作。',
    receivedAt: new Date().toISOString(),
  };

  return await sendNotification(
    wechatConfig.provider,
    wechatConfig.token,
    wechatConfig.secret,
    wechatConfig.webhookUrl,
    testEmailData
  );
}

module.exports = {
  processNotification,
  testNotification,
  sendNotification,
  matchesFilter,
  isInDNDPeriod,
};
