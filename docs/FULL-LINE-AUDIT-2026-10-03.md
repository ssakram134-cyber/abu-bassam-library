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

### تحقق CI حتى الآن
- ✅ جولة سابقة بعد إصلاح validator اجتازت `npm run check:web`.
- ✅ الجولة نفسها اجتازت `android:prebuild`.
- 🔍 نتيجة CI النهائية المطلوبة هي **آخر commit في PR #20 فقط**؛ أي نتيجة لcommit أقدم لا تُغلق المرحلة.
- 🔍 تشغيل الإنتاج بالمفتاح الحقيقي لا يتم داخل PR عمدًا. `android-production.yml` لا يعمل إلا يدويًا وعلى `main`، ومطابقة الشهادة مفروضة داخل سكربت البناء.

### شرط إغلاق المرحلة 1
تتحول المرحلة إلى `تم ✅` فقط عندما ينجح آخر head في PR #20 في:
1. `npm ci --no-audit --no-fund`.
2. `npm run build:apk:local`، والذي يتضمن `check:web` + `android:prebuild` + `assembleRelease` + فحص bundle + `apksigner`.
3. إثبات أن الناتج Test release وليس Production.
4. رفع APK + SHA256 + شهادة التوقيع كـArtifacts.
5. بقاء Workflow الإنتاج منفصلًا/manual/main-only مع بصمة شهادة إلزامية.

## قراءة تمهيدية قبل اعتماد الترتيب الجديد
هذه الملفات قُرئت قبل أن يحدد المستخدم أن البداية الرسمية يجب أن تكون workflows. لا تُعد مرحلة مغلقة ولا تمنحها حالة `تم ✅`:
- `AGENTS.md`
- `.gitignore`
- `package.json`
- `app.json`
- `index-auth.js`
- `index.js`
