/**
 * 认证控制器
 * 处理用户登录、注册等操作
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { usersDb } = require('../models/database');
const config = require('../config');

/**
 * 用户登录
 * POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: '用户名和密码不能为空',
      });
    }

    // 查找用户
    const user = usersDb.get('users').find({ username }).value();
    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: '用户名或密码错误',
      });
    }

    // 验证密码
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: '用户名或密码错误',
      });
    }

    // 生成 JWT
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    return res.json({
      success: true,
      code: 'LOGIN_SUCCESS',
      message: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          createdAt: user.createdAt,
        },
      },
    });
  } catch (error) {
    console.error('登录错误:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
};

/**
 * 用户注册
 * POST /api/auth/register
 */
const register = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: '用户名和密码不能为空',
      });
    }

    // 检查用户名是否已存在
    const existingUser = usersDb.get('users').find({ username }).value();
    if (existingUser) {
      return res.status(409).json({
        success: false,
        code: 'USER_EXISTS',
        message: '用户名已存在',
      });
    }

    // 密码加密
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 创建用户
    const newUser = {
      id: uuidv4(),
      username,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
    };

    usersDb.get('users').push(newUser).write();

    // 生成 JWT
    const token = jwt.sign(
      { userId: newUser.id, username: newUser.username },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    return res.status(201).json({
      success: true,
      code: 'REGISTER_SUCCESS',
      message: '注册成功',
      data: {
        token,
        user: {
          id: newUser.id,
          username: newUser.username,
          createdAt: newUser.createdAt,
        },
      },
    });
  } catch (error) {
    console.error('注册错误:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
};

/**
 * 获取当前用户信息
 * GET /api/auth/me
 */
const getMe = async (req, res) => {
  try {
    const user = usersDb.get('users').find({ id: req.user.userId }).value();
    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: '用户不存在',
      });
    }

    return res.json({
      success: true,
      code: 'USER_FOUND',
      message: '获取用户信息成功',
      data: {
        id: user.id,
        username: user.username,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
};

/**
 * 初始化默认管理员账号
 * 系统首次启动时自动创建
 */
const initDefaultAdmin = async () => {
  try {
    const adminExists = usersDb.get('users').find({ username: config.defaultAdmin.username }).value();
    if (!adminExists) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(config.defaultAdmin.password, salt);
      
      const adminUser = {
        id: uuidv4(),
        username: config.defaultAdmin.username,
        password: hashedPassword,
        createdAt: new Date().toISOString(),
      };

      usersDb.get('users').push(adminUser).write();
      console.log('默认管理员账号已创建:', config.defaultAdmin.username);
    }
  } catch (error) {
    console.error('初始化默认管理员账号失败:', error);
  }
};

module.exports = {
  login,
  register,
  getMe,
  initDefaultAdmin,
};
