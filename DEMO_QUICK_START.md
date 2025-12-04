# Demo - Quick Start Guide

## 🎯 Objetivo

Implementar sistema demo integrado al ERP real en **5-8 días** (MVP).

---

## 📋 Pre-requisitos

- [x] Apps demo eliminadas (`apps/demo-api`, `apps/demo-web`)
- [x] Plan detallado creado (`demo.md`)
- [ ] Supabase CLI instalado
- [ ] Base de datos local/staging lista

---

## 🚀 Fase 1: Infraestructura (Día 1-2)

### Paso 1.1: Crear Migración

```bash
# Crear archivo de migración
cd supabase
npx supabase migration new demo_tenant_support
```

Copiar contenido de `demo.md` Fase 1.1 al archivo generado.

```bash
# Aplicar migración
npx supabase db push
```

### Paso 1.2: Crear Módulo Demo

```bash
# Crear estructura
mkdir -p apps/erp-api/src/modules/demo/{dto,guards,interceptors,services}

# Crear archivos base
cd apps/erp-api/src/modules/demo
touch demo.module.ts
touch demo.controller.ts
touch demo.service.ts
touch services/demo-seed.service.ts
touch dto/create-demo-tenant.dto.ts
touch guards/demo-expired.guard.ts
touch interceptors/demo-restrictions.interceptor.ts
```

### Paso 1.3: Implementar Lógica Base

**Orden de implementación**:
1. `demo.module.ts` - Registrar módulo
2. `dto/create-demo-tenant.dto.ts` - Validaciones
3. `demo.service.ts` - Lógica de creación de tenant demo
4. `demo.controller.ts` - Endpoints
5. `guards/demo-expired.guard.ts` - Validación de expiración
6. `interceptors/demo-restrictions.interceptor.ts` - Restricciones

### Paso 1.4: Registrar en App Module

```typescript
// apps/erp-api/src/app.module.ts
import { DemoModule } from './modules/demo/demo.module';

@Module({
  imports: [
    // ... otros módulos
    DemoModule,
  ],
})
export class AppModule {}
```

### Paso 1.5: Testing

```bash
# Probar endpoint de creación
curl -X POST http://localhost:3000/api/demo/create

# Debería retornar:
# {
#   "tenant_id": "...",
#   "user_id": "...",
#   "token": "...",
#   "expires_at": "2025-12-13T..."
# }
```

---

## 🌱 Fase 2: Seeds (Día 3-4)

### Paso 2.1: Crear Seed SQL

```bash
# Crear archivo
touch supabase/seeds/demo-tenant-seed.sql
```

Copiar estructura de `demo.md` Fase 2.1.

### Paso 2.2: Implementar Seed Service

```typescript
// apps/erp-api/src/modules/demo/services/demo-seed.service.ts

@Injectable()
export class DemoSeedService {
  async seedDemoTenant(tenantId: string): Promise<void> {
    // 1. Configuración empresarial
    await this.seedEmpresaConfig(tenantId);
    
    // 2. Catálogos
    await this.seedCatalogos(tenantId);
    
    // 3. Maestros
    await this.seedMaestros(tenantId);
    
    // 4. Transacciones históricas
    await this.seedTransacciones(tenantId);
  }
}
```

### Paso 2.3: Integrar con Demo Service

```typescript
// apps/erp-api/src/modules/demo/demo.service.ts

async createDemoTenant(): Promise<DemoTenantResponse> {
  // 1. Crear tenant
  const tenant = await this.createTenant();
  
  // 2. Crear usuario
  const user = await this.createUser(tenant.id);
  
  // 3. Ejecutar seeds
  await this.demoSeedService.seedDemoTenant(tenant.id);
  
  // 4. Generar token
  const token = await this.generateToken(user);
  
  return { tenant, user, token };
}
```

### Paso 2.4: Testing

```bash
# Crear demo y verificar datos
curl -X POST http://localhost:3000/api/demo/create

# Verificar en BD que se crearon:
# - 20 productos
# - 10 clientes
# - 15 ventas
# - Asientos contables
```

---

## 🎨 Fase 3: Landing Page (Día 5-6)

### Paso 3.1: Crear Páginas

```bash
# Crear estructura
mkdir -p apps/web/app/demo/convert
mkdir -p apps/web/components/demo

# Crear archivos
touch apps/web/app/demo/page.tsx
touch apps/web/app/demo/convert/page.tsx
touch apps/web/components/demo/DemoBanner.tsx
touch apps/web/components/demo/DemoExpiredModal.tsx
```

