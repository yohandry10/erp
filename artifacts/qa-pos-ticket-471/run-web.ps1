$ErrorActionPreference = 'Stop'
$env:NEXT_PUBLIC_API_URL = 'http://127.0.0.1:14651'
$env:NEXT_PUBLIC_API_PROXY = 'true'
$env:NEXT_PUBLIC_COOKIE_AUTH = 'true'
$env:NEXT_PUBLIC_FEATURE_POS_ENABLED = 'true'
$env:NEXT_DIST_DIR = '.next-qa-pos-471'

Set-Location 'C:\Users\PC\Desktop\erp\apps\web'
& pnpm.cmd exec next dev -p 14650
