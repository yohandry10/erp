# Documentación Técnica Exhaustiva: Compras e Inventario

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `manual_modulo`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Este documento detalla los flujos de abastecimiento, aprobación de compras, gestión de inventarios y logística del ERP.

---

## 1. Módulo de Compras (`/src/modules/compras`)

Gestiona la adquisición de bienes, desde la cotización hasta la recepción e integración contable.

### 1.1. Arquitectura y Componentes

| Componente | Archivo | Responsabilidad |
| :--- | :--- | :--- |
| **Controller** | `compras.controller.ts` | Endpoints REST (30KB) |
| **OrdenesCompraService** | `ordenes-compra.service.ts` | Gestión de órdenes (48KB, 1273 líneas) |
| **RecepcionesService** | `recepciones.service.ts` | Entrada de mercadería (33KB) |
| **ProveedoresService** | `proveedores.service.ts` | CRUD de proveedores |
| **DevolucionesProveedorService** | `devoluciones-proveedor.service.ts` | Devoluciones a proveedores |
| **CotizacionesCompraService** | `cotizaciones-compra.service.ts` | Gestión de cotizaciones |

#### Dependencias Críticas
```typescript
constructor(
  private readonly ordenesRepository: OrdenesCompraRepository,
  private readonly cotizacionesRepository: CotizacionesCompraRepository,
  private readonly ocAprobacionesRepository: OcAprobacionesRepository,
  private readonly eventBus: EventBusService,
  private readonly cacheInvalidation: CacheInvalidationService,
  private readonly taxCalculator: TaxCalculatorService,
  private readonly devolucionesProveedorService: DevolucionesProveedorService,
)
```

### 1.2. Modelo de Datos

#### Tabla `ordenes_compra` (Cabecera)
| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | UUID | Identificador único |
| `tenant_id` | UUID | Aislamiento multi-tenant |
| `numero_orden` | VARCHAR | Correlativo (OC-2024-00001) |
| `proveedor_id` | UUID | Referencia al proveedor |
| `estado` | ENUM | Estado actual del flujo |
| `fecha_orden` | DATE | Fecha de creación |
| `fecha_entrega_esperada` | DATE | Fecha comprometida |
| `subtotal` | DECIMAL(18,2) | Base sin impuestos |
| `igv` | DECIMAL(18,2) | Impuesto calculado |
| `total` | DECIMAL(18,2) | Total incluyendo IGV |
| `moneda` | CHAR(3) | PEN, USD |
| `condiciones_pago` | VARCHAR | CONTADO, CREDITO_30, etc. |
| `notas` | TEXT | Observaciones |

#### Tabla `ordenes_compra_detalle` (Líneas)
| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `orden_id` | UUID | Referencia a cabecera |
| `producto_id` | UUID | Producto a comprar |
| `cantidad` | DECIMAL | Cantidad solicitada |
| `cantidad_recibida` | DECIMAL | Acumulado de recepciones |
| `precio_unitario` | DECIMAL | Precio de compra |
| `descuento` | DECIMAL | Descuento negociado |

### 1.3. Máquina de Estados de Órdenes de Compra

```
┌───────────┐
│ BORRADOR  │
└─────┬─────┘
      │ enviar()
      ▼
┌───────────┐      evaluarRequiereAprobacion()
│ PENDIENTE │─────────────────────────────────┐
└─────┬─────┘                                 │
      │ (monto < límite)                      ▼
      │                              ┌─────────────┐
      │                              │ APROBACION  │
      ▼                              └──────┬──────┘
┌───────────┐◄──────────────────────────────┘
│ APROBADA  │        aprobar()
└─────┬─────┘
      │ crearRecepcion()
      ▼
┌───────────┐
│  PARCIAL  │ (recepción parcial)
└─────┬─────┘
      │ recepción completa
      ▼
┌───────────┐
│ RECIBIDA  │ (Estado Final)
└───────────┘

Estados Terminales: RECIBIDA, ANULADA
```

