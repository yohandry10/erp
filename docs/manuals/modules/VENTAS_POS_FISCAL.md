# Documentación Técnica Exhaustiva: Ventas, POS y Fiscal

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `manual_modulo`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Este documento detalla la arquitectura, flujos, lógica de negocio, validaciones y patrones técnicos de los módulos comerciales del ERP. Incluye el ciclo completo desde la cotización hasta la facturación electrónica.

---

## 1. Módulo de Ventas (`/src/modules/ventas`)

El módulo de ventas gestiona el ciclo de vida completo de la venta B2B y mayorista, desde la cotización hasta la facturación.

### 1.1. Arquitectura y Componentes

| Componente | Archivo | Responsabilidad |
| :--- | :--- | :--- |
| **Controller** | `pedidos.controller.ts` | Endpoints REST protegidos por `JwtAuthGuard` y `PermissionGuard` |
| **Service** | `pedidos.service.ts` | Lógica de negocio, cálculos tributarios, transiciones de estado |
| **CPE Integration** | `cpe-integration.service.ts` | Puente entre pedidos y facturación electrónica |
| **GRE Integration** | `gre-integration.service.ts` | Generación automática de guías de remisión |

#### Dependencias Críticas
*   **InventarioService**: Verificación y reserva de stock
*   **CxcService**: Evaluación de crédito y generación de cuentas por cobrar
*   **CpeService**: Generación de documentos fiscales electrónicos
*   **TaxCalculatorService**: Cálculos tributarios con precisión decimal
*   **NotificationsService**: Alertas a aprobadores y supervisores

### 1.2. Entidades y Modelo de Datos

#### Tabla `pedidos_venta` (Cabecera)
| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | UUID | Identificador único |
| `tenant_id` | UUID | Aislamiento multi-tenant |
| `cliente_id` | UUID | Referencia al cliente |
| `numero_pedido` | VARCHAR | Correlativo único por tenant |
| `estado` | ENUM | Estado actual del ciclo de vida |
| `subtotal` | DECIMAL(18,2) | Base imponible |
| `igv` | DECIMAL(18,2) | Impuesto (18% en Perú) |
| `total` | DECIMAL(18,2) | Total incluyendo impuestos |
| `moneda` | CHAR(3) | PEN, USD, EUR |
| `estado_credito` | VARCHAR | APROBADO, BLOQUEADO, REVISION |
| `requiere_aprobacion` | BOOLEAN | Flag de flujo de aprobación |
| `motivos_aprobacion` | JSONB | Array de razones que activaron aprobación |

#### Tabla `pedidos_venta_detalle` (Líneas)
| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `pedido_id` | UUID | Referencia a cabecera |
| `producto_id` | UUID | Referencia al producto |
| `cantidad` | DECIMAL | Cantidad solicitada |
| `cantidad_despachada` | DECIMAL | Cantidad ya despachada |
| `precio_unitario` | DECIMAL | Precio sin IGV |
| `descuento_porcentaje` | DECIMAL | Descuento aplicado |
| `subtotal` | DECIMAL | Línea sin impuestos |

### 1.3. Estados del Pedido (Máquina de Estados)

```
┌───────────────┐
│   BORRADOR    │
└───────┬───────┘
        │ enviar()
        ▼
┌───────────────┐     requiere_aprobacion
│   PENDIENTE   │──────────────────────────┐
└───────┬───────┘                          │
        │ confirmar()                      ▼
        ▼                          ┌─────────────────┐
┌───────────────┐                  │ PEND_APROBACION │
│   CONFIRMADO  │◄─────────────────┴─────────────────┘
└───────┬───────┘     aprobar()           │ rechazar()
        │                                 ▼
        │                          ┌─────────────────┐
        │                          │    CANCELADO    │
        ▼                          └─────────────────┘
┌───────────────┐
│ EN_PREPARACION│  (si usar_flujo_logistica=true)
└───────┬───────┘
        │ marcarListoDespacho()
        ▼
┌───────────────┐
│LISTO_DESPACHO │
└───────┬───────┘
        │ confirmarDespacho()
        ▼
┌───────────────┐
│  DESPACHADO   │
└───────┬───────┘
        │ generarFactura()
        ▼
┌───────────────┐
│   FACTURADO   │
└───────┬───────┘
        │ marcarEntregado()
        ▼
┌───────────────┐
│  COMPLETADO   │
└───────────────┘
```

#### Transiciones Permitidas (Validación Estricta)
```typescript
const TRANSICIONES_PERMITIDAS = {
  BORRADOR: ['PENDIENTE', 'CANCELADO'],
  PENDIENTE: ['CONFIRMADO', 'PENDIENTE_APROBACION', 'CANCELADO'],
  PENDIENTE_APROBACION: ['PENDIENTE', 'CANCELADO'],
  CONFIRMADO: ['EN_PREPARACION', 'DESPACHADO', 'FACTURADO', 'CANCELADO'],
  EN_PREPARACION: ['LISTO_DESPACHO', 'CANCELADO'],
  LISTO_DESPACHO: ['DESPACHADO', 'DESPACHO_PARCIAL', 'CANCELADO'],
  DESPACHADO: ['FACTURADO', 'ENTREGADO'],
  DESPACHO_PARCIAL: ['DESPACHADO', 'FACTURADO'],
  FACTURADO: ['ENTREGADO', 'COMPLETADO'],
  ENTREGADO: ['COMPLETADO']
};
```

