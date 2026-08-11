@echo off
set "NEXT_PUBLIC_API_URL=http://127.0.0.1:14691"
set "NEXT_PUBLIC_API_PROXY=true"
set "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321"
set "NEXT_PUBLIC_SUPABASE_ANON_KEY=local-demo-rbac-490-only"
set "DEPLOYMENT_ENV=PROD"
set "EXPECTED_SUPABASE_PROJECT_REF=wypnbcptofqdmoynlonq"
set "NEXT_DIST_DIR=.next-demo-rbac-490"
cd /d C:\Users\PC\Desktop\erp\apps\web
call "C:\Program Files\nodejs\npm.cmd" run dev -- -p 14690
