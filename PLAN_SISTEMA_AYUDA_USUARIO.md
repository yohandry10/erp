# Plan: Sistema de Ayuda al Usuario

## Resumen Ejecutivo

Implementar un sistema de ayuda integral para el ERP con 3 componentes:
1. **Tooltips Contextuales** - Ayuda inline en campos y botones
2. **Bot de Ayuda** - Asistente basado en búsqueda (sin costo de IA)
3. **Wizard de Onboarding** - Tour interactivo por rol

**Orden de implementación**: 1 → 2 → 3

---

## Fase 1: Sistema de Tooltips Contextuales

### Objetivo
Proveer ayuda instantánea en cada campo/botón del ERP sin afectar rendimiento.

### Arquitectura

```
apps/web/
├── components/
│   └── help/
│       ├── index.ts              # Exports públicos
│       ├── types.ts              # Tipos y constantes
│       ├── help-data/            # Datos por módulo
│       │   ├── index.ts
│       │   ├── pos.ts
│       │   ├── ventas.ts
│       │   ├── inventario.ts
│       │   ├── finanzas.ts
│       │   └── configuracion.ts
│       ├── HelpTooltip.tsx       # Tooltip base (CSS-only)
│       ├── HelpIcon.tsx          # Icono ? clickeable
│       └── FieldHelp.tsx         # Wrapper para campos
├── hooks/
│   └── use-help.ts               # Hook de acceso a datos
```

### Principios de Diseño

| Principio | Implementación |
|-----------|----------------|
| Sin re-renders | Tooltips con CSS `:hover`, sin useState |
| Modular | Archivos < 100 líneas |
| Data-driven | Textos en archivos separados por módulo |
| Composable | Wrapper o icono standalone |
| Accesible | ARIA labels, focus visible |
| Lazy loading | Datos de ayuda cargados bajo demanda |

### Componentes

#### 1. `types.ts` (~30 líneas)
```typescript
export interface HelpItem {
  key: string
  title: string
  description: string
  tips?: string[]
  link?: string
}

export type HelpModule = 'pos' | 'ventas' | 'inventario' | 'finanzas' | 'compras' | 'configuracion'
```

#### 2. `HelpTooltip.tsx` (~50 líneas)
- Tooltip puro CSS (hover)
- Posicionamiento automático
- Animación suave
- Sin estado React

#### 3. `HelpIcon.tsx` (~25 líneas)
- Icono `?` minimalista
- Trigger para tooltip
- Variantes: inline, floating

#### 4. `FieldHelp.tsx` (~40 líneas)
- Wrapper que agrega tooltip a cualquier campo
- Props: `helpKey`, `children`

#### 5. `use-help.ts` (~40 líneas)
- Hook para acceso programático
- Función `getHelp(key)`
- Memoizado

### Datos de Ayuda (Ejemplo POS)

```typescript
// help-data/pos.ts
export const posHelp: Record<string, HelpItem> = {
  'pos.apertura_caja': {
    key: 'pos.apertura_caja',
    title: 'Apertura de Caja',
    description: 'Ingresa el monto inicial con el que empiezas tu turno.',
    tips: [
      'Cuenta el efectivo físico antes de ingresar',
      'Este monto se comparará al cierre'
    ]
  },
  'pos.metodo_pago': {
    key: 'pos.metodo_pago',
    title: 'Método de Pago',
    description: 'Selecciona cómo pagará el cliente.',
    tips: [
      'Efectivo: Ingresa monto recibido para calcular vuelto',
      'Tarjeta: Se registra el total exacto'
    ]
  }
}
```

### Uso en Componentes

```tsx
// Opción 1: Icono junto a label
<Label>
  Monto Inicial <HelpIcon helpKey="pos.apertura_caja" />
</Label>
<Input ... />

// Opción 2: Wrapper
<FieldHelp helpKey="pos.metodo_pago">
  <Select>...</Select>
</FieldHelp>

// Opción 3: Programático
const { getHelp } = useHelp()
const ayuda = getHelp('pos.apertura_caja')
```

### Tareas Fase 1

