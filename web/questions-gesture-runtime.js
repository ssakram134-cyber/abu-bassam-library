(()=>{
'use strict';
if(window.__ABU_QUESTION_GESTURES_DISABLED__)return;
window.__ABU_QUESTION_GESTURES_DISABLED__=true;

// Custom global question gestures are intentionally disabled.
// Native browser/WebView interaction is left untouched so scrolling,
// buttons, inputs and editor-specific controls keep their own behavior.
function reset(){return true}
window.AbuQuestionGestures={disabled:true,reset};
})();
