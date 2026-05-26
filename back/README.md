# 多邮箱聚合与微信通知管理系统 - 后端

## 功能特性

### 1. 多用户鉴权与资源隔离
- JWT Token 认证
- 用户注册/登录
- 数据隔离：用户 A 无法访问用户 B 的数据

### 2. 代理与邮箱连接池管理
- 支持 QQ邮箱、Gmail 等多种邮箱
- 支持 SOCKS4/5、HTTP/HTTPS 代理
- IMAP 长连接监听新邮件
- 自动重连机制

### 3. 微信通知路由与过滤器
- 支持 Server酱
- 支持企业微信
- 支持自定义 Webhook
- 关键词过滤规则

### 4. 系统与网络诊断
- 系统状态监控
- 网络延迟测试
- 数据目录权限检查

## 快速开始

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 启动生产服务器
npm start
```

### Docker 部署

```bash
# 构建镜像
docker build -t mul-email-backend .

# 运行容器
docker run -d \
  --name mul-email-backend \
  -p 3001:3001 \
  -v $(pwd)/data:/app/data \
  -e JWT_SECRET=your-secret-key \
  mul-email-backend
```

### Docker Compose 部署

```bash
# 创建 .env 文件
cp .env.example .env
# 编辑 .env 文件，修改 JWT_SECRET 等配置

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

## API 接口文档

### 认证接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/login | 用户登录 |
| POST | /api/auth/register | 用户注册 |
| GET | /api/auth/me | 获取当前用户信息 |

### 邮箱接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/emails | 获取所有邮箱 |
| GET | /api/emails/:id | 获取单个邮箱 |
| POST | /api/emails | 创建邮箱 |
| PUT | /api/emails/:id | 更新邮箱 |
| DELETE | /api/emails/:id | 删除邮箱 |
| POST | /api/emails/test-connection | 测试连接 |

### 代理接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/proxies | 获取所有代理 |
| GET | /api/proxies/:id | 获取单个代理 |
| POST | /api/proxies | 创建代理 |
| PUT | /api/proxies/:id | 更新代理 |
| DELETE | /api/proxies/:id | 删除代理 |

### 通知接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/notifications | 获取所有通知配置 |
| GET | /api/notifications/:id | 获取单个通知配置 |
| POST | /api/notifications | 创建通知配置 |
| PUT | /api/notifications/:id | 更新通知配置 |
| DELETE | /api/notifications/:id | 删除通知配置 |
| POST | /api/notifications/:id/test | 测试通知发送 |

### 过滤规则接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/filters | 获取所有过滤规则 |
| POST | /api/filters | 创建过滤规则 |
| PUT | /api/filters/:id | 更新过滤规则 |
| DELETE | /api/filters/:id | 删除过滤规则 |

### 系统接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/system/status | 获取系统状态 |
| GET | /api/system/ping | 网络延迟测试 |
| GET | /api/health | 健康检查 |

## 目录结构

```
back/
├── server.js              # 主入口
├── package.json           # 依赖配置
├── Dockerfile             # Docker 镜像配置
├── docker-compose.yml     # Docker Compose 配置
├── .env.example           # 环境变量示例
├── config/
│   └── index.js           # 配置模块
├── middlewares/
│   └── auth.js            # JWT 认证中间件
├── models/
│   └── database.js        # 数据库模块（lowdb）
├── routes/
│   ├── auth.js            # 认证路由
│   ├── emails.js          # 邮箱路由
│   ├── proxies.js         # 代理路由
│   ├── notifications.js   # 通知路由
│   └── system.js          # 系统路由
├── controllers/
│   ├── authController.js  # 认证控制器
│   ├── emailController.js # 邮箱控制器
│   ├── proxyController.js # 代理控制器
│   ├── notificationController.js # 通知控制器
│   └── systemController.js # 系统控制器
├── services/
│   ├── mailService.js     # 邮件服务
│   └── notificationService.js # 通知服务
└── data/                  # 数据持久化目录
    ├── users.json         # 用户数据
    ├── emails.json        # 邮箱配置
    ├── proxies.json       # 代理配置
    ├── notifications.json # 通知配置
    └── filters.json       # 过滤规则
```

## 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| PORT | 3001 | 服务端口 |
| HOST | 0.0.0.0 | 监听地址 |
| JWT_SECRET | dev-secret-change-me | JWT 密钥 |
| DEFAULT_ADMIN_USER | admin | 默认管理员用户名 |
| DEFAULT_ADMIN_PASS | admin123 | 默认管理员密码 |
| DATA_DIR | ./data | 数据目录 |
| LOG_LEVEL | info | 日志级别 |

## 注意事项

1. **生产环境必须修改 JWT_SECRET**：使用强随机字符串
2. **生产环境建议修改默认管理员密码**
3. **数据目录权限**：确保 Docker 容器对 `/app/data` 目录有读写权限
4. **代理配置**：使用代理时确保代理服务器可达
5. **邮箱密码**：QQ邮箱需要使用授权码，Gmail 需要开启应用专用密码

## 许可证

MIT
