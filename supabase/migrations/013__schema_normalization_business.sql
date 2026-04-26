-- ============================================================================
-- 013__schema_normalization_business.sql
-- Normalizacion de tablas de negocio para RPC transaccionales.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Documentos / CPE / series
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.documento_series
  ADD COLUMN IF NOT EXISTS tipo_documento text,
  ADD COLUMN IF NOT EXISTS serie text,
  ADD COLUMN IF NOT EXISTS correlativo_actual integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS correlativo_maximo integer DEFAULT 99999999,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.documento_series
  ALTER COLUMN correlativo_actual TYPE integer USING app.to_int_or_zero(correlativo_actual::text),
  ALTER COLUMN correlativo_maximo TYPE integer USING app.to_int_or_zero(correlativo_maximo::text);

CREATE UNIQUE INDEX IF NOT EXISTS ux_documento_series_tenant_tipo_serie
ON public.documento_series (tenant_id, tipo_documento, serie);

ALTER TABLE IF EXISTS public.documentos
  ADD COLUMN IF NOT EXISTS tipo_documento text,
  ADD COLUMN IF NOT EXISTS serie text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS fecha_emision date,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento date,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS tipo_cambio numeric(14,6) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impuesto_igv numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS emisor_ruc text,
  ADD COLUMN IF NOT EXISTS emisor_razon_social text,
  ADD COLUMN IF NOT EXISTS emisor_direccion text,
  ADD COLUMN IF NOT EXISTS receptor_documento text,
  ADD COLUMN IF NOT EXISTS receptor_nombre text,
  ADD COLUMN IF NOT EXISTS receptor_direccion text,
  ADD COLUMN IF NOT EXISTS receptor_tipo_doc text,
  ADD COLUMN IF NOT EXISTS observaciones text,
  ADD COLUMN IF NOT EXISTS motivo_anulacion text,
  ADD COLUMN IF NOT EXISTS error_sunat text,
  ADD COLUMN IF NOT EXISTS xml_content text,
  ADD COLUMN IF NOT EXISTS cdr_content text,
  ADD COLUMN IF NOT EXISTS codigo_hash text,
  ADD COLUMN IF NOT EXISTS estado_sunat text;

ALTER TABLE IF EXISTS public.documentos
  ALTER COLUMN subtotal TYPE numeric(14,2) USING app.to_numeric_or_zero(subtotal::text),
  ALTER COLUMN impuesto_igv TYPE numeric(14,2) USING app.to_numeric_or_zero(impuesto_igv::text),
  ALTER COLUMN total TYPE numeric(14,2) USING app.to_numeric_or_zero(total::text),
  ALTER COLUMN tipo_cambio TYPE numeric(14,6) USING app.to_numeric_or_zero(tipo_cambio::text);

CREATE INDEX IF NOT EXISTS idx_documentos_tenant_fecha
ON public.documentos (tenant_id, fecha_emision DESC);

ALTER TABLE IF EXISTS public.cpe
  ADD COLUMN IF NOT EXISTS documento_id uuid,
  ADD COLUMN IF NOT EXISTS tipo_documento text,
  ADD COLUMN IF NOT EXISTS serie text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento date,
  ADD COLUMN IF NOT EXISTS sunat_status text,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS total_gravadas numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_igv numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_venta numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS direccion_emisor text;

ALTER TABLE IF EXISTS public.cpe
  ALTER COLUMN total TYPE numeric(14,2) USING app.to_numeric_or_zero(total::text),
  ALTER COLUMN total_gravadas TYPE numeric(14,2) USING app.to_numeric_or_zero(total_gravadas::text),
  ALTER COLUMN total_igv TYPE numeric(14,2) USING app.to_numeric_or_zero(total_igv::text),
  ALTER COLUMN total_venta TYPE numeric(14,2) USING app.to_numeric_or_zero(total_venta::text),
  ALTER COLUMN numero TYPE text USING NULLIF(numero::text, '');

CREATE INDEX IF NOT EXISTS idx_cpe_tenant_serie_numero
ON public.cpe (tenant_id, serie, numero);

-- ----------------------------------------------------------------------------
-- Comunicacion baja / resumen diario
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.comunicaciones_baja
  ADD COLUMN IF NOT EXISTS numero_comunicacion text,
  ADD COLUMN IF NOT EXISTS fecha_generacion date,
  ADD COLUMN IF NOT EXISTS fecha_comunicacion date,
  ADD COLUMN IF NOT EXISTS comprobantes_ids uuid[],
  ADD COLUMN IF NOT EXISTS cantidad_comprobantes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ticket_sunat text,
  ADD COLUMN IF NOT EXISTS codigo_respuesta text,
  ADD COLUMN IF NOT EXISTS descripcion_respuesta text,
  ADD COLUMN IF NOT EXISTS fecha_envio timestamptz,
  ADD COLUMN IF NOT EXISTS fecha_respuesta timestamptz,
  ADD COLUMN IF NOT EXISTS xml_generado text,
  ADD COLUMN IF NOT EXISTS xml_firmado text,
  ADD COLUMN IF NOT EXISTS hash_xml text,
  ADD COLUMN IF NOT EXISTS cdr_sunat text,
  ADD COLUMN IF NOT EXISTS generado_por uuid,
  ADD COLUMN IF NOT EXISTS enviado_por uuid;

