# 通知服务代理配置指南

## 问题背景

企业微信、钉钉、飞书、Server酱等**国内服务不需要代理**，使用代理会导致：
- ❌ `socket hang up` 错误
- ❌ 连接超时

Telegram 等**国外服务需要代理**。

## 解决方案

每个通知渠道单独配置 `useProxy` 字段：

| 通知渠道 | useProxy | 说明 |
|---------|----------|------|
| 企业微信 | `false` | 国内服务，不需要代理 |
| 钉钉 | `false` | 国内服务，不需要代理 |
| 飞书 | `false` | 国内服务，不需要代理 |
| Server酱 | `false` | 国内服务，不需要代理 |
| Telegram | `true` | 国外服务，需要代理 |

## 修改的文件

`server/services/notificationService.js`

### 1. 修改 `getUserProxyAgent` 函数
- 添加 `notificationConfig` 参数
- 根据配置决定是否使用代理

### 2. 修改 `processNotification` 函数
- 每个通知渠道单独判断是否使用代理
- 不再全局使用同一个代理配置

## 日志输出

使用代理时：
```
[NOTIFY] Using proxy for notifications: 代理-SOCKS5 (socks5://192.168.5.199:7890)
```

不使用代理时：
```
[NOTIFY] Not using proxy for notifications (disabled in config)
```

## 常见问题

**Q: 企业微信发送失败？**
A: 确保 `useProxy` 设置为 `false`。

**Q: Telegram 发送失败？**
A: 确保 `useProxy` 设置为 `true`，并配置正确的代理。
