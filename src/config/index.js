const path = require('path');

module.exports = {
  // 服务器配置
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0'
  },
  
  // 路径配置
  paths: {
    workersDir: path.join(__dirname, '../../workers'),
    publicDir: path.join(__dirname, '../../public')
  },
  
  // VM 配置
  vm: {
    timeout: 1000, // 毫秒
    allowAsync: true
  },
  
  // 日志配置
  logging: {
    maxLogsPerWorker: 1000 // 每个 worker 最多保存的日志条数
  }
}; 