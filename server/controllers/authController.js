/**
 * 鉴权控制器
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../models/db');
const config = require('../config');

/**
 * POST /api/auth/login
 * 用户登录，返回 JWT Token
 */
async function login(req, res, next) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const db = getDB();
    const user = db.data.users.find(u => u.username === username);

    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    if (user.disabled || user.status === 'suspended') {
      return res.status(403).json({ error: '该账户已被管理员禁用，请联系管理员' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        avatarColor: user.avatarColor,
        role: user.role,
        status: user.status,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/register
 * 新用户注册
 */
async function register(req, res, next) {
  try {
    const { username, password, name, email } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度不能少于6位' });
    }

    const db = getDB();

    if (db.data.users.find(u => u.username === username)) {
      return res.status(409).json({ error: '用户名已存在' });
    }

    if (email && db.data.users.find(u => u.email === email)) {
      return res.status(409).json({ error: '邮箱已被注册' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const colors = ['bg-emerald-600', 'bg-blue-600', 'bg-violet-600', 'bg-amber-600', 'bg-cyan-600', 'bg-rose-600'];

    const newUser = {
      id: uuidv4(),
      username,
      password: hashedPassword,
      name: name || username,
      email: email || username + '@local',
      avatarColor: colors[Math.floor(Math.random() * colors.length)],
      role: 'user',
      disabled: false,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    db.data.users.push(newUser);
    await db.write();

    const token = jwt.sign(
      { userId: newUser.id, role: newUser.role },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        name: newUser.name,
        email: newUser.email,
        avatarColor: newUser.avatarColor,
        role: newUser.role,
        status: newUser.status,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me
 * 获取当前用户信息
 */
async function getMe(req, res, next) {
  try {
    const db = getDB();
    const user = db.data.users.find(u => u.id === req.userId);

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    res.json({
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      avatarColor: user.avatarColor,
      role: user.role,
      disabled: user.disabled,
      status: user.status,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/auth/password
 * 修改当前用户密码
 */
async function changePassword(req, res, next) {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '原密码和新密码不能为空' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码长度不能少于6位' });
    }

    const db = getDB();
    const user = db.data.users.find(u => u.id === req.userId);

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) {
      return res.status(401).json({ error: '原密码错误' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await db.write();

    res.json({ message: '密码修改成功' });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, register, getMe, changePassword };