### 1.4. Flujos de Negocio Detallados

#### A. Creación de Pedido (`PedidosService.create`)

**Paso 1: Validación de Stock (Hard Stop)**
```typescript
// Verifica stock_disponible = stock_actual - stock_reservado
const disponibilidad = await inventarioService.verificarDisponibilidad(items, tenantId);
if (!disponibilidad.disponible) {
  throw new BadRequestException({
    code: 'STOCK_INSUFICIENTE',
    items: disponibilidad.warnings // Lista de productos faltantes
  });
}
```

**Paso 2: Evaluación de Políticas de Crédito**
```typescript
interface EvaluacionPoliticas {
  requiereAprobacion: boolean;
  motivos: string[];
  estadoCredito: 'APROBADO' | 'BLOQUEADO' | 'REVISION';
}
```

Reglas evaluadas:
| Regla | Condición | Resultado |
| :--- | :--- | :--- |
| Monto máximo | `total > monto_maximo_sin_aprobacion` | `PENDIENTE_APROBACION` |
| Descuento | `descuento > 0 && requiere_aprobacion_descuento` | `PENDIENTE_APROBACION` |
| Línea de crédito | `deuda_pendiente + total > limite_credito` | `estadoCredito: BLOQUEADO` |
| Facturas vencidas | `tiene_facturas_vencidas && !permite_morosidad` | `estadoCredito: REVISION` |

**Paso 3: Cálculo de Impuestos con Precisión Decimal**
```typescript
import Decimal from 'decimal.js';

// Configuración de precisión
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const subtotal = new Decimal(baseImponible);
const igv = subtotal.times(0.18).toDecimalPlaces(2);
const total = subtotal.plus(igv).toNumber();
```

**Paso 4: Persistencia Atómica (Función RPC)**
```sql
-- Función: crear_pedido_completo(p_cabecera JSONB, p_detalles JSONB[])
-- Garantiza atomicidad de cabecera + detalles
BEGIN;
  INSERT INTO pedidos_venta (...) VALUES (...) RETURNING id INTO v_pedido_id;
  FOREACH v_detalle IN ARRAY p_detalles LOOP
    INSERT INTO pedidos_venta_detalle (pedido_id, ...) VALUES (v_pedido_id, ...);
  END LOOP;
COMMIT;
```

#### B. Flujo de Aprobaciones

