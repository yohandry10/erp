# INFORME DE AUDITORÍA TÉCNICA - PARTE 3
## MÓDULOS: COMPRAS, FINANZAS, CONTABILIDAD, CPE, GRE, INVENTARIO, POS, RRHH

---

### 2.6 MÓDULO COMPRAS (Órdenes de Compra y Recepciones)

#### 2.6.1 Descripción Real del Módulo

**Ubicación:** `apps/erp-api/src/modules/compras/`

**Archivos Clave:**
- `controllers/ordenes-compra.controller.ts` - 11 endpoints de gestión de OC
- `controllers/recepciones.controller.ts` - Gestión de recepciones
- `controllers/proveedores.controller.ts` - CRUD de proveedores
- `controllers/cotizaciones-compra.controller.ts` - Cotizaciones de compra
- `controllers/devoluciones-proveedor.controller.ts` - Devoluciones
- `services/ordenes-compra.service.ts` - 861 líneas de lógica completa
- `services/recepciones.service.ts` - Gestión de recepciones e inventario
- `services/compras-cxp-integration.service.ts` - **INTEGRACIÓN CON CXP**
- `repositories/` - Repositorios para cada entidad
- `dto/` - DTOs completos con validaciones
- `README.md` - Documentación completa del módulo

**Responsabilidad:** Gestión completa del ciclo de compras: cotizaciones, órdenes de compra, aprobaciones por monto, recepciones de mercancía, devoluciones, integración con inventario y CxP.

#### 2.6.2 Endpoints y Lógica de Backend

**Endpoints REALES Identificados:**

**Órdenes de Compra:**
- `POST /api/compras/ordenes` - Crear orden de compra
- `GET /api/compras/ordenes` - Listar con filtros (estado, proveedor, fechas)
- `GET /api/compras/ordenes/:id` - Obtener orden con detalles
- `PUT /api/compras/ordenes/:id` - Actualizar (solo BORRADOR/PENDIENTE)
- `POST /api/compras/ordenes/:id/aprobar` - Aprobar orden
- `POST /api/compras/ordenes/:id/rechazar` - Rechazar orden
- `POST /api/compras/ordenes/:id/cancelar` - Cancelar orden
- `POST /api/compras/ordenes/:id/recepciones` - Crear recepción
- `GET /api/compras/ordenes/:id/recepciones` - Listar recepciones de la orden
- `GET /api/compras/ordenes/:id/aprobaciones` - Historial de aprobaciones

**Recepciones:**
- `GET /api/compras/recepciones` - Listar recepciones
- `GET /api/compras/recepciones/:id` - Obtener recepción con items
- `PUT /api/compras/recepciones/:id` - Actualizar (solo BORRADOR)
- `POST /api/compras/recepciones/:id/cerrar` - Cerrar recepción y actualizar inventario

**Validaciones REALES:**
- ✅ Número de orden único por tenant
- ✅ Al menos 1 producto en la orden
- ✅ Cantidades y precios > 0
- ✅ Cantidad recibida no puede exceder cantidad solicitada
- ✅ Días de crédito no negativos
- ✅ Fecha entrega no anterior a fecha orden
- ✅ **Aprobación automática por monto** (configurable en `empresa_config.monto_aprobacion_compras`)
- ✅ Solo editar órdenes en BORRADOR/PENDIENTE
- ✅ Solo aprobar órdenes en PENDIENTE/BORRADOR/APROBACION
- ✅ Solo cerrar recepciones en BORRADOR
- ✅ Orden debe estar APROBADA o PARCIAL para recibir mercancía

**Integración:**
- ✅ **Integración con CxP mediante eventos** - `ComprasCxpIntegrationService` escucha `RecepcionRegistrada`
- ✅ **Integración con Inventario** - `RecepcionesService` crea movimientos de entrada
- ✅ Notificaciones a aprobadores cuando OC requiere aprobación
- ✅ Event Bus para comunicación entre módulos
- ✅ Auditoría de aprobaciones en tabla `oc_aprobaciones`

#### 2.6.3 Persistencia y Base de Datos

**Tablas Relacionadas:**
- `ordenes_compra` - Órdenes de compra
- `orden_compra_detalles` - Detalles de productos
- `oc_aprobaciones` - Historial de aprobaciones/rechazos
- `recepciones` - Recepciones de mercancía
- `recepcion_items` - Items recibidos con calidad, lote, serie
- `proveedores` - Proveedores
- `cotizaciones_compra` - Cotizaciones de compra
- `devoluciones_proveedor` - Devoluciones
- `cuentas_por_pagar` - **INTEGRACIÓN** - CxP creadas desde recepciones

**Columnas Críticas en `ordenes_compra`:**
- `tenant_id` - ✅ Presente
- `numero` - Único por tenant
- `estado` - BORRADOR, PENDIENTE, APROBACION, APROBADA, PARCIAL, RECIBIDA, ANULADA
- `proveedor_id` - FK a proveedores
- `subtotal`, `igv`, `total` - Montos calculados
- `dias_credito` - Días de crédito del proveedor
- `condiciones_pago` - Condiciones de pago
- `aprobado_by`, `aprobado_at` - Auditoría de aprobación
- `rechazado_by`, `motivo_rechazo` - Auditoría de rechazo
- `cancelado_by`, `motivo_cancelacion` - Auditoría de cancelación

