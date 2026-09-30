@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo CODEX - Deploy Supabase Edge Functions
 echo ==========================================
 echo.

supabase functions deploy create-admin
if errorlevel 1 goto :fail

supabase functions deploy admin-set-role
if errorlevel 1 goto :fail

supabase functions deploy admin-reset-password
if errorlevel 1 goto :fail

supabase functions deploy admin-delete-user
if errorlevel 1 goto :fail

echo.
echo All CODEX Edge Functions deployed successfully.
pause
exit /b 0

:fail
echo.
echo Deployment failed. Check Supabase CLI login/project link.
pause
exit /b 1