**Endpoints específicos:**
| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/ventas/pedidos/aprobaciones/pendientes` | Lista pedidos que requieren aprobación |
| `POST` | `/ventas/pedidos/:id/decidir-aprobacion` | Aprobar o rechazar |
| `GET` | `/ventas/pedidos/:id/historial-aprobaciones` | Timeline de decisiones |

**Lógica de decisión:**
```typescript
async decidirAprobacion(pedidoId, decision, motivos, userId) {
  // Validación de permisos
  if (!usuario.permisos.includes('ventas.aprobaciones.resolver')) {
    throw new ForbiddenException();
  }

  if (decision === 'APROBAR') {
    // Mover a PENDIENTE (listo para confirmar)
    await this.updateEstado(pedidoId, 'PENDIENTE');
    // Notificar al vendedor original
    await this.notificationsService.notificar(pedido.created_by, 'PEDIDO_APROBADO');
  } else {
    // RECHAZAR -> CANCELADO
    await this.updateEstado(pedidoId, 'CANCELADO');
    // Liberar cualquier reserva provisional
    await this.inventarioService.liberarReservasProvisionales(pedidoId);
  }
}
```

#### C. Confirmación y Reserva de Stock

**Endpoint**: `POST /ventas/pedidos/:id/confirmar`

```typescript
async confirmarPedido(pedidoId: string, tenantId: string) {
  // 1. Bloqueo optimista del pedido
  const pedido = await this.findOne(pedidoId, tenantId);
  this.validarTransicionEstado(pedido.estado, 'CONFIRMADO');

  // 2. Reservar stock para cada línea
  for (const detalle of pedido.detalle) {
    await this.inventarioService.reservarStock(
      detalle.producto_id,
      detalle.cantidad,
      tenantId,
      'PEDIDO_VENTA',
      pedidoId
    );
  }

  // 3. Actualizar estado
  await this.updateEstado(pedidoId, 'CONFIRMADO');
}
```

**Efecto en Inventario:**
- `stock_reservado += cantidad`
- `stock_disponible = stock_actual - stock_reservado` (calculado, no almacenado)

### 1.5. Integración con Facturación (CPE)

**Endpoint**: `POST /ventas/pedidos/:id/generar-factura`

```typescript
async generarFactura(pedidoId, tipoDocumento, userId): DocumentoGeneradoResult {
  // 1. Obtener datos del pedido
  const pedido = await this.findOne(pedidoId, tenantId);

  // 2. Validar estado permitido
  if (!['DESPACHADO', 'CONFIRMADO'].includes(pedido.estado)) {
    throw new BadRequestException('Estado no permite facturación');
  }

  // 3. Generar CPE (Factura '01' o Boleta '03')
  const cpe = await this.cpeIntegrationService.generarCPE(pedido, tipoDocumento);

  // 4. Crear Cuenta por Cobrar automáticamente
  await this.eventBus.emit('documento.fiscal.generado', {
    cpe_id: cpe.id,
    total: pedido.total,
    cliente_id: pedido.cliente_id,
    // ...
  });

  // 5. Actualizar estado del pedido
  return this.updateEstado(pedidoId, 'FACTURADO');
}
```

### 1.6. Configuración del Tenant (Feature Flags)

Tabla `configuracion_empresa`:

| Campo | Tipo | Efecto |
| :--- | :--- | :--- |
| `monto_maximo_sin_aprobacion` | DECIMAL | Pedidos > X requieren aprobación |
| `porcentaje_descuento_maximo` | DECIMAL | Descuentos > X% requieren aprobación |
| `requiere_aprobacion_descuento` | BOOLEAN | Activa validación de descuentos |
| `aplicar_limite_credito` | BOOLEAN | Bloquea pedidos que exceden línea |
| `usar_flujo_logistica` | BOOLEAN | Activa estados EN_PREPARACION y LISTO_DESPACHO |
| `gre_automatico_habilitado` | BOOLEAN | Genera GRE automáticamente al facturar |
| `umbral_gre_automatico` | DECIMAL | Monto mínimo para activar GRE automático |
| `dias_vencimiento_defecto` | INTEGER | Días para calcular fecha_vencimiento CxC |
| `aplicar_retencion` | BOOLEAN | Activa cálculo de retenciones |
| `retencion_tasa` | DECIMAL | Porcentaje de retención (ej: 0.03 = 3%) |
| `aplicar_detraccion` | BOOLEAN | Activa cálculo de detracciones SPOT |
| `detraccion_tasa` | DECIMAL | Porcentaje de detracción |
| `detraccion_codigo` | VARCHAR | Código SUNAT del servicio sujeto |

### 1.7. Endpoints Completos del Módulo de Ventas

| Método | Ruta | Descripción | Permisos |
| :--- | :--- | :--- | :--- |
| `GET` | `/ventas/pedidos` | Listar pedidos (paginado, filtros) | `ventas.pedidos.ver` |
| `GET` | `/ventas/pedidos/:id` | Obtener pedido con detalles | `ventas.pedidos.ver` |
| `POST` | `/ventas/pedidos` | Crear pedido | `ventas.pedidos.crear` |
| `PUT` | `/ventas/pedidos/:id` | Actualizar pedido (solo BORRADOR/PENDIENTE) | `ventas.pedidos.editar` |
| `POST` | `/ventas/pedidos/:id/confirmar` | Confirmar y reservar stock | `ventas.pedidos.confirmar` |
| `POST` | `/ventas/pedidos/:id/cancelar` | Cancelar pedido | `ventas.pedidos.cancelar` |
| `POST` | `/ventas/pedidos/:id/generar-factura` | Generar CPE y CxC | `ventas.pedidos.facturar` |
| `GET` | `/ventas/pedidos/aprobaciones/pendientes` | Pedidos pendientes de aprobar | `ventas.aprobaciones.ver` |
| `POST` | `/ventas/pedidos/:id/decidir-aprobacion` | Aprobar/Rechazar | `ventas.aprobaciones.resolver` |

---

## 2. Módulo POS (Punto de Venta) (`/src/modules/pos`)

Diseñado para alta transaccionalidad y venta rápida (retail). Prioriza la velocidad, robustez ante concurrencia y operación offline-first.

### 2.1. Arquitectura de Seguridad

#### Aislamiento de Tenant
```typescript
async runWithTenantContext<T>(user: any, operation: () => Promise<T>): Promise<T> {
  const tenantId = user.tenant_id;

  // Establecer contexto para toda la transacción
  await this.supabase.rpc('set_tenant_context', { tenant_id: tenantId });

  try {
    return await operation();
  } finally {
    await this.supabase.rpc('clear_tenant_context');
  }
}
```

#### Encriptación de Certificados (AES-256-GCM)
```typescript
// Almacenamiento seguro de certificados digitales
private getCertKey(): Buffer {
  const keyString = process.env.CERT_ENCRYPTION_KEY;
  return crypto.createHash('sha256').update(keyString).digest();
}

