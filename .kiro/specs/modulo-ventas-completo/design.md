# Design Document

## Overview

El Módulo de Ventas es un sistema completo que gestiona el ciclo de ventas desde la cotización hasta la facturación, con flujos adaptativos según el tipo de empresa. El diseño se basa en una arquitectura modular que integra con los módulos existentes de Inventario, CPE y GRE.

### Objetivos del Diseño

1. **Flexibilidad**: Soportar dos flujos de trabajo (simplificado y completo) según configuración del tenant
2. **Integración**: Conectar seamlessly con módulos existentes (Inventario, CPE, GRE)
3. **Escalabilidad**: Diseño modular que permita agregar funcionalidades futuras
4. **Usabilidad**: Interfaces intuitivas que minimicen pasos innecesarios
5. **Consistencia**: Mantener patrones de diseño del sistema existente

### Alcance

**Incluye (MVP - Fase 1):**
- Gestión completa de clientes (CRUD + validación SUNAT)
- Gestión de cotizaciones con estados y versionado
- Gestión de pedidos de venta con control de estados
- Reserva y liberación automática de inventario
- Flujos adaptativos (simplificado vs completo) configurables por tenant
- Integración con CPE para facturación
- Sugerencia automática de GRE según políticas
- Permisos granulares por módulo
- Auditoría completa de operaciones
- Configuración por tenant (empresa) desde panel de superadmin

**Incluye (Fase 2 - Mejoras ERP Real):**
- Aprobaciones internas por umbral de descuento/monto
- Control de crédito y límites por cliente
- Multialmacén con ubicaciones
- Lotes y series (FEFO/PEPS)
- Picking y packing separados
- Backorder y despachos parciales
- Facturación parcial y consolidada
- Anticipos y aplicación a facturas
- Cuentas por cobrar (CxC) con vencimientos
- Devoluciones (RMA) con notas de crédito
- Asientos contables automáticos
- Multi-moneda con tipo de cambio
- Listas de precio por segmento/cliente
- Tracking de envíos
- KPIs operativos y financieros

**No Incluye (fuera de alcance actual):**
- Módulo de Oportunidades/CRM (Lead → Oportunidad)
- Pasarelas de pago integradas
- Conciliación bancaria automática
- Módulo de Compras/Reabastecimiento (MRP)
- Reportes avanzados de BI (se usará módulo Analytics existente)

## Architecture

### High-Level Architecture


```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                      │
│  /dashboard/ventas/                                             │
│    ├── clientes/      (Gestión de clientes)                    │
│    ├── cotizaciones/  (Gestión de cotizaciones)                │
│    └── pedidos/       (Gestión de pedidos)                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓ HTTP/REST
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND API (NestJS)                       │
│  /api/ventas/                                                   │
│    ├── ClientesModule                                           │
│    ├── CotizacionesModule (mejorado)                           │
│    └── PedidosModule (nuevo)                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    INTEGRATION LAYER                            │
│  ├── InventarioService (reservas/liberaciones)                 │
│  ├── CPEService (generación de facturas)                       │
│  ├── GREService (sugerencia de guías)                          │
│  └── NotificationsService (eventos del sistema)                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      DATABASE (Supabase)                        │
│  ├── clientes                                                   │
│  ├── cotizaciones                                               │
│  ├── cotizaciones_detalle                                       │
│  ├── pedidos_venta                                              │
│  ├── pedidos_venta_detalle                                      │
│  ├── movimientos_inventario                                     │
│  ├── productos                                                  │
│  └── empresa_config (tenant settings)                          │
└─────────────────────────────────────────────────────────────────┘
```

### Module Dependencies


```
VentasModule
├── depends on → InventarioModule (stock management)
├── depends on → CPEModule (factura generation)
├── depends on → GREModule (guía generation)
├── depends on → NotificationsModule (system events)
├── depends on → TenantsModule (configuration)
└── depends on → PermissionsModule (access control)
```

### Technology Stack

**Frontend:**
- Next.js 14 (App Router)
- React 18
- TypeScript
- Tailwind CSS
- Lucide Icons
- React Hook Form (formularios)
- Zod (validación)

**Backend:**
- NestJS
- TypeScript
- Supabase (PostgreSQL)
- Class Validator
- Class Transformer

**Integration:**
- REST API
- Event-driven architecture (para notificaciones)
- Row Level Security (RLS) en Supabase

## Components and Interfaces

### Frontend Components

#### 1. Clientes Module

**Pages:**
- `/dashboard/ventas/clientes/page.tsx` - Lista de clientes
- `/dashboard/ventas/clientes/[id]/page.tsx` - Detalle de cliente
- `/dashboard/ventas/clientes/nuevo/page.tsx` - Crear cliente

**Components:**
- `ClientesList.tsx` - Tabla con búsqueda y filtros
- `ClienteForm.tsx` - Formulario de cliente (crear/editar)
- `ClienteDetail.tsx` - Vista detallada con estadísticas
- `ClienteSelector.tsx` - Selector con búsqueda (para cotizaciones/pedidos)
- `ClienteQuickCreate.tsx` - Modal de creación rápida
- `ValidarRUCButton.tsx` - Botón para validar con SUNAT


#### 2. Cotizaciones Module

**Pages:**
- `/dashboard/ventas/cotizaciones/page.tsx` - Lista de cotizaciones
- `/dashboard/ventas/cotizaciones/[id]/page.tsx` - Detalle/editar cotización
- `/dashboard/ventas/cotizaciones/nueva/page.tsx` - Crear cotización

**Components:**
- `CotizacionesList.tsx` - Tabla con filtros por estado
- `CotizacionForm.tsx` - Formulario de cotización
- `CotizacionDetail.tsx` - Vista detallada
- `ProductSelector.tsx` - Selector de productos con cantidades
- `ConvertirPedidoButton.tsx` - Botón para convertir a pedido
- `CotizacionEstadoBadge.tsx` - Badge de estado visual

#### 3. Pedidos Module

**Pages:**
- `/dashboard/ventas/pedidos/page.tsx` - Lista de pedidos
- `/dashboard/ventas/pedidos/[id]/page.tsx` - Detalle de pedido
- `/dashboard/ventas/pedidos/nuevo/page.tsx` - Crear pedido directo

**Components:**
- `PedidosList.tsx` - Tabla con filtros por estado
- `PedidoForm.tsx` - Formulario de pedido
- `PedidoDetail.tsx` - Vista detallada con acciones según estado
- `PedidoEstadoBadge.tsx` - Badge de estado visual
- `ConfirmarPedidoButton.tsx` - Botón para confirmar pedido
- `CancelarPedidoButton.tsx` - Botón para cancelar pedido
- `GenerarFacturaButton.tsx` - Botón para generar factura
- `StockWarning.tsx` - Alerta de stock insuficiente
- `FlujoPedidoTimeline.tsx` - Timeline visual del flujo

#### 4. Shared Components

- `ClienteCard.tsx` - Card de información de cliente
- `ProductoLineItem.tsx` - Item de producto en lista
- `TotalesCard.tsx` - Card con subtotal, IGV, total
- `EstadoTimeline.tsx` - Timeline de cambios de estado
- `HistorialTransacciones.tsx` - Tabla de historial

### Backend Components

#### 1. ClientesModule

**Structure:**
```
src/modules/ventas/clientes/
├── clientes.module.ts
├── clientes.controller.ts
├── clientes.service.ts
├── dto/
│   ├── create-cliente.dto.ts
│   ├── update-cliente.dto.ts
│   └── validar-ruc.dto.ts
└── entities/
    └── cliente.entity.ts
```


**Controller Endpoints:**
```typescript
@Controller('api/ventas/clientes')
export class ClientesController {
  @Get()           // Listar clientes
  @Post()          // Crear cliente
  @Get(':id')      // Obtener cliente
  @Put(':id')      // Actualizar cliente
  @Delete(':id')   // Eliminar cliente
  @Post('validar-ruc')  // Validar RUC con SUNAT
}
```

#### 2. CotizacionesModule (Enhanced)

**Structure:**
```
src/modules/ventas/cotizaciones/
├── cotizaciones.module.ts
├── cotizaciones.controller.ts
├── cotizaciones.service.ts
├── dto/
│   ├── create-cotizacion.dto.ts
│   ├── update-cotizacion.dto.ts
│   └── convertir-pedido.dto.ts
└── entities/
    ├── cotizacion.entity.ts
    └── cotizacion-detalle.entity.ts
```

**Controller Endpoints:**
```typescript
@Controller('api/ventas/cotizaciones')
export class CotizacionesController {
  @Get()           // Listar cotizaciones
  @Post()          // Crear cotización
  @Get(':id')      // Obtener cotización
  @Put(':id')      // Actualizar cotización
  @Delete(':id')   // Eliminar cotización
  @Post(':id/convertir-pedido')  // Convertir a pedido
}
```

#### 3. PedidosModule (New)