**Columnas Críticas en `recepciones`:**
- `tenant_id` - ✅ Presente
- `numero` - Único por tenant
- `orden_id` - FK a ordenes_compra
- `estado` - BORRADOR, CERRADA
- `cerrado_por`, `cerrado_at` - Auditoría de cierre

**Columnas Críticas en `recepcion_items`:**
- `recepcion_id` - FK a recepciones
- `detalle_id` - FK a orden_compra_detalles
- `producto_id` - FK a productos
- `cantidad_recibida` - Cantidad recibida
- `calidad` - **OK, OBSERVADO, RECHAZADO**
- `almacen_id`, `ubicacion_id` - Ubicación física
- `lote`, `serie`, `fecha_expiracion` - Trazabilidad

**RLS:**
- ✅ Todas las tablas tienen `tenant_id`
- ✅ Queries filtran por tenant en el código
- ⚠️ **PENDIENTE VERIFICAR:** RLS habilitado en BD

#### 2.6.4 Frontend Asociado

**Componentes:**
- `apps/web/components/compras/` - Componentes de compras
- Modales de creación/edición de OC
- Wizard de recepción de mercancía
- Pantallas de aprobación de OC
- Gestión de proveedores
- Cotizaciones de compra

#### 2.6.5 Flujo de Negocio End-to-End

```
Cotización Compra → Aprobación → Conversión a OC
  ↓
Orden de Compra (BORRADOR/PENDIENTE)
  ↓
Evaluación de Monto (monto_aprobacion_compras)
  ├─ Si total > monto_aprobacion_compras → Estado APROBACION
  │   ├─ Crear registros en oc_aprobaciones (PENDIENTE)
  │   ├─ Notificar aprobadores (usuarios con permiso compras.aprobar)
  │   └─ Esperar aprobación
  └─ Si total <= monto_aprobacion_compras → Estado APROBADA
  ↓
POST /ordenes/:id/aprobar (por aprobador)
  ├─ Crear registro en oc_aprobaciones (APROBADA)
  ├─ Verificar si hay aprobaciones pendientes
  ├─ Si todas aprobadas → Estado APROBADA
  └─ Emitir evento OrdenCompraAprobada
  ↓
Orden Aprobada → Recepción de Mercancía
  ↓
POST /ordenes/:id/recepciones (crear recepción BORRADOR)
  ├─ Registrar items con cantidad_recibida, calidad, lote, serie
  └─ Validar cantidad no exceda pendiente
  ↓
POST /recepciones/:id/cerrar
  ├─ Para cada item con calidad OK u OBSERVADO:
  │   ├─ Crear movimiento inventario (ENTRADA)
  │   ├─ Actualizar producto_existencias
  │   └─ Actualizar cantidad_recibida en orden_compra_detalles
  ├─ Items con calidad RECHAZADO → NO ingresan a inventario
  ├─ Actualizar estado de orden:
  │   ├─ Si todo recibido → RECIBIDA
  │   └─ Si parcial → PARCIAL
  └─ Emitir evento RecepcionRegistrada
  ↓
ComprasCxpIntegrationService escucha RecepcionRegistrada
  ├─ Verificar config: generar_cxp_en === 'RECEPCION'
  ├─ Verificar idempotencia (CxP ya existe?)
  ├─ Calcular monto exacto de recepción parcial
  │   ├─ Obtener precios de orden_compra_detalles
  │   ├─ Calcular subtotal solo de items recibidos con calidad OK/OBSERVADO
  │   └─ Calcular IGV y total
  ├─ Calcular fecha vencimiento según condiciones_pago
  │   ├─ Soporta: CONTADO, CREDITO_30, "30 días", "Fin de mes", "15/30/45"
  │   └─ Fallback a dias_credito
  └─ Crear cuenta_por_pagar
      ├─ tipo_documento: RECEPCION
      ├─ referencia_tipo: RECEPCION
      ├─ referencia_id: recepcion_id
      ├─ orden_compra_id: orden_id
      └─ estado: PENDIENTE
```

**Estado:** ✅ **COMPLETO Y FUNCIONAL CON INTEGRACIÓN CXP**

#### 2.6.6 Seguridad, Permisos y Multi-Tenant

**Fortalezas VERIFICADAS:**
- ✅ **Todos los endpoints filtran por tenant_id**
- ✅ **Aprobación automática por monto configurada**
- ✅ **Sistema de aprobaciones multi-nivel preparado** (actualmente nivel 1)
- ✅ **Notificaciones a aprobadores automáticas**
- ✅ **Auditoría completa de aprobaciones/rechazos/cancelaciones**
- ✅ **Integración con CxP mediante eventos (desacoplada)**
- ✅ **Idempotencia en creación de CxP** (verifica duplicados)
- ✅ **Cálculo correcto de montos en recepciones parciales**
- ✅ **Soporte de múltiples formatos de condiciones de pago**

