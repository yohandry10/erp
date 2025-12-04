# Plan de Implementación: Sistema DEMO Integrado al ERP

## Filosofía del Proyecto

**La Demo NO es una aplicación separada. La Demo ES el ERP Real.**

El usuario demo experimenta el sistema completo con todas sus capacidades (contabilidad automatizada, facturación electrónica, POS, inventario con kardex, etc.) pero con:
- Tenant temporal con expiración
- Datos seed realistas pre-cargados
- Restricciones opcionales de seguridad

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│              ERP REAL (apps/web + erp-api)              │
├─────────────────────────────────────────────────────────┤
│  Usuario Normal          │  Usuario DEMO                │
│  - Tenant permanente     │  - Tenant "demo" temporal    │
│  - Sin expiración        │  - Expiración: 7-14 días     │
│  - Datos reales          │  - Datos seed realistas      │
│  - Todas las features    │  - Todas las features        │
│  - Facturación real      │  - Facturación simulada      │
└─────────────────────────────────────────────────────────┘
```

**Eliminado**: `apps/demo-api` y `apps/demo-web` (código duplicado innecesario)

**Agregado**: 
- Landing page en `apps/web/app/demo`
- Lógica de tenant demo en `apps/erp-api`
- Seeds realistas en `supabase/seeds`

---

## FASE 1: Infraestructura Base (2-3 días)

### 1.1 Migración de Base de Datos
**Archivo**: `supabase/migrations/XXX__demo_tenant_support.sql`

```sql
-- Agregar soporte para tenants demo
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS demo_expires_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS demo_created_at TIMESTAMPTZ;

-- Índice para limpiar demos expirados
CREATE INDEX IF NOT EXISTS idx_tenants_demo_expired 
ON tenants(demo_expires_at) 
WHERE is_demo = true AND demo_expires_at < NOW();

-- Función para limpiar demos expirados (ejecutar diariamente)
CREATE OR REPLACE FUNCTION cleanup_expired_demo_tenants()
RETURNS void AS $$
BEGIN
  -- Marcar como inactivos los tenants demo expirados
  UPDATE tenants 
  SET activo = false 
  WHERE is_demo = true 
    AND demo_expires_at < NOW() 
    AND activo = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 1.2 Módulo Demo en Backend
**Ubicación**: `apps/erp-api/src/modules/demo/`

**Archivos a crear**:
- `demo.module.ts` - Módulo NestJS
- `demo.controller.ts` - Endpoints de demo
- `demo.service.ts` - Lógica de negocio
- `dto/create-demo-tenant.dto.ts` - Validación
- `guards/demo-expired.guard.ts` - Validar expiración

**Funcionalidades**:
```typescript
// POST /api/demo/create
// - Crea tenant demo con expiración de 14 días
// - Crea usuario temporal (email: demo-{uuid}@temp.local)
// - Ejecuta seeds de datos realistas
// - Retorna token JWT

// GET /api/demo/status
// - Verifica si el tenant actual es demo
// - Retorna días restantes antes de expiración

// POST /api/demo/extend (opcional)
// - Extiende la demo por 7 días más (máximo 1 vez)
```

### 1.3 Guard de Expiración
**Archivo**: `apps/erp-api/src/modules/demo/guards/demo-expired.guard.ts`

```typescript
// Middleware global que:
// 1. Detecta si el tenant es demo
// 2. Valida si está expirado
// 3. Si expiró, retorna 403 con mensaje amigable
// 4. Si está por expirar (<3 días), agrega header de advertencia
```

---

## FASE 2: Seeds de Datos Realistas (2-3 días)

### 2.1 Seed Principal
**Archivo**: `supabase/seeds/demo-tenant-seed.sql`

**Datos a crear** (para mostrar el poder del ERP):

#### Configuración Empresarial
- Empresa: "Demo Comercial SAC"
- RUC: 20123456789
- Dirección fiscal completa
- Logo empresarial
- Certificado digital (simulado, no real)
- Configuración de series (F001, B001, etc.)

#### Catálogos Base
- 5 categorías de productos
- 3 unidades de medida (UND, KG, M)
- 2 almacenes (Principal, Sucursal)
- 3 formas de pago (Efectivo, Tarjeta, Transferencia)
- Plan contable básico (cuentas principales)

#### Maestros
- 10 clientes (con RUC/DNI válidos simulados)
- 5 proveedores
- 20 productos con stock inicial
- 3 usuarios (Admin, Vendedor, Contador)
- 2 cajas POS

#### Transacciones Históricas (últimos 30 días)
- 15 ventas con factura electrónica (estado: aceptada)
- 5 compras con órdenes de compra
- 10 movimientos de inventario
- 8 pagos a proveedores
- 12 cobros de clientes
- Asientos contables generados automáticamente

**Objetivo**: Que el usuario entre y vea un ERP "en uso", no vacío.

### 2.2 Script de Seed Programático
**Archivo**: `apps/erp-api/src/modules/demo/services/demo-seed.service.ts`

