# ============================================
# 第一阶段：构建前端
# ============================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/front

# 复制依赖文件
COPY front/package.json front/yarn.lock* ./

# 安装依赖（忽略引擎检查）
RUN yarn install --registry=https://registry.npmmirror.com --ignore-engines

# 复制源代码
COPY front/ ./

# 构建前端
RUN yarn build

# ============================================
# 第二阶段：构建后端依赖
# ============================================
FROM node:20-alpine AS backend-deps

WORKDIR /app/server

# 设置时区
ENV TZ=Asia/Shanghai
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/$TZ /etc/localtime && \
    echo $TZ > /etc/timezone

# 复制依赖文件
COPY server/package.json server/package-lock.json* ./

# 安装生产依赖
RUN npm ci --registry=https://registry.npmmirror.com --production

# ============================================
# 第三阶段：最终镜像
# ============================================
FROM nginx:alpine

# 安装 Node.js 和工具
RUN apk add --no-cache nodejs npm wget

# 设置时区
ENV TZ=Asia/Shanghai
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/$TZ /etc/localtime && \
    echo $TZ > /etc/timezone

# 复制 nginx 配置
COPY nginx.conf /etc/nginx/nginx.conf

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

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:80/health || exit 1

# 启动脚本
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
