const { VM } = require('vm2');
const path = require('path');
const fs = require('fs-extra');
const Worker = require('../models/Worker');
const logger = require('../utils/logger');
const config = require('../config');
const util = require('util');
const crypto = require('crypto');

/**
 * 更新自动启动配置
 * @private
 */
async function updateAutoStartConfig() {
  try {
    const runningWorkers = Array.from(Worker.getRunningWorkers().keys());
    const autoStartPath = path.join(config.paths.workersDir, 'autostart.json');
    
    // 确保目录存在
    fs.ensureDirSync(path.dirname(autoStartPath));
    
    // 读取现有配置或创建新配置
    let autoStartConfig = { workerIds: [] };
    
    if (fs.existsSync(autoStartPath)) {
      try {
        // 尝试读取并解析JSON文件
        const fileContent = fs.readFileSync(autoStartPath, 'utf8');
        // 检查文件是否为空或内容无效
        if (fileContent && fileContent.trim()) {
          autoStartConfig = JSON.parse(fileContent);
        }
      } catch (parseError) {
        console.log('自动启动配置文件格式错误，将使用默认配置');
      }
    }
    
    // 更新配置
    autoStartConfig.workerIds = runningWorkers;
    autoStartConfig.lastUpdate = new Date().toISOString();
    
    // 保存配置
    fs.writeJsonSync(autoStartPath, autoStartConfig);
  } catch (error) {
    console.error('更新自动启动配置失败:', error);
  }
}

/**
 * 启动 Worker
 * @param {string} id Worker ID
 * @returns {Object} 启动的 Worker 信息
 */
