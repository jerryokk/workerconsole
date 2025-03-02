// 全局变量
let editor = null;
let currentWorkerId = null;
let socket = null;
let monacoReady = false;
let currentPage = 'workers'; // 添加当前页面状态变量

// DOM 元素
const workersListElement = document.getElementById('workers-list');
const workerDetailElement = document.getElementById('worker-detail');
const workersGridElement = document.getElementById('workers-grid');
const createWorkerBtn = document.getElementById('create-worker-btn');
const backToListBtn = document.getElementById('back-to-list-btn');
const saveDeployBtn = document.getElementById('save-deploy-btn');
const previewWorkerBtn = document.getElementById('preview-worker-btn');
const deleteWorkerBtn = document.getElementById('delete-worker-btn');
const clearLogsBtn = document.getElementById('clear-logs-btn');
const workerNameElement = document.getElementById('worker-name');
const editNameInput = document.getElementById('edit-name');
const editRouteInput = document.getElementById('edit-route');
const editDescriptionInput = document.getElementById('edit-description');
const workerStatusElement = document.getElementById('worker-status');
const workerCreatedAtElement = document.getElementById('worker-created-at');
const workerUpdatedAtElement = document.getElementById('worker-updated-at');
const logsContainer = document.getElementById('logs-container');
const newWorkerNameInput = document.getElementById('new-worker-name');
const newWorkerRouteInput = document.getElementById('new-worker-route');
const newWorkerDescriptionInput = document.getElementById('new-worker-description');
const confirmCreateWorkerBtn = document.getElementById('confirm-create-worker-btn');
const deleteWorkerNameElement = document.getElementById('delete-worker-name');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const sidebarToggleBtn = document.getElementById('sidebar-toggle');
const sidebarOpenBtn = document.getElementById('sidebar-open-btn');
const sidebar = document.querySelector('.sidebar');
const pageTitle = document.getElementById('current-page-title');
const sidebarMenuItems = document.querySelectorAll('.sidebar-menu li a');

// 初始化 Monaco 编辑器
function initMonacoEditor() {
  // 检查 Monaco 是否已加载
  if (typeof monaco === 'undefined') {
    // 如果 Monaco 还没有加载完成，等待 100ms 后重试
    setTimeout(initMonacoEditor, 100);
    return;
  }
  
  // 创建编辑器
  editor = monaco.editor.create(document.getElementById('monaco-editor'), {
    value: '',
    language: 'javascript',
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: {
      enabled: true
    },
    scrollBeyondLastLine: false,
    fontSize: 14,
    fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
    lineNumbers: 'on',
    roundedSelection: true,
    renderIndentGuides: true,
    renderLineHighlight: 'all',
  });
  
  monacoReady = true;
  console.log('Monaco 编辑器初始化完成');
}