#### Transiciones Permitidas (Código)
```typescript
validarTransicionEstadoOrden(estadoActual: string, nuevoEstado: string): void {
  const transicionesPermitidas: Record<string, string[]> = {
    BORRADOR: ['PENDIENTE', 'APROBACION', 'ANULADA'],
    PENDIENTE: ['APROBACION', 'APROBADA', 'ANULADA'],
    APROBACION: ['PENDIENTE', 'APROBADA', 'ANULADA'],
    APROBADA: ['PARCIAL', 'RECIBIDA', 'ANULADA'],
    PARCIAL: ['RECIBIDA', 'ANULADA'],
    RECIBIDA: [], // Estado final
    ANULADA: []   // Estado final
  };

  if (!transicionesPermitidas[estadoActual]?.includes(nuevoEstado)) {
    throw new BadRequestException(
      `Transición no permitida: ${estadoActual} → ${nuevoEstado}`
    );
  }
}
```

### 1.4. Flujo de Creación de Orden de Compra

```typescript
async create(createDto: CreateOrdenCompraDto, tenantId: string, userId?: string) {
  // 1. Validaciones de entrada
  this.validarPreciosNoNegativos(createDto.detalles);
  this.validarCantidadesMayorCero(createDto.detalles);
  this.validarFechaEntrega(createDto.fecha_entrega_esperada, createDto.fecha_orden);

  // 2. Cálculo de totales con precisión decimal
  const totales = this.calcularTotales(createDto.detalles);

  // 3. Evaluar si requiere aprobación
  const requiereAprobacion = await this.evaluarRequiereAprobacion(
    totales.total, tenantId
  );

  // 4. Determinar estado inicial
  const estadoInicial = requiereAprobacion ? 'APROBACION' : 'PENDIENTE';

  // 5. Persistir orden
  const orden = await this.ordenesRepository.create({
    ...createDto,
    tenant_id: tenantId,
    estado: estadoInicial,
    numero_orden: await this.generarNumeroOrden(tenantId),
    ...totales
  });

  // 6. Si requiere aprobación, crear registros pendientes
  if (requiereAprobacion) {
    await this.crearAprobacionesPendientes(orden.id, tenantId, totales.total);
    await this.notificarAprobadores(orden.id, tenantId, totales.total);
  }

  return orden;
}
```

### 1.5. Sistema de Aprobaciones

#### Evaluación de Requisito de Aprobación
```typescript
async evaluarRequiereAprobacion(total: number, tenantId: string): Promise<boolean> {
  const config = await this.obtenerConfiguracion(tenantId);

  // Regla 1: Monto máximo sin aprobación
  if (config.monto_maximo_compra_sin_aprobacion) {
    if (total > config.monto_maximo_compra_sin_aprobacion) {
      return true;
    }
  }

  // Regla 2: Presupuesto disponible (si aplica)
  if (config.control_presupuestal_habilitado) {
    const presupuestoDisponible = await this.verificarPresupuesto(tenantId);
    if (total > presupuestoDisponible) {
      return true;
    }
  }

  return false;
}
```

#### Proceso de Aprobación
```typescript
async aprobar(id: string, aprobarDto: AprobarOrdenCompraDto, tenantId: string, userId?: string) {
  const orden = await this.findById(id, tenantId);

  // Validar transición de estado
  this.validarTransicionEstadoOrden(orden.estado, 'APROBADA');

  // Registrar aprobación
  await this.ocAprobacionesRepository.registrarAprobacion({
    orden_id: id,
    aprobador_id: userId,
    decision: 'APROBADA',
    comentarios: aprobarDto.comentarios,
    fecha_decision: new Date()
  });

  // Actualizar estado de la orden
  await this.ordenesRepository.update(id, { estado: 'APROBADA' });

  // Emitir evento para integración con CxP y Contabilidad
  await this.emitirEventoOrdenAprobada(orden, tenantId, userId);

  // Invalidar caché
  await this.cacheInvalidation.invalidate(`ordenes:${tenantId}`);

  return this.findById(id, tenantId);
}
```

### 1.6. Recepciones de Mercadería

#### Ciclo de Vida de Recepción
```
┌───────────┐     agregarItems()     ┌──────────────┐
│ BORRADOR  │───────────────────────▶│ EN_PROGRESO  │
└───────────┘                        └──────┬───────┘
                                            │
                                   cerrarRecepcion()
                                            │
                                            ▼
                                     ┌───────────┐
                                     │  CERRADA  │
                                     └───────────┘
```

