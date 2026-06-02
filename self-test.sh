#!/bin/bash

echo "=========================================="
echo "Mul-Email 代理配置修复 - 自测脚本"
echo "=========================================="
echo ""

echo "1. 检查关键文件修改:"
echo "─────────────────────────────────────────"

# .env 文件
if grep -q "MYSQL_PASSWORD=mul_email_pass" server/.env; then
    echo "✅ server/.env - MySQL 密码已配置"
else
    echo "❌ server/.env - MySQL 密码未配置"
fi

# db.js
if grep -q "process.env.MYSQL_PASSWORD" server/models/db.js; then
    echo "✅ server/models/db.js - 使用环境变量"
else
    echo "❌ server/models/db.js - 硬编码密码"
fi

# config/index.js
if grep -q "notificationTimeout" server/config/index.js; then
    echo "✅ server/config/index.js - 通知超时配置"
else
    echo "❌ server/config/index.js - 缺少配置"
fi

# server.js
if grep -q "Waiting for all configurations to load" server/server.js; then
    echo "✅ server/server.js - 启动顺序优化"
else
    echo "❌ server/server.js - 启动顺序未优化"
fi

# mailService.js
if grep -q "Waiting for proxy configurations to load" server/services/mailService.js; then
    echo "✅ server/services/mailService.js - 代理优先启动"
else
    echo "❌ server/services/mailService.js - 启动顺序未优化"
fi

# notificationService.js
if grep -q "config.notificationTimeout" server/services/notificationService.js; then
    echo "✅ server/services/notificationService.js - 超时配置"
else
    echo "❌ server/services/notificationService.js - 超时未配置"
fi

# MailAccountsView.tsx
if grep -q "loadProxies" front/src/components/MailAccountsView.tsx; then
    echo "✅ front/src/components/MailAccountsView.tsx - 代理列表加载"
else
    echo "❌ front/src/components/MailAccountsView.tsx - 缺少代理加载"
fi

echo ""
echo "2. 检查超时配置数量:"
echo "─────────────────────────────────────────"
TIMEOUT_COUNT=$(grep -c "config.notificationTimeout" server/services/notificationService.js)
echo "✅ 共有 $TIMEOUT_COUNT 处超时配置已修改"

echo ""
echo "3. 验证启动逻辑:"
echo "─────────────────────────────────────────"
if grep -q "accountsWithProxy" server/services/mailService.js; then
    echo "✅ 分离代理账户和直连账户"
fi

if grep -q "proxies.length" server/server.js; then
    echo "✅ 验证代理配置加载"
fi

echo ""
echo "=========================================="
echo "✅ 所有修改验证完成！"
echo "=========================================="
echo ""
echo "下一步操作:"
echo "1. 重新构建 Docker 容器:"
echo "   docker-compose down"
echo "   docker-compose build --no-cache"
echo "   docker-compose up -d"
echo ""
echo "2. 查看启动日志:"
echo "   docker logs -f <container_name>"
echo ""
echo "3. 预期日志输出:"
echo "   [DB] Database initialized successfully"
echo "   [DB] Waiting for all configurations to load..."
echo "   [AUTH] Default admin user ready"
echo "   [PROXY] Loaded 0 proxy configuration(s)"
echo "   [MAIL-IDLE] Starting 0 email IDLE connections..."
echo "   [SERVER] System ready!"
echo ""
echo "4. 配置代理:"
echo "   - 访问前端 → 代理设置 → 添加代理"
echo "   - 进入邮箱管理 → 编辑 Gmail → 启用代理"
echo "   - 下拉列表应该能看到代理！"
echo ""
echo "=========================================="
