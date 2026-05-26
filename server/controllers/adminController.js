/**
 * 超级管理员控制器 - 多用户管理
 */
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../models/db');

/**
 * GET /api/admin/users
 * 获取所有用户列表 (super_admin only)
 */
async function getUsers(req, res, next) {
  try {
    const db = getDB();
    const users = db.data.users.map(u => ({
      id: u.id,
      username: u.username,
      name: u.name,
      email: u.email,
      avatarColor: u.avatarColor,
      role: u.role,
      disabled: u.disabled,
      status: u.status,
      createdAt: u.createdAt,
    }));

    res.json(users);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/users/:id/stats
 * 获取指定用户的统计信息
 */
async function getUserStats(req, res, next) {
  try {
    const db = getDB();
    const userId = req.params.id;

    const user = db.data.users.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const accounts = db.data.accounts.filter(a => a.userId === userId);
    const logs = db.data.emailLogs.filter(l => l.userId === userId);
    const proxy = db.data.proxies.find(p => p.userId === userId);
    const wechat = db.data.wechatConfigs.find(w => w.userId === userId);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        avatarColor: user.avatarColor,
        role: user.role,
        disabled: user.disabled,
        status: user.status,
      },
      stats: {
        accountsCount: accounts.length,
        logsCount: logs.length,
        provider: wechat?.provider || 'none',
        proxyEnabled: proxy?.enabled || false,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/admin/users/:id/status
 * 切换用户启用/禁用状态
 */
async function toggleUserStatus(req, res, next) {
  try {
    const db = getDB();
    const userId = req.params.id;

    // 不能禁用自己
    if (userId === req.userId) {
      return res.status(400).json({ error: '不能禁用自己的账户' });
    }

    const user = db.data.users.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 不能操作其他超级管理员
    if (user.role === 'super_admin' && req.userId !== user.id) {
      return res.status(403).json({ error: '不能操作其他超级管理员' });
    }

    user.disabled = !user.disabled;
    user.status = user.disabled ? 'suspended' : 'active';
    await db.write();

    res.json({
      id: user.id,
      disabled: user.disabled,
      status: user.status,
      message: user.disabled ? '用户已被禁用' : '用户已被启用',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/admin/users/:id
 * 删除用户及其所有关联数据
 */
async function deleteUser(req, res, next) {
  try {
    const db = getDB();
    const userId = req.params.id;

    // 不能删除自己
    if (userId === req.userId) {
      return res.status(400).json({ error: '不能删除自己的账户' });
    }

    const user = db.data.users.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 不能删除其他超级管理员
    if (user.role === 'super_admin') {
      return res.status(403).json({ error: '不能删除超级管理员' });
    }

    // 删除用户及关联数据
    db.data.users = db.data.users.filter(u => u.id !== userId);
    db.data.accounts = db.data.accounts.filter(a => a.userId !== userId);
    db.data.proxies = db.data.proxies.filter(p => p.userId !== userId);
    db.data.wechatConfigs = db.data.wechatConfigs.filter(w => w.userId !== userId);
    db.data.emailLogs = db.data.emailLogs.filter(l => l.userId !== userId);

    await db.write();

    res.json({ message: `用户 ${user.name} 及其所有数据已删除` });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/users
 * 管理员创建新用户
 */
async function createUser(req, res, next) {
  try {
    const { username, password, name, email, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const db = getDB();

    if (db.data.users.find(u => u.username === username)) {
      return res.status(409).json({ error: '用户名已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const colors = ['bg-emerald-600', 'bg-blue-600', 'bg-violet-600', 'bg-amber-600', 'bg-cyan-600', 'bg-rose-600'];

    const newUser = {
      id: uuidv4(),
      username,
      password: hashedPassword,
      name: name || username,
      email: email || `${username}@local`,
      avatarColor: colors[Math.floor(Math.random() * colors.length)],
      role: role === 'super_admin' ? 'user' : (role || 'user'), // 防止创建新的 super_admin
      disabled: false,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    db.data.users.push(newUser);
    await db.write();

    const { password: _, ...safeUser } = newUser;
    res.status(201).json(safeUser);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getUsers,
  getUserStats,
  toggleUserStatus,
  deleteUser,
  createUser,
};
