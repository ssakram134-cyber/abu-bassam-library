import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Linking,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { registerRootComponent } from 'expo';
import { Camera, CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Print from 'expo-print';
import * as ScreenCapture from 'expo-screen-capture';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import { WebView } from 'react-native-webview';

const APP_URL = 'file:///android_asset/library/index.html';
const APP_VERSION = '4.3.2';
const BUILD_NUMBER = '432';
const STARTUP_WATCHDOG_MS = 12000;
const PRIVACY_CAPTURE_KEY = 'abu-bassam-private-screen';
const BARCODE_TYPES = [
  'qr', 'ean13', 'ean8', 'code128', 'code39', 'code93', 'upc_a', 'upc_e',
  'datamatrix', 'pdf417', 'aztec', 'codabar', 'itf14',
];
const SECURE_KEY = /^abu_bassam_[a-z0-9_]{3,80}$/i;

const MAX_NATIVE_MESSAGE_CHARS = 48 * 1024 * 1024;
const MAX_NATIVE_CAMERA_CHARS = 32 * 1024 * 1024;
const MAX_NATIVE_PAGE_CHARS = 40 * 1024 * 1024;
const MAX_NATIVE_PAGE_COUNT = 20;
const ANDROID_BRIDGE = `
(function () {
  var messageLimit = 48 * 1024 * 1024;
  var exportSequence = 0;
  var exportTypes = /^(saveBase64|saveToGallery|savePagesToGallery|savePdfHtml|printPages|printBase64|printHtml|shareBase64)$/;
  function send(type, payload) {
    try {
      var estimated = 0, data = payload || {};
      if (exportTypes.test(type)) data.requestId = 'abu-export-' + Date.now().toString(36) + '-' + (++exportSequence);
      for (var key in data) {
        if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
        var item = data[key];
        if (typeof item === 'string') estimated += item.length;
        else if (Array.isArray(item)) {
          if (item.length > 20) throw new Error('الدفعة تحتوي أكثر من 20 صفحة');
          for (var i = 0; i < item.length; i++) {
            if (typeof item[i] === 'string') estimated += item[i].length;
          }
        }
        if (estimated > messageLimit) throw new Error('حجم الصور كبير. احفظ أو اطبع دفعات أصغر لتجنب توقف التطبيق.');
      }
      var serialized = JSON.stringify(Object.assign(exportTypes.test(type) ? { type: type, requestId: data.requestId } : { type: type }, data));
      if (serialized.length > messageLimit) throw new Error('الملف أكبر من الحد الآمن للنقل إلى Android.');
      window.ReactNativeWebView.postMessage(serialized);
      return data.requestId || '';
    } catch (error) {
      try { window.alert('تعذر إرسال الملف إلى Android: ' + String(error.message || error)); } catch (_) {}
    }
  }
  window.AbuBassamNativeExportResult = function (result) {
    if (!result || typeof result !== 'object' || !/^abu-export-[a-z0-9-]{1,80}$/.test(String(result.requestId || ''))) return;
    try { window.dispatchEvent(new CustomEvent('abu-bassam-native-export-result', { detail: result })); } catch (_) {}
  };
  window.Android = {
    saveBase64: function (name, mime, data, shareAfter) { return send('saveBase64', { name: name, mime: mime, data: data, shareAfter: !!shareAfter }); },
    saveToGallery: function (name, mime, data, shareAfter) { return send('saveToGallery', { name: name, mime: mime, data: data, shareAfter: !!shareAfter }); },
    savePagesToGallery: function (prefix, pages, mime, shareIndex) { return send('savePagesToGallery', { prefix: prefix, pages: pages, mime: mime, shareIndex: Number.isInteger(shareIndex) ? shareIndex : -1 }); },
    printPages: function (pages, paper, dpi, shareAfter) { return send('printPages', { pages: pages, paper: paper, dpi: dpi, shareAfter: !!shareAfter }); },
    printBase64: function (name, mime, data, shareAfter) { return send('printBase64', { name: name, mime: mime, data: data, shareAfter: !!shareAfter }); },
    scanBarcodeImage: function (data) { send('scanBarcodeImage', { data: data }); },
    printHtml: function (html) { return send('printHtml', { html: html }); },
    savePdfHtml: function (name, html) { return send('savePdfHtml', { name: name, html: html }); },
    shareBase64: function (name, mime, data) { return send('shareBase64', { name: name, mime: mime, data: data }); },
    openExternal: function (url) { send('openExternal', { url: url }); },
    openAppSettings: function () { send('openAppSettings'); },
    getDeviceInfo: function () { send('getDeviceInfo'); },
    cleanCache: function () { send('cleanCache'); },
    security: function (action, requestId, payload) { send('security', { action: action, requestId: requestId, payload: payload || {} }); },
    exitApp: function () { send('exitApp'); }
  };
  window.__ABU_BASSAM_NATIVE_CAMERA__ = true;
  window.__ABU_BASSAM_NATIVE_SECURITY__ = true;
})();
true;
`;

function safeName(value) {
  return String(value || 'Abu_Bassam_File').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || 'Abu_Bassam_File';
}
function splitDataUrl(dataUrl) {
  const raw = String(dataUrl || '');
  const marker = ';base64,';
  const at = raw.indexOf(marker);
  if (!raw.startsWith('data:') || at < 6) throw new Error('صيغة الملف غير مدعومة');
  const mime = raw.slice(5, at).split(';')[0].trim().toLowerCase();
  const base64 = raw.slice(at + marker.length);
  if (!/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i.test(mime)
      || !base64 || base64.length % 4 !== 0 || !/^[a-z0-9+/]+={0,2}$/i.test(base64)) {
    throw new Error('بيانات الملف غير صالحة أو غير مكتملة');
  }
  return { mime, base64 };
}
// A failed SAF write must not leave behind an empty or truncated user document.
async function writeSafFile(directoryUri, displayName, mime, base64) {
  const saf = FileSystem.StorageAccessFramework;
  const uri = await saf.createFileAsync(directoryUri, displayName, mime);
  try {
    await saf.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    return uri;
  } catch (error) {
    await saf.deleteAsync(uri, { idempotent: true }).catch(() => {});
    throw error;
  }
}

async function runNativeExport(busyRef, task) {
  if (busyRef.current) {
    Alert.alert('عملية حفظ أو طباعة جارية', 'أكمل العملية الحالية قبل طلب طباعة أو حفظ ملف آخر، لتجنب تجمّد الهاتف.');
    return false;
  }
  busyRef.current = true;
  try { return await task(); }
  catch (error) {
    Alert.alert('تعذرت معالجة الملف', String(error?.message || error));
    return false;
  }
  finally { busyRef.current = false; }
}

function printDimensions(paper) {
  if (paper === 'A5') return { width: 148, height: 210 };
  if (paper === 'A6') return { width: 105, height: 148 };
  if (paper === '10x15') return { width: 100, height: 150 };
  if (String(paper || '').startsWith('CUSTOM:')) {
    const parts = String(paper).split(':');
    const width = Number(parts[1]);
    const height = Number(parts[2]);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 && width <= 3000 && height <= 3000) return { width, height };
  }
  return { width: 210, height: 297 };
}
function nativeDeviceInfo(cameraPermission) {
  const constants = Platform.constants || {};
  const model = String(constants.Model || constants.model || 'Android');
  const manufacturer = String(constants.Manufacturer || constants.manufacturer || '').trim();
  return {
    name: manufacturer ? `${manufacturer} ${model}`.trim() : model,
    model,
    manufacturer,
    os: Platform.OS,
    androidVersion: String(Platform.Version),
    appVersion: APP_VERSION,
    buildNumber: BUILD_NUMBER,
    cameraPermission: cameraPermission?.granted
      ? 'مسموح'
      : cameraPermission?.canAskAgain === false
        ? 'مرفوض — افتح إعدادات النظام'
        : 'يُطلب عند الاستخدام',
    connection: 'هذا الجهاز',
  };
}