### Paso 3.2: Implementar Landing

```typescript
// apps/web/app/demo/page.tsx

export default function DemoPage() {
  const handleStartDemo = async () => {
    // 1. Llamar a /api/demo/create
    const response = await fetch('/api/demo/create', { method: 'POST' });
    const { token } = await response.json();
    
    // 2. Guardar token
    localStorage.setItem('token', token);
    
    // 3. Redirect a dashboard
    router.push('/dashboard');
  };
  
  return (
    <div>
      <h1>Prueba el ERP Completo - 14 Días Gratis</h1>
      <button onClick={handleStartDemo}>Iniciar Demo Ahora</button>
    </div>
  );
}
```

### Paso 3.3: Implementar Banner

```typescript
// apps/web/components/demo/DemoBanner.tsx

export function DemoBanner() {
  const { isDemoTenant, daysRemaining } = useDemoStatus();
  
  if (!isDemoTenant) return null;
  
  return (
    <div className="bg-yellow-100 p-2 text-center">
      Modo Demo - Expira en {daysRemaining} días
      <button>Convertir a cuenta real</button>
    </div>
  );
}
```

### Paso 3.4: Integrar en Layout

```typescript
// apps/web/app/dashboard/layout.tsx

import { DemoBanner } from '@/components/demo/DemoBanner';

export default function DashboardLayout({ children }) {
  return (
    <div>
      <DemoBanner />
      {children}
    </div>
  );
}
```

### Paso 3.5: Testing

```bash
# Abrir navegador
http://localhost:3000/demo

# Flujo completo:
# 1. Click "Iniciar Demo"
# 2. Loading...
# 3. Redirect a /dashboard
# 4. Ver banner "Modo Demo"
# 5. Explorar módulos con datos pre-cargados
```

---

## ✅ Checklist MVP (Fases 1-3)

### Backend
- [ ] Migración aplicada
- [ ] Módulo demo creado
- [ ] Endpoint POST `/api/demo/create` funcionando
- [ ] Endpoint GET `/api/demo/status` funcionando
- [ ] Guard de expiración activo
- [ ] Seeds ejecutándose correctamente
- [ ] Tests básicos pasando

### Frontend
- [ ] Página `/demo` creada
- [ ] Botón "Iniciar Demo" funcionando
- [ ] Banner de demo visible
- [ ] Hook `useDemoStatus` implementado
- [ ] Redirect automático funcionando

### Base de Datos
- [ ] Campos `is_demo`, `demo_expires_at` agregados
- [ ] Seed SQL creado
- [ ] Función de limpieza creada

### Testing E2E
- [ ] Crear demo desde landing
- [ ] Navegar por módulos
- [ ] Ver datos pre-cargados
- [ ] Banner visible
- [ ] Expiración funcionando

---

## 🔧 Comandos Útiles

```bash
# Desarrollo
pnpm dev                    # Iniciar todo
pnpm --filter erp-api dev   # Solo backend
pnpm --filter web dev       # Solo frontend

# Base de datos
npx supabase db reset       # Reset local
npx supabase db push        # Aplicar migraciones
npx supabase db seed        # Ejecutar seeds

# Testing
pnpm --filter erp-api test  # Tests backend
pnpm --filter web test      # Tests frontend

# Build
pnpm build                  # Build todo
```

---

## 📊 Progreso

```
Fase 1: Infraestructura     [ ] 0% (Día 1-2)
Fase 2: Seeds               [ ] 0% (Día 3-4)
Fase 3: Landing Page        [ ] 0% (Día 5-6)
─────────────────────────────────────────────
MVP Total                   [ ] 0% (5-8 días)
```

---

## 🎯 Siguiente Acción

**Empezar Fase 1, Paso 1.1**: Crear migración de base de datos

```bash
cd supabase
npx supabase migration new demo_tenant_support
```

Luego copiar el SQL de `demo.md` Fase 1.1.

---

## 📚 Referencias

- Plan completo: `demo.md`
- Resumen de refactor: `REFACTOR_DEMO.md`
- Documentación Supabase: https://supabase.com/docs
- Documentación NestJS: https://docs.nestjs.com

---

**Última actualización**: 2025-11-29
**Estado**: Listo para empezar Fase 1
