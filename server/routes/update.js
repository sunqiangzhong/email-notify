/**
 * 系统更新路由
 * 检查更新、执行更新
 */
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const updateService = require('../services/updateService');

/**
 * GET /api/update/check
 * 检查是否有新版本
 */
router.get('/check', authMiddleware, async (req, res, next) => {
  try {
    const force = req.query.force === 'true';
    const result = await updateService.checkForUpdates(force);

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/update/current
 * 获取当前版本
 */
router.get('/current', authMiddleware, async (req, res, next) => {
  try {
    const version = updateService.getCurrentVersion();
    const isDocker = await updateService.isDockerEnvironment();
    const hasDockerAccess = await updateService.hasDockerAccess();

    res.json({
      success: true,
      data: {
        version,
        isDocker,
        hasDockerAccess,
        canAutoUpdate: isDocker && hasDockerAccess,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/update/perform
 * 执行自动更新
 */
router.post('/perform', authMiddleware, async (req, res, next) => {
  try {
    // 检查是否可以自动更新
    const isDocker = await updateService.isDockerEnvironment();
    const hasDockerAccess = await updateService.hasDockerAccess();

    if (!isDocker || !hasDockerAccess) {
      return res.status(400).json({
        success: false,
        message: '当前环境不支持自动更新',
        details: {
          isDocker,
          hasDockerAccess,
          reason: !isDocker ? '不在 Docker 环境中' : '没有 Docker 访问权限',
        },
      });
    }

    // 执行更新
    const result = await updateService.performUpdate();

    res.json({
      success: result.success,
      message: result.message,
      data: {
        log: result.log,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
