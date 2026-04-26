-- ============================================================================
-- 281__fiscal_retenciones_proveedores_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive de estado para fiscal/retenciones/proveedores.
-- Tablas foco:
--   public.configuracion_fiscal
--   public.configuracion_retenciones
--   public.proveedores
--   public.proveedores_cuarta_categoria
--   public.libro_retenciones
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helper canonico de normalizacion por vertical.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_fiscal_retenciones_proveedores_estado_281(
  p_table text,
  p_estado text,
  p_activo boolean DEFAULT NULL
)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_table text;
  v text;
BEGIN
  v_table := lower(COALESCE(NULLIF(btrim(COALESCE(p_table, '')), ''), ''));
  v := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), ''));

  IF v IN ('ENABLED', 'HABILITADO', 'VIGENTE', 'ACTIVA') THEN
    v := 'ACTIVO';
  END IF;
  IF v IN ('DISABLED', 'DESHABILITADO', 'INACTIVA', 'BAJA', 'ARCHIVADO') THEN
    v := 'INACTIVO';
  END IF;

  IF v IN ('CANCELADO', 'CANCELADA') THEN
    v := 'ANULADO';
  END IF;
  IF v IN ('PROCESADO', 'COMPLETADO', 'COMPLETADA') THEN
    v := 'PROCESADA';
  END IF;

  IF v_table = 'libro_retenciones' THEN
    IF v = '' THEN
      v := 'ACTIVO';
    END IF;
    IF v = 'INACTIVO' THEN
      v := 'ANULADO';
    END IF;
    IF v NOT IN ('ACTIVO', 'ANULADO', 'PENDIENTE', 'PROCESADA') THEN
      v := 'ACTIVO';
    END IF;
    RETURN v::citext;
  END IF;

  IF v = '' THEN
    v := CASE WHEN COALESCE(p_activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END;
  END IF;
  IF v NOT IN ('ACTIVO', 'INACTIVO') THEN
    v := CASE WHEN COALESCE(p_activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END;
  END IF;

  RETURN v::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Garantizar columnas minimas de contrato.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.configuracion_fiscal
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'ACTIVO',
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.configuracion_retenciones
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'ACTIVO',
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.proveedores
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'ACTIVO',
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.proveedores_cuarta_categoria
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'ACTIVO',
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.libro_retenciones
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'ACTIVO',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ----------------------------------------------------------------------------
-- Normalizadores runtime (reemplazo compatible de funciones existentes).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_configuracion_fiscal_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_pais_moneda text;
BEGIN
  NEW.codigo := upper(NULLIF(btrim(COALESCE(NEW.codigo, '')), ''));
  NEW.nombre := NULLIF(btrim(COALESCE(NEW.nombre, '')), '');
  NEW.impuesto_principal_nombre := upper(
    COALESCE(NULLIF(btrim(COALESCE(NEW.impuesto_principal_nombre, '')), ''), 'IGV')
  );

  NEW.tasa_igv := COALESCE(
    app.normalize_tax_ratio(NEW.tasa_igv),
    app.normalize_tax_ratio(NEW.impuesto_principal_porcentaje),
    0.18
  );
  NEW.impuesto_principal_porcentaje := COALESCE(
    app.normalize_tax_ratio(NEW.impuesto_principal_porcentaje),
    NEW.tasa_igv,
    0.18
  );
  NEW.tasa_igv := COALESCE(NEW.tasa_igv, NEW.impuesto_principal_porcentaje, 0.18);

  NEW.retencion_renta_porcentaje := COALESCE(app.normalize_tax_ratio(NEW.retencion_renta_porcentaje), 0);
  NEW.retencion_iva_porcentaje := COALESCE(app.normalize_tax_ratio(NEW.retencion_iva_porcentaje), 0);
  NEW.percepcion_porcentaje := COALESCE(app.normalize_tax_ratio(NEW.percepcion_porcentaje), 0);
  NEW.detraccion_porcentaje := COALESCE(app.normalize_tax_ratio(NEW.detraccion_porcentaje), 0);

  NEW.documento_identidad_empresa := upper(
    COALESCE(NULLIF(btrim(COALESCE(NEW.documento_identidad_empresa, '')), ''), 'RUC')
  );
  NEW.longitud_documento_empresa := GREATEST(COALESCE(NEW.longitud_documento_empresa, 11), 1);
  NEW.max_items_por_documento := GREATEST(COALESCE(NEW.max_items_por_documento, 999), 1);
  NEW.monto_maximo_documento := GREATEST(COALESCE(NEW.monto_maximo_documento, 999999999.99), 0.01);

  NEW.formato_fecha := COALESCE(NULLIF(btrim(COALESCE(NEW.formato_fecha, '')), ''), 'DD/MM/YYYY');
  NEW.separador_decimal := COALESCE(NULLIF(btrim(COALESCE(NEW.separador_decimal, '')), ''), '.');
  NEW.separador_miles := COALESCE(NULLIF(btrim(COALESCE(NEW.separador_miles, '')), ''), ',');

  NEW.activo := COALESCE(NEW.activo, true);
  NEW.estado := app.normalize_fiscal_retenciones_proveedores_estado_281(
    'configuracion_fiscal',
    NEW.estado::text,
    NEW.activo
  );
  NEW.activo := (lower(NEW.estado::text) = 'activo');

  NEW.moneda_principal := upper(NULLIF(btrim(COALESCE(NEW.moneda_principal, '')), ''));
  IF NEW.moneda_principal IS NULL AND NEW.pais_id IS NOT NULL THEN
    SELECT p.moneda_codigo
    INTO v_pais_moneda
    FROM public.paises p
    WHERE p.id = NEW.pais_id
    LIMIT 1;
  END IF;

  NEW.moneda_principal := COALESCE(
    NEW.moneda_principal,
    upper(NULLIF(btrim(COALESCE(v_pais_moneda, '')), '')),
    'PEN'
  );

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_configuracion_retenciones_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_categoria text;
BEGIN
  v_categoria := upper(NULLIF(btrim(COALESCE(NEW.categoria, '')), ''));
  IF v_categoria IS NULL THEN
    IF NEW.codigo IS NOT NULL AND upper(NEW.codigo) LIKE '%CUARTA%' THEN
      v_categoria := 'CUARTA';
    ELSIF NEW.codigo IS NOT NULL AND upper(NEW.codigo) LIKE '%QUINTA%' THEN
      v_categoria := 'QUINTA';
    ELSIF NEW.nombre IS NOT NULL AND upper(NEW.nombre) LIKE '%CUARTA%' THEN
      v_categoria := 'CUARTA';
    ELSIF NEW.nombre IS NOT NULL AND upper(NEW.nombre) LIKE '%QUINTA%' THEN
      v_categoria := 'QUINTA';
    END IF;
  END IF;

  NEW.categoria := COALESCE(v_categoria, 'CUARTA');
  NEW.codigo := COALESCE(
    upper(NULLIF(btrim(COALESCE(NEW.codigo, '')), '')),
    NEW.categoria
  );
  NEW.nombre := COALESCE(
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    format('RETENCION_%s', NEW.categoria)
  );
  NEW.descripcion := COALESCE(
    NULLIF(btrim(COALESCE(NEW.descripcion, '')), ''),
    CASE NEW.categoria
      WHEN 'CUARTA' THEN 'Configuración de retención cuarta categoría'
      WHEN 'QUINTA' THEN 'Configuración de retención quinta categoría'
      ELSE format('Configuración de retención %s', NEW.categoria)
    END
  );

  NEW.tasa_porcentaje := GREATEST(
    0,
    LEAST(100, round(COALESCE(NEW.tasa_porcentaje, 0)::numeric, 4))
  );
  NEW.monto_minimo := GREATEST(
    0,
    round(COALESCE(NEW.monto_minimo, 0)::numeric, 2)
  );

  NEW.activo := COALESCE(NEW.activo, true);
  NEW.estado := app.normalize_fiscal_retenciones_proveedores_estado_281(
    'configuracion_retenciones',
    NEW.estado::text,
    NEW.activo
  );
  NEW.activo := (lower(NEW.estado::text) = 'activo');
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

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
    lower(
      app.normalize_fiscal_retenciones_proveedores_estado_281(
        'proveedores',
        NEW.estado::text,
        true
      )::text
    ) = 'activo'
  );
  NEW.estado := app.normalize_fiscal_retenciones_proveedores_estado_281(
    'proveedores',
    NEW.estado::text,
    NEW.activo
  );
  NEW.activo := (lower(NEW.estado::text) = 'activo');

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_proveedores_cuarta_categoria_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.activo := COALESCE(NEW.activo, true);
  NEW.estado := app.normalize_fiscal_retenciones_proveedores_estado_281(
    'proveedores_cuarta_categoria',
    NEW.estado::text,
    NEW.activo
  );
  NEW.activo := (lower(NEW.estado::text) = 'activo');
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_libro_retenciones_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_categoria text;
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

  NEW.estado := app.normalize_fiscal_retenciones_proveedores_estado_281(
    'libro_retenciones',
    NEW.estado::text,
    NULL
  );

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_configuracion_fiscal_row ON public.configuracion_fiscal;
CREATE TRIGGER trg_normalize_configuracion_fiscal_row
BEFORE INSERT OR UPDATE ON public.configuracion_fiscal
FOR EACH ROW
EXECUTE FUNCTION app.normalize_configuracion_fiscal_row();

DROP TRIGGER IF EXISTS trg_normalize_configuracion_retenciones_row ON public.configuracion_retenciones;
CREATE TRIGGER trg_normalize_configuracion_retenciones_row
BEFORE INSERT OR UPDATE ON public.configuracion_retenciones
FOR EACH ROW
EXECUTE FUNCTION app.normalize_configuracion_retenciones_row();

DROP TRIGGER IF EXISTS trg_normalize_proveedores_documentos_row ON public.proveedores;
CREATE TRIGGER trg_normalize_proveedores_documentos_row
BEFORE INSERT OR UPDATE ON public.proveedores
FOR EACH ROW
EXECUTE FUNCTION app.normalize_proveedores_documentos_row();

DROP TRIGGER IF EXISTS trg_normalize_proveedores_cuarta_categoria_row ON public.proveedores_cuarta_categoria;
CREATE TRIGGER trg_normalize_proveedores_cuarta_categoria_row
BEFORE INSERT OR UPDATE ON public.proveedores_cuarta_categoria
FOR EACH ROW
EXECUTE FUNCTION app.normalize_proveedores_cuarta_categoria_row();

DROP TRIGGER IF EXISTS trg_normalize_libro_retenciones_row ON public.libro_retenciones;
CREATE TRIGGER trg_normalize_libro_retenciones_row
BEFORE INSERT OR UPDATE ON public.libro_retenciones
FOR EACH ROW
EXECUTE FUNCTION app.normalize_libro_retenciones_row();

-- ----------------------------------------------------------------------------
-- Migracion de estado a citext + defaults canonicos.
-- ----------------------------------------------------------------------------
ALTER TABLE public.configuracion_fiscal
  ALTER COLUMN estado TYPE citext
  USING app.normalize_fiscal_retenciones_proveedores_estado_281('configuracion_fiscal', estado::text, COALESCE(activo, true)),
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;

ALTER TABLE public.configuracion_retenciones
  ALTER COLUMN estado TYPE citext
  USING app.normalize_fiscal_retenciones_proveedores_estado_281('configuracion_retenciones', estado::text, COALESCE(activo, true)),
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;

ALTER TABLE public.proveedores
  ALTER COLUMN estado TYPE citext
  USING app.normalize_fiscal_retenciones_proveedores_estado_281('proveedores', estado::text, COALESCE(activo, true)),
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;

ALTER TABLE public.proveedores_cuarta_categoria
  ALTER COLUMN estado TYPE citext
  USING app.normalize_fiscal_retenciones_proveedores_estado_281('proveedores_cuarta_categoria', estado::text, COALESCE(activo, true)),
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;

ALTER TABLE public.libro_retenciones
  ALTER COLUMN estado TYPE citext
  USING app.normalize_fiscal_retenciones_proveedores_estado_281('libro_retenciones', estado::text, NULL),
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;

-- ----------------------------------------------------------------------------
-- Backfill defensivo y sincronia estado/activo.
-- ----------------------------------------------------------------------------
UPDATE public.configuracion_fiscal
SET
  activo = COALESCE(
    activo,
    lower(
      app.normalize_fiscal_retenciones_proveedores_estado_281(
        'configuracion_fiscal',
        estado::text,
        true
      )::text
    ) = 'activo'
  ),
  estado = CASE
    WHEN COALESCE(
      activo,
      lower(app.normalize_fiscal_retenciones_proveedores_estado_281('configuracion_fiscal', estado::text, true)::text) = 'activo'
    ) THEN 'ACTIVO'::citext
    ELSE 'INACTIVO'::citext
  END,
  updated_at = COALESCE(updated_at, now());

UPDATE public.configuracion_retenciones
SET
  activo = COALESCE(
    activo,
    lower(
      app.normalize_fiscal_retenciones_proveedores_estado_281(
        'configuracion_retenciones',
        estado::text,
        true
      )::text
    ) = 'activo'
  ),
  estado = CASE
    WHEN COALESCE(
      activo,
      lower(app.normalize_fiscal_retenciones_proveedores_estado_281('configuracion_retenciones', estado::text, true)::text) = 'activo'
    ) THEN 'ACTIVO'::citext
    ELSE 'INACTIVO'::citext
  END,
  updated_at = COALESCE(updated_at, now());

UPDATE public.proveedores
SET
  activo = COALESCE(
    activo,
    lower(app.normalize_fiscal_retenciones_proveedores_estado_281('proveedores', estado::text, true)::text) = 'activo'
  ),
  estado = CASE
    WHEN COALESCE(
      activo,
      lower(app.normalize_fiscal_retenciones_proveedores_estado_281('proveedores', estado::text, true)::text) = 'activo'
    ) THEN 'ACTIVO'::citext
    ELSE 'INACTIVO'::citext
  END,
  updated_at = COALESCE(updated_at, now());

UPDATE public.proveedores_cuarta_categoria
SET
  activo = COALESCE(
    activo,
    lower(
      app.normalize_fiscal_retenciones_proveedores_estado_281(
        'proveedores_cuarta_categoria',
        estado::text,
        true
      )::text
    ) = 'activo'
  ),
  estado = CASE
    WHEN COALESCE(
      activo,
      lower(app.normalize_fiscal_retenciones_proveedores_estado_281('proveedores_cuarta_categoria', estado::text, true)::text) = 'activo'
    ) THEN 'ACTIVO'::citext
    ELSE 'INACTIVO'::citext
  END,
  updated_at = COALESCE(updated_at, now());

UPDATE public.libro_retenciones
SET
  estado = app.normalize_fiscal_retenciones_proveedores_estado_281('libro_retenciones', estado::text, NULL),
  updated_at = COALESCE(updated_at, now());

-- ----------------------------------------------------------------------------
-- Indices runtime CI por estado.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_configuracion_fiscal_tenant_estado_ci_runtime_281
ON public.configuracion_fiscal (tenant_id, estado, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_configuracion_retenciones_tenant_estado_ci_runtime_281
ON public.configuracion_retenciones (tenant_id, estado, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_proveedores_tenant_estado_ci_runtime_281
ON public.proveedores (tenant_id, estado, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_proveedores_cuarta_tenant_estado_ci_runtime_281
ON public.proveedores_cuarta_categoria (tenant_id, estado, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_libro_retenciones_tenant_estado_ci_runtime_281
ON public.libro_retenciones (tenant_id, estado, fecha_pago DESC);

COMMIT;
