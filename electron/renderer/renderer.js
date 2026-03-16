// 标签页切换
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.dataset.tab;

    // 更新按钮状态
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // 更新内容显示
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
  });
});

// 折叠面板功能
document.querySelectorAll('.accordion-header').forEach(header => {
  header.addEventListener('click', () => {
    const section = header.dataset.section;
    const content = document.getElementById(`accordion-${section}`);
    const isActive = header.classList.contains('active');

    // 关闭所有面板
    document.querySelectorAll('.accordion-header').forEach(h => {
      h.classList.remove('active');
    });
    document.querySelectorAll('.accordion-content').forEach(c => {
      c.classList.remove('active');
    });

    // 如果当前面板不是激活状态，则打开它
    if (!isActive) {
      header.classList.add('active');
      content.classList.add('active');
    }
  });
});

// 配置相关
let currentConfig = null;

// 加载配置
async function loadConfig() {
  try {
    currentConfig = await window.electronAPI.loadConfig();
    populateConfigForm(currentConfig);
  } catch (error) {
    console.error('加载配置失败:', error);
    alert('加载配置失败: ' + error.message);
  }
}

// 填充配置表单
function populateConfigForm(config) {
  // 数据库配置
  document.getElementById('db-host').value = config.db.host;
  document.getElementById('db-port').value = config.db.port;
  document.getElementById('db-user').value = config.db.user;
  document.getElementById('db-password').value = config.db.password;
  document.getElementById('db-database').value = config.db.database;

  // 路径配置
  document.getElementById('source-dir').value = config.paths.sourceDir;
  document.getElementById('target-dir').value = config.paths.targetDir;

  // 分类配置
  document.getElementById('category-a-name').value = config.categories.categoryA.name;
  document.getElementById('category-a-regex').value = config.categories.categoryA.regex;
  document.getElementById('category-b-name').value = config.categories.categoryB.name;
  document.getElementById('category-b-regex').value = config.categories.categoryB.regex;
  document.getElementById('default-category').value = config.categories.default;

  // 雪花算法配置
  document.getElementById('worker-id').value = config.snowflake.workerId;
  document.getElementById('datacenter-id').value = config.snowflake.datacenterId;
}

// 从表单获取配置
function getConfigFromForm() {
  return {
    db: {
      host: document.getElementById('db-host').value,
      port: parseInt(document.getElementById('db-port').value),
      user: document.getElementById('db-user').value,
      password: document.getElementById('db-password').value,
      database: document.getElementById('db-database').value
    },
    snowflake: {
      workerId: parseInt(document.getElementById('worker-id').value),
      datacenterId: parseInt(document.getElementById('datacenter-id').value)
    },
    paths: {
      sourceDir: document.getElementById('source-dir').value,
      targetDir: document.getElementById('target-dir').value
    },
    categories: {
      categoryA: {
        name: document.getElementById('category-a-name').value,
        regex: document.getElementById('category-a-regex').value
      },
      categoryB: {
        name: document.getElementById('category-b-name').value,
        regex: document.getElementById('category-b-regex').value
      },
      default: document.getElementById('default-category').value
    }
  };
}

// 保存配置
document.getElementById('save-config-btn').addEventListener('click', async () => {
  try {
    const config = getConfigFromForm();
    const result = await window.electronAPI.saveConfig(config);

    if (result.success) {
      alert('配置保存成功！');
      currentConfig = config;
    } else {
      alert('配置保存失败: ' + result.error);
    }
  } catch (error) {
    console.error('保存配置失败:', error);
    alert('保存配置失败: ' + error.message);
  }
});

// 重新加载配置
document.getElementById('load-config-btn').addEventListener('click', loadConfig);

// 选择源目录
document.getElementById('select-source-btn').addEventListener('click', async () => {
  const dir = await window.electronAPI.selectDirectory('选择源图片目录');
  if (dir) {
    document.getElementById('source-dir').value = dir;
  }
});

// 选择目标目录
document.getElementById('select-target-btn').addEventListener('click', async () => {
  const dir = await window.electronAPI.selectDirectory('选择目标整理目录');
  if (dir) {
    document.getElementById('target-dir').value = dir;
  }
});

// 整理相关
const logContainer = document.getElementById('log-container');
const startOrganizeBtn = document.getElementById('start-organize-btn');
const summarySection = document.getElementById('summary-section');
const summaryContent = document.getElementById('summary-content');

// 日志弹窗控制
const logModal = document.getElementById('log-modal');
const toggleLogBtn = document.getElementById('toggle-log-btn');
const closeLogBtn = document.getElementById('close-log-btn');

// 显示/隐藏日志弹窗
toggleLogBtn.addEventListener('click', () => {
  logModal.classList.toggle('active');
});

closeLogBtn.addEventListener('click', () => {
  logModal.classList.remove('active');
});

