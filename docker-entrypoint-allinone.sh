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

# MySQL 配置
export MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD:-mul_email_pass}
export MYSQL_PASSWORD=${MYSQL_PASSWORD:-mul_email_pass}
export MYSQL_DATABASE=${MYSQL_DATABASE:-mul_email}
export MYSQL_HOST=${MYSQL_HOST:-127.0.0.1}
export MYSQL_PORT=${MYSQL_PORT:-3306}
export MYSQL_USER=${MYSQL_USER:-root}

echo "[INIT] 启动时间: $(date)"
echo "[INIT] 数据目录: $DATA_DIR"
echo "[INIT] 后端端口: $PORT"
echo "[INIT] MySQL 数据库: $MYSQL_DATABASE"

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

    # 启动 MySQL（临时）
    echo "[MYSQL] 启动临时 MySQL 服务..."
    mysqld --user=mysql --datadir=/var/lib/mysql --skip-networking &
    MYSQL_PID=$!
    sleep 5

    # 等待 MySQL 启动
    for i in $(seq 1 30); do
        if mysqladmin ping -h 127.0.0.1 --silent 2>/dev/null; then
            echo "[MYSQL] 临时 MySQL 已启动"
            break
        fi
        if [ $i -eq 30 ]; then
            echo "[ERROR] MySQL 启动超时"
            exit 1
        fi
        sleep 1
    done

    # 设置 root 密码和创建数据库
    echo "[MYSQL] 配置数据库..."
    mysql -u root <<EOF
-- 设置 root 密码
ALTER USER 'root'@'localhost' IDENTIFIED BY '${MYSQL_ROOT_PASSWORD}';
CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED BY '${MYSQL_ROOT_PASSWORD}';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;
FLUSH PRIVILEGES;

-- 创建应用数据库
CREATE DATABASE IF NOT EXISTS ${MYSQL_DATABASE} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 使用数据库
USE ${MYSQL_DATABASE};

-- 创建表结构
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    email VARCHAR(255),
    avatarColor VARCHAR(50),
    role VARCHAR(50) DEFAULT 'user',
    status VARCHAR(50) DEFAULT 'active',
    createdAt DATETIME,
    updatedAt DATETIME
);

CREATE TABLE IF NOT EXISTS accounts (
    id VARCHAR(36) PRIMARY KEY,
    userId VARCHAR(36),
    name VARCHAR(255),
    email VARCHAR(255),
    password VARCHAR(255),
    type VARCHAR(50),
    status VARCHAR(50) DEFAULT 'connecting',
    imapHost VARCHAR(255),
    imapPort INT DEFAULT 993,
    useSSL BOOLEAN DEFAULT TRUE,
    useProxy BOOLEAN DEFAULT FALSE,
    proxyId VARCHAR(36),
    active BOOLEAN DEFAULT TRUE,
    lastSync DATETIME,
    lastError TEXT,
    createdAt DATETIME,
    updatedAt DATETIME
);

CREATE TABLE IF NOT EXISTS proxies (
    id VARCHAR(36) PRIMARY KEY,
    userId VARCHAR(36),
    name VARCHAR(255),
    type VARCHAR(50),
    host VARCHAR(255),
    port INT,
    username VARCHAR(255),
    password VARCHAR(255),
    createdAt DATETIME,
    updatedAt DATETIME
);

CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(36) PRIMARY KEY,
    userId VARCHAR(36),
    name VARCHAR(255),
    type VARCHAR(50),
    config JSON,
    active BOOLEAN DEFAULT TRUE,
    createdAt DATETIME,
    updatedAt DATETIME
);

CREATE TABLE IF NOT EXISTS filters (
    id VARCHAR(36) PRIMARY KEY,
    userId VARCHAR(36),
    name VARCHAR(255),
    emailId VARCHAR(36),
    notificationId VARCHAR(36),
    keywords JSON,
    matchType VARCHAR(50) DEFAULT 'any',
    active BOOLEAN DEFAULT TRUE,
    createdAt DATETIME,
    updatedAt DATETIME
);

CREATE TABLE IF NOT EXISTS emailLogs (
    id VARCHAR(36) PRIMARY KEY,
    userId VARCHAR(36),
    accountId VARCHAR(36),
    subject VARCHAR(500),
    senderName VARCHAR(255),
    senderEmail VARCHAR(255),
    toEmail VARCHAR(255),
    receivedAt DATETIME,
    forwardStatus VARCHAR(50),
    snippet TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accountEmails (
    id VARCHAR(36) PRIMARY KEY,
    accountId VARCHAR(36),
    userId VARCHAR(36),
    uid INT,
    fromName VARCHAR(255),
    fromAddress VARCHAR(255),
    subject VARCHAR(500),
    date DATETIME,
    hasAttachments BOOLEAN DEFAULT FALSE,
    attachmentsCount INT DEFAULT 0,
    fetchedAt DATETIME
);
EOF

    # 停止临时 MySQL
    echo "[MYSQL] 停止临时 MySQL..."
    mysqladmin -u root -p"${MYSQL_ROOT_PASSWORD}" shutdown 2>/dev/null || true
    wait $MYSQL_PID 2>/dev/null || true
    sleep 2
else
    echo "[MYSQL] 数据库已存在，跳过初始化"
fi

# ===== 启动 MySQL（正式）=====
echo "[MYSQL] 启动 MySQL 服务..."
mysqld --user=mysql --datadir=/var/lib/mysql &
MYSQL_PID=$!

# 等待 MySQL 启动
echo "[MYSQL] 等待 MySQL 就绪..."
for i in $(seq 1 60); do
    if mysqladmin ping -h 127.0.0.1 -u root -p"${MYSQL_ROOT_PASSWORD}" --silent 2>/dev/null; then
        echo "[MYSQL] ✅ MySQL 已就绪"
        break
    fi
    if [ $i -eq 60 ]; then
        echo "[ERROR] MySQL 启动超时"
        exit 1
    fi
    sleep 1
done

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
