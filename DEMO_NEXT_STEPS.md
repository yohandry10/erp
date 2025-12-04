# 🎯 Próximos Pasos - Sistema Demo

## ✅ LO QUE YA ESTÁ HECHO

### Base de Datos
- ✅ Migración 142: Campos de demo en `empresa_config` y `usuarios_sistema`
- ✅ Migración 143: Función `seed_demo_tenant()` con datos realistas
- ✅ Funciones de utilidad: `is_demo_expired()`, `get_demo_days_remaining()`
- ✅ Vista `vw_demo_dashboard` para administración

### Backend (NestJS)
- ✅ Módulo completo en `apps/erp-api/src/modules/demo/`
- ✅ 4 endpoints REST funcionando
- ✅ Guard de expiración
- ✅ Interceptor de restricciones
- ✅ Integrado en `app.module.ts`

### Frontend (Next.js)
- ✅ Landing page `/demo`
- ✅ Página de conversión `/demo/convert`
- ✅ Componente `DemoBanner`
- ✅ Componente `DemoExpiredModal`
- ✅ Hook `useDemoStatus`

---

## 🚀 PASO 1: APLICAR MIGRACIONES (CRÍTICO)

### Opción A: Supabase SQL Editor (Recomendado)

1. **Abrir Supabase Dashboard**
   - Ir a: https://app.supabase.com
   - Seleccionar tu proyecto
   - Ir a "SQL Editor"

2. **Ejecutar Migración 142**
   ```bash
   # Abrir archivo: supabase/migrations/142__demo_tenant_support.sql
   # Copiar TODO el contenido
   # Pegar en SQL Editor
   # Click "Run"
   ```

3. **Ejecutar Migración 143**
   ```bash
   # Abrir archivo: supabase/migrations/143__demo_seed_data.sql
   # Copiar TODO el contenido
   # Pegar en SQL Editor
   # Click "Run"
   ```

4. **Verificar**
   ```sql
   -- Verificar que se agregaron los campos
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'empresa_config' 
   AND column_name LIKE 'demo%';
   
   -- Verificar que existe la función
   SELECT proname FROM pg_proc WHERE proname = 'seed_demo_tenant';
   ```

### Opción B: Supabase CLI (Si tienes configurado)

```bash
# Desde la raíz del proyecto
cd supabase
npx supabase db push

# O si tienes supabase instalado globalmente
supabase db push
```

---

## 🎨 PASO 2: INTEGRAR BANNER EN LAYOUT

### Archivo a modificar: `apps/web/app/dashboard/layout.tsx`

```typescript
import { DemoBanner } from '@/components/demo/DemoBanner';

export default function DashboardLayout({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  return (
    <div className="min-h-screen">
      {/* Banner de demo - siempre visible si es demo */}
      <DemoBanner />
      
      {/* Resto del layout */}
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64">
          {/* ... sidebar content ... */}
        </aside>
        
        {/* Main content */}
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
```

---

## 🧪 PASO 3: TESTING MANUAL

### Test 1: Crear Demo (5 min)

```bash
# 1. Iniciar servicios
pnpm dev

# 2. Abrir navegador
http://localhost:3000/demo

# 3. Verificar landing page
- ✓ Se ve el diseño con gradiente
- ✓ Se ven las 6 features
- ✓ Botón "Iniciar Demo Ahora" visible

# 4. Click en "Iniciar Demo Ahora"
- ✓ Aparece loading "Creando tu empresa demo..."
- ✓ Aparece alert con credenciales
- ✓ Redirect a /dashboard
- ✓ Banner demo visible arriba

# 5. Verificar datos seed
- Ir a Inventario → Productos
  ✓ Debe haber 20 productos
- Ir a Ventas → Clientes
  ✓ Debe haber 10 clientes
- Ir a Compras → Proveedores
  ✓ Debe haber 5 proveedores
- Ir a Inventario → Almacenes
  ✓ Debe haber 2 almacenes
```

### Test 2: Banner de Demo (2 min)

