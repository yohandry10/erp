-- ============================================================================
-- 152__documentos_operational_runtime_alignment.sql
-- Alineacion runtime para el modulo de documentos.
-- Tablas: documentos, documento_detalles, documento_auditoria, documento_archivos.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- documentos: shape operativo real consumido por API/reportes/CPE/CxC.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.documentos
  ADD COLUMN IF NOT EXISTS pedido_id uuid,
  ADD COLUMN IF NOT EXISTS cliente_id uuid,
  ADD COLUMN IF NOT EXISTS receptor_numero_doc text,
  ADD COLUMN IF NOT EXISTS receptor_razon_social text,
  ADD COLUMN IF NOT EXISTS receptor_email text,
  ADD COLUMN IF NOT EXISTS descuentos numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impuesto_isc numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS otros_impuestos numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS cotizacion_origen_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

DROP POLICY IF EXISTS tenant_isolation ON public.documentos;
DROP POLICY IF EXISTS tenant_isolation ON public.documento_detalles;
DROP POLICY IF EXISTS tenant_isolation ON public.documento_auditoria;
DROP POLICY IF EXISTS tenant_isolation ON public.documento_archivos;
DROP VIEW IF EXISTS public.v_documentos_completos;
DROP VIEW IF EXISTS public.v_documentos_pendientes_sunat;
DROP VIEW IF EXISTS public.v_kpis_sunat_multitenant;
DROP VIEW IF EXISTS public.vw_cpe_documentos_auditoria;