encryptBuffer(data: Buffer): Buffer {
  const iv = crypto.randomBytes(12); // IV para GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', this.getCertKey(), iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]); // iv(12) + tag(16) + data
}
```

**Soporte para Rotación de Claves:**
```typescript
// Intenta desencriptar con clave actual, si falla usa clave anterior
getCertKeys(): Buffer[] {
  const keys = [this.getCertKey()];
  if (process.env.CERT_ENCRYPTION_KEY_OLD) {
    keys.push(crypto.createHash('sha256').update(process.env.CERT_ENCRYPTION_KEY_OLD).digest());
  }
  return keys;
}
```

### 2.2. Estrategia de Concurrencia (Bloqueo Pesimista)

Para evitar condiciones de carrera en entornos de alta concurrencia (múltiples cajas vendiendo simultáneamente):

#### Lock Multinivel con `pg_advisory_xact_lock`
```typescript
async procesarVentaInternal(ventaData, user) {
  const tenantId = user.tenant_id;
  const sesionCajaId = await this.getSesionCajaActual(user);
  const idempotencyKey = ventaData.idempotency_key;

  // 1. Lock global de transacción (evita duplicados exactos)
  const lockKey = this.generateLockKey(tenantId, sesionCajaId, idempotencyKey);
  await this.supabase.rpc('pg_advisory_xact_lock', { key: lockKey });

  // 2. Ordenar productos para evitar deadlocks
  const productosOrdenados = ventaData.items.sort((a, b) =>
    a.producto_id.localeCompare(b.producto_id)
  );

  // 3. Adquirir locks individuales por producto (en orden)
  for (const item of productosOrdenados) {
    const productLock = this.generateProductLock(tenantId, item.producto_id);
    await this.supabase.rpc('pg_advisory_xact_lock', { key: productLock });
  }

  // 4. Ejecutar transacción de venta
  return this.ejecutarVenta(ventaData, user);
}
```

**Prevención de Deadlocks:**
- Los productos se bloquean siempre en orden alfabético por `producto_id`
- Esto evita el escenario clásico donde TX-A bloquea Prod1 esperando Prod2, mientras TX-B bloquea Prod2 esperando Prod1

### 2.3. Flujo de Venta Completo (`procesarVenta`)

```
┌─────────────────────────────────────────────────────────────────┐
│                     POS: FLUJO DE VENTA                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. VALIDACIONES PRE-FLIGHT                                     │
│     ├── Certificado Digital válido y no expirado               │
│     ├── Configuración RUC y Empresa completa                   │
│     ├── Reglas SUNAT (tipo doc identidad vs tipo comprobante)  │
│     ├── Sesión de Caja ABIERTA                                 │
│     └── Stock disponible para todos los items                  │
│                                                                 │
│  2. IDEMPOTENCIA                                                │
│     └── Si existe venta con misma idempotency_key → retorna OK │
│                                                                 │
│  3. TRANSACCIÓN ATÓMICA (RPC pos_registrar_venta_tx)           │
│     ├── INSERT INTO ventas_pos (cabecera)                      │
│     ├── INSERT INTO ventas_pos_detalle (por cada item)         │
│     ├── UPDATE productos SET stock = stock - cantidad          │
│     ├── INSERT INTO movimientos_caja (ingreso)                 │
│     └── INSERT INTO outbox_events (cola CPE)                   │
│                                                                 │
│  4. POST-PROCESAMIENTO ASÍNCRONO                                │
│     └── Worker CPE procesa outbox → Genera XML → Firma → OSE   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Validaciones SUNAT (Tipo Documento)
```typescript
// Regla: Boletas solo para DNI o sin documento
// Facturas requieren RUC
const tipoDocCliente = ventaData.cliente.tipo_documento;
const tipoComprobante = ventaData.tipo_documento;

if (tipoComprobante === '01' && tipoDocCliente !== '6') { // Factura sin RUC
  throw new BadRequestException('Facturas requieren cliente con RUC');
}
if (tipoComprobante === '03' && tipoDocCliente === '6') { // Boleta con RUC
  // Warning, pero permitido
  this.logger.warn('Boleta emitida a cliente con RUC');
}
```

#### Inferencia de Tipo de Documento
```typescript
inferirTipoDocumento(doc: string, tipoExplicito?: string): string {
  if (tipoExplicito) return tipoExplicito;

  // Catálogo SUNAT
  if (doc.length === 11 && /^[12]0/.test(doc)) return '6'; // RUC
  if (doc.length === 8 && /^\d+$/.test(doc)) return '1';   // DNI
  if (/^[A-Z]{1,3}\d{6,}$/i.test(doc)) return '4';         // Carnet Extranjería
  return '0'; // Otros
}
```

### 2.4. Gestión de Caja

#### Ciclo de Vida de Sesión
```
┌────────────┐     abrirCaja()     ┌────────────┐
│   INACTIVA │────────────────────▶│  ABIERTA   │
└────────────┘                     └─────┬──────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
                    ▼                    ▼                    ▼
              cerrarCaja()        cambioTurno()        cerrarAdmin()
                    │                    │                    │
                    ▼                    ▼                    ▼
              ┌──────────┐       ┌─────────────┐      ┌─────────────┐
              │ CERRADA  │       │EN_CAMBIO_TRN│      │CIERRE_FORZOSO│
              └──────────┘       └──────┬──────┘      └─────────────┘
                                        │
                                        ▼ completarCambio()
                                  ┌─────────────┐
                                  │  ABIERTA    │ (nuevo cajero)
                                  └─────────────┘
```

