/**
 * 日志事件模块
 * 用 EventEmitter 在邮件服务和 WebSocket 之间传递日志
 */
const EventEmitter = require('events');

class LogEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    // 保留最近 100 条日志
    this.logs = [];
    this.maxLogs = 100;
  }

  /**
   * 添加日志
   * @param {object} log - { level, type, message, data }
   */
  addLog(log) {
    const entry = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      timestamp: new Date().toISOString(),
      level: log.level || 'info',    // info, success, warning, error
      type: log.type || 'system',     // mail, notification, system, connection
      message: log.message,
      data: log.data || null,
    };

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    this.emit('log', entry);
    return entry;
  }

  /**
   * 获取最近日志
   */
  getRecent(count = 50) {
    return this.logs.slice(0, count);
  }
}

// 单例
const logEmitter = new LogEmitter();

module.exports = logEmitter;