#### Proceso de Cierre de Recepción
```typescript
async cerrarRecepcion(recepcionId: string, tenantId: string, dto: CerrarRecepcionDto, userId?: string) {
  const recepcion = await this.obtenerRecepcionPorId(recepcionId, tenantId);
  const orden = await this.obtenerOrdenCompra(recepcion.orden_compra_id, tenantId);

  // Validación: No recibir más de lo ordenado
  for (const item of recepcion.items) {
    const detalleOrden = orden.detalles.find(d => d.producto_id === item.producto_id);
    const totalRecibido = detalleOrden.cantidad_recibida + item.cantidad;

    if (totalRecibido > detalleOrden.cantidad) {
      throw new BadRequestException(
        `Producto ${item.producto.nombre}: excede cantidad ordenada`
      );
    }
  }

  // Registrar entrada de inventario (atómico)
  for (const item of recepcion.items) {
    await this.inventarioService.registrarEntradaStockAtomico({
      tenantId,
      productoId: item.producto_id,
      almacenId: recepcion.almacen_id,
      tipo: 'ENTRADA',
      cantidad: item.cantidad,
      referenciaTipo: 'RECEPCION',
      referenciaId: recepcionId,
      lote: item.lote,
      fechaExpiracion: item.fecha_expiracion
    });
  }

  // Actualizar cantidades recibidas en OC
  await this.actualizarCantidadesRecibidas(orden.id, recepcion.items);

  // Actualizar estado de la orden
  await this.actualizarEstadoOrden(orden.id, tenantId);

  // Emitir eventos para CxP y Contabilidad
  await this.emitirEventoRecepcionRegistrada(recepcion, orden, tenantId);
  await this.emitirEventoCompraEntregada(recepcion, orden, tenantId);

  return this.marcarRecepcionCerrada(recepcionId);
}
```

### 1.7. Cancelación de Órdenes con Recepciones

```typescript
async cancelar(id: string, cancelarDto: CancelarOrdenCompraDto, tenantId: string, userId?: string) {
  const orden = await this.findById(id, tenantId);

  // Verificar recepciones activas
  const recepcionesActivas = await this.findRecepcionesByOrdenId(id, tenantId);
  const tieneRecepcionesEnCurso = recepcionesActivas.some(r => r.estado !== 'CERRADA');
  const tieneRecepcionesCerradas = recepcionesActivas.some(r => r.estado === 'CERRADA');

  if (tieneRecepcionesEnCurso) {
    throw new BadRequestException('No se puede cancelar: tiene recepciones en curso');
  }

  if (tieneRecepcionesCerradas) {
    if (!cancelarDto.permitir_cancelar_con_recepciones_cerradas) {
      throw new BadRequestException(
        'Orden tiene recepciones cerradas. Use flag permitir_cancelar_con_recepciones_cerradas'
      );
    }

    // Revertir recepciones cerradas (devolver stock, revertir CxP)
    await this.revertirRecepcionesCerradasAntesDeCancelar({
      ordenId: id,
      tenantId,
      proveedorId: orden.proveedor_id,
      motivo: cancelarDto.motivo,
      userId
    });
  }

  // Cancelar orden
  return this.ordenesRepository.update(id, {
    estado: 'ANULADA',
    motivo_cancelacion: cancelarDto.motivo,
    cancelado_por: userId,
    fecha_cancelacion: new Date()
  });
}
```

### 1.8. Endpoints del Módulo de Compras

