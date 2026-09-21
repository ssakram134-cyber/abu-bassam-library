import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const indexPath = resolve(root, 'index.js');
const recoveryPath = resolve(root, 'web', 'feature-recovery-runtime.js');

function mustReplace(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`Startup stability patch failed: ${label}`);
  return source.replace(from, to);
}

let index = await readFile(indexPath, 'utf8');
index = mustReplace(
  index,
  "const BUILD_NUMBER = '432';\nconst PRIVACY_CAPTURE_KEY = 'abu-bassam-private-screen';",
  "const BUILD_NUMBER = '432';\nconst STARTUP_WATCHDOG_MS = 3500;\nconst PRIVACY_CAPTURE_KEY = 'abu-bassam-private-screen';",
  'watchdog constant'
);
index = mustReplace(
  index,
  "  const closeCamera = useCallback(() => {\n    setCameraMode(null); setCameraReady(false); setCameraBusy(false); setBarcodeLocked(false); setTorch(false); setCameraFacing('back');\n  }, []);\n\n  useEffect(() => {",
  "  const closeCamera = useCallback(() => {\n    setCameraMode(null); setCameraReady(false); setCameraBusy(false); setBarcodeLocked(false); setTorch(false); setCameraFacing('back');\n  }, []);\n\n  useEffect(() => {\n    if (webReady) return undefined;\n    const timer = setTimeout(() => setWebReady(true), STARTUP_WATCHDOG_MS);\n    return () => clearTimeout(timer);\n  }, [webReady]);\n\n  useEffect(() => {",
  'startup watchdog hook'
);
index = mustReplace(
  index,
  "  const onWebMessage = useCallback(async (event) => {\n    let message; try { message = JSON.parse(event.nativeEvent.data); } catch (_) { return; }\n    if (message.type === 'openCamera') return openCamera(message.mode);",
  "  const onWebMessage = useCallback(async (event) => {\n    let message; try { message = JSON.parse(event.nativeEvent.data); } catch (_) { return; }\n    if (message.type === 'webBootReady') { setWebReady(true); return; }\n    if (message.type === 'openCamera') return openCamera(message.mode);",
  'web boot ready bridge'
);
index = mustReplace(
  index,
  "        ref={webRef} source={{ uri: APP_URL }} style={styles.webView} originWhitelist={['*']} javaScriptEnabled domStorageEnabled\n        allowFileAccess allowFileAccessFromFileURLs allowUniversalAccessFromFileURLs mixedContentMode=\"always\"\n        setSupportMultipleWindows={false} mediaPlaybackRequiresUserAction={false}\n        injectedJavaScriptBeforeContentLoaded={ANDROID_BRIDGE} onMessage={onWebMessage} onLoadEnd={() => setWebReady(true)}\n        onError={() => Alert.alert('تعذر فتح التطبيق', 'أعد تشغيل التطبيق وحاول مرة أخرى.')}",
  "        ref={webRef} source={{ uri: APP_URL }} style={styles.webView} originWhitelist={['file://*','about:*']} javaScriptEnabled domStorageEnabled\n        allowFileAccess allowFileAccessFromFileURLs allowUniversalAccessFromFileURLs mixedContentMode=\"never\"\n        setSupportMultipleWindows={false} mediaPlaybackRequiresUserAction={false}\n        onShouldStartLoadWithRequest={(request) => {\n          const url = String(request?.url || '');\n          if (url.startsWith('file:///android_asset/library/') || url === 'about:blank') return true;\n          if (/^(https?:|tel:|mailto:|tg:|whatsapp:)/i.test(url)) Linking.openURL(url).catch(() => {});\n          return false;\n        }}\n        injectedJavaScriptBeforeContentLoaded={ANDROID_BRIDGE} injectedJavaScript={ANDROID_BRIDGE} onMessage={onWebMessage}\n        onLoad={() => setWebReady(true)}\n        onLoadProgress={(event) => { if ((event.nativeEvent?.progress || 0) >= 0.35) setWebReady(true); }}\n        onLoadEnd={() => setWebReady(true)}\n        onError={() => { setWebReady(true); Alert.alert('تعذر فتح التطبيق', 'تعذر تحميل واجهة مكتبة أبو بسام. أغلق التطبيق وافتحه مرة أخرى.'); }}",
  'WebView startup/security callbacks'
);
await writeFile(indexPath, index, 'utf8');

let recovery = await readFile(recoveryPath, 'utf8');
const oldObserver = "function init(){addCss();removeFlex();cleanQuestions();installCards();removeOldPlacements();window.addEventListener('message',recoveryMessage);new MutationObserver(()=>{removeFlex();cleanQuestions();installCards();removeOldPlacements()}).observe(document.documentElement,{childList:true,subtree:true})}";
const newObserver = "let recoveryTimer=0;function scheduleRecovery(){clearTimeout(recoveryTimer);recoveryTimer=setTimeout(()=>{removeFlex();cleanQuestions();installCards();removeOldPlacements()},60)}\nfunction init(){addCss();removeFlex();cleanQuestions();installCards();removeOldPlacements();window.addEventListener('message',recoveryMessage);new MutationObserver(scheduleRecovery).observe(document.documentElement,{childList:true,subtree:true})}";
if (recovery.includes(oldObserver)) {
  recovery = recovery.replace(oldObserver, newObserver);
} else if (!recovery.includes('new MutationObserver(scheduleRecovery).observe(document.documentElement,{childList:true,subtree:true})')) {
  throw new Error('Startup stability patch failed: debounced recovery observer');
}
await writeFile(recoveryPath, recovery, 'utf8');

process.stdout.write('Startup stability patch applied: immediate web-ready bridge, no reload loop, local-only WebView navigation, and debounced recovery observer.\n');