ALTER TABLE IF EXISTS public.documentos
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN pedido_id TYPE uuid USING app.to_uuid_or_null(COALESCE(pedido_id::text, '')),
  ALTER COLUMN cliente_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cliente_id::text, '')),
  ALTER COLUMN cotizacion_origen_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cotizacion_origen_id::text, '')),
  ALTER COLUMN created_by TYPE uuid USING app.to_uuid_or_null(COALESCE(created_by::text, '')),
  ALTER COLUMN updated_by TYPE uuid USING app.to_uuid_or_null(COALESCE(updated_by::text, '')),
  ALTER COLUMN tipo_documento TYPE text USING upper(COALESCE(NULLIF(btrim(tipo_documento::text), ''), 'FACTURA')),
  ALTER COLUMN serie TYPE text USING upper(NULLIF(btrim(COALESCE(serie::text, '')), '')),
  ALTER COLUMN numero TYPE text USING NULLIF(btrim(COALESCE(numero::text, '')), ''),
  ALTER COLUMN fecha_emision TYPE timestamptz USING CASE
    WHEN fecha_emision IS NULL OR btrim(fecha_emision::text) = '' THEN NULL
    ELSE fecha_emision::timestamptz
  END,
  ALTER COLUMN fecha_vencimiento TYPE timestamptz USING CASE
    WHEN fecha_vencimiento IS NULL OR btrim(fecha_vencimiento::text) = '' THEN NULL
    ELSE fecha_vencimiento::timestamptz
  END,
  ALTER COLUMN moneda TYPE text USING upper(COALESCE(NULLIF(btrim(moneda::text), ''), 'PEN')),
  ALTER COLUMN tipo_cambio TYPE numeric(14,6) USING GREATEST(app.to_numeric_or_zero(tipo_cambio::text), 0),
  ALTER COLUMN subtotal TYPE numeric(14,2) USING app.to_numeric_or_zero(subtotal::text),
  ALTER COLUMN descuentos TYPE numeric(14,2) USING app.to_numeric_or_zero(descuentos::text),
  ALTER COLUMN impuesto_igv TYPE numeric(14,2) USING app.to_numeric_or_zero(impuesto_igv::text),
  ALTER COLUMN impuesto_isc TYPE numeric(14,2) USING app.to_numeric_or_zero(impuesto_isc::text),
  ALTER COLUMN otros_impuestos TYPE numeric(14,2) USING app.to_numeric_or_zero(otros_impuestos::text),
  ALTER COLUMN total TYPE numeric(14,2) USING app.to_numeric_or_zero(total::text),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado::text), ''), 'BORRADOR')),
  ALTER COLUMN estado_sunat TYPE text USING upper(NULLIF(btrim(COALESCE(estado_sunat::text, '')), '')),
  ALTER COLUMN emisor_ruc TYPE text USING NULLIF(btrim(COALESCE(emisor_ruc, '')), ''),
  ALTER COLUMN emisor_razon_social TYPE text USING NULLIF(btrim(COALESCE(emisor_razon_social, '')), ''),
  ALTER COLUMN emisor_direccion TYPE text USING NULLIF(btrim(COALESCE(emisor_direccion, '')), ''),
  ALTER COLUMN receptor_documento TYPE text USING NULLIF(btrim(COALESCE(receptor_documento, '')), ''),
  ALTER COLUMN receptor_nombre TYPE text USING NULLIF(btrim(COALESCE(receptor_nombre, '')), ''),
  ALTER COLUMN receptor_tipo_doc TYPE text USING upper(NULLIF(btrim(COALESCE(receptor_tipo_doc, '')), '')),
  ALTER COLUMN receptor_numero_doc TYPE text USING NULLIF(btrim(COALESCE(receptor_numero_doc, '')), ''),
  ALTER COLUMN receptor_razon_social TYPE text USING NULLIF(btrim(COALESCE(receptor_razon_social, '')), ''),
  ALTER COLUMN receptor_direccion TYPE text USING NULLIF(btrim(COALESCE(receptor_direccion, '')), ''),
  ALTER COLUMN receptor_email TYPE text USING lower(NULLIF(btrim(COALESCE(receptor_email, '')), '')),
  ALTER COLUMN observaciones TYPE text USING NULLIF(btrim(COALESCE(observaciones, '')), ''),
  ALTER COLUMN motivo_anulacion TYPE text USING NULLIF(btrim(COALESCE(motivo_anulacion, '')), ''),
  ALTER COLUMN error_sunat TYPE text USING NULLIF(btrim(COALESCE(error_sunat, '')), ''),
  ALTER COLUMN metodo_pago TYPE text USING upper(NULLIF(btrim(COALESCE(metodo_pago, '')), '')),
  ALTER COLUMN xml_content TYPE text USING NULLIF(btrim(regexp_replace(COALESCE(xml_content::text, ''), '^\"|\"$', '', 'g')), ''),
  ALTER COLUMN cdr_content TYPE text USING NULLIF(btrim(regexp_replace(COALESCE(cdr_content::text, ''), '^\"|\"$', '', 'g')), ''),
  ALTER COLUMN codigo_hash TYPE text USING NULLIF(btrim(COALESCE(codigo_hash, '')), ''),
  ALTER COLUMN metadata TYPE jsonb USING COALESCE(
    CASE
      WHEN metadata IS NULL THEN '{}'::jsonb
      WHEN jsonb_typeof(metadata) = 'object' THEN metadata
      ELSE '{}'::jsonb
    END,
    '{}'::jsonb
  ),
  ALTER COLUMN moneda SET DEFAULT 'PEN',
  ALTER COLUMN tipo_cambio SET DEFAULT 1,
  ALTER COLUMN subtotal SET DEFAULT 0,
  ALTER COLUMN descuentos SET DEFAULT 0,
  ALTER COLUMN impuesto_igv SET DEFAULT 0,
  ALTER COLUMN impuesto_isc SET DEFAULT 0,
  ALTER COLUMN otros_impuestos SET DEFAULT 0,
  ALTER COLUMN total SET DEFAULT 0,
  ALTER COLUMN estado SET DEFAULT 'BORRADOR',
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.documentos
SET
  tipo_documento = CASE
    WHEN upper(COALESCE(NULLIF(btrim(tipo_documento), ''), 'FACTURA')) IN ('01', 'FACTURA') THEN 'FACTURA'
    WHEN upper(COALESCE(NULLIF(btrim(tipo_documento), ''), 'FACTURA')) IN ('03', 'BOLETA') THEN 'BOLETA'
    WHEN upper(COALESCE(NULLIF(btrim(tipo_documento), ''), 'FACTURA')) IN ('07', 'NC', 'NOTA_CREDITO') THEN 'NOTA_CREDITO'
    WHEN upper(COALESCE(NULLIF(btrim(tipo_documento), ''), 'FACTURA')) IN ('08', 'ND', 'NOTA_DEBITO') THEN 'NOTA_DEBITO'
    WHEN upper(COALESCE(NULLIF(btrim(tipo_documento), ''), 'FACTURA')) IN ('CONTRATO', 'TICKET', 'GUIA', 'OTRO') THEN upper(btrim(tipo_documento))
    ELSE 'FACTURA'
  END,
  serie = COALESCE(
    NULLIF(upper(btrim(COALESCE(serie, ''))), ''),
    CASE
      WHEN upper(COALESCE(NULLIF(btrim(tipo_documento), ''), 'FACTURA')) IN ('03', 'BOLETA') THEN 'B001'
      WHEN upper(COALESCE(NULLIF(btrim(tipo_documento), ''), 'FACTURA')) IN ('07', 'NC', 'NOTA_CREDITO') THEN 'FC01'
      WHEN upper(COALESCE(NULLIF(btrim(tipo_documento), ''), 'FACTURA')) IN ('08', 'ND', 'NOTA_DEBITO') THEN 'FD01'
      WHEN upper(COALESCE(NULLIF(btrim(tipo_documento), ''), 'FACTURA')) = 'CONTRATO' THEN 'C001'
      ELSE 'F001'
    END
  ),
  numero = COALESCE(
    NULLIF(btrim(COALESCE(numero, '')), ''),
    right(replace(id::text, '-', ''), 8)
  ),
  fecha_emision = COALESCE(fecha_emision, created_at, now()),
  fecha_vencimiento = COALESCE(fecha_vencimiento, COALESCE(fecha_emision, created_at, now()) + interval '30 days'),
  moneda = COALESCE(NULLIF(upper(btrim(moneda)), ''), 'PEN'),
  tipo_cambio = CASE WHEN COALESCE(tipo_cambio, 0) <= 0 THEN 1 ELSE tipo_cambio END,
  subtotal = GREATEST(COALESCE(subtotal, 0), 0),
  descuentos = GREATEST(COALESCE(descuentos, 0), 0),
  impuesto_igv = GREATEST(COALESCE(impuesto_igv, 0), 0),
  impuesto_isc = GREATEST(COALESCE(impuesto_isc, 0), 0),
  otros_impuestos = GREATEST(COALESCE(otros_impuestos, 0), 0),
  total = GREATEST(
    COALESCE(NULLIF(total, 0), COALESCE(subtotal, 0) - COALESCE(descuentos, 0) + COALESCE(impuesto_igv, 0) + COALESCE(impuesto_isc, 0) + COALESCE(otros_impuestos, 0)),
    0
  ),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(estado), ''), 'BORRADOR')) IN ('ACTIVO', 'DRAFT', 'PENDIENTE') THEN 'BORRADOR'
    WHEN upper(COALESCE(NULLIF(btrim(estado), ''), 'BORRADOR')) IN ('EMITIDO', 'ENVIADO_SUNAT', 'RECHAZADO', 'OBSERVADO', 'ANULADO', 'BORRADOR') THEN upper(btrim(estado))
    WHEN upper(COALESCE(NULLIF(btrim(estado), ''), 'BORRADOR')) IN ('ENVIADO', 'ACEPTADO', 'ACEPTADA') THEN 'ENVIADO_SUNAT'
    ELSE 'BORRADOR'
  END,
  receptor_numero_doc = COALESCE(NULLIF(btrim(COALESCE(receptor_numero_doc, '')), ''), NULLIF(btrim(COALESCE(receptor_documento, '')), '')),
  receptor_razon_social = COALESCE(NULLIF(btrim(COALESCE(receptor_razon_social, '')), ''), NULLIF(btrim(COALESCE(receptor_nombre, '')), '')),
  receptor_documento = COALESCE(NULLIF(btrim(COALESCE(receptor_documento, '')), ''), NULLIF(btrim(COALESCE(receptor_numero_doc, '')), '')),
  receptor_nombre = COALESCE(NULLIF(btrim(COALESCE(receptor_nombre, '')), ''), NULLIF(btrim(COALESCE(receptor_razon_social, '')), '')),
  receptor_email = lower(NULLIF(btrim(COALESCE(receptor_email, '')), '')),
  metodo_pago = upper(NULLIF(btrim(COALESCE(metodo_pago, '')), '')),
  estado_sunat = upper(NULLIF(btrim(COALESCE(estado_sunat, '')), '')),
  metadata = COALESCE(metadata, '{}'::jsonb)
