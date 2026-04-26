-- ============================================================================
-- 010__module_refinements_auto.sql
-- Refinamiento automatico de columnas a partir de referencias reales de codigo.
-- NOTA: revisar tipos/constraints finos por modulo en siguientes iteraciones.
-- ============================================================================

BEGIN;

-- Tabla: almacenes
ALTER TABLE IF EXISTS public.almacenes ADD COLUMN IF NOT EXISTS activo boolean DEFAULT false;
ALTER TABLE IF EXISTS public.almacenes ADD COLUMN IF NOT EXISTS es_principal boolean DEFAULT false;
ALTER TABLE IF EXISTS public.almacenes ADD COLUMN IF NOT EXISTS pais text;
ALTER TABLE IF EXISTS public.almacenes ADD COLUMN IF NOT EXISTS precio numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.almacenes ADD COLUMN IF NOT EXISTS ruc text;
ALTER TABLE IF EXISTS public.almacenes ADD COLUMN IF NOT EXISTS stock_actual text;
ALTER TABLE IF EXISTS public.almacenes ADD COLUMN IF NOT EXISTS stock_reservado text;
ALTER TABLE IF EXISTS public.almacenes ADD COLUMN IF NOT EXISTS unidad_medida text;

-- Tabla: asientos_contables
ALTER TABLE IF EXISTS public.asientos_contables ADD COLUMN IF NOT EXISTS asientos_generados text;
ALTER TABLE IF EXISTS public.asientos_contables ADD COLUMN IF NOT EXISTS concepto text;
ALTER TABLE IF EXISTS public.asientos_contables ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE IF EXISTS public.asientos_contables ADD COLUMN IF NOT EXISTS descripcion text;
ALTER TABLE IF EXISTS public.asientos_contables ADD COLUMN IF NOT EXISTS fecha timestamptz;
ALTER TABLE IF EXISTS public.asientos_contables ADD COLUMN IF NOT EXISTS fecha_asientos timestamptz;
ALTER TABLE IF EXISTS public.asientos_contables ADD COLUMN IF NOT EXISTS hardening text;
ALTER TABLE IF EXISTS public.asientos_contables ADD COLUMN IF NOT EXISTS numero_asiento integer;
ALTER TABLE IF EXISTS public.asientos_contables ADD COLUMN IF NOT EXISTS origen text;
ALTER TABLE IF EXISTS public.asientos_contables ADD COLUMN IF NOT EXISTS referencia text;
ALTER TABLE IF EXISTS public.asientos_contables ADD COLUMN IF NOT EXISTS source_event_id uuid;
ALTER TABLE IF EXISTS public.asientos_contables ADD COLUMN IF NOT EXISTS tipo_asiento text;
ALTER TABLE IF EXISTS public.asientos_contables ADD COLUMN IF NOT EXISTS total_debe numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.asientos_contables ADD COLUMN IF NOT EXISTS total_haber numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.asientos_contables ADD COLUMN IF NOT EXISTS ultimoconceptofinal text;
ALTER TABLE IF EXISTS public.asientos_contables ADD COLUMN IF NOT EXISTS usuario_id uuid;

-- Tabla: autorizaciones_caja
ALTER TABLE IF EXISTS public.autorizaciones_caja ADD COLUMN IF NOT EXISTS supervisor_id uuid;
ALTER TABLE IF EXISTS public.autorizaciones_caja ADD COLUMN IF NOT EXISTS tipo_autorizacion text;

-- Tabla: cambios_turno
ALTER TABLE IF EXISTS public.cambios_turno ADD COLUMN IF NOT EXISTS congelada boolean DEFAULT false;
ALTER TABLE IF EXISTS public.cambios_turno ADD COLUMN IF NOT EXISTS diferencia numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.cambios_turno ADD COLUMN IF NOT EXISTS estado_conciliacion text;
ALTER TABLE IF EXISTS public.cambios_turno ADD COLUMN IF NOT EXISTS firma_digital_entrante text;
ALTER TABLE IF EXISTS public.cambios_turno ADD COLUMN IF NOT EXISTS firma_digital_saliente text;
ALTER TABLE IF EXISTS public.cambios_turno ADD COLUMN IF NOT EXISTS foto_arqueo text;
ALTER TABLE IF EXISTS public.cambios_turno ADD COLUMN IF NOT EXISTS saldo_contado numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.cambios_turno ADD COLUMN IF NOT EXISTS sesion_caja_id uuid;
ALTER TABLE IF EXISTS public.cambios_turno ADD COLUMN IF NOT EXISTS timestamp_fin text;
ALTER TABLE IF EXISTS public.cambios_turno ADD COLUMN IF NOT EXISTS timestamp_inicio text;

-- Tabla: clientes
ALTER TABLE IF EXISTS public.clientes ADD COLUMN IF NOT EXISTS activo boolean DEFAULT false;
ALTER TABLE IF EXISTS public.clientes ADD COLUMN IF NOT EXISTS apellidos text;
ALTER TABLE IF EXISTS public.clientes ADD COLUMN IF NOT EXISTS cliente_id uuid;
ALTER TABLE IF EXISTS public.clientes ADD COLUMN IF NOT EXISTS detraccion_tasa numeric(10,4) DEFAULT 0;
ALTER TABLE IF EXISTS public.clientes ADD COLUMN IF NOT EXISTS direccion text;
ALTER TABLE IF EXISTS public.clientes ADD COLUMN IF NOT EXISTS documento_numero integer;
ALTER TABLE IF EXISTS public.clientes ADD COLUMN IF NOT EXISTS documento_tipo text;
ALTER TABLE IF EXISTS public.clientes ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE IF EXISTS public.clientes ADD COLUMN IF NOT EXISTS limite_credito numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.clientes ADD COLUMN IF NOT EXISTS nombres text;
ALTER TABLE IF EXISTS public.clientes ADD COLUMN IF NOT EXISTS numero_documento integer;
ALTER TABLE IF EXISTS public.clientes ADD COLUMN IF NOT EXISTS pais text;
ALTER TABLE IF EXISTS public.clientes ADD COLUMN IF NOT EXISTS percepcion_tasa numeric(10,4) DEFAULT 0;
ALTER TABLE IF EXISTS public.clientes ADD COLUMN IF NOT EXISTS permite_morosidad boolean DEFAULT false;
ALTER TABLE IF EXISTS public.clientes ADD COLUMN IF NOT EXISTS razon_social text;
ALTER TABLE IF EXISTS public.clientes ADD COLUMN IF NOT EXISTS retencion_tasa numeric(10,4) DEFAULT 0;
ALTER TABLE IF EXISTS public.clientes ADD COLUMN IF NOT EXISTS ruc text;
ALTER TABLE IF EXISTS public.clientes ADD COLUMN IF NOT EXISTS sujeto_detraccion numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.clientes ADD COLUMN IF NOT EXISTS sujeto_percepcion numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.clientes ADD COLUMN IF NOT EXISTS sujeto_retencion numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.clientes ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE IF EXISTS public.clientes ADD COLUMN IF NOT EXISTS tipo_documento text;