ALTER TABLE IF EXISTS public.comunicaciones_baja
  ALTER COLUMN cantidad_comprobantes TYPE integer USING app.to_int_or_zero(cantidad_comprobantes::text);

ALTER TABLE IF EXISTS public.resumenes_diarios
  ADD COLUMN IF NOT EXISTS numero_resumen text,
  ADD COLUMN IF NOT EXISTS fecha_generacion date,
  ADD COLUMN IF NOT EXISTS fecha_referencia date,
  ADD COLUMN IF NOT EXISTS comprobantes_ids uuid[],
  ADD COLUMN IF NOT EXISTS cantidad_comprobantes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_gravadas numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_exoneradas numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_inafectas numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_igv numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_general numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ticket_sunat text,
  ADD COLUMN IF NOT EXISTS codigo_respuesta text,
  ADD COLUMN IF NOT EXISTS descripcion_respuesta text,
  ADD COLUMN IF NOT EXISTS fecha_envio timestamptz,
  ADD COLUMN IF NOT EXISTS fecha_respuesta timestamptz,
  ADD COLUMN IF NOT EXISTS xml_generado text,
  ADD COLUMN IF NOT EXISTS xml_firmado text,
  ADD COLUMN IF NOT EXISTS hash_xml text,
  ADD COLUMN IF NOT EXISTS cdr_sunat text,
  ADD COLUMN IF NOT EXISTS generado_por uuid,
  ADD COLUMN IF NOT EXISTS enviado_por uuid;

ALTER TABLE IF EXISTS public.resumenes_diarios
  ALTER COLUMN cantidad_comprobantes TYPE integer USING app.to_int_or_zero(cantidad_comprobantes::text),
  ALTER COLUMN total_gravadas TYPE numeric(14,2) USING app.to_numeric_or_zero(total_gravadas::text),
  ALTER COLUMN total_exoneradas TYPE numeric(14,2) USING app.to_numeric_or_zero(total_exoneradas::text),
  ALTER COLUMN total_inafectas TYPE numeric(14,2) USING app.to_numeric_or_zero(total_inafectas::text),
  ALTER COLUMN total_igv TYPE numeric(14,2) USING app.to_numeric_or_zero(total_igv::text),
  ALTER COLUMN total_general TYPE numeric(14,2) USING app.to_numeric_or_zero(total_general::text);

CREATE UNIQUE INDEX IF NOT EXISTS ux_comunicaciones_baja_numero
ON public.comunicaciones_baja (tenant_id, numero_comunicacion)
WHERE numero_comunicacion IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_resumenes_diarios_numero
ON public.resumenes_diarios (tenant_id, numero_resumen)
WHERE numero_resumen IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Ventas: cotizaciones / pedidos
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cotizaciones
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igv numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observaciones text,
  ADD COLUMN IF NOT EXISTS fecha_conversion timestamptz,
  ADD COLUMN IF NOT EXISTS convertido_por uuid,
  ADD COLUMN IF NOT EXISTS pedido_id uuid,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS items jsonb;

ALTER TABLE IF EXISTS public.cotizaciones
  ALTER COLUMN subtotal TYPE numeric(14,2) USING app.to_numeric_or_zero(subtotal::text),
  ALTER COLUMN igv TYPE numeric(14,2) USING app.to_numeric_or_zero(igv::text),
  ALTER COLUMN total TYPE numeric(14,2) USING app.to_numeric_or_zero(total::text),
  ALTER COLUMN numero TYPE text USING NULLIF(numero::text, '');

ALTER TABLE IF EXISTS public.cotizacion_detalles
  ADD COLUMN IF NOT EXISTS cantidad numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS precio_unitario numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS producto_nombre text;

ALTER TABLE IF EXISTS public.cotizacion_detalles
  ALTER COLUMN cantidad TYPE numeric(14,2) USING app.to_numeric_or_zero(cantidad::text),
  ALTER COLUMN precio_unitario TYPE numeric(14,2) USING app.to_numeric_or_zero(precio_unitario::text),
  ALTER COLUMN subtotal TYPE numeric(14,2) USING app.to_numeric_or_zero(subtotal::text);

CREATE INDEX IF NOT EXISTS idx_cotizacion_detalles_cotizacion
ON public.cotizacion_detalles (cotizacion_id);

ALTER TABLE IF EXISTS public.pedidos_venta
  ADD COLUMN IF NOT EXISTS cotizacion_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER TABLE IF EXISTS public.pedidos_venta
  ALTER COLUMN subtotal TYPE numeric(14,2) USING app.to_numeric_or_zero(subtotal::text),
  ALTER COLUMN igv TYPE numeric(14,2) USING app.to_numeric_or_zero(igv::text),
  ALTER COLUMN total TYPE numeric(14,2) USING app.to_numeric_or_zero(total::text),
  ALTER COLUMN numero TYPE text USING NULLIF(numero::text, '');

