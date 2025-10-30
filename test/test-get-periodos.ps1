# Test script for GET /api/contabilidad/periodos endpoint
# This script verifies that the endpoint returns the list of periodos contables

$baseUrl = "http://localhost:3000/api"
$endpoint = "$baseUrl/contabilidad/periodos"

Write-Host "🧪 Testing GET /api/contabilidad/periodos" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Login to get auth token
Write-Host "📝 Step 1: Logging in..." -ForegroundColor Yellow
$loginBody = @{
    email = "admin@vierdes.com"
    password = "Admin123!"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.access_token
    $tenantId = $loginResponse.user.tenant_id
    
    Write-Host "✅ Login successful" -ForegroundColor Green
    Write-Host "   Token: $($token.Substring(0, 20))..." -ForegroundColor Gray
    Write-Host "   Tenant ID: $tenantId" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Login failed: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Get periodos list
Write-Host "📅 Step 2: Getting periodos list..." -ForegroundColor Yellow

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

try {
    $response = Invoke-RestMethod -Uri $endpoint -Method Get -Headers $headers
    
    Write-Host "✅ GET request successful" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Response:" -ForegroundColor Cyan
    Write-Host "   Success: $($response.success)" -ForegroundColor Gray
    Write-Host "   Total periodos: $($response.data.Count)" -ForegroundColor Gray
    Write-Host ""
    
    if ($response.data.Count -gt 0) {
        Write-Host "📋 Periodos found:" -ForegroundColor Cyan
        foreach ($periodo in $response.data) {
            Write-Host "   - ID: $($periodo.id)" -ForegroundColor Gray
            Write-Host "     Año: $($periodo.anio), Mes: $($periodo.mes)" -ForegroundColor Gray
            Write-Host "     Estado: $($periodo.estado)" -ForegroundColor Gray
            if ($periodo.fecha_cierre) {
                Write-Host "     Fecha cierre: $($periodo.fecha_cierre)" -ForegroundColor Gray
            }
            Write-Host ""
        }
    } else {
        Write-Host "ℹ️  No periodos found for this tenant" -ForegroundColor Yellow
        Write-Host "   This is normal if no periodos have been created yet" -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "✅ TEST PASSED: GET /api/contabilidad/periodos works correctly" -ForegroundColor Green
    
} catch {
    Write-Host "❌ GET request failed: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Response details:" -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "🎉 All tests completed successfully!" -ForegroundColor Green
