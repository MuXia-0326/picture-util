(() => {
  'use strict';
  const desktopOnly = '此功能仅在 PhotoHarbor 桌面应用中可用，浏览器预览不会读取或修改本地文件';
  function nativeAPI() {
    const api = window.__TAURI__;
    if (!api || typeof api.core?.invoke !== 'function') throw new Error(desktopOnly);
    return api;
  }
  const bridge = {
    get isDesktop() { return typeof window.__TAURI__?.core?.invoke === 'function'; },
    loadConfig: () => nativeAPI().core.invoke('load_config'),
    saveConfig: (config) => nativeAPI().core.invoke('save_config', { config }),
    selectDirectory: (title) => nativeAPI().core.invoke('select_directory', { title }),
    organizeImages: (options) => nativeAPI().core.invoke('organize_images', { options }),
    getStats: (config) => nativeAPI().core.invoke('get_stats', { config }),
    async onOrganizeProgress(callback) {
      const api = nativeAPI();
      if (typeof api.event?.listen !== 'function') throw new Error('无法订阅任务进度，请重新打开桌面应用');
      return api.event.listen('organize-progress', (event) => callback(event.payload));
    }
  };
  window.photoAPI = Object.freeze(bridge);
})();
