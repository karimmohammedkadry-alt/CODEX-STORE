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