// 点击弹窗背景关闭
logModal.addEventListener('click', (e) => {
  if (e.target === logModal) {
    logModal.classList.remove('active');
  }
});

// 获取复选框
const moveFilesFixed = document.getElementById('move-files-fixed');
const dryRunFixed = document.getElementById('dry-run-fixed');

// 添加日志
function addLog(message, type = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// 清空日志
function clearLog() {
  logContainer.innerHTML = '';
}

// 监听进度消息
window.electronAPI.onOrganizeProgress((message) => {
  addLog(message.message, message.type);
});

// 开始整理
startOrganizeBtn.addEventListener('click', async () => {
  try {
    // 清空之前的日志和摘要
    clearLog();
    summarySection.style.display = 'none';

    // 打开日志弹窗
    logModal.classList.add('active');

    // 获取当前配置
    const config = getConfigFromForm();

    // 验证配置
    if (!config.paths.sourceDir || !config.paths.targetDir) {
      alert('请先配置源目录和目标目录！');
      return;
    }

    if (!config.categories.categoryA.regex || !config.categories.categoryB.regex) {
      alert('请先配置分类正则表达式！');
      return;
    }

    // 获取选项（从固定栏获取）
    const moveFiles = moveFilesFixed.checked;
    const dryRun = dryRunFixed.checked;

    // 禁用按钮
    startOrganizeBtn.disabled = true;
    const btnText = startOrganizeBtn.querySelector('.btn-text');
    const originalText = btnText.textContent;
    btnText.textContent = '整理中...';

    addLog('开始整理任务...', 'info');

    // 执行整理
    const result = await window.electronAPI.organizeImages({
      config,
      moveFiles,
      dryRun
    });

    if (result.success) {
      addLog('整理任务完成！', 'success');

      // 显示摘要
      if (result.summary) {
        summarySection.style.display = 'block';
        summaryContent.innerHTML = `
          <p><strong>总计扫描:</strong> ${result.summary.total} 个文件</p>
          <p><strong>新文件:</strong> ${result.summary.newFiles} 个</p>
          <p><strong>重复文件:</strong> ${result.summary.duplicates} 个</p>
          <p><strong>按分类统计:</strong></p>
          ${Object.entries(result.summary.categoryStats)
            .map(([cat, count]) => `<p style="margin-left: 20px;">${cat}: ${count} 个文件</p>`)
            .join('')}
        `;
      } else if (result.message) {
        addLog(result.message, 'info');
      }
    } else {
      addLog('整理任务失败: ' + result.error, 'error');
      if (result.stack) {
        console.error(result.stack);
      }
    }
  } catch (error) {
    addLog('发生错误: ' + error.message, 'error');
    console.error(error);
  } finally {
    // 恢复按钮
    startOrganizeBtn.disabled = false;
    const btnText = startOrganizeBtn.querySelector('.btn-text');
    btnText.textContent = '开始整理';
  }
});

// 统计相关
const refreshStatsBtn = document.getElementById('refresh-stats-btn');
const statsContainer = document.getElementById('stats-container');

refreshStatsBtn.addEventListener('click', async () => {
  try {
    refreshStatsBtn.disabled = true;
    refreshStatsBtn.textContent = '加载中...';

    statsContainer.innerHTML = '<p class="placeholder">加载中...</p>';

    // 获取当前配置
    const config = getConfigFromForm();

    // 验证数据库配置
    if (!config.db.password) {
      statsContainer.innerHTML = '<p class="placeholder" style="color: #e57373;">请先配置数据库密码！</p>';
      return;
    }

    const result = await window.electronAPI.getStats(config);

    if (result.success) {
      const stats = result.stats;

      let html = `
        <div class="stat-item">
          <h3>总计文件数</h3>
          <p>${stats.total}</p>
        </div>
      `;

      if (stats.byCategory && stats.byCategory.length > 0) {
        html += '<h3 style="margin: 20px 0 10px 0;">按分类统计</h3>';
        html += '<div class="category-stats">';
        stats.byCategory.forEach(item => {
          html += `
            <div class="category-item">
              <div class="name">${item.category}</div>
              <div class="count">${item.count}</div>
            </div>
          `;
        });
        html += '</div>';
      }

      statsContainer.innerHTML = html;
    } else {
      statsContainer.innerHTML = `<p class="placeholder" style="color: #e57373;">加载失败: ${result.error}</p>`;
    }
  } catch (error) {
    console.error('获取统计失败:', error);
    statsContainer.innerHTML = `<p class="placeholder" style="color: #e57373;">发生错误: ${error.message}</p>`;
  } finally {
    refreshStatsBtn.disabled = false;
    refreshStatsBtn.textContent = '刷新统计';
  }
});

// 页面加载时自动加载配置
window.addEventListener('DOMContentLoaded', () => {
  loadConfig();
});