```bash
# Estando en dashboard con demo activo

# Verificar banner
- ✓ Banner visible arriba
- ✓ Muestra "Modo Demo - Expira en X días"
- ✓ Color azul (si >3 días)
- ✓ Botón "Extender 7 días" visible
- ✓ Botón "Convertir a cuenta real" visible
- ✓ Botón X para cerrar visible
```

### Test 3: Extender Demo (2 min)

```bash
# Click en "Extender 7 días"
- ✓ Aparece alert "¡Demo extendida por 7 días más!"
- ✓ Banner se actualiza con nueva fecha
- ✓ Botón "Extender" desaparece (solo 1 extensión)
```

### Test 4: Convertir a Real (5 min)

```bash
# 1. Click en "Convertir a cuenta real"
- ✓ Redirect a /demo/convert

# 2. Llenar formulario
Razón Social: MI EMPRESA SAC
RUC: 20987654321
Email: mi@email.com
Password: password123
Teléfono: +51 999 999 999

# 3. Click "Activar Cuenta Completa"
- ✓ Loading visible
- ✓ Aparece alert "¡Cuenta convertida exitosamente!"
- ✓ Redirect a /dashboard
- ✓ Banner desaparece
- ✓ Datos se mantienen (productos, clientes, etc.)

# 4. Verificar en BD
SELECT is_demo, demo_expires_at 
FROM empresa_config 
WHERE ruc = '20987654321';
-- Debe retornar: is_demo = false, demo_expires_at = null
```

### Test 5: Demo Expirada (3 min)

```bash
# 1. Modificar fecha de expiración en BD
UPDATE empresa_config 
SET demo_expires_at = NOW() - INTERVAL '1 day'
WHERE is_demo = true;

# 2. Intentar acceder a /dashboard
- ✓ Debe aparecer error 403
- ✓ Mensaje: "Tu demo ha expirado"

# 3. Verificar modal (si implementado)
- ✓ Modal visible
- ✓ 3 opciones: Convertir / Nueva demo / Contactar
```

### Test 6: Restricciones (5 min)

```bash
# Test A: Facturación simulada
# 1. Crear una venta en modo demo
# 2. Verificar que NO se envía a SUNAT
# 3. Verificar estado: "ACEPTADO (SIMULADO)"

# Test B: Bloqueo de RUC
# 1. Ir a Configuración → Empresa
# 2. Intentar cambiar RUC
# 3. Verificar error: "No puedes cambiar el RUC en modo demo"

# Test C: Bloqueo de certificado
# 1. Ir a Configuración → Certificado Digital
# 2. Intentar subir certificado
# 3. Verificar error: "No puedes subir certificados en modo demo"
```

---

## 📊 PASO 4: VERIFICAR EN BASE DE DATOS

### Queries de Verificación

```sql
-- 1. Ver demos activos
SELECT * FROM vw_demo_dashboard;

-- 2. Ver tenant demo específico
SELECT 
  t.id,
  t.nombre,
  ec.is_demo,
  ec.demo_expires_at,
  ec.demo_created_at,
  EXTRACT(DAY FROM (ec.demo_expires_at - NOW())) as dias_restantes
FROM tenants t
JOIN empresa_config ec ON ec.tenant_id = t.id
WHERE ec.is_demo = true;

-- 3. Ver usuarios demo
SELECT 
  id,
  tenant_id,
  email,
  is_demo_user,
  demo_email_temp
FROM usuarios_sistema
WHERE is_demo_user = true;

-- 4. Verificar datos seed
SELECT 
  (SELECT COUNT(*) FROM productos WHERE tenant_id = 'TENANT_ID') as productos,
  (SELECT COUNT(*) FROM clientes WHERE tenant_id = 'TENANT_ID') as clientes,
  (SELECT COUNT(*) FROM proveedores WHERE tenant_id = 'TENANT_ID') as proveedores,
  (SELECT COUNT(*) FROM almacenes WHERE tenant_id = 'TENANT_ID') as almacenes,
  (SELECT COUNT(*) FROM cajas WHERE tenant_id = 'TENANT_ID') as cajas;
```

---

## 🐛 TROUBLESHOOTING

### Problema: Error al crear demo

