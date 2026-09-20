import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { WebView } from 'react-native-webview';

const APP_URL = 'file:///android_asset/library/index.html';
const BARCODE_TYPES = [
  'qr',
  'ean13',
  'ean8',
  'code128',
  'code39',
  'code93',
  'upc_a',
  'upc_e',
  'datamatrix',
  'pdf417',
  'aztec',
  'codabar',
  'itf14',
];

const ANDROID_BRIDGE = `
(function () {
  function send(type, payload) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ type: type }, payload || {})));
    } catch (error) {}
  }
  window.Android = {
    saveBase64: function (name, mime, data) { send('saveBase64', { name: name, mime: mime, data: data }); },
    saveToGallery: function (name, mime, data) { send('saveToGallery', { name: name, mime: mime, data: data }); },
    savePagesToGallery: function (prefix, pages, mime) { send('savePagesToGallery', { prefix: prefix, pages: pages, mime: mime }); },
    printPages: function (pages, paper, dpi) { send('printPages', { pages: pages, paper: paper, dpi: dpi }); },
    printBase64: function (name, mime, data) { send('printBase64', { name: name, mime: mime, data: data }); },
    printHtml: function (html) { send('printHtml', { html: html }); },
    savePdfHtml: function (name, html) { send('savePdfHtml', { name: name, html: html }); },
    shareBase64: function (name, mime, data) { send('shareBase64', { name: name, mime: mime, data: data }); },
    openExternal: function (url) { send('openExternal', { url: url }); },
    openAppSettings: function () { send('openAppSettings'); },
    getDeviceInfo: function () { send('getDeviceInfo'); },
    cleanCache: function () { send('cleanCache'); }
  };
  window.__ABU_BASSAM_NATIVE_CAMERA__ = true;
})();
true;
`;

function safeName(value) {
  const cleaned = String(value || 'Abu_Bassam_File')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'Abu_Bassam_File';
}

function splitDataUrl(dataUrl) {
  const marker = ';base64,';
  const at = String(dataUrl || '').indexOf(marker);
  if (at < 0) throw new Error('صيغة الملف غير مدعومة');
  return {
    mime: String(dataUrl).slice(5, at).split(';')[0] || 'application/octet-stream',
    base64: String(dataUrl).slice(at + marker.length),
  };
}

function printDimensions(paper) {
  if (paper === 'A5') return { width: 148, height: 210 };
  if (paper === 'A6') return { width: 105, height: 148 };
  if (paper === '10x15') return { width: 100, height: 150 };
  if (String(paper || '').startsWith('CUSTOM:')) {
    const parts = String(paper).split(':');
    const width = Number(parts[1]);
    const height = Number(parts[2]);
    if (width > 0 && height > 0) return { width, height };
  }
  return { width: 210, height: 297 };
}

