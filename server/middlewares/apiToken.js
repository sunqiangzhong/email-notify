/**
 * API 令牌验证中间件
 * 参考 MoviePilot 实现，支持 URL 参数和 Header 两种方式
 */
const config = require('../config');

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
 * 验证请求中的 token 是否与配置的 API_TOKEN 匹配
 */
function apiTokenMiddleware(req, res, next) {
  const apiToken = config.apiToken;

  // 如果未配置 API_TOKEN，拒绝所有请求
  if (!apiToken) {
    return res.status(503).json({
      success: false,
      code: 'API_TOKEN_NOT_CONFIGURED',
      message: 'API 令牌未配置，请在环境变量中设置 API_TOKEN'
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

/**
 * 获取当前配置的 API Token（用于前端显示）
 */
function getConfiguredApiToken() {
  return config.apiToken || '';
}

module.exports = {
  apiTokenMiddleware,
  getConfiguredApiToken,
};