**Structure:**
```
src/modules/ventas/pedidos/
├── pedidos.module.ts
├── pedidos.controller.ts
├── pedidos.service.ts
├── dto/
│   ├── create-pedido.dto.ts
│   ├── update-pedido.dto.ts
│   ├── confirmar-pedido.dto.ts
│   └── cancelar-pedido.dto.ts
└── entities/
    ├── pedido.entity.ts
    └── pedido-detalle.entity.ts
```


**Controller Endpoints:**
```typescript
@Controller('api/ventas/pedidos')
export class PedidosController {
  @Get()           // Listar pedidos
  @Post()          // Crear pedido
  @Get(':id')      // Obtener pedido
  @Put(':id')      // Actualizar pedido
  @Post(':id/confirmar')         // Confirmar pedido (reserva stock)
  @Post(':id/cancelar')          // Cancelar pedido (libera stock)
  @Post(':id/generar-factura')   // Generar factura
}
```

#### 4. LogisticaModule (New - Optional)

**Structure:**
```
src/modules/inventario/logistica/
├── logistica.controller.ts
├── logistica.service.ts
└── dto/
    ├── preparar-pedido.dto.ts
    └── confirmar-despacho.dto.ts
```

**Controller Endpoints:**
```typescript
@Controller('api/inventario/logistica')
export class LogisticaController {
  @Get('ordenes-pendientes')     // Listar pedidos pendientes
  @Post(':pedidoId/preparar')    // Iniciar preparación
  @Post(':pedidoId/confirmar-despacho')  // Confirmar despacho
}
```

## Data Models

### Database Schema

#### 1. clientes

```sql
CREATE TABLE clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('PERSONA', 'EMPRESA')),
  documento_tipo VARCHAR(10) NOT NULL CHECK (documento_tipo IN ('DNI', 'RUC', 'CE', 'PASAPORTE')),
  documento_numero VARCHAR(20) NOT NULL,
  razon_social VARCHAR(255) NOT NULL,
  nombre_comercial VARCHAR(255),
  direccion TEXT,
  email VARCHAR(255),
  telefono VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  UNIQUE(tenant_id, documento_numero)
);

CREATE INDEX idx_clientes_tenant ON clientes(tenant_id);
CREATE INDEX idx_clientes_documento ON clientes(documento_numero);
```


#### 2. cotizaciones

```sql
CREATE TABLE cotizaciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  numero VARCHAR(50) NOT NULL,
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento DATE,
  estado VARCHAR(20) NOT NULL DEFAULT 'BORRADOR' 
    CHECK (estado IN ('BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA', 'CONVERTIDA', 'VENCIDA')),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  igv NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  UNIQUE(tenant_id, numero)
);

CREATE INDEX idx_cotizaciones_tenant ON cotizaciones(tenant_id);
CREATE INDEX idx_cotizaciones_cliente ON cotizaciones(cliente_id);
CREATE INDEX idx_cotizaciones_estado ON cotizaciones(estado);
```

#### 3. cotizaciones_detalle

```sql
CREATE TABLE cotizaciones_detalle (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cotizacion_id UUID NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id),
  descripcion VARCHAR(255) NOT NULL,
  cantidad NUMERIC(12,2) NOT NULL,
  precio_unitario NUMERIC(12,2) NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cotizaciones_detalle_cotizacion ON cotizaciones_detalle(cotizacion_id);
```

#### 4. pedidos_venta

```sql
CREATE TABLE pedidos_venta (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  numero VARCHAR(50) NOT NULL,
  cotizacion_id UUID REFERENCES cotizaciones(id),
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE', 'CONFIRMADO', 'EN_PREPARACION', 
                      'LISTO_DESPACHO', 'LISTO_FACTURAR', 'FACTURADO', 
                      'COMPLETADO', 'COMPLETADO_CON_GRE', 'CANCELADO')),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  igv NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notas TEXT,
  factura_id UUID REFERENCES documentos(id),
  gre_id UUID REFERENCES gre(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id),
  UNIQUE(tenant_id, numero)
);

CREATE INDEX idx_pedidos_tenant ON pedidos_venta(tenant_id);
CREATE INDEX idx_pedidos_cliente ON pedidos_venta(cliente_id);
CREATE INDEX idx_pedidos_estado ON pedidos_venta(estado);
CREATE INDEX idx_pedidos_cotizacion ON pedidos_venta(cotizacion_id);
```


#### 5. pedidos_venta_detalle

```sql
CREATE TABLE pedidos_venta_detalle (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pedido_id UUID NOT NULL REFERENCES pedidos_venta(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id),
  descripcion VARCHAR(255) NOT NULL,
  cantidad NUMERIC(12,2) NOT NULL,
  precio_unitario NUMERIC(12,2) NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_pedidos_detalle_pedido ON pedidos_venta_detalle(pedido_id);
```

#### 6. movimientos_inventario (Enhanced)

```sql
CREATE TABLE movimientos_inventario (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  producto_id UUID NOT NULL REFERENCES productos(id),
  tipo VARCHAR(20) NOT NULL 
    CHECK (tipo IN ('ENTRADA', 'SALIDA', 'RESERVA', 'LIBERACION', 'AJUSTE', 'TRANSFERENCIA')),
  cantidad NUMERIC(12,2) NOT NULL,
  referencia_tipo VARCHAR(50),  -- 'PEDIDO', 'COMPRA', 'AJUSTE', etc.
  referencia_id UUID,
  notas TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_movimientos_tenant ON movimientos_inventario(tenant_id);
CREATE INDEX idx_movimientos_producto ON movimientos_inventario(producto_id);
CREATE INDEX idx_movimientos_tipo ON movimientos_inventario(tipo);
CREATE INDEX idx_movimientos_referencia ON movimientos_inventario(referencia_tipo, referencia_id);
```

#### 7. productos (Enhanced)

```sql
-- Agregar campos a tabla existente
ALTER TABLE productos 
ADD COLUMN IF NOT EXISTS stock_reservado NUMERIC(12,2) DEFAULT 0;

-- Función para calcular stock disponible
CREATE OR REPLACE FUNCTION stock_disponible(producto_id UUID)
RETURNS NUMERIC AS $$
  SELECT stock_actual - COALESCE(stock_reservado, 0)
  FROM productos
  WHERE id = producto_id;
$$ LANGUAGE SQL;
```

#### 8. empresa_config (Enhanced)

```sql
-- Agregar campos a tabla existente
ALTER TABLE empresa_config
ADD COLUMN IF NOT EXISTS tipo_empresa VARCHAR(20) DEFAULT 'MICRO' 
  CHECK (tipo_empresa IN ('MICRO', 'PEQUEÑA', 'MEDIANA', 'GRANDE')),
ADD COLUMN IF NOT EXISTS usar_flujo_logistica BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS gre_obligatorio BOOLEAN DEFAULT false;
```


### TypeScript Interfaces

#### Frontend Types

```typescript
// types/ventas.ts

export enum TipoCliente {
  PERSONA = 'PERSONA',
  EMPRESA = 'EMPRESA'
}

export enum TipoDocumento {
  DNI = 'DNI',
  RUC = 'RUC',
  CE = 'CE',
  PASAPORTE = 'PASAPORTE'
}

export interface Cliente {
  id: string
  tenant_id: string
  tipo: TipoCliente
  documento_tipo: TipoDocumento
  documento_numero: string
  razon_social: string
  nombre_comercial?: string
  direccion?: string
  email?: string
  telefono?: string
  created_at: string
  updated_at: string
}

export enum EstadoCotizacion {
  BORRADOR = 'BORRADOR',
  ENVIADA = 'ENVIADA',
  APROBADA = 'APROBADA',
  RECHAZADA = 'RECHAZADA',
  CONVERTIDA = 'CONVERTIDA',
  VENCIDA = 'VENCIDA'
}

export interface Cotizacion {
  id: string
  tenant_id: string
  numero: string
  cliente_id: string
  cliente?: Cliente
  fecha: string
  fecha_vencimiento?: string
  estado: EstadoCotizacion
  subtotal: number
  igv: number
  total: number
  notas?: string
  detalle: CotizacionDetalle[]
  created_at: string
  updated_at: string
}

export interface CotizacionDetalle {
  id: string
  cotizacion_id: string
  producto_id: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

export enum EstadoPedido {
  PENDIENTE = 'PENDIENTE',
  CONFIRMADO = 'CONFIRMADO',
  EN_PREPARACION = 'EN_PREPARACION',
  LISTO_DESPACHO = 'LISTO_DESPACHO',
  LISTO_FACTURAR = 'LISTO_FACTURAR',
  FACTURADO = 'FACTURADO',
  COMPLETADO = 'COMPLETADO',
  COMPLETADO_CON_GRE = 'COMPLETADO_CON_GRE',
  CANCELADO = 'CANCELADO'
}

export interface PedidoVenta {
  id: string
  tenant_id: string
  numero: string
  cotizacion_id?: string
  cliente_id: string
  cliente?: Cliente
  fecha: string
  estado: EstadoPedido
  subtotal: number
  igv: number
  total: number
  notas?: string
  factura_id?: string
  gre_id?: string
  detalle: PedidoDetalle[]
  created_at: string
  updated_at: string
}

export interface PedidoDetalle {
  id: string
  pedido_id: string
  producto_id: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

export enum TipoMovimiento {
  ENTRADA = 'ENTRADA',
  SALIDA = 'SALIDA',
  RESERVA = 'RESERVA',
  LIBERACION = 'LIBERACION',
  AJUSTE = 'AJUSTE',
  TRANSFERENCIA = 'TRANSFERENCIA'
}

export interface MovimientoInventario {
  id: string
  tenant_id: string
  producto_id: string
  tipo: TipoMovimiento
  cantidad: number
  referencia_tipo?: string
  referencia_id?: string
  notas?: string
  created_at: string
}
```