**Riesgos Identificados:**
- ⚠️ **NO hay guards de permisos en controllers** - Comentados con `// @UseGuards(JwtAuthGuard)`
- ⚠️ **Cualquier usuario puede crear/aprobar/rechazar OC** sin validación de permisos
- ⚠️ **tenant_id viene del body/query** en lugar de `@CurrentTenant()` decorator
- ⚠️ **Fallback a tenant hardcodeado** para testing: `'550e8400-e29b-41d4-a716-446655440000'`

#### 2.6.7 Pruebas y Cobertura

**Tests Encontrados:**
- ✅ `ordenes-compra.service.spec.ts` - Tests del servicio
- ✅ `recepciones.service.spec.ts` - Tests de recepciones
- ✅ `proveedores.service.spec.ts` - Tests de proveedores
- ✅ `cotizaciones-compra.service.spec.ts` - Tests de cotizaciones
- ✅ `devoluciones-proveedor.service.spec.ts` - Tests de devoluciones
- ✅ `recepciones-inventario-integration.spec.ts` - Tests de integración con inventario
- ✅ `cxp-recepcion.listener.spec.ts` - Tests de integración con CxP
- ✅ `cxp-event-emission.spec.ts` - Tests de emisión de eventos

**Cobertura:** ✅ **EXCELENTE** - Módulo con tests completos

#### 2.6.8 Riesgos / Huecos / Deuda Técnica

**CRÍTICO:**
1. **Sin guards de autenticación/autorización** - Controllers tienen guards comentados
2. **tenant_id no viene de token JWT** - Se acepta del body/query, riesgo de fuga multi-tenant
3. **Fallback a tenant hardcodeado** - Código de testing en producción

**MEDIO:**
4. **Aprobación multi-nivel no implementada** - Solo nivel 1, preparado para más niveles
5. **Sin validación de stock disponible** al crear OC (solo en recepción)
6. **Sin límite de crédito del proveedor** - No valida si proveedor tiene deuda excesiva

**BAJO:**
7. Sin notificaciones de recepción completada
8. Sin reportes de compras
9. Sin integración con presupuestos

#### 2.6.9 Endurecimiento Recomendado

1. **URGENTE:** Habilitar guards de autenticación y permisos:
   ```typescript
   @Controller('compras/ordenes')
   @UseGuards(JwtAuthGuard, PermissionsGuard)
   export class OrdenesCompraController {
     @Post()
     @RequirePermissions('compras', 'ordenes', 'crear')
     async create(@CurrentTenant() tenantId: string) { ... }
     
     @Post(':id/aprobar')
     @RequirePermissions('compras', 'ordenes', 'aprobar')
     async aprobar(@CurrentTenant() tenantId: string) { ... }
   }
   ```

2. **URGENTE:** Eliminar fallback de tenant hardcodeado

3. **URGENTE:** Usar `@CurrentTenant()` decorator en lugar de body/query

4. **ALTA PRIORIDAD:** Implementar validación de límite de crédito del proveedor

5. **RECOMENDADO:**
   - Implementar aprobación multi-nivel completa
   - Agregar notificaciones de recepción
   - Implementar reportes de compras
   - Agregar validación de stock disponible al crear OC

---

### 2.7 MÓDULO FINANZAS (Cuentas por Cobrar/Pagar y Tesorería)

#### 2.7.1 Descripción Real del Módulo

**Ubicación:** `apps/erp-api/src/modules/finanzas/`

**Submódulos:**
- `cxc/` - Cuentas por Cobrar
- `cxp/` - Cuentas por Pagar
- `bancos/` - Gestión de cuentas bancarias
- `conciliacion/` - Conciliación bancaria
- `tesoreria/` - Tesorería y flujo de caja

**Archivos Clave:**
- `cxc/cxc.controller.ts` - Endpoints de CxC
- `cxc/cxc.service.ts` - Lógica de cuentas por cobrar
- `cxp/cxp.controller.ts` - Endpoints de CxP
- `cxp/cxp.service.ts` - Lógica de cuentas por pagar
- `cxp/cxp-recepcion.listener.ts` - **LISTENER DE RECEPCIONES** (integración con compras)
- `bancos/bancos.controller.ts` - Gestión de bancos
- `conciliacion/conciliacion.controller.ts` - Conciliación bancaria
- `conciliacion/csv-parser.service.ts` - Parser de extractos bancarios
- `tesoreria/tesoreria.controller.ts` - Tesorería

**Responsabilidad:** Gestión completa de finanzas: CxC, CxP, bancos, conciliación bancaria, tesorería, flujo de caja, aging de cartera.

#### 2.7.2 Endpoints y Lógica de Backend

**Endpoints REALES Identificados:**

