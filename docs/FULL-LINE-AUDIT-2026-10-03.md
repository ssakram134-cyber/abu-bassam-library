# التدقيق الشامل سطرًا بسطر — 2026-10-03

## نقطة البداية
- المستودع: `ssakram134-cyber/abu-bassam-library`
- فرع العمل: `repair/full-audit-2026-10-03`
- أساس الفرع: `cf0f21e97f36885f9a60af51b2017daf05c3fad8`
- عدد الملفات عند البداية: 217
- PR التدقيق: #20
- القاعدة: لا ننتقل من قسم إلى القسم التالي حتى يُفحص القسم الحالي كاملًا، تُسجل مشكلاته، تُصحح، ثم تُعاد اختبارات القسم والبناء المرتبط به.
- الحالات المسموحة: `تم ✅`، `ناقص ⚠️`، `غير موجود ❌`، `يحتاج تحقق 🔍`.
- لا يوضع `تم ✅` لمجرد وجود الكود؛ يجب التحقق الفعلي بما يناسب البند.

## ترتيب المراحل المعتمد
1. `.github/workflows` وما يستدعيه مباشرة من validators/build scripts.
2. الجذر ونقطة التشغيل والتهيئة.
3. أدوات الفحص والاختبارات داخل `tools/`.
4. WebView والبدء والتنقل واللمس ودورة الحياة.
5. المصادقة وSecureStore والبصمة واستعادة الحساب.
6. الصلاحيات والأدوار والأجهزة وحد الأجهزة.
7. الإعدادات والثيمات والخطوط وسجل العمليات والإشعارات.
8. الباركود وQR والكروت والباجات والنماذج.
9. البطاقة الوطنية/التموينية والمواكب والأظرف والشهادات وكتاب الشكر.
10. الأسئلة والقوالب واللمس والطباعة.
11. الصور والكاميرا والقص والضغط وOCR.
12. الحفظ والمستندات والأرشيف والتشفير.
13. النسخ الاحتياطي والمزامنة والعمل دون اتصال.
14. الطباعة وPDF والصور وExcel ومقاسات A4/CR80.
15. Supabase Edge Functions والهجرات والسياسات والاتصال الخارجي.
16. فحص التعارضات والتكرار والأكواد القديمة والأداء والتسريبات.
17. مطابقة الوثائق مع التنفيذ الفعلي.
18. اختبار شامل نهائي + Android build + قائمة النواقص المتبقية.

## المرحلة 1 — .github/workflows

### الملفات التي دخلت الفحص
- `.github/workflows/android.yml` — فحص كامل وتعديل.
- `.github/workflows/android-production.yml` — أُنشئ لفصل التوقيع الحقيقي عن PR/Push.
- `.github/workflows/import-source-zip.yml` — فحص كامل وتعديل.
- `tools/check_android_workflow.js` — حارس رجوع مشاكل Android workflows.
- `tools/check_import_workflow.js` — حارس مستورد ZIP والـvalidator.
- `tools/validate_imported_source.js` — validator موثوق لمصدر ZIP قبل تشغيله.
- `tools/check_project.js` — عُدّل فقط بالقدر اللازم لمطابقة معمارية workflows الجديدة.
- `scripts/build-android-local.mjs` — أصبح المصدر المركزي للبناء والتحقق والتوقيع.
- `scripts/prepare-android-assets.mjs` — قُرئ لأنه مستدعى مباشرة من البناء.
- `scripts/android-release-signing.gradle` — قُرئ لأنه جزء من التوقيع.
- `config/release-signing-certificate.sha256` — بصمة الإصدار المعتمدة.

