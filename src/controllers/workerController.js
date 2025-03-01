const Worker = require('../models/Worker');
const workerService = require('../services/workerService');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const config = require('../config');

/**
 * 获取所有 Worker
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 */
async function getAllWorkers(req, res) {
  try {
    const workers = await Worker.getAll();
    res.json(workers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * 获取单个 Worker
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 */
async function getWorker(req, res) {
  try {
    const { id } = req.params;
    const worker = await Worker.getById(id);
    res.json(worker);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
}

/**
 * 创建 Worker
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 */
async function createWorker(req, res) {
  try {
    const worker = await Worker.create(req.body);
    res.status(201).json(worker);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * 更新 Worker
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 */
async function updateWorker(req, res) {
  try {
    const { id } = req.params;
    const worker = await Worker.update(id, req.body);
    res.json(worker);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * 删除 Worker
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 */
async function deleteWorker(req, res) {
  try {
    const { id } = req.params;
    
    // 如果 Worker 正在运行，先停止它
    const runningWorkers = Worker.getRunningWorkers();
    if (runningWorkers.has(id)) {
      await workerService.stopWorker(id);
    }
    
    await Worker.delete(id);
    res.status(204).end();
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
}

/**
 * 启动 Worker
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 */
async function startWorker(req, res) {
  try {
    const { id } = req.params;
    const worker = await workerService.startWorker(id);
    res.json(worker);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * 停止 Worker
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 */
async function stopWorker(req, res) {
  try {
    const { id } = req.params;
    const worker = await workerService.stopWorker(id);
    res.json(worker);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * 获取 Worker 日志
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 */
async function getWorkerLogs(req, res) {
  try {
    const { id } = req.params;
    const logs = logger.getLogs(id);
    res.json(logs);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
}

/**
 * 清除 Worker 日志
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 */
async function clearWorkerLogs(req, res) {
  try {
    const { id } = req.params;
    logger.clearLogs(id);
    res.status(204).end();
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
}

/**
 * 重启所有 Worker
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 */
async function restartAllWorkers(req, res) {
  try {
    const count = await workerService.restartAllWorkers();
    res.json({ message: `已重启 ${count} 个 Worker` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * 获取 Worker 代码
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 */
async function getWorkerCode(req, res) {
  try {
    const { id } = req.params;
    const worker = await Worker.getById(id);
    
    // 直接从 worker 目录下的 worker.js 文件读取代码
    const workerJsPath = path.join(config.paths.workersDir, id, 'worker.js');
    
    // 检查文件是否存在
    if (!fs.existsSync(workerJsPath)) {
      // 如果文件不存在，创建一个默认的代码模板
      const defaultCode = `// Worker: ${worker.name}
// 路由: /${worker.route}
// 创建时间: ${new Date(worker.createdAt).toLocaleString('zh-CN')}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

/**
 * 处理请求
 * @param {Request} request
 */
async function handleRequest(request) {
  return new Response('Hello World!', {
    headers: { 'content-type': 'text/plain' },
  })
}
`;
      fs.writeFileSync(workerJsPath, defaultCode, 'utf8');
    }
    
    const code = fs.readFileSync(workerJsPath, 'utf8');
    res.type('text/javascript').send(code);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
}

/**
 * 更新 Worker 代码
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 */
async function updateWorkerCode(req, res) {
  try {
    const { id } = req.params;
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: '代码不能为空' });
    }
    
    // 获取 Worker 信息以确认它存在
    await Worker.getById(id);
    
    // 只更新 worker 目录下的 worker.js 文件
    const workerDir = path.join(config.paths.workersDir, id);
    const workerJsPath = path.join(workerDir, 'worker.js');
    fs.writeFileSync(workerJsPath, code, 'utf8');
    
    // 更新 Worker 的更新时间
    await Worker.update(id, { updatedAt: new Date() });
    
    res.status(200).json({ message: '代码已更新' });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
}

module.exports = {
  getAllWorkers,
  getWorker,
  createWorker,
  updateWorker,
  deleteWorker,
  startWorker,
  stopWorker,
  getWorkerLogs,
  clearWorkerLogs,
  restartAllWorkers,
  getWorkerCode,
  updateWorkerCode
}; 