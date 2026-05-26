const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const { getStatus, pingDiagnostics } = require('../controllers/systemController');

router.use(authMiddleware);

router.get('/status', getStatus);
router.get('/ping', pingDiagnostics);

module.exports = router;