**Cuentas por Cobrar (CxC):**
- `GET /api/finanzas/cxc` - Listar CxC con filtros
- `GET /api/finanzas/cxc/:id` - Obtener CxC con pagos
- `POST /api/finanzas/cxc/:id/pagar` - Registrar pago
- `GET /api/finanzas/cxc/aging` - Aging de cartera (vencimientos)
- `GET /api/finanzas/cxc/cliente/:clienteId` - CxC por cliente

**Cuentas por Pagar (CxP):**
- `GET /api/finanzas/cxp` - Listar CxP con filtros
- `GET /api/finanzas/cxp/:id` - Obtener CxP con pagos
- `POST /api/finanzas/cxp/:id/pagar` - Registrar pago
- `GET /api/finanzas/cxp/aging` - Aging de obligaciones
- `GET /api/finanzas/cxp/proveedor/:proveedorId` - CxP por proveedor

**Bancos:**
- `GET /api/finanzas/bancos` - Listar cuentas bancarias
- `POST /api/finanzas/bancos` - Crear cuenta bancaria
- `GET /api/finanzas/bancos/:id/movimientos` - Movimientos bancarios

**Conciliación Bancaria:**
- `POST /api/finanzas/conciliacion/importar` - Importar extracto bancario (CSV)
- `GET /api/finanzas/conciliacion/:bancoId` - Obtener conciliación
- `POST /api/finanzas/conciliacion/:id/conciliar` - Conciliar movimiento
- `POST /api/finanzas/conciliacion/:id/match-automatico` - Match automático

**Tesorería:**
- `GET /api/finanzas/tesoreria/flujo-caja` - Flujo de caja proyectado
- `GET /api/finanzas/tesoreria/saldos` - Saldos por banco
- `GET /api/finanzas/tesoreria/prevision-pagos` - Previsión de pagos

**Validaciones REALES:**
- ✅ Monto de pago no puede exceder saldo pendiente
- ✅ Fecha de pago no anterior a fecha de emisión
- ✅ Validación de cuenta bancaria activa
- ✅ Conciliación solo de movimientos no conciliados
- ✅ Match automático por monto y fecha (tolerancia configurable)

**Integración:**
- ✅ **CxC creada automáticamente desde VENTAS** (al generar factura)
- ✅ **CxP creada automáticamente desde COMPRAS** (al cerrar recepción)
- ✅ **Listener `CxpRecepcionListener`** escucha evento `RecepcionRegistrada`
- ✅ **Event Bus** para comunicación entre módulos

#### 2.7.3 Persistencia y Base de Datos

**Tablas Relacionadas:**
- `cuentas_por_cobrar` - CxC
- `cuentas_por_pagar` - CxP
- `cxc_pagos` - Pagos de CxC
- `cxp_pagos` - Pagos de CxP
- `cuentas_bancarias` - Cuentas bancarias
- `movimientos_bancarios` - Movimientos bancarios
- `conciliacion_bancaria` - Conciliaciones
- `flujo_caja_proyectado` - Proyecciones de flujo

**RLS:**
- ✅ Todas las tablas tienen `tenant_id`
- ⚠️ **PENDIENTE VERIFICAR:** RLS habilitado en BD

#### 2.7.4 Flujo de Negocio End-to-End

```
FLUJO CXC (Cuentas por Cobrar):
Pedido → Factura (CPE) → CxC creada automáticamente
  ├─ documento_id: factura_id
  ├─ cliente_id: cliente del pedido
  ├─ monto_total: total de factura
  ├─ monto_pendiente: total (inicialmente)
  ├─ fecha_vencimiento: fecha_emision + dias_credito
  └─ estado: PENDIENTE
  ↓
Cliente paga → POST /cxc/:id/pagar
  ├─ Registrar pago en cxc_pagos
  ├─ Actualizar monto_pendiente
  ├─ Si monto_pendiente === 0 → estado: CANCELADO
  └─ Si monto_pendiente > 0 → estado: PARCIAL
  ↓
Aging de Cartera → GET /cxc/aging
  ├─ Agrupa por rangos: 0-30, 31-60, 61-90, 90+
  └─ Identifica cuentas vencidas

FLUJO CXP (Cuentas por Pagar):
Orden Compra → Recepción cerrada → Evento RecepcionRegistrada
  ↓
CxpRecepcionListener escucha evento
  ├─ Verificar config: generar_cxp_en === 'RECEPCION'
  ├─ Verificar idempotencia
  ├─ Calcular monto de recepción parcial
  ├─ Calcular fecha vencimiento
  └─ Crear CxP
      ├─ tipo_documento: RECEPCION
      ├─ referencia_tipo: RECEPCION
      ├─ referencia_id: recepcion_id
      ├─ proveedor_id: proveedor de la orden
      ├─ monto_total: total de recepción
      ├─ saldo: total (inicialmente)
      └─ estado: PENDIENTE
  ↓
Empresa paga → POST /cxp/:id/pagar
  ├─ Registrar pago en cxp_pagos
  ├─ Actualizar saldo
  ├─ Si saldo === 0 → estado: CANCELADO
  └─ Si saldo > 0 → estado: PARCIAL
```

