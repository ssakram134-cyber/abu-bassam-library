# هوية الحزمة الحالية

الحالة المعتمدة للمصدر الحالي فقط:

- اسم التطبيق: `مكتبة أبو بسام`
- الإصدار: `6.0.0`
- Android `versionCode`: `600`
- Android package: `com.abubassam.libraryv6`
- مخزن هوية الجهاز التشغيلي: مفاتيح V5 الحالية فقط؛ لا يوجد fallback إلى namespaces أقدم.
- الأسرار: عبر Android SecureStore فقط. أي قيمة قديمة في Web Storage تُمسح بواسطة حارس التنظيف ولا تُستخدم للمصادقة.
- التحديثات: `app-update-runtime.js` و`app.json` و`package.json` و`index.js` يجب أن تحمل الإصدار والبناء نفسيهما.

للتحقق من النسخة الحالية عبر ADB:

```bash
adb shell pm list packages | grep com.abubassam
adb shell dumpsys package com.abubassam.libraryv6 | grep -E 'versionName|versionCode'
```

أي تغيير لاحق للإصدار يجب أن يمر عبر:

```bash
npm run release:prepare -- <version> <versionCode>
npm run check:web
```

ولا يُعتمد APK إنتاجي قبل التحقق من التوقيع وSHA-256 ومن وجود `assets/index.android.bundle` داخله.
