# Script PowerShell para generar certificado de prueba REALISTA en Windows
# Este certificado tiene la misma estructura que los emitidos por eCert/Llama Sign

Write-Host "🔐 Generando Certificado Digital de Prueba..." -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Verificar si OpenSSL está instalado
$opensslPath = Get-Command openssl -ErrorAction SilentlyContinue

if (-not $opensslPath) {
    Write-Host "❌ ERROR: OpenSSL no está instalado" -ForegroundColor Red
    Write-Host ""
    Write-Host "📥 Instala OpenSSL desde:" -ForegroundColor Yellow
    Write-Host "   https://slproweb.com/products/Win32OpenSSL.html" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "O usa Chocolatey:" -ForegroundColor Yellow
    Write-Host "   choco install openssl" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Crear directorio para certificados
New-Item -ItemType Directory -Force -Path "certs" | Out-Null

# Datos del certificado (simula una empresa peruana)
$COUNTRY = "PE"
$STATE = "Lima"
$CITY = "Lima"
$ORG = "EMPRESA DEMO SAC"
$ORG_UNIT = "Facturacion Electronica"
$COMMON_NAME = "20000000001"  # RUC de prueba
$EMAIL = "demo@empresa.pe"

# Contraseña del certificado
$PASSWORD = "Demo123456"

Write-Host "📋 Datos del Certificado:" -ForegroundColor Green
Write-Host "   País: $COUNTRY"
Write-Host "   Departamento: $STATE"
Write-Host "   Ciudad: $CITY"
Write-Host "   Organización: $ORG"
Write-Host "   RUC: $COMMON_NAME"
Write-Host "   Email: $EMAIL"
Write-Host "   Contraseña: $PASSWORD"
Write-Host ""

# 1. Generar clave privada RSA de 2048 bits (estándar de eCert)
Write-Host "🔑 Generando clave privada RSA 2048..." -ForegroundColor Yellow
& openssl genrsa -out certs/private.key 2048 2>$null

# 2. Crear solicitud de certificado (CSR)
Write-Host "📝 Creando solicitud de certificado..." -ForegroundColor Yellow
$subject = "/C=$COUNTRY/ST=$STATE/L=$CITY/O=$ORG/OU=$ORG_UNIT/CN=$COMMON_NAME/emailAddress=$EMAIL"
& openssl req -new -key certs/private.key -out certs/certificate.csr -subj $subject 2>$null

# 3. Generar certificado auto-firmado válido por 365 días
Write-Host "✍️  Firmando certificado (válido 365 días)..." -ForegroundColor Yellow
& openssl x509 -req -days 365 -in certs/certificate.csr -signkey certs/private.key -out certs/certificate.crt 2>$null

# 4. Crear archivo PKCS#12 (.pfx) - FORMATO ESTÁNDAR
Write-Host "📦 Creando archivo .pfx (PKCS#12)..." -ForegroundColor Yellow
& openssl pkcs12 -export -out certs/certificado-prueba.pfx `
  -inkey certs/private.key `
  -in certs/certificate.crt `
  -name "Certificado Digital de Prueba - $ORG" `
  -passout pass:$PASSWORD 2>$null

# 5. Limpiar archivos temporales
Write-Host "🧹 Limpiando archivos temporales..." -ForegroundColor Yellow
Remove-Item certs/private.key, certs/certificate.csr, certs/certificate.crt -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "✅ ¡Certificado generado exitosamente!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📁 Ubicación: certs\certificado-prueba.pfx" -ForegroundColor Cyan
Write-Host "🔒 Contraseña: $PASSWORD" -ForegroundColor Cyan
Write-Host ""

# Mostrar información del certificado
Write-Host "📋 Información del Certificado:" -ForegroundColor Green
& openssl pkcs12 -in certs/certificado-prueba.pfx -passin pass:$PASSWORD -nokeys -info 2>$null | Select-String "subject="
Write-Host ""

Write-Host "🎯 Cómo usar:" -ForegroundColor Yellow
Write-Host "   1. Abre el wizard en: http://localhost:3000/dashboard/wizard"
Write-Host "   2. Ve al paso 3 (Certificado Digital)"
Write-Host "   3. Sube el archivo: certs\certificado-prueba.pfx"
Write-Host "   4. Ingresa la contraseña: $PASSWORD"
Write-Host ""

Write-Host "⚠️  IMPORTANTE:" -ForegroundColor Red
Write-Host "   - Este certificado es SOLO para desarrollo"
Write-Host "   - NO usar en producción"
Write-Host "   - Tiene la misma estructura que certificados reales"
Write-Host "   - Cuando tengas el certificado real, solo cámbialo"
Write-Host ""

Write-Host "✨ ¡Listo para probar!" -ForegroundColor Green
