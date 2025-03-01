const socketIo = require('socket.io');
const logger = require('../utils/logger');

let io;

/**
 * 初始化 Socket.IO 服务
 * @param {Object} server HTTP 服务器实例
 */
function init(server) {
  io = socketIo(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });
  
  io.on('connection', (socket) => {
    console.log('客户端已连接:', socket.id);
    
    // 监听订阅日志事件
    socket.on('subscribe-logs', (workerId) => {
      if (workerId) {
        console.log(`客户端 ${socket.id} 订阅了 Worker ${workerId} 的日志`);
        socket.join(`logs:${workerId}`);
      }
    });
    
    // 监听取消订阅日志事件
    socket.on('unsubscribe-logs', (workerId) => {
      if (workerId) {
        console.log(`客户端 ${socket.id} 取消订阅了 Worker ${workerId} 的日志`);
        socket.leave(`logs:${workerId}`);
      }
    });
    
    // 监听断开连接事件
    socket.on('disconnect', () => {
      console.log('客户端已断开连接:', socket.id);
    });
  });
  
  // 设置日志更新监听器
  logger.on('log-update', (workerId, logs) => {
    io.to(`logs:${workerId}`).emit('logs-updated', { workerId, logs });
  });
  
  return io;
}

/**
 * 获取 Socket.IO 实例
 * @returns {Object} Socket.IO 实例
 */
function getIo() {
  if (!io) {
    throw new Error('Socket.IO 尚未初始化');
  }
  return io;
}

/**
 * 向所有客户端广播 Worker 状态更新
 * @param {Array} workers Worker 数组
 */
function broadcastWorkerStatus(workers) {
  if (io) {
    io.emit('workers-updated', workers);
  }
}

module.exports = {
  init,
  getIo,
  broadcastWorkerStatus
}; 