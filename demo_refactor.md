# Refactorización Demo - Resumen Ejecutivo

## ❌ Lo que ELIMINAMOS

```
apps/
├── demo-api/          ← ELIMINADO (código duplicado)
│   └── src/
│       ├── modules/
│       │   ├── auth/
│       │   ├── clientes/
│       │   ├── inventario/
│       │   └── core/
│       └── common/
│
└── demo-web/          ← ELIMINADO (código duplicado)
    └── app/
        ├── (auth)/
        ├── (dashboard)/
        │   ├── clientes/
        │   ├── compras/
        │   ├── contabilidad/
        │   ├── finanzas/
        │   ├── inventario/
        │   ├── rrhh/
        │   └── ventas/
        └── components/
```

**Razón**: Intentar replicar un ERP de 32+ módulos en una app separada es:
- ❌ Duplicación masiva de código
- ❌ Mantenimiento doble
- ❌ Demo superficial (CRUD sin lógica de negocio)
- ❌ Meses de desarrollo para algo inferior

---

## ✅ Lo que IMPLEMENTAREMOS

### Arquitectura Nueva: Demo = ERP Real

```
apps/
├── erp-api/                    ← ERP REAL (sin cambios mayores)
│   └── src/
│       └── modules/
│           ├── demo/           ← NUEVO: Módulo demo
│           │   ├── demo.module.ts
│           │   ├── demo.controller.ts
│           │   ├── demo.service.ts
│           │   ├── demo-seed.service.ts
│           │   ├── guards/
│           │   │   └── demo-expired.guard.ts
│           │   └── interceptors/
│           │       └── demo-restrictions.interceptor.ts
│           │
│           ├── auth/           ← Existente
│           ├── ventas/         ← Existente
│           ├── contabilidad/   ← Existente
│           ├── inventario/     ← Existente
│           └── ... (32+ módulos existentes)
│
└── web/                        ← Frontend REAL (sin cambios mayores)
    └── app/
        ├── demo/               ← NUEVO: Landing page demo
        │   ├── page.tsx        (entrada demo)
        │   └── convert/
        │       └── page.tsx    (conversión a cuenta real)
        │
        ├── dashboard/          ← Existente (usado por demo también)
        │   ├── ventas/
        │   ├── compras/
        │   ├── pos/
        │   └── ...
        │
        └── components/
            └── demo/           ← NUEVO: Componentes demo
                ├── DemoBanner.tsx
                ├── DemoExpiredModal.tsx
                └── DemoTour.tsx
```

---

## 🎯 Diferencia Clave

### ANTES (apps/demo-*)
```typescript
// Demo separada con CRUD básico
POST /api/ventas
  → Guarda venta en BD
  → FIN (sin lógica de negocio)

// Usuario ve: "Lista de ventas"
// Usuario NO ve: Asiento contable, Kardex, Factura electrónica
```

### AHORA (ERP con tenant demo)
```typescript
// Demo usa el ERP REAL
POST /api/ventas
  → Guarda venta en BD
  → Genera asiento contable automático
  → Actualiza kardex con valorización
  → Crea factura electrónica (simulada)
  → Actualiza cuentas por cobrar
  → FIN

// Usuario ve: TODO el poder del ERP
```

---

## 📊 Comparativa

| Aspecto | Demo Separada (❌) | Demo Integrada (✅) |
|---------|-------------------|---------------------|
| **Código** | 2 apps completas | 1 módulo pequeño |
| **Mantenimiento** | Doble | Cero adicional |
| **Funcionalidad** | CRUD básico | ERP completo |
| **Tiempo desarrollo** | Meses | 5-8 días |
| **Lógica de negocio** | Manual | Automatizada |
| **Valor demostrado** | Bajo | Alto |

---

## 🚀 Plan de Implementación

Ver archivo completo: **`demo.md`**

### Resumen de Fases

1. **Fase 1 (2-3 días)**: Infraestructura
   - Migración BD: `is_demo`, `demo_expires_at`
   - Módulo demo en backend
   - Guard de expiración

2. **Fase 2 (2-3 días)**: Seeds realistas
   - Empresa demo pre-configurada
   - 20 productos, 10 clientes, 5 proveedores
   - 15 ventas históricas con asientos contables

3. **Fase 3 (1-2 días)**: Landing page
   - `/demo` - Entrada sin registro
   - Banner de demo en dashboard
   - Modal de expiración

4. **Fase 4 (1 día)**: Restricciones
   - Facturación simulada (no SUNAT real)
   - Límites opcionales

5. **Fase 5 (2 días)**: Conversión
   - De demo a cuenta real
   - Migración de datos

6. **Fase 6 (1 día)**: Monitoreo
   - Dashboard de demos
   - Cron de limpieza

**Total MVP**: 5-8 días
**Total Completo**: 9-12 días

---

## 💡 Beneficios

### Para el Cliente
- ✅ Ve el ERP REAL, no una versión reducida
- ✅ Datos pre-cargados (no empieza de cero)
- ✅ Experimenta automatización real
- ✅ Sin fricción (cero registro inicial)

### Para el Equipo
- ✅ Cero duplicación de código
- ✅ Mantenimiento cero adicional
- ✅ Mejoras al ERP mejoran la demo
- ✅ Implementación rápida

### Para el Negocio
- ✅ Mayor tasa de conversión (demo potente)
- ✅ Menor costo de desarrollo
- ✅ Escalable fácilmente

---

## 📝 Checklist de Migración

- [x] Eliminar `apps/demo-api`
- [x] Eliminar `apps/demo-web`
- [x] Crear plan detallado en `demo.md`
- [ ] Implementar Fase 1: Infraestructura
- [ ] Implementar Fase 2: Seeds
- [ ] Implementar Fase 3: Landing page
- [ ] Implementar Fase 4: Restricciones
- [ ] Implementar Fase 5: Conversión
- [ ] Implementar Fase 6: Monitoreo
- [ ] Testing completo
- [ ] Deploy a producción

---

## 🎬 Próximo Paso

Empezar con **Fase 1: Infraestructura**

```bash
# Crear migración
supabase migration new demo_tenant_support

# Crear módulo demo
mkdir -p apps/erp-api/src/modules/demo
```

Ver detalles completos en: **`demo.md`**

---

**Fecha**: 2025-11-29
**Estado**: ✅ Refactorización completada - Listo para implementación
