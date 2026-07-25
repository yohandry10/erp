# Guía de UX Consistente - Módulo Finanzas

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `frontend_local`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

## 📋 Objetivo

Esta guía establece los estándares de UX para todas las páginas del módulo Finanzas, asegurando una experiencia de usuario consistente, profesional y fácil de usar.

## 🎨 Principios de Diseño

### 1. Consistencia Visual
- Todos los componentes deben usar el mismo sistema de diseño
- Colores, tipografía y espaciado deben ser uniformes
- Los iconos deben provenir de la misma librería (lucide-react)

### 2. Jerarquía Clara
- Headers con título y subtítulo consistentes
- Stats cards para métricas clave
- Filtros agrupados y visibles
- Contenido principal destacado

### 3. Feedback Inmediato
- Estados de carga claros
- Mensajes de error descriptivos
- Confirmaciones de acciones exitosas
- Indicadores visuales de estado

### 4. Accesibilidad
- Contraste de colores adecuado
- Tamaños de fuente legibles
- Botones con áreas de click suficientes
- Navegación por teclado

## 🧩 Componentes Reutilizables

### FinanzasLayout
**Propósito:** Proporciona estructura consistente para todas las páginas

**Uso:**
\`\`\`tsx
<FinanzasLayout
  title="Título de la Página"
  subtitle="Descripción breve"
  actions={<>Botones de acción</>}
  stats={<>Tarjetas de estadísticas</>}
  filters={<>Filtros</>}
  alerts={<>Alertas</>}
>
  {/* Contenido principal */}
</FinanzasLayout>
\`\`\`

### FinanzasStatCard
**Propósito:** Muestra métricas clave de forma consistente

**Uso:**
\`\`\`tsx
<FinanzasStatCard
  title="TOTAL"
  value={1234}
  subtitle="Registros"
  icon={FileText}
  iconColor="#3b82f6"
/>
\`\`\`

### FinanzasFilters
**Propósito:** Agrupa filtros con botones de acción

**Uso:**
\`\`\`tsx
<FinanzasFilters
  isActive={hasActiveFilters}
  onClear={handleClearFilters}
  onExport={handleExport}
>
  <FinanzasFilterField label="Estado">
    <select value={estado} onChange={...}>
      <option value="">Todos</option>
    </select>
  </FinanzasFilterField>
</FinanzasFilters>
\`\`\`

### FinanzasTable
**Propósito:** Tabla de datos consistente

**Uso:**
\`\`\`tsx
<FinanzasTable
  columns={[
    { key: 'id', label: 'ID', align: 'left' },
    { key: 'monto', label: 'Monto', align: 'right' }
  ]}
  loading={loading}
  emptyState={<FinanzasEmptyState ... />}
>
  {data.map(item => (
    <tr key={item.id}>
      <td>{item.id}</td>
      <td>{item.monto}</td>
    </tr>
  ))}
</FinanzasTable>
\`\`\`

### FinanzasEmptyState
**Propósito:** Estado vacío consistente

**Uso:**
\`\`\`tsx
<FinanzasEmptyState
  icon={FileText}
  title="No hay datos"
  description="No se encontraron registros"
  action={{
    label: "Crear Nuevo",
    onClick: handleCreate,
    icon: Plus
  }}
/>
\`\`\`

### FinanzasStatusBadge
**Propósito:** Badges de estado consistentes

**Uso:**
\`\`\`tsx
<FinanzasStatusBadge
  status="PENDIENTE"
  config={{
    PENDIENTE: { label: 'Pendiente', color: '#f59e0b', icon: Clock },
    PAGADA: { label: 'Pagada', color: '#10b981', icon: CheckCircle }
  }}
/>
\`\`\`

### FinanzasActionButton
**Propósito:** Botones de acción consistentes

**Uso:**
\`\`\`tsx
<FinanzasActionButton
  label="Ver Detalle"
  onClick={handleView}
  icon={Eye}
  variant="primary"
  size="md"
/>
\`\`\`

### FinanzasViewToggle
**Propósito:** Toggle entre vistas (lista/gráfico)

**Uso:**
\`\`\`tsx
<FinanzasViewToggle
  options={[
    { value: 'list', label: 'Lista', icon: List },
    { value: 'chart', label: 'Gráfico', icon: BarChart3 }
  ]}
  value={viewMode}
  onChange={setViewMode}
/>
\`\`\`

## 📐 Estructura de Página Estándar

### 1. Header
- Título principal con tipografía Tailwind semántica
- Subtítulo descriptivo con `text-muted-foreground`
- Botones de acción (Actualizar, Crear Nuevo, etc.)

### 2. Stats Section
- 4 tarjetas de estadísticas clave
- Grid responsive (auto-fit, minmax(250px, 1fr))
- Iconos representativos con colores consistentes
- Superficies con `bg-card`, `text-card-foreground` y `border-border`

### 3. Alerts Section (opcional)
- Alertas de vencimientos
- Notificaciones importantes
- Warnings del sistema

### 4. Filters Section
- Filtros agrupados horizontalmente
- Botón "Limpiar Filtros" cuando hay filtros activos
- Botón "Exportar" opcional

### 5. Content Section
- Tabla de datos o vista alternativa
- Estado de carga
- Estado vacío
- Paginación (si aplica)

## 🎨 Paleta de Colores

### Estados
- **Pendiente:** #f59e0b (Amber)
- **Éxito/Pagado:** #10b981 (Emerald)
- **Error/Vencido:** #ef4444 (Red)
- **Info/Proceso:** #3b82f6 (Blue)
- **Anulado:** #6b7280 (Gray)

### Acciones
- **Primary:** #3b82f6 (Blue)
- **Secondary:** #f3f4f6 (Gray)
- **Danger:** #ef4444 (Red)
- **Success:** #10b981 (Emerald)

## 📏 Espaciado Consistente

- **Gap entre elementos:** 1rem (16px)
- **Padding de cards:** 2rem (32px)
- **Margin entre secciones:** 2rem (32px)
- **Border radius:** 8px (botones), 12px (cards)

## 🔤 Tipografía

- **Título principal:** 3.5rem, font-weight: 900
- **Subtítulo:** 1.25rem, font-weight: 500
- **Stat value:** 3rem, font-weight: 900
- **Stat label:** 0.875rem, font-weight: 700, uppercase
- **Body text:** 0.875rem - 1rem, font-weight: 400-500
- **Small text:** 0.75rem, font-weight: 500

## ✅ Checklist de Implementación

Al crear o actualizar una página de Finanzas, verifica:

- [ ] Usa FinanzasLayout para estructura consistente
- [ ] Stats cards con FinanzasStatCard
- [ ] Filtros con FinanzasFilters y FinanzasFilterField
- [ ] Tablas con FinanzasTable
- [ ] Estados vacíos con FinanzasEmptyState
- [ ] Badges con FinanzasStatusBadge
- [ ] Botones con FinanzasActionButton
- [ ] Loading states con FinanzasLoadingState
- [ ] Colores consistentes con la paleta definida
- [ ] Espaciado uniforme
- [ ] Iconos de lucide-react
- [ ] Responsive design
- [ ] Accesibilidad (contraste, tamaños)

## 🚀 Ejemplo Completo

\`\`\`tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, RefreshCw, FileText, Clock } from 'lucide-react'
import {
  FinanzasLayout,
  FinanzasStatCard,
  FinanzasFilters,
  FinanzasFilterField,
  FinanzasTable,
  FinanzasEmptyState,
  FinanzasStatusBadge,
  FinanzasActionButton
} from '@/components/finanzas'

export default function MiPaginaFinanzas() {
  const router = useRouter()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ estado: '', fecha: '' })

  const hasActiveFilters = filters.estado || filters.fecha

  return (
    <FinanzasLayout
      title="Mi Página"
      subtitle="Descripción de la funcionalidad"
      actions={
        <>
          <FinanzasActionButton
            label="Actualizar"
            onClick={loadData}
            icon={RefreshCw}
            variant="secondary"
          />
          <FinanzasActionButton
            label="Crear Nuevo"
            onClick={() => router.push('/crear')}
            icon={Plus}
            variant="primary"
          />
        </>
      }
      stats={
        <>
          <FinanzasStatCard
            title="TOTAL"
            value={data.length}
            subtitle="Registros"
            icon={FileText}
            iconColor="#3b82f6"
          />
          <FinanzasStatCard
            title="PENDIENTES"
            value={data.filter(d => d.estado === 'PENDIENTE').length}
            subtitle="Por procesar"
            icon={Clock}
            iconColor="#f59e0b"
          />
        </>
      }
      filters={
        <FinanzasFilters
          isActive={hasActiveFilters}
          onClear={() => setFilters({ estado: '', fecha: '' })}
          onExport={handleExport}
        >
          <FinanzasFilterField label="Estado">
            <select
              value={filters.estado}
              onChange={(e) => setFilters({ ...filters, estado: e.target.value })}
            >
              <option value="">Todos</option>
              <option value="PENDIENTE">Pendiente</option>
            </select>
          </FinanzasFilterField>
        </FinanzasFilters>
      }
    >
      <div className="activity-section">
        <FinanzasTable
          columns={[
            { key: 'id', label: 'ID' },
            { key: 'estado', label: 'Estado', align: 'center' },
            { key: 'acciones', label: 'Acciones', align: 'right' }
          ]}
          loading={loading}
          emptyState={
            <FinanzasEmptyState
              icon={FileText}
              title="No hay datos"
              description="No se encontraron registros"
            />
          }
        >
          {data.map(item => (
            <tr key={item.id}>
              <td>{item.id}</td>
              <td>
                <FinanzasStatusBadge
                  status={item.estado}
                  config={ESTADOS_CONFIG}
                />
              </td>
              <td>
                <FinanzasActionButton
                  label="Ver"
                  onClick={() => router.push(\`/detalle/\${item.id}\`)}
                  size="sm"
                />
              </td>
            </tr>
          ))}
        </FinanzasTable>
      </div>
    </FinanzasLayout>
  )
}
\`\`\`

## 📚 Referencias

- Diseño basado en globals.css del proyecto
- Componentes construidos con React + TypeScript
- Iconos de lucide-react
- Estilos inline para máxima portabilidad
- Sin dependencias externas de CSS

## 🔄 Mantenimiento

Esta guía debe actualizarse cuando:
- Se agreguen nuevos componentes reutilizables
- Se modifique la paleta de colores
- Se cambien los estándares de espaciado
- Se identifiquen nuevos patrones comunes

---

## ⚠️ IMPORTANTE: Evitar Duplicación

### Utilidades Globales
**NO** crear funciones de formateo en componentes individuales. Usar las utilidades globales:

```tsx
// ❌ MAL - Duplicación
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(amount)
}

