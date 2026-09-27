'use strict';
const { contextBridge, ipcRenderer, webFrame } = require('electron');
const fs = require('fs');
const path = require('path');

function invoke(channel, payload) { return ipcRenderer.invoke(channel, payload); }
function mainWorldCall(name, payload) {
  const json = JSON.stringify(payload ?? null).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029').replace(/</g, '\\u003c');
  return webFrame.executeJavaScript(`try{if(typeof window.${name}==='function')window.${name}(${json});}catch(e){};true;`, true).catch(() => false);
}
function dataUrlToHtml(data) {
  const src = String(data || '').replace(/"/g, '&quot;');
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{margin:0}html,body{margin:0;width:100%;height:100%}body{display:flex;align-items:center;justify-content:center}img{max-width:100%;max-height:100%;object-fit:contain}</style></head><body><img src="${src}"></body></html>`;
}
const desktop = {
  info: () => invoke('desktop:get-info'),
  listPrinters: () => invoke('desktop:list-printers'),
  setPrinter: name => invoke('desktop:set-printer', name),
  listScanners: () => invoke('desktop:list-scanners'),
  setScanner: id => invoke('desktop:set-scanner', id),
  scan: options => invoke('desktop:scan', options || {}),
  saveData: payload => invoke('desktop:save-data', payload || {}),
  printHtml: html => invoke('desktop:print-html', String(html || '')),
  savePdfHtml: (name, html) => invoke('desktop:save-pdf-html', { name, html }),
  openExternal: url => invoke('desktop:open-external', url),
  platform: 'windows'
};
contextBridge.exposeInMainWorld('AbuWindows', desktop);
contextBridge.exposeInMainWorld('__ABU_BASSAM_WINDOWS__', true);
contextBridge.exposeInMainWorld('Android', {
  saveBase64: (name, mime, data) => desktop.saveData({ name, mime, data }),
  saveToGallery: (name, mime, data) => desktop.saveData({ name, mime, data }),
  savePagesToGallery: async (prefix, pages) => {
    let list = []; try { list = typeof pages === 'string' ? JSON.parse(pages) : pages; } catch (_) {}
    if (!Array.isArray(list)) return false;
    for (let i = 0; i < list.length; i += 1) await desktop.saveData({ name: `${prefix || 'Abu_Bassam'}_${i + 1}.jpg`, mime: 'image/jpeg', data: list[i] });
    return true;
  },
  printPages: async pages => {
    let list = []; try { list = typeof pages === 'string' ? JSON.parse(pages) : pages; } catch (_) {}
    if (!Array.isArray(list) || !list.length) return false;
    const body = list.map(x => `<section><img src="${String(x).replace(/"/g, '&quot;')}"></section>`).join('');
    return desktop.printHtml(`<!doctype html><html><head><meta charset="utf-8"><style>@page{margin:0}body{margin:0}section{page-break-after:always;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center}img{max-width:100%;max-height:100%;object-fit:contain}</style></head><body>${body}</body></html>`);
  },
  printBase64: (_name, _mime, data) => desktop.printHtml(dataUrlToHtml(data)),
  printHtml: html => desktop.printHtml(html),
  savePdfHtml: (name, html) => desktop.savePdfHtml(name, html),
  shareBase64: (name, mime, data) => desktop.saveData({ name, mime, data }),
  openExternal: url => desktop.openExternal(url),
  openAppSettings: () => Promise.resolve(false),
  getDeviceInfo: async () => {
    const info = await desktop.info();
    return mainWorldCall('AbuBassamNativeDeviceInfo', {
      name: info.hostname || 'Windows PC', model: 'Windows PC', manufacturer: '', os: 'Windows',
      windowsVersion: '', appVersion: info.appVersion, buildNumber: '432',
      cameraPermission: 'السكانر هو المصدر الأساسي', connection: 'هذا الجهاز'
    });
  },
  cleanCache: () => Promise.resolve(true),
  security: async (action, requestId, payload) => {
    try {
      const value = await invoke('desktop:security', { action, payload: payload || {} });
      await mainWorldCall('AbuBassamNativeSecurityResult', { requestId: String(requestId || ''), ok: true, value });
    } catch (error) {
      await mainWorldCall('AbuBassamNativeSecurityResult', { requestId: String(requestId || ''), ok: false, value: null, error: String(error?.message || error) });
    }
  },
  exitApp: () => window.close()
});

window.addEventListener('DOMContentLoaded', () => {
  try {
    const file = path.join(__dirname, 'desktop-shell.js');
    const source = fs.readFileSync(file, 'utf8');
    const script = document.createElement('script');
    script.id = 'abuWindowsDesktopShell'; script.textContent = source;
    (document.head || document.documentElement).appendChild(script);
  } catch (error) { console.error('Windows desktop shell failed:', error); }
});
