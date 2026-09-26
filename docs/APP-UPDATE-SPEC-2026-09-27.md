# مواصفة تحديث التطبيق — 2026-09-27

هذه المواصفة جزء إلزامي من مشروع **مكتبة أبو بسام**.

## الهدف
يستطيع المستخدم من الإعدادات فحص وجود إصدار Android أحدث دون وضع GitHub Token أو مفتاح خادم داخل APK، ولا يستطيع مسار النشر اعتماد APK تجريبي أو إصدار بلا Hash/شهادة توقيع.

## المصدر الموثوق
- بيانات الإصدار محفوظة في `public.abu_bassam_app_releases`.
- الجدول محمي بـRLS وسياسة رفض مباشرة، ولا يملك `anon` أو `authenticated` صلاحية SELECT مباشرة.
- القراءة تتم فقط عبر Edge Function باسم `app-update` المنشورة مع `verify_jwt=true`.
- بوابة التحديث تتحقق من جلسة Supabase للمستخدم ثم تقرأ Metadata الإصدار بواسطة `service_role` داخل الخادم فقط.
- اسم Migration الأساسي في المستودع يطابق سجل الإنتاج الفعلي: `20260926215416_app_release_update_center.sql`.
- اعتماد إصدار جديد يتم عبر `abu_bassam_publish_app_release`، ولا يملك `public` أو `anon` أو `authenticated` حق EXECUTE عليه؛ `service_role` فقط.

## بيانات الإصدار
لكل إصدار: `version`، `version_code`، `channel`، `mandatory`، `min_supported_code`، `changelog`، مسار APK الخاص، `sha256`، بصمة شهادة التوقيع، وتاريخ النشر.

## التنزيل
- APK لا يكون عامًا.
- لا تصدر البوابة رابط تنزيل إلا إذا وُجدت معًا: `storage_path` و`sha256` و`signing_cert_sha256`.
- عند وجود إصدار أحدث وملف APK موثق، تنشئ البوابة رابط تنزيل موقّع قصير العمر لمدة 600 ثانية.
- التطبيق يقبل HTTPS فقط وعلى مضيف مشروع Supabase ومسار Storage فقط.
- لا يوجد تنزيل أو تثبيت صامت. Android يعرض التنزيل/التثبيت للمستخدم ويتحقق من توافق توقيع الحزمة عند التثبيت.
- يجب أن يحمل تحديث الإنتاج مفتاح التوقيع نفسه المستخدم للإصدار المثبت؛ APK التجريبي لا يُستخدم كتحديث إنتاجي.

## نشر إصدار إنتاجي
1. يبنى APK بالأمر `npm run build:apk:release` مع متغيرات مفتاح التوقيع الإنتاجي.
2. يجب أن ينتج `dist/BUILD_TYPE.txt` بالقيمة الدقيقة `signed-production-release-with-embedded-js`.
3. `scripts/publish-app-update.mjs` يعيد حساب SHA-256 ويطابقه مع `dist/SHA256.txt`.
4. يستخرج بصمة SHA-256 لشهادة التوقيع من `dist/SIGNING_CERTIFICATE.txt`.
5. يرفض النشر عند غياب `SUPABASE_URL` أو `SUPABASE_SERVICE_ROLE_KEY`. مفتاح الخادم يمر عبر Environment فقط ولا يُكتب داخل المستودع أو APK.
6. يرفع APK إلى `abu-bassam-private/app-releases/<version>/...`.
7. يستدعي RPC الخادمية الذرّية `abu_bassam_publish_app_release` لتثبيت المسار والـHash والشهادة وتفعيل Stable بعد التحقق من القيم.
8. الأمر: `npm run publish:update`. الخيارات: `--mandatory` و`--min-supported-code=<code>` و`--changelog=<text>`، أو `RELEASE_CHANGELOG` عبر Environment.

## الحالات
- لا يوجد إصدار أحدث: يظهر أن التطبيق على آخر إصدار.
- يوجد إصدار Metadata لكن APK أو Hash أو بصمة التوقيع لم تكتمل: يظهر الإصدار والتغييرات مع تعطيل التنزيل.
- تحديث اختياري: يعرض للمستخدم التنزيل.
- تحديث إلزامي: `mandatory=true` أو عندما يكون `current_code < min_supported_code`؛ تعرض الواجهة الحالة بوضوح. لا يُسمح بتجاوز التحقق الأمني بإعطاء رابط غير موقّع.
- المستخدم غير مسجل: يطلب تسجيل الدخول إلى الحساب الشخصي لفحص التحديثات.

## التحقق قبل نشر أي إصدار
1. نجاح `npm ci` و`npm run check:web`.
2. نجاح Android Release build.
3. نجاح `apksigner verify`.
4. حساب SHA-256 للـAPK ومطابقته مع ملف التحقق.
5. استخراج ومراجعة بصمة شهادة التوقيع ومطابقتها مع الإصدار الإنتاجي السابق عند وجوده.
6. تشغيل `npm run publish:update` فقط بعد الخطوات السابقة.
7. التأكد أن `app-update` يعيد رابطًا موقّعًا فقط عندما تكون بيانات السلامة مكتملة.
8. اختبار: لا تحديث، تحديث اختياري، تحديث إلزامي، انتهاء الرابط الموقّع، وتثبيت فوق نسخة أقدم على هاتف حقيقي مع الحفاظ على البيانات.

## الملفات
- `web/app-update-runtime.js`
- `supabase/functions/app-update/index.ts`
- `supabase/migrations/20260926215416_app_release_update_center.sql`
- `supabase/migrations/202609270001_app_release_publish_rpc.sql`
- `scripts/publish-app-update.mjs`
- `tools/check_app_update.js`