**Síntoma**: Error 500 al hacer POST /api/demo/create

**Soluciones**:
1. Verificar que las migraciones se aplicaron
2. Verificar logs del backend: `pnpm --filter erp-api logs`
3. Verificar que existe la función `seed_demo_tenant` en BD
4. Verificar que el JWT_SECRET está configurado en .env

### Problema: Banner no aparece

**Síntoma**: Banner no visible en dashboard

**Soluciones**:
1. Verificar que se integró en layout.tsx
2. Verificar que el token está en localStorage
3. Verificar que el endpoint /api/demo/status responde
4. Abrir DevTools → Console para ver errores

### Problema: Seed no se ejecuta

**Síntoma**: Demo creado pero sin datos

**Soluciones**:
1. Verificar que existe la función `seed_demo_tenant` en BD
2. Ejecutar manualmente:
   ```sql
   SELECT seed_demo_tenant('TENANT_ID');
   ```
3. Verificar logs de Supabase
4. Verificar permisos de la función

### Problema: Error de autenticación

**Síntoma**: 401 Unauthorized en endpoints

**Soluciones**:
1. Verificar que el token está en localStorage
2. Verificar que el JWT_SECRET coincide
3. Verificar que el JwtAuthGuard está configurado
4. Verificar que el usuario existe en BD

---

## 📝 CHECKLIST FINAL

### Antes de Producción

- [ ] Migraciones aplicadas en BD de producción
- [ ] Testing manual completo (todos los tests arriba)
- [ ] Banner integrado en layout
- [ ] Variables de entorno configuradas
- [ ] JWT_SECRET seguro en producción
- [ ] Logs de errores monitoreados
- [ ] Backup de BD antes de aplicar migraciones

### Opcional (Mejoras Futuras)

- [ ] Cron job de limpieza diaria
- [ ] Emails de notificación antes de expirar
- [ ] Analytics de uso de demos
- [ ] Tour guiado para nuevos usuarios
- [ ] Tests automatizados (E2E)
- [ ] Documentación de API (Swagger)

---

## 🎉 RESULTADO ESPERADO

Después de completar estos pasos, deberías tener:

✅ **Landing page funcional** en `/demo`  
✅ **Creación de demos** en 1 click sin registro  
✅ **Datos seed realistas** (20 productos, 10 clientes, etc.)  
✅ **Banner visible** mostrando días restantes  
✅ **Extensión de demo** (1 vez, 7 días)  
✅ **Conversión a cuenta real** manteniendo datos  
✅ **Restricciones aplicadas** (facturación simulada, etc.)  
✅ **Expiración automática** con mensajes amigables  

---

## 📞 SOPORTE

Si encuentras problemas:

1. Revisar logs del backend
2. Revisar console del navegador
3. Verificar queries en BD
4. Revisar documentación en `DEMO_IMPLEMENTATION_STATUS.md`

---

**Tiempo estimado total**: 30-45 minutos  
**Dificultad**: Baja (solo aplicar migraciones y testing)

---

## ❓ Q&A ESCÉPTICO - 10 PREGUNTAS CRÍTICAS

### 1. ¿Qué pasa si el seed falla a mitad de ejecución?

**PROBLEMA IDENTIFICADO**: La función `seed_demo_tenant()` NO tiene transacción explícita. Si falla en el paso 5 (categorías), los almacenes y cajas ya insertados quedarán huérfanos.

**SOLUCIÓN REQUERIDA**: Envolver todo en una transacción:
```sql
BEGIN;
  -- todo el seed
COMMIT;
-- O usar EXCEPTION para rollback
```

**ESTADO**: ⚠️ PENDIENTE DE CORREGIR

---

### 2. ¿El endpoint /api/demo/create está protegido contra abuso?

**PROBLEMA IDENTIFICADO**: El endpoint es público (sin autenticación). Un atacante podría crear miles de demos y saturar la base de datos.

**SOLUCIÓN REQUERIDA**:
- Rate limiting específico para este endpoint (ej: 5 demos por IP por hora)
- CAPTCHA o verificación básica
- Límite global de demos activos