```typescript
// Servicio que ejecuta el seed de forma programática
// Útil para regenerar datos demo sin SQL directo
class DemoSeedService {
  async seedDemoTenant(tenantId: string): Promise<void> {
    // 1. Configuración empresarial
    // 2. Catálogos
    // 3. Maestros
    // 4. Transacciones históricas
    // 5. Generar asientos contables
  }
}
```

---

## FASE 3: Landing Page Demo (1-2 días)

### 3.1 Página de Entrada
**Ubicación**: `apps/web/app/demo/page.tsx`

**Diseño**:
```
┌─────────────────────────────────────────────────────┐
│  [Logo ERP]                                         │
│                                                     │
│  Prueba el ERP Completo - 14 Días Gratis          │
│                                                     │
│  ✓ Facturación Electrónica Real                    │
│  ✓ Contabilidad Automatizada                       │
│  ✓ Control de Inventario con Kardex                │
│  ✓ POS Multi-Caja                                  │
│  ✓ Reportes Financieros                            │
│                                                     │
│  [Botón: Iniciar Demo Ahora] ← Sin registro       │
│                                                     │
│  * No requiere tarjeta de crédito                  │
│  * Datos pre-cargados para explorar                │
└─────────────────────────────────────────────────────┘
```

**Flujo**:
1. Usuario hace clic en "Iniciar Demo"
2. Loading: "Creando tu empresa demo..."
3. Backend crea tenant + usuario + seeds
4. Redirect automático a `/dashboard` con token
5. Toast: "¡Bienvenido! Tienes 14 días para explorar el sistema"

### 3.2 Banner de Demo
**Componente**: `apps/web/components/demo/DemoBanner.tsx`

```tsx
// Banner superior visible en todo el dashboard
// Muestra:
// - "Modo Demo - Expira en X días"
// - Botón "Convertir a cuenta real"
// - Countdown visual
```

### 3.3 Modal de Expiración
**Componente**: `apps/web/components/demo/DemoExpiredModal.tsx`

```tsx
// Modal que aparece cuando la demo expira
// Opciones:
// - Crear cuenta real (migrar datos)
// - Iniciar nueva demo (datos frescos)
// - Contactar ventas
```

---

## FASE 4: Restricciones y Seguridad (1 día)

### 4.1 Restricciones de Demo

**Archivo**: `apps/erp-api/src/modules/demo/demo.restrictions.ts`

```typescript
// Restricciones aplicadas a tenants demo:

1. Facturación Electrónica:
   - No enviar a SUNAT real (simular respuesta exitosa)
   - Marcar documentos con watermark "DEMO"

2. Límites de Registros (opcional):
   - Máximo 100 productos
   - Máximo 50 clientes
   - Máximo 200 ventas

3. Funciones Deshabilitadas (opcional):
   - Envío de emails reales
   - Integraciones con bancos
   - Exportación masiva de datos

4. Datos Sensibles:
   - No permitir cambiar RUC de la empresa
   - No permitir subir certificado digital real
```

### 4.2 Middleware de Restricciones
**Archivo**: `apps/erp-api/src/modules/demo/interceptors/demo-restrictions.interceptor.ts`

```typescript
// Interceptor que:
// 1. Detecta operaciones sensibles
// 2. Si es tenant demo, aplica restricciones
// 3. Retorna respuesta simulada o error amigable
```

---

## FASE 5: Conversión a Cuenta Real (2 días)

### 5.1 Endpoint de Conversión
**Archivo**: `apps/erp-api/src/modules/demo/demo.controller.ts`

```typescript
// POST /api/demo/convert-to-real
// Body: { email, password, company_name, ruc }
// 
// Proceso:
// 1. Validar que el tenant sea demo
// 2. Actualizar tenant: is_demo = false, demo_expires_at = null
// 3. Actualizar usuario con email/password reales
// 4. Limpiar datos demo (opcional)
// 5. Enviar email de bienvenida
// 6. Retornar nuevo token JWT
```

### 5.2 Página de Conversión
**Ubicación**: `apps/web/app/demo/convert/page.tsx`

**Formulario**:
- Email real
- Contraseña
- Nombre de empresa
- RUC/Identificación fiscal
- Términos y condiciones
- Botón: "Activar Cuenta Completa"

---

## FASE 6: Monitoreo y Mantenimiento (1 día)

### 6.1 Dashboard de Demos
**Ubicación**: `apps/web/app/superadmin/demos/page.tsx`

**Métricas**:
- Demos activos
- Demos creados hoy/semana/mes
- Tasa de conversión a cuenta real
- Demos expirados pendientes de limpieza
- Uso promedio por demo (sesiones, transacciones)

### 6.2 Cron Job de Limpieza
**Archivo**: `apps/erp-api/src/modules/demo/demo.cron.ts`

```typescript
// Ejecutar diariamente a las 2 AM:
// 1. Marcar demos expirados como inactivos
// 2. Después de 30 días, eliminar datos del tenant demo
// 3. Enviar notificación antes de expirar (día 12, 13)
```

### 6.3 Logs y Analytics
**Archivo**: `apps/erp-api/src/modules/demo/demo.analytics.ts`