| Método | Ruta | Descripción | Permisos |
| :--- | :--- | :--- | :--- |
| `GET` | `/compras/ordenes` | Listar órdenes (filtros, paginación) | `compras.ordenes.ver` |
| `GET` | `/compras/ordenes/:id` | Detalle de orden | `compras.ordenes.ver` |
| `POST` | `/compras/ordenes` | Crear orden | `compras.ordenes.crear` |
| `PUT` | `/compras/ordenes/:id` | Actualizar (solo BORRADOR/PENDIENTE) | `compras.ordenes.editar` |
| `POST` | `/compras/ordenes/:id/aprobar` | Aprobar orden | `compras.aprobaciones.resolver` |
| `POST` | `/compras/ordenes/:id/rechazar` | Rechazar orden | `compras.aprobaciones.resolver` |
| `POST` | `/compras/ordenes/:id/cancelar` | Cancelar orden | `compras.ordenes.cancelar` |
| `GET` | `/compras/ordenes/:id/recepciones` | Listar recepciones de OC | `compras.recepciones.ver` |
| `POST` | `/compras/recepciones` | Crear recepción | `compras.recepciones.crear` |
| `POST` | `/compras/recepciones/:id/cerrar` | Cerrar recepción | `compras.recepciones.cerrar` |

---

## 2. Módulo de Inventario (`/src/modules/inventario`)

Núcleo lógico para el control de existencias. Implementa modelo de doble saldo y operaciones atómicas.

### 2.1. Arquitectura del Servicio

```typescript
// Tipos de Movimiento
export enum TipoMovimiento {
  ENTRADA = 'ENTRADA',       // Compra, devolución cliente
  SALIDA = 'SALIDA',        // Venta, devolución proveedor
  RESERVA = 'RESERVA',      // Compromiso de venta (no mueve stock físico)
  LIBERACION = 'LIBERACION', // Cancelación de pedido
  AJUSTE = 'AJUSTE',        // Corrección de inventario
  TRANSFERENCIA = 'TRANSFERENCIA' // Entre almacenes
}
```

### 2.2. Modelo de Doble Saldo

```
┌─────────────────────────────────────────────────────────────┐
│                    PRODUCTO_EXISTENCIAS                      │
├─────────────────────────────────────────────────────────────┤
│  stock_actual    = Cantidad física real en almacén          │
│  stock_reservado = Cantidad comprometida (pedidos confirmados)│
│                                                             │
│  Stock Disponible = stock_actual - stock_reservado          │
│  (Calculado, no almacenado)                                 │
└─────────────────────────────────────────────────────────────┘
```

### 2.3. Operaciones Atómicas (RPC)

#### Registrar Entrada de Stock
```typescript
async registrarEntradaStockAtomico(params: MovimientoAlmacenParams): Promise<string> {
  // Llamada a función PostgreSQL que garantiza atomicidad
  const { data, error } = await this.supabase.rpc('registrar_entrada_stock_atomico', {
    p_tenant_id: params.tenantId,
    p_producto_id: params.productoId,
    p_almacen_id: params.almacenId,
    p_cantidad: params.cantidad,
    p_referencia_tipo: params.referenciaTipo,
    p_referencia_id: params.referenciaId,
    p_lote: params.lote,
    p_fecha_expiracion: params.fechaExpiracion,
    p_notas: params.notas
  });

  if (error) throw new BadRequestException(error.message);

  // Verificar que el stock se actualizó correctamente
  const verificacion = await this.verificarStockActualizado(
    params.productoId,
    params.almacenId,
    'ENTRADA',
    params.cantidad,
    params.tenantId
  );

  if (!verificacion.stockActualizado) {
    throw new Error(`Stock no actualizado: ${verificacion.error}`);
  }

  return data.movimiento_id;
}
```