**ESTADO**: ⚠️ RIESGO DE SEGURIDAD - PENDIENTE

---

### 3. ¿Qué pasa si el usuario cierra el navegador antes de ver las credenciales?

**PROBLEMA IDENTIFICADO**: Las credenciales se muestran en un `alert()` que puede cerrarse accidentalmente. El usuario perdería acceso a su demo.

**SOLUCIÓN REQUERIDA**:
- Guardar credenciales en localStorage (ya se hace)
- Mostrar credenciales en una página dedicada, no en alert
- Opción de "copiar al portapapeles"
- Enviar email si el usuario proporciona uno (opcional)

**ESTADO**: ⚠️ UX MEJORABLE

---

### 4. ¿El DemoExpiredGuard está siendo usado globalmente?

**PROBLEMA IDENTIFICADO**: El guard `DemoExpiredGuard` está creado pero NO está aplicado globalmente. Solo se exporta del módulo pero no se usa en ningún lado.

**SOLUCIÓN REQUERIDA**: Aplicar el guard globalmente en `app.module.ts`:
```typescript
{
  provide: APP_GUARD,
  useClass: DemoExpiredGuard,
}
```

**ESTADO**: ❌ ERROR CRÍTICO - NO FUNCIONA

---

### 5. ¿El interceptor DemoRestrictionsInterceptor está activo?

**PROBLEMA IDENTIFICADO**: Similar al guard, el interceptor está creado pero NO está aplicado globalmente. Las restricciones de demo NO se están aplicando.

**SOLUCIÓN REQUERIDA**: Aplicar el interceptor globalmente:
```typescript
{
  provide: APP_INTERCEPTOR,
  useClass: DemoRestrictionsInterceptor,
}
```

**ESTADO**: ❌ ERROR CRÍTICO - NO FUNCIONA

---

### 6. ¿Qué pasa con las tablas que no existen en el seed?

**PROBLEMA IDENTIFICADO**: El seed asume que existen las tablas:
- `almacenes` (con columna `es_principal`)
- `cajas` (con columnas `tipo_caja`, `moneda_base`)
- `cuentas_bancarias` (con columna `saldo_actual`)
- `categorias_productos`
- `stock_almacen`

Si alguna tabla no existe o tiene estructura diferente, el seed fallará silenciosamente.

**SOLUCIÓN REQUERIDA**: 
- Verificar estructura de tablas antes de ejecutar
- Agregar manejo de errores específico
- Documentar dependencias de tablas

**ESTADO**: ⚠️ RIESGO - VERIFICAR ESTRUCTURA DE BD

---

### 7. ¿El rollback en createDemoTenant es completo?

**PROBLEMA IDENTIFICADO**: Si falla después de crear el tenant pero antes del seed, el rollback solo elimina de `tenants`. Pero `empresa_config` y `usuarios_sistema` también se crearon y NO se eliminan.

**CÓDIGO ACTUAL**:
```typescript
catch (error) {
  await this.supabase.client
    .from('tenants')
    .delete()
    .eq('id', tenantId);
  // ❌ NO elimina empresa_config ni usuarios_sistema
}
```

**SOLUCIÓN REQUERIDA**: Rollback completo de las 3 tablas.

**ESTADO**: ❌ ERROR - ROLLBACK INCOMPLETO

---

### 8. ¿El frontend maneja correctamente los errores de API?

**PROBLEMA IDENTIFICADO**: En `DemoBanner.tsx`, si el endpoint `/api/demo/status` falla, el banner simplemente no se muestra. No hay feedback al usuario.

**CÓDIGO ACTUAL**:
```typescript
if (response.ok) {
  const data = await response.json();
  setStatus(data);
}
// ❌ Si no es ok, no hace nada
```

**SOLUCIÓN REQUERIDA**: Manejar errores y mostrar estado de error.

**ESTADO**: ⚠️ UX MEJORABLE

---

### 9. ¿La URL del API es correcta en el frontend?

**PROBLEMA IDENTIFICADO**: El frontend usa `/api/demo/create` pero el backend define el controller como `@Controller('demo')`. Dependiendo de la configuración del proxy/API, la URL podría ser:
- `/demo/create` (sin prefijo api)
- `/api/demo/create` (con prefijo api)