function App() {
  const webRef = useRef(null);
  const nativeExportBusyRef = useRef(false);
  const cameraRef = useRef(null);
  const barcodeScanLockRef = useRef(false);
  const cameraCaptureLockRef = useRef(false);
  const cameraSessionEpochRef = useRef(0);
  const cameraActiveRef = useRef(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [cameraMode, setCameraMode] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [barcodeLocked, setBarcodeLocked] = useState(false);
  const [torch, setTorch] = useState(false);
  const [cameraFacing, setCameraFacing] = useState('back');
  const [cameraFrameKind, setCameraFrameKind] = useState('paper');
  const [webReady, setWebReady] = useState(false);
  const [webAttempt, setWebAttempt] = useState(0);
  const [webFailure, setWebFailure] = useState('');

  const inject = useCallback((functionName, payload) => {
    const json = JSON.stringify(payload).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    webRef.current?.injectJavaScript(`if (typeof window.${functionName} === 'function') window.${functionName}(${json}); true;`);
  }, []);
  const replySecurity = useCallback((requestId, ok, value, error) => {
    inject('AbuBassamNativeSecurityResult', { requestId: String(requestId || ''), ok: !!ok, value: value ?? null, error: error ? String(error) : '' });
  }, [inject]);
  const cameraError = useCallback((message) => inject('AbuBassamNativeCameraError', String(message || 'تعذر تشغيل الكاميرا.')), [inject]);
  const closeCamera = useCallback(() => {
    cameraSessionEpochRef.current += 1;
    cameraActiveRef.current = false;
    cameraCaptureLockRef.current = false;
    barcodeScanLockRef.current = false;
    setCameraMode(null); setCameraReady(false); setCameraBusy(false); setBarcodeLocked(false); setTorch(false); setCameraFacing('back'); setCameraFrameKind('paper');
  }, []);

  useEffect(() => {
    if (webReady || webFailure) return undefined;
    const timer = setTimeout(() => {
      setWebFailure('لم تكتمل طبقات الأمان والواجهة خلال المهلة المحددة. اضغط إعادة المحاولة؛ لا يُشترط اتصال بالإنترنت لتشغيل التطبيق.');
    }, STARTUP_WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [webReady, webFailure, webAttempt]);

  const retryWebBoot = useCallback(() => {
    setWebReady(false);
    setWebFailure('');
    setWebAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (cameraMode) { closeCamera(); return true; }
      if (!webReady) return false;
      inject('AbuBassamNativeBackPress', { source: 'hardware', at: Date.now() });
      return true;
    });
    return () => subscription.remove();
  }, [cameraMode, closeCamera, inject, webReady]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (webReady) inject('AbuBassamNativeAppState', { state, at: Date.now() });
    });
    return () => subscription.remove();
  }, [inject, webReady]);

  const openCamera = useCallback(async (mode, frameKind = 'paper') => {
    // Invalidates pending permission requests from previous camera sessions.
    const epoch = ++cameraSessionEpochRef.current;
    try {
      let permission = cameraPermission;
      if (!permission?.granted) permission = await requestCameraPermission();
      if (epoch !== cameraSessionEpochRef.current) return;
      if (!permission?.granted) { cameraError('يجب منح إذن الكاميرا حتى يعمل المسح الضوئي وقارئ الباركود.'); return; }
      cameraCaptureLockRef.current = false;
      barcodeScanLockRef.current = false;
      cameraActiveRef.current = true;
      setCameraReady(false); setCameraBusy(false); setBarcodeLocked(false); setTorch(false); setCameraFacing('back');
      setCameraFrameKind(['card','photo','paper'].includes(frameKind) ? frameKind : 'paper');
      setCameraMode(['barcode','maker','cardPhoto','ocr'].includes(mode) ? mode : 'scan');
    } catch (_) {
      if (epoch === cameraSessionEpochRef.current)
        cameraError('تعذر طلب إذن الكاميرا. افتح معلومات التطبيق وفعّل إذن الكاميرا.');
    }
  }, [cameraError, cameraPermission, requestCameraPermission]);

  const captureDocument = useCallback(async () => {
    // React state is not an immediate lock: two taps can occur before re-render.
    if (!cameraReady || !cameraActiveRef.current || cameraCaptureLockRef.current || !cameraRef.current) return;
    const epoch = cameraSessionEpochRef.current;
    cameraCaptureLockRef.current = true;
    setCameraBusy(true);
    try {
      const picture = await cameraRef.current.takePictureAsync({ base64: true, exif: false, quality: 1, skipProcessing: false });
      // A closed or replaced camera must never inject an old photograph.
      if (epoch !== cameraSessionEpochRef.current) return;
      if (!picture?.base64) throw new Error('لم تُحفظ الصورة');
      if (picture.base64.length > MAX_NATIVE_CAMERA_CHARS)
        throw new Error('الصورة كبيرة جداً لهذا الجهاز. قلّل دقة الكاميرا من إعدادات الهاتف ثم أعد الالتقاط.');
      const mode = ['maker','cardPhoto','ocr'].includes(cameraMode) ? cameraMode : 'scan';
      closeCamera();
      inject('AbuBassamNativeCameraResult', { mode, dataUrl: 'data:image/jpeg;base64,' + picture.base64 });
    } catch (error) {
      if (epoch === cameraSessionEpochRef.current) {
        setCameraBusy(false);
        cameraError(String(error?.message || 'تعذر التقاط الصورة. أعد فتح الكاميرا وحاول مرة أخرى.'));
      }
    } finally {
      if (epoch === cameraSessionEpochRef.current) cameraCaptureLockRef.current = false;
    }
  }, [cameraError, cameraMode, cameraReady, closeCamera, inject]);

  const onBarcodeScanned = useCallback((result) => {
    if (barcodeScanLockRef.current || !result?.data) return;
    // Expo Camera can emit multiple scan events before React rerenders.
    // Keep a synchronous lock until the camera session is explicitly reset.
    barcodeScanLockRef.current = true;
    setBarcodeLocked(true);
    cameraActiveRef.current = false;
    cameraSessionEpochRef.current += 1;
    setCameraMode(null); setCameraReady(false); setCameraBusy(false); setTorch(false); setCameraFacing('back'); setCameraFrameKind('paper');
    inject('AbuBassamNativeCameraResult', { mode: 'barcode', data: String(result.data), barcodeType: result.type || '' });
  }, [inject]);
  const onCameraMountError = useCallback(() => { closeCamera(); cameraError('تعذر تشغيل الكاميرا الخلفية على هذا الجهاز.'); }, [cameraError, closeCamera]);

  const saveBase64 = useCallback(async ({ name, mime, data, shareAfter }) => {
    try {
      const parsed = splitDataUrl(data), finalMime = mime || parsed.mime, finalName = safeName(name);
      const dot = finalName.lastIndexOf('.'), displayName = dot > 0 ? finalName.slice(0, dot) : finalName;
      const initialUri = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Download');
      const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri);
      if (!permission.granted) return false;
      await writeSafFile(permission.directoryUri, displayName, finalMime, parsed.base64);
      if (!shareAfter) Alert.alert('تم الحفظ', `تم حفظ ${finalName} بنجاح.`);
      return true;
    } catch (error) { Alert.alert('تعذر الحفظ', String(error?.message || error)); return false; }
  }, []);

  const saveToGallery = useCallback(async ({ name, mime, data, shareAfter }) => {
    try {
      const parsed = splitDataUrl(data), finalMime = mime || parsed.mime;
      if (!String(finalMime).startsWith('image/')) throw new Error('هذا الملف ليس صورة');
      const finalName = safeName(name || `Abu_Bassam_${Date.now()}.png`), dot = finalName.lastIndexOf('.'), displayName = dot > 0 ? finalName.slice(0, dot) : finalName;
      const initialUri = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Pictures');
      const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri);
      if (!permission.granted) return false;
      await writeSafFile(permission.directoryUri, displayName, finalMime, parsed.base64);
      if (!shareAfter) Alert.alert('تم الحفظ في المعرض', `تم حفظ ${finalName} داخل مجلد الصور الذي اخترته.`);
      return true;
    } catch (error) { Alert.alert('تعذر الحفظ في المعرض', String(error?.message || error)); return false; }
  }, []);

  const savePagesToGallery = useCallback(async ({ prefix, pages, mime, shareIndex }) => {
    try {
      const imagePages = typeof pages === 'string' ? JSON.parse(pages) : pages;
      if (!Array.isArray(imagePages) || !imagePages.length) throw new Error('لا توجد صور للحفظ');
      if (imagePages.length > 20) throw new Error('عدد الصور أكبر من الحد المسموح');
      const initialUri = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Pictures');
      const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri);
      if (!permission.granted) return { saved: 0, savedIndexes: [] };
      let saved = 0, failed = 0, savedIndexes = [];
      for (let index = 0; index < imagePages.length; index += 1) {
        try {
          const raw = String(imagePages[index] || '');
          if (!raw.startsWith('data:image/')) throw new Error('صيغة الصورة غير مدعومة');
          const parsed = splitDataUrl(raw);
          const itemMime = String(parsed.mime || mime || 'image/jpeg');
          if (!itemMime.startsWith('image/')) throw new Error('صيغة الصورة غير مدعومة');
          const encodedNameMatch = raw.match(/;name=([^;]+);base64,/i);
          let requestedName = '';
          if (encodedNameMatch) {
            try { requestedName = decodeURIComponent(encodedNameMatch[1]); } catch (_) { requestedName = encodedNameMatch[1]; }
          }
          const fallbackName = safeName(prefix || 'Abu_Bassam_Page') + '_' + (index + 1) + '_' + Date.now();
          const finalName = safeName(requestedName || fallbackName);
          const dot = finalName.lastIndexOf('.');
          const displayName = dot > 0 ? finalName.slice(0, dot) : finalName;
          await writeSafFile(permission.directoryUri, displayName, itemMime, parsed.base64);
          saved += 1; savedIndexes.push(index);
        } catch (_) { failed += 1; }
      }
      if (!saved) throw new Error('تعذر حفظ الصور المحددة');
      if (!Number.isInteger(shareIndex) || shareIndex < 0 || !savedIndexes.includes(shareIndex)) Alert.alert('تم الحفظ في المعرض', failed ? 'تم حفظ ' + saved + ' صورة وتعذر حفظ ' + failed + '.' : 'تم حفظ ' + saved + ' صورة داخل المجلد الذي اخترته.');
      return { saved, savedIndexes };
    } catch (error) { Alert.alert('تعذر حفظ الصفحات', String(error?.message || error)); return { saved: 0, savedIndexes: [] }; }
  }, []);

  const printPages = useCallback(async ({ pages, paper, shareAfter }) => {
    try {
      if (typeof pages === 'string' && pages.length > MAX_NATIVE_PAGE_CHARS) throw new Error('حجم الصور كبير؛ اطبع دفعات أصغر');
      const imagePages = typeof pages === 'string' ? JSON.parse(pages) : pages;
      if (!Array.isArray(imagePages) || !imagePages.length) throw new Error('لا توجد صفحات للطباعة');
      if (imagePages.length > MAX_NATIVE_PAGE_COUNT) throw new Error('عدد صفحات الطباعة يتجاوز 20 ورقة؛ اطبع دفعات أصغر');
      let totalCharacters = 0;
      for (const source of imagePages) {
        if (typeof source !== 'string' || !/^data:image\/(png|jpeg|webp)(?:;[^,]*)?;base64,/i.test(source))
          throw new Error('إحدى صفحات الطباعة ليست صورة صالحة');
        totalCharacters += source.length;
        if (source.length > 11_200_000 || totalCharacters > MAX_NATIVE_PAGE_CHARS)
          throw new Error('حجم الصور كبير؛ اطبع دفعات أصغر');
      }
      const size = printDimensions(paper);
      const body = imagePages.map((src) => `<section><img alt="صفحة للطباعة" src="${String(src).replace(/"/g, '&quot;')}"></section>`).join('');
      const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>@page{size:${size.width}mm ${size.height}mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}section{width:${size.width}mm;height:${size.height}mm;margin:0;page-break-after:always;display:flex;align-items:center;justify-content:center;overflow:hidden}section:last-child{page-break-after:auto}img{width:100%;height:100%;object-fit:contain;display:block}</style></head><body>${body}</body></html>`;
      await Print.printAsync({ html });
      if (shareAfter) {
        let temporaryPdfUri = '';
        try {
          if (!(await Sharing.isAvailableAsync())) throw new Error('مشاركة Android غير متاحة');
          const generated = await Print.printToFileAsync({ html });
          temporaryPdfUri = String(generated.uri || '');
          if (!temporaryPdfUri) throw new Error('تعذر تجهيز ملف المشاركة');
          await Sharing.shareAsync(temporaryPdfUri, { mimeType: 'application/pdf', dialogTitle: 'مشاركة نسخة من صفحات الطباعة' });
        } catch (shareError) {
          Alert.alert('تعذرت المشاركة بعد الطباعة', String(shareError?.message || shareError));
        } finally {
          if (temporaryPdfUri && FileSystem.cacheDirectory && temporaryPdfUri.startsWith(FileSystem.cacheDirectory)) {
            await FileSystem.deleteAsync(temporaryPdfUri, { idempotent: true }).catch(() => {});
          }
        }
      }
      return true;
    } catch (error) { Alert.alert('تعذرت الطباعة', String(error?.message || error)); return false; }
  }, []);

  const printHtml = useCallback(async ({ html }) => {
    try { if (!String(html || '').trim()) throw new Error('لا توجد كروت للطباعة'); await Print.printAsync({ html: String(html) }); }
    catch (error) { Alert.alert('تعذرت الطباعة', String(error?.message || error)); }
  }, []);

  const savePdfHtml = useCallback(async ({ name, html }) => {
    let temporaryPdfUri = '';
    try {
      if (!String(html || '').trim()) throw new Error('لا توجد كروت لحفظها');
      const result = await Print.printToFileAsync({ html: String(html), base64: true });
      temporaryPdfUri = String(result.uri || '');
      const base64 = result.base64 || await FileSystem.readAsStringAsync(result.uri, { encoding: FileSystem.EncodingType.Base64 });
      const finalName = safeName(name || `Abu_Bassam_Cards_${Date.now()}.pdf`), dot = finalName.lastIndexOf('.'), displayName = dot > 0 ? finalName.slice(0, dot) : finalName;
      const initialUri = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Download');
      const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri);
      if (!permission.granted) return;
      await writeSafFile(permission.directoryUri, displayName, 'application/pdf', base64);
      Alert.alert('تم حفظ PDF', `تم حفظ ${finalName} بأعلى جودة متاحة.`);
    } catch (error) { Alert.alert('تعذر حفظ PDF', String(error?.message || error)); }
    finally {
      if (temporaryPdfUri && FileSystem.cacheDirectory && temporaryPdfUri.startsWith(FileSystem.cacheDirectory)) {
        await FileSystem.deleteAsync(temporaryPdfUri, { idempotent: true }).catch(() => {});
      }
    }
  }, []);

  const writeTemporaryFile = useCallback(async (name, mime, data) => {
    const parsed = splitDataUrl(data), finalName = safeName(name);
    if (!FileSystem.cacheDirectory) throw new Error('مجلد الملفات المؤقتة غير متاح');
    // Two simultaneous print/share requests must never overwrite one another.
    const uri = `${FileSystem.cacheDirectory}abu_bassam_${Date.now()}_${Math.random().toString(36).slice(2)}_${finalName}`;
    try {
      await FileSystem.writeAsStringAsync(uri, parsed.base64, { encoding: FileSystem.EncodingType.Base64 });
      return { uri, name: finalName, type: mime || parsed.mime };
    } catch (error) {
      // A failed native write may already have created a partial cache file.
      try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch (_) {}
      throw error;
    }
  }, []);

  const printBase64 = useCallback(async ({ name, mime, data }) => {
    try {
      const parsed = splitDataUrl(data);
      const finalMime = String(mime || parsed.mime).trim().toLowerCase();
      if (finalMime.startsWith('image/')) {
        if (!parsed.mime.startsWith('image/')) throw new Error('نوع الصورة لا يطابق بيانات الملف');
        const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:8mm}html,body{margin:0}body{display:flex;align-items:center;justify-content:center;min-height:270mm}img{max-width:100%;max-height:270mm;object-fit:contain}</style></head><body><img src="${String(data).replace(/"/g, '&quot;')}"></body></html>`;
        await Print.printAsync({ html }); return true;
      }
      // expo-print accepts a URI only for PDF files, never for DOCX/XLSX/ZIP or text.
      // Fail before writing a temporary file, so unsupported print requests cannot
      // launch Android's PDF printer with incompatible file contents.
      if (finalMime !== 'application/pdf' || parsed.mime !== 'application/pdf') {
        throw new Error('الطباعة المباشرة متاحة لملفات PDF والصور فقط. احفظ ملف Word أو Excel وافتحه في التطبيق المناسب للطباعة.');
      }
      const file = await writeTemporaryFile(name, finalMime, data);
      try { await Print.printAsync({ uri: file.uri }); } finally { await FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => {}); }
      return true;
    } catch (error) { Alert.alert('تعذرت الطباعة', String(error?.message || error)); return false; }
  }, [writeTemporaryFile]);

  const openExternal = useCallback(async ({ url }) => {
    try {
      const value = String(url || '').trim();
      if (!/^(https:|tel:|mailto:|tg:|whatsapp:)/i.test(value)) throw new Error('الرابط غير مسموح');
      if (!(await Linking.canOpenURL(value))) throw new Error('لا يوجد تطبيق مناسب لفتح هذا الرابط');
      await Linking.openURL(value);
    } catch (error) { Alert.alert('تعذر فتح الرابط', String(error?.message || error)); }
  }, []);

  const shareBase64 = useCallback(async ({ name, mime, data }) => {
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error('المشاركة غير متاحة على هذا الجهاز');
      const file = await writeTemporaryFile(name, mime, data);
      try { await Sharing.shareAsync(file.uri, { mimeType: file.type, dialogTitle: 'حفظ أو مشاركة الملف' }); }
      finally { await FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => {}); }
    } catch (error) { Alert.alert('تعذرت المشاركة', String(error?.message || error)); }
  }, [writeTemporaryFile]);

  const openAppSettings = useCallback(async () => {
    try { await Linking.openSettings(); }
    catch (_) { Alert.alert('تعذر فتح الإعدادات', 'افتح إعدادات Android ثم اختر تطبيق مكتبة أبو بسام.'); }
  }, []);
  const getDeviceInfo = useCallback(() => inject('AbuBassamNativeDeviceInfo', nativeDeviceInfo(cameraPermission)), [cameraPermission, inject]);
  const cleanCache = useCallback(async () => {
    try {
      const root = FileSystem.cacheDirectory;
      if (!root) throw new Error('مجلد الملفات المؤقتة غير متاح');
      const entries = await FileSystem.readDirectoryAsync(root);
      const generated = entries.filter((name) => (name.startsWith('abu_bassam_') || name.startsWith('abu_barcode_gallery_')) && !name.includes('/') && !name.includes('\\'));
      // Keep each deletion independent so the displayed result matches reality.
      const outcomes = await Promise.allSettled(generated.map((name) => FileSystem.deleteAsync(`${root}${name}`, { idempotent: true })));
      const removed = outcomes.filter((result) => result.status === 'fulfilled').length;
      const failed = outcomes.length - removed;
      Alert.alert(failed ? 'تنظيف جزئي' : 'تم التنظيف',
        failed ? `حُذف ${removed} ملف مؤقت، وتعذر حذف ${failed}. لم تُحذف ملفاتك.` : `حُذف ${removed} ملف مؤقت فقط. لم تُحذف ملفاتك.`);
    } catch (error) { Alert.alert('تعذر التنظيف', String(error?.message || error)); }
  }, []);

  const handleSecurity = useCallback(async (message) => {
    const action = String(message.action || ''), requestId = String(message.requestId || ''), payload = message.payload && typeof message.payload === 'object' ? message.payload : {};
    const safeKey = () => { const key = String(payload.key || ''); if (!SECURE_KEY.test(key)) throw new Error('مفتاح التخزين الآمن غير مسموح'); return key; };
    try {
      if (action === 'secureGet') return replySecurity(requestId, true, await SecureStore.getItemAsync(safeKey()) || '');
      if (action === 'secureSet') { await SecureStore.setItemAsync(safeKey(), String(payload.value || '')); return replySecurity(requestId, true, true); }
      if (action === 'secureDelete') { await SecureStore.deleteItemAsync(safeKey()); return replySecurity(requestId, true, true); }
      if (action === 'deviceInfo') return replySecurity(requestId, true, nativeDeviceInfo(cameraPermission));
      if (action === 'biometricStatus') {
        const [available, enrolled, types] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync(), LocalAuthentication.supportedAuthenticationTypesAsync()]);
        return replySecurity(requestId, true, { available, enrolled, types });
      }
      if (action === 'biometricAuth') {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: String(payload.reason || 'افتح مكتبة أبو بسام'), cancelLabel: 'إلغاء', fallbackLabel: 'استخدام قفل الهاتف', disableDeviceFallback: false, biometricsSecurityLevel: 'strong',
        });
        return replySecurity(requestId, true, { success: !!result.success, error: result.error || '' });
      }
      if (action === 'privacyMode') {
        const enabled = !!payload.enabled;
        if (enabled) await ScreenCapture.preventScreenCaptureAsync(PRIVACY_CAPTURE_KEY);
        else await ScreenCapture.allowScreenCaptureAsync(PRIVACY_CAPTURE_KEY);
        return replySecurity(requestId, true, { enabled });
      }
      throw new Error('عملية الأمان غير معروفة');
    } catch (error) { replySecurity(requestId, false, null, error?.message || error); }
  }, [cameraPermission, replySecurity]);

  const scanBarcodeImage = useCallback(async ({ data }) => {
    let uri = null;
    try {
      const raw = String(data || '');
      if (raw.length > 11_200_000 || !/^data:image\/(png|jpeg|webp);base64,/i.test(raw)) throw new Error('صيغة الصورة غير مدعومة أو حجمها أكبر من 8MB');
      const parsed = splitDataUrl(raw);
      const suffix = parsed.mime === 'image/png' ? 'png' : parsed.mime === 'image/webp' ? 'webp' : 'jpg';
      uri = FileSystem.cacheDirectory + 'abu_barcode_gallery_' + Date.now() + '.' + suffix;
      await FileSystem.writeAsStringAsync(uri, parsed.base64, { encoding: FileSystem.EncodingType.Base64 });
      const matches = await Camera.scanFromURLAsync(uri, BARCODE_TYPES);
      const first = matches?.find(item => typeof item.data === 'string' && item.data.length > 0);
      inject('AbuBassamNativeBarcodeImageResult', first ? { data: first.data, barcodeType: first.type || 'qr' } : { error: 'لم يتم العثور على باركود؛ قص الصورة ليملأ الرمز معظم مساحتها.' });
    } catch (error) {
      inject('AbuBassamNativeBarcodeImageResult', { error: String(error?.message || 'تعذرت قراءة صورة الباركود') });
    } finally {
      if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }
  }, [inject]);

  const onWebMessage = useCallback(async (event) => {
    const raw = event?.nativeEvent?.data;
    if (typeof raw !== 'string') return;
    // Reject large messages before JSON.parse creates another copy in memory.
    if (raw.length > MAX_NATIVE_MESSAGE_CHARS) {
      Alert.alert('الملف كبير جداً', 'قسّم الصور إلى دفعات أصغر أو استخدم ملفاً مضغوطاً للطباعة.');
      return;
    }
    // The bundled bridge writes "type" first. While a native export is
    // running, reject another heavy request before JSON.parse duplicates its
    // Base64 payload in memory. A missing type on a large message also fails
    // closed, but ordinary security/device messages remain responsive.
    if (nativeExportBusyRef.current) {
      const declaredType = /^\s*\{\s*"type"\s*:\s*"([A-Za-z][A-Za-z0-9]*)"\s*[,}]/.exec(raw.slice(0, 128))?.[1];
      const heavyType = /^(?:scanBarcodeImage|saveBase64|saveToGallery|savePagesToGallery|printPages|printBase64|printHtml|savePdfHtml|shareBase64|cleanCache)$/;
      if (heavyType.test(declaredType || '') || (raw.length > 1024 && !declaredType)) {
        Alert.alert('عملية حفظ أو طباعة جارية', 'أكمل العملية الحالية قبل إرسال ملف جديد إلى Android.');
        return false;
      }
    }
    let message; try { message = JSON.parse(raw); } catch (_) { return; }
    if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') return;
    if (message.type === 'webBootReady') { setWebFailure(''); setWebReady(true); return; }
    if (message.type === 'openCamera') return openCamera(message.mode, message.frameKind);
    if (message.type === 'scanBarcodeImage') return runNativeExport(nativeExportBusyRef, () => scanBarcodeImage(message));
    if (message.type === 'saveBase64') return runNativeExport(nativeExportBusyRef, async () => {
      const saved = await saveBase64(message);
      if (saved === true && message.shareAfter) await shareBase64(message);
      return saved;
    });
    if (message.type === 'saveToGallery') return runNativeExport(nativeExportBusyRef, async () => {
      const saved = await saveToGallery(message);
      if (saved === true && message.shareAfter) await shareBase64(message);
      return saved;
    });
    if (message.type === 'savePagesToGallery') return runNativeExport(nativeExportBusyRef, async () => {
      const result = await savePagesToGallery(message);
      const index = message.shareIndex;
      if (Number.isInteger(index) && index >= 0 && result?.savedIndexes?.includes(index)) {
        const items = Array.isArray(message.pages) ? message.pages : JSON.parse(message.pages);
        const data = items[index];
        const parsedMime = /^data:(image\/(?:png|jpeg|webp))/i.exec(String(data || ''))?.[1] || 'image/jpeg';
        const ext = parsedMime === 'image/png' ? 'png' : parsedMime === 'image/webp' ? 'webp' : 'jpg';
        await shareBase64({ name: `Abu_Bassam_Page_${index + 1}.${ext}`, mime: parsedMime, data });
      }
      return result;
    });
    if (message.type === 'printPages') return runNativeExport(nativeExportBusyRef, () => printPages(message));
    if (message.type === 'printBase64') return runNativeExport(nativeExportBusyRef, async () => {
      const printed = await printBase64(message);
      if (printed === true && message.shareAfter) await shareBase64(message);
      return printed;
    });
    if (message.type === 'printHtml') return runNativeExport(nativeExportBusyRef, () => printHtml(message));
    if (message.type === 'savePdfHtml') return runNativeExport(nativeExportBusyRef, () => savePdfHtml(message));
    if (message.type === 'shareBase64') return runNativeExport(nativeExportBusyRef, () => shareBase64(message));
    if (message.type === 'openExternal') return openExternal(message);
    if (message.type === 'openAppSettings') return openAppSettings();
    if (message.type === 'getDeviceInfo') return getDeviceInfo();
    if (message.type === 'cleanCache') return runNativeExport(nativeExportBusyRef, () => cleanCache());
    if (message.type === 'security') return handleSecurity(message);
    if (message.type === 'exitApp') return BackHandler.exitApp();
  }, [cleanCache, getDeviceInfo, handleSecurity, openAppSettings, openCamera, openExternal, scanBarcodeImage, printBase64, printHtml, printPages, saveBase64, savePdfHtml, savePagesToGallery, saveToGallery, shareBase64]);

  const barcodeMode = cameraMode === 'barcode';
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle={cameraMode ? 'light-content' : 'dark-content'} backgroundColor={cameraMode ? '#000000' : '#fffaf3'} />
      <WebView
        key={webAttempt} ref={webRef} source={{ uri: APP_URL }} style={styles.webView} originWhitelist={['file://*','about:*']} javaScriptEnabled domStorageEnabled
        allowFileAccess allowFileAccessFromFileURLs allowUniversalAccessFromFileURLs mixedContentMode="never"
        setSupportMultipleWindows={false} mediaPlaybackRequiresUserAction={false}
        onShouldStartLoadWithRequest={(request) => {
          const url = String(request?.url || '');
          if (url.startsWith('file:///android_asset/library/') || url === 'about:blank') return true;
          if (/^(https:|tel:|mailto:|tg:|whatsapp:)/i.test(url)) Linking.openURL(url).catch(() => {});
          return false;
        }}
        injectedJavaScriptBeforeContentLoaded={ANDROID_BRIDGE} injectedJavaScript={ANDROID_BRIDGE} onMessage={onWebMessage}
        onError={() => { setWebReady(false); setWebFailure('تعذر تحميل واجهة مكتبة أبو بسام. يمكنك إعادة المحاولة دون إغلاق التطبيق.'); }}
      />
      {!webReady && <View style={styles.loading}>
        {webFailure ? (
          <>
            <Text accessibilityRole="alert" style={styles.loadingError}>{webFailure}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={retryWebBoot} accessibilityRole="button" accessibilityLabel="إعادة محاولة تشغيل التطبيق">
              <Text style={styles.retryButtonText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </>
        ) : (
          <><ActivityIndicator size="large" color="#76533e" /><Text style={styles.loadingText}>جاري فتح مكتبة أبو بسام…</Text></>
        )}
      </View>}
      {cameraMode && (
        <View style={styles.cameraOverlay}>
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={cameraFacing} enableTorch={cameraFacing === 'back' && torch}
            onCameraReady={() => setCameraReady(true)} onMountError={onCameraMountError}
            barcodeScannerSettings={barcodeMode ? { barcodeTypes: BARCODE_TYPES } : undefined}
            onBarcodeScanned={barcodeMode && !barcodeLocked ? onBarcodeScanned : undefined} />
          <View style={styles.cameraShade} pointerEvents="box-none">
            <View style={styles.cameraHeader}>
              <TouchableOpacity style={styles.roundButton} onPress={closeCamera} accessibilityLabel="إغلاق الكاميرا"><Text style={styles.roundButtonText}>×</Text></TouchableOpacity>
              <Text style={styles.cameraTitle}>{barcodeMode ? 'قارئ الباركود' : cameraMode === 'maker' ? 'صانع الهوية' : cameraMode === 'cardPhoto' ? 'صورة الكارت' : cameraMode === 'ocr' ? 'تحويل الصورة إلى نص' : 'المسح الضوئي'}</Text>
              <View style={styles.cameraActions}>
                <TouchableOpacity style={styles.roundButton} onPress={() => { setCameraReady(false); setTorch(false); setCameraFacing((value) => value === 'back' ? 'front' : 'back'); }} accessibilityLabel="تبديل الكاميرا"><Text style={styles.flipText}>↻</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.roundButton, cameraFacing !== 'back' && styles.roundButtonDisabled]} onPress={() => cameraFacing === 'back' && setTorch((value) => !value)} disabled={cameraFacing !== 'back'} accessibilityLabel="الفلاش"><Text style={styles.flashText}>{torch ? '☀' : 'ϟ'}</Text></TouchableOpacity>
              </View>
            </View>
            <View style={barcodeMode ? styles.barcodeFrame : cameraFrameKind === 'card' ? styles.cardDocumentFrame : cameraFrameKind === 'photo' ? styles.photoDocumentFrame : styles.documentFrame} />
            <Text style={styles.cameraHint}>{barcodeMode ? 'وجّه الكاميرا نحو الباركود وسيُقرأ تلقائيًا' : cameraMode === 'cardPhoto' ? 'ضع الوجه داخل الإطار ثم اضغط زر التصوير' : cameraMode === 'ocr' ? 'صوّر النص بوضوح وبإضاءة جيدة' : 'ضع المستند داخل الإطار؛ سيُحلل ويُقص محليًا بعد الالتقاط'}</Text>
            {!barcodeMode && <TouchableOpacity style={[styles.shutter, (!cameraReady || cameraBusy) && styles.shutterDisabled]} onPress={captureDocument} disabled={!cameraReady || cameraBusy} accessibilityLabel="التقاط الصورة">{cameraBusy ? <ActivityIndicator color="#087f72" /> : <View style={styles.shutterInner} />}</TouchableOpacity>}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fffaf3' }, webView: { flex: 1, backgroundColor: '#fffaf3' },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffaf3' },
  loadingText: { color: '#5b4438', fontSize: 15, fontWeight: '700', marginTop: 14 },
  loadingError: { color: '#812c26', fontSize: 15, fontWeight: '700', textAlign: 'center', paddingHorizontal: 26, lineHeight: 25 },
  retryButton: { marginTop: 20, minHeight: 52, minWidth: 170, borderRadius: 12, paddingHorizontal: 24, backgroundColor: '#76533e', alignItems: 'center', justifyContent: 'center' },
  retryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cameraOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 100, elevation: 100, backgroundColor: '#000' },
  cameraShade: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 38 },
  cameraHeader: { width: '100%', paddingTop: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  cameraTitle: { color: '#fff', fontSize: 18, fontWeight: '900', backgroundColor: '#0008', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20 },
  cameraActions: { flexDirection: 'row', gap: 7 }, roundButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center' },
  roundButtonDisabled: { opacity: 0.45 }, roundButtonText: { color: '#fff', fontSize: 32, lineHeight: 35 }, flipText: { color: '#fff', fontSize: 27, fontWeight: '800' }, flashText: { color: '#fff', fontSize: 25, fontWeight: '800' },
  documentFrame: { width: '91%', aspectRatio: 0.72, maxHeight: '66%', borderWidth: 3, borderColor: '#fff', borderRadius: 15, backgroundColor: '#00000010' },
  cardDocumentFrame: { width: '91%', aspectRatio: 1.585, maxHeight: '48%', borderWidth: 3, borderColor: '#21d3b7', borderRadius: 16, backgroundColor: '#00000010' },
  photoDocumentFrame: { width: '72%', aspectRatio: 0.78, maxHeight: '62%', borderWidth: 3, borderColor: '#f4d36c', borderRadius: 22, backgroundColor: '#00000010' },
  barcodeFrame: { width: '88%', height: 230, borderWidth: 3, borderColor: '#21d3b7', borderRadius: 20, backgroundColor: '#00000012' },
  cameraHint: { color: '#fff', fontSize: 14, fontWeight: '800', textAlign: 'center', backgroundColor: '#000a', paddingHorizontal: 17, paddingVertical: 10, borderRadius: 18 },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 5, borderColor: '#fff', backgroundColor: '#ffffff66', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' }, shutterDisabled: { opacity: 0.55 },
});

registerRootComponent(App);