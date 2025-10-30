# Test script for reopening a closed accounting period (superadmin only)
# This endpoint requires superadmin privileges

$baseUrl = "http://localhost:3000/api"
$token = "YOUR_SUPERADMIN_JWT_TOKEN_HERE"

# Headers
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = "550e8400-e29b-41d4-a716-446655440000"
}

Write-Host "🧪 Testing POST /api/contabilidad/periodos/:id/reabrir (superadmin only)" -ForegroundColor Cyan
Write-Host ""

# Step 1: Get list of periods to find a closed one
Write-Host "📋 Step 1: Getting list of periods..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/periodos" -Method Get -Headers $headers
    Write-Host "✅ Periods retrieved successfully" -ForegroundColor Green
    
    # Find a closed period
    $closedPeriod = $response.data | Where-Object { $_.estado -eq "CERRADO" } | Select-Object -First 1
    
    if ($closedPeriod) {
        Write-Host "Found closed period: $($closedPeriod.anio)-$($closedPeriod.mes) (ID: $($closedPeriod.id))" -ForegroundColor Cyan
        $periodoId = $closedPeriod.id
    } else {
        Write-Host "⚠️ No closed periods found. Please close a period first." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "You can close a period using: POST /api/contabilidad/periodos/:id/cerrar" -ForegroundColor Yellow
        exit
    }
} catch {
    Write-Host "❌ Error getting periods: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

Write-Host ""

# Step 2: Reopen the closed period (superadmin only)
Write-Host "🔓 Step 2: Reopening period $periodoId..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/periodos/$periodoId/reabrir" -Method Post -Headers $headers
    Write-Host "✅ Period reopened successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response:" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 10
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
    
    if ($statusCode -eq 403) {
        Write-Host "❌ Access denied: Superadmin privileges required" -ForegroundColor Red
        Write-Host "Error: $($errorBody.message)" -ForegroundColor Red
    } elseif ($statusCode -eq 400) {
        Write-Host "❌ Bad request: $($errorBody.message)" -ForegroundColor Red
    } else {
        Write-Host "❌ Error reopening period: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""

# Step 3: Verify the period is now open
Write-Host "✅ Step 3: Verifying period status..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/periodos/$periodoId" -Method Get -Headers $headers
    Write-Host "Period status: $($response.data.estado)" -ForegroundColor Cyan
    
    if ($response.data.estado -eq "ABIERTO") {
        Write-Host "✅ Period successfully reopened!" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Period status is: $($response.data.estado)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Error verifying period: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "🎉 Test completed!" -ForegroundColor Green