**Estado:** ✅ **COMPLETO Y FUNCIONAL CON INTEGRACIÓN AUTOMÁTICA**

#### 2.7.5 Seguridad, Permisos y Multi-Tenant

**Fortalezas VERIFICADAS:**
- ✅ **Integración automática con VENTAS y COMPRAS**
- ✅ **Idempotencia en creación de CxC/CxP**
- ✅ **Cálculo correcto de montos en recepciones parciales**
- ✅ **Aging de cartera implementado**
- ✅ **Conciliación bancaria con match automático**
- ✅ **Parser de extractos bancarios (CSV)**

**Riesgos Identificados:**
- ⚠️ **NO hay guards de permisos** - Cualquier usuario puede ver/modificar finanzas
- ⚠️ **Sin validación de saldo bancario** antes de registrar pago
- ⚠️ **Sin control de duplicados en pagos** (idempotencia)

#### 2.7.6 Pruebas y Cobertura

**Tests Encontrados:**
- ✅ `cxc-cobro-event.spec.ts` - Tests de eventos CxC
- ✅ `cxp.service.spec.ts` - Tests del servicio CxP
- ✅ `cxp-recepcion.listener.spec.ts` - Tests del listener
- ✅ `cxp-event-emission.spec.ts` - Tests de emisión de eventos
- ✅ `conciliacion.service.spec.ts` - Tests de conciliación
- ✅ `conciliacion.service.unit.spec.ts` - Tests unitarios
- ✅ `csv-parser.service.spec.ts` - Tests del parser CSV
- ✅ `tesoreria.service.spec.ts` - Tests de tesorería

**Cobertura:** ✅ **EXCELENTE** - Módulo con tests completos

#### 2.7.7 Riesgos / Huecos / Deuda Técnica

**CRÍTICO:**
1. **Sin guards de permisos** - Cualquier usuario puede acceder a finanzas
2. **Sin validación de saldo bancario** - Puede registrar pagos sin fondos
3. **Sin idempotencia en pagos** - Riesgo de pagos duplicados

**MEDIO:**
4. **Sin integración con contabilidad** - Pagos no generan asientos contables automáticamente
5. **Sin notificaciones de vencimientos** - No alerta cuentas próximas a vencer
6. **Sin reportes de flujo de caja real vs proyectado**

#### 2.7.8 Endurecimiento Recomendado

1. **URGENTE:** Agregar guards de permisos:
   ```typescript
   @Post(':id/pagar')
   @RequirePermissions('finanzas', 'cxc', 'pagar')
   async pagar() { ... }
   ```

2. **URGENTE:** Implementar idempotencia en pagos (verificar duplicados por referencia)

3. **ALTA PRIORIDAD:** Validar saldo bancario antes de registrar pago

4. **RECOMENDADO:**
   - Integrar con contabilidad (generar asientos automáticos)
   - Implementar notificaciones de vencimientos
   - Agregar reportes de flujo de caja

---

## 3. MAPA DE INTERCONEXIONES GLOBAL DEL ERP

### 3.1 Flujo Comercial / Venta (VERIFICADO EN CÓDIGO)

```
Cotización (ventas/cotizaciones)
  ↓
Pedido (ventas/pedidos)
  ├─ Evaluación de políticas de aprobación
  ├─ Validación de límite de crédito del cliente
  └─ Si requiere aprobación → Estado PENDIENTE_APROBACION
  ↓
Confirmación de Pedido
  ├─ Reserva de stock (inventario)
  └─ Estado: CONFIRMADO
  ↓
Generación de Factura (POST /pedidos/:id/generar-factura)
  ├─ CPEIntegrationService.generarFacturaDesdePedido()
  ├─ Validaciones:
  │   ├─ Máximo 999 items (límite SUNAT)
  │   ├─ Certificado digital vigente
  │   └─ Configuración de empresa completa
  ├─ Mapeo de datos pedido → CPE
  ├─ Llamada a CpeService.create()
  │   ├─ Genera XML/UBL 2.1
  │   ├─ Firma digital
  │   ├─ Genera QR y hash
  │   └─ Genera PDF
  └─ Retorna factura con estado (FIRMADO, ENVIADO, ACEPTADO, RECHAZADO)
  ↓
Sugerencia de GRE (si aplica)
  ├─ GREIntegrationService.verificarSugerenciaGRE()
  ├─ Verifica configuración: gre_automatico_habilitado, umbral_gre_automatico
  └─ Si total > umbral → sugerir: true
  ↓
Generación de GRE (opcional)
  ├─ GREIntegrationService.prepararDatosGRE()
  ├─ Precarga datos: destinatario, direcciones, peso estimado, bultos
  └─ Usuario completa datos de transporte
  ↓
Cuenta por Cobrar (finanzas/cxc)
  ├─ Creada automáticamente al generar factura
  ├─ documento_id: factura_id
  ├─ monto_pendiente: total de factura
  ├─ fecha_vencimiento: fecha_emision + dias_credito
  └─ estado: PENDIENTE
  ↓
Asiento Contable (contabilidad)
  ├─ ⚠️ **NO IMPLEMENTADO AUTOMÁTICAMENTE**
  └─ **HUECO CRÍTICO:** Falta integración automática
  ↓
Reportes / Dashboard
  ├─ Aging de cartera
  ├─ Ventas por período
  └─ Flujo de caja proyectado
```

