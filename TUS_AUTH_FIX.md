# TUS Auth Fix

The previous error:

`Invalid Compact JWS`

means the Storage TUS endpoint received an invalid value in the `Authorization: Bearer ...` header. A Supabase publishable/anon API key is not a user JWT and must not be used as the Bearer token. The upload client now:

- reads the current Supabase Auth access token
- verifies it has JWT shape (three dot-separated parts)
- refreshes the session when needed
- sends only the user JWT in `Authorization`
- does not send the publishable key as an Authorization bearer token
- refreshes the token before every TUS request
- stops immediately on 401/403 instead of retrying a permanent auth failure
- keeps TUS resumable upload for large files
