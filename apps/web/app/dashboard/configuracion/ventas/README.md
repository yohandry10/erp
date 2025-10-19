# Configuración de Ventas

## Descripción

Página de configuración que permite a los administradores configurar los flujos de trabajo de ventas y las políticas de Guías de Remisión Electrónica (GRE) para su empresa.

## Ubicación

`/dashboard/configuracion/ventas`

## Características Implementadas

### 1. Tipo de Empresa

Permite seleccionar el tipo de empresa entre:
- **Microempresa**: Flujo simplificado
- **Pequeña Empresa**: Flujo simplificado
- **Mediana Empresa**: Flujo completo con logística
- **Gran Empresa**: Flujo completo con logística

La selección del tipo de empresa configura automáticamente el flujo de trabajo apropiado.

### 2. Flujo de Trabajo

**Flujo Simplificado** (usar_flujo_logistica = false):
- Pedido → Confirmado → Facturación
- Ideal para micro y pequeñas empresas
- Sin etapas de preparación y despacho

**Flujo Completo** (usar_flujo_logistica = true):
- Pedido → Confirmado → Preparación → Despacho → Facturación
- Ideal para medianas y grandes empresas
- Control completo de almacén y logística

### 3. Configuración de GRE

**GRE Obligatorio**:
- Exige generación de GRE antes de completar pedidos
- Útil para empresas que siempre requieren guías de remisión

**Sugerencia Automática de GRE**:
- Sugiere generar GRE cuando el monto supera el umbral configurado
- Umbral configurable (por defecto: S/ 700.00)

### 4. Advertencias

El sistema muestra una advertencia cuando se cambia el flujo de trabajo, informando que:
- Los pedidos existentes mantendrán su flujo actual
- Los nuevos pedidos usarán el flujo configurado
- Se debe comunicar el cambio al equipo

## Integración con Backend

### Endpoints Utilizados

**GET /api/configuracion/empresa**
- Obtiene la configuración actual de la empresa
- Incluye campos de configuración de ventas

**PUT /api/configuracion/empresa**
- Actualiza la configuración de la empresa
- Campos actualizados:
  - `tipo_empresa`
  - `usar_flujo_logistica`
  - `gre_obligatorio`
  - `gre_automatico_habilitado`
  - `umbral_gre_automatico`

## Base de Datos

Los campos se almacenan en la tabla `empresa_config`:

```sql
tipo_empresa VARCHAR(20) DEFAULT 'MICRO'
usar_flujo_logistica BOOLEAN DEFAULT false
gre_obligatorio BOOLEAN DEFAULT false
gre_automatico_habilitado BOOLEAN DEFAULT true
umbral_gre_automatico NUMERIC(12,2) DEFAULT 700.00
```

## Hook useEmpresaConfig

Se implementó un hook personalizado para acceder a la configuración de empresa desde cualquier componente:

```tsx
import { useEmpresaConfig } from '@/hooks/use-empresa-config'

function MyComponent() {
  const { 
    config, 
    loading, 
    isFlujologistica, 
    isGreObligatorio,
    isGreAutomatico,
    umbralGre,
    refreshConfig 
  } = useEmpresaConfig()

  if (loading) return <div>Cargando...</div>

  return (
    <div>
      {isFlujologistica ? 'Flujo Completo' : 'Flujo Simplificado'}
    </div>
  )
}
```

### Propiedades del Hook

- `config`: Objeto con toda la configuración de la empresa
- `loading`: Estado de carga
- `error`: Error si ocurrió alguno
- `refreshConfig()`: Función para recargar la configuración
- `isFlujologistica`: Boolean - Si usa flujo logístico completo
- `isGreObligatorio`: Boolean - Si GRE es obligatorio
- `isGreAutomatico`: Boolean - Si sugerencia de GRE está habilitada
- `umbralGre`: Number - Umbral para sugerencia de GRE

### Provider

El hook utiliza un Context Provider que debe envolver la aplicación:

```tsx
import { EmpresaConfigProvider } from '@/hooks/use-empresa-config'

<EmpresaConfigProvider>
  <App />
</EmpresaConfigProvider>
```

El provider ya está configurado en el layout del dashboard.

## Wizard de Configuración Inicial

Se agregó un nuevo paso al wizard de configuración inicial:

### Paso: Tipo de Empresa

- Ubicación: Después del paso de bienvenida
- Permite seleccionar el tipo de empresa
- Configura automáticamente `usar_flujo_logistica`
- Permite configurar políticas de GRE:
  - GRE Obligatorio
  - Sugerencia Automática de GRE
  - Umbral de GRE

### Archivos Modificados

**Frontend:**
- `apps/web/app/dashboard/wizard/types.ts` - Tipos actualizados
- `apps/web/app/dashboard/wizard/WizardContext.tsx` - Nuevo paso agregado
- `apps/web/app/dashboard/wizard/steps/CompanyTypeStep.tsx` - Nuevo componente
- `apps/web/app/dashboard/wizard/page.tsx` - Renderizado del nuevo paso
- `apps/web/app/dashboard/wizard/useWizard.ts` - Validación actualizada

**Backend:**
- `apps/erp-api/src/modules/configuracion/configuration.service.ts` - Guardado de nuevos campos

## Uso en Componentes de Ventas

Los componentes del módulo de ventas pueden usar el hook para adaptar su comportamiento:

```tsx
import { useEmpresaConfig } from '@/hooks/use-empresa-config'

function PedidoDetail({ pedido }) {
  const { isFlujologistica } = useEmpresaConfig()

  return (
    <div>
      {pedido.estado === 'CONFIRMADO' && (
        <>
          {isFlujologistica ? (
            <button>Ver en Inventario</button>
          ) : (
            <button>Generar Factura</button>
          )}
        </>
      )}
    </div>
  )
}
```

## Requisitos Cumplidos

✅ **Requirement 7.1**: Configuración de tipo_empresa en wizard inicial
✅ **Requirement 7.2**: Precargar usar_flujo_logistica según tipo
✅ **Requirement 7.3**: Configuración de GRE en wizard
✅ **Requirement 7.4**: Página de configuración de ventas
✅ **Requirement 7.5**: Hook useEmpresaConfig con caché
✅ **Requirement 7.6**: Uso en componentes con lógica condicional
✅ **Requirement 25.1-25.5**: Configuración inicial por tipo de empresa

## Próximos Pasos

1. Usar el hook en componentes de pedidos para mostrar botones dinámicos
2. Implementar validaciones basadas en `gre_obligatorio`
3. Implementar sugerencias de GRE basadas en `umbral_gre_automatico`
4. Agregar tests para el hook y los componentes
