/**
 * Gmail IMAP 连接测试脚本
 * 用于诊断 sunqzhong@gmail.com 的连接问题
 */
const { ImapFlow } = require('imapflow');

async function testGmailConnection() {
  console.log('Testing Gmail IMAP connection...\n');

  // 配置 1: 标准 Gmail 设置
  const config1 = {
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: 'sunqzhong@gmail.com',
      // 注意：需要使用 App Password，不是账户密码
      // 生成方法：Google Account > Security > 2-Step Verification > App passwords
      pass: 'YOUR_APP_PASSWORD_HERE'
    },
    tls: {
      rejectUnauthorized: false,
      minVersion: 'TLSv1'
    },
    connectionTimeout: 60000, // 60 秒
    greetingTimeout: 60000,
    socketTimeout: 60000,
    logger: {
      info: (...args) => console.log('[INFO]', ...args),
      warn: (...args) => console.warn('[WARN]', ...args),
      error: (...args) => console.error('[ERROR]', ...args),
      debug: (...args) => console.debug('[DEBUG]', ...args)
    }
  };

  console.log('Config:');
  console.log('  Host:', config1.host);
  console.log('  Port:', config1.port);
  console.log('  Secure:', config1.secure);
  console.log('  Timeout:', config1.connectionTimeout / 1000, 'seconds');
  console.log('');

  const client = new ImapFlow(config1);

  try {
    console.log('Connecting...');
    const startTime = Date.now();
    await client.connect();
    const elapsed = Date.now() - startTime;

    console.log('✓ Connected successfully in', elapsed, 'ms');
    console.log('');

    // 测试打开 INBOX
    console.log('Opening INBOX...');
    const mailbox = await client.mailboxOpen('INBOX');
    console.log('✓ INBOX opened, messages:', mailbox.exists);
    console.log('');

    // 获取最近 5 封邮件
    console.log('Fetching recent emails...');
    const messages = [];
    const startSeq = Math.max(1, mailbox.exists - 4);
    for await (const msg of client.fetch(`${startSeq}:*`, { uid: true, envelope: true })) {
      messages.push(msg);
    }
    console.log('✓ Fetched', messages.length, 'email(s)');
    console.log('');

    // 显示邮件信息
    messages.forEach((msg, i) => {
      const env = msg.envelope;
      console.log(`Email ${i + 1}:`);
      console.log('  UID:', msg.uid);
      console.log('  Subject:', env?.subject || '(no subject)');
      console.log('  From:', env?.from?.[0]?.address || 'unknown');
      console.log('  Date:', env?.date || 'unknown');
      console.log('');
    });

    await client.close();
    console.log('✓ Connection closed');
    console.log('');
    console.log('✓✓✓ Gmail IMAP is working correctly!');

  } catch (err) {
    console.error('✗ Connection failed:', err.message);
    console.error('');
    console.error('Error details:', err);

    if (err.message.includes('timeout') || err.message.includes('Timeout')) {
      console.error('');
      console.error('Possible causes:');
      console.error('1. Network firewall blocking port 993');
      console.error('2. ISP blocking IMAP connections');
      console.error('3. Need proxy to access Gmail');
      console.error('4. Gmail IMAP not enabled in account settings');
    }

    if (err.message.includes('Authentication') || err.message.includes('auth')) {
      console.error('');
      console.error('Authentication issues:');
      console.error('1. Wrong password - Use App Password, not account password');
      console.error('2. 2-Step Verification not enabled');
      console.error('3. "Less secure app access" disabled (if not using App Password)');
      console.error('');
      console.error('To generate App Password:');
      console.error('1. Go to https://myaccount.google.com/security');
      console.error('2. Enable 2-Step Verification');
      console.error('3. Go to "App passwords"');
      console.error('4. Generate password for "Mail"');
    }

    process.exit(1);
  }
}

testGmailConnection();
