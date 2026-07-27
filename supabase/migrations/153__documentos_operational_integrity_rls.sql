-- ============================================================================
-- 153__documentos_operational_integrity_rls.sql
-- Integridad, consistencia tenant y hardening RLS para documentos.
-- Tablas: documentos, documento_detalles, documento_auditoria, documento_archivos.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill tenant y relaciones parent.
-- ----------------------------------------------------------------------------
UPDATE public.documentos d
SET
  tenant_id = p.tenant_id,
  cliente_id = COALESCE(d.cliente_id, p.cliente_id)
FROM public.pedidos_venta p
WHERE d.pedido_id = p.id
  AND (
    d.tenant_id IS NULL
    OR (p.tenant_id IS NOT NULL AND d.tenant_id <> p.tenant_id)
    OR (d.cliente_id IS NULL AND p.cliente_id IS NOT NULL)
  );

UPDATE public.documentos d
SET tenant_id = c.tenant_id
FROM public.clientes c
WHERE d.cliente_id = c.id
  AND c.tenant_id IS NOT NULL
  AND (d.tenant_id IS NULL OR d.tenant_id <> c.tenant_id);

UPDATE public.documentos d
SET
  tenant_id = c.tenant_id,
  cliente_id = COALESCE(d.cliente_id, c.cliente_id)
FROM public.cotizaciones c
WHERE d.cotizacion_origen_id = c.id
  AND (
    d.tenant_id IS NULL
    OR (c.tenant_id IS NOT NULL AND d.tenant_id <> c.tenant_id)
    OR (d.cliente_id IS NULL AND c.cliente_id IS NOT NULL)
  );

UPDATE public.documentos d
SET tenant_id = cp.tenant_id
FROM public.cpe cp
WHERE cp.documento_id = d.id
  AND cp.tenant_id IS NOT NULL
  AND (d.tenant_id IS NULL OR d.tenant_id <> cp.tenant_id);

UPDATE public.documentos d
SET
  receptor_numero_doc = COALESCE(d.receptor_numero_doc, d.receptor_documento),
  receptor_documento = COALESCE(d.receptor_documento, d.receptor_numero_doc),
  receptor_razon_social = COALESCE(d.receptor_razon_social, d.receptor_nombre),
  receptor_nombre = COALESCE(d.receptor_nombre, d.receptor_razon_social)
WHERE d.id IS NOT NULL;

UPDATE public.documento_detalles dd
SET tenant_id = d.tenant_id
FROM public.documentos d
WHERE dd.documento_id = d.id
  AND d.tenant_id IS NOT NULL
  AND (dd.tenant_id IS NULL OR dd.tenant_id <> d.tenant_id);

UPDATE public.documento_auditoria da
SET tenant_id = d.tenant_id
FROM public.documentos d
WHERE da.documento_id = d.id
  AND d.tenant_id IS NOT NULL
  AND (da.tenant_id IS NULL OR da.tenant_id <> d.tenant_id);

UPDATE public.documento_archivos df
SET tenant_id = d.tenant_id
FROM public.documentos d
WHERE df.documento_id = d.id
  AND d.tenant_id IS NOT NULL
  AND (df.tenant_id IS NULL OR df.tenant_id <> d.tenant_id);

-- ----------------------------------------------------------------------------
-- Re-normalizacion defensiva pre-integridad.
-- ----------------------------------------------------------------------------
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
  serie = COALESCE(NULLIF(upper(btrim(COALESCE(serie, ''))), ''), 'F001'),
  numero = COALESCE(NULLIF(btrim(COALESCE(numero, '')), ''), right(replace(id::text, '-', ''), 8)),
  fecha_emision = COALESCE(fecha_emision, created_at, now()),
  fecha_vencimiento = COALESCE(fecha_vencimiento, fecha_emision, created_at, now()),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(estado), ''), 'BORRADOR')) IN ('BORRADOR', 'EMITIDO', 'ENVIADO_SUNAT', 'OBSERVADO', 'RECHAZADO', 'ANULADO')
      THEN upper(COALESCE(NULLIF(btrim(estado), ''), 'BORRADOR'))
    WHEN upper(COALESCE(NULLIF(btrim(estado), ''), 'BORRADOR')) IN ('ENVIADO', 'ACEPTADO', 'ACEPTADA')
      THEN 'ENVIADO_SUNAT'
    ELSE 'BORRADOR'
  END,
  moneda = COALESCE(NULLIF(upper(btrim(moneda)), ''), 'PEN'),
  tipo_cambio = CASE WHEN COALESCE(tipo_cambio, 0) <= 0 THEN 1 ELSE tipo_cambio END,
  subtotal = GREATEST(COALESCE(subtotal, 0), 0),
  descuentos = GREATEST(COALESCE(descuentos, 0), 0),
  impuesto_igv = GREATEST(COALESCE(impuesto_igv, 0), 0),
  impuesto_isc = GREATEST(COALESCE(impuesto_isc, 0), 0),
  otros_impuestos = GREATEST(COALESCE(otros_impuestos, 0), 0),
  total = GREATEST(COALESCE(NULLIF(total, 0), subtotal - descuentos + impuesto_igv + impuesto_isc + otros_impuestos), 0)