WHERE id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_documentos_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tipo text;
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.pedido_id := app.to_uuid_or_null(COALESCE(NEW.pedido_id::text, ''));
  NEW.cliente_id := app.to_uuid_or_null(COALESCE(NEW.cliente_id::text, ''));
  NEW.cotizacion_origen_id := app.to_uuid_or_null(COALESCE(NEW.cotizacion_origen_id::text, ''));
  NEW.created_by := app.to_uuid_or_null(COALESCE(NEW.created_by::text, ''));
  NEW.updated_by := app.to_uuid_or_null(COALESCE(NEW.updated_by::text, ''));

  v_tipo := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_documento, '')), ''), 'FACTURA'));
  IF v_tipo IN ('01', 'FACTURA') THEN
    v_tipo := 'FACTURA';
  ELSIF v_tipo IN ('03', 'BOLETA') THEN
    v_tipo := 'BOLETA';
  ELSIF v_tipo IN ('07', 'NC', 'NOTA_CREDITO') THEN
    v_tipo := 'NOTA_CREDITO';
  ELSIF v_tipo IN ('08', 'ND', 'NOTA_DEBITO') THEN
    v_tipo := 'NOTA_DEBITO';
  ELSIF v_tipo NOT IN ('CONTRATO', 'TICKET', 'GUIA', 'OTRO') THEN
    v_tipo := 'FACTURA';
  END IF;
  NEW.tipo_documento := v_tipo;

  NEW.serie := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.serie, ''))), ''),
    CASE
      WHEN v_tipo = 'BOLETA' THEN 'B001'
      WHEN v_tipo = 'NOTA_CREDITO' THEN 'FC01'
      WHEN v_tipo = 'NOTA_DEBITO' THEN 'FD01'
      WHEN v_tipo = 'CONTRATO' THEN 'C001'
      ELSE 'F001'
    END
  );

  NEW.numero := COALESCE(
    NULLIF(btrim(COALESCE(NEW.numero, '')), ''),
    right(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8)
  );

  NEW.fecha_emision := COALESCE(NEW.fecha_emision, NEW.created_at, now());
  NEW.fecha_vencimiento := COALESCE(NEW.fecha_vencimiento, NEW.fecha_emision + interval '30 days');

  NEW.moneda := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.moneda, ''))), ''), 'PEN');
  NEW.tipo_cambio := CASE WHEN COALESCE(NEW.tipo_cambio, 0) <= 0 THEN 1 ELSE NEW.tipo_cambio END;

  NEW.subtotal := GREATEST(COALESCE(NEW.subtotal, 0), 0);
  NEW.descuentos := GREATEST(COALESCE(NEW.descuentos, 0), 0);
  NEW.impuesto_igv := GREATEST(COALESCE(NEW.impuesto_igv, 0), 0);
  NEW.impuesto_isc := GREATEST(COALESCE(NEW.impuesto_isc, 0), 0);
  NEW.otros_impuestos := GREATEST(COALESCE(NEW.otros_impuestos, 0), 0);
  NEW.total := GREATEST(
    COALESCE(
      NULLIF(NEW.total, 0),
      NEW.subtotal - NEW.descuentos + NEW.impuesto_igv + NEW.impuesto_isc + NEW.otros_impuestos,
      0
    ),
    0
  );

  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'BORRADOR'));
  IF v_estado IN ('ACTIVO', 'DRAFT', 'PENDIENTE') THEN
    v_estado := 'BORRADOR';
  ELSIF v_estado IN ('ENVIADO', 'ACEPTADO', 'ACEPTADA') THEN
    v_estado := 'ENVIADO_SUNAT';
  ELSIF v_estado NOT IN ('BORRADOR', 'EMITIDO', 'ENVIADO_SUNAT', 'OBSERVADO', 'RECHAZADO', 'ANULADO') THEN
    v_estado := 'BORRADOR';
  END IF;
  NEW.estado := v_estado;

  NEW.estado_sunat := upper(NULLIF(btrim(COALESCE(NEW.estado_sunat, '')), ''));

  NEW.emisor_ruc := NULLIF(btrim(COALESCE(NEW.emisor_ruc, '')), '');
  NEW.emisor_razon_social := NULLIF(btrim(COALESCE(NEW.emisor_razon_social, '')), '');
  NEW.emisor_direccion := NULLIF(btrim(COALESCE(NEW.emisor_direccion, '')), '');

  NEW.receptor_documento := NULLIF(btrim(COALESCE(NEW.receptor_documento, '')), '');
  NEW.receptor_numero_doc := COALESCE(
    NULLIF(btrim(COALESCE(NEW.receptor_numero_doc, '')), ''),
    NEW.receptor_documento
  );
  NEW.receptor_documento := COALESCE(NEW.receptor_documento, NEW.receptor_numero_doc);

  NEW.receptor_nombre := NULLIF(btrim(COALESCE(NEW.receptor_nombre, '')), '');
  NEW.receptor_razon_social := COALESCE(
    NULLIF(btrim(COALESCE(NEW.receptor_razon_social, '')), ''),
    NEW.receptor_nombre
  );
  NEW.receptor_nombre := COALESCE(NEW.receptor_nombre, NEW.receptor_razon_social);

  NEW.receptor_tipo_doc := upper(NULLIF(btrim(COALESCE(NEW.receptor_tipo_doc, '')), ''));
  NEW.receptor_direccion := NULLIF(btrim(COALESCE(NEW.receptor_direccion, '')), '');
  NEW.receptor_email := lower(NULLIF(btrim(COALESCE(NEW.receptor_email, '')), ''));

  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, '')), '');
  NEW.motivo_anulacion := NULLIF(btrim(COALESCE(NEW.motivo_anulacion, '')), '');
  NEW.error_sunat := NULLIF(btrim(COALESCE(NEW.error_sunat, '')), '');
  NEW.metodo_pago := upper(NULLIF(btrim(COALESCE(NEW.metodo_pago, '')), ''));

  NEW.xml_content := NULLIF(btrim(regexp_replace(COALESCE(NEW.xml_content::text, ''), '^\"|\"$', '', 'g')), '');
  NEW.cdr_content := NULLIF(btrim(regexp_replace(COALESCE(NEW.cdr_content::text, ''), '^\"|\"$', '', 'g')), '');
  NEW.codigo_hash := NULLIF(btrim(COALESCE(NEW.codigo_hash, '')), '');

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_documentos_row ON public.documentos;
CREATE TRIGGER trg_normalize_documentos_row
BEFORE INSERT OR UPDATE ON public.documentos
FOR EACH ROW EXECUTE FUNCTION app.normalize_documentos_row();

