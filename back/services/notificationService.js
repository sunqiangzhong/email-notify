/**
 * 通知服务模块
 * 支持 Server酱、企业微信应用消息、企业微信群机器人、自定义 Webhook
 */
const axios = require('axios');
const { filtersDb } = require('../models/database');

// 企业微信 access_token 缓存
const tokenCache = new Map();

/**
 * 发送通知
 */
const sendNotification = async function(notification, emailData) {
  try {
    var type = notification.type;
    var content = formatContent(emailData);

    if (type === 'serverchan') return await sendServerChan(notification.webhookUrl, content);
    if (type === 'wecom') return await sendWeComApp(notification, content);
    if (type === 'wecom_bot') return await sendWeComBot(notification.webhookUrl, content);
    if (type === 'custom') return await sendCustomWebhook(notification.webhookUrl, content);
    return { success: false, error: '不支持的通知类型: ' + type };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * 格式化通知内容
 */
function formatContent(emailData) {
  var from = emailData.from || '未知';
  var subject = emailData.subject || '（无主题）';
  var text = emailData.text || '';
  var date = emailData.date;
  var attachments = emailData.attachments || 0;
  var time = date ? new Date(date).toLocaleString('zh-CN') : new Date().toLocaleString('zh-CN');
  var snippet = text.substring(0, 300).replace(/\r?\n/g, ' ').trim();

  return {
    title: subject,
    markdown: '## 📬 新邮件通知\n' +
      '> **发件人**: ' + from + '\n' +
      '> **主题**: ' + subject + '\n' +
      '> **时间**: ' + time + '\n' +
      (attachments > 0 ? '> **附件**: ' + attachments + ' 个\n' : '') +
      (snippet ? '> **摘要**: ' + snippet + '\n' : ''),
    text: '📬 新邮件通知\n' +
      '发件人: ' + from + '\n' +
      '主题: ' + subject + '\n' +
      '时间: ' + time + '\n' +
      (snippet ? '摘要: ' + snippet : ''),
    desp: '## 📬 新邮件通知\n\n' +
      '> **发件人**: ' + from + '\n\n' +
      '> **主题**: ' + subject + '\n\n' +
      '> **时间**: ' + time + '\n\n' +
      (snippet ? '### 摘要\n' + snippet : ''),
  };
}

// ============================================================
//  Server酱
// ============================================================
async function sendServerChan(webhookUrl, content) {
  try {
    var url = webhookUrl.trim();
    if (url.indexOf('.send') === -1) {
      url = url.charAt(url.length - 1) === '/' ? url + '.send' : url + '.send';
    }
    var resp = await axios.post(url, { title: content.title.substring(0, 100), desp: content.desp }, { timeout: 15000 });
    if (resp.data && resp.data.code === 0) return { success: true };
    return { success: false, error: resp.data ? resp.data.message : '未知错误' };
  } catch (e) {
    return { success: false, error: e.response && e.response.data ? e.response.data.message : e.message };
  }
}

// ============================================================
//  企业微信 — 应用消息 (corpid + agentid + secret)
// ============================================================

async function getWeComToken(corpid, secret) {
  var cacheKey = corpid + ':' + secret;
  var cached = tokenCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.token;

  var url = 'https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=' + corpid + '&corpsecret=' + secret;
  var resp = await axios.get(url, { timeout: 10000 });
  var data = resp.data;

  if (data.errcode !== 0) {
    throw new Error('获取 access_token 失败: [' + data.errcode + '] ' + data.errmsg);
  }

  tokenCache.set(cacheKey, {
    token: data.access_token,
    expires: Date.now() + (data.expires_in - 300) * 1000,
  });
  return data.access_token;
}

/**
 * 发送企业微信应用消息
 *
 * notification.extra: { corpid, agentid, secret, touser }
 */
async function sendWeComApp(notification, content) {
  try {
    var extra = notification.extra || {};
    var corpid = extra.corpid;
    var agentid = extra.agentid;
    var secret = extra.secret;
    var touser = extra.touser || '@all';

    if (!corpid || !agentid || !secret) {
      return { success: false, error: '企业微信应用消息需要配置 corpid、agentid、secret' };
    }

    var token = await getWeComToken(corpid, secret);
    var url = 'https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=' + token;

    var markdownBytes = Buffer.byteLength(content.markdown, 'utf8');
    var body;

    if (markdownBytes <= 2048) {
      body = {
        touser: touser,
        msgtype: 'markdown',
        agentid: parseInt(agentid),
        markdown: { content: content.markdown },
      };
    } else {
      body = {
        touser: touser,
        msgtype: 'text',
        agentid: parseInt(agentid),
        text: { content: content.text.substring(0, 2048) },
      };
    }

    var resp = await axios.post(url, body, { timeout: 15000 });
    var rd = resp.data;
    if (rd && rd.errcode === 0) return { success: true };
    return { success: false, error: rd ? ('[' + rd.errcode + '] ' + rd.errmsg) : '未知错误' };
  } catch (e) {
    var d = e.response ? e.response.data : null;
    return { success: false, error: d ? ('[' + d.errcode + '] ' + d.errmsg) : e.message };
  }
}

// ============================================================
//  企业微信群机器人 Webhook (只需 key)
// ============================================================
async function sendWeComBot(webhookUrl, content) {
  try {
    var url = webhookUrl.trim();
    if (url.indexOf('http') !== 0) {
      url = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=' + url;
    }

    var markdownBytes = Buffer.byteLength(content.markdown, 'utf8');
    var body = markdownBytes <= 4000
      ? { msgtype: 'markdown', markdown: { content: content.markdown } }
      : { msgtype: 'text', text: { content: content.text.substring(0, 2000) } };

    var resp = await axios.post(url, body, { timeout: 15000 });
    var rd = resp.data;
    if (rd && rd.errcode === 0) return { success: true };
    return { success: false, error: rd ? ('[' + rd.errcode + '] ' + rd.errmsg) : '未知错误' };
  } catch (e) {
    var d = e.response ? e.response.data : null;
    return { success: false, error: d ? ('[' + d.errcode + '] ' + d.errmsg) : e.message };
  }
}

// ============================================================
//  自定义 Webhook
// ============================================================
async function sendCustomWebhook(webhookUrl, content) {
  try {
    var resp = await axios.post(webhookUrl, {
      msgtype: 'text',
      text: { content: content.text },
      title: content.title,
      timestamp: new Date().toISOString(),
    }, { timeout: 15000 });
    if (resp.status >= 200 && resp.status < 300) return { success: true };
    return { success: false, error: 'HTTP ' + resp.status };
  } catch (e) {
    var msg = e.response && e.response.data ? e.response.data.message : e.message;
    return { success: false, error: msg };
  }
}

// ============================================================
//  过滤规则
// ============================================================
async function checkFilters(userId, emailId, emailData) {
  var userFilters = filtersDb.get('filters').filter({ userId: userId, active: true }).value();
  if (userFilters.length === 0) return true;

  for (var i = 0; i < userFilters.length; i++) {
    var filter = userFilters[i];
    if (filter.emailId && filter.emailId !== emailId) continue;
    if (!filter.keywords || filter.keywords.length === 0) return true;

    var text = ((emailData.from || '') + ' ' + (emailData.subject || '') + ' ' + (emailData.text || '')).toLowerCase();

    if (filter.matchType === 'all') {
      if (filter.keywords.every(function(kw) { return text.indexOf(kw.toLowerCase()) >= 0; })) return true;
    } else {
      if (filter.keywords.some(function(kw) { return text.indexOf(kw.toLowerCase()) >= 0; })) return true;
    }
  }
  return false;
}

module.exports = { sendNotification: sendNotification, checkFilters: checkFilters };