-- Tabla: conciliaciones_bancarias
ALTER TABLE IF EXISTS public.conciliaciones_bancarias ADD COLUMN IF NOT EXISTS banco text;
ALTER TABLE IF EXISTS public.conciliaciones_bancarias ADD COLUMN IF NOT EXISTS cerrado_at timestamptz;
ALTER TABLE IF EXISTS public.conciliaciones_bancarias ADD COLUMN IF NOT EXISTS cerrado_by text;
ALTER TABLE IF EXISTS public.conciliaciones_bancarias ADD COLUMN IF NOT EXISTS cuenta_bancaria_id uuid;
ALTER TABLE IF EXISTS public.conciliaciones_bancarias ADD COLUMN IF NOT EXISTS diferencia numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.conciliaciones_bancarias ADD COLUMN IF NOT EXISTS moneda text;
ALTER TABLE IF EXISTS public.conciliaciones_bancarias ADD COLUMN IF NOT EXISTS numero_cuenta integer;
ALTER TABLE IF EXISTS public.conciliaciones_bancarias ADD COLUMN IF NOT EXISTS observaciones text;
ALTER TABLE IF EXISTS public.conciliaciones_bancarias ADD COLUMN IF NOT EXISTS periodo text;
ALTER TABLE IF EXISTS public.conciliaciones_bancarias ADD COLUMN IF NOT EXISTS saldo_actual numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.conciliaciones_bancarias ADD COLUMN IF NOT EXISTS saldo_banco numeric(14,2) DEFAULT 0;

-- Tabla: cotizacion_compra_detalles
ALTER TABLE IF EXISTS public.cotizacion_compra_detalles ADD COLUMN IF NOT EXISTS cotizacion_id uuid;
ALTER TABLE IF EXISTS public.cotizacion_compra_detalles ADD COLUMN IF NOT EXISTS numero integer;
ALTER TABLE IF EXISTS public.cotizacion_compra_detalles ADD COLUMN IF NOT EXISTS orden_compra_id uuid;

-- Tabla: cotizacion_detalles
ALTER TABLE IF EXISTS public.cotizacion_detalles ADD COLUMN IF NOT EXISTS cotizacion_id uuid;

-- Tabla: cotizaciones
ALTER TABLE IF EXISTS public.cotizaciones ADD COLUMN IF NOT EXISTS aprobado_por text;
ALTER TABLE IF EXISTS public.cotizaciones ADD COLUMN IF NOT EXISTS cliente_id uuid;
ALTER TABLE IF EXISTS public.cotizaciones ADD COLUMN IF NOT EXISTS convertido_por text;
ALTER TABLE IF EXISTS public.cotizaciones ADD COLUMN IF NOT EXISTS documento_generado_id uuid;
ALTER TABLE IF EXISTS public.cotizaciones ADD COLUMN IF NOT EXISTS fecha timestamptz;
ALTER TABLE IF EXISTS public.cotizaciones ADD COLUMN IF NOT EXISTS fecha_aprobacion timestamptz;
ALTER TABLE IF EXISTS public.cotizaciones ADD COLUMN IF NOT EXISTS fecha_conversion timestamptz;
ALTER TABLE IF EXISTS public.cotizaciones ADD COLUMN IF NOT EXISTS fecha_cotizacion timestamptz;
ALTER TABLE IF EXISTS public.cotizaciones ADD COLUMN IF NOT EXISTS fecha_rechazo timestamptz;
ALTER TABLE IF EXISTS public.cotizaciones ADD COLUMN IF NOT EXISTS fecha_vencimiento timestamptz;
ALTER TABLE IF EXISTS public.cotizaciones ADD COLUMN IF NOT EXISTS motivo_rechazo text;
ALTER TABLE IF EXISTS public.cotizaciones ADD COLUMN IF NOT EXISTS numero integer;
ALTER TABLE IF EXISTS public.cotizaciones ADD COLUMN IF NOT EXISTS observaciones_aprobacion text;
ALTER TABLE IF EXISTS public.cotizaciones ADD COLUMN IF NOT EXISTS probabilidad text;
ALTER TABLE IF EXISTS public.cotizaciones ADD COLUMN IF NOT EXISTS rechazado_por text;
ALTER TABLE IF EXISTS public.cotizaciones ADD COLUMN IF NOT EXISTS tipo_documento text;
ALTER TABLE IF EXISTS public.cotizaciones ADD COLUMN IF NOT EXISTS total numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.cotizaciones ADD COLUMN IF NOT EXISTS vendedor text;

-- Tabla: cotizaciones_compra
ALTER TABLE IF EXISTS public.cotizaciones_compra ADD COLUMN IF NOT EXISTS cotizacion_id uuid;
ALTER TABLE IF EXISTS public.cotizaciones_compra ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE IF EXISTS public.cotizaciones_compra ADD COLUMN IF NOT EXISTS fecha_cotizacion timestamptz;
ALTER TABLE IF EXISTS public.cotizaciones_compra ADD COLUMN IF NOT EXISTS fecha_vencimiento timestamptz;
ALTER TABLE IF EXISTS public.cotizaciones_compra ADD COLUMN IF NOT EXISTS numero integer;
ALTER TABLE IF EXISTS public.cotizaciones_compra ADD COLUMN IF NOT EXISTS observaciones text;
ALTER TABLE IF EXISTS public.cotizaciones_compra ADD COLUMN IF NOT EXISTS orden_compra_id uuid;
ALTER TABLE IF EXISTS public.cotizaciones_compra ADD COLUMN IF NOT EXISTS proveedor_id uuid;
ALTER TABLE IF EXISTS public.cotizaciones_compra ADD COLUMN IF NOT EXISTS validez_dias integer;

-- Tabla: cpe
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS activo boolean DEFAULT false;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS cpe_id uuid;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS direccion_receptor text;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS documento_id uuid;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS documento_receptor text;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS estado_integridad text;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS estado_sunat text;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS fecha_emision timestamptz;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS fecha_envio timestamptz;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS items text;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS moneda text;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS numero integer;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS numero_comprobante integer;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS pais text;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS pdf_generado_en text;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS razon_social_emisor text;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS razon_social_receptor text;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS retry_count integer;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS ruc text;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS ruc_emisor text;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS serie text;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS tipo_documento text;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS tipo_documento_receptor text;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS total numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS total_gravadas numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS total_igv numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS total_venta numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS xml_firmado text;

-- Tabla: cuentas_bancarias
ALTER TABLE IF EXISTS public.cuentas_bancarias ADD COLUMN IF NOT EXISTS activa text;
ALTER TABLE IF EXISTS public.cuentas_bancarias ADD COLUMN IF NOT EXISTS activo boolean DEFAULT false;
ALTER TABLE IF EXISTS public.cuentas_bancarias ADD COLUMN IF NOT EXISTS banco text;
ALTER TABLE IF EXISTS public.cuentas_bancarias ADD COLUMN IF NOT EXISTS cuenta_bancaria_id uuid;
ALTER TABLE IF EXISTS public.cuentas_bancarias ADD COLUMN IF NOT EXISTS moneda text;
ALTER TABLE IF EXISTS public.cuentas_bancarias ADD COLUMN IF NOT EXISTS numero_cuenta integer;
ALTER TABLE IF EXISTS public.cuentas_bancarias ADD COLUMN IF NOT EXISTS pais text;
ALTER TABLE IF EXISTS public.cuentas_bancarias ADD COLUMN IF NOT EXISTS permite_sobregiro boolean DEFAULT false;
ALTER TABLE IF EXISTS public.cuentas_bancarias ADD COLUMN IF NOT EXISTS ruc text;
ALTER TABLE IF EXISTS public.cuentas_bancarias ADD COLUMN IF NOT EXISTS saldo numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.cuentas_bancarias ADD COLUMN IF NOT EXISTS saldo_actual numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.cuentas_bancarias ADD COLUMN IF NOT EXISTS saldo_contable numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.cuentas_bancarias ADD COLUMN IF NOT EXISTS tipo_cuenta text;