#### Apertura de Caja con Validaciones
```typescript
async abrirCaja(tenantId, cajaId, dto, userId) {
  // 1. Verificar que la caja exista y esté activa
  const caja = await this.obtenerCaja(cajaId, tenantId);
  if (!caja.activa) throw new BadRequestException('Caja inactiva');

  // 2. Verificar que no haya sesión abierta en ESTA caja
  const sesionActiva = await this.buscarSesionAbierta(cajaId);
  if (sesionActiva) {
    throw new ConflictException('Esta caja ya tiene una sesión abierta');
  }

  // 3. Verificar que el usuario no tenga otra caja abierta
  const otraSesion = await this.buscarSesionUsuario(userId);
  if (otraSesion) {
    throw new ConflictException('Usuario ya tiene caja abierta');
  }

  // 4. Validar monto de apertura en rango permitido
  if (dto.monto_inicial > caja.monto_maximo_apertura) {
    // Requiere autorización de supervisor
    await this.autorizacionesService.solicitarAutorizacion(
      'APERTURA_EXCEDIDA',
      userId,
      dto.supervisor_id
    );
  }

  // 5. Crear sesión con metadata
  return this.insertarSesion({
    caja_id: cajaId,
    cajero_id: userId,
    monto_inicio: dto.monto_inicial,
    estado: 'ABIERTA',
    dispositivo: dto.dispositivo,
    ip_address: dto.ip_address,
    geolocalizacion: dto.geolocalizacion,
    denominaciones_apertura: dto.denominaciones_apertura,
    foto_apertura: dto.foto_apertura
  });
}
```

#### Cierre de Caja con Arqueo
```typescript
interface DatosCierre {
  monto_contado: number;
  denominaciones: {
    billetes: { [denominacion: string]: number };
    monedas: { [denominacion: string]: number };
  };
  notas?: string;
}

async cerrarCaja(sesionId, datos, userId) {
  // 1. Calcular saldo esperado
  const esperado = await this.calcularSaldoEsperado(sesionId);

  // 2. Calcular diferencia
  const diferencia = datos.monto_contado - esperado;

  // 3. Si diferencia > tolerancia, requiere supervisor
  if (Math.abs(diferencia) > this.config.tolerancia_diferencia) {
    await this.autorizacionesService.requerirSupervisor(
      'DIFERENCIA_CAJA',
      { diferencia, esperado, contado: datos.monto_contado }
    );
  }

  // 4. Calcular hash de integridad (SHA-256)
  const hash = this.calcularHashIntegridad(sesion, movimientos, datos);

  // 5. Cerrar sesión (inmutable después)
  return this.actualizarSesion(sesionId, {
    estado: 'CERRADA',
    monto_cierre: datos.monto_contado,
    monto_esperado: esperado,
    diferencia,
    hash_integridad: hash,
    hora_cierre: new Date(),
    denominaciones_cierre: datos.denominaciones
  });
}
```

#### Hash de Integridad Criptográfica
```typescript
calcularHashIntegridad(sesion, movimientos, cierre): string {
  const data = JSON.stringify({
    sesion_id: sesion.id,
    apertura: {
      monto: sesion.monto_inicio,
      hora: sesion.hora_apertura,
      denominaciones: sesion.denominaciones_apertura
    },
    movimientos: movimientos.map(m => ({
      id: m.id,
      tipo: m.tipo,
      monto: m.monto,
      created_at: m.created_at
    })),
    cierre: {
      monto_contado: cierre.monto_contado,
      denominaciones: cierre.denominaciones
    }
  });

  return crypto.createHash('sha256').update(data).digest('hex');
}
```

### 2.5. Worker de Cierre Automático

Proceso programado que detecta y cierra sesiones "colgadas":

```typescript
@Cron('0 3 * * *') // 3:00 AM diariamente
async cerrarSesionesAbandonadas() {
  const sesionesHuerfanas = await this.buscarSesionesAbandonadas();

  for (const sesion of sesionesHuerfanas) {
    await this.cerrarSesionAdministrativa(sesion.id,
      'CIERRE_AUTOMATICO',
      'Sistema: Sesión de día anterior no cerrada'
    );

    await this.auditService.registrar({
      tipo: 'CIERRE_ADMIN_AUTOMATICO',
      sesion_id: sesion.id,
      metadata: { dias_abierta: this.calcularDiasAbierta(sesion) }
    });
  }
}
```

---

## 3. Módulo Fiscal (CPE) (`/src/modules/cpe`)

Motor de facturación electrónica que abstrae la complejidad de XML/UBL, firma digital y comunicación con OSE/SUNAT.

### 3.1. Ciclo de Vida del CPE