WHERE id IS NOT NULL;

UPDATE public.documento_detalles
SET
  orden = CASE WHEN COALESCE(orden, 0) < 1 THEN 1 ELSE orden END,
  descripcion = COALESCE(NULLIF(btrim(COALESCE(descripcion, '')), ''), 'ITEM'),
  cantidad = CASE WHEN COALESCE(cantidad, 0) <= 0 THEN 1 ELSE cantidad END,
  precio_unitario = GREATEST(COALESCE(precio_unitario, 0), 0),
  descuento_unitario = GREATEST(COALESCE(descuento_unitario, 0), 0),
  valor_venta = GREATEST(COALESCE(NULLIF(valor_venta, 0), cantidad * precio_unitario - descuento_unitario), 0),
  impuesto_igv = GREATEST(COALESCE(impuesto_igv, 0), 0),
  impuesto_isc = GREATEST(COALESCE(impuesto_isc, 0), 0),
  total_item = GREATEST(COALESCE(NULLIF(total_item, 0), valor_venta + impuesto_igv + impuesto_isc), 0)
WHERE id IS NOT NULL;

UPDATE public.documento_auditoria
SET
  accion = COALESCE(NULLIF(upper(btrim(COALESCE(accion, ''))), ''), 'ACTUALIZADO'),
  detalles_cambio = COALESCE(NULLIF(btrim(COALESCE(detalles_cambio, '')), ''), 'Sin detalle'),
  "timestamp" = COALESCE("timestamp", created_at, now())
WHERE id IS NOT NULL;

UPDATE public.documento_archivos
SET
  tipo_archivo = CASE
    WHEN upper(COALESCE(NULLIF(btrim(tipo_archivo), ''), 'OTRO')) IN ('PDF', 'XML', 'CDR', 'JSON', 'ZIP', 'OTRO') THEN upper(COALESCE(NULLIF(btrim(tipo_archivo), ''), 'OTRO'))
    ELSE 'OTRO'
  END,
  nombre_archivo = COALESCE(NULLIF(btrim(COALESCE(nombre_archivo, '')), ''), NULLIF(btrim(COALESCE(nombre, '')), ''), 'archivo'),
  uploaded_at = COALESCE(uploaded_at, created_at, now()),
  size_bytes = GREATEST(COALESCE(size_bytes, 0), 0),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(estado), ''), 'ACTIVO')) IN ('ACTIVO', 'ARCHIVADO', 'ELIMINADO') THEN upper(COALESCE(NULLIF(btrim(estado), ''), 'ACTIVO'))
    ELSE 'ACTIVO'
  END
WHERE id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- FKs operativas para joins/embeds runtime.
-- ----------------------------------------------------------------------------
SELECT app.add_fk_if_possible(
  'documentos',
  'pedido_id',
  'pedidos_venta',
  'id',
  'documentos_pedido_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'documentos',
  'cliente_id',
  'clientes',
  'id',
  'documentos_cliente_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'documentos',
  'cotizacion_origen_id',
  'cotizaciones',
  'id',
  'documentos_cotizacion_origen_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'documentos',
  'created_by',
  'usuarios_sistema',
  'id',
  'documentos_created_by_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'documentos',
  'updated_by',
  'usuarios_sistema',
  'id',
  'documentos_updated_by_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'documento_detalles',
  'documento_id',
  'documentos',
  'id',
  'documento_detalles_documento_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'documento_detalles',
  'producto_id',
  'productos',
  'id',
  'documento_detalles_producto_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'documento_auditoria',
  'documento_id',
  'documentos',
  'id',
  'documento_auditoria_documento_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'documento_auditoria',
  'usuario_id',
  'usuarios_sistema',
  'id',
  'documento_auditoria_usuario_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'documento_archivos',
  'documento_id',
  'documentos',
  'id',
  'documento_archivos_documento_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'documento_archivos',
  'uploaded_by',
  'usuarios_sistema',
  'id',
  'documento_archivos_uploaded_by_fkey_runtime'
);

