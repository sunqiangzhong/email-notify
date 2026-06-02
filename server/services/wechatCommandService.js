/**
 * 企业微信交互命令服务
 * 参考 MoviePilot 企业微信菜单和命令处理机制
 *
 * 功能：
 * 1. 注册自定义菜单到企业微信应用
 * 2. 处理菜单点击事件（click）
 * 3. 处理文本消息命令
 * 4. 发送回复消息
 */
const axios = require('axios');
const { getDB } = require('../models/db');

/**
 * 命令注册表
 * 参考 MoviePilot commands 格式：{ "/cmd": { description, category, handler } }
 */
const COMMANDS = {
  '/help': {
    description: '查看帮助',
    category: '帮助',
    handler: cmdHelp,
  },
  '/status': {
    description: '系统状态',
    category: '系统',
    handler: cmdStatus,
  },
  '/mails': {
    description: '邮箱列表',
    category: '系统',
    handler: cmdMails,
  },
  '/test': {
    description: '测试通知',
    category: '通知',
    handler: cmdTest,
  },
};

// ============ 命令处理函数 ============

async function cmdHelp(userId) {
  const lines = ['📖 可用命令列表：', ''];
  const categories = {};
  for (const [cmd, info] of Object.entries(COMMANDS)) {
    if (!categories[info.category]) categories[info.category] = [];
    categories[info.category].push(`${cmd} - ${info.description}`);
  }
  for (const [cat, cmds] of Object.entries(categories)) {
    lines.push(`【${cat}】`);
    cmds.forEach(c => lines.push(`  ${c}`));
    lines.push('');
  }
  lines.push('也可以直接发送命令文本，例如: /status');
  return lines.join('\n');
}

async function cmdStatus(userId) {
  const db = getDB();
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const memMB = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);

  const accounts = db.data.accounts.filter(a => a.userId === userId);
  const activeAccounts = accounts.filter(a => a.active !== false);
  const notifications = db.data.notifications.filter(n => n.userId === userId && n.active);
  const proxy = db.data.proxies.find(p => p.userId === userId);

  const lines = [
    '📊 系统状态',
    '',
    `运行时间: ${hours}小时${minutes}分钟`,
    `内存占用: ${memMB} MB`,
    '',
    `邮箱账户: ${activeAccounts.length}/${accounts.length} 个活跃`,
    `通知渠道: ${notifications.length} 个启用`,
    `代理状态: ${proxy ? `已配置 (${proxy.type}://${proxy.host}:${proxy.port})` : '未配置'}`,
  ];

  return lines.join('\n');
}

async function cmdMails(userId) {
  const db = getDB();
  const accounts = db.data.accounts.filter(a => a.userId === userId);

  if (accounts.length === 0) {
    return '📭 暂无邮箱账户';
  }

  const lines = ['📬 邮箱列表：', ''];
  accounts.forEach((acc, i) => {
    const status = acc.active !== false ? '✅' : '❌';
    const lastSync = acc.lastSync ? new Date(acc.lastSync).toLocaleString('zh-CN') : '未同步';
    lines.push(`${status} ${acc.name || acc.email}`);
    lines.push(`   ${acc.email}`);
    lines.push(`   最后同步: ${lastSync}`);
    if (i < accounts.length - 1) lines.push('');
  });

  return lines.join('\n');
}

async function cmdTest(userId) {
  const db = getDB();
  const notifications = db.data.notifications.filter(n => n.userId === userId && n.active);

  if (notifications.length === 0) {
    return '⚠️ 没有启用的通知渠道，请先配置通知';
  }

  // 通过 notificationService 发送测试
  const notificationService = require('./notificationService');
  const testEmailData = {
    subject: '🧪 测试通知 - 命令触发',
    senderName: '系统测试',
    senderEmail: 'test@system.local',
    toEmail: 'test@example.com',
    snippet: '这是一条通过企业微信命令触发的测试通知，说明通知功能正常工作。',
    receivedAt: new Date().toISOString(),
  };

  const results = [];
  for (const notif of notifications) {
    try {
      const result = await notificationService.sendByType(notif.type, notif.config, testEmailData);
      results.push(`✅ ${notif.name}: 发送成功`);
    } catch (err) {
      results.push(`❌ ${notif.name}: ${err.message}`);
    }
  }

  return ['🧪 测试结果：', '', ...results].join('\n');
}

// ============ 企业微信 API ============

/**
 * 获取 access_token（带缓存）
 */
let tokenCache = { token: null, expiresAt: 0, corpId: null, appSecret: null };

async function getAccessToken(config) {
  const corpId = String(config.corpId || '').trim();
  const appSecret = String(config.appSecret || '').trim();
  const proxyUrl = config.proxyUrl;
  const baseUrl = proxyUrl || 'https://qyapi.weixin.qq.com';

  if (
    tokenCache.token &&
    Date.now() < tokenCache.expiresAt &&
    tokenCache.corpId === corpId &&
    tokenCache.appSecret === appSecret
  ) {
    return tokenCache.token;
  }

  const res = await axios.get(`${baseUrl}/cgi-bin/gettoken`, {
    params: { corpid: corpId, corpsecret: appSecret },
    timeout: 10000,
  });

  if (res.data.errcode !== 0) {
    throw new Error(`获取 access_token 失败: ${res.data.errmsg}`);
  }

  tokenCache = {
    token: res.data.access_token,
    expiresAt: Date.now() + (res.data.expires_in - 300) * 1000, // 提前5分钟刷新
    corpId,
    appSecret,
  };

  return tokenCache.token;
}

