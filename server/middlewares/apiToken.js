/**
 * API 令牌验证中间件
 * 优先从数据库读取，回退到环境变量
 */
const config = require('../config');

/**
 * 获取当前配置的 API Token
 * 优先级：数据库 settings 表 > 环境变量 API_TOKEN
 */
function getConfiguredApiToken() {
  try {
    const { getDB } = require('../models/db');
    const db = getDB();
    const setting = db.data.settings.find(s => s.key === 'API_TOKEN');
    if (setting && setting.value) {
      return setting.value;
    }
  } catch (_) {
    // 数据库未初始化时回退到环境变量
  }
  return config.apiToken || '';
}

/**
 * 从请求中获取 API Token
 * 支持：
 *   - URL 参数: ?token=xxx
 *   - Header: X-API-Token: xxx
 */
function getApiTokenFromRequest(req) {
  return req.query.token || req.headers['x-api-token'] || '';
}

/**
 * API Token 验证中间件
 */
function apiTokenMiddleware(req, res, next) {
  const apiToken = getConfiguredApiToken();

  // 如果未配置 API_TOKEN，拒绝所有请求
  if (!apiToken) {
    return res.status(503).json({
      success: false,
      code: 'API_TOKEN_NOT_CONFIGURED',
      message: 'API 令牌未配置，请在系统设置中配置 API_TOKEN'
    });
  }

  const requestToken = getApiTokenFromRequest(req);

  if (!requestToken) {
    return res.status(401).json({
      success: false,
      code: 'MISSING_TOKEN',
      message: '缺少 API 令牌，请在 URL 参数 (?token=xxx) 或 Header (X-API-Token: xxx) 中提供'
    });
  }

  if (requestToken !== apiToken) {
    return res.status(403).json({
      success: false,
      code: 'INVALID_TOKEN',
      message: '无效的 API 令牌'
    });
  }

  // Token 验证通过
  next();
}

module.exports = {
  apiTokenMiddleware,
  getConfiguredApiToken,
};