### المشاكل المكتشفة وما تم إصلاحه
- ❌ كان وجود أسرار التوقيع كافيًا لجعل PR/Push يدخل مسار توقيع الإنتاج. تم فصل الإنتاج إلى workflow يدوي مستقل على `main`.
- ❌ كان Workflow الاختبارات يحتوي مراجع مباشرة لأسرار الإنتاج. أصبح `android.yml` بلا أي `secrets.*` أو متغيرات مفتاح إنتاج.
- ⚠️ كان منطق `check:web/prebuild/Gradle/apksigner` مكررًا بين YAML وسكربت البناء. تم توحيده في `scripts/build-android-local.mjs`.
- ❌ بصمة شهادة الإصدار كانت ملفًا موجودًا دون فرض مطابقة فعلية. البناء الإنتاجي المحلي/CI يرفض الآن أي شهادة لا تطابق SHA-256 المعتمدة.
- ⚠️ Actions كانت تستخدم tags متحركة. أصبحت `checkout/setup-node/setup-java/upload-artifact` مثبتة إلى full immutable commit SHA.
- ⚠️ runner غير مثبت. أصبح `ubuntu-24.04`.
- ⚠️ Builds المتكررة لنفس PR كانت تتزاحم. أضيف concurrency وإلغاء النسخة الأقدم من build الاختباري.
- ❌ اسم APK كان hard-coded إلى الإصدار 4.3.2. أصبح مشتقًا من `package.json`.
- ⚠️ اختيار APK في سكربت البناء كان يأخذ أول ملف يجده. أصبح البناء يرفض إذا لم يجد **APK واحدًا بالضبط**.
- ⚠️ ملفات `dist` القديمة كان يمكن أن تبقى محليًا. أصبح سكربت البناء ينظف مخرجات APK/Hash/Certificate/Build-Type القديمة قبل إنتاج الجديدة.
- ❌ مستورد ZIP كان يستطيع استبدال validator الموثوق. أصبح validator مستثنى من rsync وتُفحص بصمته ومطابقته byte-for-byte.
- ❌ validator القديم كان يطلب `repair:source` وpatch runtimes يمنعها المشروع الحالي. أزيل التعارض ومنعت عودة هذه الملفات.
- ❌ validator القديم كان يطلب `web/fail-closed-runtime.js` رغم أن الاختبارات الحالية تعتبره patch قديمًا ممنوعًا. تم تحديث validator إلى معمارية fail-closed الحالية.
- ❌ validator كان يستخدم `node --check` على `index.js` الذي يحتوي React Native JSX، فينتج فشلًا وهميًا. استُثني مدخل JSX من Node الخام ويُتحقق منه فعليًا بواسطة Metro/Gradle أثناء Android build.
- ❌ فحص اسم المصمم السابق كان يطابق نص الاختبار نفسه داخل `tools/check_project.js`. أصبح فحص الهوية موجّهًا للملفات غير الاختبارية مع بقاء اختبار المنع نفسه فعالًا.
- ❌ إصدار التطبيق/build داخل validator كان hard-coded. أصبح يعتمد baseline موثوقًا، يمنع downgrade في semantic version وAndroid versionCode، ويجبر زيادة versionCode عند تغيير الإصدار.
- ❌ لم يكن validator يتحقق من هوية root package داخل `package-lock.json`. أضيف التحقق.
- ⚠️ مسار ZIP كان أوسع من اللازم. أصبح relative `.zip` داخل workspace فقط مع منع symlink وescape.
- ⚠️ ZIP لم يمنع entries مشفرة أو control characters أو duplicate normalized paths. أضيف المنع.
- ⚠️ ZIP يسمح بأحجام قد تتحول إلى archive bomb. أضيف حد 5000 entry، 100MB للملف الواحد، و500MB إجمالي غير مضغوط.
- ⚠️ مصدر ZIP كان قد يحتوي ملفات توقيع/أسرار. preflight والvalidator يرفضان أسماء/امتدادات الأسرار والتوقيع المعروفة.
- ⚠️ تشغيل `npm ci` على المصدر المستورد قد ينفذ lifecycle scripts. أصبح `npm ci --ignore-scripts` فقط للتحقق من lockfile.
- ✅ مستورد ZIP لا يكتب إلى `main`: ينشئ `source-import-...` ويفتح PR للمراجعة.
- ✅ PR الخاص بمصدر ZIP لا يشغّل المصدر المستورد تلقائيًا. بعد مراجعة الفرق، تطلب رسالة PR تشغيل Android test workflow يدويًا على فرع الاستيراد قبل الدمج.

