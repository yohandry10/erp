# Script to apply migration 036 to Supabase database
# This adds the cancellation fields to ordenes_compra table

Write-Host "=== Applying Migration 036: Add Cancellation Fields ===" -ForegroundColor Cyan
Write-Host ""

$migrationFile = "supabase/migrations/036_add_cancelacion_fields.sql"

if (-not (Test-Path $migrationFile)) {
    Write-Host "❌ Migration file not found: $migrationFile" -ForegroundColor Red
    exit 1
}

$migrationSQL = Get-Content $migrationFile -Raw

Write-Host "Migration SQL:" -ForegroundColor Yellow
Write-Host $migrationSQL -ForegroundColor Gray
Write-Host ""

Write-Host "⚠️  MANUAL STEP REQUIRED:" -ForegroundColor Yellow
Write-Host "Please apply this migration manually through one of these methods:" -ForegroundColor Yellow
Write-Host ""
Write-Host "Option 1: Supabase Dashboard" -ForegroundColor Cyan
Write-Host "  1. Go to https://ifivjoflcplenrgiyrmz.supabase.co" -ForegroundColor Gray
Write-Host "  2. Navigate to SQL Editor" -ForegroundColor Gray
Write-Host "  3. Copy and paste the SQL above" -ForegroundColor Gray
Write-Host "  4. Run the query" -ForegroundColor Gray
Write-Host ""
Write-Host "Option 2: Supabase CLI" -ForegroundColor Cyan
Write-Host "  supabase db push" -ForegroundColor Gray
Write-Host ""
Write-Host "After applying the migration, press Enter to continue testing..." -ForegroundColor Yellow
Read-Host

Write-Host "✅ Migration should now be applied. Continuing with tests..." -ForegroundColor Green