-- ----------------------------------------------------------------------------
-- Dedupe por scope antes de índices únicos.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    d.id,
    d.numero,
    row_number() OVER (
      PARTITION BY d.tenant_id, upper(btrim(d.tipo_documento)), upper(btrim(d.serie)), upper(btrim(d.numero))
      ORDER BY COALESCE(d.updated_at, d.created_at, now()) DESC, d.id::text DESC
    ) AS rn
  FROM public.documentos d
  WHERE d.tenant_id IS NOT NULL
    AND d.tipo_documento IS NOT NULL AND btrim(d.tipo_documento) <> ''
    AND d.serie IS NOT NULL AND btrim(d.serie) <> ''
    AND d.numero IS NOT NULL AND btrim(d.numero) <> ''
)
UPDATE public.documentos d
SET numero = format('%s-DUP-%s', upper(btrim(r.numero)), r.rn),
    updated_at = now()
FROM ranked r
WHERE d.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    dd.id,
    row_number() OVER (
      PARTITION BY dd.documento_id
      ORDER BY COALESCE(dd.orden, 0), COALESCE(dd.updated_at, dd.created_at, now()), dd.id::text
    ) AS rn
  FROM public.documento_detalles dd
  WHERE dd.documento_id IS NOT NULL
)
UPDATE public.documento_detalles dd
SET orden = r.rn,
    updated_at = now()
FROM ranked r
WHERE dd.id = r.id
  AND (dd.orden IS NULL OR dd.orden <> r.rn OR dd.orden < 1);
-- ----------------------------------------------------------------------------
-- Triggers de consistencia tenant.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_documentos_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
  v_ref_cliente uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.pedido_id := app.to_uuid_or_null(COALESCE(NEW.pedido_id::text, ''));
  NEW.cliente_id := app.to_uuid_or_null(COALESCE(NEW.cliente_id::text, ''));
  NEW.cotizacion_origen_id := app.to_uuid_or_null(COALESCE(NEW.cotizacion_origen_id::text, ''));

  IF NEW.pedido_id IS NOT NULL THEN
    SELECT p.tenant_id, p.cliente_id
    INTO v_ref_tenant, v_ref_cliente
    FROM public.pedidos_venta p
    WHERE p.id = NEW.pedido_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Pedido de venta no existe: %s', NEW.pedido_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con pedido_id en documentos',
              ERRCODE = '23514';
    END IF;

    IF NEW.cliente_id IS NULL THEN
      NEW.cliente_id := v_ref_cliente;
    ELSIF v_ref_cliente IS NOT NULL AND NEW.cliente_id <> v_ref_cliente THEN
      RAISE EXCEPTION
        USING MESSAGE = 'cliente_id no coincide con pedido_id en documentos',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.cotizacion_origen_id IS NOT NULL THEN
    SELECT c.tenant_id, c.cliente_id
    INTO v_ref_tenant, v_ref_cliente
    FROM public.cotizaciones c
    WHERE c.id = NEW.cotizacion_origen_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Cotizacion no existe: %s', NEW.cotizacion_origen_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con cotizacion_origen_id en documentos',
              ERRCODE = '23514';
    END IF;

    IF NEW.cliente_id IS NULL THEN
      NEW.cliente_id := v_ref_cliente;
    ELSIF v_ref_cliente IS NOT NULL AND NEW.cliente_id <> v_ref_cliente THEN
      RAISE EXCEPTION
        USING MESSAGE = 'cliente_id no coincide con cotizacion_origen_id en documentos',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.cliente_id IS NOT NULL THEN
    SELECT c.tenant_id
    INTO v_ref_tenant
    FROM public.clientes c
    WHERE c.id = NEW.cliente_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Cliente no existe: %s', NEW.cliente_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con cliente_id en documentos',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id es obligatorio en documentos',
            ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_documentos_tenant_consistency ON public.documentos;
