const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const {
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  testAccount,
} = require('../controllers/accountsController');

// All routes require authentication
router.use(authMiddleware);

router.get('/', getAccounts);
router.post('/', createAccount);
router.post('/test', testAccount);
router.put('/:id', updateAccount);
router.delete('/:id', deleteAccount);

module.exports = router;