```
┌───────────┐                           ┌───────────┐
│  BORRADOR │──── create() ───────────▶│ GENERADO  │
└───────────┘                           └─────┬─────┘
                                              │
                                    buildXml() + sign()
                                              │
                                              ▼
                                        ┌───────────┐
                                        │  FIRMADO  │
                                        └─────┬─────┘
                                              │
                                     sendToOse() [async]
                                              │
                                              ▼
                                        ┌───────────┐     CDR OK
                                        │  ENVIADO  │────────────────┐
                                        └─────┬─────┘                │
                                              │                      ▼
                                   CDR con error            ┌───────────────┐
                                              │             │   ACEPTADO    │
                                              ▼             └───────────────┘
                                        ┌───────────┐
                                        │ RECHAZADO │
                                        └───────────┘
```

### 3.2. Generación de XML UBL 2.1

```typescript
async create(dto: CreateFacturaDto, tenantId: string, userId?: string): Promise<FacturaDto> {
  // 1. Recalcular totales (nunca confiar en frontend)
  dto = this.recalculateTotals(dto);

  // 2. Obtener info del emisor
  const emisor = await this.getEmpresaEmisorInfo(tenantId);

  // 3. Generar serie-correlativo
  const { serie, numero } = await this.generarCorrelativo(tenantId, dto.tipo_documento);

  // 4. Construir payload XML
  const xmlPayload = this.buildXmlPayload(dto, emisor, serie, numero);

  // 5. Generar XML UBL 2.1
  const xmlContent = this.generateXmlUbl(xmlPayload);

  // 6. Firmar digitalmente
  const signer = await this.getXmlSigner(tenantId);
  const xmlFirmado = signer.sign(xmlContent);

  // 7. Persistir CPE
  const cpe = await this.insertarCpe({
    tenant_id: tenantId,
    tipo_documento: dto.tipo_documento,
    serie, numero,
    xml_sin_firma: xmlContent,
    xml_firmado: xmlFirmado,
    hash_cpe: this.calculateHash(xmlFirmado),
    estado: 'FIRMADO'
  });

  // 8. Encolar para envío (Outbox Pattern)
  await this.eventBus.emit('cpe.creado', { cpe_id: cpe.id, tenantId });

  return this.mapToDto(cpe);
}
```

### 3.3. Firma Digital con Certificado

```typescript
async getXmlSigner(tenantId: string): Promise<XmlSigner> {
  // Buscar certificado del tenant
  const config = await this.supabase
    .from('empresa_config')
    .select('certificado_digital, certificado_password')
    .eq('tenant_id', tenantId)
    .single();

  let certBuffer: Buffer;
  let password: string;

  if (config.certificado_digital) {
    // Desencriptar certificado almacenado
    certBuffer = this.decryptCertificate(config.certificado_digital);
    password = this.decryptText(config.certificado_password);
  } else {
    // Usar certificado DEMO para desarrollo
    certBuffer = fs.readFileSync('./certs/demo.p12');
    password = 'demo123';
  }

  return new XmlSigner(certBuffer, password);
}
```

### 3.4. Envío a OSE/SUNAT

```typescript
async sendToOse(cpeId: string, options?: { idempotencyKey?: string }): Promise<void> {
  const cpe = await this.getCpeById(cpeId);

  // Idempotencia: si ya fue procesado, no reenviar
  if (options?.idempotencyKey) {
    const yaEnviado = await this.verificarIdempotencia(options.idempotencyKey);
    if (yaEnviado) return;
  }

  try {
    // Actualizar estado a ENVIANDO
    await this.actualizarEstado(cpeId, 'SENDING');

    // Enviar vía SOAP a OSE
    const response = await this.oseService.sendBillSync(
      cpe.xml_firmado,
      this.generateFileName(cpe)
    );

    // Procesar respuesta CDR
    const cdr = this.parseCDR(response.cdr);

    if (cdr.codigo === '0') { // Aceptado
      await this.actualizarEstado(cpeId, 'ACCEPTED', {
        codigo_respuesta: cdr.codigo,
        descripcion_respuesta: cdr.descripcion,
        cdr_xml: response.cdr
      });
    } else if (this.isTechnicalError(cdr.codigo, cdr.descripcion)) {
      // Error técnico: reintentable
      throw new Error(`Error técnico SUNAT: ${cdr.descripcion}`);
    } else {
      // Error de validación: no reintentable
      await this.actualizarEstado(cpeId, 'REJECTED', {
        codigo_respuesta: cdr.codigo,
        descripcion_respuesta: cdr.descripcion
      });
    }
  } catch (error) {
    // Registrar fallo para reintento
    await this.registrarFalloEnvio(cpeId, error.message);
    throw error;
  }
}
```

### 3.5. Clasificación de Errores SUNAT

```typescript
// Errores técnicos (reintentables)
const ERRORES_TECNICOS = [
  /timeout/i,
  /connection refused/i,
  /ECONNRESET/,
  /socket hang up/i,
  /503 Service Unavailable/i,
  /Error de comunicación/i
];

isTechnicalError(codigo: string, descripcion: string): boolean {
  // Códigos 01XX, 02XX generalmente son errores de validación (no reintentar)
  // Códigos 03XX+ pueden ser técnicos
  if (/^0[12]/.test(codigo)) return false;

  return ERRORES_TECNICOS.some(pattern => pattern.test(descripcion));
}
```