async function startWorker(id) {
  try {
    const worker = await Worker.getById(id);
    const runningWorkers = Worker.getRunningWorkers();
    
    if (runningWorkers.has(id)) {
      throw new Error('Worker 已经在运行中');
    }
    
    let code = fs.readFileSync(path.join(config.paths.workersDir, id, 'worker.js'), 'utf-8');
    
    // 转换 ES 模块语法为 CommonJS 语法
    if (code.includes('export default')) {
      // 替换 export default {...} 为 module.exports = {...}
      code = code.replace(/export\s+default\s+/, 'module.exports = ');
    }
    
    // 创建 VM 实例
    const vm = new VM({
      timeout: config.vm.timeout,
      sandbox: {
        module: { exports: {} },
        URL: URL,
        TextEncoder: util.TextEncoder,
        TextDecoder: util.TextDecoder,
        Uint8Array: Uint8Array,
        Uint16Array: Uint16Array,
        Uint32Array: Uint32Array,
        Int8Array: Int8Array,
        Int16Array: Int16Array,
        Int32Array: Int32Array,
        Float32Array: Float32Array,
        Float64Array: Float64Array,
        ArrayBuffer: ArrayBuffer,
        DataView: DataView,
        crypto: {
          subtle: {
            digest: async (algorithm, data) => {
              const hash = crypto.createHash(algorithm.replace('-', '').toLowerCase());
              hash.update(data);
              return hash.digest();
            },
            encrypt: async () => {
              throw new Error('crypto.subtle.encrypt 尚未实现');
            },
            decrypt: async () => {
              throw new Error('crypto.subtle.decrypt 尚未实现');
            },
            sign: async () => {
              throw new Error('crypto.subtle.sign 尚未实现');
            },
            verify: async () => {
              throw new Error('crypto.subtle.verify 尚未实现');
            }
          },
          getRandomValues: (buffer) => {
            if (buffer instanceof Uint8Array || buffer instanceof Uint16Array || 
                buffer instanceof Uint32Array || buffer instanceof Int8Array || 
                buffer instanceof Int16Array || buffer instanceof Int32Array) {
              const bytes = crypto.randomBytes(buffer.length * buffer.BYTES_PER_ELEMENT);
              for (let i = 0; i < buffer.length; i++) {
                buffer[i] = bytes.readUInt8(i) % Math.pow(2, 8 * buffer.BYTES_PER_ELEMENT);
              }
              return buffer;
            }
            throw new Error('getRandomValues 需要 TypedArray 参数');
          },
          randomUUID: () => {
            return crypto.randomUUID();
          }
        },
        globalThis: {
          WebSocketPair: function() {},
          TextEncoder: util.TextEncoder,
          TextDecoder: util.TextDecoder,
          Uint8Array: Uint8Array,
          Uint16Array: Uint16Array,
          Uint32Array: Uint32Array,
          Int8Array: Int8Array,
          Int16Array: Int16Array,
          Int32Array: Int32Array,
          Float32Array: Float32Array,
          Float64Array: Float64Array,
          ArrayBuffer: ArrayBuffer,
          DataView: DataView,
          crypto: {
            subtle: {
              digest: async (algorithm, data) => {
                const hash = crypto.createHash(algorithm.replace('-', '').toLowerCase());
                hash.update(data);
                return hash.digest();
              },
              encrypt: async () => {
                throw new Error('crypto.subtle.encrypt 尚未实现');
              },
              decrypt: async () => {
                throw new Error('crypto.subtle.decrypt 尚未实现');
              },
              sign: async () => {
                throw new Error('crypto.subtle.sign 尚未实现');
              },
              verify: async () => {
                throw new Error('crypto.subtle.verify 尚未实现');
              }
            },
            getRandomValues: (buffer) => {
              if (buffer instanceof Uint8Array || buffer instanceof Uint16Array || 
                  buffer instanceof Uint32Array || buffer instanceof Int8Array || 
                  buffer instanceof Int16Array || buffer instanceof Int32Array) {
                const bytes = crypto.randomBytes(buffer.length * buffer.BYTES_PER_ELEMENT);
                for (let i = 0; i < buffer.length; i++) {
                  buffer[i] = bytes.readUInt8(i) % Math.pow(2, 8 * buffer.BYTES_PER_ELEMENT);
                }
                return buffer;
              }
              throw new Error('getRandomValues 需要 TypedArray 参数');
            },
            randomUUID: () => {
              return crypto.randomUUID();
            }
          }
        },
        fetch: async (url, options = {}) => {
          logger.addLog(id, 'info', `外部请求: ${url}`);
          try {
            const nodeFetch = require('node-fetch');
            const response = await nodeFetch(url, options);
            logger.addLog(id, 'info', `外部响应: ${response.status}`);
            return response;
          } catch (error) {
            logger.addLog(id, 'error', `外部请求失败: ${error.message}`);
            throw error;
          }
        },
        addEventListener: (event, callback) => {
          if (event === 'fetch') {
            vm.fetchHandler = callback;
          }
        },
        Response: class Response {
          constructor(body, init = {}) {
            this.body = body;
            this.status = init.status || 200;
            this.statusText = init.statusText || '';
            this.headers = new Headers(init.headers || {});
          }
          
          async text() {
            if (typeof this.body === 'string') {
              return this.body;
            } else if (this.body instanceof Buffer) {
              return this.body.toString('utf8');
            } else if (typeof this.body.pipe === 'function') {
              // 处理流
              const chunks = [];
              for await (const chunk of this.body) {
                chunks.push(chunk);
              }
              return Buffer.concat(chunks).toString('utf8');
            } else {
              return String(this.body);
            }
          }
          
          async json() {
            const text = await this.text();
            return JSON.parse(text);
          }
        },
        Headers: class Headers {
          constructor(init = {}) {
            this._headers = {};
            if (init) {
              Object.keys(init).forEach(key => {
                this._headers[key.toLowerCase()] = init[key];
              });
            }
          }
          
          get(name) {
            return this._headers[name.toLowerCase()];
          }
          
          set(name, value) {
            this._headers[name.toLowerCase()] = value;
          }
          
          has(name) {
            return this._headers.hasOwnProperty(name.toLowerCase());
          }
          
          delete(name) {
            delete this._headers[name.toLowerCase()];
          }
          
          entries() {
            return Object.entries(this._headers);
          }
        },
        Request: class Request {
          constructor(input, init = {}) {
            if (typeof input === 'string') {
              this.url = input;
            } else if (input instanceof Request) {
              this.url = input.url;
              this.method = input.method;
              this.headers = input.headers;
              this.body = input.body;
            }
            
            this.method = init.method || this.method || 'GET';
            this.headers = new Headers(init.headers || this.headers || {});
            this.body = init.body || this.body || null;
          }
        },
        console: {
          log: (...args) => {
            logger.addLog(id, 'info', args.join(' '));
          },
          error: (...args) => {
            logger.addLog(id, 'error', args.join(' '));
          },
          warn: (...args) => {
            logger.addLog(id, 'warn', args.join(' '));
          },
          info: (...args) => {
            logger.addLog(id, 'info', args.join(' '));
          }
        }
      },
      allowAsync: config.vm.allowAsync
    });
    
    // 运行 Worker 代码
    vm.run(code);
    
    // 获取导出的对象
    const exportedModule = vm.sandbox.module.exports;
    
    // 如果导出的对象有 fetch 方法，使用它作为 fetchHandler
    if (exportedModule && typeof exportedModule.fetch === 'function') {
      vm.fetchHandler = (event) => exportedModule.fetch(event.request);
    }
    
    if (!vm.fetchHandler) {
      throw new Error('Worker 必须包含 fetch 事件监听器或导出包含 fetch 方法的对象');
    }
    
    // 存储 VM 实例
    runningWorkers.set(id, {
      vm,
      config: worker,
      startTime: new Date()
    });
    
    logger.addLog(id, 'info', `Worker "${worker.name}" 已启动`);
    
    // 更新自动启动配置
    await updateAutoStartConfig();
    
    return {
      id,
      ...worker,
      status: 'running'
    };
  } catch (error) {
    logger.addLog(id, 'error', `启动失败: ${error.message}`);
    throw new Error(`启动 Worker 失败: ${error.message}`);
  }
}