-- Tabla: cuentas_por_cobrar
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS activo boolean DEFAULT false;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS anticipo_total numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS cliente_id uuid;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS detraccion_total numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS dias_mora integer;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS documento_id uuid;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS fecha_emision timestamptz;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS fecha_pago timestamptz;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS fecha_vencimiento timestamptz;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS moneda text;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS monto_pendiente numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS monto_total numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS motivo text;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS numero integer;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS observaciones text;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS pais text;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS pedido_id uuid;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS percepcion_total numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS retencion_total numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS revertida text;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS ruc text;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS saldo numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS saldo_pendiente numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS serie text;

-- Tabla: cuentas_por_pagar
ALTER TABLE IF EXISTS public.cuentas_por_pagar ADD COLUMN IF NOT EXISTS anulada text;
ALTER TABLE IF EXISTS public.cuentas_por_pagar ADD COLUMN IF NOT EXISTS anulado_at timestamptz;
ALTER TABLE IF EXISTS public.cuentas_por_pagar ADD COLUMN IF NOT EXISTS anulado_by text;
ALTER TABLE IF EXISTS public.cuentas_por_pagar ADD COLUMN IF NOT EXISTS fecha_emision timestamptz;
ALTER TABLE IF EXISTS public.cuentas_por_pagar ADD COLUMN IF NOT EXISTS fecha_vencimiento timestamptz;
ALTER TABLE IF EXISTS public.cuentas_por_pagar ADD COLUMN IF NOT EXISTS igv numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.cuentas_por_pagar ADD COLUMN IF NOT EXISTS moneda text;
ALTER TABLE IF EXISTS public.cuentas_por_pagar ADD COLUMN IF NOT EXISTS numero integer;
ALTER TABLE IF EXISTS public.cuentas_por_pagar ADD COLUMN IF NOT EXISTS numero_documento integer;
ALTER TABLE IF EXISTS public.cuentas_por_pagar ADD COLUMN IF NOT EXISTS observaciones text;
ALTER TABLE IF EXISTS public.cuentas_por_pagar ADD COLUMN IF NOT EXISTS proveedor_id uuid;
ALTER TABLE IF EXISTS public.cuentas_por_pagar ADD COLUMN IF NOT EXISTS referencia_id uuid;
ALTER TABLE IF EXISTS public.cuentas_por_pagar ADD COLUMN IF NOT EXISTS referencia_tipo text;
ALTER TABLE IF EXISTS public.cuentas_por_pagar ADD COLUMN IF NOT EXISTS saldo numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.cuentas_por_pagar ADD COLUMN IF NOT EXISTS saldo_pendiente numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.cuentas_por_pagar ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.cuentas_por_pagar ADD COLUMN IF NOT EXISTS total numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.cuentas_por_pagar ADD COLUMN IF NOT EXISTS ultimo_pago text;

-- Tabla: cxc_pagos
ALTER TABLE IF EXISTS public.cxc_pagos ADD COLUMN IF NOT EXISTS cuenta_id uuid;
ALTER TABLE IF EXISTS public.cxc_pagos ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE IF EXISTS public.cxc_pagos ADD COLUMN IF NOT EXISTS referencia text;
ALTER TABLE IF EXISTS public.cxc_pagos ADD COLUMN IF NOT EXISTS saldo numeric(14,2) DEFAULT 0;

-- Tabla: detalle_asientos
ALTER TABLE IF EXISTS public.detalle_asientos ADD COLUMN IF NOT EXISTS asiento_id uuid;
ALTER TABLE IF EXISTS public.detalle_asientos ADD COLUMN IF NOT EXISTS centro_costo_id uuid;
ALTER TABLE IF EXISTS public.detalle_asientos ADD COLUMN IF NOT EXISTS cuenta_id uuid;
ALTER TABLE IF EXISTS public.detalle_asientos ADD COLUMN IF NOT EXISTS debe numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.detalle_asientos ADD COLUMN IF NOT EXISTS fecha timestamptz;
ALTER TABLE IF EXISTS public.detalle_asientos ADD COLUMN IF NOT EXISTS haber numeric(14,2) DEFAULT 0;

-- Tabla: detalle_ventas_pos
ALTER TABLE IF EXISTS public.detalle_ventas_pos ADD COLUMN IF NOT EXISTS producto_id uuid;
ALTER TABLE IF EXISTS public.detalle_ventas_pos ADD COLUMN IF NOT EXISTS venta_id uuid;

-- Tabla: devoluciones_proveedor
ALTER TABLE IF EXISTS public.devoluciones_proveedor ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE IF EXISTS public.devoluciones_proveedor ADD COLUMN IF NOT EXISTS fecha_devolucion timestamptz;
ALTER TABLE IF EXISTS public.devoluciones_proveedor ADD COLUMN IF NOT EXISTS motivo text;
ALTER TABLE IF EXISTS public.devoluciones_proveedor ADD COLUMN IF NOT EXISTS numero integer;
ALTER TABLE IF EXISTS public.devoluciones_proveedor ADD COLUMN IF NOT EXISTS orden_id uuid;
ALTER TABLE IF EXISTS public.devoluciones_proveedor ADD COLUMN IF NOT EXISTS proveedor_id uuid;
ALTER TABLE IF EXISTS public.devoluciones_proveedor ADD COLUMN IF NOT EXISTS recepcion_id uuid;

-- Tabla: documento_series
ALTER TABLE IF EXISTS public.documento_series ADD COLUMN IF NOT EXISTS activo boolean DEFAULT false;
ALTER TABLE IF EXISTS public.documento_series ADD COLUMN IF NOT EXISTS correlativo_actual integer;
ALTER TABLE IF EXISTS public.documento_series ADD COLUMN IF NOT EXISTS correlativo_maximo integer;
ALTER TABLE IF EXISTS public.documento_series ADD COLUMN IF NOT EXISTS onconflict text;
ALTER TABLE IF EXISTS public.documento_series ADD COLUMN IF NOT EXISTS serie text;
ALTER TABLE IF EXISTS public.documento_series ADD COLUMN IF NOT EXISTS tipo_documento text;

-- Tabla: documentos
ALTER TABLE IF EXISTS public.documentos ADD COLUMN IF NOT EXISTS cdr_content jsonb;
ALTER TABLE IF EXISTS public.documentos ADD COLUMN IF NOT EXISTS codigo_hash text;
ALTER TABLE IF EXISTS public.documentos ADD COLUMN IF NOT EXISTS documento_id uuid;
ALTER TABLE IF EXISTS public.documentos ADD COLUMN IF NOT EXISTS error_sunat text;
ALTER TABLE IF EXISTS public.documentos ADD COLUMN IF NOT EXISTS estado_sunat text;
ALTER TABLE IF EXISTS public.documentos ADD COLUMN IF NOT EXISTS fecha_emision timestamptz;
ALTER TABLE IF EXISTS public.documentos ADD COLUMN IF NOT EXISTS motivo_anulacion text;
ALTER TABLE IF EXISTS public.documentos ADD COLUMN IF NOT EXISTS numero integer;
ALTER TABLE IF EXISTS public.documentos ADD COLUMN IF NOT EXISTS serie text;
ALTER TABLE IF EXISTS public.documentos ADD COLUMN IF NOT EXISTS tipo_documento text;
ALTER TABLE IF EXISTS public.documentos ADD COLUMN IF NOT EXISTS xml_content jsonb;