-- ----------------------------------------------------------------------------
-- documento_detalles: shape de líneas consumido por documentos/pedidos/cotizaciones.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.documento_detalles
  ADD COLUMN IF NOT EXISTS documento_id uuid,
  ADD COLUMN IF NOT EXISTS orden integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS producto_id uuid,
  ADD COLUMN IF NOT EXISTS codigo_producto text,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS unidad_medida text DEFAULT 'NIU',
  ADD COLUMN IF NOT EXISTS cantidad numeric(14,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS precio_unitario numeric(14,6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuento_unitario numeric(14,6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_venta numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impuesto_igv numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impuesto_isc numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_item numeric(14,2) DEFAULT 0;

ALTER TABLE IF EXISTS public.documento_detalles
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN documento_id TYPE uuid USING app.to_uuid_or_null(COALESCE(documento_id::text, '')),
  ALTER COLUMN producto_id TYPE uuid USING app.to_uuid_or_null(COALESCE(producto_id::text, '')),
  ALTER COLUMN orden TYPE integer USING GREATEST(app.to_int_or_zero(orden::text), 1),
  ALTER COLUMN codigo_producto TYPE text USING NULLIF(btrim(COALESCE(codigo_producto::text, '')), ''),
  ALTER COLUMN descripcion TYPE text USING NULLIF(btrim(COALESCE(descripcion, '')), ''),
  ALTER COLUMN unidad_medida TYPE text USING upper(COALESCE(NULLIF(btrim(unidad_medida::text), ''), 'NIU')),
  ALTER COLUMN cantidad TYPE numeric(14,4) USING app.to_numeric_or_zero(cantidad::text),
  ALTER COLUMN precio_unitario TYPE numeric(14,6) USING app.to_numeric_or_zero(precio_unitario::text),
  ALTER COLUMN descuento_unitario TYPE numeric(14,6) USING app.to_numeric_or_zero(descuento_unitario::text),
  ALTER COLUMN valor_venta TYPE numeric(14,2) USING app.to_numeric_or_zero(valor_venta::text),
  ALTER COLUMN impuesto_igv TYPE numeric(14,2) USING app.to_numeric_or_zero(impuesto_igv::text),
  ALTER COLUMN impuesto_isc TYPE numeric(14,2) USING app.to_numeric_or_zero(impuesto_isc::text),
  ALTER COLUMN total_item TYPE numeric(14,2) USING app.to_numeric_or_zero(total_item::text),
  ALTER COLUMN orden SET DEFAULT 1,
  ALTER COLUMN unidad_medida SET DEFAULT 'NIU',
  ALTER COLUMN cantidad SET DEFAULT 0,
  ALTER COLUMN precio_unitario SET DEFAULT 0,
  ALTER COLUMN descuento_unitario SET DEFAULT 0,
  ALTER COLUMN valor_venta SET DEFAULT 0,
  ALTER COLUMN impuesto_igv SET DEFAULT 0,
  ALTER COLUMN impuesto_isc SET DEFAULT 0,
  ALTER COLUMN total_item SET DEFAULT 0;

UPDATE public.documento_detalles
SET
  codigo_producto = COALESCE(NULLIF(btrim(COALESCE(codigo_producto, '')), ''), NULLIF(btrim(COALESCE(producto_id::text, '')), '')),
  descripcion = NULLIF(btrim(COALESCE(descripcion, '')), ''),
  unidad_medida = COALESCE(NULLIF(upper(btrim(COALESCE(unidad_medida, ''))), ''), 'NIU'),
  cantidad = GREATEST(COALESCE(cantidad, 0), 0),
  precio_unitario = GREATEST(COALESCE(precio_unitario, 0), 0),
  descuento_unitario = GREATEST(COALESCE(descuento_unitario, 0), 0),
  valor_venta = GREATEST(COALESCE(NULLIF(valor_venta, 0), COALESCE(cantidad, 0) * COALESCE(precio_unitario, 0) - COALESCE(descuento_unitario, 0)), 0),
  impuesto_igv = GREATEST(COALESCE(impuesto_igv, 0), 0),
  impuesto_isc = GREATEST(COALESCE(impuesto_isc, 0), 0),
  total_item = GREATEST(COALESCE(NULLIF(total_item, 0), COALESCE(valor_venta, 0) + COALESCE(impuesto_igv, 0) + COALESCE(impuesto_isc, 0)), 0)
WHERE id IS NOT NULL;

WITH ranked AS (
  SELECT
    d.id,
    row_number() OVER (
      PARTITION BY d.documento_id
      ORDER BY COALESCE(d.orden, 0), COALESCE(d.updated_at, d.created_at, now()), d.id::text
    ) AS rn
  FROM public.documento_detalles d
  WHERE d.documento_id IS NOT NULL
)
UPDATE public.documento_detalles d
SET orden = r.rn,
    updated_at = now()
FROM ranked r
WHERE d.id = r.id
  AND (d.orden IS NULL OR d.orden < 1 OR d.orden <> r.rn);

UPDATE public.documento_detalles
SET orden = 1,
    updated_at = now()
WHERE orden IS NULL OR orden < 1;

CREATE OR REPLACE FUNCTION app.normalize_documento_detalles_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.documento_id := app.to_uuid_or_null(COALESCE(NEW.documento_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));

  NEW.orden := CASE WHEN COALESCE(NEW.orden, 0) < 1 THEN 1 ELSE NEW.orden END;
  NEW.codigo_producto := COALESCE(
    NULLIF(btrim(COALESCE(NEW.codigo_producto, '')), ''),
    NULLIF(btrim(COALESCE(NEW.producto_id::text, '')), '')
  );
  NEW.descripcion := NULLIF(btrim(COALESCE(NEW.descripcion, '')), '');
  NEW.unidad_medida := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.unidad_medida, ''))), ''), 'NIU');

  NEW.cantidad := GREATEST(COALESCE(NEW.cantidad, 0), 0);
  NEW.precio_unitario := GREATEST(COALESCE(NEW.precio_unitario, 0), 0);
  NEW.descuento_unitario := GREATEST(COALESCE(NEW.descuento_unitario, 0), 0);
  NEW.valor_venta := GREATEST(
    COALESCE(
      NULLIF(NEW.valor_venta, 0),
      NEW.cantidad * NEW.precio_unitario - NEW.descuento_unitario,
      0
    ),
    0
  );
  NEW.impuesto_igv := GREATEST(COALESCE(NEW.impuesto_igv, 0), 0);
  NEW.impuesto_isc := GREATEST(COALESCE(NEW.impuesto_isc, 0), 0);
  NEW.total_item := GREATEST(
    COALESCE(NULLIF(NEW.total_item, 0), NEW.valor_venta + NEW.impuesto_igv + NEW.impuesto_isc, 0),
    0
  );

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_documento_detalles_row ON public.documento_detalles;
CREATE TRIGGER trg_normalize_documento_detalles_row
BEFORE INSERT OR UPDATE ON public.documento_detalles
FOR EACH ROW EXECUTE FUNCTION app.normalize_documento_detalles_row();

