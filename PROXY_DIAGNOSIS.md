# MySQL 数据库诊断脚本
# 请在本地运行此脚本检查数据库连接和代理数据

```bash
#!/bin/bash

echo "=== MySQL 连接诊断 ==="
echo ""

# 1. 检查 MySQL 是否运行
echo "1. 检查 MySQL 服务状态..."
if command -v mysql &> /dev/null; then
    if mysqladmin ping -u root 2>/dev/null; then
        echo "   ✓ MySQL 正在运行"
    else
        echo "   ✗ MySQL 未运行或无法连接"
        echo "   尝试启动: sudo systemctl start mysql"
        exit 1
    fi
else
    echo "   ⚠ mysql 命令不可用"
fi

echo ""

# 2. 检查数据库是否存在
echo "2. 检查 mul_email 数据库..."
if mysql -u root -e "USE mul_email;" 2>/dev/null; then
    echo "   ✓ 数据库存在"
else
    echo "   ✗ 数据库不存在"
    echo "   创建数据库: mysql -u root -e 'CREATE DATABASE mul_email;'"
    exit 1
fi

echo ""

# 3. 检查 proxies 表
echo "3. 检查 proxies 表..."
PROXY_COUNT=$(mysql -u root -e "SELECT COUNT(*) FROM mul_email.proxies;" 2>/dev/null | tail -1)
if [ "$PROXY_COUNT" != "" ]; then
    echo "   ✓ proxies 表存在，共 $PROXY_COUNT 条记录"

    if [ "$PROXY_COUNT" -gt 0 ]; then
        echo ""
        echo "   代理列表:"
        mysql -u root -e "SELECT id, name, type, host, port, userId FROM mul_email.proxies LIMIT 10;" 2>/dev/null
    else
        echo "   ⚠ 表为空 - 没有代理配置"
    fi
else
    echo "   ✗ proxies 表不存在"
fi

echo ""

# 4. 检查 accounts 表的代理配置
echo "4. 检查邮箱账户的代理配置..."
ACCOUNTS_WITH_PROXY=$(mysql -u root -e "SELECT COUNT(*) FROM mul_email.accounts WHERE useProxy = 1;" 2>/dev/null | tail -1)
ACCOUNTS_TOTAL=$(mysql -u root -e "SELECT COUNT(*) FROM mul_email.accounts;" 2>/dev/null | tail -1)

echo "   总邮箱账户: $ACCOUNTS_TOTAL"
echo "   使用代理的: $ACCOUNTS_WITH_PROXY"

if [ "$ACCOUNTS_WITH_PROXY" -gt 0 ]; then
    echo ""
    echo "   使用代理的账户:"
    mysql -u root -e "SELECT id, email, proxyId, useProxy FROM mul_email.accounts WHERE useProxy = 1;" 2>/dev/null
fi

echo ""
echo "=== 诊断完成 ==="
```

## 常见问题和解决方案

### 问题 1: MySQL 未启动
```bash
# Linux/Mac
sudo systemctl start mysql

# 或者
sudo service mysql start

# Docker
docker start mysql-container-name
```

### 问题 2: 数据库不存在
```bash
mysql -u root -e "CREATE DATABASE mul_email CHARACTER SET utf8mb4;"
```

### 问题 3: proxies 表为空
需要在前端"代理设置"页面添加代理，或者手动插入：
```sql
INSERT INTO mul_email.proxies (id, userId, name, type, host, port, createdAt, updatedAt)
VALUES (
  UUID(),
  (SELECT id FROM mul_email.users LIMIT 1),
  'My SOCKS5 Proxy',
  'socks5',
  '127.0.0.1',
  1080,
  NOW(),
  NOW()
);
```

### 问题 4: 前端不显示代理
我已经修复了 `MailAccountsView.tsx`，在组件初始化时加载代理列表。

重新构建前端：
```bash
cd front
npm run build
```

或者重启开发服务器：
```bash
cd front
npm run dev
```

### 问题 5: 邮箱未启用代理
检查邮箱账户配置，确保 `useProxy` 字段为 true 且 `proxyId` 指向正确的代理。

```sql
-- 查看邮箱配置
SELECT id, email, useProxy, proxyId FROM mul_email.accounts;

-- 更新邮箱配置（启用代理）
UPDATE mul_email.accounts
SET useProxy = 1, proxyId = 'your-proxy-id-here'
WHERE email = 'sunqzhong@gmail.com';
```

## 快速验证步骤

1. **重启服务器**（确保使用最新代码）：
   ```bash
   cd /path/to/email-notify/server
   npm run dev
   ```

2. **重新构建前端**：
   ```bash
   cd /path/to/email-notify/front
   npm run build
   # 或者
   npm run dev
   ```

3. **在浏览器中**：
   - 访问 http://localhost:5173
   - 登录后台
   - 进入"邮箱管理"
   - 点击"添加网关邮箱"或编辑现有邮箱
   - 启用"通过代理连接"
   - 应该能看到代理下拉列表

如果问题仍然存在，可能是：
- MySQL 没有正确配置密码
- 环境变量未正确加载
- 前端代码未更新

请运行上面的诊断脚本，然后告诉我结果。