-- Tabla: empleado_planilla
ALTER TABLE IF EXISTS public.empleado_planilla ADD COLUMN IF NOT EXISTS dias_trabajados integer;
ALTER TABLE IF EXISTS public.empleado_planilla ADD COLUMN IF NOT EXISTS estado_pago text;
ALTER TABLE IF EXISTS public.empleado_planilla ADD COLUMN IF NOT EXISTS fecha_pago timestamptz;
ALTER TABLE IF EXISTS public.empleado_planilla ADD COLUMN IF NOT EXISTS id_empleado text;
ALTER TABLE IF EXISTS public.empleado_planilla ADD COLUMN IF NOT EXISTS id_planilla text;
ALTER TABLE IF EXISTS public.empleado_planilla ADD COLUMN IF NOT EXISTS metodo_pago text;
ALTER TABLE IF EXISTS public.empleado_planilla ADD COLUMN IF NOT EXISTS neto_pagar text;
ALTER TABLE IF EXISTS public.empleado_planilla ADD COLUMN IF NOT EXISTS numero_operacion integer;
ALTER TABLE IF EXISTS public.empleado_planilla ADD COLUMN IF NOT EXISTS observaciones_pago text;
ALTER TABLE IF EXISTS public.empleado_planilla ADD COLUMN IF NOT EXISTS total_aportes numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.empleado_planilla ADD COLUMN IF NOT EXISTS total_descuentos numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.empleado_planilla ADD COLUMN IF NOT EXISTS total_ingresos numeric(14,2) DEFAULT 0;

-- Tabla: empleado_planilla_conceptos
ALTER TABLE IF EXISTS public.empleado_planilla_conceptos ADD COLUMN IF NOT EXISTS id_concepto text;
ALTER TABLE IF EXISTS public.empleado_planilla_conceptos ADD COLUMN IF NOT EXISTS id_empleado_planilla text;
ALTER TABLE IF EXISTS public.empleado_planilla_conceptos ADD COLUMN IF NOT EXISTS monto numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.empleado_planilla_conceptos ADD COLUMN IF NOT EXISTS observaciones text;

-- Tabla: empleados
ALTER TABLE IF EXISTS public.empleados ADD COLUMN IF NOT EXISTS activo boolean DEFAULT false;
ALTER TABLE IF EXISTS public.empleados ADD COLUMN IF NOT EXISTS apellidos text;
ALTER TABLE IF EXISTS public.empleados ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE IF EXISTS public.empleados ADD COLUMN IF NOT EXISTS empleado_id uuid;
ALTER TABLE IF EXISTS public.empleados ADD COLUMN IF NOT EXISTS fecha timestamptz;
ALTER TABLE IF EXISTS public.empleados ADD COLUMN IF NOT EXISTS fecha_ingreso timestamptz;
ALTER TABLE IF EXISTS public.empleados ADD COLUMN IF NOT EXISTS fecha_nacimiento timestamptz;
ALTER TABLE IF EXISTS public.empleados ADD COLUMN IF NOT EXISTS id_departamento text;
ALTER TABLE IF EXISTS public.empleados ADD COLUMN IF NOT EXISTS id_empleado text;
ALTER TABLE IF EXISTS public.empleados ADD COLUMN IF NOT EXISTS nombres text;
ALTER TABLE IF EXISTS public.empleados ADD COLUMN IF NOT EXISTS numero_documento integer;
ALTER TABLE IF EXISTS public.empleados ADD COLUMN IF NOT EXISTS pais text;
ALTER TABLE IF EXISTS public.empleados ADD COLUMN IF NOT EXISTS puesto text;
ALTER TABLE IF EXISTS public.empleados ADD COLUMN IF NOT EXISTS ruc text;
ALTER TABLE IF EXISTS public.empleados ADD COLUMN IF NOT EXISTS telefono text;
ALTER TABLE IF EXISTS public.empleados ADD COLUMN IF NOT EXISTS tipo_documento text;

-- Tabla: gre
ALTER TABLE IF EXISTS public.gre ADD COLUMN IF NOT EXISTS fecha_emision timestamptz;
ALTER TABLE IF EXISTS public.gre ADD COLUMN IF NOT EXISTS numero integer;

-- Tabla: gre_guias
ALTER TABLE IF EXISTS public.gre_guias ADD COLUMN IF NOT EXISTS anio text;
ALTER TABLE IF EXISTS public.gre_guias ADD COLUMN IF NOT EXISTS base_imponible text;
ALTER TABLE IF EXISTS public.gre_guias ADD COLUMN IF NOT EXISTS cliente_nombre text;
ALTER TABLE IF EXISTS public.gre_guias ADD COLUMN IF NOT EXISTS cliente_ruc text;
ALTER TABLE IF EXISTS public.gre_guias ADD COLUMN IF NOT EXISTS correlativo integer;
ALTER TABLE IF EXISTS public.gre_guias ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE IF EXISTS public.gre_guias ADD COLUMN IF NOT EXISTS es_automatica boolean DEFAULT false;
ALTER TABLE IF EXISTS public.gre_guias ADD COLUMN IF NOT EXISTS fecha_emision timestamptz;
ALTER TABLE IF EXISTS public.gre_guias ADD COLUMN IF NOT EXISTS fecha_traslado timestamptz;
ALTER TABLE IF EXISTS public.gre_guias ADD COLUMN IF NOT EXISTS fecha_vencimiento timestamptz;
ALTER TABLE IF EXISTS public.gre_guias ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE IF EXISTS public.gre_guias ADD COLUMN IF NOT EXISTS igv numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.gre_guias ADD COLUMN IF NOT EXISTS mes text;
ALTER TABLE IF EXISTS public.gre_guias ADD COLUMN IF NOT EXISTS moneda text;
ALTER TABLE IF EXISTS public.gre_guias ADD COLUMN IF NOT EXISTS motivo_creacion text;
ALTER TABLE IF EXISTS public.gre_guias ADD COLUMN IF NOT EXISTS movimiento_inventario_id uuid;
ALTER TABLE IF EXISTS public.gre_guias ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;
ALTER TABLE IF EXISTS public.gre_guias ADD COLUMN IF NOT EXISTS numero integer;
ALTER TABLE IF EXISTS public.gre_guias ADD COLUMN IF NOT EXISTS numero_sunat integer;
ALTER TABLE IF EXISTS public.gre_guias ADD COLUMN IF NOT EXISTS peso_total numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.gre_guias ADD COLUMN IF NOT EXISTS retry_count integer;
ALTER TABLE IF EXISTS public.gre_guias ADD COLUMN IF NOT EXISTS serie text;
ALTER TABLE IF EXISTS public.gre_guias ADD COLUMN IF NOT EXISTS total numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.gre_guias ADD COLUMN IF NOT EXISTS venta_id uuid;