#### Función PostgreSQL Atómica
```sql
CREATE OR REPLACE FUNCTION registrar_entrada_stock_atomico(
  p_tenant_id UUID,
  p_producto_id UUID,
  p_almacen_id UUID,
  p_cantidad DECIMAL,
  p_referencia_tipo VARCHAR,
  p_referencia_id UUID,
  p_lote VARCHAR DEFAULT NULL,
  p_fecha_expiracion DATE DEFAULT NULL,
  p_notas TEXT DEFAULT NULL
) RETURNS TABLE(movimiento_id UUID, stock_anterior DECIMAL, stock_nuevo DECIMAL)
LANGUAGE plpgsql AS $$
DECLARE
  v_movimiento_id UUID;
  v_stock_anterior DECIMAL;
  v_stock_nuevo DECIMAL;
BEGIN
  -- Bloquear fila para evitar race conditions
  SELECT stock_actual INTO v_stock_anterior
  FROM producto_existencias
  WHERE tenant_id = p_tenant_id
    AND producto_id = p_producto_id
    AND almacen_id = p_almacen_id
  FOR UPDATE;

  -- Si no existe, crear registro
  IF v_stock_anterior IS NULL THEN
    v_stock_anterior := 0;
    INSERT INTO producto_existencias (tenant_id, producto_id, almacen_id, stock_actual)
    VALUES (p_tenant_id, p_producto_id, p_almacen_id, 0);
  END IF;

  v_stock_nuevo := v_stock_anterior + p_cantidad;

  -- Actualizar stock
  UPDATE producto_existencias
  SET stock_actual = v_stock_nuevo, updated_at = NOW()
  WHERE tenant_id = p_tenant_id
    AND producto_id = p_producto_id
    AND almacen_id = p_almacen_id;

  -- Crear movimiento
  INSERT INTO movimientos_inventario (
    tenant_id, producto_id, almacen_id, tipo, cantidad,
    stock_anterior, stock_posterior,
    referencia_tipo, referencia_id, lote, fecha_expiracion, notas
  ) VALUES (
    p_tenant_id, p_producto_id, p_almacen_id, 'ENTRADA', p_cantidad,
    v_stock_anterior, v_stock_nuevo,
    p_referencia_tipo, p_referencia_id, p_lote, p_fecha_expiracion, p_notas
  ) RETURNING id INTO v_movimiento_id;

  RETURN QUERY SELECT v_movimiento_id, v_stock_anterior, v_stock_nuevo;
END;
$$;
```

### 2.4. Reserva y Liberación de Stock

#### Reservar Stock (Confirmar Pedido)
```typescript
async reservarStock(
  producto_id: string,
  cantidad: number,
  tenant_id: string,
  referencia_tipo?: string,
  referencia_id?: string
): Promise<string> {
  // Verificar disponibilidad
  const disponible = await this.getStockDisponible(producto_id, tenant_id);
  if (disponible < cantidad) {
    throw new BadRequestException(
      `Stock insuficiente. Disponible: ${disponible}, Solicitado: ${cantidad}`
    );
  }

  // Incrementar stock_reservado (atómico)
  const { data, error } = await this.supabase.rpc('reservar_stock', {
    p_tenant_id: tenant_id,
    p_producto_id: producto_id,
    p_cantidad: cantidad,
    p_referencia_tipo: referencia_tipo,
    p_referencia_id: referencia_id
  });

  if (error) throw new BadRequestException(error.message);

  // Crear movimiento tipo RESERVA
  return this.crearMovimiento({
    tenant_id,
    producto_id,
    tipo: TipoMovimiento.RESERVA,
    cantidad,
    referencia_tipo,
    referencia_id
  });
}
```

#### Liberar Reserva (Cancelar Pedido)
```typescript
async liberarReserva(
  producto_id: string,
  cantidad: number,
  tenant_id: string,
  referencia_tipo?: string,
  referencia_id?: string
): Promise<string> {
  // Decrementar stock_reservado
  await this.supabase.rpc('liberar_reserva', {
    p_tenant_id: tenant_id,
    p_producto_id: producto_id,
    p_cantidad: cantidad
  });

  // Crear movimiento tipo LIBERACION
  return this.crearMovimiento({
    tenant_id,
    producto_id,
    tipo: TipoMovimiento.LIBERACION,
    cantidad,
    referencia_tipo,
    referencia_id
  });
}
```

### 2.5. Descuento de Stock (Despacho)