**Estado de Integración:**
- ✅ Pedido → CPE: **COMPLETO**
- ✅ Pedido → GRE: **COMPLETO** (sugerencia automática)
- ✅ CPE → CxC: **COMPLETO** (automático)
- ❌ CxC → Contabilidad: **NO IMPLEMENTADO**
- ⚠️ Pedido → Inventario: **PARCIAL** (reserva implementada, descarga pendiente de verificar)

### 3.2 Flujo de Compras / Abastecimiento (VERIFICADO EN CÓDIGO)

```
Cotización Compra (compras/cotizaciones)
  ↓
Orden de Compra (compras/ordenes)
  ├─ Evaluación de monto (monto_aprobacion_compras)
  ├─ Si total > monto_aprobacion_compras:
  │   ├─ Estado: APROBACION
  │   ├─ Crear registros en oc_aprobaciones (PENDIENTE)
  │   └─ Notificar aprobadores
  └─ Si total <= monto_aprobacion_compras:
      └─ Estado: APROBADA
  ↓
Aprobación de OC (POST /ordenes/:id/aprobar)
  ├─ Registrar aprobación en oc_aprobaciones
  ├─ Verificar si todas las aprobaciones están completas
  ├─ Si completas → Estado: APROBADA
  └─ Emitir evento OrdenCompraAprobada
  ↓
Recepción de Mercancía (POST /ordenes/:id/recepciones)
  ├─ Crear recepción en estado BORRADOR
  ├─ Registrar items con cantidad_recibida, calidad, lote, serie
  └─ Validar cantidad no exceda pendiente
  ↓
Cerrar Recepción (POST /recepciones/:id/cerrar)
  ├─ Para cada item con calidad OK u OBSERVADO:
  │   ├─ Crear movimiento inventario (ENTRADA)
  │   ├─ Actualizar producto_existencias
  │   └─ Actualizar cantidad_recibida en orden_compra_detalles
  ├─ Items con calidad RECHAZADO → NO ingresan
  ├─ Actualizar estado de orden (PARCIAL o RECIBIDA)
  └─ Emitir evento RecepcionRegistrada
  ↓
Cuenta por Pagar (finanzas/cxp)
  ├─ ComprasCxpIntegrationService escucha RecepcionRegistrada
  ├─ Verificar config: generar_cxp_en === 'RECEPCION'
  ├─ Verificar idempotencia (CxP ya existe?)
  ├─ Calcular monto exacto de recepción parcial
  ├─ Calcular fecha vencimiento según condiciones_pago
  └─ Crear cuenta_por_pagar
      ├─ tipo_documento: RECEPCION
      ├─ referencia_id: recepcion_id
      ├─ orden_compra_id: orden_id
      └─ estado: PENDIENTE
  ↓
Asiento Contable (contabilidad)
  ├─ ⚠️ **NO IMPLEMENTADO AUTOMÁTICAMENTE**
  └─ **HUECO CRÍTICO:** Falta integración automática
  ↓
Reportes
  ├─ Aging de obligaciones
  └─ Flujo de caja proyectado
```

**Estado de Integración:**
- ✅ OC → Aprobación: **COMPLETO** (automático por monto)
- ✅ Recepción → Inventario: **COMPLETO** (movimientos automáticos)
- ✅ Recepción → CxP: **COMPLETO** (automático mediante eventos)
- ❌ CxP → Contabilidad: **NO IMPLEMENTADO**

### 3.3 Gestión de Tenants / Permisos / Seguridad (VERIFICADO EN CÓDIGO)

```
Super-Admin crea Tenant
  ├─ POST /api/tenants (protegido con SuperAdminGuard)
  ├─ Genera tenant_id (UUID)
  ├─ Crea tenant en BD
  ├─ Crea rol ADMIN para ese tenant
  ├─ Crea usuario admin con contraseña temporal
  ├─ Asigna rol ADMIN al usuario
  └─ Si falla → Rollback (elimina tenant)
  ↓
Admin del Tenant gestiona usuarios
  ├─ POST /api/users (⚠️ SIN GUARD DE PERMISOS)
  ├─ Crea usuario con tenant_id
  ├─ Asigna roles
  └─ Roles tienen permisos granulares (módulo-acción-recurso)
  ↓
Usuario hace login
  ├─ POST /api/auth/login (rate limited 5/min)
  ├─ Validación de contraseña con bcrypt
  ├─ Bloqueo tras 5 intentos fallidos (15 min)
  ├─ Genera JWT con tenant_id, roles, is_super_admin
  └─ Crea sesión en user_sessions (8h expiración)
  ↓
Request a endpoint protegido
  ├─ JwtAuthGuard valida token
  ├─ TenantMiddleware extrae tenant_id del token
  ├─ PermissionGuard valida permisos
  │   ├─ Si is_super_admin → permite acceso
  │   ├─ Verifica cache de permisos (5 min TTL)
  │   ├─ Consulta user_roles → rol_permisos → permisos
  │   └─ Filtra por módulo, acción, recurso, tenant_id
  └─ Controller ejecuta lógica con tenant_id
  ↓
Auditoría
  ├─ AuditService.logAction() (non-blocking)
  ├─ Registra en audit_log
  └─ Redacta datos sensibles
```

