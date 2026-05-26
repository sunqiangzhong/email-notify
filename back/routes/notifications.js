/**
 * 通知路由
 */
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authMiddleware = require('../middlewares/auth');

// 所有通知路由都需要认证
router.use(authMiddleware);

// GET /api/notifications - 获取所有通知配置
router.get('/', notificationController.getAll);

// GET /api/notifications/:id - 获取单个通知配置详情
router.get('/:id', notificationController.getById);

// POST /api/notifications - 创建新通知配置
router.post('/', notificationController.create);

// PUT /api/notifications/:id - 更新通知配置
router.put('/:id', notificationController.update);

// DELETE /api/notifications/:id - 删除通知配置
router.delete('/:id', notificationController.remove);

// POST /api/notifications/:id/test - 测试通知发送
router.post('/:id/test', notificationController.testSend);

// ============ 过滤规则路由 ============

// GET /api/filters - 获取所有过滤规则
router.get('/filters', notificationController.getAllFilters);

// POST /api/filters - 创建新过滤规则
router.post('/filters', notificationController.createFilter);

// PUT /api/filters/:id - 更新过滤规则
router.put('/filters/:id', notificationController.updateFilter);

// DELETE /api/filters/:id - 删除过滤规则
router.delete('/filters/:id', notificationController.removeFilter);

module.exports = router;