#### Backend DTOs

```typescript
// dto/create-cliente.dto.ts
export class CreateClienteDto {
  @IsEnum(TipoCliente)
  tipo: TipoCliente

  @IsEnum(TipoDocumento)
  documento_tipo: TipoDocumento

  @IsString()
  @Length(8, 20)
  documento_numero: string

  @IsString()
  @MinLength(3)
  razon_social: string

  @IsOptional()
  @IsString()
  nombre_comercial?: string

  @IsOptional()
  @IsString()
  direccion?: string

  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  @IsString()
  telefono?: string
}

// dto/create-pedido.dto.ts
export class CreatePedidoDto {
  @IsUUID()
  cliente_id: string

  @IsOptional()
  @IsUUID()
  cotizacion_id?: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PedidoDetalleDto)
  detalle: PedidoDetalleDto[]

  @IsOptional()
  @IsString()
  notas?: string
}

export class PedidoDetalleDto {
  @IsUUID()
  producto_id: string

  @IsString()
  descripcion: string

  @IsNumber()
  @Min(0.01)
  cantidad: number

  @IsNumber()
  @Min(0)
  precio_unitario: number
}
```

## Error Handling

### Error Types

```typescript
export enum VentasErrorCode {
  CLIENTE_NOT_FOUND = 'CLIENTE_NOT_FOUND',
  CLIENTE_DUPLICADO = 'CLIENTE_DUPLICADO',
  COTIZACION_NOT_FOUND = 'COTIZACION_NOT_FOUND',
  COTIZACION_YA_CONVERTIDA = 'COTIZACION_YA_CONVERTIDA',
  PEDIDO_NOT_FOUND = 'PEDIDO_NOT_FOUND',
  PEDIDO_ESTADO_INVALIDO = 'PEDIDO_ESTADO_INVALIDO',
  STOCK_INSUFICIENTE = 'STOCK_INSUFICIENTE',
  PRODUCTO_NOT_FOUND = 'PRODUCTO_NOT_FOUND',
  VALIDACION_RUC_FAILED = 'VALIDACION_RUC_FAILED',
  FACTURA_GENERATION_FAILED = 'FACTURA_GENERATION_FAILED'
}
```


### Error Handling Strategy

1. **Validation Errors**: Usar class-validator en DTOs, retornar 400 Bad Request
2. **Not Found Errors**: Retornar 404 Not Found con mensaje descriptivo
3. **Business Logic Errors**: Retornar 422 Unprocessable Entity con código de error
4. **Integration Errors**: Retornar 503 Service Unavailable si servicio externo falla
5. **Database Errors**: Capturar y transformar en errores de negocio apropiados

### Example Error Responses

```typescript
// Stock insuficiente
{
  "statusCode": 422,
  "error": "STOCK_INSUFICIENTE",
  "message": "Stock insuficiente para producto XYZ. Disponible: 5, Solicitado: 10",
  "details": {
    "producto_id": "uuid",
    "stock_disponible": 5,
    "cantidad_solicitada": 10
  }
}

// Cotización ya convertida
{
  "statusCode": 422,
  "error": "COTIZACION_YA_CONVERTIDA",
  "message": "Esta cotización ya fue convertida a pedido",
  "details": {
    "cotizacion_id": "uuid",
    "pedido_id": "uuid"
  }
}
```

## Business Logic Flows

### Flow 1: Confirmar Pedido (Reserva de Stock)

```typescript
async confirmarPedido(pedidoId: string, tenantId: string) {
  // 1. Obtener pedido con detalles
  const pedido = await this.findOne(pedidoId, tenantId)
  
  // 2. Validar estado
  if (pedido.estado !== EstadoPedido.PENDIENTE) {
    throw new BusinessException('PEDIDO_ESTADO_INVALIDO')
  }
  
  // 3. Verificar stock disponible para cada producto
  const stockWarnings = []
  for (const item of pedido.detalle) {
    const stockDisponible = await this.inventarioService
      .getStockDisponible(item.producto_id, tenantId)
    
    if (stockDisponible < item.cantidad) {
      stockWarnings.push({
        producto_id: item.producto_id,
        disponible: stockDisponible,
        solicitado: item.cantidad
      })
    }
  }
  
  // 4. Si hay warnings, retornar pero permitir continuar
  // (el usuario puede decidir si continúa)
  
  // 5. Crear movimientos de RESERVA
  for (const item of pedido.detalle) {
    await this.inventarioService.crearMovimiento({
      tenant_id: tenantId,
      producto_id: item.producto_id,
      tipo: TipoMovimiento.RESERVA,
      cantidad: item.cantidad,
      referencia_tipo: 'PEDIDO',
      referencia_id: pedidoId
    })
  }
  
  // 6. Actualizar stock_reservado en productos
  for (const item of pedido.detalle) {
    await this.inventarioService.incrementarReserva(
      item.producto_id,
      item.cantidad,
      tenantId
    )
  }
  
  // 7. Cambiar estado del pedido
  await this.updateEstado(pedidoId, EstadoPedido.CONFIRMADO, tenantId)
  
  // 8. Determinar siguiente estado según configuración
  const config = await this.tenantsService.getConfig(tenantId)
  if (!config.usar_flujo_logistica) {
    // Flujo simplificado: ir directo a LISTO_FACTURAR
    await this.updateEstado(pedidoId, EstadoPedido.LISTO_FACTURAR, tenantId)
  }
  
  // 9. Enviar notificación
  await this.notificationsService.emit('pedido.confirmado', {
    pedido_id: pedidoId,
    tenant_id: tenantId
  })
  
  return { success: true, warnings: stockWarnings }
}
```


### Flow 2: Cancelar Pedido (Liberación de Stock)

```typescript
async cancelarPedido(pedidoId: string, tenantId: string) {
  // 1. Obtener pedido
  const pedido = await this.findOne(pedidoId, tenantId)
  
  // 2. Validar que no esté facturado
  if (pedido.estado === EstadoPedido.FACTURADO || 
      pedido.estado === EstadoPedido.COMPLETADO) {
    throw new BusinessException('PEDIDO_YA_FACTURADO')
  }
  
  // 3. Si está confirmado, liberar reservas
  if (pedido.estado !== EstadoPedido.PENDIENTE) {
    for (const item of pedido.detalle) {
      // Crear movimiento de LIBERACION
      await this.inventarioService.crearMovimiento({
        tenant_id: tenantId,
        producto_id: item.producto_id,
        tipo: TipoMovimiento.LIBERACION,
        cantidad: item.cantidad,
        referencia_tipo: 'PEDIDO',
        referencia_id: pedidoId
      })
      
      // Decrementar stock_reservado
      await this.inventarioService.decrementarReserva(
        item.producto_id,
        item.cantidad,
        tenantId
      )
    }
  }
  
  // 4. Cambiar estado a CANCELADO
  await this.updateEstado(pedidoId, EstadoPedido.CANCELADO, tenantId)
  
  // 5. Notificar
  await this.notificationsService.emit('pedido.cancelado', {
    pedido_id: pedidoId,
    tenant_id: tenantId
  })
  
  return { success: true }
}
```

### Flow 3: Generar Factura desde Pedido

```typescript
async generarFactura(pedidoId: string, tenantId: string) {
  // 1. Obtener pedido
  const pedido = await this.findOne(pedidoId, tenantId)
  
  // 2. Validar estado
  if (pedido.estado !== EstadoPedido.LISTO_FACTURAR) {
    throw new BusinessException('PEDIDO_NO_LISTO_FACTURAR')
  }
  
  // 3. Obtener configuración
  const config = await this.tenantsService.getConfig(tenantId)
  
  // 4. Si es flujo simplificado, descontar stock ahora
  if (!config.usar_flujo_logistica) {
    for (const item of pedido.detalle) {
      // Crear movimiento de SALIDA
      await this.inventarioService.crearMovimiento({
        tenant_id: tenantId,
        producto_id: item.producto_id,
        tipo: TipoMovimiento.SALIDA,
        cantidad: item.cantidad,
        referencia_tipo: 'PEDIDO',
        referencia_id: pedidoId
      })
      
      // Descontar stock_actual y liberar reserva
      await this.inventarioService.descontarStock(
        item.producto_id,
        item.cantidad,
        tenantId
      )
    }
  }
  
  // 5. Preparar datos para CPE
  const facturaData = {
    tenant_id: tenantId,
    cliente_id: pedido.cliente_id,
    items: pedido.detalle.map(item => ({
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      subtotal: item.subtotal
    })),
    subtotal: pedido.subtotal,
    igv: pedido.igv,
    total: pedido.total
  }
  
  // 6. Generar factura en módulo CPE
  const factura = await this.cpeService.generarFactura(facturaData)
  
  // 7. Actualizar pedido con factura_id
  await this.update(pedidoId, { 
    factura_id: factura.id,
    estado: EstadoPedido.FACTURADO 
  }, tenantId)
  
  // 8. Verificar si debe sugerir GRE
  let sugerirGRE = false
  if (config.gre_automatico_habilitado && 
      pedido.total > config.umbral_gre_automatico) {
    sugerirGRE = true
  }
  
  // 9. Notificar
  await this.notificationsService.emit('factura.emitida', {
    pedido_id: pedidoId,
    factura_id: factura.id,
    tenant_id: tenantId
  })
  
  return { 
    success: true, 
    factura_id: factura.id,
    sugerir_gre: sugerirGRE
  }
}
```


