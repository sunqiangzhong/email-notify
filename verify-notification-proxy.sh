#!/bin/bash

echo "=========================================="
echo "通知服务代理配置验证"
echo "=========================================="
echo ""

echo "1. 检查 getUserProxyAgent 函数:"
echo "─────────────────────────────────────────"
if grep -q "notificationConfig?.useProxy" server/services/notificationService.js; then
    echo "✅ 函数已修改，支持配置检查"
else
    echo "❌ 函数未修改"
fi
echo ""

echo "2. 检查 processNotification 函数:"
echo "─────────────────────────────────────────"
if grep -q "channelProxy = getUserProxyAgent(userId, notification.config)" server/services/notificationService.js; then
    echo "✅ 每个通知渠道单独判断代理"
else
    echo "❌ 使用全局代理配置"
fi
echo ""

echo "3. 检查日志输出:"
echo "─────────────────────────────────────────"
if grep -q "Not using proxy for notifications" server/services/notificationService.js; then
    echo "✅ 有禁用代理的日志输出"
else
    echo "❌ 缺少日志输出"
fi
echo ""

echo "4. 检查配置文档:"
echo "─────────────────────────────────────────"
if [ -f "PROXY_CONFIG_GUIDE.md" ]; then
    echo "✅ 配置文档存在"
else
    echo "❌ 缺少配置文档"
fi
echo ""

echo "=========================================="
echo "验证完成"
echo "=========================================="
echo ""
echo "修改内容："
echo "1. getUserProxyAgent(userId, notificationConfig)"
echo "   - 添加 notificationConfig 参数"
echo "   - 根据配置的 useProxy 字段决定是否使用代理"
echo ""
echo "2. processNotification 函数"
echo "   - 每个通知渠道单独调用 getUserProxyAgent"
echo "   - 传入该渠道的配置"
echo ""
echo "使用方法："
echo "在通知渠道的 config 中添加 useProxy 字段："
echo "  - 国内服务（企业微信/钉钉/飞书/Server酱）: useProxy: false"
echo "  - 国外服务（Telegram）: useProxy: true"
echo ""
echo "=========================================="