function App() {
  const webRef = useRef(null);
  const cameraRef = useRef(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [cameraMode, setCameraMode] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [barcodeLocked, setBarcodeLocked] = useState(false);
  const [torch, setTorch] = useState(false);
  const [cameraFacing, setCameraFacing] = useState('back');
  const [webReady, setWebReady] = useState(false);

  const inject = useCallback((functionName, payload) => {
    const json = JSON.stringify(payload)
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
    webRef.current?.injectJavaScript(
      `if (typeof window.${functionName} === 'function') window.${functionName}(${json}); true;`,
    );
  }, []);

  const cameraError = useCallback(
    (message) => inject('AbuBassamNativeCameraError', String(message || 'تعذر تشغيل الكاميرا.')),
    [inject],
  );

  const closeCamera = useCallback(() => {
    setCameraMode(null);
    setCameraReady(false);
    setCameraBusy(false);
    setBarcodeLocked(false);
    setTorch(false);
    setCameraFacing('back');
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!cameraMode) return false;
      closeCamera();
      return true;
    });
    return () => subscription.remove();
  }, [cameraMode, closeCamera]);

  const openCamera = useCallback(
    async (mode) => {
      try {
        let permission = cameraPermission;
        if (!permission?.granted) permission = await requestCameraPermission();
        if (!permission?.granted) {
          cameraError('يجب منح إذن الكاميرا حتى يعمل المسح الضوئي وقارئ الباركود.');
          return;
        }
        setCameraReady(false);
        setBarcodeLocked(false);
        setTorch(false);
        setCameraFacing('back');
        setCameraMode(
          mode === 'barcode' || mode === 'maker' || mode === 'cardPhoto' || mode === 'ocr'
            ? mode
            : 'scan',
        );
      } catch (error) {
        cameraError('تعذر طلب إذن الكاميرا. افتح معلومات التطبيق وفعّل إذن الكاميرا.');
      }
    }, [cameraError, cameraPermission, requestCameraPermission],
  );

  const captureDocument = useCallback(async () => {
    if (!cameraReady || cameraBusy || !cameraRef.current) return;
    setCameraBusy(true);
    try {
      const picture = await cameraRef.current.takePictureAsync({
        base64: true,
        exif: false,
        quality: 1,
        skipProcessing: false,
      });
      if (!picture?.base64) throw new Error('لم تُحفظ الصورة');
      const mode =
        cameraMode === 'maker' || cameraMode === 'cardPhoto' || cameraMode === 'ocr'
          ? cameraMode
          : 'scan';
      closeCamera();
      inject('AbuBassamNativeCameraResult', {
        mode,
        dataUrl: `data:image/jpeg;base64,${picture.base64}`,
      });
    } catch (error) {
      setCameraBusy(false);
      cameraError('تعذر التقاط الصورة. أعد فتح الكاميرا وحاول مرة أخرى.');
    }
  }, [cameraBusy, cameraError, cameraMode, cameraReady, closeCamera, inject]);

  const onBarcodeScanned = useCallback(
    (result) => {
      if (barcodeLocked || !result?.data) return;
      setBarcodeLocked(true);
      const payload = { mode: 'barcode', data: String(result.data), barcodeType: result.type || '' };
      closeCamera();
      inject('AbuBassamNativeCameraResult', payload);
    }, [barcodeLocked, closeCamera, inject],
  );

  const onCameraMountError = useCallback(() => {
    closeCamera();
    cameraError('تعذر تشغيل الكاميرا الخلفية على هذا الجهاز.');
  }, [cameraError, closeCamera]);

  const saveBase64 = useCallback(async ({ name, mime, data }) => {
    try {
      const parsed = splitDataUrl(data);
      const finalMime = mime || parsed.mime;
      const finalName = safeName(name);
      const dot = finalName.lastIndexOf('.');
      const displayName = dot > 0 ? finalName.slice(0, dot) : finalName;
      const initialUri = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Download');
      const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri);
      if (!permission.granted) return;
      const uri = await FileSystem.StorageAccessFramework.createFileAsync(
        permission.directoryUri,
        displayName,
        finalMime,
      );
      await FileSystem.StorageAccessFramework.writeAsStringAsync(uri, parsed.base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      Alert.alert('تم الحفظ', `تم حفظ ${finalName} بنجاح.`);
    } catch (error) {
      Alert.alert('تعذر الحفظ', String(error?.message || error));
    }
  }, []);

  const saveToGallery = useCallback(async ({ name, mime, data }) => {
    try {
      const parsed = splitDataUrl(data);
      const finalMime = mime || parsed.mime;
      if (!String(finalMime).startsWith('image/')) throw new Error('هذا الملف ليس صورة');
      const finalName = safeName(name || `Abu_Bassam_${Date.now()}.png`);
      const dot = finalName.lastIndexOf('.');
      const displayName = dot > 0 ? finalName.slice(0, dot) : finalName;
      const initialUri = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Pictures');
      const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri);
      if (!permission.granted) return;
      const uri = await FileSystem.StorageAccessFramework.createFileAsync(
        permission.directoryUri,
        displayName,
        finalMime,
      );
      await FileSystem.StorageAccessFramework.writeAsStringAsync(uri, parsed.base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      Alert.alert('تم الحفظ في المعرض', `تم حفظ ${finalName} داخل مجلد الصور الذي اخترته.`);
    } catch (error) {
      Alert.alert('تعذر الحفظ في المعرض', String(error?.message || error));
    }
  }, []);

  const savePagesToGallery = useCallback(async ({ prefix, pages, mime }) => {
    try {
      const imagePages = typeof pages === 'string' ? JSON.parse(pages) : pages;
      if (!Array.isArray(imagePages) || imagePages.length === 0) throw new Error('لا توجد صور للحفظ');
      const finalMime = String(mime || 'image/jpeg');
      if (!finalMime.startsWith('image/')) throw new Error('صيغة الصور غير مدعومة');
      const initialUri = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Pictures');
      const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri);
      if (!permission.granted) return;
      let saved = 0;
      for (let index = 0; index < imagePages.length; index += 1) {
        const parsed = splitDataUrl(imagePages[index]);
        const displayName = `${safeName(prefix || 'Abu_Bassam_Page')}_${index + 1}_${Date.now()}`;
        const uri = await FileSystem.StorageAccessFramework.createFileAsync(
          permission.directoryUri,
          displayName,
          finalMime || parsed.mime,
        );
        await FileSystem.StorageAccessFramework.writeAsStringAsync(uri, parsed.base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        saved += 1;
      }
      Alert.alert('تم الحفظ في المعرض', `تم حفظ ${saved} صفحة داخل مجلد الصور الذي اخترته.`);
    } catch (error) {
      Alert.alert('تعذر حفظ الصفحات', String(error?.message || error));
    }
  }, []);

  const printPages = useCallback(async ({ pages, paper }) => {
    try {
      const imagePages = typeof pages === 'string' ? JSON.parse(pages) : pages;
      if (!Array.isArray(imagePages) || imagePages.length === 0) throw new Error('لا توجد صفحات للطباعة');
      const size = printDimensions(paper);
      const body = imagePages
        .map(
          (src) =>
            `<section><img alt="صفحة للطباعة" src="${String(src).replace(/"/g, '&quot;')}"></section>`,
        )
        .join('');
      const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>
        @page { size: ${size.width}mm ${size.height}mm; margin: 0; }
        * { box-sizing: border-box; } html, body { margin: 0; padding: 0; background: #fff; }
        section { width: ${size.width}mm; height: ${size.height}mm; margin: 0; page-break-after: always; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        section:last-child { page-break-after: auto; }
        img { width: 100%; height: 100%; object-fit: contain; display: block; }
      </style></head><body>${body}</body></html>`;
      await Print.printAsync({ html });
    } catch (error) {
      Alert.alert('تعذرت الطباعة', String(error?.message || error));
    }
  }, []);

  const printHtml = useCallback(async ({ html }) => {
    try {
      if (!String(html || '').trim()) throw new Error('لا توجد كروت للطباعة');
      await Print.printAsync({ html: String(html) });
    } catch (error) {
      Alert.alert('تعذرت الطباعة', String(error?.message || error));
    }
  }, []);

  const savePdfHtml = useCallback(async ({ name, html }) => {
    try {
      if (!String(html || '').trim()) throw new Error('لا توجد كروت لحفظها');
      const result = await Print.printToFileAsync({ html: String(html), base64: true });
      const base64 = result.base64 || (await FileSystem.readAsStringAsync(result.uri, {
        encoding: FileSystem.EncodingType.Base64,
      }));
      const finalName = safeName(name || `Abu_Bassam_Cards_${Date.now()}.pdf`);
      const dot = finalName.lastIndexOf('.');
      const displayName = dot > 0 ? finalName.slice(0, dot) : finalName;
      const initialUri = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Download');
      const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri);
      if (!permission.granted) return;
      const uri = await FileSystem.StorageAccessFramework.createFileAsync(
        permission.directoryUri,
        displayName,
        'application/pdf',
      );
      await FileSystem.StorageAccessFramework.writeAsStringAsync(uri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (result.uri?.startsWith(FileSystem.cacheDirectory || '')) {
        await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {});
      }
      Alert.alert('تم حفظ PDF', `تم حفظ ${finalName} بأعلى جودة متاحة.`);
    } catch (error) {
      Alert.alert('تعذر حفظ PDF', String(error?.message || error));
    }
  }, []);

  const writeTemporaryFile = useCallback(async (name, mime, data) => {
    const parsed = splitDataUrl(data);
    const finalName = safeName(name);
    const uri = `${FileSystem.cacheDirectory}abu_bassam_${Date.now()}_${finalName}`;
    await FileSystem.writeAsStringAsync(uri, parsed.base64, { encoding: FileSystem.EncodingType.Base64 });
    return { uri, name: finalName, type: mime || parsed.mime };
  }, []);

  const printBase64 = useCallback(
    async ({ name, mime, data }) => {
      try {
        const finalMime = String(mime || 'application/octet-stream');
        if (finalMime.startsWith('image/')) {
          const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:8mm}html,body{margin:0}body{display:flex;align-items:center;justify-content:center;min-height:270mm}img{max-width:100%;max-height:270mm;object-fit:contain}</style></head><body><img src="${String(data).replace(/"/g, '&quot;')}"></body></html>`;
          await Print.printAsync({ html });
          return;
        }
        const file = await writeTemporaryFile(name, finalMime, data);
        try {
          await Print.printAsync({ uri: file.uri });
        } finally {
          await FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => {});
        }
      } catch (error) {
        Alert.alert('تعذرت الطباعة', String(error?.message || error));
      }
    },
    [writeTemporaryFile],
  );

  const openExternal = useCallback(async ({ url }) => {
    try {
      const value = String(url || '').trim();
      if (!/^(https?:|tel:|mailto:|tg:|whatsapp:)/i.test(value)) throw new Error('الرابط غير مسموح');
      const supported = await Linking.canOpenURL(value);
      if (!supported) throw new Error('لا يوجد تطبيق مناسب لفتح هذا الرابط');
      await Linking.openURL(value);
    } catch (error) {
      Alert.alert('تعذر فتح الرابط', String(error?.message || error));
    }
  }, []);

  const shareBase64 = useCallback(
    async ({ name, mime, data }) => {
      try {
        if (!(await Sharing.isAvailableAsync())) throw new Error('المشاركة غير متاحة على هذا الجهاز');
        const file = await writeTemporaryFile(name, mime, data);
        try {
          await Sharing.shareAsync(file.uri, {
            mimeType: file.type,
            dialogTitle: 'حفظ أو مشاركة الملف',
          });
        } finally {
          await FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => {});
        }
      } catch (error) {
        Alert.alert('تعذرت المشاركة', String(error?.message || error));
      }
    },
    [writeTemporaryFile],
  );

  const openAppSettings = useCallback(async () => {
    try {
      await Linking.openSettings();
    } catch (error) {
      Alert.alert('تعذر فتح الإعدادات', 'افتح إعدادات Android ثم اختر تطبيق مكتبة أبو بسام.');
    }
  }, []);

  const getDeviceInfo = useCallback(() => {
    inject('AbuBassamNativeDeviceInfo', {
      name: 'أكرم',
      os: Platform.OS,
      androidVersion: String(Platform.Version),
      appVersion: '4.3.2',
      buildNumber: '432',
      cameraPermission: cameraPermission?.granted
        ? 'مسموح'
        : cameraPermission?.canAskAgain === false
          ? 'مرفوض — افتح إعدادات النظام'
          : 'يُطلب عند الاستخدام',
      connection: 'هذا الجهاز',
    });
  }, [cameraPermission, inject]);

  const cleanCache = useCallback(async () => {
    try {
      const root = FileSystem.cacheDirectory;
      if (!root) throw new Error('مجلد الملفات المؤقتة غير متاح');
      const entries = await FileSystem.readDirectoryAsync(root);
      const generated = entries.filter((name) => name.startsWith('abu_bassam_'));
      await Promise.all(
        generated.map((name) => FileSystem.deleteAsync(`${root}${name}`, { idempotent: true })),
      );
      Alert.alert('تم التنظيف', `حُذفت ${generated.length} من الملفات المؤقتة فقط. لم تُحذف ملفاتك.`);
    } catch (error) {
      Alert.alert('تعذر التنظيف', String(error?.message || error));
    }
  }, []);

  const onWebMessage = useCallback(
    async (event) => {
      let message;
      try {
        message = JSON.parse(event.nativeEvent.data);
      } catch (error) {
        return;
      }
      if (message.type === 'openCamera') return openCamera(message.mode);
      if (message.type === 'saveBase64') return saveBase64(message);
      if (message.type === 'saveToGallery') return saveToGallery(message);
      if (message.type === 'savePagesToGallery') return savePagesToGallery(message);
      if (message.type === 'printPages') return printPages(message);
      if (message.type === 'printBase64') return printBase64(message);
      if (message.type === 'printHtml') return printHtml(message);
      if (message.type === 'savePdfHtml') return savePdfHtml(message);
      if (message.type === 'shareBase64') return shareBase64(message);
      if (message.type === 'openExternal') return openExternal(message);
      if (message.type === 'openAppSettings') return openAppSettings();
      if (message.type === 'getDeviceInfo') return getDeviceInfo();
      if (message.type === 'cleanCache') return cleanCache();
    },
    [cleanCache, getDeviceInfo, openAppSettings, openCamera, openExternal, printBase64, printHtml, printPages, saveBase64, savePdfHtml, savePagesToGallery, saveToGallery, shareBase64],
  );

  const barcodeMode = cameraMode === 'barcode';

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar
        barStyle={cameraMode ? 'light-content' : 'dark-content'}
        backgroundColor={cameraMode ? '#000000' : '#fffaf3'}
      />
      <WebView
        ref={webRef}
        source={{ uri: APP_URL }}
        style={styles.webView}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        mediaPlaybackRequiresUserAction={false}
        injectedJavaScriptBeforeContentLoaded={ANDROID_BRIDGE}
        onMessage={onWebMessage}
        onLoadEnd={() => setWebReady(true)}
        onError={() => Alert.alert('تعذر فتح التطبيق', 'أعد تشغيل التطبيق وحاول مرة أخرى.')}
      />
      {!webReady && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#76533e" />
          <Text style={styles.loadingText}>جاري فتح مكتبة أبو بسام…</Text>
        </View>
      )}
      {cameraMode && (
        <View style={styles.cameraOverlay}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={cameraFacing}
            enableTorch={cameraFacing === 'back' && torch}
            onCameraReady={() => setCameraReady(true)}
            onMountError={onCameraMountError}
            barcodeScannerSettings={barcodeMode ? { barcodeTypes: BARCODE_TYPES } : undefined}
            onBarcodeScanned={barcodeMode && !barcodeLocked ? onBarcodeScanned : undefined}
          />
          <View style={styles.cameraShade} pointerEvents="box-none">
            <View style={styles.cameraHeader}>
              <TouchableOpacity style={styles.roundButton} onPress={closeCamera} accessibilityLabel="إغلاق الكاميرا">
                <Text style={styles.roundButtonText}>×</Text>
              </TouchableOpacity>
              <Text style={styles.cameraTitle}>
                {barcodeMode
                  ? 'قارئ الباركود'
                  : cameraMode === 'maker'
                    ? 'صانع الهوية'
                    : cameraMode === 'cardPhoto'
                      ? 'صورة الكارت'
                      : cameraMode === 'ocr'
                        ? 'تحويل الصورة إلى نص'
                      : 'المسح الضوئي'}
              </Text>
              <View style={styles.cameraActions}>
                <TouchableOpacity
                  style={styles.roundButton}
                  onPress={() => {
                    setCameraReady(false);
                    setTorch(false);
                    setCameraFacing((value) => (value === 'back' ? 'front' : 'back'));
                  }}
                  accessibilityLabel="تبديل الكاميرا"
                >
                  <Text style={styles.flipText}>↻</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.roundButton, cameraFacing !== 'back' && styles.roundButtonDisabled]}
                  onPress={() => cameraFacing === 'back' && setTorch((value) => !value)}
                  disabled={cameraFacing !== 'back'}
                  accessibilityLabel="الفلاش"
                >
                  <Text style={styles.flashText}>{torch ? '☀' : 'ϟ'}</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={barcodeMode ? styles.barcodeFrame : styles.documentFrame} />
            <Text style={styles.cameraHint}>
              {barcodeMode
                ? 'وجّه الكاميرا نحو الباركود وسيُقرأ تلقائيًا'
                : cameraMode === 'cardPhoto'
                  ? 'ضع الوجه داخل الإطار ثم اضغط زر التصوير'
                  : cameraMode === 'ocr'
                    ? 'صوّر النص بوضوح وبإضاءة جيدة'
                  : 'ضع المستند داخل الإطار؛ سيُحلل ويُقص محليًا بعد الالتقاط'}
            </Text>
            {!barcodeMode && (
              <TouchableOpacity
                style={[styles.shutter, (!cameraReady || cameraBusy) && styles.shutterDisabled]}
                onPress={captureDocument}
                disabled={!cameraReady || cameraBusy}
                accessibilityLabel="التقاط الصورة"
              >
                {cameraBusy ? <ActivityIndicator color="#087f72" /> : <View style={styles.shutterInner} />}
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fffaf3' },
  webView: { flex: 1, backgroundColor: '#fffaf3' },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fffaf3',
  },
  loadingText: { color: '#5b4438', fontSize: 15, fontWeight: '700', marginTop: 14 },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
    backgroundColor: '#000',
  },
  cameraShade: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 38,
  },
  cameraHeader: {
    width: '100%',
    paddingTop: 14,
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cameraTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    backgroundColor: '#0008',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
  },
  cameraActions: { flexDirection: 'row', gap: 7 },
  roundButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#0009',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundButtonDisabled: { opacity: 0.45 },
  roundButtonText: { color: '#fff', fontSize: 32, lineHeight: 35 },
  flipText: { color: '#fff', fontSize: 27, fontWeight: '800' },
  flashText: { color: '#fff', fontSize: 25, fontWeight: '800' },
  documentFrame: {
    width: '91%',
    aspectRatio: 0.72,
    maxHeight: '66%',
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: 15,
    backgroundColor: '#00000010',
  },
  barcodeFrame: {
    width: '88%',
    height: 230,
    borderWidth: 3,
    borderColor: '#21d3b7',
    borderRadius: 20,
    backgroundColor: '#00000012',
  },
  cameraHint: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    backgroundColor: '#000a',
    paddingHorizontal: 17,
    paddingVertical: 10,
    borderRadius: 18,
  },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 5,
    borderColor: '#fff',
    backgroundColor: '#ffffff66',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  shutterDisabled: { opacity: 0.55 },
});

registerRootComponent(App);