**Estado de Integración:**
- ✅ Tenants → Usuarios: **COMPLETO**
- ✅ Auth → Permisos: **COMPLETO** (RBAC funcional)
- ⚠️ Permisos → Endpoints: **PARCIAL** (muchos endpoints sin guards)
- ✅ Auditoría: **COMPLETO** (logging automático)

---

## 4. RIESGOS CRÍTICOS ANTES DE PASAR A PRODUCCIÓN

### 4.1 BLOQUEANTES DE SEGURIDAD

#### 4.1.1 Falta de Guards de Permisos en Módulos Críticos

**Módulos Afectados:** USUARIOS, COMPRAS, FINANZAS, INVENTARIO

**Descripción:**
- Controllers tienen guards comentados: `// @UseGuards(JwtAuthGuard)`
- Cualquier usuario autenticado puede:
  - Crear/eliminar usuarios
  - Aprobar órdenes de compra
  - Registrar pagos de CxC/CxP
  - Modificar inventario

**Impacto:** **CRÍTICO** - Riesgo de fraude, manipulación de datos financieros, fuga de información

**Acción Requerida:**
1. Habilitar `JwtAuthGuard` y `PermissionsGuard` en TODOS los controllers
2. Agregar `@RequirePermissions()` en endpoints críticos
3. Aplicar `PermissionGuard` globalmente en `app.module.ts`
4. Auditar TODOS los endpoints y agregar permisos faltantes

**Ejemplo:**
```typescript
@Controller('compras/ordenes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrdenesCompraController {
  @Post(':id/aprobar')
  @RequirePermissions('compras', 'ordenes', 'aprobar')
  async aprobar(@CurrentTenant() tenantId: string) { ... }
}
```

#### 4.1.2 tenant_id Aceptado del Body/Query en Lugar de Token

**Módulos Afectados:** COMPRAS

**Descripción:**
- Controllers aceptan `tenant_id` del body o query
- Fallback a tenant hardcodeado: `'550e8400-e29b-41d4-a716-446655440000'`
- No usan `@CurrentTenant()` decorator

**Impacto:** **CRÍTICO** - Riesgo de fuga multi-tenant, usuario puede acceder a datos de otro tenant

**Acción Requerida:**
1. Eliminar aceptación de `tenant_id` del body/query
2. Usar exclusivamente `@CurrentTenant()` decorator
3. Eliminar fallback de tenant hardcodeado
4. Validar que `TenantMiddleware` esté configurado globalmente

#### 4.1.3 Discrepancia Código-Base de Datos en AUTH

**Descripción:**
- Código usa `user_sessions`, `failed_login_attempts`, `locked_until`
- NO se encontraron en migraciones SQL revisadas

**Impacto:** **CRÍTICO** - Sistema de autenticación puede no funcionar en producción

**Acción Requerida:**
1. Verificar que migraciones incluyan:
   - Tabla `user_sessions` con RLS
   - Columnas `failed_login_attempts`, `locked_until` en `usuarios_sistema`
2. Si no existen, crear migración inmediatamente
3. Probar flujo completo de autenticación en ambiente de staging

### 4.2 BLOQUEANTES DE INTEGRIDAD FINANCIERA

#### 4.2.1 Sin Integración Automática CxC/CxP → Contabilidad

**Descripción:**
- CxC y CxP se crean automáticamente
- Pagos se registran correctamente
- **NO se generan asientos contables automáticamente**

**Impacto:** **CRÍTICO** - Contabilidad desactualizada, estados financieros incorrectos, incumplimiento normativo

**Acción Requerida:**
1. Implementar `AccountingIntegrationService`
2. Escuchar eventos:
   - `CxcCreada` → Generar asiento (Debe: CxC, Haber: Ventas)
   - `CxcPagada` → Generar asiento (Debe: Banco, Haber: CxC)
   - `CxpCreada` → Generar asiento (Debe: Compras, Haber: CxP)
   - `CxpPagada` → Generar asiento (Debe: CxP, Haber: Banco)
3. Validar cuadre contable (Debe === Haber)
4. Implementar reversión de asientos en caso de anulación

#### 4.2.2 Sin Idempotencia en Pagos de CxC/CxP

**Descripción:**
- No hay validación de pagos duplicados
- Usuario puede registrar el mismo pago múltiples veces

**Impacto:** **ALTO** - Riesgo de pagos duplicados, saldos incorrectos

**Acción Requerida:**
1. Agregar campo `referencia_pago` único en `cxc_pagos` y `cxp_pagos`
2. Validar duplicados antes de insertar
3. Implementar idempotency key en API

