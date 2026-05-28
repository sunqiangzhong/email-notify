/**
 * JWT 鉴权中间件
 * 从 Authorization: Bearer <token> 中解析 userId
 * 将 userId 挂载到 req.userId 上
 */
const jwt = require('jsonwebtoken');
const config = require('../config');

function authMiddleware(req, res, next) {
  // 优先从 Authorization 头读取，其次从 query 参数读取（SSE 场景）
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌，请先登录' });
  }
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: '令牌已过期，请重新登录' });
    }
    return res.status(401).json({ error: '无效的认证令牌' });
  }
}

/**
 * 管理员权限中间件 (需在 authMiddleware 之后使用)
 */
function adminMiddleware(req, res, next) {
  if (req.userRole !== 'super_admin') {
    return res.status(403).json({ error: '需要超级管理员权限' });
  }
  next();
}

module.exports = { authMiddleware, adminMiddleware };
