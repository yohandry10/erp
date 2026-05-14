-- ============================================================================
-- 092__retenciones_proveedores_runtime_alignment.sql
-- Alineación runtime del módulo de retenciones con contrato de proveedores.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Proveedores: normalizar shape documental usado por RetencionesService.
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.vw_inventario_recepciones;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'proveedores'
      AND column_name = 'numero_documento'
  ) THEN
    ALTER TABLE public.proveedores
      ALTER COLUMN numero_documento TYPE text
      USING NULLIF(btrim(numero_documento::text), '');
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.proveedores
  ADD COLUMN IF NOT EXISTS tipo_documento text,
  ADD COLUMN IF NOT EXISTS documento_tipo text,
  ADD COLUMN IF NOT EXISTS documento_numero text;

CREATE OR REPLACE VIEW public.vw_inventario_recepciones AS
WITH item_totals AS (
  SELECT
    ri.recepcion_id,
    COUNT(ri.id)::bigint AS total_items,
    COALESCE(SUM(app.to_numeric_or_zero(COALESCE(ri.cantidad_recibida, 0)::text)), 0)::numeric(14,2) AS cantidad_total,
    COALESCE(
      SUM(
        app.to_numeric_or_zero(COALESCE(ri.cantidad_recibida, 0)::text)
        * COALESCE(
            app.to_numeric_or_zero(ocd.precio_unitario::text),
            app.to_numeric_or_zero(prod.precio_compra::text),
            0
          )
      ),
      0
    )::numeric(14,2) AS valor_total,
    MAX(COALESCE(NULLIF(btrim(ocd.moneda), ''), NULLIF(btrim(ri.moneda), ''), 'PEN')) AS moneda
  FROM public.recepcion_items ri
  LEFT JOIN public.orden_compra_detalles ocd ON ocd.id = ri.detalle_id
  LEFT JOIN public.productos prod ON prod.id = ri.producto_id
  GROUP BY ri.recepcion_id
)
SELECT
  r.id AS recepcion_id,
  COALESCE(r.tenant_id, oc.tenant_id) AS tenant_id,
  COALESCE(NULLIF(btrim(r.numero::text), ''), NULLIF(btrim(r.codigo), ''), r.id::text) AS numero,
  COALESCE(r.fecha_recepcion, r.created_at) AS fecha_recepcion,
  COALESCE(r.estado, 'PENDIENTE') AS estado,
  r.observaciones,
  COALESCE(r.gre_proveedor, r.metadata->>'gre_proveedor', oc.metadata->>'gre_proveedor') AS gre_proveedor,
  oc.id AS orden_id,
  COALESCE(
    NULLIF(btrim(oc.numero::text), ''),
    NULLIF(btrim(oc.numero_orden::text), ''),
    NULLIF(btrim(oc.codigo), '')
  ) AS numero_orden,
  p.id AS proveedor_id,
  COALESCE(NULLIF(btrim(p.razon_social), ''), NULLIF(btrim(p.nombre_comercial), ''), NULLIF(btrim(p.nombre), '')) AS proveedor_nombre,
  COALESCE(
    NULLIF(btrim(p.documento_numero), ''),
    NULLIF(btrim(p.ruc), ''),
    CASE WHEN p.numero_documento IS NOT NULL THEN p.numero_documento::text ELSE NULL END
  ) AS proveedor_ruc,
  COALESCE(it.total_items, 0)::bigint AS total_items,
  COALESCE(it.cantidad_total, 0)::numeric(14,2) AS cantidad_total,
  COALESCE(it.valor_total, 0)::numeric(14,2) AS valor_total,
  COALESCE(NULLIF(btrim(it.moneda), ''), NULLIF(btrim(oc.moneda), ''), 'PEN') AS moneda,
  r.created_at,
  r.updated_at
FROM public.recepciones r
LEFT JOIN public.ordenes_compra oc ON oc.id = r.orden_id
LEFT JOIN public.proveedores p ON p.id = oc.proveedor_id
LEFT JOIN item_totals it ON it.recepcion_id = r.id;

CREATE OR REPLACE FUNCTION app.normalize_proveedores_documentos_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_doc_num text;
  v_doc_tipo text;