- [x] 1.1 Crear estructura `components/help/`
- [x] 1.2 Implementar `types.ts`
- [x] 1.3 Implementar `HelpTooltip.tsx` (CSS inline)
- [x] 1.4 Implementar `HelpIcon.tsx` (CSS inline)
- [x] 1.5 Implementar `FieldHelp.tsx` (CSS inline)
- [x] 1.6 Implementar `use-help.ts`
- [x] 1.7 Crear datos de ayuda para POS
- [x] 1.8 Crear datos de ayuda para Ventas
- [x] 1.9 Crear datos de ayuda para Inventario
- [x] 1.10 Crear datos de ayuda para Finanzas
- [x] 1.11 Integrar en módulo POS (prueba piloto - CajaControls.tsx)
- [x] 1.12 Documentar uso (en este archivo)

**Estimado**: 1-2 días | **Estado**: ✅ 100% completado

---

## Fase 2: Bot de Ayuda (Sin costo de IA)

### Objetivo
Asistente de búsqueda que responde preguntas usando la documentación existente.

### Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│  Usuario: "¿Cómo abro la caja?"                             │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Frontend: HelpBot Component                                │
│  - Input de búsqueda                                        │
│  - Sugerencias rápidas por rol                              │
│  - Historial de preguntas                                   │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Backend: /api/help/search                                  │
│  - Full-text search PostgreSQL (GRATIS)                     │
│  - Filtro por rol del usuario                               │
│  - Ranking de relevancia                                    │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Base de Datos: knowledge_base                              │
│  - Preguntas frecuentes                                     │
│  - Respuestas estructuradas                                 │
│  - Pasos detallados                                         │
│  - Links a módulos                                          │
└─────────────────────────────────────────────────────────────┘
```

### Estructura de Archivos

```
apps/web/
├── components/
│   └── help/
│       ├── HelpBot.tsx           # Componente principal
│       ├── HelpBotTrigger.tsx    # Botón flotante
│       ├── HelpBotModal.tsx      # Modal del chat
│       ├── HelpBotMessage.tsx    # Mensaje individual
│       └── HelpBotSuggestions.tsx # Sugerencias rápidas

apps/erp-api/
├── src/modules/
│   └── help/
│       ├── help.module.ts
│       ├── help.controller.ts
│       ├── help.service.ts
│       └── dto/
│           └── search-help.dto.ts

supabase/migrations/
└── XXX__knowledge_base.sql
```

### Base de Datos

```sql
CREATE TABLE knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,                    -- NULL = global
  categoria VARCHAR(50) NOT NULL,    -- 'pos', 'ventas', etc.
  rol VARCHAR(50),                   -- 'cajero', 'vendedor', NULL = todos
  pregunta TEXT NOT NULL,
  palabras_clave TEXT[] NOT NULL,
  respuesta TEXT NOT NULL,
  pasos JSONB,                       -- [{paso: 1, texto: "..."}]
  url_modulo VARCHAR(255),
  orden INT DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice full-text para búsqueda rápida
CREATE INDEX idx_kb_search ON knowledge_base 
USING GIN (to_tsvector('spanish', pregunta || ' ' || array_to_string(palabras_clave, ' ')));

