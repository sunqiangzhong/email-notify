const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const {
  getAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
  testAccount,
  testExistingAccount,
  fetchRecentEmails,
  fetchEmailBody,
} = require('../controllers/emailsController');

// All routes require authentication
router.use(authMiddleware);

router.get('/', getAccounts);
router.post('/', createAccount);
router.post('/test-connection', testAccount);
router.put('/:id', updateAccount);
router.delete('/:id', deleteAccount);
router.post('/:id/test', testExistingAccount);
router.get('/:id/messages', fetchRecentEmails);
router.get('/:id/messages/:uid/body', fetchEmailBody);

module.exports = router;
