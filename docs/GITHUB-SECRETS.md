# متغيرات وأسرار GitHub Actions

هذا المستودع خاص بتطبيق **مكتبة أبو بسام للتصوير والقرطاسية** فقط.

## البناء التجريبي

لا يحتاج أي Secret.

**الحالة الحالية بتاريخ 2026-10-12:** ملف `.github/workflows/android.yml` لا ينفذ بناء APK تلقائياً؛ يعمل عبر `workflow_dispatch` فقط، ووظيفة البناء نفسها معطلة بشرط `if: ${{ false }}` امتثالاً لقرار المستخدم (تصحيح المصادر فقط داخل GitHub). عند اعتماد بناء محلي مستقل في وقت لاحق، لا يلزم Secret GitHub لإنشاء APK تجريبي. الصيغة النظرية لوسم النسخة التجريبية في `BUILD_TYPE.txt` هي:

`test-release-default-key-with-embedded-js-NOT-FOR-PRODUCTION-UPDATES`

هذا APK صالح للاختبار فقط، ولا يُعتمد كتحديث إنتاجي للمستخدمين.

## بناء Release موقّع للتحديث

أضف القيم التالية من:

`Settings → Secrets and variables → Actions → New repository secret`

1. `ANDROID_KEYSTORE_BASE64`
   - ملف مفتاح التوقيع الأصلي بعد تحويله كاملًا إلى Base64.
   - يجب أن يكون مفتاح سلسلة الإصدارات السابقة نفسها حتى يقبل Android النسخة كتحديث.
   - Workflow الحالي يقرأ الملف كـ PKCS12 (`.p12`).

2. `ANDROID_KEYSTORE_PASSWORD`
   - كلمة مرور ملف PKCS12.

3. `ANDROID_KEY_ALIAS`
   - اسم المفتاح داخل ملف التوقيع.

4. `ANDROID_KEY_PASSWORD`
   - كلمة مرور المفتاح نفسه.

**لا يتم حالياً تشغيل بناء الإنتاج داخل GitHub Actions ولو ضُبطت الأسرار**؛ هذا المسار معطل. إذا صدر لاحقاً قرار صريح لتفعيله، يلزم تدقيق مفاتيح التوقيع أولاً. مسار البناء المحلي المعتمد هو Expo/Gradle وفق `AGENTS.md`.

عند طلب Production صراحةً، يفشل Workflow إذا كان أي Secret ناقصًا، ويتحقق بعد البناء من أن `BUILD_TYPE.txt` يحتوي:

`signed-production-release-with-embedded-js`

لا تكتب أي كلمة مرور أو ملف توقيع داخل المصدر أو README أو Issues.

## Supabase

المزامنة الاختيارية في الإصدار الحالي تستخدم Supabase Publishable Key للعميل مع RLS. هذا ليس `service_role` ولا مفتاح خادم سري، ولذلك لا يحتاج Workflow الحالي إلى Secret خاص بـ Supabase.

ميزة AI PRO تستدعي Supabase Edge Function. إذا احتاجت الدالة `OPENAI_API_KEY` أو `GEMINI_API_KEY` أو رمز PRO خاصًا بها، فتوضع هذه القيم في **Supabase Edge Function Secrets** وليس في GitHub ولا داخل APK.

## غير مطلوب كـ GitHub Secret حاليًا

لا تنشئ القيم التالية داخل GitHub لهذا الإصدار ما لم نغير بنية البناء لاحقًا:

- `TELEGRAM_BOT_TOKEN`
- `GOOGLE_CLIENT_SECRET`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

يجب ألا يحتوي APK على مفاتيح خادم سرية.