### تحقق CI وإغلاق المرحلة 1
- تم ✅ على commit `7a240135fc3f53bbfe0aa6f07bd372faf3a2d3dc` عبر run `37077936169`.
- تم ✅ `npm ci --no-audit --no-fund`.
- تم ✅ `npm run build:apk:local` بما يتضمن فحوص الويب وAndroid prebuild وGradle وbundle و`apksigner`.
- تم ✅ إثبات أن الناتج Test release وليس Production.
- تم ✅ رفع Artifact مرتبط بنفس source SHA: `abu-bassam-android-test-7a240135fc3f53bbfe0aa6f07bd372faf3a2d3dc`.
- يحتاج تحقق 🔍: التوقيع الإنتاجي الحقيقي بالمفتاح السري؛ لا يعمل داخل PR عمدًا، ومساره محصور بـmanual/main مع بصمة شهادة إلزامية.
- **حالة المرحلة 1: تم ✅**


## المرحلة 2 — الجذر ونقطة التشغيل والتهيئة

### الملفات التي فُحصت
- `.gitignore`
- `package.json`
- `package-lock.json` (هوية/إصدار/اعتمادات الجذر)
- `app.json`
- `index-auth.js`
- `index.js`
- وجود `assets/icon.png`

### المشاكل المصححة
- تم ✅ إزالة تكرار قواعد `output/` و`*.pyc` من `.gitignore`.
- تم ✅ إلغاء النسخة وbuild number الثابتين داخل `index.js` وربطهما مباشرةً بـ`app.json`.
- تم ✅ رفع حد Node المعلن إلى `>=20.19 <25` لمطابقة الحد الأدنى لـExpo SDK 54، وتحديث lockfile والـvalidator المرتبط.
- تم ✅ منع `printBase64` من محاولة طباعة أنواع ملفات غير مدعومة؛ الطباعة المباشرة الأصلية أصبحت للصور وPDF فقط مع خطأ واضح لبقية الأنواع.
- تم ✅ وضع حد أقصى 8192 محرفًا لرابط مصادقة deep-link قبل تخزينه في SecureStore.
- تم ✅ حذف أمر iOS غير المدعوم فعليًا من `package.json`.
- تم ✅ تثبيت المشروع صراحةً كـAndroid-only في `app.json`.
- تم ✅ ضبط `expo-camera` على `recordAudioAndroid:false` وإزالة خيارات iOS الميتة من إعداد Android.
- تم ✅ مطابقة `package.json` و`package-lock.json` و`app.json` في الإصدار والهوية الأساسية.
- تم ✅ وجود ملف الأيقونة المشار إليه فعليًا.

### تحقق CI وإغلاق المرحلة 2
- تم ✅ على commit `f17cc7e4ce10ec2e81e46c1826491a0de5cd9643` عبر run `37080275420`.
- تم ✅ تثبيت الاعتمادات المقفلة.
- تم ✅ `check:web`.
- تم ✅ Android prebuild/Gradle وبناء APK.
- تم ✅ التحقق من توقيع Test release.
- تم ✅ منع Production في مسار الاختبار.
- تم ✅ رفع Artifacts.
- **حالة المرحلة 2: تم ✅**

## المرحلة 3 — أدوات الفحص والاختبارات داخل tools

### نطاق الفحص
- تم فحص 36 ملفًا داخل `tools/`.
- منها 33 ملف `check_*.js`، وثلاث أدوات مساعدة: `qr_matrix.js` و`render_card_previews.py` و`validate_imported_source.js`.
- تم ✅ التحقق أن كل ملفات `check_*.js` الـ33 مرتبطة بـ`check:web` مرة واحدة بالضبط ولا يوجد checker يتيم أو مكرر في الأمر.

