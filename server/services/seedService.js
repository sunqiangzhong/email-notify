/**
 * 种子服务 - 首次启动时创建默认管理员
 */
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../models/db');
const config = require('../config');

async function seedAdmin() {
  const db = getDB();
  const adminUsername = config.admin.username;

  // Check if admin already exists
  const existing = db.data.users.find(u => u.username === adminUsername);
  if (existing) {
    console.log(`[SEED] Admin user "${adminUsername}" already exists`);
    return;
  }

  const hashedPassword = await bcrypt.hash(config.admin.password, 10);

  const adminUser = {
    id: uuidv4(),
    username: adminUsername,
    password: hashedPassword,
    name: '超级管理员',
    email: config.admin.email,
    avatarColor: 'bg-rose-600',
    role: 'super_admin',
    disabled: false,
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  db.data.users.push(adminUser);
  await db.write();

  console.log(`[SEED] Created default admin: ${adminUsername}`);
}

module.exports = { seedAdmin };