-- ----------------------------------------------------------------------------
-- documento_auditoria: shape de trazabilidad de acciones sobre documentos.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.documento_auditoria
  ADD COLUMN IF NOT EXISTS documento_id uuid,
  ADD COLUMN IF NOT EXISTS accion text,
  ADD COLUMN IF NOT EXISTS detalles_cambio text,
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS "timestamp" timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.documento_auditoria
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN documento_id TYPE uuid USING app.to_uuid_or_null(COALESCE(documento_id::text, '')),
  ALTER COLUMN usuario_id TYPE uuid USING app.to_uuid_or_null(COALESCE(usuario_id::text, '')),
  ALTER COLUMN accion TYPE text USING upper(COALESCE(NULLIF(btrim(accion::text), ''), 'ACTUALIZADO')),
  ALTER COLUMN detalles_cambio TYPE text USING NULLIF(btrim(regexp_replace(COALESCE(detalles_cambio::text, ''), '^\"|\"$', '', 'g')), ''),
  ALTER COLUMN "timestamp" TYPE timestamptz USING CASE
    WHEN "timestamp" IS NULL OR btrim("timestamp"::text) = '' THEN NULL
    ELSE "timestamp"::timestamptz
  END,
  ALTER COLUMN "timestamp" SET DEFAULT now();