CREATE TRIGGER trg_enforce_documentos_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, pedido_id, cliente_id, cotizacion_origen_id
ON public.documentos
FOR EACH ROW
EXECUTE FUNCTION app.enforce_documentos_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_documento_detalles_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
  v_product_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.documento_id := app.to_uuid_or_null(COALESCE(NEW.documento_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));

  IF NEW.documento_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'documento_id es obligatorio en documento_detalles',
            ERRCODE = '23514';
  END IF;

  SELECT d.tenant_id
  INTO v_ref_tenant
  FROM public.documentos d
  WHERE d.id = NEW.documento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING MESSAGE = format('Documento no existe: %s', NEW.documento_id),
            ERRCODE = '23503';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_ref_tenant;
  ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id no coincide con documento_id en documento_detalles',
            ERRCODE = '23514';
  END IF;

  IF NEW.producto_id IS NOT NULL THEN
    SELECT p.tenant_id
    INTO v_product_tenant
    FROM public.productos p
    WHERE p.id = NEW.producto_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Producto no existe: %s', NEW.producto_id),
              ERRCODE = '23503';
    END IF;

    IF v_product_tenant IS NOT NULL AND NEW.tenant_id <> v_product_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con producto_id en documento_detalles',
              ERRCODE = '23514';
    END IF;
  END IF;

  NEW.orden := CASE WHEN COALESCE(NEW.orden, 0) < 1 THEN 1 ELSE NEW.orden END;
  NEW.cantidad := CASE WHEN COALESCE(NEW.cantidad, 0) <= 0 THEN 1 ELSE NEW.cantidad END;
  NEW.precio_unitario := GREATEST(COALESCE(NEW.precio_unitario, 0), 0);
  NEW.descuento_unitario := GREATEST(COALESCE(NEW.descuento_unitario, 0), 0);
  NEW.valor_venta := GREATEST(COALESCE(NULLIF(NEW.valor_venta, 0), NEW.cantidad * NEW.precio_unitario - NEW.descuento_unitario), 0);
  NEW.impuesto_igv := GREATEST(COALESCE(NEW.impuesto_igv, 0), 0);
  NEW.impuesto_isc := GREATEST(COALESCE(NEW.impuesto_isc, 0), 0);
  NEW.total_item := GREATEST(COALESCE(NULLIF(NEW.total_item, 0), NEW.valor_venta + NEW.impuesto_igv + NEW.impuesto_isc), 0);

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id es obligatorio en documento_detalles',
            ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_documento_detalles_tenant_consistency ON public.documento_detalles;
CREATE TRIGGER trg_enforce_documento_detalles_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, documento_id, producto_id, orden, cantidad, precio_unitario, total_item
ON public.documento_detalles
FOR EACH ROW
EXECUTE FUNCTION app.enforce_documento_detalles_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_documento_auditoria_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
  v_user_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.documento_id := app.to_uuid_or_null(COALESCE(NEW.documento_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));

  IF NEW.documento_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'documento_id es obligatorio en documento_auditoria',
            ERRCODE = '23514';
  END IF;

  SELECT d.tenant_id
  INTO v_ref_tenant
  FROM public.documentos d
  WHERE d.id = NEW.documento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING MESSAGE = format('Documento no existe: %s', NEW.documento_id),
            ERRCODE = '23503';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_ref_tenant;
  ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id no coincide con documento_id en documento_auditoria',
            ERRCODE = '23514';
  END IF;

  IF NEW.usuario_id IS NOT NULL THEN
    SELECT u.tenant_id
    INTO v_user_tenant
    FROM public.usuarios_sistema u
    WHERE u.id = NEW.usuario_id;

    IF FOUND AND v_user_tenant IS NOT NULL AND NEW.tenant_id <> v_user_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con usuario_id en documento_auditoria',
              ERRCODE = '23514';
    END IF;
  END IF;

  NEW.accion := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.accion, ''))), ''), 'ACTUALIZADO');
  NEW.detalles_cambio := COALESCE(NULLIF(btrim(COALESCE(NEW.detalles_cambio, '')), ''), 'Sin detalle');
  NEW."timestamp" := COALESCE(NEW."timestamp", NEW.created_at, now());

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id es obligatorio en documento_auditoria',
            ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_documento_auditoria_tenant_consistency ON public.documento_auditoria;