-- Tabla: movimientos_bancarios
ALTER TABLE IF EXISTS public.movimientos_bancarios ADD COLUMN IF NOT EXISTS activo boolean DEFAULT false;
ALTER TABLE IF EXISTS public.movimientos_bancarios ADD COLUMN IF NOT EXISTS conciliacion_id uuid;
ALTER TABLE IF EXISTS public.movimientos_bancarios ADD COLUMN IF NOT EXISTS conciliado boolean DEFAULT false;
ALTER TABLE IF EXISTS public.movimientos_bancarios ADD COLUMN IF NOT EXISTS cuenta_bancaria_id uuid;
ALTER TABLE IF EXISTS public.movimientos_bancarios ADD COLUMN IF NOT EXISTS cuenta_id uuid;
ALTER TABLE IF EXISTS public.movimientos_bancarios ADD COLUMN IF NOT EXISTS cxp_id uuid;
ALTER TABLE IF EXISTS public.movimientos_bancarios ADD COLUMN IF NOT EXISTS descripcion text;
ALTER TABLE IF EXISTS public.movimientos_bancarios ADD COLUMN IF NOT EXISTS diferencia numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.movimientos_bancarios ADD COLUMN IF NOT EXISTS diferencia_conciliacion numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.movimientos_bancarios ADD COLUMN IF NOT EXISTS es_extracto boolean DEFAULT false;
ALTER TABLE IF EXISTS public.movimientos_bancarios ADD COLUMN IF NOT EXISTS fecha timestamptz;
ALTER TABLE IF EXISTS public.movimientos_bancarios ADD COLUMN IF NOT EXISTS match_automatico text;
ALTER TABLE IF EXISTS public.movimientos_bancarios ADD COLUMN IF NOT EXISTS match_id uuid;
ALTER TABLE IF EXISTS public.movimientos_bancarios ADD COLUMN IF NOT EXISTS monto numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.movimientos_bancarios ADD COLUMN IF NOT EXISTS movimiento_relacionado_id uuid;
ALTER TABLE IF EXISTS public.movimientos_bancarios ADD COLUMN IF NOT EXISTS pais text;
ALTER TABLE IF EXISTS public.movimientos_bancarios ADD COLUMN IF NOT EXISTS razon_social text;
ALTER TABLE IF EXISTS public.movimientos_bancarios ADD COLUMN IF NOT EXISTS referencia text;
ALTER TABLE IF EXISTS public.movimientos_bancarios ADD COLUMN IF NOT EXISTS ruc text;
ALTER TABLE IF EXISTS public.movimientos_bancarios ADD COLUMN IF NOT EXISTS saldo numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.movimientos_bancarios ADD COLUMN IF NOT EXISTS saldo_banco numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.movimientos_bancarios ADD COLUMN IF NOT EXISTS tipo text;

-- Tabla: movimientos_caja
ALTER TABLE IF EXISTS public.movimientos_caja ADD COLUMN IF NOT EXISTS monto numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.movimientos_caja ADD COLUMN IF NOT EXISTS referencia_documento text;
ALTER TABLE IF EXISTS public.movimientos_caja ADD COLUMN IF NOT EXISTS referencia_tipo text;
ALTER TABLE IF EXISTS public.movimientos_caja ADD COLUMN IF NOT EXISTS secuencia text;
ALTER TABLE IF EXISTS public.movimientos_caja ADD COLUMN IF NOT EXISTS sesion_caja_id uuid;
ALTER TABLE IF EXISTS public.movimientos_caja ADD COLUMN IF NOT EXISTS tipo_movimiento text;

-- Tabla: movimientos_inventario
ALTER TABLE IF EXISTS public.movimientos_inventario ADD COLUMN IF NOT EXISTS activo boolean DEFAULT false;
ALTER TABLE IF EXISTS public.movimientos_inventario ADD COLUMN IF NOT EXISTS cantidad numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.movimientos_inventario ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE IF EXISTS public.movimientos_inventario ADD COLUMN IF NOT EXISTS motivo text;
ALTER TABLE IF EXISTS public.movimientos_inventario ADD COLUMN IF NOT EXISTS notas text;
ALTER TABLE IF EXISTS public.movimientos_inventario ADD COLUMN IF NOT EXISTS pais text;
ALTER TABLE IF EXISTS public.movimientos_inventario ADD COLUMN IF NOT EXISTS pedido_id uuid;
ALTER TABLE IF EXISTS public.movimientos_inventario ADD COLUMN IF NOT EXISTS producto_id uuid;
ALTER TABLE IF EXISTS public.movimientos_inventario ADD COLUMN IF NOT EXISTS referencia_id uuid;
ALTER TABLE IF EXISTS public.movimientos_inventario ADD COLUMN IF NOT EXISTS referencia_tipo text;
ALTER TABLE IF EXISTS public.movimientos_inventario ADD COLUMN IF NOT EXISTS ruc text;
ALTER TABLE IF EXISTS public.movimientos_inventario ADD COLUMN IF NOT EXISTS stock_actual text;
ALTER TABLE IF EXISTS public.movimientos_inventario ADD COLUMN IF NOT EXISTS stock_reservado text;
ALTER TABLE IF EXISTS public.movimientos_inventario ADD COLUMN IF NOT EXISTS tipo text;

-- Tabla: orden_compra_detalles
ALTER TABLE IF EXISTS public.orden_compra_detalles ADD COLUMN IF NOT EXISTS cantidad numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.orden_compra_detalles ADD COLUMN IF NOT EXISTS cantidad_recibida numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.orden_compra_detalles ADD COLUMN IF NOT EXISTS descripcion text;
ALTER TABLE IF EXISTS public.orden_compra_detalles ADD COLUMN IF NOT EXISTS fecha timestamptz;
ALTER TABLE IF EXISTS public.orden_compra_detalles ADD COLUMN IF NOT EXISTS fecha_recepcion timestamptz;
ALTER TABLE IF EXISTS public.orden_compra_detalles ADD COLUMN IF NOT EXISTS moneda text;
ALTER TABLE IF EXISTS public.orden_compra_detalles ADD COLUMN IF NOT EXISTS numero integer;
ALTER TABLE IF EXISTS public.orden_compra_detalles ADD COLUMN IF NOT EXISTS orden_id uuid;
ALTER TABLE IF EXISTS public.orden_compra_detalles ADD COLUMN IF NOT EXISTS precio_unitario numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.orden_compra_detalles ADD COLUMN IF NOT EXISTS producto_id uuid;
ALTER TABLE IF EXISTS public.orden_compra_detalles ADD COLUMN IF NOT EXISTS recepcion_id uuid;
ALTER TABLE IF EXISTS public.orden_compra_detalles ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0;

-- Tabla: ordenes_compra
ALTER TABLE IF EXISTS public.ordenes_compra ADD COLUMN IF NOT EXISTS activo boolean DEFAULT false;
ALTER TABLE IF EXISTS public.ordenes_compra ADD COLUMN IF NOT EXISTS fecha timestamptz;
ALTER TABLE IF EXISTS public.ordenes_compra ADD COLUMN IF NOT EXISTS fecha_entrega timestamptz;
ALTER TABLE IF EXISTS public.ordenes_compra ADD COLUMN IF NOT EXISTS fecha_orden timestamptz;
ALTER TABLE IF EXISTS public.ordenes_compra ADD COLUMN IF NOT EXISTS fecha_requerida timestamptz;
ALTER TABLE IF EXISTS public.ordenes_compra ADD COLUMN IF NOT EXISTS igv numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.ordenes_compra ADD COLUMN IF NOT EXISTS moneda text;
ALTER TABLE IF EXISTS public.ordenes_compra ADD COLUMN IF NOT EXISTS numero integer;
ALTER TABLE IF EXISTS public.ordenes_compra ADD COLUMN IF NOT EXISTS numero_orden integer;
ALTER TABLE IF EXISTS public.ordenes_compra ADD COLUMN IF NOT EXISTS observaciones text;
ALTER TABLE IF EXISTS public.ordenes_compra ADD COLUMN IF NOT EXISTS orden_id uuid;
ALTER TABLE IF EXISTS public.ordenes_compra ADD COLUMN IF NOT EXISTS pais text;
ALTER TABLE IF EXISTS public.ordenes_compra ADD COLUMN IF NOT EXISTS proveedor_id uuid;
ALTER TABLE IF EXISTS public.ordenes_compra ADD COLUMN IF NOT EXISTS ruc text;
ALTER TABLE IF EXISTS public.ordenes_compra ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.ordenes_compra ADD COLUMN IF NOT EXISTS total numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.ordenes_compra ADD COLUMN IF NOT EXISTS usuario_id uuid;