UPDATE public.documento_auditoria
SET
  accion = COALESCE(NULLIF(upper(btrim(COALESCE(accion, ''))), ''), 'ACTUALIZADO'),
  detalles_cambio = NULLIF(btrim(COALESCE(detalles_cambio, '')), ''),
  "timestamp" = COALESCE("timestamp", created_at, now())
WHERE id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_documento_auditoria_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.documento_id := app.to_uuid_or_null(COALESCE(NEW.documento_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));
  NEW.accion := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.accion, ''))), ''), 'ACTUALIZADO');
  NEW.detalles_cambio := NULLIF(btrim(COALESCE(NEW.detalles_cambio, '')), '');
  NEW."timestamp" := COALESCE(NEW."timestamp", NEW.created_at, now());
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_documento_auditoria_row ON public.documento_auditoria;
CREATE TRIGGER trg_normalize_documento_auditoria_row
BEFORE INSERT OR UPDATE ON public.documento_auditoria
FOR EACH ROW EXECUTE FUNCTION app.normalize_documento_auditoria_row();

-- ----------------------------------------------------------------------------
-- documento_archivos: adjuntos de documentos (PDF/XML/CDR y otros).
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.documento_archivos
  ADD COLUMN IF NOT EXISTS documento_id uuid,
  ADD COLUMN IF NOT EXISTS tipo_archivo text,
  ADD COLUMN IF NOT EXISTS nombre_archivo text,
  ADD COLUMN IF NOT EXISTS url_archivo text,
  ADD COLUMN IF NOT EXISTS storage_bucket text,
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS size_bytes bigint,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid,
  ADD COLUMN IF NOT EXISTS uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS checksum text;

ALTER TABLE IF EXISTS public.documento_archivos
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN documento_id TYPE uuid USING app.to_uuid_or_null(COALESCE(documento_id::text, '')),
  ALTER COLUMN tipo_archivo TYPE text USING upper(COALESCE(NULLIF(btrim(tipo_archivo::text), ''), 'OTRO')),
  ALTER COLUMN nombre_archivo TYPE text USING NULLIF(btrim(COALESCE(nombre_archivo, '')), ''),
  ALTER COLUMN url_archivo TYPE text USING NULLIF(btrim(COALESCE(url_archivo, '')), ''),
  ALTER COLUMN storage_bucket TYPE text USING NULLIF(btrim(COALESCE(storage_bucket, '')), ''),
  ALTER COLUMN storage_path TYPE text USING NULLIF(btrim(COALESCE(storage_path, '')), ''),
  ALTER COLUMN mime_type TYPE text USING lower(NULLIF(btrim(COALESCE(mime_type, '')), '')),
  ALTER COLUMN size_bytes TYPE bigint USING GREATEST(app.to_int_or_zero(size_bytes::text), 0)::bigint,
  ALTER COLUMN uploaded_by TYPE uuid USING app.to_uuid_or_null(COALESCE(uploaded_by::text, '')),
  ALTER COLUMN uploaded_at TYPE timestamptz USING CASE
    WHEN uploaded_at IS NULL OR btrim(uploaded_at::text) = '' THEN NULL
    ELSE uploaded_at::timestamptz
  END,
  ALTER COLUMN checksum TYPE text USING NULLIF(btrim(COALESCE(checksum, '')), ''),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado::text), ''), 'ACTIVO')),
  ALTER COLUMN metadata TYPE jsonb USING COALESCE(
    CASE
      WHEN metadata IS NULL THEN '{}'::jsonb
      WHEN jsonb_typeof(metadata) = 'object' THEN metadata
      ELSE '{}'::jsonb
    END,
    '{}'::jsonb
  ),
  ALTER COLUMN size_bytes SET DEFAULT 0,
  ALTER COLUMN tipo_archivo SET DEFAULT 'OTRO',
  ALTER COLUMN estado SET DEFAULT 'ACTIVO',
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.documento_archivos
SET
  nombre_archivo = COALESCE(NULLIF(btrim(COALESCE(nombre_archivo, '')), ''), NULLIF(btrim(COALESCE(nombre, '')), '')),
  tipo_archivo = CASE
    WHEN upper(COALESCE(NULLIF(btrim(tipo_archivo), ''), '')) IN ('PDF', 'XML', 'CDR', 'JSON', 'ZIP', 'OTRO') THEN upper(btrim(tipo_archivo))
    WHEN lower(COALESCE(mime_type, '')) LIKE '%pdf%' THEN 'PDF'
    WHEN lower(COALESCE(mime_type, '')) LIKE '%xml%' THEN 'XML'
    WHEN lower(COALESCE(mime_type, '')) LIKE '%json%' THEN 'JSON'
    WHEN lower(COALESCE(nombre_archivo, '')) LIKE '%.pdf' THEN 'PDF'
    WHEN lower(COALESCE(nombre_archivo, '')) LIKE '%.xml' THEN 'XML'
    WHEN lower(COALESCE(nombre_archivo, '')) LIKE '%.zip' THEN 'ZIP'
    ELSE 'OTRO'
  END,
  mime_type = lower(NULLIF(btrim(COALESCE(mime_type, '')), '')),
  size_bytes = GREATEST(COALESCE(size_bytes, 0), 0),
  uploaded_at = COALESCE(uploaded_at, created_at, now()),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(estado), ''), 'ACTIVO')) IN ('ACTIVO', 'ARCHIVADO', 'ELIMINADO') THEN upper(COALESCE(NULLIF(btrim(estado), ''), 'ACTIVO'))
    ELSE 'ACTIVO'
  END,
  metadata = COALESCE(metadata, '{}'::jsonb)