```typescript
async descontarStock(
  producto_id: string,
  cantidad: number,
  tenant_id: string,
  referencia_tipo?: string,
  referencia_id?: string
): Promise<string> {
  // 1. Validar stock disponible
  const existencias = await this.getExistencias(producto_id, tenant_id);
  if (existencias.stock_actual < cantidad) {
    throw new BadRequestException('Stock insuficiente para despacho');
  }

  // 2. Decrementar stock_actual y stock_reservado (si aplica)
  const { error } = await this.supabase.rpc('descontar_stock', {
    p_tenant_id: tenant_id,
    p_producto_id: producto_id,
    p_cantidad: cantidad,
    p_liberar_reserva: true // También libera la reserva correspondiente
  });

  if (error) throw new BadRequestException(error.message);

  // 3. Crear movimiento tipo SALIDA
  const movimientoId = await this.crearMovimiento({
    tenant_id,
    producto_id,
    tipo: TipoMovimiento.SALIDA,
    cantidad,
    referencia_tipo,
    referencia_id
  });

  // 4. Emitir evento para contabilidad (Costo de Ventas)
  await this.eventBus.emit('inventario.movimiento', {
    tipo: 'SALIDA',
    producto_id,
    cantidad,
    costo_unitario: existencias.costo_promedio,
    tenant_id
  });

  return movimientoId;
}
```

### 2.6. Verificación de Consistencia

```typescript
async verificarStockActualizado(
  productoId: string,
  almacenId: string,
  tipo: 'ENTRADA' | 'SALIDA' | 'RESERVA' | 'LIBERACION',
  cantidad: number,
  tenantId: string
): Promise<{ stockActualizado: boolean; stockActual?: number; error?: string }> {
  // Buscar el último movimiento
  const { data: movimiento } = await this.supabase
    .from('movimientos_inventario')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('producto_id', productoId)
    .eq('almacen_id', almacenId)
    .eq('tipo', tipo)
    .eq('cantidad', cantidad)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!movimiento) {
    return { stockActualizado: false, error: 'Movimiento no encontrado' };
  }

  // Verificar que stock_posterior coincide con existencias actuales
  const { data: existencias } = await this.supabase
    .from('producto_existencias')
    .select('stock_actual')
    .eq('tenant_id', tenantId)
    .eq('producto_id', productoId)
    .eq('almacen_id', almacenId)
    .single();

  const coincide = existencias.stock_actual === movimiento.stock_posterior;

  return {
    stockActualizado: coincide,
    stockActual: existencias.stock_actual,
    error: coincide ? undefined : 'Stock no coincide con movimiento'
  };
}
```

---

## 3. Módulo de Logística (`/src/modules/inventario/logistica`)

Gestiona preparación (Picking), empaquetado (Packing) y despacho de pedidos confirmados.

### 3.1. Configuración de Logística

```typescript
interface ConfigLogistica {
  usar_flujo_logistica: boolean;      // Activa estados intermedios
  habilitar_multialmacen: boolean;    // Permite despacho desde múltiples almacenes
  requiere_ubicaciones_inventario: boolean; // Exige ubicación específica
  requiere_lotes_series: boolean;     // Control de lotes/números serie
  objetivo_otif?: number;             // Objetivo On-Time-In-Full (ej: 95%)
  habilitar_dashboards_otif?: boolean;
}
```

### 3.2. Flujo de Despacho

```
┌──────────────┐     prepararPedido()     ┌─────────────────┐
│  CONFIRMADO  │─────────────────────────▶│ EN_PREPARACION  │
└──────────────┘                          └────────┬────────┘
                                                   │
                                      marcarListoDespacho()
                                                   │
                                                   ▼
                                           ┌──────────────┐
                                           │LISTO_DESPACHO│
                                           └───────┬──────┘
                                                   │
                                        confirmarDespacho()
                         ┌─────────────────────────┴─────────────────────────┐
                         │                                                   │
                   (Completo)                                          (Parcial)
                         │                                                   │
                         ▼                                                   ▼
                  ┌────────────┐                                    ┌─────────────────┐
                  │ DESPACHADO │                                    │ DESPACHO_PARCIAL│
                  └──────┬─────┘                                    └────────┬────────┘
                         │                                                   │
              actualizarTracking()                                   completar resto
                         │                                                   │
                         ▼                                                   ▼
                  ┌────────────┐                                    ┌────────────┐
                  │ EN_TRANSITO│──────── marcarEntregado() ────────▶│ ENTREGADO  │
                  └────────────┘                                    └────────────┘
```

### 3.3. Preparación de Pedido (Picking)

