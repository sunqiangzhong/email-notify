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

// 日志过滤配置
// 设置为 true 以过滤掉指定类型和模式的日志推送到前端
let ENABLE_FILTER = true;

// 过滤掉的日志类型（type 字段匹配）
const FILTERED_TYPES = new Set([
  // 'SYSTEM',  // 过滤 SYSTEM 类型（通常是 HTTP 请求日志）
  // 'MAIL',    // 取消注释以过滤所有 MAIL 类型
]);

// 过滤掉的消息内容模式（正则匹配）
const FILTERED_PATTERNS = [
  /^\[.*\] [A-Z]+ \/.* HTTP\/\d/,  // HTTP 请求日志: [timestamp] GET /api/xxx HTTP/1.1
  /\/api\/.*200/,                    // 带状态码的请求日志
];

/**
 * 检查日志是否应该被过滤
 */
function shouldFilter(type, message) {
  if (!ENABLE_FILTER) return false;

  // 检查类型过滤
  if (FILTERED_TYPES.has(type)) return true;

  // 检查消息模式过滤
  for (const pattern of FILTERED_PATTERNS) {
    if (pattern.test(message)) return true;
  }

  return false;
}

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
  const type = resolveType(args);
  const message = formatMessage(args);

  // 检查是否应该过滤此日志
  if (shouldFilter(type, message)) return;

  const entry = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    level: resolveLevel(method, args),
    type: type,
    message: message,
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
  // 导出过滤配置函数，方便运行时调整
  addFilterType: (type) => FILTERED_TYPES.add(type),
  removeFilterType: (type) => FILTERED_TYPES.delete(type),
  addFilterPattern: (pattern) => FILTERED_PATTERNS.push(pattern),
  setFilterEnabled: (enabled) => { ENABLE_FILTER = enabled; },
  isFilterEnabled: () => ENABLE_FILTER,
};
