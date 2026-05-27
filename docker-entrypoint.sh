#!/bin/sh
set -e

echo "=========================================="
echo "Mul-Email - 多邮箱聚合与通知管理系统"
echo "=========================================="

# 设置环境变量默认值
export PORT=${PORT:-3001}
export DATA_DIR=${DATA_DIR:-/app/server/data}
export JWT_SECRET=${JWT_SECRET:-$(cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "default-secret-change-me")}
export ADMIN_USERNAME=${ADMIN_USERNAME:-admin}
export ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin123}
export NODE_ENV=${NODE_ENV:-production}

echo "[INIT] 启动时间: $(date)"
echo "[INIT] 数据目录: $DATA_DIR"
echo "[INIT] 后端端口: $PORT"

# 确保数据目录存在
mkdir -p "$DATA_DIR"

# 启动后端服务（后台运行）
echo "[INIT] 启动后端服务..."
cd /app/server
node server.js &
BACKEND_PID=$!

# 等待后端启动
echo "[INIT] 等待后端服务就绪..."
for i in $(seq 1 30); do
    if wget --no-verbose --tries=1 --spider http://127.0.0.1:$PORT/api/health 2>/dev/null; then
        echo "[INIT] 后端服务已就绪"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "[ERROR] 后端服务启动超时"
        exit 1
    fi
    sleep 1
done

# 启动 nginx
echo "[INIT] 启动 Nginx..."
nginx -g "daemon off;" &
NGINX_PID=$!

echo "=========================================="
echo "系统已启动"
echo "前端访问: http://127.0.0.1:80"
echo "后端API:  http://127.0.0.1:$PORT"
echo "=========================================="

# 捕获退出信号
cleanup() {
    echo "[SHUTDOWN] 收到退出信号，正在关闭..."
    kill $NGINX_PID 2>/dev/null
    kill $BACKEND_PID 2>/dev/null
    wait $NGINX_PID 2>/dev/null
    wait $BACKEND_PID 2>/dev/null
    echo "[SHUTDOWN] 已关闭"
    exit 0
}

trap cleanup SIGTERM SIGINT

# 等待任意进程退出
wait -n $BACKEND_PID $NGINX_PID
EXIT_CODE=$?

echo "[EXIT] 进程退出，代码: $EXIT_CODE"
cleanup