### Flow 4: Convertir Cotización a Pedido

```typescript
async convertirAPedido(cotizacionId: string, tenantId: string) {
  // 1. Obtener cotización con detalles
  const cotizacion = await this.cotizacionesService
    .findOne(cotizacionId, tenantId)
  
  // 2. Validar que no esté ya convertida
  if (cotizacion.estado === EstadoCotizacion.CONVERTIDA) {
    throw new BusinessException('COTIZACION_YA_CONVERTIDA')
  }
  
  // 3. Crear pedido con datos de cotización
  const pedidoData = {
    tenant_id: tenantId,
    cotizacion_id: cotizacionId,
    cliente_id: cotizacion.cliente_id,
    fecha: new Date(),
    estado: EstadoPedido.PENDIENTE,
    subtotal: cotizacion.subtotal,
    igv: cotizacion.igv,
    total: cotizacion.total,
    notas: cotizacion.notas,
    detalle: cotizacion.detalle.map(item => ({
      producto_id: item.producto_id,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      subtotal: item.subtotal
    }))
  }
  
  const pedido = await this.pedidosService.create(pedidoData)
  
  // 4. Actualizar estado de cotización
  await this.cotizacionesService.updateEstado(
    cotizacionId,
    EstadoCotizacion.CONVERTIDA,
    tenantId
  )
  
  // 5. Notificar
  await this.notificationsService.emit('cotizacion.convertida', {
    cotizacion_id: cotizacionId,
    pedido_id: pedido.id,
    tenant_id: tenantId
  })
  
  return { success: true, pedido_id: pedido.id }
}
```

### Flow 5: Confirmar Despacho (Flujo Completo)

```typescript
async confirmarDespacho(pedidoId: string, tenantId: string) {
  // 1. Obtener pedido
  const pedido = await this.findOne(pedidoId, tenantId)
  
  // 2. Validar estado
  if (pedido.estado !== EstadoPedido.LISTO_DESPACHO) {
    throw new BusinessException('PEDIDO_NO_LISTO_DESPACHO')
  }
  
  // 3. Descontar stock (SALIDA real)
  for (const item of pedido.detalle) {
    // Crear movimiento de SALIDA
    await this.inventarioService.crearMovimiento({
      tenant_id: tenantId,
      producto_id: item.producto_id,
      tipo: TipoMovimiento.SALIDA,
      cantidad: item.cantidad,
      referencia_tipo: 'PEDIDO',
      referencia_id: pedidoId
    })
    
    // Descontar stock_actual y liberar reserva
    await this.inventarioService.descontarStock(
      item.producto_id,
      item.cantidad,
      tenantId
    )
  }
  
  // 4. Cambiar estado a LISTO_FACTURAR
  await this.updateEstado(pedidoId, EstadoPedido.LISTO_FACTURAR, tenantId)
  
  // 5. Notificar a ventas
  await this.notificationsService.emit('pedido.listo_facturar', {
    pedido_id: pedidoId,
    tenant_id: tenantId
  })
  
  return { success: true }
}
```

## UI/UX Considerations

### Comportamiento Dinámico por Configuración de Tenant

**IMPORTANTE:** La configuración se realiza a nivel de TENANT (empresa) desde el panel de superadmin o durante el asistente de creación de empresa.

**Configuración en Asistente de Creación de Empresa:**
```
┌─────────────────────────────────────────────────────────────┐
│ Configuración de Empresa                                    │
├─────────────────────────────────────────────────────────────┤
│ ¿Qué tipo de empresa eres?                                  │
│ ○ Microempresa (sin logística)                              │
│ ● Empresa con logística                                     │
├─────────────────────────────────────────────────────────────┤
│ Configuración de GRE:                                       │
│ ☑ Sugerir GRE automáticamente cuando el monto supere:      │
│   [S/ 700.00]                                               │
│ ☐ GRE obligatorio para todas las ventas                     │
└─────────────────────────────────────────────────────────────┘
```

Esta configuración determina:
- `usar_flujo_logistica`: true/false
- `gre_automatico_habilitado`: true/false
- `umbral_gre_automatico`: monto en soles
- `gre_obligatorio`: true/false

**Flujo Simple (usar_flujo_logistica = false):**
- Pedido CONFIRMADO muestra:
  - Estado: "CONFIRMADO"
  - Badge: "Stock: RESERVADO"
  - Botones: "Generar Factura" y "Cancelar Pedido"
  - Sin referencias a logística
  - Stock se descuenta al generar factura

**Flujo Completo (usar_flujo_logistica = true):**
- Pedido CONFIRMADO muestra:
  - Estado: "CONFIRMADO"
  - Badge: "Stock: RESERVADO"
  - Leyenda: "Esperando preparación en almacén"
  - Botones: "Ver en Inventario" y "Cancelar Pedido"
  - Sección de Logística visible en Inventario
  - Stock se descuenta al confirmar despacho

**El superadmin puede cambiar esta configuración en cualquier momento desde:**
`/dashboard/admin/empresas/[tenant_id]/configuracion`

### Pantallas de Logística

**Bandeja de Órdenes Pendientes:**
```
┌─────────────────────────────────────────────────────────────┐
│ Órdenes Pendientes de Preparación                           │
├──────────┬─────────────┬──────────────┬────────────────────┤
│ N° Pedido│ Cliente     │ Cant. Ítems  │ Acción             │
├──────────┼─────────────┼──────────────┼────────────────────┤
│ PV-001   │ Cliente ABC │ 5 productos  │ [Preparar]         │
│ PV-002   │ Cliente XYZ │ 3 productos  │ [Preparar]         │
└──────────┴─────────────┴──────────────┴────────────────────┘
```

**Modal de Preparación:**
```
┌─────────────────────────────────────────────────────────────┐
│ Preparar Pedido PV-001                                      │
├─────────────────────────────────────────────────────────────┤
│ ☐ Producto A x 10 unidades                                  │
│ ☐ Producto B x 5 unidades                                   │
│ ☐ Producto C x 2 unidades                                   │
├─────────────────────────────────────────────────────────────┤
│ [Marcar como Listo]  [Cancelar]                             │
└─────────────────────────────────────────────────────────────┘
```

### Sugerencias de GRE

**Modal de Sugerencia (gre_automatico_habilitado = true):**
```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️ Factura Emitida Exitosamente                             │
├─────────────────────────────────────────────────────────────┤
│ El monto de esta factura (S/ 1,500.00) supera el umbral    │
│ configurado (S/ 700.00). Se recomienda generar una Guía    │
│ de Remisión Electrónica.                                    │
├─────────────────────────────────────────────────────────────┤
│ [Sí, generar GRE]  [No, omitir]                             │
└─────────────────────────────────────────────────────────────┘
```

**Botones Opcionales (gre_automatico_habilitado = false):**
```
┌─────────────────────────────────────────────────────────────┐
│ ✓ Factura Emitida Exitosamente                              │
├─────────────────────────────────────────────────────────────┤
│ [Generar GRE]  [Finalizar]                                  │
└─────────────────────────────────────────────────────────────┘
```

### Selector de Cliente con Creación Rápida

**Selector Principal:**
```
┌─────────────────────────────────────────────────────────────┐
│ Cliente *                                                    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Buscar por RUC, DNI o nombre...          [+ Nuevo]      │ │
│ └─────────────────────────────────────────────────────────┘ │
│ Sugerencias:                                                │
│ • 20123456789 - Empresa ABC SAC                             │
│ • 12345678 - Juan Pérez                                     │
└─────────────────────────────────────────────────────────────┘
```

**Modal de Creación Rápida:**
```
┌─────────────────────────────────────────────────────────────┐
│ Nuevo Cliente (Rápido)                                      │
├─────────────────────────────────────────────────────────────┤
│ Tipo: ○ Persona  ● Empresa                                  │
│ Documento: [RUC ▼] [___________] [Validar con SUNAT]       │
│ Nombre/Razón Social: [_____________________________]        │
├─────────────────────────────────────────────────────────────┤
│ Nota: Podrás completar los demás datos después              │
├─────────────────────────────────────────────────────────────┤
│ [Guardar y Seleccionar]  [Cancelar]                         │
└─────────────────────────────────────────────────────────────┘
```