-- Tabla: pagos_empleados
ALTER TABLE IF EXISTS public.pagos_empleados ADD COLUMN IF NOT EXISTS descuentos numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.pagos_empleados ADD COLUMN IF NOT EXISTS empleado_id uuid;
ALTER TABLE IF EXISTS public.pagos_empleados ADD COLUMN IF NOT EXISTS fecha_pago timestamptz;
ALTER TABLE IF EXISTS public.pagos_empleados ADD COLUMN IF NOT EXISTS metodo_pago text;
ALTER TABLE IF EXISTS public.pagos_empleados ADD COLUMN IF NOT EXISTS monto_neto numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.pagos_empleados ADD COLUMN IF NOT EXISTS periodo text;
ALTER TABLE IF EXISTS public.pagos_empleados ADD COLUMN IF NOT EXISTS planilla_id uuid;
ALTER TABLE IF EXISTS public.pagos_empleados ADD COLUMN IF NOT EXISTS sueldo_bruto text;
ALTER TABLE IF EXISTS public.pagos_empleados ADD COLUMN IF NOT EXISTS usuario_id uuid;

-- Tabla: pedido_aprobaciones
ALTER TABLE IF EXISTS public.pedido_aprobaciones ADD COLUMN IF NOT EXISTS aprobado_en text;
ALTER TABLE IF EXISTS public.pedido_aprobaciones ADD COLUMN IF NOT EXISTS aprobado_por text;
ALTER TABLE IF EXISTS public.pedido_aprobaciones ADD COLUMN IF NOT EXISTS decision text;
ALTER TABLE IF EXISTS public.pedido_aprobaciones ADD COLUMN IF NOT EXISTS motivos text;
ALTER TABLE IF EXISTS public.pedido_aprobaciones ADD COLUMN IF NOT EXISTS pedido_id uuid;

-- Tabla: pedido_backorders
ALTER TABLE IF EXISTS public.pedido_backorders ADD COLUMN IF NOT EXISTS cantidad_pendiente numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.pedido_backorders ADD COLUMN IF NOT EXISTS detalle_id uuid;
ALTER TABLE IF EXISTS public.pedido_backorders ADD COLUMN IF NOT EXISTS observaciones text;
ALTER TABLE IF EXISTS public.pedido_backorders ADD COLUMN IF NOT EXISTS pedido_id uuid;
ALTER TABLE IF EXISTS public.pedido_backorders ADD COLUMN IF NOT EXISTS prioridad text;
ALTER TABLE IF EXISTS public.pedido_backorders ADD COLUMN IF NOT EXISTS proxima_fecha_compromiso text;
ALTER TABLE IF EXISTS public.pedido_backorders ADD COLUMN IF NOT EXISTS ultimo_compromiso_en text;

-- Tabla: pedidos_venta
ALTER TABLE IF EXISTS public.pedidos_venta ADD COLUMN IF NOT EXISTS aprobado_en text;
ALTER TABLE IF EXISTS public.pedidos_venta ADD COLUMN IF NOT EXISTS aprobado_por text;
ALTER TABLE IF EXISTS public.pedidos_venta ADD COLUMN IF NOT EXISTS cliente_id uuid;
ALTER TABLE IF EXISTS public.pedidos_venta ADD COLUMN IF NOT EXISTS estado_credito text;
ALTER TABLE IF EXISTS public.pedidos_venta ADD COLUMN IF NOT EXISTS factura_id uuid;
ALTER TABLE IF EXISTS public.pedidos_venta ADD COLUMN IF NOT EXISTS fecha timestamptz;
ALTER TABLE IF EXISTS public.pedidos_venta ADD COLUMN IF NOT EXISTS fecha_pedido timestamptz;
ALTER TABLE IF EXISTS public.pedidos_venta ADD COLUMN IF NOT EXISTS gre_id uuid;
ALTER TABLE IF EXISTS public.pedidos_venta ADD COLUMN IF NOT EXISTS igv numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.pedidos_venta ADD COLUMN IF NOT EXISTS moneda text;
ALTER TABLE IF EXISTS public.pedidos_venta ADD COLUMN IF NOT EXISTS motivo_requiere_aprobacion text;
ALTER TABLE IF EXISTS public.pedidos_venta ADD COLUMN IF NOT EXISTS notas text;
ALTER TABLE IF EXISTS public.pedidos_venta ADD COLUMN IF NOT EXISTS numero integer;
ALTER TABLE IF EXISTS public.pedidos_venta ADD COLUMN IF NOT EXISTS observaciones text;
ALTER TABLE IF EXISTS public.pedidos_venta ADD COLUMN IF NOT EXISTS pedido_id uuid;
ALTER TABLE IF EXISTS public.pedidos_venta ADD COLUMN IF NOT EXISTS requiere_aprobacion boolean DEFAULT false;
ALTER TABLE IF EXISTS public.pedidos_venta ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.pedidos_venta ADD COLUMN IF NOT EXISTS tipo_documento text;
ALTER TABLE IF EXISTS public.pedidos_venta ADD COLUMN IF NOT EXISTS total numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.pedidos_venta ADD COLUMN IF NOT EXISTS tracking_actualizado_en text;
ALTER TABLE IF EXISTS public.pedidos_venta ADD COLUMN IF NOT EXISTS tracking_estado text;
ALTER TABLE IF EXISTS public.pedidos_venta ADD COLUMN IF NOT EXISTS tracking_notas text;

-- Tabla: pedidos_venta_detalle
ALTER TABLE IF EXISTS public.pedidos_venta_detalle ADD COLUMN IF NOT EXISTS cantidad numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.pedidos_venta_detalle ADD COLUMN IF NOT EXISTS cantidad_despachada numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.pedidos_venta_detalle ADD COLUMN IF NOT EXISTS cantidad_facturada numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.pedidos_venta_detalle ADD COLUMN IF NOT EXISTS descripcion text;
ALTER TABLE IF EXISTS public.pedidos_venta_detalle ADD COLUMN IF NOT EXISTS estado_item text;
ALTER TABLE IF EXISTS public.pedidos_venta_detalle ADD COLUMN IF NOT EXISTS pedido_id uuid;
ALTER TABLE IF EXISTS public.pedidos_venta_detalle ADD COLUMN IF NOT EXISTS producto_id uuid;
ALTER TABLE IF EXISTS public.pedidos_venta_detalle ADD COLUMN IF NOT EXISTS referencia_id uuid;
ALTER TABLE IF EXISTS public.pedidos_venta_detalle ADD COLUMN IF NOT EXISTS referencia_tipo text;
ALTER TABLE IF EXISTS public.pedidos_venta_detalle ADD COLUMN IF NOT EXISTS tipo text;