```typescript
async prepararPedido(
  pedidoId: string,
  tenantId: string,
  dto: PrepararPedidoDto,
  userId?: string
): Promise<{ success: boolean }> {
  // 1. Bloquear pedido para evitar modificaciones concurrentes
  await this.pedidoLockService.adquirirLock(pedidoId, 'PREPARACION');

  try {
    // 2. Validar estado actual
    const pedido = await this.obtenerPedidoBasico(pedidoId, tenantId);
    if (pedido.estado !== 'CONFIRMADO') {
      throw new BadRequestException('Pedido no está en estado CONFIRMADO');
    }

    // 3. Actualizar estado
    await this.supabase
      .from('pedidos_venta')
      .update({
        estado: 'EN_PREPARACION',
        preparado_por: userId,
        fecha_inicio_preparacion: new Date()
      })
      .eq('id', pedidoId);

    // 4. Registrar evento de picking
    await this.registrarEventoLogistico(tenantId, pedidoId, 'PICKING', {
      usuario: userId,
      almacen: dto.almacen_id,
      notas: dto.notas
    });

    return { success: true };
  } finally {
    await this.pedidoLockService.liberarLock(pedidoId);
  }
}
```

### 3.4. Confirmación de Despacho con Backorders

```typescript
async confirmarDespacho(
  pedidoId: string,
  tenantId: string,
  dto: ConfirmarDespachoDto,
  userId?: string
): Promise<{ success: boolean }> {
  const pedido = await this.obtenerPedidoConDetalle(pedidoId, tenantId);

  // Normalizar items despachados
  const itemsDespachados = this.normalizarItemsDespachados(
    pedido.detalle,
    dto.items
  );

  let tieneBackorder = false;

  // Procesar cada línea
  for (const detalle of pedido.detalle) {
    const cantidadDespachar = itemsDespachados.get(detalle.id) || 0;
    const pendiente = detalle.cantidad - detalle.cantidad_despachada - cantidadDespachar;

    if (cantidadDespachar > 0) {
      // Descontar stock
      await this.inventarioService.descontarStock(
        detalle.producto_id,
        cantidadDespachar,
        tenantId,
        'DESPACHO',
        pedidoId
      );

      // Actualizar cantidad despachada
      await this.actualizarDetalleDespachado(detalle.id, cantidadDespachar);
    }

    if (pendiente > 0) {
      tieneBackorder = true;
      // Crear registro de backorder
      await this.crearBackorder({
        pedido_id: pedidoId,
        detalle_id: detalle.id,
        cantidad_pendiente: pendiente,
        fecha_compromiso_original: pedido.fecha_entrega
      });
    }
  }

  // Determinar estado final
  const nuevoEstado = tieneBackorder ? 'DESPACHO_PARCIAL' : 'DESPACHADO';

  await this.actualizarEstadoPedido(pedidoId, nuevoEstado, {
    despachado_por: userId,
    fecha_despacho: new Date(),
    transportista: dto.transportista,
    numero_guia: dto.numero_guia
  });

  // Registrar evento
  await this.registrarEventoLogistico(tenantId, pedidoId, 'DESPACHO', {
    items: Array.from(itemsDespachados),
    backorder: tieneBackorder
  });

  return { success: true };
}
```

### 3.5. Gestión de Backorders

```typescript
async reprogramarBackorder(
  pedidoId: string,
  detalleId: string,
  tenantId: string,
  dto: ReprogramarBackorderDto,
  userId?: string
): Promise<{ success: boolean; data: any[] }> {
  // Obtener backorder actual
  const backorder = await this.obtenerBackorder(pedidoId, detalleId, tenantId);

  if (!backorder) {
    throw new NotFoundException('Backorder no encontrado');
  }

  // Actualizar fecha y prioridad
  await this.supabase
    .from('backorders')
    .update({
      fecha_compromiso_nueva: dto.nueva_fecha_compromiso,
      prioridad: dto.prioridad || 'NORMAL',
      notas: this.concatenarNotas(backorder.notas, dto.notas),
      reprogramado_por: userId,
      fecha_reprogramacion: new Date()
    })
    .eq('pedido_id', pedidoId)
    .eq('detalle_id', detalleId);

  // Notificar al cliente si está configurado
  await this.notificarReprogramacionBackorder(pedidoId, dto);

  return { success: true, data: await this.obtenerBackorders(pedidoId, tenantId) };
}
```

