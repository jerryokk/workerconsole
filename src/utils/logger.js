const EventEmitter = require('events');
const config = require('../config');

// 创建事件发射器
class LoggerEmitter extends EventEmitter {}
const loggerEmitter = new LoggerEmitter();

// 存储日志的 Map
const logsMap = new Map();

/**
 * 添加日志
 * @param {string} workerId Worker ID
 * @param {string} level 日志级别 (info, warn, error)
 * @param {string} message 日志消息
 */
function addLog(workerId, level, message) {
  if (!logsMap.has(workerId)) {
    logsMap.set(workerId, []);
  }
  
  const logs = logsMap.get(workerId);
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message
  };
  
  logs.push(logEntry);
  
  // 限制日志数量
  if (logs.length > config.logging.maxLogsPerWorker) {
    logs.shift();
  }
  
  // 发出日志更新事件
  loggerEmitter.emit('log-update', workerId, logs);
}

/**
 * 获取日志
 * @param {string} workerId Worker ID
 * @returns {Array} 日志数组
 */
function getLogs(workerId) {
  return logsMap.get(workerId) || [];
}

/**
 * 清除日志
 * @param {string} workerId Worker ID
 */
function clearLogs(workerId) {
  if (logsMap.has(workerId)) {
    logsMap.set(workerId, []);
    loggerEmitter.emit('log-update', workerId, []);
  }
}

/**
 * 删除日志
 * @param {string} workerId Worker ID
 */
function deleteLogs(workerId) {
  if (logsMap.has(workerId)) {
    logsMap.delete(workerId);
  }
}

// 添加事件监听器方法
function on(event, listener) {
  return loggerEmitter.on(event, listener);
}

module.exports = {
  addLog,
  getLogs,
  clearLogs,
  deleteLogs,
  on
}; 