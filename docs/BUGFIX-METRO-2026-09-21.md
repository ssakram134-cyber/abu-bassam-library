# إصلاح خطأ Unable to load script — 2026-09-21

## العطل الذي ظهر على الهاتف
`Unable to load script` مع طلب تشغيل Metro على المنفذ 8081.

## السبب الجذري
تم نشر APK من نوع Debug. هذا النوع لا يضم JavaScript bundle للاستخدام المستقل، ولذلك يحاول الاتصال بـ Metro أثناء التشغيل.

## القرار التنفيذي
- يمنع رفع `assembleDebug` كنسخة توزيع.
- تبنى نسخة التوزيع دائمًا من `assembleRelease`.
- عند توفر مفتاح Release الرسمي يستخدم للتوقيع.
- عند عدم توفره تبقى النسخة Release مستقلة لكن توقع بإعداد debug signing الموجود في مشروع Android الناتج، للاختبار المباشر فقط.
- CI يفشل إذا لم يوجد `assets/index.android.bundle` داخل APK.
- CI يفشل إذا لم يجتز APK فحص التوقيع.
- CI يفحص سلامة أرشيف APK قبل رفعه.

## معيار الإغلاق
لا يعتبر هذا العطل محلولًا بمجرد نجاح Gradle. يجب أن ينجح في CI كل من:
1. `assembleRelease`.
2. وجود `assets/index.android.bundle` داخل APK.
3. `apksigner verify`.
4. رفع APK النهائي فقط كـ Artifact.
5. تجربة فتحه فعليًا على الهاتف بدون Metro تبقى `يحتاج تحقق 🔍` حتى يجربها المستخدم.
