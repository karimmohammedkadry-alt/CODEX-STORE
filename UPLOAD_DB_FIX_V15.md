# CODEX App Store V15 - Upload + DB registration fix

The upload flow was changed so the existing `app_platform` enum is never given a composite value such as `Windows + Android`.

The project now uses:
- `create_app_record(...)` RPC to map the primary platform to the exact existing enum label.
- `save_app_file(...)` RPC to map and save `app_files.platform` without changing its existing type.
- TUS resumable upload for files over 6MB on the direct storage hostname.
- Storage cleanup when DB registration fails.
- Clear HTTP status/body reporting for TUS errors.
- Token refresh before each TUS request.
- Client-side normalization so UI works with enum labels such as `windows`, `Windows`, `win`, etc.

For 500MB uploads, the Supabase project/bucket limits must still allow the requested size. TUS does not override plan or global upload-size limits.
