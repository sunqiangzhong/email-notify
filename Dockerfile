# ============================================
# Mul-Email All-in-One (MySQL + Node.js + Nginx)
# ============================================
# 单容器部署：包含 MySQL 8.0、Node.js、Nginx
# ============================================

# 第一阶段：构建前端
FROM node:20-alpine AS frontend-builder

ARG VITE_API_BASE=/api
ENV VITE_API_BASE=$VITE_API_BASE

WORKDIR /app/front
COPY front/package.json front/yarn.lock* ./
RUN yarn install --registry=https://registry.npmmirror.com --ignore-engines
COPY front/ ./
RUN yarn build

# 第二阶段：构建后端依赖
FROM node:20-alpine AS backend-deps

WORKDIR /app/server
ENV TZ=Asia/Shanghai
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/$TZ /etc/localtime && \
    echo $TZ > /etc/timezone
COPY server/package.json server/package-lock.json* ./
RUN npm ci --registry=https://registry.npmmirror.com --production

# 第三阶段：最终镜像 (基于 Ubuntu)
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Asia/Shanghai

# 设置时区
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 安装基础工具和 MySQL
RUN apt-get update && \
    apt-get install -y \
    wget \
    curl \
    gnupg \
    lsb-release \
    procps \
    mysql-server \
    mysql-client \
    && rm -rf /var/lib/apt/lists/*

# 安装 Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# 安装 Nginx
RUN apt-get update && \
    apt-get install -y nginx && \
    rm -rf /var/lib/apt/lists/*

# 配置 MySQL 目录
RUN mkdir -p /var/run/mysqld && \
    chown mysql:mysql /var/run/mysqld && \
    chmod 755 /var/run/mysqld

# 复制 Nginx 配置
COPY nginx.conf /etc/nginx/nginx.conf

# 复制 MySQL 初始化脚本
COPY mysql-init.sql /docker-entrypoint-initdb.d/init.sql

# 复制前端构建产物
COPY --from=frontend-builder /app/front/dist /usr/share/nginx/html

# 复制后端依赖
COPY --from=backend-deps /app/server/node_modules /app/server/node_modules

# 复制后端源代码
COPY server/ /app/server/

# 创建数据目录
RUN mkdir -p /app/server/data

# 设置工作目录
WORKDIR /app/server

# 暴露端口
EXPOSE 80

# 健康检查（首次启动需要较长时间）
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:80/health || exit 1

# 启动脚本
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
