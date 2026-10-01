# CODEX App Store 3.0 — Supabase + Vercel + GitHub

نسخة V12 المراجعة من CODEX App Store. المتجر يعمل بواجهة متعددة الصفحات مع Supabase Auth + PostgreSQL + Storage.

## الوظائف الأساسية

- تسجيل الدخول وإنشاء الحساب.
- استعادة كلمة المرور من صفحة الدخول.
- صفحة الحساب: الاسم، الإيميل، كلمة المرور، والمفضلة.
- متجر التطبيقات مع البحث والتصنيفات وآخر التحديثات.
- صفحة تفاصيل التطبيق مع EXE/APK، الحجم، النظام، عدد التحميلات، تاريخ التحديث، ملاحظات الإصدار، المشاركة والمفضلة.
- لوحة تحكم Admin للتطبيقات والمستخدمين.
- إضافة التطبيق من EXE أو APK أو الاثنين.
- صورة التطبيق اختيارية بالكامل.
- حساب الحجم والنظام تلقائيًا.
- رفع كبير قابل للاستئناف باستخدام TUS للملفات الأكبر من 6MB، مع استخدام hostname الخاص بالتخزين.
- تعديل الملفات واستبدالها أو إزالتها، وتغيير/إزالة الصورة.
- حذف التطبيق مع تنظيف Storage.
- إنشاء مستخدم عادي أو Admin من لوحة التحكم.
- تغيير صلاحيات المستخدم وتغيير كلمة مروره وحذف المستخدم.
- عداد تحميل لكل تطبيق.
- RLS وStorage policies.
- واجهة تحميل/تقدم/نجاح/خطأ وحركات انتقال خفيفة.

## Supabase

1. افتح SQL Editor وشغّل `supabase/schema.sql` بالكامل على قاعدة البيانات الحالية.
2. لا تنفذ أي `DROP TABLE` لإعادة إنشاء قاعدة البيانات؛ الملف migration آمن ويضيف الأعمدة الناقصة فقط.
3. أنشئ أول حساب من `login.html` أو من Authentication > Users.
4. اجعل الحساب الأول Admin من SQL بعد التأكد من البريد:

```sql
update public.profiles
set role='admin'
where email='YOUR_ADMIN_EMAIL';
```

5. تأكد أن Bucket اسمه `app-files` وحالته Public. ملف الـSQL يضبطه ويزيل قيود MIME/الحجم القديمة من مستوى الـbucket، مع إبقاء الرفع محميًا للأدمن عبر policies.
6. في Authentication > URL Configuration أضف دومين الموقع في Vercel و`http://localhost:5173` للتجربة المحلية. هذا مطلوب أيضًا لرابط استعادة كلمة المرور.

## Edge Functions

المشروع يحتوي على:

- `supabase/functions/create-admin`
- `supabase/functions/admin-set-role`
- `supabase/functions/admin-reset-password`
- `supabase/functions/admin-delete-user`

انشرها باستخدام Supabase CLI بعد تسجيل الدخول وربط المشروع:

```bash
supabase functions deploy create-admin
supabase functions deploy admin-set-role
supabase functions deploy admin-reset-password
supabase functions deploy admin-delete-user
```

الـEdge Functions تتعامل مع مفاتيح Supabase السرية من بيئة الوظيفة. لا تضع Service Role/Secret Key في Frontend أو `.env.local`.

## تشغيل محلي

ضع متغيرات الواجهة في `.env.local`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

ثم:

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

الناتج داخل `dist`.

## Vercel

- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Environment Variables: `VITE_SUPABASE_URL` و`VITE_SUPABASE_PUBLISHABLE_KEY`
- `vercel.json` لا يحتوي على catch-all rewrite؛ الصفحات `index.html`, `login.html`, `account.html`, `app.html`, `dashboard.html` تُبنى كـ MPA.

## ملاحظات رفع الملفات

الرفع العادي مناسب للملفات الصغيرة. النسخة تستخدم `tus-js-client` للملفات التي تتجاوز 6MB، مع progress وretry، لأن Supabase توصي بالرفع المتدرج لهذه الملفات.


## V12 Performance

- لا يوجد Fullscreen loader مع كل تنقل أو كل ضغطة زر.
- التفاعل البصري محدود بالـhover/focus فقط للحفاظ على السرعة.
- Roboto هو الخط الأساسي.
- EXE/APK في bucket `app-files` والصور في bucket `app-icons` لتقليل تعارضات Storage.
- ملفات البرامج الأكبر من 6MB تستخدم TUS resumable uploads مع progress/retry حسب توصية Supabase.


### Upload / download behavior (V13)
- Files larger than 6MB use Supabase TUS resumable upload directly on the storage hostname.
- The app never performs a second full upload as a fallback, which avoids duplicate transfer time.
- `app_files` is saved through `save_app_file`, which handles an existing `app_platform` enum safely.
- Image upload is optional and remains separate from EXE/APK storage.
- Download counts are recorded from real download-start requests in `download_events`, deduplicated per visitor/file/day; the old increment-only RPC is disabled.
- A Supabase Free project currently has a 50MB global file-size limit; a larger app binary requires a plan/Storage setup that permits a larger limit or external object storage.


## Large EXE/APK uploads

Files above 6MB use Supabase TUS resumable uploads directly through the storage-specific hostname. The client resumes a prior TUS upload when the same upload fingerprint is available and shows real progress, transfer speed, and ETA. Standard upload is used only for small files.

For a 500MB file, the Supabase project itself must allow at least that global file size. On the Free plan the global maximum is 50MB; paid plans can be configured much higher. Check Storage Settings before testing a 500MB upload.


## 500MB upload setup

The dashboard uses Supabase TUS resumable uploads for files above 6MB. The upload goes directly to the storage-specific hostname and uses 6MB chunks, automatic retries, resumable fingerprints, real progress, transfer speed and ETA.

For a 500MB EXE/APK, the Supabase project must allow at least 500MB at the global Storage file-size limit. The current Supabase Free plan has a 50MB maximum per file; paid plans can be configured up to 500GB. See Storage Settings in the Supabase dashboard.

The app never falls back from a large TUS upload to a second multipart upload, so a failed large upload is not restarted through another path automatically.
