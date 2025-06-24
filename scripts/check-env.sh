#!/bin/bash

# 🔍 Script para verificar configuración de archivos de entorno
# Uso: bash scripts/check-env.sh

echo "🔍 Verificando configuración de archivos de entorno..."
echo ""

# Verificar que .gitignore incluye archivos .env
echo "✅ Verificando .gitignore:"
if grep -q "\.env" .gitignore; then
    echo "   ✓ .gitignore incluye archivos .env"
else
    echo "   ❌ .gitignore NO incluye archivos .env"
    echo "   Agregue las siguientes líneas a .gitignore:"
    echo "   .env"
    echo "   .env.local"
    echo "   .env.*.local"
fi

echo ""

# Verificar que env.example existe
echo "✅ Verificando archivo de ejemplo:"
if [ -f "env.example" ]; then
    echo "   ✓ env.example existe"
else
    echo "   ❌ env.example NO existe"
    echo "   Cree este archivo como plantilla"
fi

echo ""

# Verificar archivos .env en el directorio actual
echo "🚨 Verificando archivos .env en el directorio:"
env_files=(
    ".env"
    ".env.local"
    ".env.development.local"
    ".env.test.local"
    ".env.production.local"
)

found_env=false
for file in "${env_files[@]}"; do
    if [ -f "$file" ]; then
        echo "   📁 Encontrado: $file"
        found_env=true
    fi
done

if [ "$found_env" = false ]; then
    echo "   ✓ No se encontraron archivos .env"
    echo "   💡 Para comenzar: cp env.example .env.local"
fi

echo ""

# Verificar git status
echo "🔄 Verificando estado de Git:"
git_status=$(git status --porcelain 2>/dev/null | grep "\.env")
if [ -z "$git_status" ]; then
    echo "   ✓ No hay archivos .env pendientes de commit"
else
    echo "   ❌ ALERTA: Archivos .env detectados en git status:"
    echo "$git_status"
    echo "   Ejecute: git rm --cached [archivo]"
fi

echo ""
echo "✅ Verificación completada"
echo "💡 Recuerde: NUNCA haga commit de archivos .env con credenciales reales" 