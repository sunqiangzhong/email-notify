const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const {
  getPresets,
  testConnectivity,
  testAll,
  testProxy,
} = require('../controllers/connectivityController');

router.use(authMiddleware);

router.get('/presets', getPresets);
router.post('/test', testConnectivity);
router.post('/test-all', testAll);
router.post('/test-proxy', testProxy);

module.exports = router;
