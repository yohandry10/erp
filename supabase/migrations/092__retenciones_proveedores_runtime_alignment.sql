-- ============================================================================
-- 092__retenciones_proveedores_runtime_alignment.sql
-- Alineación runtime del módulo de retenciones con contrato de proveedores.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Proveedores: normalizar shape documental usado por RetencionesService.
-- ----------------------------------------------------------------------------
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
