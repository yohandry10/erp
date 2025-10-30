# PowerShell script to apply migration 043
# Adds match_automatico and match_id columns to movimientos_bancarios

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Applying Migration 043" -ForegroundColor Cyan
Write-Host "Add match_automatico and match_id columns" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Load environment variables
if (Test-Path .env.local) {
    Write-Host "Loading environment variables from .env.local..." -ForegroundColor Yellow
    Get-Content .env.local | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
            $key = $matches[1]
            $value = $matches[2]
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
} else {
    Write-Host "Warning: .env.local not found" -ForegroundColor Red
}

$SUPABASE_URL = $env:NEXT_PUBLIC_SUPABASE_URL
$SUPABASE_SERVICE_KEY = $env:SUPABASE_SERVICE_ROLE_KEY

if (-not $SUPABASE_URL -or -not $SUPABASE_SERVICE_KEY) {
    Write-Host "Error: SUPABASE_URL or SUPABASE_SERVICE_KEY not found in environment" -ForegroundColor Red
    exit 1
}

Write-Host "Supabase URL: $SUPABASE_URL" -ForegroundColor Green
Write-Host ""

# Read migration file
$migrationFile = "supabase/migrations/043_add_match_automatico_columns.sql"
if (-not (Test-Path $migrationFile)) {
    Write-Host "Error: Migration file not found: $migrationFile" -ForegroundColor Red
    exit 1
}

$sql = Get-Content $migrationFile -Raw
Write-Host "Migration SQL loaded from: $migrationFile" -ForegroundColor Green
Write-Host ""

# Execute migration
Write-Host "Executing migration..." -ForegroundColor Yellow

$body = @{
    query = $sql
} | ConvertTo-Json

$headers = @{
    "apikey" = $SUPABASE_SERVICE_KEY
    "Authorization" = "Bearer $SUPABASE_SERVICE_KEY"
    "Content-Type" = "application/json"
}

try {
    $response = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/rpc/exec_sql" -Method Post -Headers $headers -Body $body -ErrorAction Stop
    Write-Host "✓ Migration applied successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Changes applied:" -ForegroundColor Cyan
    Write-Host "  - Added match_automatico column (BOOLEAN)" -ForegroundColor White
    Write-Host "  - Added match_id column (UUID)" -ForegroundColor White
    Write-Host "  - Created indexes for performance" -ForegroundColor White
    Write-Host "  - Updated existing records to match_automatico = false" -ForegroundColor White
} catch {
    Write-Host "✗ Error applying migration:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    # Try alternative method using psql if available
    Write-Host ""
    Write-Host "Attempting alternative method using direct SQL execution..." -ForegroundColor Yellow
    
    $DB_URL = $env:DATABASE_URL
    if ($DB_URL) {
        try {
            $sql | psql $DB_URL
            Write-Host "✓ Migration applied successfully using psql!" -ForegroundColor Green
        } catch {
            Write-Host "✗ Alternative method also failed" -ForegroundColor Red
            Write-Host $_.Exception.Message -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "DATABASE_URL not found. Please apply migration manually." -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Migration 043 Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
