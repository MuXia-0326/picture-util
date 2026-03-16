const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 配置相关
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),

  // 文件夹选择
  selectDirectory: (title) => ipcRenderer.invoke('select-directory', title),

  // 图片整理
  organizeImages: (options) => ipcRenderer.invoke('organize-images', options),
  onOrganizeProgress: (callback) => {
    ipcRenderer.on('organize-progress', (event, message) => callback(message));
  },

  // 统计信息
  getStats: (config) => ipcRenderer.invoke('get-stats', config)
});