BEGIN
  v_doc_num := NULLIF(
    btrim(
      COALESCE(
        NEW.documento_numero,
        NEW.numero_documento,
        NEW.ruc
      )
    ),
    ''
  );

  v_doc_tipo := upper(
    NULLIF(
      btrim(
        COALESCE(
          NEW.documento_tipo,
          NEW.tipo_documento,
          ''
        )
      ),
      ''
    )
  );

  IF v_doc_tipo IS NULL THEN
    IF v_doc_num ~ '^[0-9]{11}$' THEN
      v_doc_tipo := 'RUC';
    ELSIF v_doc_num ~ '^[0-9]{9}$' THEN
      v_doc_tipo := 'NIT';
    ELSIF v_doc_num ~ '^[0-9]{8}$' THEN
      v_doc_tipo := 'DNI';
    ELSIF v_doc_num IS NOT NULL THEN
      v_doc_tipo := 'OTROS';
    END IF;
  END IF;

  NEW.ruc := COALESCE(
    NULLIF(btrim(COALESCE(NEW.ruc, '')), ''),
    CASE
      WHEN v_doc_num ~ '^[0-9]{11}$' THEN v_doc_num
      ELSE NULL
    END
  );
  NEW.numero_documento := v_doc_num;
  NEW.documento_numero := v_doc_num;
  NEW.tipo_documento := v_doc_tipo;
  NEW.documento_tipo := v_doc_tipo;

  NEW.email := NULLIF(lower(btrim(COALESCE(NEW.email, ''))), '');
  NEW.razon_social := COALESCE(
    NULLIF(btrim(COALESCE(NEW.razon_social, '')), ''),
    NULLIF(btrim(COALESCE(NEW.nombre_comercial, '')), ''),
    NULLIF(btrim(COALESCE(NEW.nombre, '')), '')
  );
  NEW.nombre_comercial := COALESCE(
    NULLIF(btrim(COALESCE(NEW.nombre_comercial, '')), ''),
    NEW.razon_social
  );

  NEW.activo := COALESCE(
    NEW.activo,
    CASE
      WHEN upper(COALESCE(NEW.estado, 'ACTIVO')) = 'INACTIVO' THEN false
      ELSE true
    END
  );
  NEW.estado := CASE WHEN COALESCE(NEW.activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END;

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_proveedores_documentos_row ON public.proveedores;
CREATE TRIGGER trg_normalize_proveedores_documentos_row
BEFORE INSERT OR UPDATE ON public.proveedores
FOR EACH ROW
EXECUTE FUNCTION app.normalize_proveedores_documentos_row();

UPDATE public.proveedores
SET updated_at = COALESCE(updated_at, now());

-- ----------------------------------------------------------------------------
-- Proveedores cuarta categoría: normalización operativa.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_proveedores_cuarta_categoria_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.activo := COALESCE(NEW.activo, true);
  NEW.estado := CASE WHEN NEW.activo THEN 'ACTIVO' ELSE 'INACTIVO' END;
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_proveedores_cuarta_categoria_row ON public.proveedores_cuarta_categoria;
CREATE TRIGGER trg_normalize_proveedores_cuarta_categoria_row
BEFORE INSERT OR UPDATE ON public.proveedores_cuarta_categoria
FOR EACH ROW
EXECUTE FUNCTION app.normalize_proveedores_cuarta_categoria_row();

UPDATE public.proveedores_cuarta_categoria
SET updated_at = COALESCE(updated_at, now());

-- ----------------------------------------------------------------------------
-- Libro de retenciones: columnas/normalización usadas por API.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.libro_retenciones
  ADD COLUMN IF NOT EXISTS monto_neto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

CREATE OR REPLACE FUNCTION app.normalize_libro_retenciones_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_categoria text;
  v_estado text;
BEGIN
  v_categoria := upper(NULLIF(btrim(COALESCE(NEW.categoria_retencion, '')), ''));
  IF v_categoria IS NULL THEN
    IF NEW.codigo IS NOT NULL AND upper(NEW.codigo) LIKE '%CUARTA%' THEN
      v_categoria := 'CUARTA';
    ELSIF NEW.codigo IS NOT NULL AND upper(NEW.codigo) LIKE '%QUINTA%' THEN
      v_categoria := 'QUINTA';
    ELSE
      v_categoria := 'CUARTA';
    END IF;
  END IF;

  NEW.categoria_retencion := v_categoria;
  NEW.numero_comprobante := NULLIF(btrim(COALESCE(NEW.numero_comprobante, '')), '');
  NEW.numero_correlativo := upper(NULLIF(btrim(COALESCE(NEW.numero_correlativo, '')), ''));
  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, '')), '');

  NEW.monto_pago := GREATEST(0, round(COALESCE(NEW.monto_pago, 0)::numeric, 2));
  NEW.tasa_retencion := GREATEST(0, LEAST(100, round(COALESCE(NEW.tasa_retencion, 0)::numeric, 4)));
  NEW.monto_retencion := GREATEST(0, round(COALESCE(NEW.monto_retencion, 0)::numeric, 2));
  IF NEW.monto_retencion > NEW.monto_pago THEN
    NEW.monto_retencion := NEW.monto_pago;
  END IF;
  NEW.monto_neto := round((COALESCE(NEW.monto_pago, 0) - COALESCE(NEW.monto_retencion, 0))::numeric, 2);

  v_estado := upper(NULLIF(btrim(COALESCE(NEW.estado, '')), ''));
  IF v_estado IS NULL THEN
    v_estado := 'ACTIVO';
  ELSIF v_estado = 'PROCESADA' THEN
    v_estado := 'ACTIVO';
  ELSIF v_estado NOT IN ('ACTIVO', 'ANULADO', 'PENDIENTE') THEN
    v_estado := 'ACTIVO';
  END IF;
  NEW.estado := v_estado;

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_libro_retenciones_row ON public.libro_retenciones;
CREATE TRIGGER trg_normalize_libro_retenciones_row
BEFORE INSERT OR UPDATE ON public.libro_retenciones
FOR EACH ROW
EXECUTE FUNCTION app.normalize_libro_retenciones_row();

UPDATE public.libro_retenciones
SET updated_at = COALESCE(updated_at, now());

-- ----------------------------------------------------------------------------
-- Índices de soporte runtime del módulo.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_proveedores_tenant_ruc_runtime
ON public.proveedores (tenant_id, ruc);

CREATE INDEX IF NOT EXISTS idx_proveedores_tenant_tipo_numero_runtime
ON public.proveedores (tenant_id, tipo_documento, numero_documento);

CREATE INDEX IF NOT EXISTS idx_proveedores_cuarta_tenant_proveedor_activo_runtime
ON public.proveedores_cuarta_categoria (tenant_id, proveedor_id, activo);

CREATE INDEX IF NOT EXISTS idx_libro_retenciones_tenant_fecha_estado_runtime
ON public.libro_retenciones (tenant_id, fecha_pago DESC, estado);

CREATE INDEX IF NOT EXISTS idx_libro_retenciones_tenant_categoria_fecha_runtime
ON public.libro_retenciones (tenant_id, categoria_retencion, fecha_pago DESC);

COMMIT;
