const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const { getLogs, getLogStats, deleteLog, clearLogs } = require('../controllers/logsController');

router.use(authMiddleware);

router.get('/', getLogs);
router.get('/stats', getLogStats);
router.delete('/clear', clearLogs);
router.delete('/:id', deleteLog);

module.exports = router;
