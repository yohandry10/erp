-- ============================================================================
-- 090__fiscal_ui_contract_integrity.sql
-- Integridad y normalización continua del contrato UI fiscal.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Hardening de nullabilidad para campos UI en configuracion_fiscal.
-- ----------------------------------------------------------------------------
UPDATE public.configuracion_fiscal
SET
  requiere_registro_compras = COALESCE(requiere_registro_compras, true),
  requiere_registro_ventas = COALESCE(requiere_registro_ventas, true),
  permite_multiples_monedas = COALESCE(permite_multiples_monedas, false),
  requiere_autorizacion_sunat = COALESCE(requiere_autorizacion_sunat, false)
WHERE
  requiere_registro_compras IS NULL
  OR requiere_registro_ventas IS NULL
  OR permite_multiples_monedas IS NULL
  OR requiere_autorizacion_sunat IS NULL;

ALTER TABLE IF EXISTS public.configuracion_fiscal
  ALTER COLUMN requiere_registro_compras SET NOT NULL,
  ALTER COLUMN requiere_registro_ventas SET NOT NULL,
  ALTER COLUMN permite_multiples_monedas SET NOT NULL,
  ALTER COLUMN requiere_autorizacion_sunat SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Normalización de tipos_documentos_fiscales.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_tipos_documentos_fiscales_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.codigo := upper(NULLIF(btrim(COALESCE(NEW.codigo, '')), ''));
  NEW.nombre := COALESCE(
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    COALESCE(NEW.codigo, 'DOCUMENTO')
  );
  NEW.descripcion := COALESCE(
    NULLIF(btrim(COALESCE(NEW.descripcion, '')), ''),
    NEW.nombre
  );

  NEW.longitud_minima := GREATEST(COALESCE(NEW.longitud_minima, 1), 1);
  NEW.longitud_maxima := GREATEST(COALESCE(NEW.longitud_maxima, NEW.longitud_minima, 20), NEW.longitud_minima, 1);
  NEW.patron_validacion := COALESCE(
    NULLIF(btrim(COALESCE(NEW.patron_validacion, '')), ''),
    '^[A-Z0-9\\-]+$'
  );

  NEW.requiere_ruc := COALESCE(NEW.requiere_ruc, false);
  NEW.permite_exportacion := COALESCE(NEW.permite_exportacion, false);
  NEW.activo := COALESCE(NEW.activo, true);
  NEW.estado := CASE WHEN NEW.activo THEN 'ACTIVO' ELSE 'INACTIVO' END;
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_tipos_documentos_fiscales_row ON public.tipos_documentos_fiscales;
CREATE TRIGGER trg_normalize_tipos_documentos_fiscales_row
BEFORE INSERT OR UPDATE ON public.tipos_documentos_fiscales
FOR EACH ROW
EXECUTE FUNCTION app.normalize_tipos_documentos_fiscales_row();

-- ----------------------------------------------------------------------------
-- Normalización/sincronía de tipos_impuestos.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_tipos_impuestos_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_rate numeric;
BEGIN
  NEW.codigo := upper(NULLIF(btrim(COALESCE(NEW.codigo, '')), ''));
  NEW.nombre := COALESCE(
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    COALESCE(NEW.codigo, 'IMPUESTO')
  );
  NEW.descripcion := COALESCE(
    NULLIF(btrim(COALESCE(NEW.descripcion, '')), ''),
    NEW.nombre
  );

  v_rate := COALESCE(NEW.tasa_porcentaje, NEW.porcentaje, 0);
  v_rate := GREATEST(0, LEAST(100, round(v_rate::numeric, 4)));
  NEW.tasa_porcentaje := v_rate;
  NEW.porcentaje := v_rate;

  NEW.tipo_calculo := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_calculo, '')), ''), 'PORCENTAJE'));
  NEW.aplica_a := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.aplica_a, '')), ''), 'VENTA'));

  NEW.es_retencion := COALESCE(
    NEW.es_retencion,
    CASE
      WHEN upper(COALESCE(NEW.codigo, '')) LIKE '%RET%'
        OR upper(COALESCE(NEW.codigo, '')) LIKE 'RETE%'
        OR upper(COALESCE(NEW.nombre, '')) LIKE '%RETEN%'
      THEN true
      ELSE false
    END
  );

  NEW.activo := COALESCE(NEW.activo, true);
  NEW.estado := CASE WHEN NEW.activo THEN 'ACTIVO' ELSE 'INACTIVO' END;
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_tipos_impuestos_row ON public.tipos_impuestos;
CREATE TRIGGER trg_normalize_tipos_impuestos_row
BEFORE INSERT OR UPDATE ON public.tipos_impuestos
FOR EACH ROW
EXECUTE FUNCTION app.normalize_tipos_impuestos_row();

