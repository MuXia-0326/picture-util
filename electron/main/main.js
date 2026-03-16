const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow;
let configPath = path.join(app.getPath('userData'), 'config.json');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../assets/logo.png'),
    backgroundColor: '#667eea',
    show: false,
    autoHideMenuBar: true  // 隐藏菜单栏
  });

  // 完全移除菜单栏
  Menu.setApplicationMenu(null);

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // 窗口准备好后再显示，避免闪烁
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 开发模式下打开开发者工具
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC 处理器

// 加载配置
ipcMain.handle('load-config', async () => {
  try {
    const data = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // 如果配置文件不存在，返回默认配置
    return {
      db: {
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: '',
        database: 'image_organizer'
      },
      snowflake: {
        workerId: 1,
        datacenterId: 1
      },
      paths: {
        sourceDir: '',
        targetDir: ''
      },
      categories: {
        categoryA: {
          name: 'CategoryA',
          regex: ''
        },
        categoryB: {
          name: 'CategoryB',
          regex: ''
        },
        default: 'Other'
      }
    };
  }
});

// 保存配置
ipcMain.handle('save-config', async (event, config) => {
  try {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 选择文件夹
ipcMain.handle('select-directory', async (event, title) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: title || '选择文件夹',
    properties: ['openDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// 执行图片整理任务
ipcMain.handle('organize-images', async (event, options) => {
  try {
    // 动态导入整理逻辑
    const { organizeImagesTask } = require('./organize-task');

    // 创建进度回调
    const onProgress = (message) => {
      mainWindow.webContents.send('organize-progress', message);
    };

    const result = await organizeImagesTask(options, onProgress);
    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
});

// 获取统计信息
ipcMain.handle('get-stats', async (event, config) => {
  try {
    const { getStatsTask } = require('./organize-task');
    const stats = await getStatsTask(config);
    return { success: true, stats };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