/**
 * 停止 Worker
 * @param {string} id Worker ID
 * @returns {Object} 停止的 Worker 信息
 */
async function stopWorker(id) {
  try {
    const worker = await Worker.getById(id);
    const runningWorkers = Worker.getRunningWorkers();
    
    if (!runningWorkers.has(id)) {
      throw new Error('Worker 未运行');
    }
    
    runningWorkers.delete(id);
    logger.addLog(id, 'info', `Worker "${worker.name}" 已停止`);
    
    // 更新自动启动配置
    await updateAutoStartConfig();
    
    return {
      id,
      ...worker,
      status: 'stopped'
    };
  } catch (error) {
    logger.addLog(id, 'error', `停止失败: ${error.message}`);
    throw new Error(`停止 Worker 失败: ${error.message}`);
  }
}

/**
 * 处理 Worker 请求
 * @param {string} id Worker ID
 * @param {Object} req Express 请求对象
 * @param {Object} res Express 响应对象
 */
async function handleWorkerRequest(id, req, res) {
  try {
    const runningWorkers = Worker.getRunningWorkers();
    
    if (!runningWorkers.has(id)) {
      throw new Error('Worker 未运行');
    }
    
    const { vm } = runningWorkers.get(id);
    
    // 获取 Worker 配置
    const workerConfig = await Worker.getById(id);
    
    // 构建正确的 URL
    // 从原始 URL 中移除 Worker 的路由前缀（只移除第一级路径）
    const originalUrl = req.originalUrl || req.url;
    const workerRoute = `/${workerConfig.route}`;
    
    // 简化日志，只记录关键信息
    logger.addLog(id, 'info', `收到请求: ${req.method} ${originalUrl}`);
    
    // 构建新的 URL，只移除第一级路径作为 Worker 路由前缀
    let workerUrl = originalUrl;
    
    // 检查 URL 是否以 Worker 路由开头
    if (originalUrl.startsWith(workerRoute + '/')) {
      // 保留 Worker 路由后的所有路径
      workerUrl = originalUrl.substring(workerRoute.length);
    } else if (originalUrl === workerRoute) {
      // 如果 URL 正好等于 Worker 路由，则设置为根路径
      workerUrl = '/';
    }
    
    // 确保 URL 以 / 开头
    if (!workerUrl.startsWith('/')) {
      workerUrl = '/' + workerUrl;
    }
    
    // 构建完整的 URL
    let fullUrl;
    
    // 检查请求中的 URL 是否是外部 URL
    if (req.headers['x-forwarded-url']) {
      // 如果有转发的 URL，直接使用
      fullUrl = req.headers['x-forwarded-url'] + workerUrl.substring(1);
    } else {
      // 从 host 中提取域名（不包含端口）
      const host = req.get('host').split(':')[0];
      fullUrl = `${req.protocol}://${host}${workerUrl}`;
    }
    
    // 创建请求对象
    const requestOptions = {
      method: req.method,
      headers: req.headers
    };
    
    // 只在非 GET/HEAD 请求时添加请求体
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      requestOptions.body = req.body;
    }
    
    const request = new vm.sandbox.Request(fullUrl, requestOptions);
    
    // 获取导出的模块
    const exportedModule = vm.sandbox.module.exports;
    
    // 处理响应
    let responsePromise;
    
    try {
      if (exportedModule && typeof exportedModule.fetch === 'function') {
        // 使用导出的 fetch 方法
        responsePromise = exportedModule.fetch(request);
      } else if (vm.fetchHandler) {
        // 使用事件监听器
        const event = {
          respondWith: async (respPromise) => {
            responsePromise = respPromise;
          },
          request
        };
        
        await vm.fetchHandler(event);
      } else {
        throw new Error('Worker 没有可用的请求处理程序');
      }
      
      // 处理响应
      try {
        const workerResponse = await responsePromise;
        
        // 设置状态码和头信息
        res.status(workerResponse.status);
        
        if (workerResponse.headers) {
          const headers = workerResponse.headers.entries();
          for (const [key, value] of headers) {
            res.set(key, value);
          }
        }
        
        // 处理响应体
        if (workerResponse.body) {
          // 检查响应体类型
          if (typeof workerResponse.body === 'string') {
            // 检查是否是 HTML
            if (workerResponse.body.trim().startsWith('<!DOCTYPE html>') || 
                workerResponse.body.trim().startsWith('<html>')) {
              // 如果是 HTML，设置 Content-Type 为 text/html
              res.set('Content-Type', 'text/html');
              res.send(workerResponse.body);
            } else {
              // 检查是否是 JSON 字符串
              try {
                const jsonObj = JSON.parse(workerResponse.body);
                // 如果能解析为 JSON，设置 Content-Type 为 application/json
                res.set('Content-Type', 'application/json');
                res.send(workerResponse.body);
              } catch (e) {
                // 不是 JSON，按普通文本处理
                res.set('Content-Type', 'text/plain');
                res.send(workerResponse.body);
              }
            }
          } else if (workerResponse.body instanceof Buffer) {
            // 尝试将 Buffer 转换为字符串
            const text = workerResponse.body.toString('utf8');
            
            // 检查是否是 HTML
            if (text.trim().startsWith('<!DOCTYPE html>') || 
                text.trim().startsWith('<html>')) {
              // 如果是 HTML，设置 Content-Type 为 text/html
              res.set('Content-Type', 'text/html');
              res.send(text);
            } else {
              // 检查是否是 JSON
              try {
                const jsonObj = JSON.parse(text);
                // 如果能解析为 JSON，设置 Content-Type 为 application/json
                res.set('Content-Type', 'application/json');
                res.send(text);
              } catch (e) {
                // 不是 JSON，按普通文本处理
                res.send(workerResponse.body);
              }
            }
          } else if (typeof workerResponse.body.pipe === 'function') {
            // 如果是流，先转换为字符串或 Buffer
            try {
              // 收集流数据
              const chunks = [];
              for await (const chunk of workerResponse.body) {
                chunks.push(chunk);
              }
              const buffer = Buffer.concat(chunks);
              
              // 尝试将 Buffer 转换为字符串
              const text = buffer.toString('utf8');
              
              // 检查是否是 HTML
              if (text.trim().startsWith('<!DOCTYPE html>') || 
                  text.trim().startsWith('<html>')) {
                // 如果是 HTML，设置 Content-Type 为 text/html
                res.set('Content-Type', 'text/html');
                res.send(text);
              } else {
                // 检查是否是 JSON
                try {
                  const jsonObj = JSON.parse(text);
                  // 如果能解析为 JSON，设置 Content-Type 为 application/json
                  res.set('Content-Type', 'application/json');
                  res.send(text);
                } catch (jsonError) {
                  // 不是 JSON，按普通文本处理
                  res.set('Content-Type', 'text/plain');
                  res.send(text);
                }
              }
            } catch (streamError) {
              logger.addLog(id, 'error', `处理响应流失败: ${streamError.message}`);
              res.status(500).send('处理响应流失败: ' + streamError.message);
            }
          } else {
            // 其他类型，尝试 JSON 序列化
            try {
              res.set('Content-Type', 'application/json');
              res.json(workerResponse.body);
            } catch (jsonError) {
              // 如果 JSON 序列化失败，转换为字符串
              res.set('Content-Type', 'text/plain');
              res.send(String(workerResponse.body));
            }
          }
        } else {
          // 如果没有响应体，发送空响应
          res.end();
        }
        
        logger.addLog(id, 'info', `请求 ${req.method} ${originalUrl} 完成 [${workerResponse.status}]`);
      } catch (error) {
        logger.addLog(id, 'error', `处理响应失败: ${error.message}`);
        res.status(500).send('Worker 执行错误: ' + error.message);
      }
    } catch (error) {
      logger.addLog(id, 'error', `调用 Worker 处理程序失败: ${error.message}`);
      res.status(500).send('Worker 执行错误: ' + error.message);
    }
  } catch (error) {
    logger.addLog(id, 'error', `处理请求失败: ${error.message}`);
    res.status(500).send(`Worker 执行错误: ${error.message}`);
  }
}