-- ----------------------------------------------------------------------------
-- Backfill para cumplir constraints.
-- ----------------------------------------------------------------------------
UPDATE public.tipos_documentos_fiscales
SET
  codigo = upper(NULLIF(btrim(COALESCE(codigo, '')), '')),
  nombre = COALESCE(NULLIF(btrim(COALESCE(nombre, '')), ''), COALESCE(upper(NULLIF(btrim(COALESCE(codigo, '')), '')), 'DOCUMENTO')),
  descripcion = COALESCE(NULLIF(btrim(COALESCE(descripcion, '')), ''), COALESCE(NULLIF(btrim(COALESCE(nombre, '')), ''), 'DOCUMENTO')),
  longitud_minima = GREATEST(COALESCE(longitud_minima, 1), 1),
  longitud_maxima = GREATEST(COALESCE(longitud_maxima, longitud_minima, 20), COALESCE(longitud_minima, 1), 1),
  patron_validacion = COALESCE(NULLIF(btrim(COALESCE(patron_validacion, '')), ''), '^[A-Z0-9\\-]+$'),
  requiere_ruc = COALESCE(requiere_ruc, false),
  permite_exportacion = COALESCE(permite_exportacion, false),
  activo = COALESCE(activo, true),
  estado = CASE WHEN COALESCE(activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END,
  updated_at = COALESCE(updated_at, now());

UPDATE public.tipos_impuestos
SET
  codigo = upper(NULLIF(btrim(COALESCE(codigo, '')), '')),
  nombre = COALESCE(NULLIF(btrim(COALESCE(nombre, '')), ''), COALESCE(upper(NULLIF(btrim(COALESCE(codigo, '')), '')), 'IMPUESTO')),
  descripcion = COALESCE(NULLIF(btrim(COALESCE(descripcion, '')), ''), COALESCE(NULLIF(btrim(COALESCE(nombre, '')), ''), 'IMPUESTO')),
  tasa_porcentaje = GREATEST(0, LEAST(100, round(COALESCE(tasa_porcentaje, porcentaje, 0)::numeric, 4))),
  porcentaje = GREATEST(0, LEAST(100, round(COALESCE(porcentaje, tasa_porcentaje, 0)::numeric, 4))),
  tipo_calculo = upper(COALESCE(NULLIF(btrim(COALESCE(tipo_calculo, '')), ''), 'PORCENTAJE')),
  aplica_a = upper(COALESCE(NULLIF(btrim(COALESCE(aplica_a, '')), ''), 'VENTA')),
  es_retencion = COALESCE(
    es_retencion,
    CASE
      WHEN upper(COALESCE(codigo, '')) LIKE '%RET%'
        OR upper(COALESCE(codigo, '')) LIKE 'RETE%'
        OR upper(COALESCE(nombre, '')) LIKE '%RETEN%'
      THEN true
      ELSE false
    END
  ),
  activo = COALESCE(activo, true),
  estado = CASE WHEN COALESCE(activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END,
  updated_at = COALESCE(updated_at, now());

UPDATE public.tipos_impuestos
SET porcentaje = tasa_porcentaje
WHERE abs(COALESCE(tasa_porcentaje, 0) - COALESCE(porcentaje, 0)) > 0.0001;

-- ----------------------------------------------------------------------------
-- Constraints de contrato UI.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.tipos_documentos_fiscales') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_tipos_documentos_fiscales_longitud_range'
        AND conrelid = 'public.tipos_documentos_fiscales'::regclass
    ) THEN
      ALTER TABLE public.tipos_documentos_fiscales
      ADD CONSTRAINT ck_tipos_documentos_fiscales_longitud_range
      CHECK (
        longitud_minima >= 1
        AND longitud_maxima >= 1
        AND longitud_minima <= longitud_maxima
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_tipos_documentos_fiscales_patron_nonempty'
        AND conrelid = 'public.tipos_documentos_fiscales'::regclass
    ) THEN
      ALTER TABLE public.tipos_documentos_fiscales
      ADD CONSTRAINT ck_tipos_documentos_fiscales_patron_nonempty
      CHECK (patron_validacion IS NOT NULL AND btrim(patron_validacion) <> '');
    END IF;
  END IF;

  IF to_regclass('public.tipos_impuestos') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_tipos_impuestos_tasa_porcentaje_range'
        AND conrelid = 'public.tipos_impuestos'::regclass
    ) THEN
      ALTER TABLE public.tipos_impuestos
      ADD CONSTRAINT ck_tipos_impuestos_tasa_porcentaje_range
      CHECK (tasa_porcentaje >= 0 AND tasa_porcentaje <= 100);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_tipos_impuestos_tasa_sync'
        AND conrelid = 'public.tipos_impuestos'::regclass
    ) THEN
      ALTER TABLE public.tipos_impuestos
      ADD CONSTRAINT ck_tipos_impuestos_tasa_sync
      CHECK (abs(COALESCE(tasa_porcentaje, 0) - COALESCE(porcentaje, 0)) <= 0.0001);
    END IF;
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.tipos_documentos_fiscales
  VALIDATE CONSTRAINT ck_tipos_documentos_fiscales_longitud_range;
ALTER TABLE IF EXISTS public.tipos_documentos_fiscales
  VALIDATE CONSTRAINT ck_tipos_documentos_fiscales_patron_nonempty;
ALTER TABLE IF EXISTS public.tipos_impuestos
  VALIDATE CONSTRAINT ck_tipos_impuestos_tasa_porcentaje_range;
ALTER TABLE IF EXISTS public.tipos_impuestos
  VALIDATE CONSTRAINT ck_tipos_impuestos_tasa_sync;

COMMIT;