### 3.6. Modelo de Resiliencia (Fallback Controlado)

```typescript
async ensureDocumentoParaCpe(cpeRecord, tenantId) {
  try {
    // Intento 1: Usar RPC de base de datos
    const { data: docId } = await this.supabase.rpc(
      'crear_documento_desde_cpe',
      { p_cpe_id: cpeRecord.id }
    );
    return docId;
  } catch (rpcError) {
    this.logger.warn('RPC falló, usando fallback manual:', rpcError);

    // Fallback: Inserción directa mínima
    const emisor = await this.getEmpresaInfoFallback(tenantId);

    const { data: doc } = await this.supabase
      .from('documentos')
      .insert({
        tenant_id: tenantId,
        cpe_id: cpeRecord.id,
        tipo_documento: cpeRecord.tipo_documento,
        serie: cpeRecord.serie,
        numero: cpeRecord.numero,
        total: cpeRecord.total,
        estado: 'BORRADOR',
        // ... campos mínimos
      })
      .select('id')
      .single();

    return doc.id;
  }
}
```

---

## 4. Módulo GRE (Guía de Remisión Electrónica) (`/src/modules/gre`)

### 4.1. Generación Automática de GRE

Se dispara automáticamente cuando:
1. `gre_automatico_habilitado = true`
2. `total >= umbral_gre_automatico`
3. Cliente tiene dirección de entrega válida

```typescript
async evaluarCreacionAutomaticaGRE(datos) {
  const config = await this.obtenerConfiguracion(datos.tenantId);

  if (!config.gre_automatico_habilitado) return;
  if (datos.total < config.umbral_gre_automatico) return;

  // Verificar datos de transporte del cliente
  const requiere = await this.verificarConfiguracionClienteTransporte(
    datos.cliente_id,
    datos.total,
    datos.tenantId
  );

  if (requiere) {
    // Calcular peso estimado
    const peso = this.calcularPesoEstimado(datos.productos, datos.total);

    // Crear GRE
    await this.createGuia({
      motivo_traslado: 'VENTA',
      modalidad_transporte: 'PRIVADO',
      peso_bruto: peso,
      unidad_medida: 'KGM',
      documentos_relacionados: [{ tipo: datos.tipo_documento, serie: datos.serie, numero: datos.numero }],
      // ...
    }, datos.tenantId);
  }
}
```

### 4.2. Códigos SUNAT para GRE

**Motivos de Traslado:**
| Código | Motivo |
| :--- | :--- |
| `01` | Venta |
| `02` | Compra |
| `04` | Traslado entre establecimientos |
| `08` | Importación |
| `09` | Exportación |
| `13` | Otros |

**Modalidad de Transporte:**
| Código | Modalidad |
| :--- | :--- |
| `01` | Transporte público |
| `02` | Transporte privado |

---

## 5. Módulo RMA y Devoluciones (`/src/modules/ventas/rma`)

### 5.1. Ciclo de Vida Completo del RMA

```
┌───────────────┐     aprobar()     ┌────────────┐
│   PENDIENTE   │──────────────────▶│  APROBADA  │
└───────┬───────┘                   └─────┬──────┘
        │                                 │
   rechazar()                      recepcionar()
        │                                 │
        ▼                                 ▼
┌───────────────┐                   ┌────────────────┐
│   RECHAZADA   │                   │  RECEPCIONADA  │
└───────────────┘                   └───────┬────────┘
                                            │
                                  generarNotaCredito()
                                            │
                                            ▼
                                    ┌────────────────┐
                                    │   PROCESADA    │
                                    └────────────────┘
```

### 5.2. Validaciones de Devolución

```typescript
async crear(tenantId, userId, dto: CrearRmaDto) {
  // 1. Obtener pedido original
  const pedido = await this.obtenerPedidoConDetalle(tenantId, dto.pedido_id);

  // 2. Validar estado del pedido
  if (!['FACTURADO', 'ENTREGADO', 'COMPLETADO'].includes(pedido.estado)) {
    throw new BadRequestException('Pedido no permite devoluciones');
  }

  // 3. Validar ventana de devolución
  const config = await this.obtenerConfig(tenantId);
  const diasDesdeVenta = this.calcularDiasDesde(pedido.fecha_facturacion);
  if (diasDesdeVenta > config.dias_maximos_rma) {
    throw new BadRequestException(`Excede ventana de ${config.dias_maximos_rma} días`);
  }

  // 4. Validar cantidades (no devolver más de lo vendido)
  for (const item of dto.items) {
    const detalle = pedido.detalle.find(d => d.id === item.detalle_id);
    const devolucionesPrevias = await this.obtenerDevolucionesPrevias(item.detalle_id);

    if (item.cantidad > detalle.cantidad - devolucionesPrevias) {
      throw new BadRequestException(
        `Item ${detalle.producto.nombre}: cantidad excede disponible`
      );
    }
  }

  // 5. Crear RMA con número secuencial
  return this.insertarRma({
    numero_rma: await this.generarSecuenciaRma(tenantId),
    pedido_id: dto.pedido_id,
    motivo: dto.motivo,
    estado: 'PENDIENTE',
    items: dto.items
  });
}
```

