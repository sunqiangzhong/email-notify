# Mul-Email - 多邮箱聚合与通知管理系统

一个功能强大的多邮箱聚合管理系统，支持多种通知渠道推送。

## ✨ 功能特性

- 📧 **多邮箱管理** - 支持 QQ、Gmail、Outlook 等主流邮箱
- 🔔 **多种通知渠道** - 企业微信、Server酱、Telegram、钉钉、飞书、自定义 Webhook
- 🔍 **关键词过滤** - 按关键词过滤邮件，精准推送
- 🌐 **代理支持** - SOCKS5/HTTP 代理，解决网络限制
- 📊 **实时监控** - WebSocket 实时日志推送
- 🔒 **安全认证** - JWT 用户认证，多用户支持

## 🚀 快速开始

### Docker 部署（推荐）

1. **克隆项目**
   ```bash
   git clone https://github.com/your-username/mul-email.git
   cd mul-email
   ```

2. **配置环境变量**
   ```bash
   cp .env.example .env
   # 编辑 .env 文件，修改管理员密码和 JWT 密钥
   ```

3. **启动服务**
   ```bash
   docker-compose up -d
   ```

4. **访问系统**
   - 打开浏览器访问: `http://your-nas-ip:6000`
   - 默认管理员: `admin / admin123456`

### 本地开发

1. **启动后端**
   ```bash
   cd server
   npm install
   npm run dev
   ```

2. **启动前端**
   ```bash
   cd front
   npm install
   npm run dev
   ```

3. **访问系统**
   - 前端: `http://127.0.0.1:5173`
   - 后端: `http://127.0.0.1:3001`

## 📁 项目结构

```
mul-email/
├── front/                  # 前端 React + Vite + TypeScript
│   ├── src/
│   │   ├── components/     # UI 组件
│   │   ├── services/       # API 服务
│   │   └── ...
│   └── package.json
├── server/                 # 后端 Node.js + Express
│   ├── controllers/        # 控制器
│   ├── services/           # 业务服务
│   ├── routes/             # 路由定义
│   ├── models/             # 数据模型
│   ├── middlewares/        # 中间件
│   ├── config/             # 配置
│   ├── data/               # 数据存储
│   └── server.js           # 入口文件
├── nginx.conf              # Nginx 配置
├── Dockerfile              # Docker 构建文件
├── docker-compose.yml      # Docker Compose 配置
├── docker-entrypoint.sh    # 启动脚本
├── .env.example            # 环境变量示例
└── .dockerignore           # Docker 忽略文件
```

## 🔔 支持的通知渠道

| 渠道 | 说明 |
|------|------|
| 企业微信应用 | 通过企业微信自建应用发送消息 |
| 企业微信群机器人 | 通过企业微信群 Webhook 发送消息 |
| Server酱 | 通过 Server酱 推送消息到微信 |
| Telegram | 通过 Telegram Bot 发送消息 |
| 钉钉机器人 | 通过钉钉群机器人发送消息 |
| 飞书机器人 | 通过飞书群机器人发送消息 |
| 自定义 Webhook | 通过自定义 HTTP 接口发送消息 |

## ⚙️ 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `APP_PORT` | 应用访问端口 | `6000` |
| `JWT_SECRET` | JWT 加密密钥 | - |
| `ADMIN_USERNAME` | 管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 管理员密码 | `admin123456` |
| `TZ` | 时区 | `Asia/Shanghai` |

## 📝 API 接口

### 认证
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/register` - 用户注册
- `GET /api/auth/me` - 获取当前用户

### 邮箱管理
- `GET /api/emails` - 获取邮箱列表
- `POST /api/emails` - 创建邮箱
- `PUT /api/emails/:id` - 更新邮箱
- `DELETE /api/emails/:id` - 删除邮箱
- `POST /api/emails/test-connection` - 测试连接
- `GET /api/emails/:id/messages` - 获取邮件列表
- `GET /api/emails/:id/messages/:uid/body` - 获取邮件正文

### 代理管理
- `GET /api/proxies` - 获取代理列表
- `POST /api/proxies` - 创建代理
- `PUT /api/proxies/:id` - 更新代理
- `DELETE /api/proxies/:id` - 删除代理
- `POST /api/proxies/test-connectivity` - 测试连通性

### 通知管理
- `GET /api/notifications` - 获取通知渠道列表
- `POST /api/notifications` - 创建通知渠道
- `PUT /api/notifications/:id` - 更新通知渠道
- `DELETE /api/notifications/:id` - 删除通知渠道
- `POST /api/notifications/:id/test` - 测试发送
- `GET /api/notifications/types` - 获取支持的通知类型
- `GET /api/notifications/filters` - 获取过滤规则
- `POST /api/notifications/filters` - 创建过滤规则

### 系统
- `GET /api/health` - 健康检查
- `GET /api/system/status` - 系统状态

## 🔧 技术栈

**前端:**
- React 19
- TypeScript
- Vite
- TailwindCSS
- Lucide Icons

**后端:**
- Node.js
- Express
- lowdb (JSON 数据库)
- imap-simple (IMAP 邮件)
- WebSocket (实时日志)

## 📄 许可证

MIT License