-- Función de búsqueda
CREATE FUNCTION buscar_ayuda(p_query TEXT, p_rol VARCHAR DEFAULT NULL)
RETURNS TABLE (pregunta TEXT, respuesta TEXT, pasos JSONB, url_modulo VARCHAR, relevancia FLOAT)
AS $$ ... $$ LANGUAGE plpgsql;
```

### Componente Frontend

```tsx
// HelpBot.tsx - Estructura
export function HelpBot() {
  return (
    <>
      <HelpBotTrigger />      {/* Botón flotante */}
      <HelpBotModal>          {/* Modal */}
        <HelpBotSuggestions /> {/* Preguntas sugeridas */}
        <HelpBotMessages />    {/* Historial */}
        <HelpBotInput />       {/* Input */}
      </HelpBotModal>
    </>
  )
}
```

### Tareas Fase 2

- [x] 2.1 Crear migración `knowledge_base` (148__knowledge_base_help_system.sql)
- [x] 2.2 Crear función `buscar_ayuda`
- [x] 2.3 Poblar datos iniciales (149__knowledge_base_seed_data.sql - 20+ preguntas)
- [x] 2.4 Crear API routes Next.js (en lugar de NestJS para simplicidad)
- [x] 2.5 Implementar endpoint `/api/help/search`
- [x] 2.6 Implementar endpoint `/api/help/sugerencias`
- [x] 2.7 Crear `HelpBotTrigger.tsx` (CSS inline)
- [x] 2.8 Crear `HelpBotModal.tsx` (CSS inline)
- [x] 2.9 Crear `HelpBotMessage.tsx` (CSS inline)
- [x] 2.10 Crear `HelpBotSuggestions.tsx` (CSS inline)
- [x] 2.11 Crear `HelpBot.tsx` (composición)
- [x] 2.12 Integrar en layout principal (dashboard/layout.tsx)
- [x] 2.13 Testing manual completado

**Estimado**: 2-3 días | **Estado**: ✅ 100% completado

---

## Fase 3: Wizard de Onboarding

### Objetivo
Tour interactivo que guía al usuario nuevo según su rol.

### Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│  Usuario nuevo inicia sesión                                │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Sistema detecta: onboarding_completado = false             │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Muestra Wizard según ROL:                                  │
│  - CAJERO: Tour POS (5 pasos)                               │
│  - VENDEDOR: Tour Ventas (7 pasos)                          │
│  - ADMIN: Tour General (10 pasos)                           │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Cada paso:                                                 │
│  - Highlight del elemento                                   │
│  - Tooltip explicativo                                      │
│  - Botones: Anterior | Siguiente | Saltar                   │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Al completar: onboarding_completado = true                 │
│  Opción de repetir desde Configuración                      │
└─────────────────────────────────────────────────────────────┘
```

### Estructura de Archivos

```
apps/web/
├── components/
│   └── onboarding/
│       ├── index.ts
│       ├── types.ts
│       ├── OnboardingProvider.tsx   # Context
│       ├── OnboardingOverlay.tsx    # Overlay oscuro
│       ├── OnboardingSpotlight.tsx  # Highlight elemento
│       ├── OnboardingTooltip.tsx    # Tooltip del paso
│       ├── OnboardingControls.tsx   # Navegación
│       └── tours/                   # Tours por rol
│           ├── index.ts
│           ├── cajero-tour.ts
│           ├── vendedor-tour.ts
│           └── admin-tour.ts
├── hooks/
│   └── use-onboarding.ts
```

### Definición de Tours

```typescript
// tours/cajero-tour.ts
export const cajeroTour: OnboardingTour = {
  id: 'cajero',
  nombre: 'Tour del Cajero',
  pasos: [
    {
      id: 'bienvenida',
      tipo: 'modal',
      titulo: '¡Bienvenido al POS!',
      descripcion: 'Te guiaremos por las funciones principales.',
      imagen: '/onboarding/pos-welcome.png'
    },
    {
      id: 'apertura-caja',
      tipo: 'spotlight',
      selector: '[data-tour="btn-abrir-caja"]',
      titulo: 'Abrir Caja',
      descripcion: 'Primero debes abrir tu caja con el monto inicial.',
      posicion: 'bottom'
    },
    {
      id: 'buscar-producto',
      tipo: 'spotlight',
      selector: '[data-tour="input-buscar-producto"]',
      titulo: 'Buscar Productos',
      descripcion: 'Escribe el nombre o escanea el código de barras.',
      posicion: 'bottom'
    },
    // ... más pasos
  ]
}
```

### Uso de data-tour

```tsx
// En componentes existentes, agregar atributos
<Button data-tour="btn-abrir-caja">
  Abrir Caja
</Button>

<Input data-tour="input-buscar-producto" />
```

### Tareas Fase 3

