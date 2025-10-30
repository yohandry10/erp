# Script to apply migration 036 directly to Supabase using REST API

$supabaseUrl = "https://ifivjoflcplenrgiyrmz.supabase.co"
$serviceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmaXZqb2ZsY3BsZW5yZ2l5cm16Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTg2NzgyOCwiZXhwIjoyMDY1NDQzODI4fQ.Q01aMPFoarrNtiCuVvx10TgayS37_vB1Az1joHC5Hvo"

Write-Host "=== Applying Migration 036: Add Cancellation Fields ===" -ForegroundColor Cyan
Write-Host ""

# SQL to add the missing columns
$sql = @"
-- Add cancellation fields to ordenes_compra
ALTER TABLE ordenes_compra ADD COLUMN IF NOT EXISTS cancelado_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ordenes_compra ADD COLUMN IF NOT EXISTS cancelado_by UUID;
ALTER TABLE ordenes_compra ADD COLUMN IF NOT EXISTS motivo_cancelacion TEXT;
ALTER TABLE ordenes_compra ADD COLUMN IF NOT EXISTS rechazado_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ordenes_compra ADD COLUMN IF NOT EXISTS rechazado_by UUID;
ALTER TABLE ordenes_compra ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;

-- Add comments
COMMENT ON COLUMN ordenes_compra.cancelado_at IS 'Fecha y hora de cancelación de la orden';
COMMENT ON COLUMN ordenes_compra.cancelado_by IS 'ID del usuario que canceló la orden';
COMMENT ON COLUMN ordenes_compra.motivo_cancelacion IS 'Motivo de la cancelación de la orden';
COMMENT ON COLUMN ordenes_compra.rechazado_at IS 'Fecha y hora de rechazo de la orden';
COMMENT ON COLUMN ordenes_compra.rechazado_by IS 'ID del usuario que rechazó la orden';
COMMENT ON COLUMN ordenes_compra.motivo_rechazo IS 'Motivo del rechazo de la orden';
"@

Write-Host "Executing SQL..." -ForegroundColor Yellow
Write-Host $sql -ForegroundColor Gray
Write-Host ""

try {
    # Use Supabase REST API to execute SQL
    $headers = @{
        "apikey" = $serviceKey
        "Authorization" = "Bearer $serviceKey"
        "Content-Type" = "application/json"
    }
    
    $body = @{
        query = $sql
    } | ConvertTo-Json
    
    $response = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/rpc/exec_sql" -Method Post -Headers $headers -Body $body
    
    Write-Host "✅ Migration applied successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Added columns to ordenes_compra:" -ForegroundColor Green
    Write-Host "  - cancelado_at (TIMESTAMP WITH TIME ZONE)" -ForegroundColor Gray
    Write-Host "  - cancelado_by (UUID)" -ForegroundColor Gray
    Write-Host "  - motivo_cancelacion (TEXT)" -ForegroundColor Gray
    Write-Host "  - rechazado_at (TIMESTAMP WITH TIME ZONE)" -ForegroundColor Gray
    Write-Host "  - rechazado_by (UUID)" -ForegroundColor Gray
    Write-Host "  - motivo_rechazo (TEXT)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Error applying migration:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "⚠️  Please apply the migration manually through Supabase Dashboard:" -ForegroundColor Yellow
    Write-Host "  1. Go to https://ifivjoflcplenrgiyrmz.supabase.co" -ForegroundColor Gray
    Write-Host "  2. Navigate to SQL Editor" -ForegroundColor Gray
    Write-Host "  3. Copy and paste the SQL above" -ForegroundColor Gray
    Write-Host "  4. Run the query" -ForegroundColor Gray
    exit 1
}
</invoke>