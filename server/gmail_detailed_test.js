/**
 * Gmail IMAP 详细诊断脚本
 * 在 server 目录下运行: node gmail_detailed_test.js
 */
require('dotenv').config();
const imaps = require('imap-simple');
const { SocksProxyAgent } = require('socks-proxy-agent');

// ========== 配置 ==========
const PROXY = {
  host: '192.168.5.199',
  port: 7890,
  type: 'socks5',
};

const GMAIL = {
  email: '你的邮箱@gmail.com',
  password: '你的应用专用密码',  // ← 刚刚生成的那个
};

// ========== 测试流程 ==========
async function testGmailConnection() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     Gmail IMAP 详细诊断                 ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
  console.log('📧 邮箱:', GMAIL.email);
  console.log('🌐 代理:', `${PROXY.type}://${PROXY.host}:${PROXY.port}`);
  console.log('');

  // 步骤1: 创建代理 Agent
  console.log('【步骤1】创建 SOCKS5 代理 Agent...');
  try {
    const proxyUrl = `${PROXY.type}://${PROXY.host}:${PROXY.port}`;
    const agent = new SocksProxyAgent(proxyUrl);
    console.log('✅ Agent 创建成功');
    console.log('   Agent 类型:', agent.constructor.name);
    console.log('');
  } catch (err) {
    console.error('❌ Agent 创建失败:', err.message);
    return;
  }

  // 步骤2: 构建 IMAP 配置
  console.log('【步骤2】构建 IMAP 配置...');
  const proxyUrl2 = `${PROXY.type}://${PROXY.host}:${PROXY.port}`;
  const agent2 = new SocksProxyAgent(proxyUrl2);

  const imapConfig = {
    imap: {
      user: GMAIL.email,
      password: GMAIL.password,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: {
        rejectUnauthorized: false,
        // 降低 TLS 版本要求，提高代理兼容性
        minVersion: 'TLSv1',
        maxVersion: 'TLSv1.3',
        ciphers: 'DEFAULT@SECLEVEL=1',
      },
      authTimeout: 20000,
      connTimeout: 20000,
      keepalive: false,
      agent: agent2,
    },
  };

  console.log('✅ 配置构建完成');
  console.log('   配置详情:', JSON.stringify({
    user: imapConfig.imap.user,
    host: imapConfig.imap.host,
    port: imapConfig.imap.port,
    tls: imapConfig.imap.tls,
    hasAgent: !!imapConfig.imap.agent,
  }, null, 2));
  console.log('');

  // 步骤3: 尝试连接
  console.log('【步骤3】尝试连接 Gmail IMAP...');
  console.log('   （这可能需要 10-20 秒）');
  console.log('');

  const startTime = Date.now();

  try {
    console.log('   正在建立 TCP 连接...');
    const connection = await imaps.connect(imapConfig);
    const connectTime = Date.now() - startTime;
    console.log(`✅ TCP 连接成功！耗时: ${connectTime}ms`);
    console.log('');

    // 步骤4: 获取服务器信息
    console.log('【步骤4】获取服务器信息...');
    try {
      const rawConn = connection.imap || connection.source || connection;
      if (rawConn && rawConn.serverGreeting) {
        console.log('   服务器问候:', rawConn.serverGreeting);
      }
    } catch (e) {
      console.log('   （无法获取服务器问候）');
    }
    console.log('');

    // 步骤5: 打开 INBOX
    console.log('【步骤5】打开 INBOX...');
    const openStart = Date.now();
    const box = await connection.openBox('INBOX');
    const openTime = Date.now() - openStart;
    console.log(`✅ INBOX 打开成功！耗时: ${openTime}ms`);

    const total = box?.messages?.total ?? box?.total ?? 0;
    const unseen = box?.messages?.new ?? box?.unseen ?? 0;
    console.log(`   邮件总数: ${total}`);
    console.log(`   未读邮件: ${unseen}`);
    console.log('');

    // 步骤6: 测试搜索
    console.log('【步骤6】测试邮件搜索...');
    const searchStart = Date.now();
    const messages = await connection.search(['ALL'], {
      bodies: ['HEADER'],
      markSeen: false,
      struct: false,
    });
    const searchTime = Date.now() - searchStart;
    console.log(`✅ 搜索成功！耗时: ${searchTime}ms`);
    console.log(`   找到 ${messages.length} 封邮件`);
    console.log('');

    // 关闭连接
    connection.end();
    console.log('✅ 连接已正常关闭');
    console.log('');

    // 总结
    console.log('╔══════════════════════════════════════════╗');
    console.log('║     ✅ 测试完成 - 一切正常！             ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log('');
    console.log('📊 性能统计:');
    console.log(`   - 连接耗时: ${connectTime}ms`);
    console.log(`   - 打开 INBOX: ${openTime}ms`);
    console.log(`   - 搜索邮件: ${searchTime}ms`);
    console.log('');
    console.log('💡 如果在系统中仍然添加失败，可能是:');
    console.log('   1. 前端配置问题');
    console.log('   2. 后端日志有详细错误信息');
    console.log('   3. 数据库写入问题');

  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error('');
    console.error('╔══════════════════════════════════════════╗');
    console.error('║     ❌ 连接失败                          ║');
    console.error('╚══════════════════════════════════════════╝');
    console.error('');
    console.error(`⏱️  耗时: ${elapsed}ms`);
    console.error(`❌ 错误: ${err.message}`);
    console.error('');

    // 详细错误分析
    const errMsg = err.message || '';

    if (errMsg.includes('Connection ended unexpectedly') || errMsg.includes('ECONNRESET')) {
      console.error('🔍 错误分析: 连接被意外关闭');
      console.error('');
      console.error('这通常意味着 Gmail 服务器主动断开了连接。');
      console.error('');
      console.error('💡 可能原因:');
      console.error('   1. ❌ 认证失败（最可能）');
      console.error('      - 应用专用密码不正确');
      console.error('      - 密码中有多余空格');
      console.error('      - 两步验证未启用，但使用了应用专用密码');
      console.error('');
      console.error('   2. 🌐 代理问题');
      console.error('      - 代理服务器中断了连接');
      console.error('      - 代理不支持长时间 TLS 连接');
      console.error('');
      console.error('   3. 🔒 TLS 握手失败');
      console.error('      - 证书验证问题');
      console.error('      - TLS 版本不兼容');
      console.error('');
      console.error('🔧 建议操作:');
      console.error('   1. 确认应用专用密码正确（16位字母，无空格）');
      console.error('   2. 访问 https://myaccount.google.com/apppasswords 重新生成');
      console.error('   3. 检查是否启用了两步验证');
      console.error('   4. 查看代理服务器日志');

    } else if (errMsg.includes('Invalid credentials') || errMsg.includes('AUTHENTICATE')) {
      console.error('🔍 错误分析: 认证失败');
      console.error('');
      console.error('Gmail 拒绝了你的凭据。');
      console.error('');
      console.error('💡 解决方案:');
      console.error('   1. 使用「应用专用密码」（不是 Google 账户密码）');
      console.error('   2. 访问: https://myaccount.google.com/apppasswords');
      console.error('   3. 生成新的应用专用密码');
      console.error('   4. 确保已启用两步验证');

    } else if (errMsg.includes('timeout') || errMsg.includes('ETIMEDOUT')) {
      console.error('🔍 错误分析: 连接超时');
      console.error('');
      console.error('💡 解决方案:');
      console.error('   1. 增加超时时间（当前: 20秒）');
      console.error('   2. 检查代理服务器');
      console.error('   3. 测试网络连通性');

    } else if (errMsg.includes('SSL') || errMsg.includes('TLS') || errMsg.includes('certificate')) {
      console.error('🔍 错误分析: TLS/SSL 错误');
      console.error('');
      console.error('💡 解决方案:');
      console.error('   1. 确认使用 TLS (端口 993)');
      console.error('   2. 检查代理是否支持 TLS');
      console.error('   3. 尝试禁用证书验证（已设置）');

    } else {
      console.error('🔍 错误分析: 未知错误');
      console.error('');
      console.error('完整错误信息:');
      console.error(err);
    }

    console.error('');
    console.error('📋 调试信息:');
    console.error('   错误类型:', err.constructor.name);
    console.error('   错误代码:', err.code || 'N/A');
    console.error('   错误堆栈:', err.stack?.split('\n').slice(0, 5).join('\n'));
  }
}

// 运行测试
testGmailConnection().catch(console.error);
