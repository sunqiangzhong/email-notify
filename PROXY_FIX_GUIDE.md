# 代理数据库检查和修复指南

## 方法 1: 通过 API 添加代理（推荐）

打开浏览器开发者工具（F12），在 Console 中执行：

```javascript
// 1. 获取 token
const token = localStorage.getItem('token');

// 2. 添加代理
fetch('/api/proxies', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'SOCKS5 代理',
    type: 'socks5',
    host: '127.0.0.1',
    port: 1080,
    username: '',
    password: ''
  })
})
.then(res => res.json())
.then(data => {
  console.log('代理添加结果:', data);
  if (data.success) {
    alert('代理添加成功！请刷新页面');
  }
});
```

## 方法 2: 直接操作数据库

连接到 MySQL 数据库，手动插入代理：

```sql
-- 1. 先查看用户 ID
SELECT id, username FROM mul_email.users;

-- 2. 添加代理（替换 USER_ID 为实际的用户 ID）
INSERT INTO mul_email.proxies (
  id,
  userId,
  name,
  type,
  host,
  port,
  username,
  password,
  createdAt,
  updatedAt
) VALUES (
  UUID(),
  'USER_ID',  -- 替换为实际用户 ID
  'SOCKS5 代理',
  'socks5',
  '127.0.0.1',
  1080,
  '',
  '',
  NOW(),
  NOW()
);

-- 3. 验证添加成功
SELECT * FROM mul_email.proxies;
```

## 方法 3: 使用测试脚本

```bash
cd /Users/sunqiangzhong/Downloads/email-notify/server
node test-proxy-api.js
```

这个脚本会：
1. 登录系统
2. 查询代理列表
3. 显示详细的诊断信息

## 常见问题

### Q1: 添加代理后还是看不到？
**A**: 刷新页面（Ctrl+R 或 Cmd+R），或重新打开邮箱编辑弹窗。

### Q2: 测试连通性失败？
**A**: 检查：
- 代理服务器是否运行
- 主机和端口是否正确
- 防火墙是否允许连接

### Q3: 数据库连接失败？
**A**: 检查 `.env` 文件的 MySQL 配置：
```bash
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password  # 如果有密码
MYSQL_DATABASE=mul_email
```

### Q4: 如何验证前端代码已更新？
**A**: 重新构建前端：
```bash
cd /Users/sunqiangzhong/Downloads/email-notify/front
npm run build
# 或
npm run dev
```

## 完整排查流程

1. **添加代理**（使用上述任一方法）
2. **验证数据库**：`SELECT * FROM mul_email.proxies;`
3. **重启后端**：`npm run dev`（在 server 目录）
4. **重新构建前端**：`npm run dev`（在 front 目录）
5. **刷新浏览器**（强制刷新：Ctrl+Shift+R）
6. **编辑邮箱账户** → 启用代理 → 应该能看到代理列表

## 如果还有问题

请提供：
1. `SELECT * FROM mul_email.proxies;` 的结果
2. `SELECT * FROM mul_email.accounts WHERE useProxy = 1;` 的结果
3. 浏览器 Console 的错误信息
4. 后端日志（server.log）
