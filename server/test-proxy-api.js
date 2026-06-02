/**
 * 测试代理 API 是否正常工作
 */
const axios = require('axios');

const API_BASE = 'http://localhost:3001/api';

async function testProxyAPI() {
  console.log('Testing Proxy API...\n');

  try {
    // 1. 登录获取 token
    console.log('1. Logging in...');
    const loginRes = await axios.post(`${API_BASE}/auth/login`, {
      username: 'admin',
      password: 'admin123456'
    });

    if (!loginRes.data.success) {
      console.error('✗ Login failed:', loginRes.data.message);
      return;
    }

    const token = loginRes.data.token;
    console.log('✓ Logged in successfully\n');

    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 2. 获取代理列表
    console.log('2. Fetching proxies...');
    const proxiesRes = await axios.get(`${API_BASE}/proxies`, { headers });

    console.log('Response:', JSON.stringify(proxiesRes.data, null, 2));

    if (proxiesRes.data.success) {
      const proxies = proxiesRes.data.data;
      console.log(`✓ Found ${proxies.length} proxy(ies)\n`);

      if (proxies.length > 0) {
        console.log('Proxy list:');
        proxies.forEach((p, i) => {
          console.log(`  ${i + 1}. ${p.name || p.type}`);
          console.log(`     ID: ${p.id}`);
          console.log(`     Type: ${p.type}`);
          console.log(`     Host: ${p.host}:${p.port}`);
          console.log('');
        });
      } else {
        console.log('⚠ No proxies configured');
        console.log('  → User needs to add proxies in "代理设置" page\n');
      }
    } else {
      console.error('✗ Failed to fetch proxies:', proxiesRes.data.message);
    }

    // 3. 检查邮箱账户的代理配置
    console.log('3. Fetching email accounts...');
    const accountsRes = await axios.get(`${API_BASE}/emails`, { headers });

    if (accountsRes.data.success) {
      const accounts = accountsRes.data.data;
      console.log(`✓ Found ${accounts.length} email account(s)\n`);

      accounts.forEach((acc, i) => {
        console.log(`Account ${i + 1}: ${acc.email}`);
        console.log(`  Use Proxy: ${acc.useProxy ? 'YES' : 'NO'}`);
        console.log(`  Proxy ID: ${acc.proxyId || 'none'}`);
        console.log('');
      });
    }

  } catch (err) {
    console.error('✗ Error:', err.message);
    if (err.response) {
      console.error('  Status:', err.response.status);
      console.error('  Data:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

testProxyAPI();
