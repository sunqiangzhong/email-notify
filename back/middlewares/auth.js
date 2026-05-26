/**
 * JWT 鉴权中间件
 * 解析 Header 中的 Token 提取 userId
 * 所有受保护的接口必须通过此中间件
 */
const jwt = require('jsonwebtoken');
const config = require('../config');

const authMiddleware = (req, res, next) => {
  try {
    // 从 Authorization header 获取 token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        code: 'NO_TOKEN',
        message: '未提供认证令牌',
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_TOKEN_FORMAT',
        message: '令牌格式错误',
      });
    }

    // 验证并解码 token
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
    };
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        code: 'TOKEN_EXPIRED',
        message: '令牌已过期，请重新登录',
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        code: 'INVALID_TOKEN',
        message: '无效的认证令牌',
      });
    }
    return res.status(500).json({
      success: false,
      code: 'AUTH_ERROR',
      message: '认证服务异常',
    });
  }
};

module.exports = authMiddleware;
