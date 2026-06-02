-- Mul-Email MySQL Schema

CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `username` VARCHAR(100) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `name` VARCHAR(100) DEFAULT '',
  `email` VARCHAR(200) DEFAULT '',
  `avatarColor` VARCHAR(50) DEFAULT '',
  `role` VARCHAR(20) DEFAULT 'user',
  `disabled` TINYINT(1) DEFAULT 0,
  `status` VARCHAR(20) DEFAULT 'active',
  `createdAt` VARCHAR(30) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `accounts` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `userId` VARCHAR(36) NOT NULL,
  `name` VARCHAR(100) DEFAULT '',
  `email` VARCHAR(200) NOT NULL,
  `password` VARCHAR(500) NOT NULL,
  `type` VARCHAR(20) DEFAULT 'custom',
  `status` VARCHAR(20) DEFAULT 'offline',
  `imapHost` VARCHAR(200) DEFAULT '',
  `imapPort` INT DEFAULT 993,
  `useSSL` TINYINT(1) DEFAULT 1,
  `useProxy` TINYINT(1) DEFAULT 0,
  `proxyId` VARCHAR(36) DEFAULT NULL,
  `active` TINYINT(1) DEFAULT 1,
  `lastSync` VARCHAR(30) DEFAULT NULL,
  `lastError` VARCHAR(500) DEFAULT NULL,
  `createdAt` VARCHAR(30) DEFAULT NULL,
  `updatedAt` VARCHAR(30) DEFAULT NULL,
  UNIQUE KEY `uk_accounts_email` (`email`),
  INDEX `idx_accounts_userId` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `proxies` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `userId` VARCHAR(36) NOT NULL,
  `name` VARCHAR(100) DEFAULT '',
  `type` VARCHAR(20) DEFAULT 'socks5',
  `host` VARCHAR(200) NOT NULL,
  `port` INT NOT NULL,
  `username` VARCHAR(100) DEFAULT NULL,
  `password` VARCHAR(200) DEFAULT NULL,
  `createdAt` VARCHAR(30) DEFAULT NULL,
  `updatedAt` VARCHAR(30) DEFAULT NULL,
  INDEX `idx_proxies_userId` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `userId` VARCHAR(36) NOT NULL,
  `name` VARCHAR(100) DEFAULT '',
  `type` VARCHAR(30) NOT NULL,
  `config` JSON DEFAULT NULL,
  `active` TINYINT(1) DEFAULT 1,
  `createdAt` VARCHAR(30) DEFAULT NULL,
  `updatedAt` VARCHAR(30) DEFAULT NULL,
  UNIQUE KEY `uk_notifications_user_type` (`userId`, `type`),
  INDEX `idx_notifications_userId` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `filters` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `userId` VARCHAR(36) NOT NULL,
  `name` VARCHAR(100) DEFAULT '',
  `emailId` VARCHAR(36) DEFAULT NULL,
  `notificationId` VARCHAR(36) DEFAULT NULL,
  `keywords` JSON DEFAULT NULL,
  `matchType` VARCHAR(10) DEFAULT 'any',
  `active` TINYINT(1) DEFAULT 1,
  `createdAt` VARCHAR(30) DEFAULT NULL,
  `updatedAt` VARCHAR(30) DEFAULT NULL,
  INDEX `idx_filters_userId` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `emailLogs` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `userId` VARCHAR(36) NOT NULL,
  `accountId` VARCHAR(36) NOT NULL,
  `subject` VARCHAR(500) DEFAULT '',
  `senderName` VARCHAR(200) DEFAULT '',
  `senderEmail` VARCHAR(200) DEFAULT '',
  `toEmail` VARCHAR(200) DEFAULT '',
  `receivedAt` VARCHAR(30) DEFAULT NULL,
  `forwardStatus` VARCHAR(30) DEFAULT 'pending',
  `forwardTarget` VARCHAR(100) DEFAULT NULL,
  `errorDetails` VARCHAR(500) DEFAULT NULL,
  `snippet` VARCHAR(500) DEFAULT '',
  INDEX `idx_emailLogs_userId` (`userId`),
  INDEX `idx_emailLogs_accountId` (`accountId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `accountEmails` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `accountId` VARCHAR(36) NOT NULL,
  `userId` VARCHAR(36) NOT NULL,
  `uid` INT NOT NULL,
  `fromName` VARCHAR(200) DEFAULT '',
  `fromAddress` VARCHAR(200) DEFAULT '',
  `to` VARCHAR(200) DEFAULT '',
  `subject` VARCHAR(500) DEFAULT '',
  `date` VARCHAR(30) DEFAULT NULL,
  `hasAttachments` TINYINT(1) DEFAULT 0,
  `attachmentsCount` INT DEFAULT 0,
  `fetchedAt` VARCHAR(30) DEFAULT NULL,
  INDEX `idx_accountEmails_accountId` (`accountId`),
  INDEX `idx_accountEmails_userId` (`userId`),
  UNIQUE KEY `uk_accountEmails_account_uid` (`accountId`, `uid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `settings` (
  `key` VARCHAR(100) NOT NULL PRIMARY KEY,
  `value` TEXT,
  `updatedAt` VARCHAR(30) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
