#!/bin/bash

echo "=== 验证所有修改 ==="
echo ""

# 1. 检查 .env 文件
echo "1. 检查 server/.env:"
if grep -q "MYSQL_PASSWORD=mul_email_pass" server/.env; then
    echo "   ✅ MYSQL_PASSWORD 已设置"
else
    echo "   ❌ MYSQL_PASSWORD 未设置"
fi
echo ""

# 2. 检查 db.js
echo "2. 检查 server/models/db.js:"
if grep -q "process.env.MYSQL_PASSWORD" server/models/db.js; then
    echo "   ✅ 使用环境变量密码"
else
    echo "   ❌ 硬编码密码"
fi
echo ""

# 3. 检查 config/index.js
echo "3. 检查 server/config/index.js:"
if grep -q "notificationTimeout" server/config/index.js; then
    echo "   ✅ notificationTimeout 配置存在"
else
    echo "   ❌ 缺少 notificationTimeout"
fi
echo ""

# 4. 检查 server.js
echo "4. 检查 server/server.js:"
if grep -q "Waiting for all configurations to load" server/server.js; then
    echo "   ✅ bootstrap 函数已优化"
else
    echo "   ❌ bootstrap 函数未修改"
fi
echo ""

# 5. 检查 mailService.js
echo "5. 检查 server/services/mailService.js:"
if grep -q "Waiting for proxy configurations to load" server/services/mailService.js; then
    echo "   ✅ startAll 函数已优化"
else
    echo "   ❌ startAll 函数未修改"
fi
echo ""

# 6. 检查 notificationService.js
echo "6. 检查 server/services/notificationService.js:"
if grep -q "config.notificationTimeout" server/services/notificationService.js; then
    echo "   ✅ 超时配置已修改"
else
    echo "   ❌ 超时配置未修改"
fi
echo ""

# 7. 检查 MailAccountsView.tsx
echo "7. 检查 front/src/components/MailAccountsView.tsx:"
if grep -q "loadProxies" front/src/components/MailAccountsView.tsx; then
    echo "   ✅ 代理列表加载已添加"
else
    echo "   ❌ 缺少代理列表加载"
fi
echo ""

# 检查 git 状态
echo "=== Git 状态 ==="
git status --short
echo ""

echo "=== 验证完成 ==="