CREATE TRIGGER trg_enforce_documento_auditoria_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, documento_id, usuario_id, accion, "timestamp"
ON public.documento_auditoria
FOR EACH ROW
EXECUTE FUNCTION app.enforce_documento_auditoria_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_documento_archivos_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
  v_user_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.documento_id := app.to_uuid_or_null(COALESCE(NEW.documento_id::text, ''));
  NEW.uploaded_by := app.to_uuid_or_null(COALESCE(NEW.uploaded_by::text, ''));

  IF NEW.documento_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'documento_id es obligatorio en documento_archivos',
            ERRCODE = '23514';
  END IF;

  SELECT d.tenant_id
  INTO v_ref_tenant
  FROM public.documentos d
  WHERE d.id = NEW.documento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING MESSAGE = format('Documento no existe: %s', NEW.documento_id),
            ERRCODE = '23503';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_ref_tenant;
  ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id no coincide con documento_id en documento_archivos',
            ERRCODE = '23514';
  END IF;

  IF NEW.uploaded_by IS NOT NULL THEN
    SELECT u.tenant_id
    INTO v_user_tenant
    FROM public.usuarios_sistema u
    WHERE u.id = NEW.uploaded_by;

    IF FOUND AND v_user_tenant IS NOT NULL AND NEW.tenant_id <> v_user_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con uploaded_by en documento_archivos',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id es obligatorio en documento_archivos',
            ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_documento_archivos_tenant_consistency ON public.documento_archivos;
