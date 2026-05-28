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
  streamNewEmails,
} = require('../controllers/emailsController');

// All routes require authentication
router.use(authMiddleware);

router.get('/', getAccounts);
router.post('/', createAccount);
router.post('/test-connection', testAccount);
// SSE 新邮件推送流（必须在 /:id 之前注册，避免 'stream' 被当作 id）
router.get('/stream', streamNewEmails);
router.put('/:id', updateAccount);
router.delete('/:id', deleteAccount);
router.post('/:id/test', testExistingAccount);
router.get('/:id/messages', fetchRecentEmails);
router.get('/:id/messages/:uid/body', fetchEmailBody);

module.exports = router;