- [x] 3.1 Usar localStorage para tracking (sin migración DB)
- [x] 3.2 Crear estructura `components/onboarding/`
- [x] 3.3 Implementar `types.ts`
- [x] 3.4 Implementar `OnboardingProvider.tsx`
- [x] 3.5 Implementar `OnboardingOverlay.tsx` (CSS inline)
- [x] 3.6 Implementar `OnboardingSpotlight.tsx` (CSS inline)
- [x] 3.7 Implementar `OnboardingTooltip.tsx` (CSS inline)
- [x] 3.8 Controles integrados en OnboardingTooltip
- [x] 3.9 Crear tour CAJERO
- [x] 3.10 Crear tour VENDEDOR
- [x] 3.11 Crear tour ADMIN
- [x] 3.12 Hook `useOnboarding` integrado en Provider
- [x] 3.13 Agregar `data-tour` a CajaControls (ejemplo)
- [x] 3.14 Agregar `data-tour` a sidebar (todos los menús)
- [x] 3.15 Integrar en layout (auto-inicio por rol)
- [x] 3.16 Agregar página "Ayuda" con opción "Repetir tour" (CSS inline)
- [x] 3.17 Testing manual completado

**Estimado**: 3-4 días | **Estado**: ✅ 100% completado

---

## Resumen de Costos

| Componente | Costo | Dependencias |
|------------|-------|--------------|
| Tooltips | $0 | CSS puro |
| Bot de Ayuda | $0 | PostgreSQL full-text |
| Wizard Onboarding | $0 | CSS + React |
| **TOTAL** | **$0** | - |

---

## Cronograma

```
Semana 1:
├── Día 1-2: Fase 1 (Tooltips)
├── Día 3-5: Fase 2 (Bot de Ayuda)

Semana 2:
├── Día 1-4: Fase 3 (Wizard Onboarding)
├── Día 5: Testing integral + ajustes
```

---

## Progreso

```
Fase 1: Tooltips           [██████████] 100% ✅
Fase 2: Bot de Ayuda       [██████████] 100% ✅
Fase 3: Wizard Onboarding  [██████████] 100% ✅
────────────────────────────────────────────
TOTAL                      [██████████] 100% ✅
```

---

**Última actualización**: 2025-11-29
**Estado**: ✅ Implementación completada al 90%

## Archivos Creados

### Fase 1: Tooltips
- `apps/web/components/help/types.ts`
- `apps/web/components/help/HelpIcon.tsx`
- `apps/web/components/help/HelpTooltip.tsx`
- `apps/web/components/help/FieldHelp.tsx`
- `apps/web/components/help/index.ts`
- `apps/web/components/help/help-data/*.ts` (pos, ventas, inventario, finanzas, configuracion)
- `apps/web/hooks/use-help.ts`

### Fase 2: Bot de Ayuda
- `supabase/migrations/148__knowledge_base_help_system.sql`
- `supabase/migrations/149__knowledge_base_seed_data.sql`
- `apps/web/components/help/bot/*.tsx` (HelpBot, HelpBotModal, HelpBotMessage, etc.)
- `apps/web/app/api/help/search/route.ts`
- `apps/web/app/api/help/sugerencias/route.ts`

### Fase 3: Wizard Onboarding
- `apps/web/components/onboarding/types.ts`
- `apps/web/components/onboarding/OnboardingProvider.tsx`
- `apps/web/components/onboarding/OnboardingOverlay.tsx`
- `apps/web/components/onboarding/OnboardingSpotlight.tsx`
- `apps/web/components/onboarding/OnboardingTooltip.tsx`
- `apps/web/components/onboarding/tours/*.ts` (cajero, vendedor, admin)

### Integración
- `apps/web/app/dashboard/layout.tsx` (HelpBot + OnboardingProvider)
- `apps/web/components/pos/CajaControls.tsx` (ejemplo con HelpIcon + data-tour)
- `apps/web/components/layout/sidebar.tsx` (data-tour en todos los menús)
- `apps/web/app/dashboard/ayuda/page.tsx` (página de ayuda con tours)
- `apps/web/components/onboarding/OnboardingSettings.tsx` (gestión de tours)
