$ErrorActionPreference = 'Stop'
$env:NEXT_PUBLIC_API_URL = 'http://127.0.0.1:4010'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..\..\apps\web'))
pnpm exec next start -p 3010
