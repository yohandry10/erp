# 🚀 Guía de Inicio - ERP Suite

## ❌ Problema Actual

Los errores "Failed to fetch" ocurren porque **el servidor backend no está corriendo**.

## ✅ Solución: Iniciar los Servidores

### Opción 1: Iniciar Todo (Recomendado)

Abre una terminal en la raíz del proyecto y ejecuta:

```powershell
pnpm dev
```

Esto iniciará:
- ✅ Backend (NestJS) en `http://localhost:3002`
- ✅ Frontend (Next.js) en `http://localhost:3000` o `3001`

### Opción 2: Iniciar Solo el Backend

```powershell
cd apps/erp-api
pnpm dev
```

### Opción 3: Iniciar Cada Uno por Separado

**Terminal 1 - Backend:**
```powershell
cd apps/erp-api
pnpm dev
```

**Terminal 2 - Frontend:**
```powershell
cd apps/web
pnpm dev
```

## 🔍 Verificación

### Backend Iniciado Correctamente

Deberías ver en la consola:

```
🚀 Servidor corriendo en puerto 3002
🔒 Seguridad habilitada: Helmet, Rate Limiting, Compression
📚 Documentación disponible en http://localhost:3002/api/docs
🔗 CORS configurado para entornos permitidos
```

### Frontend Iniciado Correctamente

Deberías ver:

```
✓ Ready in Xms
○ Local: http://localhost:3000
```

## 🧪 Probar la Conexión

Una vez iniciados ambos servidores, abre tu navegador en:

- **Frontend**: http://localhost:3000
- **API Docs**: http://localhost:3002/api/docs
- **Health Check**: http://localhost:3002/api/health

## 🐛 Solución de Problemas

### Error: Puerto 3002 ya en uso

```powershell
# Encontrar el proceso
netstat -ano | findstr :3002

# Matar el proceso (reemplaza PID con el número que aparece)
taskkill /PID <PID> /F
```

### Error: Puerto 3000 ya en uso

```powershell
# Encontrar el proceso
netstat -ano | findstr :3000

# Matar el proceso
taskkill /PID <PID> /F
```

### Error: pnpm no encontrado

```powershell
# Instalar pnpm globalmente
npm install -g pnpm

# Verificar instalación
pnpm --version
```

### Error: Dependencias faltantes

```powershell
# Instalar todas las dependencias
pnpm install
```

## 📝 Notas Importantes

1. **Siempre inicia el backend primero** si los inicias por separado
2. El backend debe estar corriendo en el puerto **3002**
3. El frontend debe estar corriendo en el puerto **3000** o **3001**
4. Ambos servidores deben estar corriendo simultáneamente para que la aplicación funcione

## 🔗 URLs Importantes

| Servicio | URL | Descripción |
|----------|-----|-------------|
| Frontend | http://localhost:3000 | Aplicación web |
| Backend API | http://localhost:3002/api | API REST |
| Swagger Docs | http://localhost:3002/api/docs | Documentación interactiva |
| Dashboard | http://localhost:3000/dashboard | Panel de control |
| Wizard | http://localhost:3000/dashboard/wizard | Asistente de configuración |

## 🎯 Próximos Pasos

Una vez que ambos servidores estén corriendo:

1. Abre http://localhost:3000
2. Inicia sesión o regístrate
3. Completa el wizard de configuración
4. ¡Comienza a usar el sistema!

---

**¿Necesitas ayuda?** Revisa los logs en la consola donde iniciaste los servidores.