## Security Considerations

### Row Level Security (RLS)

Todas las tablas deben implementar RLS en Supabase:

```sql
-- Ejemplo para clientes
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's clientes"
  ON clientes FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY "Users can insert their tenant's clientes"
  ON clientes FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

### Permisos Granulares

Sistema de permisos basado en acciones específicas:

```typescript
// Definición de permisos
const VENTAS_PERMISSIONS = {
  'ventas.clientes.ver': 'Ver lista de clientes',
  'ventas.clientes.crear': 'Crear nuevos clientes',
  'ventas.clientes.editar': 'Editar clientes existentes',
  'ventas.clientes.eliminar': 'Eliminar clientes',
  'ventas.cotizaciones.ver': 'Ver cotizaciones',
  'ventas.cotizaciones.crear': 'Crear cotizaciones',
  'ventas.cotizaciones.convertir_pedido': 'Convertir cotizaciones a pedidos',
  'ventas.pedidos.ver': 'Ver pedidos',
  'ventas.pedidos.confirmar': 'Confirmar pedidos',
  'ventas.pedidos.cancelar': 'Cancelar pedidos',
  'ventas.pedidos.generar_factura': 'Generar facturas',
  'inventario.logistica.ver': 'Ver órdenes de logística',
  'inventario.logistica.preparar': 'Preparar pedidos',
  'inventario.logistica.despachar': 'Confirmar despachos'
}
```

### Validación de Certificado Digital

Antes de generar facturas, validar:

```typescript
async validarCertificado(tenantId: string): Promise<boolean> {
  const config = await this.getEmpresaConfig(tenantId)
  
  if (!config.certificado_digital_path) {
    throw new Error('Certificado digital no configurado')
  }
  
  const cert = await this.loadCertificate(config.certificado_digital_path)
  
  if (cert.notAfter < new Date()) {
    throw new Error('Certificado digital vencido')
  }
  
  return true
}
```

## Performance Optimization

### Database Indexing

Índices críticos para optimizar consultas frecuentes:

```sql
-- Búsqueda de clientes
CREATE INDEX idx_clientes_search ON clientes 
  USING gin(to_tsvector('spanish', razon_social || ' ' || nombre_comercial));

-- Filtros de pedidos
CREATE INDEX idx_pedidos_fecha ON pedidos_venta(fecha DESC);
CREATE INDEX idx_pedidos_estado_fecha ON pedidos_venta(estado, fecha DESC);

-- Consultas de stock
CREATE INDEX idx_productos_stock ON productos(stock_actual, stock_reservado);
```

### Caching Strategy

Cachear configuración de tenant en memoria:

```typescript
@Injectable()
export class TenantConfigCache {
  private cache = new Map<string, EmpresaConfig>()
  private TTL = 5 * 60 * 1000 // 5 minutos
  
  async get(tenantId: string): Promise<EmpresaConfig> {
    if (this.cache.has(tenantId)) {
      return this.cache.get(tenantId)
    }
    
    const config = await this.loadFromDB(tenantId)
    this.cache.set(tenantId, config)
    
    setTimeout(() => this.cache.delete(tenantId), this.TTL)
    
    return config
  }
}
```

### Pagination

Implementar paginación en todas las listas:

```typescript
interface PaginationParams {
  page: number
  limit: number
  sortBy?: string
  sortOrder?: 'ASC' | 'DESC'
}

interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}
```

## Monitoring and Logging

### Audit Log

Registrar todas las operaciones críticas:

```typescript
interface AuditLogEntry {
  id: string
  tenant_id: string
  user_id: string
  entity_type: string  // 'PEDIDO', 'COTIZACION', 'CLIENTE'
  entity_id: string
  action: string       // 'CREATE', 'UPDATE', 'DELETE', 'CONFIRM', 'CANCEL'
  changes: Record<string, any>
  timestamp: Date
}
```

### Integration Logs

Registrar integraciones con SUNAT/GRE:

```typescript
interface IntegrationLog {
  id: string
  tenant_id: string
  service: string      // 'SUNAT_CPE', 'SUNAT_GRE', 'SUNAT_RUC'
  operation: string
  request_summary: string
  response_summary: string
  status: 'SUCCESS' | 'ERROR' | 'TIMEOUT'
  correlation_id: string
  timestamp: Date
}
```

### Metrics

Métricas clave a monitorear:

- Tiempo promedio de conversión cotización → pedido → factura
- Tasa de conversión de cotizaciones
- Pedidos con stock insuficiente (%)
- Tiempo promedio de preparación (flujo completo)
- Errores de integración con SUNAT
- Uso de GRE (% de facturas con GRE)

## Estados Completos del Sistema

### Estados de Cotización

```typescript
enum EstadoCotizacion {
  BORRADOR = 'BORRADOR',                    // En edición
  ENVIADA = 'ENVIADA',                      // Enviada al cliente
  APROBADA_CLIENTE = 'APROBADA_CLIENTE',    // Cliente aceptó
  REQUIERE_APROBACION = 'REQUIERE_APROBACION', // Fase 2: Aprobación interna
  APROBADA = 'APROBADA',                    // Fase 2: Aprobada internamente
  RECHAZADA = 'RECHAZADA',                  // Rechazada
  CONVERTIDA = 'CONVERTIDA',                // Convertida a pedido
  VENCIDA = 'VENCIDA'                       // Superó fecha de vigencia
}
```

### Estados de Pedido (MVP + Fase 2)

```typescript
enum EstadoPedido {
  // MVP - Fase 1
  PENDIENTE = 'PENDIENTE',                  // Creado, sin confirmar
  CONFIRMADO = 'CONFIRMADO',                // Stock reservado
  EN_PREPARACION = 'EN_PREPARACION',        // En picking (flujo completo)
  LISTO_DESPACHO = 'LISTO_DESPACHO',       // Listo para despachar
  LISTO_FACTURAR = 'LISTO_FACTURAR',       // Listo para facturar
  FACTURADO = 'FACTURADO',                  // Factura emitida
  COMPLETADO = 'COMPLETADO',                // Completado sin GRE
  COMPLETADO_CON_GRE = 'COMPLETADO_CON_GRE', // Completado con GRE
  CANCELADO = 'CANCELADO',                  // Cancelado
  
  // Fase 2 - Mejoras ERP
  PENDIENTE_APROBACION = 'PENDIENTE_APROBACION', // Requiere aprobación interna
  APROBADO = 'APROBADO',                    // Aprobado internamente
  EN_PICKING = 'EN_PICKING',                // Picking en proceso
  EN_PACKING = 'EN_PACKING',                // Packing en proceso
  DESPACHADO = 'DESPACHADO',                // Despachado físicamente
  EN_TRANSITO = 'EN_TRANSITO',              // En tránsito
  ENTREGADO = 'ENTREGADO',                  // Entregado al cliente
  PARCIALMENTE_DESPACHADO = 'PARCIALMENTE_DESPACHADO', // Despacho parcial
  PARCIALMENTE_FACTURADO = 'PARCIALMENTE_FACTURADO',   // Facturación parcial
  DEVUELTO_PARCIALMENTE = 'DEVUELTO_PARCIALMENTE'      // Devolución parcial
}
```

### Estados de CPE

```typescript
enum EstadoCPE {
  BORRADOR = 'BORRADOR',                    // En preparación
  EMITIDO = 'EMITIDO',                      // Enviado a SUNAT
  ACEPTADO = 'ACEPTADO',                    // SUNAT aceptó
  OBSERVADO = 'OBSERVADO',                  // SUNAT observó
  RECHAZADO = 'RECHAZADO',                  // SUNAT rechazó
  BAJA_COMUNICADA = 'BAJA_COMUNICADA'       // Comunicación de baja
}
```

### Estados de GRE

```typescript
enum EstadoGRE {
  BORRADOR = 'BORRADOR',                    // En preparación
  EMITIDA = 'EMITIDA',                      // Enviada a SUNAT
  ACEPTADA = 'ACEPTADA',                    // SUNAT aceptó
  OBSERVADA = 'OBSERVADA',                  // SUNAT observó
  ANULADA = 'ANULADA'                       // Anulada
}
```

### Estados de CxC (Fase 2)

```typescript
enum EstadoCxC {
  PENDIENTE = 'PENDIENTE',                  // Por cobrar
  VENCIDA = 'VENCIDA',                      // Vencida
  EN_DISPUTA = 'EN_DISPUTA',                // En disputa
  CANCELADA = 'CANCELADA'                   // Pagada/cancelada
}
```

## Mejoras de Fase 2 (ERP Real)

### Aprobaciones Internas

**Reglas de Aprobación:**
```typescript
interface ReglaAprobacion {
  tipo: 'DESCUENTO' | 'MONTO' | 'MARGEN' | 'CLIENTE_NUEVO'
  umbral: number
  aprobadores: string[]  // roles o usuarios
  niveles: number        // niveles de aprobación
}
```

**Flujo:**
1. Al crear/confirmar pedido, evaluar reglas
2. Si dispara regla: estado → PENDIENTE_APROBACION
3. Notificar a aprobadores
4. Aprobadores revisan y aprueban/rechazan
5. Si aprobado: continuar flujo normal
6. Si rechazado: volver a PENDIENTE para ajustes

### Control de Crédito

**Validaciones antes de confirmar pedido:**
```typescript
interface ControlCredito {
  limite_credito: number
  credito_utilizado: number
  dias_credito: number
  bloqueado_por_morosidad: boolean
  facturas_vencidas: number
}
```

**Reglas:**
- Si `bloqueado_por_morosidad = true`: no permitir confirmar
- Si `credito_utilizado + total_pedido > limite_credito`: alertar y requerir aprobación
- Calcular fecha de vencimiento según `dias_credito`

### Multialmacén y Ubicaciones

**Estructura:**
```typescript
interface Almacen {
  id: string
  codigo: string
  nombre: string
  direccion: string
  es_principal: boolean
}

