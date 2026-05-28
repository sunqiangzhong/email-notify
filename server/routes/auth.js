const express = require('express');
const router = express.Router();
const { login, register, getMe, changePassword } = require('../controllers/authController');
const { authMiddleware } = require('../middlewares/auth');

router.post('/login', login);
router.post('/register', register);
router.get('/me', authMiddleware, getMe);
router.patch('/password', authMiddleware, changePassword);

module.exports = router;