// 初始化 Socket.IO
function initSocketIO() {
  socket = io();
  
  socket.on('connect', () => {
    console.log('已连接到服务器');
    // 如果当前正在查看某个Worker，则订阅其日志
    if (currentWorkerId) {
      subscribeToWorkerLogs(currentWorkerId);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('与服务器断开连接');
  });
  
  socket.on('logs-updated', (data) => {
    if (data.workerId === currentWorkerId) {
      // 清空日志容器
      logsContainer.innerHTML = '';
      
      // 添加所有日志
      data.logs.forEach(log => {
        addLogToUI(log);
      });
      
      // 滚动到底部
      logsContainer.scrollTop = logsContainer.scrollHeight;
    }
  });
  
  socket.on('worker-status-change', (data) => {
    // 如果当前正在查看该 Worker，则更新状态
    if (data.id === currentWorkerId) {
      workerStatusElement.innerHTML = createStatusBadgeHTML(data.status);
      updateButtonStates(data.status);
      
      // 如果Worker状态变为运行，显示预览按钮
      if (data.status === 'running') {
        previewWorkerBtn.style.display = 'block';
      } else {
        previewWorkerBtn.style.display = 'none';
      }
    }
    
    // 更新列表中的状态
    updateWorkerStatusInList(data.id, data.status);
  });
}

// 订阅Worker日志
function subscribeToWorkerLogs(workerId) {
  if (socket && socket.connected) {
    console.log(`订阅 Worker ${workerId} 的日志`);
    socket.emit('subscribe-logs', workerId);
  }
}

// 取消订阅Worker日志
function unsubscribeFromWorkerLogs(workerId) {
  if (socket && socket.connected) {
    console.log(`取消订阅 Worker ${workerId} 的日志`);
    socket.emit('unsubscribe-logs', workerId);
  }
}

// 加载 Workers 列表
async function loadWorkersList() {
  try {
    const response = await fetch('/api/workers');
    const workers = await response.json();
    
    // 清空列表
    workersGridElement.innerHTML = '';
    
    if (workers.length === 0) {
      workersGridElement.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <i class="bi bi-cloud-slash"></i>
          </div>
          <h3>没有 Workers</h3>
          <p>点击"创建 Worker"按钮开始创建您的第一个 Worker</p>
        </div>
      `;
      return;
    }
    
    // 添加 Workers 到列表
    workers.forEach(worker => {
      // 生成简短描述（如果没有，则使用默认描述）
      const description = worker.description || `这是一个运行在路径 /${worker.route} 的 Worker，可以处理 HTTP 请求并返回响应。`;
      
      const workerCard = document.createElement('div');
      workerCard.className = 'worker-card';
      workerCard.dataset.id = worker.id;
      workerCard.innerHTML = `
        <div class="worker-card-header">
          <h3 class="worker-card-title">${worker.name}</h3>
          <div class="status-badge ${worker.status === 'running' ? 'status-running' : 'status-stopped'}">
            ${worker.status === 'running' ? '运行中' : '已停止'}
          </div>
        </div>
        <div class="worker-card-body">
          <div class="worker-card-info">
            <div class="worker-card-info-item">
              <div class="worker-card-info-label">路由:</div>
              <div class="worker-card-info-value">
                <a href="/${worker.route}" class="route-link" target="_blank">/${worker.route}</a>
              </div>
            </div>
            <div class="worker-card-info-item">
              <div class="worker-card-info-label">创建于:</div>
              <div class="worker-card-info-value">${formatDate(worker.createdAt)}</div>
            </div>
            <div class="worker-card-description">${description}</div>
          </div>
          <div class="worker-card-actions">
            ${worker.status === 'running' 
              ? `<button class="btn-icon btn-icon-warning stop-worker-btn" title="停止"><i class="bi bi-stop-fill"></i></button>` 
              : `<button class="btn-icon btn-icon-success start-worker-btn" title="启动"><i class="bi bi-play-fill"></i></button>`
            }
          </div>
        </div>
      `;
      
      // 添加点击事件，点击卡片查看详情
      workerCard.addEventListener('click', (e) => {
        // 如果点击的是按钮或路由链接，不触发卡片点击事件
        if (e.target.closest('button') || e.target.closest('.route-link')) {
          return;
        }
        viewWorker(worker.id);
      });
      
      // 添加启动/停止按钮事件
      const startBtn = workerCard.querySelector('.start-worker-btn');
      const stopBtn = workerCard.querySelector('.stop-worker-btn');
      
      if (startBtn) {
        startBtn.addEventListener('click', () => startWorker(worker.id));
      }
      
      if (stopBtn) {
        stopBtn.addEventListener('click', () => stopWorker(worker.id));
      }
      
      workersGridElement.appendChild(workerCard);
    });
  } catch (error) {
    console.error('加载 Workers 列表失败:', error);
    showToast('加载 Workers 列表失败', 'danger');
  }
}

// 查看 Worker 详情
async function viewWorker(id) {
  try {
    // 如果当前正在查看其他Worker，取消订阅其日志
    if (currentWorkerId && currentWorkerId !== id) {
      unsubscribeFromWorkerLogs(currentWorkerId);
    }
    
    // 更新当前Worker ID
    currentWorkerId = id;
    
    // 订阅新Worker的日志
    subscribeToWorkerLogs(currentWorkerId);
    
    // 获取 Worker 详情
    const response = await fetch(`/api/workers/${id}`);
    const worker = await response.json();
    
    // 更新 UI
    workerNameElement.textContent = worker.name;
    editNameInput.value = worker.name;
    editRouteInput.value = worker.route;
    editDescriptionInput.value = worker.description || '';
    workerStatusElement.innerHTML = createStatusBadgeHTML(worker.status);
    workerCreatedAtElement.textContent = formatDate(worker.createdAt);
    workerUpdatedAtElement.textContent = formatDate(worker.updatedAt);
    
    // 根据Worker状态显示或隐藏预览按钮
    if (worker.status === 'running') {
      previewWorkerBtn.style.display = 'block';
    } else {
      previewWorkerBtn.style.display = 'none';
    }
    
    // 确保 Monaco 编辑器已准备好
    if (!monacoReady) {
      console.log('等待 Monaco 编辑器初始化...');
      setTimeout(() => viewWorker(id), 500);
      return;
    }
    
    // 加载代码
    try {
      const codeResponse = await fetch(`/api/workers/${id}/code`);
      const code = await codeResponse.text();
      editor.setValue(code);
    } catch (error) {
      console.error('加载 Worker 代码失败:', error);
      editor.setValue('// 加载代码失败，请重试');
    }
    
    // 加载日志
    await loadWorkerLogs(id);
    
    // 更新按钮状态
    updateButtonStates(worker.status);
    
    // 显示详情视图
    workersListElement.style.display = 'none';
    workerDetailElement.style.display = 'block';
    
    // 更新页面标题
    pageTitle.textContent = `Worker: ${worker.name}`;
  } catch (error) {
    console.error('加载 Worker 详情失败:', error);
    showToast('加载 Worker 详情失败', 'danger');
  }
}

// 加载 Worker 日志
async function loadWorkerLogs(id) {
  try {
    const response = await fetch(`/api/workers/${id}/logs`);
    const logs = await response.json();
    
    // 清空日志容器
    logsContainer.innerHTML = '';
    
    // 添加日志
    logs.forEach(log => {
      addLogToUI(log);
    });
    
    // 滚动到底部
    logsContainer.scrollTop = logsContainer.scrollHeight;
  } catch (error) {
    console.error('加载日志失败:', error);
    logsContainer.innerHTML = '<div class="log-entry log-level-error">加载日志失败</div>';
  }
}

// 添加日志到 UI
function addLogToUI(log) {
  const logEntry = document.createElement('div');
  logEntry.className = 'log-entry';
  
  const timestamp = document.createElement('span');
  timestamp.className = 'log-timestamp';
  timestamp.textContent = formatTime(log.timestamp);
  
  const level = document.createElement('span');
  level.className = `log-level log-level-${log.level}`;
  level.textContent = `[${log.level.toUpperCase()}]`;
  
  const message = document.createElement('span');
  message.className = 'log-message';
  message.textContent = log.message;
  
  logEntry.appendChild(timestamp);
  logEntry.appendChild(level);
  logEntry.appendChild(message);
  
  logsContainer.appendChild(logEntry);
  
  // 滚动到底部
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

// 创建 Worker
async function createWorker() {
  const name = newWorkerNameInput.value.trim();
  const route = newWorkerRouteInput.value.trim();
  const description = newWorkerDescriptionInput.value.trim();
  
  if (!name) {
    showToast('请输入 Worker 名称', 'warning');
    return;
  }
  
  if (!route) {
    showToast('请输入路由路径', 'warning');
    return;
  }
  
  try {
    const response = await fetch('/api/workers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, route, description })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || '创建 Worker 失败');
    }
    
    // 关闭模态框
    const modal = bootstrap.Modal.getInstance(document.getElementById('createWorkerModal'));
    modal.hide();
    
    // 清空输入
    newWorkerNameInput.value = '';
    newWorkerRouteInput.value = '';
    newWorkerDescriptionInput.value = '';
    
    // 重新加载列表
    await loadWorkersList();
    
    // 显示成功消息
    showToast('Worker 创建成功', 'success');
  } catch (error) {
    console.error('创建 Worker 失败:', error);
    showToast(error.message, 'danger');
  }
}

// 保存并部署 Worker
async function saveAndDeployWorker() {
  const name = editNameInput.value.trim();
  const route = editRouteInput.value.trim();
  const description = editDescriptionInput.value.trim();
  const code = editor.getValue();
  
  if (!name) {
    showToast('请输入 Worker 名称', 'warning');
    return;
  }
  
  if (!route) {
    showToast('请输入路由路径', 'warning');
    return;
  }
  
  try {
    // 保存基本信息
    const infoResponse = await fetch(`/api/workers/${currentWorkerId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, route, description })
    });
    
    if (!infoResponse.ok) {
      const error = await infoResponse.json();
      throw new Error(error.message || '保存 Worker 信息失败');
    }
    
    // 保存代码
    const codeResponse = await fetch(`/api/workers/${currentWorkerId}/code`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code })
    });
    
    if (!codeResponse.ok) {
      const error = await codeResponse.json();
      throw new Error(error.message || '保存 Worker 代码失败');
    }
    
    // 更新 UI
    workerNameElement.textContent = name;
    
    // 检查当前状态，如果是运行中，先停止再启动
    const currentStatus = workerStatusElement.querySelector('.status-badge').textContent.trim();
    if (currentStatus === '运行中') {
      // 先停止
      await stopWorker(currentWorkerId, false); // 传入 false 表示不显示停止成功的提示
    }
    
    // 启动 Worker
    await startWorker(currentWorkerId);
    
    // 显示成功消息
    showToast('Worker 已保存并部署', 'success');
  } catch (error) {
    console.error('保存并部署 Worker 失败:', error);
    showToast(error.message || '保存并部署 Worker 失败', 'danger');
  }
}