ALTER TABLE IF EXISTS public.pedidos_venta_detalle
  ADD COLUMN IF NOT EXISTS precio_unitario numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.pedidos_venta_detalle
  ALTER COLUMN cantidad TYPE numeric(14,2) USING app.to_numeric_or_zero(cantidad::text),
  ALTER COLUMN precio_unitario TYPE numeric(14,2) USING app.to_numeric_or_zero(precio_unitario::text),
  ALTER COLUMN subtotal TYPE numeric(14,2) USING app.to_numeric_or_zero(subtotal::text),
  ALTER COLUMN cantidad_despachada TYPE numeric(14,2) USING app.to_numeric_or_zero(cantidad_despachada::text),
  ALTER COLUMN cantidad_facturada TYPE numeric(14,2) USING app.to_numeric_or_zero(cantidad_facturada::text);

CREATE INDEX IF NOT EXISTS idx_pedidos_venta_tenant_numero
ON public.pedidos_venta (tenant_id, numero);

CREATE INDEX IF NOT EXISTS idx_pedidos_venta_detalle_pedido
ON public.pedidos_venta_detalle (pedido_id);

-- ----------------------------------------------------------------------------
-- Finanzas / CxP / Tesoreria (procesar_pago_lote)
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cuentas_bancarias
  ADD COLUMN IF NOT EXISTS activa boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS permite_sobregiro boolean DEFAULT false;

ALTER TABLE IF EXISTS public.cuentas_bancarias
  ALTER COLUMN activa TYPE boolean USING CASE
    WHEN activa IS NULL THEN true
    WHEN lower(btrim(activa::text)) IN ('t','true','1','si','yes') THEN true
    WHEN lower(btrim(activa::text)) IN ('f','false','0','no') THEN false
    ELSE true
  END,
  ALTER COLUMN saldo TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo::text),
  ALTER COLUMN saldo_actual TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo_actual::text),
  ALTER COLUMN saldo_contable TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo_contable::text);

ALTER TABLE IF EXISTS public.cuentas_por_pagar
  ADD COLUMN IF NOT EXISTS total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_pago date;

ALTER TABLE IF EXISTS public.cuentas_por_pagar
  ALTER COLUMN saldo TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo::text),
  ALTER COLUMN saldo_pendiente TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo_pendiente::text),
  ALTER COLUMN subtotal TYPE numeric(14,2) USING app.to_numeric_or_zero(subtotal::text),
  ALTER COLUMN total TYPE numeric(14,2) USING app.to_numeric_or_zero(total::text),
  ALTER COLUMN igv TYPE numeric(14,2) USING app.to_numeric_or_zero(igv::text),
  ALTER COLUMN numero_documento TYPE text USING NULLIF(numero_documento::text, ''),
  ALTER COLUMN numero TYPE text USING NULLIF(numero::text, '');

ALTER TABLE IF EXISTS public.movimientos_bancarios
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS cxp_id uuid,
  ADD COLUMN IF NOT EXISTS proveedor_id uuid,
  ADD COLUMN IF NOT EXISTS saldo_anterior numeric(14,2),
  ADD COLUMN IF NOT EXISTS saldo_nuevo numeric(14,2),
  ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER TABLE IF EXISTS public.movimientos_bancarios
  ALTER COLUMN monto TYPE numeric(14,2) USING app.to_numeric_or_zero(monto::text),
  ALTER COLUMN saldo TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo::text),
  ALTER COLUMN saldo_anterior TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo_anterior::text),
  ALTER COLUMN saldo_nuevo TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo_nuevo::text),
  ALTER COLUMN fecha TYPE date USING CASE
    WHEN fecha IS NULL OR btrim(fecha::text) = '' THEN NULL
    ELSE fecha::date
  END;

CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_tenant_fecha
ON public.movimientos_bancarios (tenant_id, fecha DESC);

ALTER TABLE IF EXISTS public.pagos_lote
  ADD COLUMN IF NOT EXISTS referencia_lote text,
  ADD COLUMN IF NOT EXISTS cuenta_bancaria_id uuid,
  ADD COLUMN IF NOT EXISTS fecha_pago date,
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS monto_total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pagos jsonb,
  ADD COLUMN IF NOT EXISTS resultado jsonb;

ALTER TABLE IF EXISTS public.pagos_lote
  ALTER COLUMN monto_total TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_total::text);

CREATE UNIQUE INDEX IF NOT EXISTS ux_pagos_lote_tenant_referencia
ON public.pagos_lote (tenant_id, referencia_lote)
WHERE referencia_lote IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_pagos_lote_tenant_referencia_full
ON public.pagos_lote (tenant_id, referencia_lote);

COMMIT;