### 5.3. Recepción con Control de Calidad

```typescript
async recepcionar(tenantId, userId, rmaId, dto: RecepcionarRmaDto) {
  const rma = await this.obtenerPorId(tenantId, rmaId);
  const config = await this.obtenerConfig(tenantId);

  // Validar ubicación de destino si requiere control de calidad
  if (config.rma_requiere_control_calidad) {
    if (!dto.ubicacion_control_calidad) {
      throw new BadRequestException('Se requiere ubicación de control de calidad');
    }
    await this.validarUbicacion(tenantId, dto.ubicacion_control_calidad, new Set());
  }

  // Registrar retorno en inventario
  for (const item of dto.items) {
    await this.inventarioService.registrarRetornoRma({
      producto_id: item.producto_id,
      cantidad: item.cantidad_recibida,
      almacen_id: dto.almacen_destino,
      ubicacion_id: dto.ubicacion_control_calidad,
      condicion: item.condicion, // 'BUENO', 'DAÑADO', 'DEFECTUOSO'
      referencia_tipo: 'RMA',
      referencia_id: rmaId
    });
  }

  return this.actualizarEstado(rmaId, 'RECEPCIONADA');
}
```

### 5.4. Generación de Nota de Crédito

```typescript
async generarNotaCredito(tenantId, userId, rmaId, dto: GenerarNotaCreditoDto) {
  const rma = await this.obtenerPorId(tenantId, rmaId);

  // Obtener factura original vinculada
  const pedido = await this.obtenerPedidoConFactura(rma.pedido_id);
  const facturaOriginal = pedido.cpe;

  // Calcular montos de NC
  const montoNC = this.calcularMontoNC(rma.items, facturaOriginal.moneda);

  // Crear NC via DocumentosService
  const nc = await this.documentosService.crearNotaCredito({
    tipo_documento: '07', // Nota de Crédito
    tipo_nota: '01', // Por anulación de operación
    documento_referencia: {
      tipo: facturaOriginal.tipo_documento,
      serie: facturaOriginal.serie,
      numero: facturaOriginal.numero
    },
    motivo: dto.motivo || rma.motivo,
    items: rma.items.map(i => ({
      descripcion: i.producto.nombre,
      cantidad: i.cantidad_recibida,
      precio_unitario: i.precio_original,
      subtotal: i.cantidad_recibida * i.precio_original
    })),
    moneda: facturaOriginal.moneda,
    total: montoNC
  }, tenantId, userId);

  // Actualizar RMA con referencia a NC
  await this.actualizarRma(rmaId, {
    estado: 'PROCESADA',
    nota_credito_id: nc.id,
    nota_credito_numero: nc.serie + '-' + nc.numero
  });

  return nc;
}
```

---

## 6. Patrones Técnicos Transversales

### 6.1. Idempotencia

Todas las operaciones mutativas implementan idempotencia basada en claves:

```typescript
// Formato estándar de claves
type IdempotencyKeys = {
  'pos.venta': `pos.venta:${tenantId}:${sesionId}:${uuid}`;
  'cxc.cobro': `cxc.cobro:${tenantId}:${eventId}`;
  'factura': `factura:${tenantId}:${facturaId}`;
};

// Verificación pre-operación
async verificarIdempotencia(key: string): Promise<boolean> {
  const { data } = await this.supabase
    .from('processed_idempotency_keys')
    .select('key')
    .eq('key', key)
    .single();

  return !!data;
}

// Registro post-operación exitosa
async registrarIdempotencia(key: string, result: any): Promise<void> {
  await this.supabase.from('processed_idempotency_keys').insert({
    key,
    result_snapshot: result,
    processed_at: new Date()
  });
}
```

### 6.2. Event Bus y Patrón Outbox

```typescript
// Publicación de eventos
await this.eventBus.emit('documento.fiscal.generado', {
  tipo: 'DocumentoFiscalGeneradoEvent',
  tenant_id: tenantId,
  documento_id: doc.id,
  cpe_id: cpe.id,
  total: doc.total,
  // ...
});

// Almacenamiento en outbox (dentro de la transacción principal)
await this.supabase.from('outbox_events').insert({
  event_type: 'documento.fiscal.generado',
  tenant_id: tenantId,
  payload: JSON.stringify(eventData),
  status: 'pending',
  created_at: new Date()
});

// Worker procesa outbox de forma asíncrona
// Garantiza at-least-once delivery
```

### 6.3. Auditoría de Eventos

```typescript
interface AuditEvent {
  tenant_id: string;
  entity_type: string;    // 'pedido', 'venta_pos', 'cpe', etc.
  entity_id: string;
  action: string;         // 'CREATE', 'UPDATE', 'DELETE', 'STATE_CHANGE'
  old_values?: object;    // Snapshot antes del cambio
  new_values?: object;    // Snapshot después del cambio
  user_id?: string;
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
}
```