### 3.6. Tracking y Eventos Logísticos

```typescript
async actualizarTracking(
  pedidoId: string,
  tenantId: string,
  dto: ActualizarTrackingDto,
  userId?: string
): Promise<{ success: boolean }> {
  const pedido = await this.obtenerPedidoBasico(pedidoId, tenantId);

  // Validar transición de tracking
  const transicionesTracking = {
    DESPACHADO: ['EN_TRANSITO'],
    DESPACHO_PARCIAL: ['EN_TRANSITO'],
    EN_TRANSITO: ['ENTREGADO', 'INCIDENCIA'],
    INCIDENCIA: ['EN_TRANSITO', 'ENTREGADO']
  };

  if (!transicionesTracking[pedido.estado]?.includes(dto.nuevo_estado)) {
    throw new BadRequestException(
      `Transición de tracking no permitida: ${pedido.estado} → ${dto.nuevo_estado}`
    );
  }

  // Actualizar estado
  await this.supabase
    .from('pedidos_venta')
    .update({
      estado: dto.nuevo_estado,
      tracking_info: {
        transportista: dto.transportista,
        numero_guia: dto.numero_guia,
        ubicacion_actual: dto.ubicacion_actual,
        ultima_actualizacion: new Date()
      }
    })
    .eq('id', pedidoId);

  // Si es ENTREGADO y ya está facturado, marcar como COMPLETADO
  if (dto.nuevo_estado === 'ENTREGADO' && pedido.facturado) {
    await this.actualizarEstadoPedido(pedidoId, 'COMPLETADO');
  }

  // Registrar evento
  await this.registrarEventoLogistico(tenantId, pedidoId, dto.nuevo_estado, {
    ubicacion: dto.ubicacion_actual,
    evidencia: dto.evidencia_entrega
  });

  return { success: true };
}
```

---

## 4. Integración Contable de Inventario

### 4.1. Eventos Emitidos

```typescript
// Evento para generar asiento de inventario
interface MovimientoStockEvent {
  tipo: 'ENTRADA' | 'SALIDA';
  producto_id: string;
  cantidad: number;
  costo_unitario: number;
  costo_total: number;
  almacen_id: string;
  referencia_tipo: 'RECEPCION' | 'DESPACHO' | 'AJUSTE';
  referencia_id: string;
  tenant_id: string;
}
```

### 4.2. Asientos Generados Automáticamente

**Entrada de Mercadería (Compra):**
```
Dr 20 Mercaderías           [Costo]
Dr 40 IGV Crédito Fiscal    [IGV]
   Cr 42 Proveedores        [Total]
```

**Salida de Mercadería (Venta):**
```
Dr 69 Costo de Ventas       [Costo Promedio × Cantidad]
   Cr 20 Mercaderías        [Costo Promedio × Cantidad]
```

---

## 5. Tablas de Referencia

### 5.1. Estados de Orden de Compra
| Estado | Descripción | Editable | Cancelable |
| :--- | :--- | :--- | :--- |
| `BORRADOR` | Orden en creación | ✅ | ✅ |
| `PENDIENTE` | Enviada para revisión | ✅ | ✅ |
| `APROBACION` | Requiere aprobación | ❌ | ✅ |
| `APROBADA` | Lista para recibir | ❌ | ✅ (con reversión) |
| `PARCIAL` | Recepción parcial | ❌ | ✅ (con reversión) |
| `RECIBIDA` | Completamente recibida | ❌ | ❌ |
| `ANULADA` | Cancelada | ❌ | ❌ |

### 5.2. Tipos de Movimiento de Inventario
| Tipo | Efecto stock_actual | Efecto stock_reservado |
| :--- | :--- | :--- |
| `ENTRADA` | +cantidad | Sin cambio |
| `SALIDA` | -cantidad | -cantidad (si había reserva) |
| `RESERVA` | Sin cambio | +cantidad |
| `LIBERACION` | Sin cambio | -cantidad |
| `AJUSTE` | ±cantidad | Sin cambio |
| `TRANSFERENCIA` | -origen, +destino | Sin cambio |