WHERE id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_documento_archivos_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tipo text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.documento_id := app.to_uuid_or_null(COALESCE(NEW.documento_id::text, ''));
  NEW.uploaded_by := app.to_uuid_or_null(COALESCE(NEW.uploaded_by::text, ''));

  NEW.nombre_archivo := COALESCE(
    NULLIF(btrim(COALESCE(NEW.nombre_archivo, '')), ''),
    NULLIF(btrim(COALESCE(NEW.nombre, '')), '')
  );
  NEW.url_archivo := NULLIF(btrim(COALESCE(NEW.url_archivo, '')), '');
  NEW.storage_bucket := NULLIF(btrim(COALESCE(NEW.storage_bucket, '')), '');
  NEW.storage_path := NULLIF(btrim(COALESCE(NEW.storage_path, '')), '');
  NEW.mime_type := lower(NULLIF(btrim(COALESCE(NEW.mime_type, '')), ''));

  v_tipo := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_archivo, '')), ''), ''));
  IF v_tipo NOT IN ('PDF', 'XML', 'CDR', 'JSON', 'ZIP', 'OTRO') THEN
    IF lower(COALESCE(NEW.mime_type, '')) LIKE '%pdf%' OR lower(COALESCE(NEW.nombre_archivo, '')) LIKE '%.pdf' THEN
      v_tipo := 'PDF';
    ELSIF lower(COALESCE(NEW.mime_type, '')) LIKE '%xml%' OR lower(COALESCE(NEW.nombre_archivo, '')) LIKE '%.xml' THEN
      v_tipo := 'XML';
    ELSIF lower(COALESCE(NEW.mime_type, '')) LIKE '%json%' THEN
      v_tipo := 'JSON';
    ELSIF lower(COALESCE(NEW.nombre_archivo, '')) LIKE '%.zip' THEN
      v_tipo := 'ZIP';
    ELSE
      v_tipo := 'OTRO';
    END IF;
  END IF;
  NEW.tipo_archivo := v_tipo;

  NEW.size_bytes := GREATEST(COALESCE(NEW.size_bytes, 0), 0);
  NEW.uploaded_at := COALESCE(NEW.uploaded_at, NEW.created_at, now());
  NEW.checksum := NULLIF(btrim(COALESCE(NEW.checksum, '')), '');

  NEW.estado := CASE
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'ACTIVO')) IN ('ACTIVO', 'ARCHIVADO', 'ELIMINADO') THEN upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'ACTIVO'))
    ELSE 'ACTIVO'
  END;

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_documento_archivos_row ON public.documento_archivos;
CREATE TRIGGER trg_normalize_documento_archivos_row
BEFORE INSERT OR UPDATE ON public.documento_archivos
FOR EACH ROW EXECUTE FUNCTION app.normalize_documento_archivos_row();

-- ----------------------------------------------------------------------------
-- Índices runtime para patrones de consulta reales.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_documentos_tenant_estado_fecha_emision_runtime
ON public.documentos (tenant_id, estado, fecha_emision DESC)
WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documentos_tenant_tipo_fecha_emision_runtime
ON public.documentos (tenant_id, tipo_documento, fecha_emision DESC)
WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documentos_tenant_serie_numero_runtime
ON public.documentos (tenant_id, serie, numero)
WHERE tenant_id IS NOT NULL
  AND serie IS NOT NULL
  AND numero IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documento_detalles_tenant_documento_orden_runtime
ON public.documento_detalles (tenant_id, documento_id, orden)
WHERE tenant_id IS NOT NULL
  AND documento_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documento_detalles_tenant_producto_runtime
ON public.documento_detalles (tenant_id, producto_id)
WHERE tenant_id IS NOT NULL
  AND producto_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documento_auditoria_tenant_documento_timestamp_runtime
ON public.documento_auditoria (tenant_id, documento_id, "timestamp" DESC)
WHERE tenant_id IS NOT NULL
  AND documento_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documento_auditoria_tenant_accion_timestamp_runtime
ON public.documento_auditoria (tenant_id, accion, "timestamp" DESC)
WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documento_archivos_tenant_documento_tipo_runtime
ON public.documento_archivos (tenant_id, documento_id, tipo_archivo)
WHERE tenant_id IS NOT NULL
  AND documento_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documento_archivos_tenant_uploaded_at_runtime
ON public.documento_archivos (tenant_id, uploaded_at DESC)
WHERE tenant_id IS NOT NULL;

SELECT app.apply_tenant_policy('public', 'documentos');
SELECT app.apply_tenant_policy('public', 'documento_detalles');
SELECT app.apply_tenant_policy('public', 'documento_auditoria');
SELECT app.apply_tenant_policy('public', 'documento_archivos');

CREATE OR REPLACE VIEW public.v_documentos_completos AS
SELECT
  d.*,
  c.estado_sunat AS cpe_estado_sunat,
  c.error_message AS cpe_error_message
