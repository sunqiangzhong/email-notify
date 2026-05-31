-- MySQL 初始化脚本
-- 设置 root 密码
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'mul_email_pass';
CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED WITH mysql_native_password BY 'mul_email_pass';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'localhost' WITH GRANT OPTION;
GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;
FLUSH PRIVILEGES;

-- 创建数据库
CREATE DATABASE IF NOT EXISTS mul_email CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE mul_email;

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
    disabled BOOLEAN DEFAULT FALSE,
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
    `to` VARCHAR(255),
    subject VARCHAR(500),
    date DATETIME,
    hasAttachments BOOLEAN DEFAULT FALSE,
    attachmentsCount INT DEFAULT 0,
    fetchedAt DATETIME
);