/**
 * 重启所有 Worker
 */
async function restartAllWorkers() {
  try {
    const workers = await Worker.getAll();
    const runningWorkers = Worker.getRunningWorkers();
    
    // 获取当前运行的 worker IDs
    const runningIds = Array.from(runningWorkers.keys());
    
    // 停止所有运行中的 workers
    for (const id of runningIds) {
      await stopWorker(id);
    }
    
    // 重新启动之前运行的 workers
    for (const id of runningIds) {
      await startWorker(id);
    }
    
    return runningIds.length;
  } catch (error) {
    throw new Error(`重启 Workers 失败: ${error.message}`);
  }
}

/**
 * 关闭所有 Worker
 * 在服务器关闭时调用，确保所有 Worker 正确停止
 */
async function shutdownAllWorkers() {
  try {
    const runningWorkers = Worker.getRunningWorkers();
    const runningIds = Array.from(runningWorkers.keys());
    
    console.log(`正在关闭 ${runningIds.length} 个运行中的 Worker...`);
    
    // 停止所有运行中的 workers
    for (const id of runningIds) {
      try {
        // 直接删除 Worker 实例，不更新自动启动配置
        runningWorkers.delete(id);
        console.log(`Worker ${id} 已关闭`);
      } catch (error) {
        console.error(`关闭 Worker ${id} 失败:`, error.message);
      }
    }
    
    return runningIds.length;
  } catch (error) {
    console.error(`关闭所有 Workers 失败:`, error);
    return 0;
  }
}

module.exports = {
  startWorker,
  stopWorker,
  handleWorkerRequest,
  restartAllWorkers,
  shutdownAllWorkers
};