FROM public.documentos d
LEFT JOIN public.cpe c ON c.documento_id = d.id;

CREATE OR REPLACE VIEW public.v_documentos_pendientes_sunat AS
SELECT *
FROM public.documentos
WHERE estado IN ('BORRADOR', 'EMITIDO');

CREATE OR REPLACE VIEW public.vw_cpe_documentos_auditoria AS
SELECT
  c.id AS cpe_id,
  c.tenant_id,
  c.documento_id,
  COALESCE(NULLIF(btrim(c.tipo_documento), ''), NULLIF(btrim(d.tipo_documento), '')) AS tipo_documento,
  COALESCE(NULLIF(btrim(c.serie), ''), NULLIF(btrim(d.serie), '')) AS serie,
  COALESCE(NULLIF(btrim(c.numero::text), ''), NULLIF(btrim(d.numero::text), '')) AS numero,
  COALESCE(NULLIF(btrim(c.estado), ''), 'PENDIENTE') AS estado_cpe,
  COALESCE(NULLIF(btrim(c.sunat_status), ''), NULLIF(btrim(c.estado_sunat), ''), NULLIF(btrim(d.estado_sunat), '')) AS estado_sunat,
  COALESCE(
    app.to_numeric_or_zero(c.total_venta::text),
    app.to_numeric_or_zero(c.total::text),
    app.to_numeric_or_zero(d.total::text),
    0
  )::numeric(14,2) AS total,
  c.fecha_emision,
  c.created_at,
  c.updated_at,
  d.id AS documento_fk,
  d.estado AS documento_estado,
  d.fecha_emision AS documento_fecha_emision,
  d.error_sunat,
  c.error_message,
  CASE
    WHEN c.documento_id IS NULL THEN 'CPE_SIN_DOCUMENTO'
    WHEN d.id IS NULL THEN 'DOCUMENTO_NO_ENCONTRADO'
    WHEN COALESCE(NULLIF(btrim(c.tipo_documento), ''), '') <> COALESCE(NULLIF(btrim(d.tipo_documento), ''), '') THEN 'TIPO_DOC_DESALINEADO'
    WHEN ABS(
      COALESCE(app.to_numeric_or_zero(c.total_venta::text), app.to_numeric_or_zero(c.total::text), 0)
      - COALESCE(app.to_numeric_or_zero(d.total::text), 0)
    ) > 0.01 THEN 'TOTAL_DESALINEADO'
    ELSE 'OK'
  END AS estado_integridad
FROM public.cpe c
LEFT JOIN public.documentos d ON d.id = c.documento_id;

CREATE OR REPLACE VIEW public.v_kpis_sunat_multitenant AS
WITH docs_base AS (
  SELECT
    d.tenant_id,
    COALESCE(
      date_trunc('day', d.fecha_emision)::date,
      date_trunc('day', c.fecha_emision)::date,
      date_trunc('day', d.created_at)::date,
      date_trunc('day', c.created_at)::date,
      CURRENT_DATE
    ) AS periodo,
    upper(
      COALESCE(
        NULLIF(btrim(c.sunat_status), ''),
        NULLIF(btrim(c.estado_sunat), ''),
        NULLIF(btrim(d.estado_sunat), ''),
        NULLIF(btrim(c.estado), ''),
        NULLIF(btrim(d.estado), ''),
        'PENDIENTE'
      )
    ) AS estado_normalizado
  FROM public.documentos d
  LEFT JOIN public.cpe c
    ON c.documento_id = d.id
   AND c.tenant_id = d.tenant_id
  WHERE
    upper(COALESCE(d.tipo_documento, c.tipo_documento, '')) IN (
      '01', '03', '07', '08',
      'FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO'
    )
),
cpe_sueltos AS (
  SELECT
    c.tenant_id,
    COALESCE(
      date_trunc('day', c.fecha_emision)::date,
      date_trunc('day', c.created_at)::date,
      CURRENT_DATE
    ) AS periodo,
    upper(
      COALESCE(
        NULLIF(btrim(c.sunat_status), ''),
        NULLIF(btrim(c.estado_sunat), ''),
        NULLIF(btrim(c.estado), ''),
        'PENDIENTE'
      )
    ) AS estado_normalizado
  FROM public.cpe c
  WHERE c.documento_id IS NULL
),
base AS (
  SELECT * FROM docs_base
  UNION ALL
  SELECT * FROM cpe_sueltos
)
SELECT
  b.tenant_id,
  b.periodo,
  COUNT(*) FILTER (WHERE b.estado_normalizado IN ('ACEPTADO', 'APROBADO'))::bigint AS aceptados,
  COUNT(*) FILTER (WHERE b.estado_normalizado LIKE 'OBSERVAD%')::bigint AS observados,
  COUNT(*) FILTER (WHERE b.estado_normalizado IN ('RECHAZADO', 'ERROR', 'ANULADO'))::bigint AS rechazados,
  COUNT(*) FILTER (
    WHERE b.estado_normalizado NOT IN ('ACEPTADO', 'APROBADO', 'RECHAZADO', 'ERROR', 'ANULADO')
      AND b.estado_normalizado NOT LIKE 'OBSERVAD%'
  )::bigint AS pendientes,
  COUNT(*)::bigint AS total
FROM base b
GROUP BY b.tenant_id, b.periodo
ORDER BY b.tenant_id, b.periodo;

COMMIT;
