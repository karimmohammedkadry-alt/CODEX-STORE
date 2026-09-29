# CODEX App Store 3.0 — Supabase + Vercel + GitHub

تم تحويل المشروع من `localStorage + IndexedDB` إلى بنية حقيقية تعتمد على **Supabase Auth + PostgreSQL + Storage**، مع تجهيز المشروع للبناء والنشر على **Vercel** وربطه بسهولة مع **GitHub**.

## ما تم نقله إلى Supabase
- تسجيل الدخول وإنشاء الحسابات: Supabase Auth.
- المستخدمون والأدوار: `profiles`.
- التطبيقات: `apps`.
- ملفات التطبيقات: `app_files`.
- ملفات EXE/APK والأيقونات: Supabase Storage bucket باسم `app-files`.
- RLS لمنع المستخدم العادي من إنشاء/تعديل/حذف التطبيقات.
- إدارة Admin من خلال Edge Functions آمنة؛ لا يوجد Service Role Key داخل Frontend.
- تغيير كلمة مرور المستخدم من Supabase Auth.
- تغيير كلمة مرور مستخدم بواسطة Admin بدون كشف كلمة المرور القديمة.
- حذف المستخدم بواسطة Admin عبر Edge Function.

## إعداد Supabase
1. أنشئ مشروعًا جديدًا في Supabase.
2. افتح SQL Editor والصق محتوى `supabase/schema.sql` وشغّله بالكامل.
3. أنشئ أول حساب من `login.html` باستخدام:
   - Email: `karimmohammedkadry@gmail.com`
   - Password: `555555`
4. إذا كان Email Confirmation مفعّلًا، أكد البريد أولًا.
5. بعد إنشاء الحساب، نفّذ آخر سطر في `supabase/schema.sql` بعد تعديل البريد عند الحاجة:
   `update public.profiles set role='admin' where email='karimmohammedkadry@gmail.com';`
6. من Supabase Authentication > URL Configuration أضف دومين Vercel بعد النشر، وأضف `http://localhost:5173` للتجربة المحلية.

### Edge Functions
المشروع يحتوي على:
- `supabase/functions/create-admin`
- `supabase/functions/admin-reset-password`
- `supabase/functions/admin-delete-user`

بعد تسجيل الدخول إلى Supabase CLI وربط المشروع، انشرها:

```bash
supabase functions deploy create-admin
supabase functions deploy admin-reset-password
supabase functions deploy admin-delete-user
```

**لا تضع** `SUPABASE_SERVICE_ROLE_KEY` في `.env` الخاص بالواجهة أو GitHub. الـService Role يستخدم داخل Edge Functions فقط.

## تشغيل محليًا
انسخ `.env.example` إلى `.env.local` ثم ضع:

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

الناتج سيكون داخل `dist`.

## Vercel
1. ارفع المشروع إلى GitHub.
2. في Vercel اختر **Import Project** من GitHub.
3. Build Command: `npm run build`.
4. Output Directory: `dist`.
5. أضف Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
6. Deploy.

ملف `vercel.json` موجود لتوجيه المسارات إلى `index.html` عند الحاجة.

## GitHub
يمكن رفع المشروع مباشرة:

```bash
git init
git add .
git commit -m "CODEX App Store 3.0 Supabase migration"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

يوجد GitHub Actions workflow في `.github/workflows/build.yml` للتأكد من أن المشروع يبني بنجاح عند كل Push/PR.

## الأمان
- Frontend يستخدم Publishable/Anon key فقط.
- لا يوجد Service Role Key في JavaScript أو `.env.example`.
- صلاحية Admin يتم فحصها في PostgreSQL عبر RLS وليس بإخفاء زر فقط.
- كلمات المرور يديرها Supabase Auth ولا يتم تخزينها في `profiles`.
- ملفات APK/EXE العامة يمكن تنزيلها عبر Storage، بينما الرفع/التعديل محمي بسياسات Admin.