-- Tabla: plan_cuentas
ALTER TABLE IF EXISTS public.plan_cuentas ADD COLUMN IF NOT EXISTS acepta_movimiento text;
ALTER TABLE IF EXISTS public.plan_cuentas ADD COLUMN IF NOT EXISTS activo boolean DEFAULT false;
ALTER TABLE IF EXISTS public.plan_cuentas ADD COLUMN IF NOT EXISTS centro_costo_id uuid;
ALTER TABLE IF EXISTS public.plan_cuentas ADD COLUMN IF NOT EXISTS cuenta_id uuid;
ALTER TABLE IF EXISTS public.plan_cuentas ADD COLUMN IF NOT EXISTS nivel integer;
ALTER TABLE IF EXISTS public.plan_cuentas ADD COLUMN IF NOT EXISTS tipo text;

-- Tabla: planillas
ALTER TABLE IF EXISTS public.planillas ADD COLUMN IF NOT EXISTS asientos_generados text;
ALTER TABLE IF EXISTS public.planillas ADD COLUMN IF NOT EXISTS estado_pago text;
ALTER TABLE IF EXISTS public.planillas ADD COLUMN IF NOT EXISTS fecha_asientos timestamptz;
ALTER TABLE IF EXISTS public.planillas ADD COLUMN IF NOT EXISTS fecha_pago timestamptz;
ALTER TABLE IF EXISTS public.planillas ADD COLUMN IF NOT EXISTS metodo_pago text;
ALTER TABLE IF EXISTS public.planillas ADD COLUMN IF NOT EXISTS periodo text;
ALTER TABLE IF EXISTS public.planillas ADD COLUMN IF NOT EXISTS total_aportes numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.planillas ADD COLUMN IF NOT EXISTS total_descuentos numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.planillas ADD COLUMN IF NOT EXISTS total_ingresos numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.planillas ADD COLUMN IF NOT EXISTS total_neto numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.planillas ADD COLUMN IF NOT EXISTS total_pagado numeric(14,2) DEFAULT 0;

-- Tabla: producto_existencias
ALTER TABLE IF EXISTS public.producto_existencias ADD COLUMN IF NOT EXISTS almacen_id uuid;
ALTER TABLE IF EXISTS public.producto_existencias ADD COLUMN IF NOT EXISTS producto_id uuid;
ALTER TABLE IF EXISTS public.producto_existencias ADD COLUMN IF NOT EXISTS stock_actual text;
ALTER TABLE IF EXISTS public.producto_existencias ADD COLUMN IF NOT EXISTS stock_danado text;
ALTER TABLE IF EXISTS public.producto_existencias ADD COLUMN IF NOT EXISTS stock_reservado text;

-- Tabla: productos
ALTER TABLE IF EXISTS public.productos ADD COLUMN IF NOT EXISTS activo boolean DEFAULT false;
ALTER TABLE IF EXISTS public.productos ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE IF EXISTS public.productos ADD COLUMN IF NOT EXISTS costo numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.productos ADD COLUMN IF NOT EXISTS pais text;
ALTER TABLE IF EXISTS public.productos ADD COLUMN IF NOT EXISTS precio numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.productos ADD COLUMN IF NOT EXISTS precio_compra numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.productos ADD COLUMN IF NOT EXISTS precio_venta numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.productos ADD COLUMN IF NOT EXISTS producto_id uuid;
ALTER TABLE IF EXISTS public.productos ADD COLUMN IF NOT EXISTS ruc text;
ALTER TABLE IF EXISTS public.productos ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE IF EXISTS public.productos ADD COLUMN IF NOT EXISTS stock text;
ALTER TABLE IF EXISTS public.productos ADD COLUMN IF NOT EXISTS stock_actual text;
ALTER TABLE IF EXISTS public.productos ADD COLUMN IF NOT EXISTS stock_minimo text;
ALTER TABLE IF EXISTS public.productos ADD COLUMN IF NOT EXISTS stock_reservado text;
ALTER TABLE IF EXISTS public.productos ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE IF EXISTS public.productos ADD COLUMN IF NOT EXISTS unidad_medida text;

-- Tabla: proveedores
ALTER TABLE IF EXISTS public.proveedores ADD COLUMN IF NOT EXISTS activo boolean DEFAULT false;
ALTER TABLE IF EXISTS public.proveedores ADD COLUMN IF NOT EXISTS condiciones_pago text;
ALTER TABLE IF EXISTS public.proveedores ADD COLUMN IF NOT EXISTS dias_credito integer;
ALTER TABLE IF EXISTS public.proveedores ADD COLUMN IF NOT EXISTS direccion text;
ALTER TABLE IF EXISTS public.proveedores ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE IF EXISTS public.proveedores ADD COLUMN IF NOT EXISTS limite_credito numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.proveedores ADD COLUMN IF NOT EXISTS numero_documento integer;
ALTER TABLE IF EXISTS public.proveedores ADD COLUMN IF NOT EXISTS orden_id uuid;
ALTER TABLE IF EXISTS public.proveedores ADD COLUMN IF NOT EXISTS pais text;
ALTER TABLE IF EXISTS public.proveedores ADD COLUMN IF NOT EXISTS proveedor_id uuid;
ALTER TABLE IF EXISTS public.proveedores ADD COLUMN IF NOT EXISTS razon_social text;
ALTER TABLE IF EXISTS public.proveedores ADD COLUMN IF NOT EXISTS ruc text;
ALTER TABLE IF EXISTS public.proveedores ADD COLUMN IF NOT EXISTS telefono text;

-- Tabla: recepcion_items
ALTER TABLE IF EXISTS public.recepcion_items ADD COLUMN IF NOT EXISTS almacen_id uuid;
ALTER TABLE IF EXISTS public.recepcion_items ADD COLUMN IF NOT EXISTS calidad text;
ALTER TABLE IF EXISTS public.recepcion_items ADD COLUMN IF NOT EXISTS cantidad_recibida numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.recepcion_items ADD COLUMN IF NOT EXISTS detalle_id uuid;
ALTER TABLE IF EXISTS public.recepcion_items ADD COLUMN IF NOT EXISTS producto_id uuid;
ALTER TABLE IF EXISTS public.recepcion_items ADD COLUMN IF NOT EXISTS recepcion_id uuid;

-- Tabla: recepciones
ALTER TABLE IF EXISTS public.recepciones ADD COLUMN IF NOT EXISTS activo boolean DEFAULT false;
ALTER TABLE IF EXISTS public.recepciones ADD COLUMN IF NOT EXISTS cerrado_at timestamptz;
ALTER TABLE IF EXISTS public.recepciones ADD COLUMN IF NOT EXISTS cerrado_por text;
ALTER TABLE IF EXISTS public.recepciones ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE IF EXISTS public.recepciones ADD COLUMN IF NOT EXISTS fecha_recepcion timestamptz;
ALTER TABLE IF EXISTS public.recepciones ADD COLUMN IF NOT EXISTS numero integer;
ALTER TABLE IF EXISTS public.recepciones ADD COLUMN IF NOT EXISTS observaciones text;
ALTER TABLE IF EXISTS public.recepciones ADD COLUMN IF NOT EXISTS orden_id uuid;
ALTER TABLE IF EXISTS public.recepciones ADD COLUMN IF NOT EXISTS pais text;
ALTER TABLE IF EXISTS public.recepciones ADD COLUMN IF NOT EXISTS ruc text;

