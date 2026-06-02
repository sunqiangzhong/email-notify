/**
 * 验证数据库中的代理和邮箱配置
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

const mysql = require('mysql2/promise');

async function verifyDatabase() {
  console.log('=== 数据库配置验证 ===\n');

  let pool;
  try {
    // 创建数据库连接
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: parseInt(process.env.MYSQL_PORT || '3306', 10),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'mul_email',
      waitForConnections: true,
      connectionLimit: 5,
    });

    console.log('✓ 数据库连接成功\n');

    // 1. 检查 proxies 表
    console.log('1. 代理配置 (proxies 表):');
    console.log('─'.repeat(50));

    const [proxies] = await pool.query('SELECT * FROM proxies ORDER BY createdAt DESC');

    if (proxies.length === 0) {
      console.log('   ⚠ 没有代理配置！');
      console.log('   → 需要在「代理设置」页面添加代理\n');
    } else {
      console.log(`   ✓ 共 ${proxies.length} 个代理\n`);
      proxies.forEach((p, i) => {
        console.log(`   代理 ${i + 1}:`);
        console.log(`     ID:     ${p.id}`);
        console.log(`     名称:   ${p.name || '(无)'}`);
        console.log(`     类型:   ${p.type}`);
        console.log(`     地址:   ${p.host}:${p.port}`);
        console.log(`     用户:   ${p.userId}`);
        console.log(`     创建:   ${p.createdAt}`);
        console.log('');
      });
    }

    // 2. 检查 accounts 表
    console.log('2. 邮箱账户 (accounts 表):');
    console.log('─'.repeat(50));

    const [accounts] = await pool.query('SELECT * FROM accounts ORDER BY createdAt DESC');

    if (accounts.length === 0) {
      console.log('   ⚠ 没有邮箱账户！\n');
    } else {
      console.log(`   ✓ 共 ${accounts.length} 个邮箱账户\n`);
      accounts.forEach((a, i) => {
        console.log(`   账户 ${i + 1}:`);
        console.log(`     ID:       ${a.id}`);
        console.log(`     邮箱:     ${a.email}`);
        console.log(`     IMAP:     ${a.imapHost}:${a.imapPort}`);
        console.log(`     SSL:      ${a.useSSL ? '是' : '否'}`);
        console.log(`     使用代理: ${a.useProxy ? '✓ 是' : '✗ 否'}`);
        console.log(`     代理ID:   ${a.proxyId || '(无)'}`);
        console.log(`     状态:     ${a.status || 'offline'}`);
        console.log(`     活跃:     ${a.active !== false ? '是' : '否'}`);
        console.log('');
      });
    }

    // 3. 验证代理配置完整性
    console.log('3. 配置完整性检查:');
    console.log('─'.repeat(50));

    const accountsWithProxy = accounts.filter(a => a.useProxy && a.proxyId);
    const accountsWithInvalidProxy = accountsWithProxy.filter(a => {
      return !proxies.find(p => p.id === a.proxyId);
    });

    console.log(`   使用代理的账户: ${accountsWithProxy.length} 个`);

    if (accountsWithInvalidProxy.length > 0) {
      console.log(`   ⚠ 有 ${accountsWithInvalidProxy.length} 个账户的代理配置无效！`);
      accountsWithInvalidProxy.forEach(a => {
        console.log(`     - ${a.email} (proxyId: ${a.proxyId})`);
      });
    } else if (accountsWithProxy.length > 0) {
      console.log('   ✓ 所有代理配置有效');
    }

    // 4. 检查 Gmail 账户
    console.log('\n4. Gmail 账户检查:');
    console.log('─'.repeat(50));

    const gmailAccounts = accounts.filter(a => a.email.includes('gmail'));

    if (gmailAccounts.length === 0) {
      console.log('   没有 Gmail 账户\n');
    } else {
      gmailAccounts.forEach(a => {
        console.log(`   邮箱: ${a.email}`);
        console.log(`     代理: ${a.useProxy ? '✓ 已启用' : '✗ 未启用'}`);
        if (a.useProxy && a.proxyId) {
          const proxy = proxies.find(p => p.id === a.proxyId);
          if (proxy) {
            console.log(`     代理配置: ${proxy.type}://${proxy.host}:${proxy.port}`);
          } else {
            console.log(`     代理配置: ⚠ 找不到 (ID: ${a.proxyId})`);
          }
        }
        console.log('');
      });
    }

    // 5. 统计信息
    console.log('5. 统计信息:');
    console.log('─'.repeat(50));
    console.log(`   代理总数:     ${proxies.length}`);
    console.log(`   邮箱总数:     ${accounts.length}`);
    console.log(`   使用代理:     ${accountsWithProxy.length}`);
    console.log(`   活跃账户:     ${accounts.filter(a => a.active !== false).length}`);
    console.log('');

    // 6. 问题诊断
    console.log('6. 问题诊断:');
    console.log('─'.repeat(50));

    const issues = [];

    if (proxies.length === 0) {
      issues.push('没有配置代理');
    }

    const gmailWithProxy = gmailAccounts.filter(a => a.useProxy);
    const gmailWithoutProxy = gmailAccounts.filter(a => !a.useProxy);

    if (gmailWithoutProxy.length > 0) {
      issues.push(`${gmailWithoutProxy.length} 个 Gmail 账户未启用代理`);
    }

    if (accountsWithInvalidProxy.length > 0) {
      issues.push(`${accountsWithInvalidProxy.length} 个账户的代理配置无效`);
    }

    if (issues.length === 0) {
      console.log('   ✓ 配置正常，没有发现问题');
    } else {
      issues.forEach((issue, i) => {
        console.log(`   ${i + 1}. ⚠ ${issue}`);
      });
    }

    console.log('\n=== 验证完成 ===');

  } catch (err) {
    console.error('✗ 数据库错误:', err.message);

    if (err.code === 'ECONNREFUSED') {
      console.error('\n   MySQL 服务未运行');
      console.error('   → 启动 MySQL: sudo systemctl start mysql');
    } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\n   数据库认证失败');
      console.error('   → 检查 .env 文件中的 MYSQL_USER 和 MYSQL_PASSWORD');
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      console.error('\n   数据库不存在');
      console.error('   → 创建数据库: mysql -u root -e "CREATE DATABASE mul_email;"');
    }
  } finally {
    if (pool) await pool.end();
  }
}

verifyDatabase();
