const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const {
  getProxies,
  getProxyById,
  createProxy,
  updateProxy,
  deleteProxy,
  testConnectivity,
} = require('../controllers/proxiesController');

router.use(authMiddleware);

router.get('/', getProxies);
router.post('/', createProxy);
router.post('/test-connectivity', testConnectivity);
router.get('/:id', getProxyById);
router.put('/:id', updateProxy);
router.delete('/:id', deleteProxy);

module.exports = router;
