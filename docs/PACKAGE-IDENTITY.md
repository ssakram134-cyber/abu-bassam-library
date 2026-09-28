# هوية الحزمة والبيانات — البناء النظيف 2026-09-28

توجد ثلاث هويات Android في تاريخ المشروع:

| السلسلة | الحزمة | الحالة |
|---|---|---|
| Android v3.0 القديمة | `com.abubassam.libraryphotos3` | سلسلة قديمة |
| Android v3.2 ثم v4.x السابقة | `com.abubassam.librarycamera3` | سلسلة البيانات السابقة |
| البناء النظيف الجديد | `com.abubassam.library.rebuild` | الهوية المعتمدة للبناء الجديد |

البناء الجديد يستخدم `com.abubassam.library.rebuild` عمدًا حتى يحصل Android على مساحة بيانات مستقلة تمامًا عن الحزم السابقة. اسم التطبيق الظاهر يبقى **مكتبة أبو بسام** وصورة التطبيق تبقى من `assets/icon.png` دون تغيير.

كما أن `android.allowBackup=false` معتمد لهذا البناء، حتى لا يستعيد Android تلقائيًا بيانات تطبيق قديمة إلى مساحة التطبيق الجديدة. النسخ الاحتياطي والمزامنة اللذان ينفذهما التطبيق نفسه يبقيان ميزات مستقلة ولا يعتمدان على Android Auto Backup.

هذه الهوية يجب أن تبقى ثابتة في الإصدارات اللاحقة المبنية فوق هذا البناء الجديد، حتى تعمل التحديثات المستقبلية على نفس التطبيق دون إنشاء مساحة بيانات أخرى.

للتحقق عبر ADB:

```bash
adb shell pm list packages | grep com.abubassam
adb shell dumpsys package com.abubassam.library.rebuild | grep versionName
```
