#!/bin/bash
set -e

echo "=========================================="
echo "Mul-Email All-in-One"
echo "MySQL + Node.js + Nginx"
echo "=========================================="

# 设置环境变量默认值
export PORT=${PORT:-3001}
export DATA_DIR=${DATA_DIR:-/app/server/data}
export JWT_SECRET=${JWT_SECRET:-$(cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "default-secret-change-me")}
export ADMIN_USERNAME=${ADMIN_USERNAME:-admin}
export ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin123456}
export NODE_ENV=${NODE_ENV:-production}

# MySQL 配置（导出给 Node.js 后端使用）
export MYSQL_HOST=${MYSQL_HOST:-127.0.0.1}
export MYSQL_PORT=${MYSQL_PORT:-3306}
export MYSQL_USER=${MYSQL_USER:-root}
export MYSQL_PASSWORD=${MYSQL_PASSWORD:-mul_email_pass}
export MYSQL_DATABASE=${MYSQL_DATABASE:-mul_email}

echo "[INIT] 启动时间: $(date)"
echo "[INIT] 数据目录: $DATA_DIR"
echo "[INIT] 后端端口: $PORT"

# 确保数据目录存在
mkdir -p "$DATA_DIR"
mkdir -p /var/run/mysqld
chown mysql:mysql /var/run/mysqld
chmod 755 /var/run/mysqld

# ===== 初始化 MySQL =====
echo "[MYSQL] 检查 MySQL 状态..."

if [ ! -d "/var/lib/mysql/mysql" ]; then
    echo "[MYSQL] 首次启动，初始化数据库..."
    mysqld --initialize-insecure --user=mysql --datadir=/var/lib/mysql
    echo "[MYSQL] 数据库初始化完成"
fi

# 启动 MySQL（使用 init-file 设置密码）
echo "[MYSQL] 启动 MySQL 服务..."
mysqld --user=mysql --datadir=/var/lib/mysql --bind-address=0.0.0.0 --init-file=/docker-entrypoint-initdb.d/init.sql &
MYSQL_PID=$!

# 等待 MySQL 启动
echo "[MYSQL] 等待 MySQL 就绪..."
for i in $(seq 1 60); do
    if mysqladmin ping -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p"${MYSQL_PASSWORD}" --silent 2>/dev/null; then
        echo "[MYSQL] ✅ MySQL 已就绪"
        break
    fi
    if [ $i -eq 60 ]; then
        echo "[ERROR] MySQL 启动超时"
        # 显示 MySQL 错误日志
        tail -20 /var/log/mysql/error.log 2>/dev/null || echo "无法读取错误日志"
        exit 1
    fi
    sleep 1
done

# 验证数据库存在
echo "[MYSQL] 验证数据库..."
mysql -u "$MYSQL_USER" -p"${MYSQL_PASSWORD}" -h "$MYSQL_HOST" -P "$MYSQL_PORT" -e "USE ${MYSQL_DATABASE}; SHOW TABLES;" 2>/dev/null || {
    echo "[MYSQL] 数据库不存在，重新初始化..."
    mysql -u "$MYSQL_USER" -p"${MYSQL_PASSWORD}" -h "$MYSQL_HOST" -P "$MYSQL_PORT" < /docker-entrypoint-initdb.d/init.sql
}

# ===== 启动后端 =====
echo "[BACKEND] 启动后端服务..."
cd /app/server
node server.js &
BACKEND_PID=$!

# 等待后端启动
echo "[BACKEND] 等待后端服务就绪..."
for i in $(seq 1 60); do
    if wget --no-verbose --tries=1 --spider http://127.0.0.1:$PORT/api/health 2>/dev/null; then
        echo "[BACKEND] ✅ 后端服务已就绪"
        break
    fi
    if [ $i -eq 60 ]; then
        echo "[ERROR] 后端服务启动超时"
        exit 1
    fi
    sleep 1
done

# ===== 启动 Nginx =====
echo "[NGINX] 启动 Nginx..."
nginx -g "daemon off;" &
NGINX_PID=$!

echo "=========================================="
echo "✅ 系统已启动"
echo "=========================================="
echo "前端访问: http://0.0.0.0:80"
echo "后端API:  http://127.0.0.1:$PORT"
echo "MySQL:    127.0.0.1:3306"
echo "=========================================="

# 捕获退出信号
cleanup() {
    echo "[SHUTDOWN] 收到退出信号，正在关闭..."
    kill $NGINX_PID 2>/dev/null || true
    kill $BACKEND_PID 2>/dev/null || true
    kill $MYSQL_PID 2>/dev/null || true
    wait $NGINX_PID 2>/dev/null || true
    wait $BACKEND_PID 2>/dev/null || true
    wait $MYSQL_PID 2>/dev/null || true
    echo "[SHUTDOWN] ✅ 已关闭"
    exit 0
}

trap cleanup SIGTERM SIGINT

# 等待任意进程退出
set +e
wait -n $BACKEND_PID $NGINX_PID $MYSQL_PID
EXIT_CODE=$?
set -e

echo "[EXIT] 进程退出，代码: $EXIT_CODE"
cleanup
