'use strict';
const { app, BrowserWindow, dialog, ipcMain, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');

const APP_VERSION = '4.3.2';
const SECURE_KEY = /^abu_bassam_[a-z0-9_]{3,80}$/i;
let mainWindow = null;
let settingsCache = null;

function resourcePath(name) {
  return app.isPackaged ? path.join(process.resourcesPath, name) : path.join(__dirname, name);
}
function settingsPath() { return path.join(app.getPath('userData'), 'desktop-settings.json'); }
function securePath() { return path.join(app.getPath('userData'), 'secure-store.json'); }
function readJson(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temp, file);
}
function settings() {
  if (!settingsCache) settingsCache = readJson(settingsPath(), {});
  return settingsCache;
}
function patchSettings(patch) {
  settingsCache = { ...settings(), ...patch };
  writeJson(settingsPath(), settingsCache);
  return settingsCache;
}
function safeName(value, fallback = 'Abu_Bassam_File') {
  return String(value || fallback).replace(/[\\/:*?"<>|]/g, '_').trim() || fallback;
}
function splitDataUrl(data) {
  const match = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/s.exec(String(data || ''));
  if (!match) throw new Error('صيغة الملف غير مدعومة');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 80 * 1024 * 1024) throw new Error('حجم الملف غير صالح');
  return { mime: match[1] || 'application/octet-stream', buffer };
}
function powershell(script, args = [], timeout = 90000) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', resourcePath(script), ...args],
      { windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) return reject(new Error(String(stderr || error.message || error).trim()));
        resolve(String(stdout || '').trim());
      });
  });
}
function secureReadAll() { return readJson(securePath(), {}); }
function secureWriteAll(value) { writeJson(securePath(), value); }
function secureSet(key, value) {
  if (!SECURE_KEY.test(key)) throw new Error('SECURE_KEY_INVALID');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('WINDOWS_SECURE_STORAGE_UNAVAILABLE');
  const text = String(value ?? '');
  if (Buffer.byteLength(text, 'utf8') > 128 * 1024) throw new Error('SECURE_VALUE_TOO_LARGE');
  const store = secureReadAll();
  store[key] = safeStorage.encryptString(text).toString('base64');
  secureWriteAll(store);
  return true;
}
function secureGet(key) {
  if (!SECURE_KEY.test(key)) throw new Error('SECURE_KEY_INVALID');
  const raw = secureReadAll()[key];
  if (!raw) return null;
  if (!safeStorage.isEncryptionAvailable()) throw new Error('WINDOWS_SECURE_STORAGE_UNAVAILABLE');
  return safeStorage.decryptString(Buffer.from(raw, 'base64'));
}
function secureDelete(key) {
  if (!SECURE_KEY.test(key)) throw new Error('SECURE_KEY_INVALID');
  const store = secureReadAll(); delete store[key]; secureWriteAll(store); return true;
}
async function listPrinters() {
  const printers = await mainWindow.webContents.getPrintersAsync();
  const selected = settings().printerName || '';
  return printers.map(p => ({
    name: p.name,
    displayName: p.displayName || p.name,
    description: p.description || '',
    status: Number(p.status || 0),
    isDefault: !!p.isDefault,
    selected: p.name === selected
  }));
}
async function printHtml(html) {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(String(html || ''))}`);
    await new Promise(r => setTimeout(r, 250));
    const deviceName = settings().printerName || '';
    return await new Promise((resolve, reject) => {
      win.webContents.print({ silent: !!deviceName, deviceName: deviceName || undefined, printBackground: true }, (ok, errorType) => {
        if (ok) resolve(true); else reject(new Error(errorType || 'PRINT_FAILED'));
      });
    });
  } finally { if (!win.isDestroyed()) win.destroy(); }
}
async function savePdfHtml(name, html) {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(String(html || ''))}`);
    const pdf = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
    const result = await dialog.showSaveDialog(mainWindow, { defaultPath: safeName(name, 'Abu_Bassam.pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (result.canceled || !result.filePath) return false;
    fs.writeFileSync(result.filePath, pdf); return true;
  } finally { if (!win.isDestroyed()) win.destroy(); }
}
async function listScanners() {
  const raw = await powershell('scanner.ps1', ['list']);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  const items = Array.isArray(parsed) ? parsed : [parsed];
  const selected = settings().scannerId || '';
  return items.filter(Boolean).map(s => ({ ...s, selected: s.id === selected }));
}
async function scanSelected(options = {}) {
  const scannerId = String(options.scannerId || settings().scannerId || '');
  if (!scannerId) throw new Error('لم يتم تحديد السكانر');
  const dpi = Math.max(75, Math.min(1200, Number(options.dpi || 300) || 300));
  const out = path.join(app.getPath('temp'), `abu-bassam-scan-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`);
  try {
    await powershell('scanner.ps1', ['scan', scannerId, out, String(dpi)], 120000);
    const buffer = fs.readFileSync(out);
    if (!buffer.length) throw new Error('لم ينتج السكانر صورة');
    return { dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`, mime: 'image/jpeg', scannerId, dpi };
  } finally { try { fs.unlinkSync(out); } catch (_) {} }
}
async function biometric(action, reason = '') {
  const raw = await powershell('windows-hello.ps1', [action, String(reason || 'مكتبة أبو بسام')], 45000);
  return raw ? JSON.parse(raw) : { available: false, enrolled: false, success: false };
}
function registerIpc() {
  ipcMain.handle('desktop:get-info', async () => ({
    platform: 'Windows', hostname: os.hostname(), appVersion: APP_VERSION,
    printerName: settings().printerName || '', scannerId: settings().scannerId || '',
    secureStorage: safeStorage.isEncryptionAvailable()
  }));
  ipcMain.handle('desktop:list-printers', listPrinters);
  ipcMain.handle('desktop:set-printer', async (_e, name) => {
    const printers = await listPrinters();
    if (name && !printers.some(p => p.name === name)) throw new Error('الطابعة غير موجودة');
    patchSettings({ printerName: String(name || '') }); return true;
  });
  ipcMain.handle('desktop:list-scanners', listScanners);
  ipcMain.handle('desktop:set-scanner', async (_e, id) => {
    const scanners = await listScanners();
    if (id && !scanners.some(s => s.id === id)) throw new Error('السكانر غير موجود');
    patchSettings({ scannerId: String(id || '') }); return true;
  });
  ipcMain.handle('desktop:scan', (_e, options) => scanSelected(options || {}));
  ipcMain.handle('desktop:save-data', async (_e, payload = {}) => {
    const parsed = splitDataUrl(payload.data);
    const result = await dialog.showSaveDialog(mainWindow, { defaultPath: safeName(payload.name), filters: payload.filters || [] });
    if (result.canceled || !result.filePath) return false;
    fs.writeFileSync(result.filePath, parsed.buffer); return true;
  });
  ipcMain.handle('desktop:print-html', (_e, html) => printHtml(html));
  ipcMain.handle('desktop:save-pdf-html', (_e, payload = {}) => savePdfHtml(payload.name, payload.html));
  ipcMain.handle('desktop:open-external', async (_e, url) => {
    const value = String(url || '');
    if (!/^(https?:|mailto:|tel:)/i.test(value)) throw new Error('الرابط غير مسموح');
    await shell.openExternal(value); return true;
  });
  ipcMain.handle('desktop:security', async (_e, { action, payload } = {}) => {
    const p = payload || {};
    if (action === 'secureGet') return secureGet(String(p.key || ''));
    if (action === 'secureSet') return secureSet(String(p.key || ''), p.value);
    if (action === 'secureDelete') return secureDelete(String(p.key || ''));
    if (action === 'biometricStatus') return biometric('status');
    if (action === 'biometricAuth') return biometric('verify', p.reason);
    throw new Error('SECURITY_ACTION_UNSUPPORTED');
  });
}
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700,
    show: false, backgroundColor: '#f4efe7',
    icon: resourcePath(path.join('build', 'icon.png')),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true,
      nodeIntegration: false, sandbox: false, webSecurity: true
    }
  });
  mainWindow.setMenuBarVisibility(false);
  const entry = app.isPackaged ? path.join(process.resourcesPath, 'web', 'index.html') : path.join(__dirname, '..', 'web', 'index.html');
  mainWindow.loadFile(entry);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}
app.setAppUserModelId('iq.abubassam.library.windows');
app.whenReady().then(() => { registerIpc(); createMainWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });
