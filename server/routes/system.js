const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const { getStatus, pingDiagnostics, streamLogs } = require('../controllers/systemController');

router.use(authMiddleware);

router.get('/status', getStatus);
router.get('/ping', pingDiagnostics);
router.get('/logs', streamLogs);

module.exports = router;
