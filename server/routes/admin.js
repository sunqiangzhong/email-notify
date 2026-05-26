const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware } = require('../middlewares/auth');
const {
  getUsers,
  getUserStats,
  toggleUserStatus,
  deleteUser,
  createUser,
} = require('../controllers/adminController');

// All admin routes require auth + admin privileges
router.use(authMiddleware);
router.use(adminMiddleware);

router.get('/users', getUsers);
router.post('/users', createUser);
router.get('/users/:id/stats', getUserStats);
router.put('/users/:id/status', toggleUserStatus);
router.delete('/users/:id', deleteUser);

module.exports = router;
