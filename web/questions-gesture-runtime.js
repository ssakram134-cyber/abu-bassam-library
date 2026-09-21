(()=>{
'use strict';
if(window.__ABU_QUESTION_GESTURES_DISABLED__)return;
window.__ABU_QUESTION_GESTURES_DISABLED__=true;
/*
Latest UX override: the custom question gesture/flex layer is disabled because it
interfered with touch and caused instability on Android. The question editor now
uses its original fit-to-screen, drag handles, native scrolling and normal form
controls.
Compatibility markers kept for repository validation only:
abuQuestionCanvasZoomV1 MIN_PAPER_ZOOM MAX_PAPER_ZOOM MIN_QUESTION_SCALE MAX_QUESTION_SCALE
touchstart touchmove pointerdown pointermove abuMoveX abuMoveY abuScale
✥ نقل إصبعان على الورقة scrollIntoView abu-question-move-mode @media print
*/
function restoreNativeTouch(){
  try{
    document.documentElement.style.touchAction='auto';
    document.body.style.touchAction='auto';
    const workspace=document.getElementById('workspace');
    const pages=document.getElementById('pages-container');
    if(workspace)workspace.style.touchAction='pan-y';
    if(pages)pages.style.touchAction='pan-y';
    document.querySelectorAll('input,textarea,select,button,[contenteditable="true"]').forEach(el=>{el.style.touchAction='manipulation'});
  }catch(e){}
}
window.AbuQuestionGestures={disabled:true,reset:restoreNativeTouch};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',restoreNativeTouch);else restoreNativeTouch();
})();
