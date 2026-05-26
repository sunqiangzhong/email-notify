FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 安装 ping 工具（用于网络诊断）
RUN apk add --no-cache iputils

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制源代码
COPY . .

# 创建数据目录
RUN mkdir -p /app/data

# 设置数据目录权限
RUN chmod 755 /app/data

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# 启动应用
CMD ["node", "server.js"]
