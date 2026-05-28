/**
 * IMAP 连接诊断脚本
 * 在 server 目录下运行: node test-imap.js
 */
require('dotenv').config();
const imaps = require('imap-simple');

const config = {
  imap: {
    user: process.env.TEST_EMAIL || '你的QQ邮箱@qq.com',
    password: process.env.TEST_PASSWORD || '你的授权码',
    host: 'imap.qq.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: 10000,
    connTimeout: 10000,
  },
};

console.log('=== IMAP 连接诊断 ===');
console.log('Host: imap.qq.com:993 (TLS)');
console.log('User:', config.imap.user);
console.log('');

imaps.connect(config)
  .then(conn => {
    console.log('[OK] IMAP 连接成功!');
    return conn.openBox('INBOX').then(() => {
      console.log('[OK] INBOX 打开成功!');
      return conn.search(['ALL'], { bodies: ['HEADER'], markSeen: false, struct: false });
    }).then(msgs => {
      console.log(`[OK] 收件箱共 ${msgs.length} 封邮件`);
      conn.end();
      process.exit(0);
    });
  })
  .catch(err => {
    console.error('[FAIL] 连接失败:', err.message);
    console.error('');
    console.error('可能原因:');
    console.error('  1. 网络无法直连 imap.qq.com:993（需要配置代理）');
    console.error('  2. QQ邮箱 IMAP 服务未开启');
    console.error('  3. 授权码不正确');
    console.error('');
    console.error('请在 PowerShell 中执行: Test-NetConnection imap.qq.com -Port 993');
    process.exit(1);
  });