interface Ubicacion {
  id: string
  almacen_id: string
  pasillo: string
  estante: string
  nivel: string
  codigo: string  // Ej: "A-01-03"
}

interface StockPorUbicacion {
  producto_id: string
  almacen_id: string
  ubicacion_id: string
  cantidad: number
  lote?: string
  fecha_vencimiento?: Date
}
```

**Reserva y Salida:**
- Reservar por almacén y ubicación específica
- Picking genera lista por ubicación
- Soportar transferencias entre almacenes

### Lotes y Series

**Para productos con control de lote:**
```typescript
interface Lote {
  id: string
  producto_id: string
  numero_lote: string
  fecha_fabricacion: Date
  fecha_vencimiento: Date
  cantidad: number
}
```

**Reglas FEFO (First Expired, First Out):**
- Al hacer picking, seleccionar lotes con vencimiento más próximo
- Alertar si lote está próximo a vencer

**Para productos con serie (IMEI, etc.):**
```typescript
interface Serie {
  id: string
  producto_id: string
  numero_serie: string
  estado: 'DISPONIBLE' | 'RESERVADO' | 'VENDIDO'
}
```

### Picking y Packing Separados

**Picking:**
- Estado: EN_PICKING
- Generar lista de recolección por ubicación
- Registrar cantidades recolectadas
- Validar contra cantidades solicitadas

**Packing:**
- Estado: EN_PACKING
- Registrar bultos, peso, volumen
- Generar etiquetas y packing list
- Preparar para despacho

### Backorder y Parciales

**Cuando hay stock insuficiente:**
```typescript
interface BackorderItem {
  pedido_id: string
  producto_id: string
  cantidad_solicitada: number
  cantidad_despachada: number
  cantidad_pendiente: number
  estado: 'PENDIENTE' | 'COMPLETADO'
}
```

**Flujo:**
1. Despachar lo disponible
2. Marcar pedido como PARCIALMENTE_DESPACHADO
3. Crear backorder para cantidad pendiente
4. Cuando llegue stock, notificar y permitir despacho adicional
5. Facturar parcialmente o esperar despacho completo

### Facturación Parcial y Consolidada

**Parcial:**
- Generar múltiples facturas para un pedido
- Cada factura por despacho parcial
- Estado: PARCIALMENTE_FACTURADO

**Consolidada:**
- Una factura para múltiples pedidos del mismo cliente
- Vincular pedidos a factura
- Útil para clientes con múltiples órdenes pequeñas

### Anticipos

```typescript
interface Anticipo {
  id: string
  cliente_id: string
  monto: number
  fecha: Date
  aplicado: number
  saldo: number
  pedidos_aplicados: string[]
}
```

**Flujo:**
1. Registrar anticipo del cliente
2. Al facturar, aplicar anticipo disponible
3. Generar factura por diferencia
4. Actualizar saldo de anticipo

### Devoluciones (RMA)

```typescript
interface Devolucion {
  id: string
  pedido_id: string
  factura_id: string
  motivo: string
  items: DevolucionItem[]
  estado: 'SOLICITADA' | 'AUTORIZADA' | 'RECIBIDA' | 'PROCESADA'
}

interface DevolucionItem {
  producto_id: string
  cantidad: number
  accion: 'REINGRESO' | 'BAJA' | 'REPROCESO'
}
```

**Flujo:**
1. Cliente solicita devolución
2. Autorizar devolución (RMA)
3. Recibir productos
4. Según acción: reingresar a stock, dar de baja, o enviar a reproceso
5. Generar nota de crédito
6. Ajustar CxC

### Cuentas por Cobrar (CxC)

```typescript
interface CuentaPorCobrar {
  id: string
  factura_id: string
  cliente_id: string
  monto: number
  fecha_emision: Date
  fecha_vencimiento: Date
  saldo: number
  estado: EstadoCxC
  pagos: Pago[]
}

interface Pago {
  id: string
  cxc_id: string
  monto: number
  fecha: Date
  metodo: 'EFECTIVO' | 'TRANSFERENCIA' | 'CHEQUE' | 'TARJETA'
  referencia: string
}
```

**Funcionalidades:**
- Registro de pagos parciales
- Cálculo de intereses por mora
- Aging de CxC (0-30, 31-60, 61-90, >90 días)
- Promesas de pago
- Recordatorios automáticos

### Asientos Contables Automáticos

**Al emitir factura:**
```
DEBE:
  Cuentas por Cobrar - Cliente X    1,180.00

HABER:
  Ventas                             1,000.00
  IGV por Pagar                        180.00
```

**Al registrar costo de ventas:**
```
DEBE:
  Costo de Ventas                      600.00

HABER:
  Existencias                          600.00
```

### Multi-Moneda

```typescript
interface TipoCambio {
  fecha: Date
  moneda: string
  compra: number
  venta: number
}

interface PedidoMultiMoneda {
  moneda: string  // 'PEN', 'USD', 'EUR'
  tipo_cambio: number
  subtotal_moneda: number
  total_moneda: number
  subtotal_pen: number  // Convertido
  total_pen: number     // Convertido
}
```

### Listas de Precio

```typescript
interface ListaPrecio {
  id: string
  nombre: string
  tipo: 'GENERAL' | 'MAYORISTA' | 'MINORISTA' | 'ESPECIAL'
  vigencia_desde: Date
  vigencia_hasta?: Date
  items: ListaPrecioItem[]
}

interface ListaPrecioItem {
  producto_id: string
  precio: number
  moneda: string
  descuento_porcentaje?: number
}
```

**Asignación:**
- Por cliente
- Por segmento de cliente
- Por canal de venta
- Por temporada/promoción

## Migration Strategy

### Database Migrations

**IMPORTANTE:** Todos los scripts SQL deben ir en la carpeta `/supabase/migrations/`

Orden de ejecución de migraciones:

1. **Migration 001**: Crear tablas base (clientes, cotizaciones, pedidos)
   - Archivo: `/supabase/migrations/001_crear_tablas_ventas.sql`

2. **Migration 002**: Agregar campos a productos (stock_reservado)
   - Archivo: `/supabase/migrations/002_agregar_stock_reservado.sql`

3. **Migration 003**: Agregar campos a empresa_config (tipo_empresa, usar_flujo_logistica, gre_obligatorio)
   - Archivo: `/supabase/migrations/003_configuracion_tenant_ventas.sql`

4. **Migration 004**: Crear tabla movimientos_inventario con nuevos tipos
   - Archivo: `/supabase/migrations/004_movimientos_inventario_ventas.sql`

5. **Migration 005**: Crear índices de optimización
   - Archivo: `/supabase/migrations/005_indices_ventas.sql`

6. **Migration 006**: Crear función stock_disponible()
   - Archivo: `/supabase/migrations/006_funciones_stock.sql`

7. **Migration 007** (Fase 2): Tablas de aprobaciones, crédito, multialmacén
   - Archivo: `/supabase/migrations/007_mejoras_erp_fase2.sql`

### Data Backfill

Script de backfill para datos existentes:

```typescript
async backfillStockReservado() {
  // 1. Inicializar stock_reservado a 0 para todos los productos
  await this.db.query(`
    UPDATE productos 
    SET stock_reservado = 0 
    WHERE stock_reservado IS NULL
  `)
  
  // 2. Recalcular reservas de pedidos confirmados
  const pedidosConfirmados = await this.db.query(`
    SELECT id FROM pedidos_venta 
    WHERE estado IN ('CONFIRMADO', 'EN_PREPARACION', 'LISTO_DESPACHO')
  `)
  
  for (const pedido of pedidosConfirmados) {
    await this.recalcularReservas(pedido.id)
  }
}
```

### Rollback Plan

Plan de rollback en caso de problemas:

1. Revertir migraciones en orden inverso
2. Restaurar backup de base de datos
3. Revertir cambios de código
4. Notificar a usuarios afectados

## Testing Strategy

### Unit Tests

**Backend Services:**
- ClientesService: CRUD operations, validación RUC
- CotizacionesService: CRUD, conversión a pedido
- PedidosService: CRUD, confirmación, cancelación, generación de factura
- InventarioService: reservas, liberaciones, descuentos

**Test Coverage Goals:**
- Services: 80%+ coverage
- Controllers: 70%+ coverage
- DTOs: Validación completa

### Integration Tests

**Flujos End-to-End:**
- Flujo simple completo: Cotización → Pedido → Confirmar → Facturar
- Flujo completo: Cotización → Pedido → Confirmar → Preparar → Despachar → Facturar
- Cancelación de pedidos con liberación de reservas
- Sugerencia de GRE según configuración

### E2E Tests

**Escenarios de Usuario:**
- Crear cliente desde cotización (creación rápida)
- Convertir cotización a pedido
- Confirmar pedido con stock insuficiente
- Generar factura y GRE
- Cambiar configuración de flujo logístico

## Deployment Considerations

### Environment Variables

Variables de entorno necesarias:

```env
# SUNAT Integration
SUNAT_API_URL=https://api.sunat.gob.pe
SUNAT_RUC_VALIDATION_URL=https://api.sunat.gob.pe/v1/ruc
SUNAT_TIMEOUT=30000

