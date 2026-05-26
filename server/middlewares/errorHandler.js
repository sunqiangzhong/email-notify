/**
 * 全局错误处理中间件
 */
function errorHandler(err, _req, res, _next) {
  console.error('[ERROR]', err.message);
  console.error(err.stack);

  const statusCode = err.statusCode || 500;
  const message = err.message || '服务器内部错误';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

module.exports = errorHandler;
