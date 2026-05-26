/**
 * 认证路由
 */
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/auth');

// POST /api/auth/login - 用户登录
router.post('/login', authController.login);

// POST /api/auth/register - 用户注册
router.post('/register', authController.register);

// GET /api/auth/me - 获取当前用户信息（需要认证）
router.get('/me', authMiddleware, authController.getMe);

module.exports = router;
