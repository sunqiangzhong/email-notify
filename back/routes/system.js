/**
 * 系统路由
 */
const express = require('express');
const router = express.Router();
const systemController = require('../controllers/systemController');

// GET /api/system/status - 获取系统状态
router.get('/status', systemController.getStatus);

// GET /api/system/ping - 网络延迟测试
router.get('/ping', systemController.ping);

module.exports = router;
