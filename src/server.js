const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs-extra');
const http = require('http');

// 导入配置
const config = require('./config');

// 导入中间件
const workerRouteHandler = require('./middleware/workerRouteHandler');

// 导入路由
const apiRoutes = require('./routes/api');

// 导入服务
const socketService = require('./services/socketService');
const workerService = require('./services/workerService');

// 创建 Express 应用
const app = express();
const server = http.createServer(app);

// 初始化 Socket.IO
socketService.init(server);

// 确保 workers 目录存在
fs.ensureDirSync(config.paths.workersDir);

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(morgan('dev'));
app.use(express.static(config.paths.publicDir));

// API 路由
app.use('/api', apiRoutes);

// Worker 路由处理中间件
app.use(workerRouteHandler);

// 前端路由处理 - 确保这个路由在所有 API 路由和 Worker 路由之后
app.get('*', (req, res) => {
  // 如果请求不是 API 请求，则检查是否是前端路由
  if (!req.path.startsWith('/api/')) {
    const reqPath = req.path.substring(1);
    
    // 如果路径看起来像是尝试访问 Worker 或 API，则返回 404
    if (reqPath && (reqPath.includes('/') || /^[a-zA-Z0-9_-]+$/.test(reqPath))) {
      // 检查是否是前端应用的已知路由
      const frontendRoutes = ['', 'dashboard', 'workers', 'logs', 'settings', 'help'];
      if (!frontendRoutes.includes(reqPath)) {
        return res.status(404).json({
          error: '路由不存在',
          message: `未找到路由 "${reqPath}"`
        });
      }
    }
    
    return res.sendFile(path.join(config.paths.publicDir, 'index.html'));
  }
  res.status(404).json({ error: '未找到' });
});

// 启动服务器
const PORT = config.server.port;
server.listen(PORT, config.server.host, async () => {
  console.log(`服务器运行在 http://${config.server.host}:${PORT}`);
  console.log(`工作目录: ${process.cwd()}`);
  console.log(`Workers 目录: ${config.paths.workersDir}`);
  console.log(`公共目录: ${config.paths.publicDir}`);
  
  // 自动启动之前运行的 Worker
  try {
    // 读取自动启动配置文件
    const autoStartPath = path.join(config.paths.workersDir, 'autostart.json');
    let autoStartConfig = { workerIds: [] };
    
    if (fs.existsSync(autoStartPath)) {
      try {
        // 尝试读取并解析JSON文件
        const fileContent = fs.readFileSync(autoStartPath, 'utf8');
        // 检查文件是否为空或内容无效
        if (fileContent && fileContent.trim()) {
          autoStartConfig = JSON.parse(fileContent);
        } else {
          // 如果文件为空，创建默认配置
          fs.writeJsonSync(autoStartPath, autoStartConfig);
          console.log('自动启动配置文件为空，已创建默认配置');
        }
      } catch (parseError) {
        // 如果解析失败，创建默认配置
        fs.writeJsonSync(autoStartPath, autoStartConfig);
        console.log('自动启动配置文件格式错误，已重置为默认配置');
      }
    } else {
      // 创建初始的自动启动配置文件
      fs.writeJsonSync(autoStartPath, autoStartConfig);
      console.log('已创建新的自动启动配置文件');
    }
    
    const workerIds = autoStartConfig.workerIds || [];
    
    if (workerIds.length > 0) {
      console.log(`正在自动启动 ${workerIds.length} 个 Worker...`);
      
      for (const id of workerIds) {
        try {
          await workerService.startWorker(id);
          console.log(`Worker ${id} 已自动启动`);
        } catch (error) {
          console.error(`自动启动 Worker ${id} 失败:`, error.message);
        }
      }
    }
  } catch (error) {
    console.error('自动启动 Worker 失败:', error);
  }
});

// 处理进程终止信号
process.on('SIGINT', async () => {
  console.log('正在关闭服务器...');
  
  try {
    // 保存当前运行的 Worker 列表到自动启动配置
    const runningWorkers = Array.from(require('./models/Worker').getRunningWorkers().keys());
    const autoStartPath = path.join(config.paths.workersDir, 'autostart.json');
    
    fs.writeJsonSync(autoStartPath, {
      workerIds: runningWorkers,
      lastShutdown: new Date().toISOString()
    });
    
    console.log(`已保存 ${runningWorkers.length} 个运行中的 Worker 到自动启动配置`);
    
    // 关闭所有运行中的 Worker
    await workerService.shutdownAllWorkers();
    
    // 关闭 Socket.IO 连接
    const io = socketService.getIo();
    if (io) {
      console.log('正在关闭 Socket.IO 连接...');
      io.close();
    }
    
    // 设置关闭超时，防止卡住
    const forceExit = setTimeout(() => {
      console.log('服务器关闭超时，强制退出');
      process.exit(1);
    }, 5000);
    
    // 确保超时器不会阻止进程退出
    forceExit.unref();
    
    server.close(() => {
      console.log('服务器已关闭');
      clearTimeout(forceExit);
      process.exit(0);
    });
  } catch (error) {
    console.error('关闭服务器时出错:', error);
    process.exit(1);
  }
});

module.exports = server; 