// ✅ BIEN - Usar utilidades globales
import { formatCurrency, formatDate } from '@/lib'

const montoFormateado = formatCurrency(1234.56, 'PEN')
```

### Utilidades Disponibles en `@/lib`

**Formateo:**
- `formatCurrency(amount, moneda)` - Formatea moneda
- `formatNumber(amount, decimals)` - Formatea número
- `formatDate(date)` - Formatea fecha corta
- `formatDateTime(date)` - Formatea fecha con hora
- `formatDateLong(date)` - Formatea fecha larga
- `formatPercentage(value, decimals)` - Formatea porcentaje
- `getPeriodo(date)` - Obtiene período

**Fechas:**
- `getDaysUntilDue(vencimiento)` - Días hasta vencimiento
- `isOverdue(vencimiento)` - Si está vencido
- `isDueSoon(vencimiento, days)` - Si vence pronto
- `getVencimientoText(vencimiento)` - Texto descriptivo
- `isValidDate(date)` - Valida fecha
- `isNotFutureDate(date)` - No es futura

**Validación:**
- `isValidAmount(amount)` - Valida monto
- `isValidEmail(email)` - Valida email
- `isValidRUC(ruc)` - Valida RUC
- `isValidDNI(dni)` - Valida DNI
- `isValidPhone(phone)` - Valida teléfono

---

**Última actualización:** 2024
**Versión:** 1.0.0
