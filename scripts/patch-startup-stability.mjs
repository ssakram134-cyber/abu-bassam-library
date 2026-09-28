import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const indexPath = resolve(root, 'index.js');
const recoveryPath = resolve(root, 'web', 'feature-recovery-runtime.js');

function replaceRequired(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Startup stability patch failed: ${label}`);
  return source.replace(from, to);
}

let index = await readFile(indexPath, 'utf8');

if (!index.includes('const STARTUP_WATCHDOG_MS = 3500;')) {
  index = replaceRequired(
    index,
    "const BUILD_NUMBER = '500';\nconst PRIVACY_CAPTURE_KEY = 'abu-bassam-private-screen';",
    "const BUILD_NUMBER = '500';\nconst STARTUP_WATCHDOG_MS = 3500;\nconst PRIVACY_CAPTURE_KEY = 'abu-bassam-private-screen';",
    'v5 watchdog constant'
  );
}

if (!index.includes('const timer = setTimeout(() => setWebReady(true), STARTUP_WATCHDOG_MS);')) {
  const marker = "  useEffect(() => {\n    const subscription = BackHandler.addEventListener('hardwareBackPress'";
  if (!index.includes(marker)) throw new Error('Startup stability patch failed: watchdog hook insertion point');
  index = index.replace(marker,
    "  useEffect(() => {\n    if (webReady) return undefined;\n    const timer = setTimeout(() => setWebReady(true), STARTUP_WATCHDOG_MS);\n    return () => clearTimeout(timer);\n  }, [webReady]);\n\n" + marker
  );
}

if (!index.includes("message.type === 'webBootReady'")) {
  index = replaceRequired(
    index,
    "  const onWebMessage = useCallback(async (event) => {\n    let message; try { message = JSON.parse(event.nativeEvent.data); } catch (_) { return; }\n",
    "  const onWebMessage = useCallback(async (event) => {\n    let message; try { message = JSON.parse(event.nativeEvent.data); } catch (_) { return; }\n    if (message.type === 'webBootReady') { setWebReady(true); return; }\n",
    'web boot ready bridge'
  );
}

const safeWebViewMarkers = [
  "originWhitelist={['file://*','about:*']}",
  'mixedContentMode="never"',
  'onShouldStartLoadWithRequest',
  "if (/^(https:|tel:|mailto:|tg:|whatsapp:)/i.test(url))",
  'onLoadProgress={(event) => { if ((event.nativeEvent?.progress || 0) >= 0.35) setWebReady(true); }}'
];
if (!safeWebViewMarkers.every(marker => index.includes(marker))) {
  index = replaceRequired(
    index,
    "        ref={webRef} source={{ uri: APP_URL }} style={styles.webView} originWhitelist={['*']} javaScriptEnabled domStorageEnabled\n        allowFileAccess allowFileAccessFromFileURLs allowUniversalAccessFromFileURLs mixedContentMode=\"always\"\n        setSupportMultipleWindows={false} mediaPlaybackRequiresUserAction={false}\n        injectedJavaScriptBeforeContentLoaded={ANDROID_BRIDGE} onMessage={onWebMessage} onLoadEnd={() => setWebReady(true)}\n        onError={() => Alert.alert('تعذر فتح التطبيق', 'أعد تشغيل التطبيق وحاول مرة أخرى.')}",
    "        ref={webRef} source={{ uri: APP_URL }} style={styles.webView} originWhitelist={['file://*','about:*']} javaScriptEnabled domStorageEnabled\n        allowFileAccess allowFileAccessFromFileURLs allowUniversalAccessFromFileURLs mixedContentMode=\"never\"\n        setSupportMultipleWindows={false} mediaPlaybackRequiresUserAction={false}\n        onShouldStartLoadWithRequest={(request) => {\n          const url = String(request?.url || '');\n          if (url.startsWith('file:///android_asset/library/') || url === 'about:blank') return true;\n          if (/^(https:|tel:|mailto:|tg:|whatsapp:)/i.test(url)) Linking.openURL(url).catch(() => {});\n          return false;\n        }}\n        injectedJavaScriptBeforeContentLoaded={ANDROID_BRIDGE} injectedJavaScript={ANDROID_BRIDGE} onMessage={onWebMessage}\n        onLoad={() => setWebReady(true)}\n        onLoadProgress={(event) => { if ((event.nativeEvent?.progress || 0) >= 0.35) setWebReady(true); }}\n        onLoadEnd={() => setWebReady(true)}\n        onError={() => { setWebReady(true); Alert.alert('تعذر فتح التطبيق', 'تعذر تحميل واجهة مكتبة أبو بسام. أغلق التطبيق وافتحه مرة أخرى.'); }}",
    'WebView startup/security callbacks'
  );
}

if (!index.includes('const encodedNameMatch = raw.match(/;name=([^;]+);base64,/i);')) {
  const savePagesPattern = /  const savePagesToGallery = useCallback\(async \(\{ prefix, pages, mime \}\) => \{[\s\S]*?\n  \}, \[\]\);\n\n  const printPages/;
  if (!savePagesPattern.test(index)) throw new Error('Startup stability patch failed: named compressed image saving');
  index = index.replace(savePagesPattern, `  const savePagesToGallery = useCallback(async ({ prefix, pages, mime }) => {
    try {
      const imagePages = typeof pages === 'string' ? JSON.parse(pages) : pages;
      if (!Array.isArray(imagePages) || !imagePages.length) throw new Error('لا توجد صور للحفظ');
      if (imagePages.length > 20) throw new Error('عدد الصور أكبر من الحد المسموح');
      const initialUri = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Pictures');
      const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri);
      if (!permission.granted) return;
      let saved = 0, failed = 0;
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
          const uri = await FileSystem.StorageAccessFramework.createFileAsync(permission.directoryUri, displayName, itemMime);
          await FileSystem.StorageAccessFramework.writeAsStringAsync(uri, parsed.base64, { encoding: FileSystem.EncodingType.Base64 });
          saved += 1;
        } catch (_) { failed += 1; }
      }
      if (!saved) throw new Error('تعذر حفظ الصور المحددة');
      Alert.alert('تم الحفظ في المعرض', failed ? 'تم حفظ ' + saved + ' صورة وتعذر حفظ ' + failed + '.' : 'تم حفظ ' + saved + ' صورة داخل المجلد الذي اخترته.');
    } catch (error) { Alert.alert('تعذر حفظ الصفحات', String(error?.message || error)); }
  }, []);

  const printPages`);
}

await writeFile(indexPath, index, 'utf8');

let recovery = await readFile(recoveryPath, 'utf8');
recovery = recovery.replace(/\n\s*const splash=\$\('splash'\);\n\s*if\(splash&&[\s\S]*?\n\s*}\n(?=\s*}\s*catch\(e\)\{\})/, '\n');

const legacyObserver = "function init(){addCss();removeFlex();cleanQuestions();installCards();removeOldPlacements();window.addEventListener('message',recoveryMessage);new MutationObserver(()=>{removeFlex();cleanQuestions();installCards();removeOldPlacements()}).observe(document.documentElement,{childList:true,subtree:true})}";
const debouncedObserver = "let recoveryTimer=0;function scheduleRecovery(){clearTimeout(recoveryTimer);recoveryTimer=setTimeout(()=>{removeFlex();cleanQuestions();installCards();removeOldPlacements()},60)}\nfunction init(){addCss();removeFlex();cleanQuestions();installCards();removeOldPlacements();window.addEventListener('message',recoveryMessage);new MutationObserver(scheduleRecovery).observe(document.documentElement,{childList:true,subtree:true})}";
const eventRecovery = "let recoveryTimer=0;\nfunction scheduleRecovery(){clearTimeout(recoveryTimer);recoveryTimer=setTimeout(()=>{restoreNativeTouch();removeFlex();cleanQuestions();installCards();removeOldPlacements()},60)}\nfunction installRecoverySignals(){\n  window.addEventListener('pageshow',scheduleRecovery,{passive:true});\n  window.addEventListener('focus',scheduleRecovery,{passive:true});\n  document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='hidden')scheduleRecovery()},{passive:true});\n  document.addEventListener('abu-bassam-section-changed',scheduleRecovery,{passive:true});\n}\nfunction init(){addCss();restoreNativeTouch();removeFlex();cleanQuestions();installCards();removeOldPlacements();window.addEventListener('message',recoveryMessage);installRecoverySignals();[120,600,1800].forEach(ms=>setTimeout(scheduleRecovery,ms))}";
if (recovery.includes(legacyObserver)) recovery = recovery.replace(legacyObserver, eventRecovery);
if (recovery.includes(debouncedObserver)) recovery = recovery.replace(debouncedObserver, eventRecovery);
if (/new\s+MutationObserver\s*\(/.test(recovery)) throw new Error('Startup stability repair refuses global MutationObserver recovery');
if (recovery.includes("style.pointerEvents='none'")) throw new Error('Startup stability repair refuses runtime pointer-events mutation');
if (!recovery.includes("document.addEventListener('abu-bassam-section-changed',scheduleRecovery")) throw new Error('Startup stability repair requires event-based recovery signals');
await writeFile(recoveryPath, recovery, 'utf8');

process.stdout.write('Startup stability repair verified/applied: v5 watchdog, safe external navigation, named mixed-format compressed image saving, event-based recovery, and no global touch/DOM interception.\n');