### المشاكل المكتشفة والمصححة
- تم ✅ إزالة فرض الإصدار الثابت `4.3.2` و`versionCode 432` من `check_project.js`. الاختبار يتحقق الآن من semantic version واتساق package/app وكون versionCode عددًا صحيحًا موجبًا.
- تم ✅ إضافة اختبارات رجوع تمنع إزالة حد طول رابط المصادقة `MAX_AUTH_CALLBACK_LENGTH`.
- تم ✅ جعل validator المستورد يفرض Android-only و`recordAudioAndroid:false` وحد رابط المصادقة.
- تم ✅ إزالة بيانات دخول تبدو حقيقية من `render_card_previews.py` واستبدالها ببيانات demo غير حقيقية.
- تم ✅ توسيع `check_repository_hygiene.js` ليشمل `tools/` وملفات Python، مع منع Gmail شخصي داخل مولد معاينات تسجيل الدخول.
- تم ✅ إزالة العدد الثابت 214 من فحص الصلاحيات؛ أصبح الاختبار يقارن مجموعة صلاحيات الواجهة بمجموعة صلاحيات الخادم exact-set ويكشف النقص في أي اتجاه.
- تم ✅ إزالة حد ثابت هش لمجموعة admin-only؛ أصبحت مجموعة admin-only في الواجهة والخادم متطابقة exact-set.
- تم ✅ اكتشاف تعارض حقيقي: checker كان يفرض `jsonb_object_length(p_permissions)` رغم أن PostgreSQL لا يوفر هذه الدالة. تم إصلاح migration إلى عد المفاتيح عبر `jsonb_object_keys`، وأصبح الاختبار يمنع عودة الدالة غير المدعومة.
- تم ✅ تشغيل CI النهائي على commit `c7df4a5ee75235f2e7d0cd2b739f3ffea7399dcf` عبر run `37098446447`.
- تم ✅ `check:web` ثم Android prebuild/Gradle وAPK والتوقيع الاختباري ورفع Artifact.
- تم ✅ Artifact: `abu-bassam-android-test-c7df4a5ee75235f2e7d0cd2b739f3ffea7399dcf`.
- **حالة المرحلة 3: تم ✅**

## المرحلة 4 — WebView والبدء والتنقل واللمس ودورة الحياة

### مشاكل تشغيل مؤكدة ومصححة
- ❌ كان زر الرجوع يغلق `.sheet.show` بإزالة class من اللوحة فقط ويترك `#sheetBackdrop.show` فوق الشاشة؛ النتيجة واجهة ظاهرة لكن اللمس محجوب. تم ربط الإغلاق بدالة `closeSheets()` وتنظيف أي backdrop يتيم.
- ❌ معاينة الورقة المكبرة `#paperZoomOverlay.show` لم تكن ضمن طبقات زر الرجوع. أضيفت إلى ترتيب الإغلاق وتستخدم `closePaperZoom()`.
- ❌ حراس صلاحيات الفرع كانوا يعملون قبل اكتمال هوية الجهاز؛ أثناء الدور الفارغ كانوا يعاملون الواجهة كفرع بلا صلاحيات، ما يعطّل/يخفي عناصر قبل دخول الأدمن.
- ❌ بعض الأزرار ونافذة الإعدادات التي عُطلت بهذه المرحلة لم يكن لها مسار استعادة بعد ثبوت دور الأدمن. أضيفت استعادة reversible لا تغيّر إلا العناصر التي عطّلها الحارس نفسه.
- ✅ أضيف الاستماع إلى `abu-bassam-security-state` حتى يعاد تطبيق/استعادة الواجهة بعد تعيين `currentDevice` الحقيقي، لا عند حدث Supabase المبكر فقط.
- 🔍 يلزم CI على head الجديد قبل اعتماد هذه الإصلاحات، ثم يستمر فحص WebView/دورة الحياة والأمان.

## قراءة تمهيدية قبل اعتماد الترتيب الجديد
هذه الملفات قُرئت قبل أن يحدد المستخدم أن البداية الرسمية يجب أن تكون workflows. لا تُعد مرحلة مغلقة ولا تمنحها حالة `تم ✅`:
- `AGENTS.md`
- `.gitignore`
- `package.json`
- `app.json`
- `index-auth.js`
- `index.js`
