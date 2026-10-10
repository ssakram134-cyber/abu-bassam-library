const fs=require('fs');
function read(p){if(!fs.existsSync(p))throw new Error(`missing ${p}`);return fs.readFileSync(p,'utf8')}
const errors=[];
const need=(s,t,l)=>{if(!s.includes(t))errors.push(`${l}: missing ${t}`)};
const forbid=(s,t,l)=>{if(s.includes(t))errors.push(`${l}: forbidden ${t}`)};
const pin=read('web/mediapipe-pin-runtime.js');
const loader=read('web/device-name-runtime.js');
const index=read('web/index.html');
const androidAssets=read('scripts/prepare-android-assets.mjs');
for(const t of ["VERSION='0.1.1675465747'","LOCAL_BASE='vendor/mediapipe/'",'REMOTE_BASE=`https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@${VERSION}/`','nativeBridgeAvailable()?LOCAL_BASE:REMOTE_BASE','window.getSelfie=async function','locateFile:file=>BASE+file',"mode:nativeBridgeAvailable()?'embedded':'remote-browser-only'"])need(pin,t,'MediaPipe pin runtime');
for(const t of ['mediapipe-pin-runtime.js','loadMediaPipePin','loadPasswordPolicy','await loadMediaPipePin();','await loadPasswordPolicy();','await loadSecurity();'])need(loader,t,'startup dependency loader');
need(index,'abuBassamBgConsent','background-removal consent');
need(index,"window.AbuBassamMediaPipe?.mode==='embedded'",'embedded Android background removal must not request internet-download consent');
need(index,'تُعالج الصورة محليًا ولا تُرسل إلى خادم التطبيق','local-processing disclosure');
need(index,"if(window.Android&&typeof Android.security==='function')throw new Error('مكوّن إزالة الخلفية المحلي لم يُحمّل بأمان. أعد فتح التطبيق.')",'native MediaPipe fail-closed fallback');
need(index,'@mediapipe/selfie_segmentation@0.1.1675465747/selfie_segmentation.js','pinned browser-only MediaPipe fallback');
for(const t of ["MEDIAPIPE_VERSION = '0.1.1675465747'","mediaPipeRoot = resolve(destination, 'vendor', 'mediapipe')",'MEDIAPIPE_ASSETS','selfie_segmentation_solution_simd_wasm_bin.wasm','selfie_segmentation_solution_wasm_bin.wasm',"download(urls,resolve(mediaPipeRoot,relative),minBytes,'MediaPipe Android asset')"])need(androidAssets,t,'Android embedded MediaPipe assets');
forbid(pin,'@mediapipe/selfie_segmentation/selfie_segmentation.js','unpinned MediaPipe URL in active pin runtime');
forbid(pin,"const BASE=`https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@${VERSION}/`;",'remote-only MediaPipe base in privileged Android runtime');
for(const file of ['web/mediapipe-pin-runtime.js','web/device-name-runtime.js']){try{new Function(read(file))}catch(e){errors.push(`${file}: JavaScript syntax error: ${e.message}`)}}
if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exit(1)}
process.stdout.write('External dependency checks passed: Android uses embedded pinned MediaPipe assets before the splash clears; remote MediaPipe loading is restricted to non-native browser use.\n');