# GRE Configuration
GRE_DEFAULT_THRESHOLD=700
GRE_AUTO_SUGGEST=true

# Stock Configuration
STOCK_WARNING_THRESHOLD=10
ALLOW_NEGATIVE_STOCK=false

# Audit
AUDIT_LOG_RETENTION_DAYS=365
```

### Feature Flags

Flags para habilitar/deshabilitar características:

```typescript
const FEATURE_FLAGS = {
  MULTI_ALMACEN: false,
  MULTI_MONEDA: false,
  LISTAS_PRECIO: false,
  NOTAS_CREDITO: false,
  GRE_INTEGRATION: true,
  SUNAT_RUC_VALIDATION: true
}
```

### Monitoring Alerts

Alertas críticas a configurar:

- Stock negativo detectado
- Certificado digital próximo a vencer (30 días)
- Tasa de error SUNAT > 5%
- Tiempo de respuesta API > 3s
- Pedidos bloqueados > 24h

## Documentation Requirements

### Technical Documentation

- Arquitectura del módulo
- Diagramas de flujo de estados
- Esquema de base de datos
- API endpoints (OpenAPI/Swagger)
- Guía de integración

### User Documentation

- Manual de usuario del módulo Ventas
- Guía de configuración inicial
- Diferencias entre flujo simple y completo
- Guía de reportes
- FAQ y troubleshooting

### Training Materials

- Video tutoriales por funcionalidad
- Guías paso a paso con screenshots
- Casos de uso comunes
- Best practicesation tests


### Integration Tests

**API Endpoints:**
- Test complete flows: cotización → pedido → factura
- Test stock reservation and release
- Test permission checks
- Test tenant isolation

**Database:**
- Test RLS policies
- Test cascading deletes
- Test unique constraints
- Test indexes performance

### E2E Tests (Optional)

**User Flows:**
- Crear cliente y generar cotización
- Convertir cotización a pedido
- Confirmar pedido y verificar reserva
- Generar factura y verificar descuento de stock
- Cancelar pedido y verificar liberación

## Security Considerations

### Authentication & Authorization

1. **Tenant Isolation**: Todos los queries deben filtrar por tenant_id
2. **RLS Policies**: Implementar políticas a nivel de base de datos
3. **Permission Checks**: Validar permisos en cada endpoint
4. **JWT Validation**: Verificar token en cada request

### Data Validation

1. **Input Sanitization**: Validar y sanitizar todos los inputs
2. **SQL Injection Prevention**: Usar prepared statements
3. **XSS Prevention**: Escapar outputs en frontend
4. **CSRF Protection**: Implementar tokens CSRF

### Business Rules Validation

1. **Stock Validation**: Verificar disponibilidad antes de reservar
2. **Estado Validation**: Validar transiciones de estado permitidas
3. **Duplicate Prevention**: Validar unicidad de números de documento
4. **Amount Validation**: Validar que montos sean positivos

## Performance Considerations

### Database Optimization

1. **Indexes**: Crear índices en campos frecuentemente consultados
   - tenant_id en todas las tablas
   - cliente_id, estado en pedidos y cotizaciones
   - producto_id en movimientos

2. **Query Optimization**:
   - Usar joins eficientes
   - Limitar resultados con paginación
   - Usar select específicos (no SELECT *)

3. **Caching Strategy**:
   - Cache de configuración de tenant
   - Cache de productos frecuentes
   - Invalidación al actualizar

### API Performance

1. **Pagination**: Implementar en todas las listas
2. **Lazy Loading**: Cargar detalles solo cuando se necesiten
3. **Batch Operations**: Permitir operaciones en lote cuando sea posible
4. **Response Compression**: Comprimir respuestas grandes

### Frontend Optimization

1. **Code Splitting**: Dividir código por rutas
2. **Lazy Loading**: Cargar componentes bajo demanda
3. **Memoization**: Usar React.memo para componentes pesados
4. **Debouncing**: En búsquedas y filtros

## Deployment Strategy

### Database Migrations

1. Crear tablas nuevas (clientes, cotizaciones, pedidos_venta)
2. Agregar campos a tablas existentes (productos, empresa_config)
3. Crear índices
4. Crear funciones y triggers
5. Implementar RLS policies

### Backend Deployment

1. Desplegar nuevos módulos (ClientesModule, PedidosModule)
2. Actualizar módulo existente (CotizacionesModule)
3. Actualizar app.module.ts con nuevos módulos
4. Verificar endpoints con health checks

### Frontend Deployment

1. Crear nuevas páginas en /dashboard/ventas
2. Actualizar sidebar con nuevo menú
3. Crear componentes compartidos
4. Actualizar tipos TypeScript
5. Verificar rutas y navegación

### Rollback Plan

1. Mantener backup de base de datos antes de migración
2. Versionar cambios de schema
3. Implementar feature flags para activar/desactivar módulo
4. Documentar pasos de rollback

## Monitoring & Observability

### Metrics to Track

1. **Business Metrics**:
   - Cotizaciones creadas por día
   - Tasa de conversión cotización → pedido
   - Pedidos confirmados por día
   - Tiempo promedio: cotización → factura

2. **Technical Metrics**:
   - Response time de endpoints
   - Error rate por endpoint
   - Database query performance
   - Stock reservation conflicts

3. **User Metrics**:
   - Usuarios activos en módulo
   - Páginas más visitadas
   - Errores de usuario (validaciones fallidas)

### Logging Strategy

1. **Application Logs**:
   - Cambios de estado de pedidos
   - Reservas y liberaciones de stock
   - Generación de facturas
   - Errores de integración

2. **Audit Logs**:
   - Creación/modificación de clientes
   - Conversión de cotizaciones
   - Cancelación de pedidos
   - Cambios de configuración

### Alerting

1. **Critical Alerts**:
   - Fallo en generación de facturas
   - Inconsistencias en stock
   - Errores de integración con SUNAT

2. **Warning Alerts**:
   - Stock bajo al reservar
   - Tiempo de respuesta alto
   - Tasa de error elevada

## Future Enhancements

### Phase 2 Features

1. **Descuentos y Promociones**: Sistema de descuentos en cotizaciones/pedidos
2. **Múltiples Almacenes**: Soporte para varios almacenes
3. **Rutas de Entrega**: Optimización de rutas para despacho
4. **Firma Digital**: Firma de cotizaciones y pedidos
5. **Portal de Cliente**: Acceso para clientes a sus pedidos

### Phase 3 Features

1. **Integración con CRM**: Sincronización con sistemas CRM
2. **Predicción de Demanda**: ML para predecir necesidades de stock
3. **Automatización de Reorden**: Pedidos automáticos a proveedores
4. **App Móvil**: App para vendedores en campo
5. **Integración con Marketplaces**: Sincronización con plataformas de venta

## Appendix

### Sidebar Navigation Update

**Current State:**
```typescript
{
  title: 'Cotizaciones',
  href: '/dashboard/cotizaciones',
  icon: FileSpreadsheet
}
```

**New State:**
```typescript
{
  title: 'Ventas',
  href: '/dashboard/ventas',
  icon: ShoppingCart,
  submenu: [
    { 
      name: 'Clientes', 
      href: '/dashboard/ventas/clientes',
      permission: { modulo: 'ventas', accion: 'read', recurso: 'clientes' }
    },
    { 
      name: 'Cotizaciones', 
      href: '/dashboard/ventas/cotizaciones',
      permission: { modulo: 'ventas', accion: 'read', recurso: 'cotizaciones' }
    },
    { 
      name: 'Pedidos', 
      href: '/dashboard/ventas/pedidos',
      permission: { modulo: 'ventas', accion: 'read', recurso: 'pedidos' }
    }
  ]
}
```

### Tenant Configuration Wizard

Al crear un nuevo tenant, se debe solicitar configuración inicial:

```typescript
interface ConfiguracionInicialEmpresa {
  tipo_empresa: 'MICRO' | 'PEQUEÑA' | 'MEDIANA' | 'GRANDE'
  usar_flujo_logistica: boolean  // Auto-sugerido según tipo
  gre_obligatorio: boolean
  gre_automatico_habilitado: boolean
  umbral_gre_automatico: number  // Default: 700
}

