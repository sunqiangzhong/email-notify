const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const { getProxy, updateProxy, testProxy } = require('../controllers/proxyController');

router.use(authMiddleware);

router.get('/', getProxy);
router.put('/', updateProxy);
router.post('/test', testProxy);

module.exports = router;