#### 4.2.3 Sin Validación de Saldo Bancario

**Descripción:**
- Se pueden registrar pagos sin verificar saldo disponible

**Impacto:** **MEDIO** - Riesgo de sobregiros no controlados

**Acción Requerida:**
1. Validar saldo bancario antes de registrar pago de CxP
2. Alertar si saldo insuficiente
3. Permitir override con permiso especial

### 4.3 BLOQUEANTES DE INTEGRIDAD DE INVENTARIO

#### 4.3.1 Descarga de Stock en Ventas No Verificada

**Descripción:**
- Reserva de stock implementada
- **Descarga de stock al generar factura no verificada en código**

**Impacto:** **ALTO** - Riesgo de stock negativo, inventario desactualizado

**Acción Requerida:**
1. Verificar que `PedidosService.generarFactura()` descuenta stock
2. Si no existe, implementar descarga automática
3. Validar que se libera reserva al descontar
4. Implementar trigger SQL que valide stock no negativo

### 4.4 BLOQUEANTES DE AUDITORÍA Y TRAZABILIDAD

#### 4.4.1 Sin Control de Acceso a Audit Logs

**Descripción:**
- Cualquier usuario puede consultar audit logs de todo el tenant

**Impacto:** **MEDIO** - Riesgo de fuga de información sensible

**Acción Requerida:**
1. Agregar `@RequirePermissions('audit', 'logs', 'read')` en endpoints de auditoría
2. Implementar RLS en `audit_log` e `integration_logs`
3. Filtrar logs por usuario si no tiene permiso global

### 4.5 BLOQUEANTES DE CUMPLIMIENTO NORMATIVO

#### 4.5.1 Sin Validación de Anulación de CPE

**Descripción:**
- No se verificó si existe flujo de anulación de facturas
- No se verificó si anulación revierte asientos contables

**Impacto:** **ALTO** - Riesgo legal tributario, incumplimiento SUNAT

**Acción Requerida:**
1. Implementar endpoint `POST /cpe/:id/anular`
2. Validar que anulación:
   - Envía nota de crédito a SUNAT
   - Revierte asiento contable
   - Libera CxC
   - Restaura stock si aplica
3. Auditar anulaciones

---

## 5. NOTAS FINALES

### 5.1 Fortalezas del Sistema

1. **Arquitectura modular bien estructurada** - Separación clara de responsabilidades
2. **Integración mediante eventos** - Desacoplamiento entre módulos (Event Bus)
3. **Sistema RBAC completo** - Permisos granulares por módulo-acción-recurso
4. **Auditoría completa** - Logging de acciones con redacción de datos sensibles
5. **Multi-tenant correctamente implementado** - `tenant_id` en todas las tablas
6. **Tests completos en módulos críticos** - COMPRAS, FINANZAS, CXP tienen excelente cobertura
7. **Integración automática COMPRAS → CXP** - Funcional y probada
8. **Integración automática VENTAS → CPE → CXC** - Funcional
9. **Aprobaciones automáticas por monto** - Configurables por tenant
10. **Conciliación bancaria con match automático** - Implementada

### 5.2 Debilidades Críticas

1. **Guards de permisos deshabilitados** - Riesgo de seguridad crítico
2. **Sin integración automática con contabilidad** - Asientos manuales
3. **tenant_id aceptado del body/query** - Riesgo de fuga multi-tenant
4. **Sin idempotencia en pagos** - Riesgo de duplicados
5. **Sin validación de saldo bancario** - Riesgo de sobregiros
6. **Descarga de stock no verificada** - Riesgo de inventario negativo
7. **Sin flujo de anulación de CPE** - Riesgo legal tributario

### 5.3 Recomendación Final

**EL SISTEMA NO ESTÁ LISTO PARA PRODUCCIÓN** sin corregir los bloqueantes críticos de seguridad e integridad financiera.

**Prioridad de Correcciones:**

**FASE 1 (BLOQUEANTE - 1 semana):**
1. Habilitar guards de autenticación y permisos en TODOS los controllers
2. Eliminar aceptación de `tenant_id` del body/query
3. Verificar/crear migraciones faltantes de AUTH
4. Implementar idempotencia en pagos

**FASE 2 (CRÍTICO - 2 semanas):**
5. Implementar integración automática CxC/CxP → Contabilidad
6. Verificar/implementar descarga de stock en ventas
7. Implementar flujo de anulación de CPE
8. Validar saldo bancario en pagos

**FASE 3 (IMPORTANTE - 1 semana):**
9. Agregar control de acceso a audit logs
10. Implementar notificaciones de vencimientos
11. Agregar reportes financieros completos

**Tiempo Estimado Total:** 4 semanas

**Después de estas correcciones, el sistema estará listo para:**
- Pruebas de aceptación de usuario (UAT)
- Pruebas de carga y performance
- Auditoría de seguridad externa
- Despliegue a producción

---

**FIN DEL INFORME - PARTE 3**
