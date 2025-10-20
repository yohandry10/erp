#!/bin/bash

# Script para generar certificado de prueba REALISTA
# Este certificado tiene la misma estructura que los emitidos por eCert/Llama Sign

echo "🔐 Generando Certificado Digital de Prueba..."
echo "================================================"

# Crear directorio para certificados
mkdir -p certs

# Datos del certificado (simula una empresa peruana)
COUNTRY="PE"
STATE="Lima"
CITY="Lima"
ORG="EMPRESA DEMO SAC"
ORG_UNIT="Facturacion Electronica"
COMMON_NAME="20000000001"  # RUC de prueba
EMAIL="demo@empresa.pe"

# Contraseña del certificado
PASSWORD="Demo123456"

echo ""
echo "📋 Datos del Certificado:"
echo "   País: $COUNTRY"
echo "   Departamento: $STATE"
echo "   Ciudad: $CITY"
echo "   Organización: $ORG"
echo "   RUC: $COMMON_NAME"
echo "   Email: $EMAIL"
echo "   Contraseña: $PASSWORD"
echo ""

# 1. Generar clave privada RSA de 2048 bits (estándar de eCert)
echo "🔑 Generando clave privada RSA 2048..."
openssl genrsa -out certs/private.key 2048

# 2. Crear solicitud de certificado (CSR)
echo "📝 Creando solicitud de certificado..."
openssl req -new -key certs/private.key -out certs/certificate.csr \
  -subj "/C=$COUNTRY/ST=$STATE/L=$CITY/O=$ORG/OU=$ORG_UNIT/CN=$COMMON_NAME/emailAddress=$EMAIL"

# 3. Generar certificado auto-firmado válido por 365 días
echo "✍️  Firmando certificado (válido 365 días)..."
openssl x509 -req -days 365 -in certs/certificate.csr \
  -signkey certs/private.key -out certs/certificate.crt

# 4. Crear archivo PKCS#12 (.pfx) - FORMATO ESTÁNDAR
echo "📦 Creando archivo .pfx (PKCS#12)..."
openssl pkcs12 -export -out certs/certificado-prueba.pfx \
  -inkey certs/private.key \
  -in certs/certificate.crt \
  -name "Certificado Digital de Prueba - $ORG" \
  -passout pass:$PASSWORD

# 5. Limpiar archivos temporales
echo "🧹 Limpiando archivos temporales..."
rm certs/private.key certs/certificate.csr certs/certificate.crt

echo ""
echo "✅ ¡Certificado generado exitosamente!"
echo "================================================"
echo ""
echo "📁 Ubicación: certs/certificado-prueba.pfx"
echo "🔒 Contraseña: $PASSWORD"
echo ""
echo "📋 Información del Certificado:"
openssl pkcs12 -in certs/certificado-prueba.pfx -passin pass:$PASSWORD -nokeys -info 2>/dev/null | grep -A 5 "subject="
echo ""
echo "🎯 Cómo usar:"
echo "   1. Copia el archivo: certs/certificado-prueba.pfx"
echo "   2. En el wizard, sube este archivo"
echo "   3. Ingresa la contraseña: $PASSWORD"
echo ""
echo "⚠️  IMPORTANTE:"
echo "   - Este certificado es SOLO para desarrollo"
echo "   - NO usar en producción"
echo "   - Tiene la misma estructura que certificados reales"
echo "   - Cuando tengas el certificado real, solo cámbialo"
echo ""
