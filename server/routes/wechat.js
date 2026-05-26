const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const { getWechatConfig, updateWechatConfig, testWechat } = require('../controllers/wechatController');

router.use(authMiddleware);

router.get('/', getWechatConfig);
router.put('/', updateWechatConfig);
router.post('/test', testWechat);

module.exports = router;
