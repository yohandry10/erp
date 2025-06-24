# 🏢 ERP Suite - Sistema Tributario Peruano

Sistema ERP completo para gestión tributaria peruana con soporte para CPE, GRE y SIRE.

## ⚠️ IMPORTANTE: Configuración de Archivos de Entorno

### 🔒 Archivos de Entorno
Este proyecto utiliza archivos de entorno para configurar variables sensibles. **NUNCA** envíes archivos `.env` a GitHub.

#### Archivos que NO deben enviarse a GitHub:
- `.env` - Variables de producción
- `.env.local` - Variables locales
- `.env.development.local`
- `.env.test.local`
- `.env.production.local`

#### ✅ Configuración Correcta:

1. **Copia el archivo de ejemplo:**
   ```bash
   cp env.example .env.local
   ```

2. **Edita las variables según tu entorno:**
   ```bash
   # .env.local
   SUPABASE_URL=https://tu-proyecto.supabase.co
   SUPABASE_SERVICE_KEY=tu-service-key-secreto
   NEXTAUTH_SECRET=genera-una-clave-secreta
   PFX_PASS=password-del-certificado
   ```

3. **Verifica que .gitignore funciona:**
   ```bash
   git status
   # Los archivos .env NO deben aparecer en la lista
   
   # O usa el script de verificación:
   # En Linux/Mac:
   bash scripts/check-env.sh
   
   # En Windows PowerShell:
   PowerShell -ExecutionPolicy Bypass .\scripts\check-env.ps1
   ```

#### 🛡️ Buenas Prácticas de Seguridad:
- ✅ Usa `env.example` como plantilla (sin valores reales)
- ✅ Mantén los archivos `.env` solo en tu máquina local
- ✅ Usa variables de entorno en servicios de deploy (Vercel, Render)
- ❌ NUNCA hagas commit de archivos `.env` con datos reales
- ❌ NUNCA pongas credenciales en el código fuente

#### 🚨 Si accidentalmente enviaste un .env:
```bash
# Remover del historial de Git
git rm --cached .env
git commit -m "Remove .env from tracking"

# Cambiar TODAS las credenciales comprometidas
# - Regenerar API keys en Supabase
# - Cambiar passwords de certificados
# - Rotar secretos de autenticación
```

## 🚀 Deploy Gratuito HOY

### Frontend (Vercel)
```bash
cd apps/web && vercel --prod
```

### Backend (Render Free)
1. Conecta este repo a Render
2. Dockerfile: `apps/erp-api/Dockerfile`
3. Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `PFX_PASS`

### Base de Datos (Supabase)
1. Crea proyecto en supabase.com
2. Ejecuta migraciones en SQL Editor
3. Configura Auth providers (Google)

## ☸️ Escalar a Kubernetes MAÑANA

```bash
# Build & Push
pnpm run docker:build
docker push ghcr.io/org/erp-api:latest

# Deploy
helm upgrade --install erp infra/helm/erp-suite
```

## 🛠️ Desarrollo Local

```bash
# Instalar dependencias
pnpm install

# Levantar servicios
docker-compose up -d

# Desarrollo
pnpm run dev
```

## 📁 Estructura

```
apps/
  web/          # Next.js 15 Frontend
  erp-api/      # NestJS Monolito
  worker/       # Background Jobs
libs/
  dtos/         # DTOs compartidos
  crypto/       # Firma XML
infra/
  helm/         # Charts K8s
  pipeline/     # CI/CD
```

## 🧪 Testing

```bash
pnpm run test          # Unit tests
pnpm run test:e2e      # E2E tests
pnpm run test:load     # Load testing
```

## 📋 TODO Cliente

- [ ] Obtener certificado .pfx de SUNAT
- [ ] Registrar en OSE sandbox
- [ ] Configurar DNS para K8s
- [ ] Configurar GitHub Container Registry 