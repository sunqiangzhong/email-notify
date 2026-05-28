/**
 * 系统日志事件发射器
 *
 * 劫持 console.log / console.warn / console.error，
 * 将日志结构化后通过 EventEmitter 广播，供 SSE 端点消费。
 */
const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

// 原始 console 方法引用
const _log = console.log.bind(console);
const _warn = console.warn.bind(console);
const _error = console.error.bind(console);

// 最近日志缓冲区（供新连接初始化用）
const recentLogs = [];
const MAX_RECENT = 200;

/**
 * 解析日志级别：根据 console 方法或消息前缀判断
 */
function resolveLevel(method, args) {
  if (method === 'error') return 'error';
  if (method === 'warn') return 'warning';

  // 根据消息前缀判断类型
  const first = String(args[0] || '');
  if (first.includes('[MAIL]')) return 'info';
  if (first.includes('[SERVER]')) return 'info';
  if (first.includes('[DB]')) return 'info';
  if (first.includes('[AUTH]')) return 'info';
  if (first.includes('[FATAL]')) return 'error';
  if (first.includes('[ERROR]')) return 'error';

  return 'info';
}

/**
 * 解析日志类型标签
 */
function resolveType(args) {
  const first = String(args[0] || '');
  const match = first.match(/^\[([A-Z_]+)\]/);
  if (match) return match[1];

  // 常见模式
  if (first.includes('[MAIL]')) return 'MAIL';
  if (first.includes('[SERVER]')) return 'SERVER';
  if (first.includes('[DB]')) return 'DB';
  if (first.includes('[AUTH]')) return 'AUTH';
  if (first.includes('[ERROR]')) return 'ERROR';
  if (first.includes('[FATAL]')) return 'FATAL';

  return 'SYSTEM';
}

/**
 * 格式化日志消息
 */
function formatMessage(args) {
  return args
    .map(a => {
      if (a instanceof Error) return a.message + '\n' + a.stack;
      if (typeof a === 'object') {
        try { return JSON.stringify(a); } catch { return String(a); }
      }
      return String(a);
    })
    .join(' ');
}

/**
 * 广播一条日志
 */
function broadcast(method, args) {
  const entry = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    level: resolveLevel(method, args),
    type: resolveType(args),
    message: formatMessage(args),
  };

  // 写入缓冲区
  recentLogs.unshift(entry);
  if (recentLogs.length > MAX_RECENT) recentLogs.pop();

  // 广播给所有 SSE 客户端
  emitter.emit('log', entry);
}

// 劫持 console 方法
console.log = (...args) => {
  _log(...args);
  broadcast('log', args);
};

console.warn = (...args) => {
  _warn(...args);
  broadcast('warn', args);
};

console.error = (...args) => {
  _error(...args);
  broadcast('error', args);
};

module.exports = {
  emitter,
  getRecentLogs: () => [...recentLogs],
};
