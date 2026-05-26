/**
 * 代理路由
 */
const express = require('express');
const router = express.Router();
const proxyController = require('../controllers/proxyController');
const authMiddleware = require('../middlewares/auth');

router.use(authMiddleware);

// GET /api/proxies - 获取所有代理配置
router.get('/', proxyController.getAll);

// POST /api/proxies - 创建新代理配置
router.post('/', proxyController.create);

// POST /api/proxies/test-connectivity - 多场景连通性测试（必须在 /:id 之前）
router.post('/test-connectivity', proxyController.testConnectivity);

// GET /api/proxies/:id - 获取单个代理配置详情
router.get('/:id', proxyController.getById);

// PUT /api/proxies/:id - 更新代理配置
router.put('/:id', proxyController.update);

// DELETE /api/proxies/:id - 删除代理配置
router.delete('/:id', proxyController.remove);

module.exports = router;
