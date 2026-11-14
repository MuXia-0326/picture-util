(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const api = window.photoAPI;
  const state = { busy: '', ready: false, saved: '', dirty: false, unlisten: null, progressReady: null, progressError: '', logCount: 0, view: 'config' };
  const defaults = { db: { host: 'localhost', port: 3306, user: 'root', password: '', database: 'image_organizer' }, snowflake: { workerId: 1, datacenterId: 1 }, paths: { sourceDir: '', targetDir: '' }, categories: { categoryA: { name: 'CategoryA', regex: '' }, categoryB: { name: 'CategoryB', regex: '' }, default: 'Other' } };
  const fields = {
    'db-host': ['db', 'host'], 'db-port': ['db', 'port'], 'db-user': ['db', 'user'], 'db-password': ['db', 'password'], 'db-database': ['db', 'database'],
    'source-dir': ['paths', 'sourceDir'], 'target-dir': ['paths', 'targetDir'], 'worker-id': ['snowflake', 'workerId'], 'datacenter-id': ['snowflake', 'datacenterId'],
    'category-a-name': ['categories', 'categoryA', 'name'], 'category-a-regex': ['categories', 'categoryA', 'regex'], 'category-b-name': ['categories', 'categoryB', 'name'], 'category-b-regex': ['categories', 'categoryB', 'regex'], 'default-category': ['categories', 'default']
  };
  const numeric = new Set(['db-port', 'worker-id', 'datacenter-id']);
  const raw = new Set(['db-password', 'category-a-regex', 'category-b-regex']);
  const clipped = (value, length = 1500) => String(value ?? '').slice(0, length);
  const errorText = (error) => clipped(typeof error === 'string' ? error : error?.message || '未知错误，请重试');
  const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = clipped(text, 2500); return node; };
  const formatCount = (value) => value.toLocaleString('zh-CN');
  function count(value) { const result = Number(value); if (value === null || value === '' || !Number.isSafeInteger(result) || result < 0) throw new Error('后端返回了无效的统计数量'); return result; }
  function configFromForm() {
    const config = { db: {}, snowflake: {}, paths: {}, categories: { categoryA: {}, categoryB: {} } };
    Object.entries(fields).forEach(([id, path]) => {
      let target = config;
      path.slice(0, -1).forEach((part) => { target = target[part]; });
      const value = $(id).value;
      target[path[path.length - 1]] = numeric.has(id) ? Number(value) : raw.has(id) ? value : value.trim();
    });
    return config;
  }
  function populate(config) {
    for (const [id, path] of Object.entries(fields)) {
      const value = path.reduce((target, part) => target?.[part], config);
      if (value === undefined || value === null || (numeric.has(id) ? !Number.isFinite(Number(value)) : typeof value !== 'string')) throw new Error('配置格式不完整，请检查配置文件后重新加载');
    }
    Object.entries(fields).forEach(([id, path]) => { $(id).value = path.reduce((target, part) => target[part], config); });
    state.saved = JSON.stringify(configFromForm());
    state.dirty = false;
    clearErrors();
    updatePreview();
  }
  function feedback(message, type = 'success') { $('feedback').textContent = clipped(message); $('feedback').className = 'feedback' + (type === 'error' ? ' error' : ''); $('feedback').hidden = false; }
  function sync() {
    const locked = Boolean(state.busy);
    $('config-fields').disabled = locked || (api.isDesktop && !state.ready);
    document.querySelectorAll('[data-native]').forEach((button) => { button.disabled = !api.isDesktop || locked || (!state.ready && button.id !== 'load-config-btn'); button.title = !api.isDesktop ? '仅桌面应用可用' : ''; });
    $('dry-run-fixed').disabled = locked;
    $('move-files-fixed').disabled = locked;
    $('clear-log-btn').disabled = locked || !state.logCount;
    $('save-config-btn').disabled = $('save-config-btn').disabled || !state.dirty;
    $('config-form').setAttribute('aria-busy', String(locked));
    $('refresh-stats-btn').querySelector('span').textContent = state.busy === 'stats' ? '正在读取' : '刷新统计';
    $('start-organize-btn').querySelector('.btn-text').textContent = state.busy === 'run' ? '正在整理，请稍候' : $('dry-run-fixed').checked ? '开始试运行' : $('move-files-fixed').checked ? '开始移动整理' : '开始复制整理';
    const status = $('save-state');
    status.classList.toggle('unsaved', state.dirty);
    status.textContent = state.busy === 'load' ? '正在加载配置' : state.busy === 'save' ? '正在保存' : !api.isDesktop ? (state.dirty ? '预览修改 · 未保存' : '预览配置 · 未保存') : !state.ready ? '配置未加载' : state.dirty ? '有未保存的修改' : '配置已同步';
  }
  function busy(value) { state.busy = value; sync(); }
  function changed() {
    state.dirty = JSON.stringify(configFromForm()) !== state.saved;
    updatePreview();
    sync();
    statsMessage(api.isDesktop ? '配置已更新' : '统计仅在桌面应用中可用', api.isDesktop ? '刷新统计以读取当前数据库中的真实数据' : '浏览器预览不会连接数据库，也不会生成演示统计');
  }
  function updatePreview() {
    const target = $('target-dir').value.trim().replace(/[\\/]+$/, '');
    $('preview-root').textContent = clipped(target.split(/[\\/]/).pop() || '你的照片归档', 100);
    $('preview-root').title = target;
    $('preview-category').textContent = clipped($('category-a-name').value.trim() || '分类 A', 100);
    $('preview-other').textContent = clipped($('default-category').value.trim() || '默认分类', 100);
  }
  function clearErrors() { Object.keys(fields).forEach((id) => { $(id).removeAttribute('aria-invalid'); $(id + '-error').hidden = true; }); }
  function fieldError(id, message) { $(id).setAttribute('aria-invalid', 'true'); $(id).setAttribute('aria-describedby', id + '-error'); $(id + '-error').textContent = message; $(id + '-error').hidden = false; }
  function normalizePath(path) {
    const windows = /^[a-z]:/i.test(path) || /^\\/.test(path);
    const normalized = path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/$/, '');
    return windows ? normalized.toLowerCase() : normalized || (path.startsWith('/') ? '/' : '');
  }
  function validate(mode) {
    clearErrors();
    const errors = [];
    const fail = (id, message) => { errors.push(id); fieldError(id, message); };
    const config = configFromForm();
    ['db-host', 'db-user', 'db-database'].forEach((id) => { if (!$(id).value.trim()) fail(id, '请填写此项'); });
    [['db-port', 1, 65535], ['worker-id', 0, 31], ['datacenter-id', 0, 31]].forEach(([id, min, max]) => { const value = Number($(id).value); if (!$(id).value.trim() || !Number.isInteger(value) || value < min || value > max) fail(id, '请输入 ' + min + '–' + max + ' 之间的整数'); });
    if (mode !== 'stats') {
      ['source-dir', 'target-dir'].forEach((id) => {
        const value = $(id).value.trim();
        if (!value && mode === 'run') fail(id, '请选择或输入图片目录');
        else if (value && (!/^(?:[a-z]:[\\/]|\\\\[^\\/]+[\\/]|\/)/i.test(value) || /[\x00-\x1f<>"|?*]/.test(value) || value.split(/[\\/]/).some((part) => part === '.' || part === '..'))) fail(id, '请输入有效的绝对目录路径，不要使用相对路径或特殊字符');
      });
      const source = normalizePath(config.paths.sourceDir);
      const target = normalizePath(config.paths.targetDir);
      if (source && target && (source === target || source.startsWith(target.endsWith('/') ? target : target + '/') || target.startsWith(source.endsWith('/') ? source : source + '/'))) fail('target-dir', '源目录与目标目录必须分开，不能相同或互相包含');
      ['category-a-name', 'category-b-name', 'default-category'].forEach((id) => { const value = $(id).value.trim(); if (!value || /[\\/:*?"<>|\x00-\x1f]/.test(value) || /[. ]$/.test(value) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value) || value === '.' || value === '..') fail(id, '请输入有效的文件夹名称，不含路径符号或保留名称'); });
      ['category-a-regex', 'category-b-regex'].forEach((id) => { const value = $(id).value; if (value) { try { new RegExp(value, 'i'); } catch { fail(id, '正则表达式语法无效，请检查括号与转义'); } } });
    }
    if (errors.length) {
      const first = $(errors[0]);
      const details = first.closest('details');
      if (details) details.open = true;
      if (state.view !== 'config') showView('config');
      feedback('请先修正标出的 ' + errors.length + ' 项配置', 'error');
      first.focus();
      first.scrollIntoView({ block: 'center' });
      return null;
    }
    return config;
  }
  async function confirmAction(title, description, accept) {
    const dialog = $('confirm-dialog');
    $('confirm-title').textContent = title;
    $('confirm-description').textContent = description;
    $('confirm-accept').textContent = accept;
    dialog.returnValue = 'cancel';
    return new Promise((resolve) => { dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }); dialog.showModal(); });
  }
  async function loadConfig(ask = false) {
    if (state.busy || !api.isDesktop) return;
    busy('load');
    try {
      if (ask && state.dirty && !await confirmAction('放弃未保存的修改？', '重新加载将用已保存的配置替换当前表单，尚未保存的修改会丢失', '放弃修改并加载')) return;
      const config = await api.loadConfig();
      populate(config);
      state.ready = true;
      if (ask) feedback('已重新加载桌面配置');
    } catch (error) { state.ready = false; feedback('配置加载失败：' + errorText(error) + '。为保护原配置，保存与整理已停用，请修复后重新加载', 'error'); }
    finally { busy(''); }
  }
  async function saveConfig() {
    if (state.busy || !api.isDesktop || !state.ready) return;
    const config = validate('save');
    if (!config) return;
    busy('save');
    try {
      const result = await api.saveConfig(config);
      if (!result?.success) throw new Error(result?.error || '配置未能保存');
      state.saved = JSON.stringify(config);
      state.dirty = false;
      feedback('配置已保存，下次打开可继续使用');
    } catch (error) { feedback('保存失败：' + errorText(error), 'error'); }
    finally { busy(''); }
  }
  async function selectDirectory(id, title) {
    if (state.busy || !api.isDesktop || !state.ready) return;
    busy('directory');
    try { const directory = await api.selectDirectory(title); if (typeof directory === 'string' && directory) { $(id).value = directory; $(id).removeAttribute('aria-invalid'); $(id + '-error').hidden = true; changed(); } }
    catch (error) { feedback('无法选择目录：' + errorText(error), 'error'); }
    finally { busy(''); }
  }
  function addLog(message, type = 'info') {
    const allowed = ['info', 'success', 'error', 'warning'];
    const container = $('log-container');
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 60;
    const entry = element('div', 'log-entry ' + (allowed.includes(type) ? type : 'info'), '[' + new Date().toLocaleTimeString('zh-CN', { hour12: false }) + '] ' + clipped(message, 2000));
    container.append(entry);
    while (container.childElementCount > 200) container.firstElementChild.remove();
    state.logCount++;
    $('log-caption').textContent = state.logCount > 200 ? '最近 200 条 · 共 ' + state.logCount + ' 条日志' : state.logCount + ' 条日志';
    $('task-empty').hidden = true;
    container.hidden = false;
    if (nearBottom) container.scrollTop = container.scrollHeight;
  }
  function clearLog() { $('log-container').replaceChildren(); state.logCount = 0; $('log-container').hidden = true; $('task-empty').hidden = false; $('summary-section').hidden = true; $('summary-content').replaceChildren(); $('log-caption').textContent = '暂无任务记录'; sync(); }
  function taskStatus(text, type = '') { $('task-status').textContent = text; $('task-status').className = 'badge' + (type ? ' ' + type : ''); }
  function renderSummary(summary, dryRun) {
    if (!summary || typeof summary !== 'object') return;
    const metrics = [['扫描文件', count(summary.total)], [dryRun ? '预计新文件' : '新文件', count(summary.newFiles)], ['重复文件', count(summary.duplicates)]];
    const content = $('summary-content');
    content.replaceChildren();
    const grid = element('div', 'summary-metrics');
    metrics.forEach(([label, value]) => { const item = element('div', 'summary-metric'); item.append(element('strong', '', formatCount(value)), element('span', '', label)); grid.append(item); });
    content.append(grid);
    if (summary.categoryStats && typeof summary.categoryStats === 'object') {
      const categories = element('div', 'summary-categories');
      Object.entries(summary.categoryStats).slice(0, 100).forEach(([category, value]) => { categories.append(element('div', '', clipped(category, 100) + ' · ' + formatCount(count(value)) + ' 张')); });
      content.append(categories);
    }
    $('summary-section').hidden = false;
  }
  async function runOrganize() {
    if (state.busy || !api.isDesktop || !state.ready) return;
    const config = validate('run');
    if (!config) return;
    const options = { config, dryRun: $('dry-run-fixed').checked, moveFiles: $('move-files-fixed').checked };
    busy('confirm');
    try {
      if (!options.dryRun) {
        const accepted = await confirmAction(options.moveFiles ? '确认移动并删除源文件？' : '确认开始复制整理？', options.moveFiles ? '这不是试运行。成功复制并记录的源文件将被删除，重复源文件会保留。请确认已备份重要照片。此操作无法在应用中撤销。' : '这不是试运行。将向目标目录复制照片并更新数据库，源文件会保留。建议先试运行确认分类规则。', options.moveFiles ? '我已备份，开始移动' : '确认复制整理');
        if (!accepted) return;
      }
      busy('run');
      clearLog();
      taskStatus(options.dryRun ? '试运行中' : '正在整理', 'running');
      addLog(options.dryRun ? '开始试运行，仅预览整理计划，不修改文件或写入数据库' : options.moveFiles ? '开始移动整理，配置已锁定，请勿关闭应用' : '开始复制整理，源文件将保留，配置已锁定');
      if (state.dirty) addLog('本次使用当前表单配置，尚未保存为下次默认配置');
      await state.progressReady;
      if (state.progressError) addLog('实时日志订阅不可用：' + state.progressError + '；任务结束后仍会显示后端返回的结果', 'warning');
      const result = await api.organizeImages(options);
      if (!result?.success) {
        if (result?.summary) { try { renderSummary(result.summary, options.dryRun); } catch (error) { addLog('部分摘要不可用：' + errorText(error), 'warning'); } }
        throw new Error(result?.error || '整理失败，后端未返回成功状态');
      }
      addLog(options.dryRun ? '试运行完成，未修改文件' : '整理任务已完成', 'success');
      taskStatus(options.dryRun ? '试运行完成' : '整理完成');
      try { renderSummary(result.summary, options.dryRun); } catch (error) { addLog('摘要不可用：' + errorText(error), 'warning'); }
      if (result.message) addLog(result.message);
      feedback(options.dryRun ? '试运行已完成，请检查任务摘要和日志后再执行实际整理' : '整理已完成，可在图库统计中刷新真实数据');
    } catch (error) { taskStatus('任务失败', 'error'); addLog('任务失败：' + errorText(error), 'error'); feedback('整理未完成，请查看任务日志，文件可能已部分处理，请检查后再重试', 'error'); }
    finally { busy(''); }
  }
  function statsMessage(title, description, error = false) {
    const wrapper = element('div', 'stats-empty' + (error ? ' error' : ''));
    wrapper.append(element('h3', '', title), element('p', '', description));
    $('stats-container').replaceChildren(wrapper);
  }
  function renderStats(stats) {
    if (!stats || !Array.isArray(stats.byCategory)) throw new Error('后端统计数据格式无效');
    const total = count(stats.total);
    const rows = stats.byCategory.slice(0, 500).map((row) => ({ category: clipped(row.category, 120), count: count(row.count) }));
    if (total === 0 && rows.every((row) => row.count === 0)) { statsMessage('图库还是空的', '数据库中暂无图片记录，完成一次实际整理后再来看看'); return; }
    const container = $('stats-container');
    container.replaceChildren();
    const totalCard = element('div', 'stats-total');
    totalCard.append(element('span', '', '已归档照片 · 数据库记录'), element('strong', '', formatCount(total)));
    container.append(totalCard, element('h3', '', '分类分布'));
    const bars = element('div', 'category-bars');
    bars.style.marginTop = '20px';
    const max = Math.max(...rows.map((row) => row.count), 1);
    rows.forEach((row) => { const line = element('div', 'category-row'); const bar = element('div', 'bar-track'); const fill = element('div', 'bar-value'); fill.style.width = (row.count / max * 100) + '%'; bar.setAttribute('aria-hidden', 'true'); bar.append(fill); line.append(element('span', 'category-name', row.category), bar, element('span', 'category-count', formatCount(row.count) + ' 张')); bars.append(line); });
    if (!rows.length) bars.append(element('p', 'field-hint', '暂无分类明细'));
    container.append(bars, element('p', 'stats-meta', '更新于 ' + new Date().toLocaleString('zh-CN') + ' · 仅显示真实数据库记录' + (stats.byCategory.length > 500 ? ' · 最多展示前 500 个分类' : '')));
  }
  async function refreshStats() {
    if (state.busy || !api.isDesktop || !state.ready) return;
    const config = validate('stats');
    if (!config) return;
    busy('stats');
    $('stats-container').setAttribute('aria-busy', 'true');
    statsMessage('正在读取图库', '正在连接数据库，请稍候，不会修改照片');
    try { const result = await api.getStats(config); if (!result?.success) throw new Error(result?.error || '读取统计失败'); renderStats(result.stats); }
    catch (error) { statsMessage('暂时无法读取统计', errorText(error) + '。请检查数据库连接后重试', true); }
    finally { $('stats-container').setAttribute('aria-busy', 'false'); busy(''); }
  }
  function showView(view) {
    state.view = view;
    const stats = view === 'stats';
    $('config-tab').hidden = stats;
    $('stats-tab').hidden = !stats;
    $('config-actions').hidden = stats;
    $('breadcrumb-current').textContent = stats ? '图库统计' : '整理工作台';
    $('page-title').textContent = stats ? '回忆渐丰，有迹可循' : '把零散照片，整理成时光';
    $('page-description').textContent = stats ? '从真实归档记录中，了解你的照片收藏' : '选好目录，设定规则，让每一段回忆都有自己的位置';
    document.querySelectorAll('[data-tab]').forEach((button) => { const active = button.dataset.tab === view; button.classList.toggle('active', active); if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
  }
  Object.keys(fields).forEach((id) => { $(id).addEventListener('input', () => { if ($(id).hasAttribute('aria-invalid')) { $(id).removeAttribute('aria-invalid'); $(id + '-error').hidden = true; } changed(); }); });
  document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.tab)));
  document.querySelector('.brand').addEventListener('click', (event) => { event.preventDefault(); showView('config'); });
  $('config-form').addEventListener('submit', (event) => event.preventDefault());
  $('save-config-btn').addEventListener('click', saveConfig);
  $('load-config-btn').addEventListener('click', () => loadConfig(true));
  $('select-source-btn').addEventListener('click', () => selectDirectory('source-dir', '选择源图片目录'));
  $('select-target-btn').addEventListener('click', () => selectDirectory('target-dir', '选择目标整理目录'));
  $('dry-run-fixed').addEventListener('change', sync);
  $('move-files-fixed').addEventListener('change', sync);
  $('start-organize-btn').addEventListener('click', runOrganize);
  $('refresh-stats-btn').addEventListener('click', refreshStats);
  $('clear-log-btn').addEventListener('click', () => { if (!state.busy) clearLog(); });
  document.querySelectorAll('details').forEach((details) => details.addEventListener('toggle', () => { details.querySelector('.details-label').textContent = details.open ? '收起设置' : '展开设置'; }));
  window.addEventListener('beforeunload', (event) => { if (state.dirty || state.busy === 'run') { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('pagehide', () => { if (typeof state.unlisten === 'function') state.unlisten(); }, { once: true });
  document.body.classList.toggle('desktop', api.isDesktop);
  $('runtime-label').textContent = api.isDesktop ? '桌面本地工作空间' : '浏览器界面预览';
  if (api.isDesktop) {
    state.progressReady = api.onOrganizeProgress((payload) => { if (state.busy === 'run' && payload && typeof payload.message === 'string') addLog(payload.message, payload.type); }).then((unlisten) => { state.unlisten = unlisten; }).catch((error) => { state.progressError = errorText(error); });
    loadConfig();
  } else {
    populate(defaults);
    $('environment-notice').hidden = false;
    statsMessage('统计仅在桌面应用中可用', '浏览器预览不会连接数据库，也不会生成演示统计');
    sync();
  }
})();