-- Tabla: retiros_caja
ALTER TABLE IF EXISTS public.retiros_caja ADD COLUMN IF NOT EXISTS banco_destino text;
ALTER TABLE IF EXISTS public.retiros_caja ADD COLUMN IF NOT EXISTS estado_conciliacion text;
ALTER TABLE IF EXISTS public.retiros_caja ADD COLUMN IF NOT EXISTS fecha_conciliacion timestamptz;
ALTER TABLE IF EXISTS public.retiros_caja ADD COLUMN IF NOT EXISTS foto_comprobante text;
ALTER TABLE IF EXISTS public.retiros_caja ADD COLUMN IF NOT EXISTS monto numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.retiros_caja ADD COLUMN IF NOT EXISTS motivo text;
ALTER TABLE IF EXISTS public.retiros_caja ADD COLUMN IF NOT EXISTS motivo_detalle text;
ALTER TABLE IF EXISTS public.retiros_caja ADD COLUMN IF NOT EXISTS nrechazado text;
ALTER TABLE IF EXISTS public.retiros_caja ADD COLUMN IF NOT EXISTS numero_operacion integer;
ALTER TABLE IF EXISTS public.retiros_caja ADD COLUMN IF NOT EXISTS sesion_caja_id uuid;

-- Tabla: sesiones_caja
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS activo boolean DEFAULT false;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS administrativo text;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS caja_id uuid;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS cajero_id uuid;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS cerrado_por text;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS cierre_administrativo boolean DEFAULT false;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS congelada boolean DEFAULT false;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS diferencia numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS dispositivo text;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS fecha_apertura timestamptz;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS fecha_cierre timestamptz;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS hash_integridad text;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS hora_apertura text;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS hora_cierre text;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS monto_contado numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS monto_esperado numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS monto_inicial numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS monto_inicio numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS notas text;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS notas_cierre text;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS pais text;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS razon_cierre_administrativo text;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS ruc text;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS sesion_caja_id uuid;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS total_efectivo numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS total_tarjeta numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS usuario_cierre text;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS usuario_id uuid;

-- Tabla: sire_files
ALTER TABLE IF EXISTS public.sire_files ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE IF EXISTS public.sire_files ADD COLUMN IF NOT EXISTS correlacion_id uuid;
ALTER TABLE IF EXISTS public.sire_files ADD COLUMN IF NOT EXISTS correlacion_tipo text;
ALTER TABLE IF EXISTS public.sire_files ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE IF EXISTS public.sire_files ADD COLUMN IF NOT EXISTS fecha_cotizacion timestamptz;
ALTER TABLE IF EXISTS public.sire_files ADD COLUMN IF NOT EXISTS file_path text;
ALTER TABLE IF EXISTS public.sire_files ADD COLUMN IF NOT EXISTS file_size text;
ALTER TABLE IF EXISTS public.sire_files ADD COLUMN IF NOT EXISTS filename text;
ALTER TABLE IF EXISTS public.sire_files ADD COLUMN IF NOT EXISTS operacion text;
ALTER TABLE IF EXISTS public.sire_files ADD COLUMN IF NOT EXISTS periodo text;
ALTER TABLE IF EXISTS public.sire_files ADD COLUMN IF NOT EXISTS request_summary text;
ALTER TABLE IF EXISTS public.sire_files ADD COLUMN IF NOT EXISTS response_summary text;
ALTER TABLE IF EXISTS public.sire_files ADD COLUMN IF NOT EXISTS servicio text;
ALTER TABLE IF EXISTS public.sire_files ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE IF EXISTS public.sire_files ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE IF EXISTS public.sire_files ADD COLUMN IF NOT EXISTS total_registros numeric(14,2) DEFAULT 0;

-- Tabla: stock_movimientos
ALTER TABLE IF EXISTS public.stock_movimientos ADD COLUMN IF NOT EXISTS activo boolean DEFAULT false;
ALTER TABLE IF EXISTS public.stock_movimientos ADD COLUMN IF NOT EXISTS cantidad numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.stock_movimientos ADD COLUMN IF NOT EXISTS motivo text;
ALTER TABLE IF EXISTS public.stock_movimientos ADD COLUMN IF NOT EXISTS producto_id uuid;
ALTER TABLE IF EXISTS public.stock_movimientos ADD COLUMN IF NOT EXISTS referencia text;
ALTER TABLE IF EXISTS public.stock_movimientos ADD COLUMN IF NOT EXISTS tenant text;
ALTER TABLE IF EXISTS public.stock_movimientos ADD COLUMN IF NOT EXISTS tipo_movimiento text;
ALTER TABLE IF EXISTS public.stock_movimientos ADD COLUMN IF NOT EXISTS usuario_id uuid;

-- Tabla: ventas_pos
ALTER TABLE IF EXISTS public.ventas_pos ADD COLUMN IF NOT EXISTS activo boolean DEFAULT false;
ALTER TABLE IF EXISTS public.ventas_pos ADD COLUMN IF NOT EXISTS cliente_documento text;
ALTER TABLE IF EXISTS public.ventas_pos ADD COLUMN IF NOT EXISTS cliente_nombre text;
ALTER TABLE IF EXISTS public.ventas_pos ADD COLUMN IF NOT EXISTS cpe_data jsonb;
ALTER TABLE IF EXISTS public.ventas_pos ADD COLUMN IF NOT EXISTS cpe_id uuid;
ALTER TABLE IF EXISTS public.ventas_pos ADD COLUMN IF NOT EXISTS cpe_pendiente boolean DEFAULT false;
ALTER TABLE IF EXISTS public.ventas_pos ADD COLUMN IF NOT EXISTS error_facturacion text;
ALTER TABLE IF EXISTS public.ventas_pos ADD COLUMN IF NOT EXISTS fecha timestamptz;
ALTER TABLE IF EXISTS public.ventas_pos ADD COLUMN IF NOT EXISTS fecha_orden timestamptz;
ALTER TABLE IF EXISTS public.ventas_pos ADD COLUMN IF NOT EXISTS impuestos text;
ALTER TABLE IF EXISTS public.ventas_pos ADD COLUMN IF NOT EXISTS intentos_facturacion integer;
ALTER TABLE IF EXISTS public.ventas_pos ADD COLUMN IF NOT EXISTS metodo_pago text;
ALTER TABLE IF EXISTS public.ventas_pos ADD COLUMN IF NOT EXISTS numero_ticket integer;
ALTER TABLE IF EXISTS public.ventas_pos ADD COLUMN IF NOT EXISTS numero_venta integer;
ALTER TABLE IF EXISTS public.ventas_pos ADD COLUMN IF NOT EXISTS pais text;
ALTER TABLE IF EXISTS public.ventas_pos ADD COLUMN IF NOT EXISTS ruc text;
ALTER TABLE IF EXISTS public.ventas_pos ADD COLUMN IF NOT EXISTS sesion_caja_id uuid;
ALTER TABLE IF EXISTS public.ventas_pos ADD COLUMN IF NOT EXISTS stock text;
ALTER TABLE IF EXISTS public.ventas_pos ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.ventas_pos ADD COLUMN IF NOT EXISTS total numeric(14,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.ventas_pos ADD COLUMN IF NOT EXISTS ultimo_intento_facturacion integer;

-- Tabla: ventas_pos_pagos
ALTER TABLE IF EXISTS public.ventas_pos_pagos ADD COLUMN IF NOT EXISTS metodo_pago_codigo text;
ALTER TABLE IF EXISTS public.ventas_pos_pagos ADD COLUMN IF NOT EXISTS metodo_pago_tipo text;
ALTER TABLE IF EXISTS public.ventas_pos_pagos ADD COLUMN IF NOT EXISTS monto numeric(14,2) DEFAULT 0;

COMMIT;
