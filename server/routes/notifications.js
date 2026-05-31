const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const {
  getNotifications,
  getNotificationById,
  createNotification,
  updateNotification,
  deleteNotification,
  testSend,
  getFilters,
  createFilter,
  updateFilter,
  deleteFilter,
  getNotificationTypes,
  debugNotifications,
} = require('../controllers/notificationsController');

router.use(authMiddleware);

// 获取通知类型配置
router.get('/types', getNotificationTypes);

// 诊断接口
router.get('/debug', debugNotifications);

// 通知渠道 CRUD
router.get('/', getNotifications);
router.post('/', createNotification);
router.post('/:id/test', testSend);
router.get('/:id', getNotificationById);
router.put('/:id', updateNotification);
router.delete('/:id', deleteNotification);

// 过滤规则 CRUD
router.get('/filters', getFilters);
router.post('/filters', createFilter);
router.put('/filters/:id', updateFilter);
router.delete('/filters/:id', deleteFilter);

module.exports = router;
