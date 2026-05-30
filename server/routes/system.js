const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const {
  getStatus,
  pingDiagnostics,
  streamLogs,
  getLogFilterConfig,
  updateLogFilterConfig,
} = require('../controllers/systemController');

router.use(authMiddleware);

router.get('/status', getStatus);
router.get('/ping', pingDiagnostics);
router.get('/logs', streamLogs);
router.get('/logs/filter', getLogFilterConfig);
router.put('/logs/filter', updateLogFilterConfig);

module.exports = router;
