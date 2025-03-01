const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

// 存储运行中的 worker 实例
const runningWorkers = new Map();

class Worker {
  /**
   * 获取所有 Worker
   * @returns {Array} Worker 数组
   */
  static async getAll() {
    try {
      const workers = [];
      const workerDirs = fs.readdirSync(config.paths.workersDir);
      
      for (const dir of workerDirs) {
        const configPath = path.join(config.paths.workersDir, dir, 'config.json');
        if (fs.existsSync(configPath)) {
          const workerConfig = fs.readJsonSync(configPath);
          workers.push({
            id: dir,
            ...workerConfig,
            status: runningWorkers.has(dir) ? 'running' : 'stopped'
          });
        }
      }
      
      return workers;
    } catch (error) {
      throw new Error(`获取 Workers 失败: ${error.message}`);
    }
  }
  
  /**
   * 获取单个 Worker
   * @param {string} id Worker ID
   * @returns {Object} Worker 对象
   */
  static async getById(id) {
    try {
      const configPath = path.join(config.paths.workersDir, id, 'config.json');
      
      if (!fs.existsSync(configPath)) {
        throw new Error('Worker 不存在');
      }
      
      const workerConfig = fs.readJsonSync(configPath);
      const code = fs.readFileSync(path.join(config.paths.workersDir, id, 'worker.js'), 'utf-8');
      
      return {
        id,
        ...workerConfig,
        code,
        status: runningWorkers.has(id) ? 'running' : 'stopped'
      };
    } catch (error) {
      throw new Error(`获取 Worker 失败: ${error.message}`);
    }
  }
  
  /**
   * 创建新 Worker
   * @param {Object} data Worker 数据
   * @returns {Object} 创建的 Worker
   */
  static async create(data) {
    try {
      const { name, route, description } = data;
      
      if (!name || !route) {
        throw new Error('名称和路由是必需的');
      }
      
      // 检查路由是否已存在
      const workers = await Worker.getAll();
      const routeExists = workers.some(worker => worker.route === route);
      
      if (routeExists) {
        throw new Error('路由已存在');
      }
      
      const id = uuidv4();
      const workerDir = path.join(config.paths.workersDir, id);
      fs.ensureDirSync(workerDir);
      
      // 创建默认的 worker 代码
      const defaultCode = `addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  return new Response('Hello World!', {
    headers: { 'content-type': 'text/plain' },
  });
}`;
      
      fs.writeFileSync(path.join(workerDir, 'worker.js'), defaultCode);
      
      // 创建配置文件
      const workerConfig = {
        name,
        route,
        description: description || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      fs.writeJsonSync(path.join(workerDir, 'config.json'), workerConfig);
      
      return { id, ...workerConfig };
    } catch (error) {
      throw new Error(`创建 Worker 失败: ${error.message}`);
    }
  }
  
  /**
   * 更新 Worker
   * @param {string} id Worker ID
   * @param {Object} data 更新数据
   * @returns {Object} 更新后的 Worker
   */
  static async update(id, data) {
    try {
      const { name, route, description, code } = data;
      
      const workerDir = path.join(config.paths.workersDir, id);
      const configPath = path.join(workerDir, 'config.json');
      
      if (!fs.existsSync(configPath)) {
        throw new Error('Worker 不存在');
      }
      
      // 检查路由是否已被其他 worker 使用
      if (route) {
        const workers = await Worker.getAll();
        const routeExists = workers.some(worker => worker.id !== id && worker.route === route);
        
        if (routeExists) {
          throw new Error('路由已被其他 worker 使用');
        }
      }
      
      const workerConfig = fs.readJsonSync(configPath);
      
      if (name) workerConfig.name = name;
      if (route) workerConfig.route = route;
      if (description !== undefined) workerConfig.description = description;
      workerConfig.updatedAt = new Date().toISOString();
      
      fs.writeJsonSync(configPath, workerConfig);
      
      if (code) {
        fs.writeFileSync(path.join(workerDir, 'worker.js'), code);
      }
      
      return {
        id,
        ...workerConfig,
        status: runningWorkers.has(id) ? 'running' : 'stopped'
      };
    } catch (error) {
      throw new Error(`更新 Worker 失败: ${error.message}`);
    }
  }
  
  /**
   * 删除 Worker
   * @param {string} id Worker ID
   */
  static async delete(id) {
    try {
      const workerDir = path.join(config.paths.workersDir, id);
      
      if (!fs.existsSync(workerDir)) {
        throw new Error('Worker 不存在');
      }
      
      // 删除 worker 目录
      fs.removeSync(workerDir);
      
      // 检查并删除根目录下可能存在的 .js 文件
      const rootJsFile = path.join(config.paths.workersDir, `${id}.js`);
      if (fs.existsSync(rootJsFile)) {
        fs.removeSync(rootJsFile);
      }
    } catch (error) {
      throw new Error(`删除 Worker 失败: ${error.message}`);
    }
  }
  
  /**
   * 获取运行中的 Worker 实例
   * @returns {Map} 运行中的 Worker 实例
   */
  static getRunningWorkers() {
    return runningWorkers;
  }
}

module.exports = Worker; 