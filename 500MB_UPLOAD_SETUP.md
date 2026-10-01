# CODEX Store — 500MB Upload Setup

1. Supabase Dashboard → Storage → Settings.
2. Set **Global file size limit** to at least **500 MB** (prefer a little higher, for example 550 MB).
3. Open the `app-files` bucket and make sure it does not have a lower bucket limit.
4. Run `supabase/schema.sql` from this project once.
5. Deploy the Edge Functions used by the control panel.
6. Upload an EXE/APK from the dashboard.

The web app uses TUS for files above 6 MB, with 6 MB chunks, retry, resume fingerprint, real progress, speed and ETA.

Important: a database setting cannot bypass the Supabase plan-wide file-size limit. If the project is on Free, a 500 MB file will be rejected because the global maximum is 50 MB.
