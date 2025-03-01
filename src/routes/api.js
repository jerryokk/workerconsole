const express = require('express');
const router = express.Router();
const workerController = require('../controllers/workerController');

// Worker 路由
router.get('/workers', workerController.getAllWorkers);
router.get('/workers/:id', workerController.getWorker);
router.post('/workers', workerController.createWorker);
router.put('/workers/:id', workerController.updateWorker);
router.delete('/workers/:id', workerController.deleteWorker);

// Worker 操作路由
router.post('/workers/:id/start', workerController.startWorker);
router.post('/workers/:id/stop', workerController.stopWorker);
router.post('/workers/restart-all', workerController.restartAllWorkers);

// Worker 代码路由
router.get('/workers/:id/code', workerController.getWorkerCode);
router.put('/workers/:id/code', workerController.updateWorkerCode);

// Worker 日志路由
router.get('/workers/:id/logs', workerController.getWorkerLogs);
router.delete('/workers/:id/logs', workerController.clearWorkerLogs);

module.exports = router; 