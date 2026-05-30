/**
 * Gmail IMAP 代理测试脚本
 * 在 server 目录下运行: node gmail_test.js
 */
require('dotenv').config();
const imaps = require('imap-simple');
const { SocksProxyAgent } = require('socks-proxy-agent');

// ========== 配置区域 ==========
const PROXY_CONFIG = {
  host: '192.168.5.199',
  port: 7890,
  type: 'socks5',
};

const GMAIL_CONFIG = {
  email: process.env.TEST_GMAIL || '你的邮箱@gmail.com',
  password: process.env.TEST_GMAIL_PASSWORD || '你的应用专用密码',
};

// ========== 测试代码 ==========
console.log('=== Gmail IMAP 代理连接测试 ===');
console.log('代理:', `${PROXY_CONFIG.type}://${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`);
console.log('邮箱:', GMAIL_CONFIG.email);
console.log('');

// 创建 SOCKS5 代理 Agent
const proxyUrl = `${PROXY_CONFIG.type}://${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`;
const agent = new SocksProxyAgent(proxyUrl);

const imapConfig = {
  imap: {
    user: GMAIL_CONFIG.email,
    password: GMAIL_CONFIG.password,
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: 15000,
    connTimeout: 15000,
    agent: agent,  // 关键：添加代理 agent
  },
};

console.log('正在通过代理连接 Gmail IMAP...');

imaps.connect(imapConfig)
  .then(conn => {
    console.log('[OK] ✅ 连接成功!');

    // 尝试打开 INBOX
    return conn.openBox('INBOX')
      .then(() => {
        console.log('[OK] ✅ INBOX 打开成功!');

        // 获取邮件数量
        return conn.search(['ALL'], { bodies: ['HEADER'], markSeen: false, struct: false });
      })
      .then(msgs => {
        console.log(`[OK] ✅ 收件箱共 ${msgs.length} 封邮件`);
        conn.end();
        console.log('');
        console.log('✅ 测试完成 - 代理连接 Gmail 成功！');
        process.exit(0);
      });
  })
  .catch(err => {
    console.error('[FAIL] ❌ 连接失败:', err.message);
    console.error('');

    // 分析错误类型
    const errMsg = err.message || '';

    if (errMsg.includes('Invalid credentials') || errMsg.includes('AUTHENTICATE')) {
      console.error('🔍 问题分析: Gmail 认证失败');
      console.error('');
      console.error('💡 解决方案:');
      console.error('  1. 使用「应用专用密码」（推荐）');
      console.error('     - 访问: https://myaccount.google.com/apppasswords');
      console.error('     - 生成一个应用专用密码');
      console.error('     - 用这个密码替换上面的 TEST_GMAIL_PASSWORD');
      console.error('');
      console.error('  2. 或者允许不安全应用访问');
      console.error('     - 访问: https://myaccount.google.com/lesssecureapps');
      console.error('     - 启用此选项（不推荐）');
    } else if (errMsg.includes('timeout') || errMsg.includes('ETIMEDOUT')) {
      console.error('🔍 问题分析: 连接超时');
      console.error('');
      console.error('💡 解决方案:');
      console.error('  1. 检查代理服务器是否正常运行');
      console.error('  2. 增加超时时间');
      console.error('  3. 测试代理连通性: curl --socks5 192.168.5.199:7890 https://www.google.com');
    } else if (errMsg.includes('Connection ended unexpectedly') || errMsg.includes('ECONNRESET')) {
      console.error('🔍 问题分析: 连接被意外关闭');
      console.error('');
      console.error('可能原因:');
      console.error('  1. Gmail 认证失败（服务器主动断开）');
      console.error('  2. 代理服务器中断连接');
      console.error('  3. TLS/SSL 握手失败');
      console.error('');
      console.error('💡 解决方案:');
      console.error('  1. 首先确认使用「应用专用密码」');
      console.error('  2. 检查代理服务器日志');
      console.error('  3. 尝试直连（不用代理）测试 Gmail');
    } else {
      console.error('🔍 问题分析: 未知错误');
      console.error('');
      console.error('💡 建议:');
      console.error('  1. 检查代理服务器日志');
      console.error('  2. 确认 Gmail 应用专用密码正确');
      console.error('  3. 查看完整错误堆栈:');
      console.error(err);
    }

    process.exit(1);
  });