/**
 * 发送文本消息给用户
 * 对齐 MoviePilot WeChat.__send_message
 */
async function sendTextMessage(config, content, userId) {
  const { agentId, proxyUrl } = config;
  const baseUrl = proxyUrl || 'https://qyapi.weixin.qq.com';
  const accessToken = await getAccessToken(config);

  const res = await axios.post(`${baseUrl}/cgi-bin/message/send?access_token=${accessToken}`, {
    touser: userId || '@all',
    msgtype: 'text',
    agentid: parseInt(agentId),
    text: { content },
    safe: 0,
    enable_id_trans: 0,
    enable_duplicate_check: 0,
  }, {
    timeout: 10000,
  });

  if (res.data.errcode !== 0) {
    throw new Error(`发送消息失败: ${res.data.errmsg}`);
  }

  return true;
}

/**
 * 注册自定义菜单
 * 对齐 MoviePilot WeChat.create_menus
 *
 * 企业微信菜单规则：
 * - 一级菜单最多 3 个
 * - 每个一级菜单下最多 5 个子菜单
 * - 菜单名称：一级最多 16 字节，子菜单最多 60 字节
 */
async function createMenus(config) {
  const agentId = String(config.agentId || '').trim();
  const proxyUrl = config.proxyUrl;
  const baseUrl = proxyUrl || 'https://qyapi.weixin.qq.com';
  const accessToken = await getAccessToken(config);

  console.log(`[WECHAT] 创建菜单: agentId=${agentId}, baseUrl=${baseUrl}`);

  // 按 category 分组（对齐 MoviePilot）
  const categoryDict = {};
  for (const [key, value] of Object.entries(COMMANDS)) {
    const category = value.category;
    if (!categoryDict[category]) categoryDict[category] = {};
    categoryDict[category][key] = value;
  }

  // 构建菜单
  const buttons = [];
  for (const [category, commands] of Object.entries(categoryDict)) {
    const subButtons = [];
    for (const [key, value] of Object.entries(commands)) {
      subButtons.push({
        type: 'click',
        name: value.description,
        key: key,
      });
    }
    buttons.push({
      name: category,
      sub_button: subButtons.slice(0, 5), // 最多5个子菜单
    });
  }

  const menuData = {
    button: buttons.slice(0, 3), // 最多3个一级菜单
  };

  console.log('[WECHAT] 注册自定义菜单:', JSON.stringify(menuData, null, 2));

  const res = await axios.post(
    `${baseUrl}/cgi-bin/menu/create?access_token=${accessToken}&agentid=${agentId}`,
    menuData,
    { timeout: 10000 }
  );

  if (res.data.errcode !== 0) {
    let extraTip = '';
    if (res.data.errcode === 301021 || res.data.errcode === 301002 || String(res.data.errmsg).includes('not allow operate another agent')) {
      extraTip = ' (温馨提示：创建微信自定义菜单失败！这通常是因为您在配置企业微信通知时，将“应用 Secret (AgentSecret)”误填成了“管理组 Secret / 通讯录 Secret (CorpSecret)”，或者是填写的 AgentId 与该 Secret 所代表的自建应用不匹配，请登录企业微信后台并检查您的“自建应用”详情页)';
    }
    const fullErrorMsg = `${res.data.errmsg}${extraTip}`;
    console.error(`[WECHAT] 创建菜单失败: [${res.data.errcode}] ${fullErrorMsg}`);
    throw new Error(`[${res.data.errcode}] ${fullErrorMsg}`);
  }

  console.log('[WECHAT] 菜单创建成功');
  return true;
}

/**
 * 处理企业微信消息
 * 对齐 MoviePilot WechatModule.message_parser
 *
 * @param {string} msgType - 消息类型 (text/event)
 * @param {string} event - 事件类型 (click)
 * @param {string} content - 消息内容或 EventKey
 * @param {string} fromUser - 发送者 UserID
 * @param {object} config - 企业微信通知配置
 * @returns {string} 回复内容
 */
async function processMessage(msgType, event, content, fromUser, config) {
  console.log(`[WECHAT] 处理消息: type=${msgType}, event=${event}, content=${content}, from=${fromUser}`);

  let command = null;
  const internalUserId = config?.userId || fromUser;

  if (msgType === 'event' && event === 'click') {
    // 菜单点击事件，content 就是 EventKey（命令）
    command = content;
  } else if (msgType === 'text' && content) {
    // 文本消息，检查是否是命令
    const trimmed = content.trim();
    if (trimmed.startsWith('/')) {
      command = trimmed.split(/\s+/)[0]; // 取第一个词作为命令
    }
  }

  if (command && COMMANDS[command]) {
    console.log(`[WECHAT] 执行命令: ${command}, internalUserId=${internalUserId}, from=${fromUser}`);
    try {
      return await COMMANDS[command].handler(internalUserId);
    } catch (err) {
      console.error(`[WECHAT] 命令执行失败: ${command}`, err);
      return `❌ 命令执行失败: ${err.message}`;
    }
  }

  // 非命令文本消息，返回帮助提示
  if (msgType === 'text' && content) {
    return `收到消息: "${content}"\n\n发送 /help 查看可用命令`;
  }

  return null;
}

module.exports = {
  COMMANDS,
  getAccessToken,
  sendTextMessage,
  createMenus,
  processMessage,
};
