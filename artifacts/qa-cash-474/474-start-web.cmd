@echo off
set "NEXT_PUBLIC_API_URL=http://127.0.0.1:43114"
set "NEXT_PUBLIC_API_PROXY=true"
set "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321"
set "NEXT_PUBLIC_SUPABASE_ANON_KEY=local-cash-474-only"
set "DEPLOYMENT_ENV=PROD"
set "EXPECTED_SUPABASE_PROJECT_REF=wypnbcptofqdmoynlonq"
set "NEXT_DIST_DIR=.next-cash-474"
cd /d C:\Users\PC\Desktop\erp\apps\web
call "C:\Program Files\nodejs\npm.cmd" run dev -- -p 3024