CREATE TRIGGER trg_enforce_documento_archivos_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, documento_id, uploaded_by
ON public.documento_archivos
FOR EACH ROW
EXECUTE FUNCTION app.enforce_documento_archivos_tenant_consistency();
-- ----------------------------------------------------------------------------
-- Constraints de negocio (idempotentes) + validación.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documentos_ids_required'
      AND conrelid = 'public.documentos'::regclass
  ) THEN
    ALTER TABLE public.documentos
      ADD CONSTRAINT ck_documentos_ids_required
      CHECK (tenant_id IS NOT NULL) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documentos_identificacion_required'
      AND conrelid = 'public.documentos'::regclass
  ) THEN
    ALTER TABLE public.documentos
      ADD CONSTRAINT ck_documentos_identificacion_required
      CHECK (
        tipo_documento IS NOT NULL AND btrim(tipo_documento) <> ''
        AND serie IS NOT NULL AND btrim(serie) <> ''
        AND numero IS NOT NULL AND btrim(numero) <> ''
      ) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documentos_tipo_valid'
      AND conrelid = 'public.documentos'::regclass
  ) THEN
    ALTER TABLE public.documentos
      ADD CONSTRAINT ck_documentos_tipo_valid
      CHECK (tipo_documento IN ('FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'CONTRATO', 'TICKET', 'GUIA', 'OTRO')) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documentos_estado_valid'
      AND conrelid = 'public.documentos'::regclass
  ) THEN
    ALTER TABLE public.documentos
      ADD CONSTRAINT ck_documentos_estado_valid
      CHECK (estado IN ('BORRADOR', 'EMITIDO', 'ENVIADO_SUNAT', 'OBSERVADO', 'RECHAZADO', 'ANULADO')) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documentos_fecha_emision_required'
      AND conrelid = 'public.documentos'::regclass
  ) THEN
    ALTER TABLE public.documentos
      ADD CONSTRAINT ck_documentos_fecha_emision_required
      CHECK (fecha_emision IS NOT NULL) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documentos_fecha_vencimiento_valid'
      AND conrelid = 'public.documentos'::regclass
  ) THEN
    ALTER TABLE public.documentos
      ADD CONSTRAINT ck_documentos_fecha_vencimiento_valid
      CHECK (fecha_vencimiento IS NULL OR fecha_vencimiento >= fecha_emision) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documentos_montos_nonnegative'
      AND conrelid = 'public.documentos'::regclass
  ) THEN
    ALTER TABLE public.documentos
      ADD CONSTRAINT ck_documentos_montos_nonnegative
      CHECK (
        subtotal >= 0
        AND descuentos >= 0
        AND impuesto_igv >= 0
        AND impuesto_isc >= 0
        AND otros_impuestos >= 0
        AND total >= 0
        AND tipo_cambio > 0
      ) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documentos_moneda_iso3'
      AND conrelid = 'public.documentos'::regclass
  ) THEN
    ALTER TABLE public.documentos
      ADD CONSTRAINT ck_documentos_moneda_iso3
      CHECK (moneda ~ '^[A-Z]{3}$') NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documento_detalles_ids_required'
      AND conrelid = 'public.documento_detalles'::regclass
  ) THEN
    ALTER TABLE public.documento_detalles
      ADD CONSTRAINT ck_documento_detalles_ids_required
      CHECK (tenant_id IS NOT NULL AND documento_id IS NOT NULL) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documento_detalles_orden_positive'
      AND conrelid = 'public.documento_detalles'::regclass
  ) THEN
    ALTER TABLE public.documento_detalles
      ADD CONSTRAINT ck_documento_detalles_orden_positive
      CHECK (orden >= 1) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documento_detalles_descripcion_nonempty'
      AND conrelid = 'public.documento_detalles'::regclass
  ) THEN
    ALTER TABLE public.documento_detalles
      ADD CONSTRAINT ck_documento_detalles_descripcion_nonempty
      CHECK (descripcion IS NOT NULL AND btrim(descripcion) <> '') NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documento_detalles_cantidad_positive'
      AND conrelid = 'public.documento_detalles'::regclass
  ) THEN
    ALTER TABLE public.documento_detalles
      ADD CONSTRAINT ck_documento_detalles_cantidad_positive
      CHECK (cantidad > 0) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documento_detalles_montos_nonnegative'
      AND conrelid = 'public.documento_detalles'::regclass
  ) THEN
    ALTER TABLE public.documento_detalles
      ADD CONSTRAINT ck_documento_detalles_montos_nonnegative
      CHECK (
        precio_unitario >= 0
        AND descuento_unitario >= 0
        AND valor_venta >= 0
        AND impuesto_igv >= 0
        AND impuesto_isc >= 0
        AND total_item >= 0
      ) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documento_auditoria_ids_required'
      AND conrelid = 'public.documento_auditoria'::regclass
  ) THEN
    ALTER TABLE public.documento_auditoria
      ADD CONSTRAINT ck_documento_auditoria_ids_required
      CHECK (tenant_id IS NOT NULL AND documento_id IS NOT NULL) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documento_auditoria_accion_nonempty'
      AND conrelid = 'public.documento_auditoria'::regclass
  ) THEN
    ALTER TABLE public.documento_auditoria
      ADD CONSTRAINT ck_documento_auditoria_accion_nonempty
      CHECK (accion IS NOT NULL AND btrim(accion) <> '') NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documento_auditoria_timestamp_required'
      AND conrelid = 'public.documento_auditoria'::regclass
  ) THEN
    ALTER TABLE public.documento_auditoria
      ADD CONSTRAINT ck_documento_auditoria_timestamp_required
      CHECK ("timestamp" IS NOT NULL) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documento_archivos_ids_required'
      AND conrelid = 'public.documento_archivos'::regclass
  ) THEN
    ALTER TABLE public.documento_archivos
      ADD CONSTRAINT ck_documento_archivos_ids_required
      CHECK (tenant_id IS NOT NULL AND documento_id IS NOT NULL) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documento_archivos_tipo_valid'
      AND conrelid = 'public.documento_archivos'::regclass
  ) THEN
    ALTER TABLE public.documento_archivos
      ADD CONSTRAINT ck_documento_archivos_tipo_valid
      CHECK (tipo_archivo IN ('PDF', 'XML', 'CDR', 'JSON', 'ZIP', 'OTRO')) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documento_archivos_estado_valid'
      AND conrelid = 'public.documento_archivos'::regclass
  ) THEN
    ALTER TABLE public.documento_archivos
      ADD CONSTRAINT ck_documento_archivos_estado_valid
      CHECK (estado IN ('ACTIVO', 'ARCHIVADO', 'ELIMINADO')) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documento_archivos_size_nonnegative'
      AND conrelid = 'public.documento_archivos'::regclass
  ) THEN
    ALTER TABLE public.documento_archivos
      ADD CONSTRAINT ck_documento_archivos_size_nonnegative
      CHECK (size_bytes >= 0) NOT VALID;
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.documentos
  VALIDATE CONSTRAINT ck_documentos_ids_required;