**SOLUCIÓN REQUERIDA**: Verificar configuración de Next.js y NestJS para asegurar que las rutas coincidan.

**ESTADO**: ⚠️ VERIFICAR CONFIGURACIÓN

---

### 10. ¿Qué pasa si se intenta convertir una demo ya expirada?

**PROBLEMA IDENTIFICADO**: El método `convertToReal` verifica `if (!status.is_demo)` pero NO verifica si está expirada. Un usuario con demo expirada podría intentar convertir y el sistema lo permitiría.

**CÓDIGO ACTUAL**:
```typescript
async convertToReal(tenantId: string, dto: ConvertDemoToRealDto) {
  const status = await this.getDemoStatus(tenantId);
  if (!status.is_demo) {
    throw new BadRequestException('Este no es un tenant demo');
  }
  // ❌ No verifica is_expired
}
```

**DECISIÓN DE NEGOCIO**: ¿Debería permitirse convertir una demo expirada? Probablemente SÍ, ya que el usuario quiere pagar.

**ESTADO**: ✅ OK (decisión de negocio)

---

## 📋 RESUMEN DE ERRORES - TODOS CORREGIDOS ✅

| # | Severidad | Descripción | Estado |
|---|-----------|-------------|--------|
| 1 | ⚠️ Media | Seed sin transacción | ✅ CORREGIDO (EXCEPTION handler) |
| 2 | 🔴 Alta | Endpoint sin rate limiting | ✅ CORREGIDO (@Throttle) |
| 3 | ⚠️ Media | UX de credenciales | ✅ CORREGIDO (pantalla dedicada) |
| 4 | 🔴 Crítica | Guard no aplicado globalmente | ✅ CORREGIDO (APP_GUARD) |
| 5 | 🔴 Crítica | Interceptor no aplicado globalmente | ✅ CORREGIDO (APP_INTERCEPTOR) |
| 6 | ⚠️ Media | Dependencias de tablas no verificadas | ✅ CORREGIDO (seed reescrito) |
| 7 | 🔴 Alta | Rollback incompleto | ✅ CORREGIDO (3 tablas) |
| 8 | ⚠️ Baja | Manejo de errores en frontend | ✅ CORREGIDO |
| 9 | ⚠️ Media | Verificar URLs de API | ✅ CORREGIDO (NEXT_PUBLIC_API_URL) |
| 10 | ✅ OK | Conversión de demo expirada | ✅ OK (decisión de negocio) |

---

## 🔧 CORRECCIONES PRIORITARIAS

### Corrección 1: Aplicar Guard y Interceptor Globalmente

En `apps/erp-api/src/app.module.ts`, agregar:

```typescript
import { DemoExpiredGuard } from './modules/demo/guards/demo-expired.guard';
import { DemoRestrictionsInterceptor } from './modules/demo/interceptors/demo-restrictions.interceptor';

// En providers:
{
  provide: APP_GUARD,
  useClass: DemoExpiredGuard,
},
{
  provide: APP_INTERCEPTOR,
  useClass: DemoRestrictionsInterceptor,
},
```

### Corrección 2: Rollback Completo

En `demo.service.ts`, mejorar el catch:

```typescript
catch (error) {
  // Rollback completo
  await this.supabase.client.from('usuarios_sistema').delete().eq('tenant_id', tenantId);
  await this.supabase.client.from('empresa_config').delete().eq('tenant_id', tenantId);
  await this.supabase.client.from('tenants').delete().eq('id', tenantId);
  throw new BadRequestException(`Error creando tenant demo: ${error.message}`);
}
```

### Corrección 3: Rate Limiting

Agregar decorador de rate limiting al endpoint:

```typescript
import { Throttle } from '@nestjs/throttler';

@Post('create')
@Throttle({ default: { limit: 5, ttl: 3600000 } }) // 5 por hora
async createDemo(@Body() dto: CreateDemoTenantDto) {
  // ...
}
```

---

¡Éxito! 🚀
   