```typescript
// Trackear:
// - Páginas más visitadas en demo
// - Features más usadas
// - Tiempo promedio de sesión
// - Punto de abandono
// 
// Útil para mejorar el onboarding
```

---

## FASE 7: Optimizaciones (Opcional)

### 7.1 Demo Guiada
**Componente**: `apps/web/components/demo/DemoTour.tsx`

- Tour interactivo al entrar por primera vez
- Highlights de features principales
- Tooltips contextuales
- Checklist de tareas sugeridas

### 7.2 Datos Demo Personalizados
**Feature**: Permitir elegir industria

```
Al crear demo, preguntar:
- ¿Qué tipo de negocio tienes?
  [ ] Retail / Comercio
  [ ] Servicios
  [ ] Manufactura
  [ ] Restaurante

Cargar seeds específicos según industria
```

### 7.3 Compartir Demo
**Feature**: Link de demo compartible

```typescript
// GET /demo/shared/:token
// - Permite compartir una demo específica
// - Útil para ventas (mostrar a clientes)
// - Expira en 7 días
```

---

## Checklist de Implementación

### Backend (apps/erp-api)
- [ ] Migración: Agregar campos `is_demo`, `demo_expires_at` a `tenants`
- [ ] Módulo: `src/modules/demo/` completo
- [ ] Service: Crear tenant demo con seeds
- [ ] Guard: Validar expiración en cada request
- [ ] Interceptor: Aplicar restricciones (facturación simulada)
- [ ] Endpoint: POST `/api/demo/create`
- [ ] Endpoint: GET `/api/demo/status`
- [ ] Endpoint: POST `/api/demo/convert-to-real`
- [ ] Cron: Limpieza de demos expirados
- [ ] Tests: Cobertura de flujo demo completo

### Frontend (apps/web)
- [ ] Página: `app/demo/page.tsx` (landing)
- [ ] Página: `app/demo/convert/page.tsx` (conversión)
- [ ] Componente: `DemoBanner.tsx` (banner superior)
- [ ] Componente: `DemoExpiredModal.tsx` (modal expiración)
- [ ] Componente: `DemoTour.tsx` (tour guiado - opcional)
- [ ] Hook: `useDemoStatus.ts` (estado de demo)
- [ ] Página: `app/superadmin/demos/page.tsx` (admin)

### Base de Datos (supabase)
- [ ] Migración: `XXX__demo_tenant_support.sql`
- [ ] Seed: `seeds/demo-tenant-seed.sql`
- [ ] Función: `cleanup_expired_demo_tenants()`
- [ ] RLS: Políticas para tenants demo

### Infraestructura
- [ ] Cron job: Ejecutar limpieza diaria
- [ ] Monitoring: Alertas de demos expirados
- [ ] Analytics: Trackear uso de demos

---

## Principios de Diseño

### 1. Experiencia Sin Fricción
- **Cero registro inicial**: Click y entras
- **Datos pre-cargados**: No empiezas de cero
- **Onboarding guiado**: Tour opcional

### 2. Transparencia
- **Banner visible**: Siempre sabes que estás en demo
- **Countdown claro**: Días restantes visibles
- **Conversión fácil**: Un formulario simple

### 3. Seguridad
- **No SUNAT real**: Facturación simulada
- **Datos temporales**: Auto-limpieza
- **Aislamiento**: RLS multi-tenant

### 4. Valor Demostrado
- **ERP completo**: No una versión reducida
- **Datos realistas**: Transacciones históricas
- **Flujos completos**: Venta → Asiento → Kardex

---

## Estimación de Tiempo

| Fase | Tiempo | Prioridad |
|------|--------|-----------|
| Fase 1: Infraestructura | 2-3 días | 🔴 Crítica |
| Fase 2: Seeds | 2-3 días | 🔴 Crítica |
| Fase 3: Landing Page | 1-2 días | 🔴 Crítica |
| Fase 4: Restricciones | 1 día | 🟡 Alta |
| Fase 5: Conversión | 2 días | 🟡 Alta |
| Fase 6: Monitoreo | 1 día | 🟢 Media |
| Fase 7: Optimizaciones | 2-3 días | ⚪ Baja |

**Total MVP (Fases 1-3)**: 5-8 días
**Total Completo (Fases 1-6)**: 9-12 días

---

## Ventajas de Este Enfoque

✅ **Cero duplicación de código**: Una sola base de código
✅ **Demo = ERP Real**: El cliente ve el producto real
✅ **Implementación rápida**: Días, no meses
✅ **Mantenimiento cero**: Mejoras al ERP mejoran la demo
✅ **Datos realistas**: Seeds que muestran flujos completos
✅ **Escalable**: Fácil agregar más seeds o restricciones
✅ **Conversión simple**: De demo a producción sin migración

---

## Próximos Pasos

1. **Eliminar**: Borrar `apps/demo-api` y `apps/demo-web` completamente
2. **Empezar**: Fase 1 - Migración de base de datos
3. **Iterar**: Implementar fases en orden
4. **Validar**: Probar flujo completo antes de producción

---

**Última actualización**: 2025-11-29
**Estado**: Plan aprobado - Listo para implementación
