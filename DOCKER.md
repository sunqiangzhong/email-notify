# Mul-Email Docker 部署

## 快速开始

### 方式一：直接运行（推荐）

```bash
# 创建数据目录
mkdir -p mul-email-data

# 运行容器
docker run -d \
  --name mul-email \
  -p 6000:80 \
  -v mul-email-data:/app/server/data \
  -e JWT_SECRET=your-secret-key \
  -e ADMIN_PASSWORD=your-password \
  your-dockerhub-username/mul-email:latest
```

### 方式二：使用 docker-compose

1. 下载 `docker-compose.yml`
2. 创建 `.env` 文件（可选）：
```bash
APP_PORT=6000
JWT_SECRET=your-secret-key
ADMIN_PASSWORD=your-password
```
3. 启动：
```bash
docker-compose up -d
```

### 方式三：本地构建

```bash
git clone <repo-url>
cd mul-email
docker-compose -f docker-compose.local.yml up -d --build
```

## 访问

- 地址：`http://your-nas-ip:6000`
- 默认账号：`admin`
- 默认密码：`admin123456`（建议修改）

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `APP_PORT` | 访问端口 | `6000` |
| `JWT_SECRET` | JWT 密钥 | 随机生成 |
| `ADMIN_USERNAME` | 管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 管理员密码 | `admin123456` |
| `TZ` | 时区 | `Asia/Shanghai` |

## 数据持久化

数据存储在 Docker volume `mul-email-data` 中，容器删除后数据不会丢失。

如需备份：
```bash
docker cp mul-email:/app/server/data ./backup
```

## 更新

```bash
docker-compose pull
docker-compose up -d
```