// Sugerencias automáticas:
// MICRO/PEQUEÑA → usar_flujo_logistica = false
// MEDIANA/GRANDE → usar_flujo_logistica = true
```

**Wizard Steps:**
1. Tipo de empresa (radio buttons)
2. Configuración de flujo logístico (checkbox, pre-marcado según tipo)
3. Configuración de GRE (checkboxes + input numérico)
4. Confirmación y resumen

### UI Mockups Details

#### Pedido Confirmado - Empresa Pequeña

```
┌─────────────────────────────────────────┐
│ Pedido #PV-2024-001                     │
│ Estado: CONFIRMADO                      │
│ Stock: RESERVADO ✓                      │
│                                         │
│ [Generar Factura]  [Cancelar Pedido]   │
└─────────────────────────────────────────┘
```

#### Pedido Confirmado - Empresa Grande

```
┌─────────────────────────────────────────┐
│ Pedido #PV-2024-001                     │
│ Estado: CONFIRMADO                      │
│ Stock: RESERVADO ✓                      │
│                                         │
│ ⏳ Esperando preparación en almacén     │
│                                         │
│ [Ver en Inventario]  [Cancelar Pedido] │
└─────────────────────────────────────────┘
```

#### Logística - Órdenes Pendientes

```
┌─────────────────────────────────────────────────────┐
│ Órdenes Pendientes de Preparación                  │
├─────────────────────────────────────────────────────┤
│ PV-2024-001 │ Cliente ABC │ 5 items │ [Preparar]  │
│ PV-2024-002 │ Cliente XYZ │ 3 items │ [Preparar]  │
└─────────────────────────────────────────────────────┘
```

#### Preparación de Pedido

```
┌─────────────────────────────────────────┐
│ Preparación de Pedido #PV-2024-001      │
│                                         │
│ ☐ Producto A - 10 unidades              │
│ ☐ Producto B - 5 unidades               │
│ ☐ Producto C - 2 unidades               │
│                                         │
│ [Marcar como Listo] [Cancelar]          │
└─────────────────────────────────────────┘
```

#### Sugerencia GRE Automática

```
┌─────────────────────────────────────────┐
│ ✓ Factura emitida correctamente         │
│                                         │
│ 💡 Este pedido supera S/ 700            │
│    ¿Deseas generar Guía de Remisión?   │
│                                         │
│ [Sí, generar GRE]  [No, omitir]        │
└─────────────────────────────────────────┘
```

#### Sugerencia GRE Manual

```
┌─────────────────────────────────────────┐
│ ✓ Factura emitida correctamente         │
│                                         │
│ [Generar GRE] [Finalizar]               │
└─────────────────────────────────────────┘
```

### SUNAT Validations

**Cliente Validation:**
- RUC: Exactamente 11 dígitos numéricos
- DNI: Exactamente 8 dígitos numéricos
- CE: Hasta 12 caracteres alfanuméricos
- Pasaporte: Hasta 12 caracteres alfanuméricos
- Validación opcional con API SUNAT para RUC

**Factura Validation:**
- Máximo 999 items por documento
- Boleta sin RUC y monto > S/ 700 → requiere GRE
- Certificado digital debe estar vigente
- Serie debe estar configurada en empresa_config
- IGV debe ser exactamente 18%

### Permissions Matrix

| Recurso | Acción | Permiso | Descripción |
|---------|--------|---------|-------------|
| Clientes | Ver | ventas.clientes.ver | Ver lista y detalle de clientes |
| Clientes | Crear | ventas.clientes.crear | Crear nuevos clientes |
| Clientes | Editar | ventas.clientes.editar | Modificar clientes existentes |
| Clientes | Eliminar | ventas.clientes.eliminar | Eliminar clientes |
| Cotizaciones | Ver | ventas.cotizaciones.ver | Ver cotizaciones |
| Cotizaciones | Crear | ventas.cotizaciones.crear | Crear cotizaciones |
| Cotizaciones | Editar | ventas.cotizaciones.editar | Modificar cotizaciones |
| Cotizaciones | Convertir | ventas.cotizaciones.convertir_pedido | Convertir a pedido |
| Pedidos | Ver | ventas.pedidos.ver | Ver pedidos |
| Pedidos | Crear | ventas.pedidos.crear | Crear pedidos |
| Pedidos | Confirmar | ventas.pedidos.confirmar | Confirmar y reservar stock |
| Pedidos | Cancelar | ventas.pedidos.cancelar | Cancelar y liberar stock |
| Pedidos | Facturar | ventas.pedidos.generar_factura | Generar factura |
| Logística | Ver | inventario.logistica.ver | Ver órdenes pendientes |
| Logística | Preparar | inventario.logistica.preparar | Iniciar preparación |
| Logística | Despachar | inventario.logistica.despachar | Confirmar despacho |

### Notifications Events

```typescript
// Eventos del sistema
export enum VentasEvent {
  COTIZACION_CREADA = 'cotizacion.creada',
  COTIZACION_CONVERTIDA = 'cotizacion.convertida',
  PEDIDO_CREADO = 'pedido.creado',
  PEDIDO_CONFIRMADO = 'pedido.confirmado',
  PEDIDO_EN_PREPARACION = 'pedido.en_preparacion',
  PEDIDO_LISTO_DESPACHO = 'pedido.listo_despacho',
  PEDIDO_LISTO_FACTURAR = 'pedido.listo_facturar',
  PEDIDO_CANCELADO = 'pedido.cancelado',
  FACTURA_EMITIDA = 'factura.emitida',
  GRE_GENERADA = 'gre.generada',
  STOCK_BAJO = 'stock.bajo'
}

// Destinatarios por evento
const notificationRecipients = {
  'cotizacion.convertida': ['vendedor', 'gerente_ventas'],
  'pedido.confirmado': ['almacen', 'logistica'],
  'pedido.listo_facturar': ['vendedor', 'facturacion'],
  'stock.bajo': ['almacen', 'compras', 'gerente_operaciones'],
  'factura.emitida': ['vendedor', 'cliente', 'contabilidad']
}
```

### Reports Specifications

**1. Ventas por Cliente**
- Filtros: Rango de fechas, cliente
- Columnas: Cliente, Total Cotizaciones, Total Pedidos, Total Facturado
- Exportable a Excel/PDF

**2. Cotizaciones Pendientes**
- Filtros: Estado, fecha de vencimiento
- Columnas: Número, Cliente, Fecha, Monto, Estado, Días para vencer
- Acciones: Ver, Convertir a Pedido

**3. Pedidos por Estado**
- Filtros: Estado, rango de fechas
- Gráfico de distribución por estado
- Tabla con detalles

**4. Productos Más Vendidos**
- Filtros: Rango de fechas
- Top 10 productos
- Columnas: Producto, Cantidad Vendida, Monto Total

**5. Clientes con Mayor Facturación**
- Filtros: Rango de fechas
- Top 20 clientes
- Columnas: Cliente, Total Facturado, Cantidad de Pedidos

**6. Tiempo Promedio: Cotización → Factura**
- Métrica: Días promedio
- Desglose por etapa
- Gráfico de tendencia

### Migration Strategy

**Phase 1: Database Setup**
1. Crear tabla `clientes`
2. Crear tabla `cotizaciones` (si no existe)
3. Crear tabla `cotizaciones_detalle`
4. Crear tabla `pedidos_venta`
5. Crear tabla `pedidos_venta_detalle`
6. Agregar campos a `productos` (stock_reservado)
7. Agregar campos a `empresa_config` (tipo_empresa, usar_flujo_logistica, gre_obligatorio)
8. Crear índices
9. Implementar RLS policies

**Phase 2: Backend Implementation**
1. Crear ClientesModule
2. Mejorar CotizacionesModule
3. Crear PedidosModule
4. Crear LogisticaModule (dentro de Inventario)
5. Actualizar InventarioService con métodos de reserva
6. Implementar integraciones con CPE y GRE

**Phase 3: Frontend Implementation**
1. Crear páginas de Clientes
2. Crear páginas de Cotizaciones
3. Crear páginas de Pedidos
4. Crear páginas de Logística
5. Actualizar sidebar
6. Crear componentes compartidos

**Phase 4: Testing & Deployment**
1. Unit tests
2. Integration tests
3. E2E tests
4. UAT (User Acceptance Testing)
5. Production deployment

### Glossary

- **CPE**: Comprobante de Pago Electrónico
- **GRE**: Guía de Remisión Electrónica
- **RLS**: Row Level Security
- **SUNAT**: Superintendencia Nacional de Aduanas y de Administración Tributaria
- **IGV**: Impuesto General a las Ventas (18%)
- **RUC**: Registro Único de Contribuyentes
- **DNI**: Documento Nacional de Identidad
- **UAT**: User Acceptance Testing
- **Picking**: Proceso de recolección de productos en almacén

### References

- NestJS Documentation: https://docs.nestjs.com
- Next.js Documentation: https://nextjs.org/docs
- Supabase Documentation: https://supabase.com/docs
- SUNAT API Documentation: (internal reference)
