/**
 * 邮箱路由
 */
const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');
const authMiddleware = require('../middlewares/auth');

// 所有邮箱路由都需要认证
router.use(authMiddleware);

// GET /api/emails - 获取所有邮箱
router.get('/', emailController.getAll);

// POST /api/emails - 创建新邮箱
router.post('/', emailController.create);

// POST /api/emails/test-connection - 测试邮箱连接（新建时）
router.post('/test-connection', emailController.testConnection);

// GET /api/emails/:id/messages - 拉取最近邮件（必须在 /:id 之前）
router.get('/:id/messages', emailController.fetchRecent);

// GET /api/emails/:id/messages/:uid/body - 获取单封邮件正文
router.get('/:id/messages/:uid/body', emailController.getEmailBody);

// POST /api/emails/:id/test - 测试已有邮箱连接（使用存储密码）
router.post('/:id/test', emailController.testExistingConnection);

// GET /api/emails/:id - 获取单个邮箱详情
router.get('/:id', emailController.getById);

// PUT /api/emails/:id - 更新邮箱
router.put('/:id', emailController.update);

// DELETE /api/emails/:id - 删除邮箱
router.delete('/:id', emailController.remove);

module.exports = router;