ALTER TABLE IF EXISTS public.documentos
  VALIDATE CONSTRAINT ck_documentos_identificacion_required;
ALTER TABLE IF EXISTS public.documentos
  VALIDATE CONSTRAINT ck_documentos_tipo_valid;
ALTER TABLE IF EXISTS public.documentos
  VALIDATE CONSTRAINT ck_documentos_estado_valid;
ALTER TABLE IF EXISTS public.documentos
  VALIDATE CONSTRAINT ck_documentos_fecha_emision_required;
ALTER TABLE IF EXISTS public.documentos
  VALIDATE CONSTRAINT ck_documentos_fecha_vencimiento_valid;
ALTER TABLE IF EXISTS public.documentos
  VALIDATE CONSTRAINT ck_documentos_montos_nonnegative;
ALTER TABLE IF EXISTS public.documentos
  VALIDATE CONSTRAINT ck_documentos_moneda_iso3;

ALTER TABLE IF EXISTS public.documento_detalles
  VALIDATE CONSTRAINT ck_documento_detalles_ids_required;
ALTER TABLE IF EXISTS public.documento_detalles
  VALIDATE CONSTRAINT ck_documento_detalles_orden_positive;
ALTER TABLE IF EXISTS public.documento_detalles
  VALIDATE CONSTRAINT ck_documento_detalles_descripcion_nonempty;
ALTER TABLE IF EXISTS public.documento_detalles
  VALIDATE CONSTRAINT ck_documento_detalles_cantidad_positive;
ALTER TABLE IF EXISTS public.documento_detalles
  VALIDATE CONSTRAINT ck_documento_detalles_montos_nonnegative;

ALTER TABLE IF EXISTS public.documento_auditoria
  VALIDATE CONSTRAINT ck_documento_auditoria_ids_required;
ALTER TABLE IF EXISTS public.documento_auditoria
  VALIDATE CONSTRAINT ck_documento_auditoria_accion_nonempty;
ALTER TABLE IF EXISTS public.documento_auditoria
  VALIDATE CONSTRAINT ck_documento_auditoria_timestamp_required;

ALTER TABLE IF EXISTS public.documento_archivos
  VALIDATE CONSTRAINT ck_documento_archivos_ids_required;
ALTER TABLE IF EXISTS public.documento_archivos
  VALIDATE CONSTRAINT ck_documento_archivos_tipo_valid;
ALTER TABLE IF EXISTS public.documento_archivos
  VALIDATE CONSTRAINT ck_documento_archivos_estado_valid;
ALTER TABLE IF EXISTS public.documento_archivos
  VALIDATE CONSTRAINT ck_documento_archivos_size_nonnegative;

-- ----------------------------------------------------------------------------
-- Índices de unicidad y soporte.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_documentos_tenant_tipo_serie_numero_runtime
ON public.documentos (tenant_id, upper(tipo_documento), upper(serie), upper(numero))
WHERE tenant_id IS NOT NULL
  AND tipo_documento IS NOT NULL AND btrim(tipo_documento) <> ''
  AND serie IS NOT NULL AND btrim(serie) <> ''
  AND numero IS NOT NULL AND btrim(numero) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_documento_detalles_documento_orden_runtime
ON public.documento_detalles (documento_id, orden)
WHERE documento_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documentos_tenant_cliente_runtime
ON public.documentos (tenant_id, cliente_id)
WHERE tenant_id IS NOT NULL AND cliente_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documentos_tenant_pedido_runtime
ON public.documentos (tenant_id, pedido_id)
WHERE tenant_id IS NOT NULL AND pedido_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Hardening RLS explícito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'documentos');
SELECT app.apply_tenant_policy('public', 'documento_detalles');
SELECT app.apply_tenant_policy('public', 'documento_auditoria');
SELECT app.apply_tenant_policy('public', 'documento_archivos');

COMMIT;