// 启动 Worker
async function startWorker(id, showMessage = true) {
  try {
    const response = await fetch(`/api/workers/${id}/start`, {
      method: 'POST'
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '启动 Worker 失败');
    }
    
    const worker = await response.json();
    
    // 如果在详情页面，更新状态
    if (currentWorkerId === id) {
      workerStatusElement.innerHTML = createStatusBadgeHTML(worker.status);
      updateButtonStates(worker.status);
    }
    
    // 更新列表中的状态
    updateWorkerStatusInList(id, worker.status);
    
    // 显示成功消息
    if (showMessage) {
      showToast(`Worker "${worker.name}" 已启动`, 'success');
    }
    
    return worker;
  } catch (error) {
    console.error('启动 Worker 失败:', error);
    showToast(error.message || '启动 Worker 失败', 'danger');
    throw error;
  }
}

// 停止 Worker
async function stopWorker(id, showMessage = true) {
  try {
    const response = await fetch(`/api/workers/${id}/stop`, {
      method: 'POST'
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '停止 Worker 失败');
    }
    
    const worker = await response.json();
    
    // 如果在详情页面，更新状态
    if (currentWorkerId === id) {
      workerStatusElement.innerHTML = createStatusBadgeHTML(worker.status);
      updateButtonStates(worker.status);
    }
    
    // 更新列表中的状态
    updateWorkerStatusInList(id, worker.status);
    
    // 显示成功消息
    if (showMessage) {
      showToast(`Worker "${worker.name}" 已停止`, 'success');
    }
    
    return worker;
  } catch (error) {
    console.error('停止 Worker 失败:', error);
    showToast(error.message || '停止 Worker 失败', 'danger');
    throw error;
  }
}

