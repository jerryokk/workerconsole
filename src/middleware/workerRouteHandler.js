const Worker = require('../models/Worker');
const workerService = require('../services/workerService');
const logger = require('../utils/logger');

/**
 * Worker 路由处理中间件
 * 检查请求路径是否匹配任何运行中的 Worker 路由
 * 如果匹配，则将请求转发给相应的 Worker 处理
 * 如果路径看起来像 Worker 路由但不存在或未运行，则返回 404
 */
async function workerRouteHandler(req, res, next) {
  try {
    // 获取请求路径（去除前导斜杠）
    const reqPath = req.path.substring(1);
    
    // 如果路径为空或是 API 路径，则跳过
    if (!reqPath || reqPath.startsWith('api/')) {
      return next();
    }
    
    // 获取所有 Worker
    const workers = await Worker.getAll();
    const runningWorkers = Worker.getRunningWorkers();
    
    // 首先尝试查找精确匹配的 Worker
    for (const worker of workers) {
      // 检查 Worker 是否正在运行且路由精确匹配
      if (runningWorkers.has(worker.id) && worker.route === reqPath) {
        logger.addLog(worker.id, 'info', `收到精确匹配请求: ${req.method} ${req.url}`);
        return workerService.handleWorkerRequest(worker.id, req, res);
      }
    }
    
    // 如果没有精确匹配，尝试查找前缀匹配的 Worker
    // 按路由长度降序排序，以便优先匹配最长的路由
    const sortedWorkers = [...workers].sort((a, b) => b.route.length - a.route.length);
    
    for (const worker of sortedWorkers) {
      // 检查 Worker 是否正在运行且请求路径以 Worker 路由开头
      // 确保路由后面是斜杠或结束，避免部分匹配（如 'test1' 匹配 'test'）
      const workerRoute = worker.route;
      const isPrefix = reqPath === workerRoute || 
                       reqPath.startsWith(workerRoute + '/');
      
      if (runningWorkers.has(worker.id) && isPrefix) {
        logger.addLog(worker.id, 'info', `收到前缀匹配请求: ${req.method} ${req.url} (匹配路由: ${workerRoute})`);
        return workerService.handleWorkerRequest(worker.id, req, res);
      }
      
      // 如果路由匹配但 Worker 未运行，返回 404
      if (isPrefix && !runningWorkers.has(worker.id)) {
        return res.status(404).json({
          error: 'Worker 未运行',
          message: `路由 "${workerRoute}" 对应的 Worker 存在但未运行`
        });
      }
    }
    
    // 检查是否有任何 Worker 的路由前缀匹配
    // 这有助于识别可能是尝试访问 Worker 但路径不完全匹配的情况
    const potentialWorkerRoute = workers.some(worker => 
      reqPath.startsWith(worker.route) || worker.route.startsWith(reqPath)
    );
    
    if (potentialWorkerRoute) {
      return res.status(404).json({
        error: 'Worker 路由不存在',
        message: `没有找到匹配路由 "${reqPath}" 的运行中 Worker`
      });
    }
    
    // 如果没有匹配的 Worker，则继续下一个中间件
    next();
  } catch (error) {
    console.error('Worker 路由处理错误:', error);
    res.status(500).json({
      error: 'Worker 路由处理错误',
      message: error.message
    });
  }
}

module.exports = workerRouteHandler; 