// 删除 Worker
async function deleteWorker(id) {
  try {
    const response = await fetch(`/api/workers/${id}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '删除 Worker 失败');
    }
    
    // 关闭模态框
    const modal = bootstrap.Modal.getInstance(document.getElementById('confirm-delete-modal'));
    modal.hide();
    
    // 如果在详情页面且删除的是当前 Worker，则返回列表
    if (currentWorkerId === id) {
      backToList();
    }
    
    // 重新加载列表
    await loadWorkersList();
    
    // 显示成功消息
    showToast('Worker 已删除', 'success');
  } catch (error) {
    console.error('删除 Worker 失败:', error);
    showToast(error.message || '删除 Worker 失败', 'danger');
  }
}

// 显示删除确认对话框
function showDeleteConfirmation(id, name) {
  deleteWorkerNameElement.textContent = name;
  confirmDeleteBtn.onclick = () => deleteWorker(id);
  
  const modal = new bootstrap.Modal(document.getElementById('confirm-delete-modal'));
  modal.show();
}

// 清除日志
async function clearLogs() {
  if (!currentWorkerId) return;
  
  try {
    const response = await fetch(`/api/workers/${currentWorkerId}/logs`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      // 清空日志容器
      logsContainer.innerHTML = '';
      showToast('日志已清除', 'success');
      
      // 重新订阅日志，确保获取最新状态
      unsubscribeFromWorkerLogs(currentWorkerId);
      subscribeToWorkerLogs(currentWorkerId);
    } else {
      showToast('清除日志失败', 'danger');
    }
  } catch (error) {
    console.error('清除日志失败:', error);
    showToast('清除日志失败', 'danger');
  }
}

// 返回列表
function backToList() {
  // 取消订阅当前Worker的日志
  if (currentWorkerId) {
    unsubscribeFromWorkerLogs(currentWorkerId);
  }
  
  // 重置当前Worker ID
  currentWorkerId = null;
  
  // 显示列表视图
  workersListElement.style.display = 'block';
  workerDetailElement.style.display = 'none';
  
  // 更新页面标题
  pageTitle.textContent = 'Workers';
  
  // 更新当前页面状态
  currentPage = 'workers';
  
  // 更新侧边栏活动项
  updateActiveSidebarItem();
}

// 更新列表中的 Worker 状态
function updateWorkerStatusInList(id, status) {
  const workerCard = document.querySelector(`.worker-card[data-id="${id}"]`);
  if (!workerCard) return;
  
  // 更新状态徽章
  const statusBadgeContainer = workerCard.querySelector('.worker-card-header');
  if (statusBadgeContainer) {
    const oldBadge = statusBadgeContainer.querySelector('.status-badge');
    if (oldBadge) {
      oldBadge.remove();
    }
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = createStatusBadgeHTML(status);
    statusBadgeContainer.appendChild(tempDiv.firstElementChild);
  }
  
  // 更新按钮
  const actionsContainer = workerCard.querySelector('.worker-card-actions');
  if (actionsContainer) {
    // 移除现有的启动/停止按钮
    const existingStartBtn = actionsContainer.querySelector('.start-worker-btn');
    const existingStopBtn = actionsContainer.querySelector('.stop-worker-btn');
    
    if (existingStartBtn) {
      existingStartBtn.remove();
    }
    
    if (existingStopBtn) {
      existingStopBtn.remove();
    }
    
    // 创建新按钮
    const newButton = document.createElement('button');
    newButton.className = status === 'running' 
      ? 'btn-icon btn-icon-warning stop-worker-btn' 
      : 'btn-icon btn-icon-success start-worker-btn';
    newButton.title = status === 'running' ? '停止' : '启动';
    newButton.innerHTML = status === 'running' 
      ? '<i class="bi bi-stop-fill"></i>' 
      : '<i class="bi bi-play-fill"></i>';
    
    // 添加事件监听器
    newButton.addEventListener('click', (e) => {
      e.stopPropagation();
      if (status === 'running') {
        stopWorker(id);
      } else {
        startWorker(id);
      }
    });
    
    actionsContainer.appendChild(newButton);
  }
}

// 更新按钮状态
function updateButtonStates(status) {
  if (status === 'running') {
    saveDeployBtn.disabled = false;
    previewWorkerBtn.style.display = 'inline-block';
  } else {
    saveDeployBtn.disabled = false;
    previewWorkerBtn.style.display = 'none';
  }
}

// 创建状态徽章 HTML
function createStatusBadgeHTML(status) {
  return `<div class="status-badge ${status === 'running' ? 'status-running' : 'status-stopped'}">
    ${status === 'running' ? '运行中' : '已停止'}
  </div>`;
}

// 显示提示消息
function showToast(message, type = 'info') {
  // 检查是否已存在 toast 容器
  let toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    document.body.appendChild(toastContainer);
  }
  
  // 创建 toast 元素
  const toastId = `toast-${Date.now()}`;
  const toast = document.createElement('div');
  toast.className = `toast align-items-center text-white bg-${type} border-0`;
  toast.id = toastId;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'assertive');
  toast.setAttribute('aria-atomic', 'true');
  
  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">
        ${message}
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;
  
  toastContainer.appendChild(toast);
  
  // 显示 toast
  const bsToast = new bootstrap.Toast(toast, {
    autohide: true,
    delay: 3000
  });
  bsToast.show();
  
  // 自动移除
  toast.addEventListener('hidden.bs.toast', () => {
    toast.remove();
  });
}

// 格式化日期
function formatDate(dateString) {
  if (!dateString) return '未知';
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN');
}

// 格式化时间
function formatTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleTimeString('zh-CN');
}

// 初始化模态框
function initModals() {
  // 创建 Worker 模态框
  const createWorkerModal = document.getElementById('createWorkerModal');
  const confirmCreateWorkerBtn = document.getElementById('confirm-create-worker-btn');
  
  // 确认创建 Worker
  confirmCreateWorkerBtn.addEventListener('click', createWorker);
  
  // 删除确认模态框
  const confirmDeleteModal = document.getElementById('confirm-delete-modal');
  const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
  
  // 确认删除 Worker - 不要直接绑定 deleteWorker 函数
  // 因为 deleteWorker 需要一个 id 参数，而事件处理函数会传入事件对象
  // confirmDeleteBtn.addEventListener('click', deleteWorker);
}

// 更新侧边栏活动项
function updateActiveSidebarItem() {
  // 移除所有活动状态
  sidebarMenuItems.forEach(menuItem => {
    menuItem.parentElement.classList.remove('active');
  });
  
  // 根据当前页面设置活动项
  sidebarMenuItems.forEach(menuItem => {
    const href = menuItem.getAttribute('href');
    const pageType = href === '/' ? 'workers' : href.replace('/', '');
    
    if (pageType === currentPage) {
      menuItem.parentElement.classList.add('active');
    }
  });
}

// 初始化侧边栏
function initSidebar() {
  // 侧边栏关闭按钮
  sidebarToggleBtn.addEventListener('click', () => {
    sidebar.classList.remove('show');
  });
  
  // 侧边栏打开按钮
  sidebarOpenBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // 阻止事件冒泡
    sidebar.classList.add('show');
  });
  
  // 为侧边栏打开按钮内的图标添加事件委托
  sidebarOpenBtn.querySelector('i').addEventListener('click', (e) => {
    e.stopPropagation(); // 阻止事件冒泡
    sidebar.classList.add('show');
  });
  
  // 点击外部区域关闭侧边栏
  document.addEventListener('click', (e) => {
    if (window.innerWidth < 992 && 
        sidebar.classList.contains('show') && 
        !sidebar.contains(e.target) &&
        e.target !== sidebarOpenBtn &&
        !sidebarOpenBtn.contains(e.target)) {
      sidebar.classList.remove('show');
    }
  });

  // 添加侧边栏菜单项点击事件
  sidebarMenuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      
      // 获取页面类型
      const href = item.getAttribute('href');
      const pageType = href === '/' ? 'workers' : href.replace('/', '');
      
      // 切换页面
      switchPage(pageType);
      
      // 更新活动菜单项
      sidebarMenuItems.forEach(menuItem => {
        menuItem.parentElement.classList.remove('active');
      });
      item.parentElement.classList.add('active');
      
      // 在移动设备上关闭侧边栏
      if (window.innerWidth < 992) {
        sidebar.classList.remove('show');
      }
    });
  });
}

// 切换页面
function switchPage(pageType) {
  // 保存当前页面类型
  currentPage = pageType;
  
  // 隐藏所有内容区域
  workersListElement.style.display = 'none';
  workerDetailElement.style.display = 'none';
  
  // 清除之前创建的页面内容
  const existingLogsPage = document.getElementById('logs-page');
  if (existingLogsPage) {
    existingLogsPage.style.display = 'none';
  }
  
  const existingSettingsPage = document.getElementById('settings-page');
  if (existingSettingsPage) {
    existingSettingsPage.style.display = 'none';
  }
  
  const existingHelpPage = document.getElementById('help-page');
  if (existingHelpPage) {
    existingHelpPage.style.display = 'none';
  }
  
  // 更新页面标题
  pageTitle.textContent = getPageTitle(pageType);
  
  // 更新顶部操作按钮
  updateTopActions(pageType);
  
  // 显示相应的内容区域
  switch (pageType) {
    case 'workers':
      workersListElement.style.display = 'block';
      loadWorkersList();
      break;
    case 'logs':
      showLogsPage();
      break;
    case 'settings':
      showSettingsPage();
      break;
    case 'help':
      showHelpPage();
      break;
  }
}

// 获取页面标题
function getPageTitle(pageType) {
  switch (pageType) {
    case 'workers':
      return 'Workers';
    case 'logs':
      return '日志';
    case 'settings':
      return '设置';
    case 'help':
      return '帮助';
    default:
      return 'Workers';
  }
}

// 更新顶部操作按钮
function updateTopActions(pageType) {
  const topNavbarActions = document.querySelector('.top-navbar-actions');
  
  // 清空当前按钮
  topNavbarActions.innerHTML = '';
  
  // 根据页面类型添加相应的按钮
  switch (pageType) {
    case 'workers':
      topNavbarActions.innerHTML = `
        <button id="create-worker-btn" class="btn btn-primary">
          <i class="bi bi-plus-lg"></i> 创建 Worker
        </button>
      `;
      // 重新绑定事件
      document.getElementById('create-worker-btn').addEventListener('click', () => {
        // 清空表单
        newWorkerNameInput.value = '';
        newWorkerRouteInput.value = '';
        newWorkerDescriptionInput.value = '';
        
        // 显示模态框
        const createWorkerModal = document.getElementById('createWorkerModal');
        const modal = new bootstrap.Modal(createWorkerModal);
        modal.show();
      });
      break;
    case 'logs':
      topNavbarActions.innerHTML = `
        <button id="clear-all-logs-btn" class="btn btn-outline-danger">
          <i class="bi bi-trash"></i> 清除所有日志
        </button>
      `;
      // 绑定清除所有日志事件
      document.getElementById('clear-all-logs-btn').addEventListener('click', clearAllLogs);
      break;
    case 'settings':
      // 设置页面可能不需要特殊按钮
      break;
    case 'help':
      topNavbarActions.innerHTML = `
        <a href="https://github.com/yourusername/workerconsole" target="_blank" class="btn btn-outline-primary">
          <i class="bi bi-github"></i> GitHub
        </a>
      `;
      break;
  }
}

// 显示日志页面
function showLogsPage() {
  // 获取或创建日志页面内容
  let logsPageContent = document.getElementById('logs-page');
  
  if (!logsPageContent) {
    // 如果不存在，创建新的日志页面内容
    logsPageContent = document.createElement('div');
    logsPageContent.id = 'logs-page';
    logsPageContent.className = 'content-section';
    
    // 添加到主内容区域
    const contentWrapper = document.querySelector('.content-wrapper');
    contentWrapper.appendChild(logsPageContent);
  }
  
  // 更新内容
  logsPageContent.innerHTML = `
    <div class="alert alert-info">
      <i class="bi bi-info-circle-fill me-2"></i>
      <span>日志页面功能正在开发中，敬请期待！</span>
    </div>
    <div class="card">
      <div class="card-header">
        <h5>系统日志</h5>
      </div>
      <div class="card-body">
        <p>此页面将显示所有 Worker 的综合日志信息。</p>
      </div>
    </div>
  `;
  
  // 显示日志页面
  logsPageContent.style.display = 'block';
}

// 显示设置页面
function showSettingsPage() {
  // 获取或创建设置页面内容
  let settingsPageContent = document.getElementById('settings-page');
  
  if (!settingsPageContent) {
    // 如果不存在，创建新的设置页面内容
    settingsPageContent = document.createElement('div');
    settingsPageContent.id = 'settings-page';
    settingsPageContent.className = 'content-section';
    
    // 添加到主内容区域
    const contentWrapper = document.querySelector('.content-wrapper');
    contentWrapper.appendChild(settingsPageContent);
  }
  
  // 更新内容
  settingsPageContent.innerHTML = `
    <div class="alert alert-info">
      <i class="bi bi-info-circle-fill me-2"></i>
      <span>设置页面功能正在开发中，敬请期待！</span>
    </div>
    <div class="card">
      <div class="card-header">
        <h5>系统设置</h5>
      </div>
      <div class="card-body">
        <p>此页面将允许您配置 WorkerConsole 的各项设置。</p>
        <p>包括日志保留策略、自动启动选项等。</p>
      </div>
    </div>
  `;
  
  // 显示设置页面
  settingsPageContent.style.display = 'block';
}

// 显示帮助页面
function showHelpPage() {
  // 获取或创建帮助页面内容
  let helpPageContent = document.getElementById('help-page');
  
  if (!helpPageContent) {
    // 如果不存在，创建新的帮助页面内容
    helpPageContent = document.createElement('div');
    helpPageContent.id = 'help-page';
    helpPageContent.className = 'content-section';
    
    // 添加到主内容区域
    const contentWrapper = document.querySelector('.content-wrapper');
    contentWrapper.appendChild(helpPageContent);
  }
  
  // 更新内容
  helpPageContent.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h5>使用帮助</h5>
      </div>
      <div class="card-body">
        <h4>什么是 WorkerConsole？</h4>
        <p>WorkerConsole 是一个本地 Cloudflare Workers 管理系统，允许您在本地环境中创建、测试和管理 Workers。</p>
        
        <h4>如何创建 Worker？</h4>
        <ol>
          <li>点击顶部的"创建 Worker"按钮</li>
          <li>输入 Worker 名称和路由路径</li>
          <li>点击"创建"按钮</li>
          <li>在代码编辑器中编写您的 Worker 代码</li>
          <li>点击"保存"按钮保存代码</li>
          <li>点击"启动"按钮运行 Worker</li>
        </ol>
        
        <h4>如何访问我的 Worker？</h4>
        <p>Worker 启动后，您可以通过以下 URL 访问：</p>
        <code id="worker-url-example">http://${window.location.host}/[您的路由路径]</code>
        
        <h4>常见问题</h4>
        <div class="accordion" id="faqAccordion">
          <div class="accordion-item">
            <h2 class="accordion-header">
              <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#faq1">
                Worker 无法启动怎么办？
              </button>
            </h2>
            <div id="faq1" class="accordion-collapse collapse" data-bs-parent="#faqAccordion">
              <div class="accordion-body">
                请检查您的代码是否有语法错误，或者路由路径是否已被其他 Worker 占用。
              </div>
            </div>
          </div>
          <div class="accordion-item">
            <h2 class="accordion-header">
              <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#faq2">
                如何查看 Worker 的日志？
              </button>
            </h2>
            <div id="faq2" class="accordion-collapse collapse" data-bs-parent="#faqAccordion">
              <div class="accordion-body">
                在 Worker 详情页面底部有日志显示区域，您可以在那里查看运行日志。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // 显示帮助页面
  helpPageContent.style.display = 'block';
}

// 清除所有日志
function clearAllLogs() {
  // 显示确认对话框
  if (confirm('确定要清除所有 Worker 的日志吗？此操作无法撤销。')) {
    showToast('清除所有日志功能正在开发中', 'info');
  }
}

// 初始化事件监听器
function initEventListeners() {
  // 返回列表按钮
  backToListBtn.addEventListener('click', backToList);
  
  // 保存并部署 Worker 按钮
  saveDeployBtn.addEventListener('click', saveAndDeployWorker);
  
  // 预览 Worker 按钮
  previewWorkerBtn.addEventListener('click', () => {
    const route = editRouteInput.value.trim();
    if (route) {
      // 在新标签页中打开 Worker 路由
      window.open(`/${route}`, '_blank');
    } else {
      showToast('Worker 路由路径为空，无法预览', 'warning');
    }
  });
  
  // 删除 Worker 按钮
  deleteWorkerBtn.addEventListener('click', () => {
    const workerName = workerNameElement.textContent;
    showDeleteConfirmation(currentWorkerId, workerName);
  });
  
  // 清除日志按钮
  clearLogsBtn.addEventListener('click', clearLogs);
  
  // 初始绑定创建按钮事件
  if (createWorkerBtn) {
    createWorkerBtn.addEventListener('click', () => {
      // 清空表单
      newWorkerNameInput.value = '';
      newWorkerRouteInput.value = '';
      newWorkerDescriptionInput.value = '';
      
      // 显示模态框
      const createWorkerModal = document.getElementById('createWorkerModal');
      const modal = new bootstrap.Modal(createWorkerModal);
      modal.show();
    });
  }
}

// 初始化应用
function initApp() {
  console.log('初始化应用...');
  
  // 初始化 Socket.IO
  initSocketIO();
  
  // 初始化模态框
  initModals();
  
  // 初始化侧边栏
  initSidebar();
  
  // 初始化事件监听器
  initEventListeners();
  
  // 加载 Workers 列表
  loadWorkersList();
  
  // 初始化 Monaco 编辑器
  initMonacoEditor();
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initApp); 