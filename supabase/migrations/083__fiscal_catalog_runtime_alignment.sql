-- ============================================================================
-- 083__fiscal_catalog_runtime_alignment.sql
-- Alinea catálogos fiscales/país para contratos runtime de API/Web.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Países: aliases usados por UI dinámica y servicios de configuración.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.paises
  ADD COLUMN IF NOT EXISTS codigo_fiscal text,
  ADD COLUMN IF NOT EXISTS moneda_principal text,
  ADD COLUMN IF NOT EXISTS zona_horaria text DEFAULT 'America/Lima';

UPDATE public.paises
SET
  codigo_fiscal = COALESCE(
    NULLIF(btrim(codigo_fiscal), ''),
    NULLIF(btrim(nombre_fiscal), ''),
    NULLIF(btrim(codigo_iso), '')
  ),
  moneda_principal = COALESCE(
    NULLIF(upper(btrim(moneda_principal)), ''),
    NULLIF(upper(btrim(moneda_codigo)), ''),
    'PEN'
  ),
  zona_horaria = COALESCE(
    NULLIF(btrim(zona_horaria), ''),
    CASE upper(COALESCE(codigo_iso, ''))
      WHEN 'PE' THEN 'America/Lima'
      WHEN 'CO' THEN 'America/Bogota'
      WHEN 'CL' THEN 'America/Santiago'
      WHEN 'MX' THEN 'America/Mexico_City'
      ELSE 'UTC'
    END
  );

CREATE INDEX IF NOT EXISTS idx_paises_codigo_fiscal_upper
ON public.paises (upper(codigo_fiscal))
WHERE codigo_fiscal IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Configuración fiscal: columnas usadas directamente en controllers/services.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.configuracion_fiscal
  ADD COLUMN IF NOT EXISTS tasa_igv numeric(10,4),
  ADD COLUMN IF NOT EXISTS moneda_principal text,
  ADD COLUMN IF NOT EXISTS retencion_renta_porcentaje numeric(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencion_iva_porcentaje numeric(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percepcion_porcentaje numeric(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS detraccion_porcentaje numeric(10,4) DEFAULT 0;

-- ----------------------------------------------------------------------------
-- Tipos fiscales: campos esperados por DTO/cliente.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.tipos_documentos_fiscales
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS requiere_ruc boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS permite_exportacion boolean DEFAULT false;

ALTER TABLE IF EXISTS public.tipos_impuestos
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS tipo_calculo text DEFAULT 'PORCENTAJE',
  ADD COLUMN IF NOT EXISTS aplica_a text DEFAULT 'VENTA';

-- ----------------------------------------------------------------------------
-- Promover pais_id a bigint de forma defensiva (esquemas legacy parciales).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_table text;
  v_udt text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['configuracion_fiscal', 'tipos_documentos_fiscales', 'tipos_impuestos']
  LOOP
    SELECT c.udt_name
    INTO v_udt
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = v_table
      AND c.column_name = 'pais_id';

    IF v_udt = 'int4' THEN
      EXECUTE format(
        'ALTER TABLE public.%I
         ALTER COLUMN pais_id TYPE bigint
         USING pais_id::bigint',
        v_table
      );
    ELSIF v_udt IS NOT NULL AND v_udt <> 'int8' THEN
      EXECUTE format(
        'ALTER TABLE public.%I
         ALTER COLUMN pais_id TYPE bigint
         USING CASE
           WHEN btrim(pais_id::text) ~ ''^[0-9]+$'' THEN btrim(pais_id::text)::bigint
           ELSE NULL
         END',
        v_table
      );
    END IF;
  END LOOP;
END
$$;

-- ----------------------------------------------------------------------------
-- Helper de normalización de tasas:
-- - acepta 0.18 y también 18 (se convierte a 0.18)
-- - recorta a [0,1]
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_tax_ratio(p_value numeric)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_value IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_value < 0 THEN
    RETURN 0;
  END IF;

  IF p_value > 1 AND p_value <= 100 THEN
    RETURN round((p_value / 100.0)::numeric, 4);
  END IF;

  IF p_value > 100 THEN
    RETURN 1;
  END IF;

  RETURN round(p_value::numeric, 4);
END;
$$;

-- ----------------------------------------------------------------------------
-- Trigger de normalización de configuración fiscal.
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
  NEW.estado := CASE WHEN NEW.activo THEN 'ACTIVO' ELSE 'INACTIVO' END;

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

DROP TRIGGER IF EXISTS trg_normalize_configuracion_fiscal_row ON public.configuracion_fiscal;
CREATE TRIGGER trg_normalize_configuracion_fiscal_row
BEFORE INSERT OR UPDATE ON public.configuracion_fiscal
FOR EACH ROW
EXECUTE FUNCTION app.normalize_configuracion_fiscal_row();

-- ----------------------------------------------------------------------------
-- Backfill de normalización y defaults.
-- ----------------------------------------------------------------------------
UPDATE public.configuracion_fiscal
SET updated_at = COALESCE(updated_at, now());

UPDATE public.tipos_documentos_fiscales
SET
  codigo = upper(NULLIF(btrim(COALESCE(codigo, '')), '')),
  nombre = COALESCE(NULLIF(btrim(COALESCE(nombre, '')), ''), upper(NULLIF(btrim(COALESCE(codigo, '')), ''))),
  descripcion = COALESCE(
    NULLIF(btrim(COALESCE(descripcion, '')), ''),
    NULLIF(btrim(COALESCE(nombre, '')), ''),
    upper(NULLIF(btrim(COALESCE(codigo, '')), ''))
  ),
  requiere_ruc = COALESCE(requiere_ruc, false),
  permite_exportacion = COALESCE(permite_exportacion, false),
  activo = COALESCE(activo, true),
  estado = CASE WHEN COALESCE(activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END,
  updated_at = COALESCE(updated_at, now());

UPDATE public.tipos_impuestos
SET
  codigo = upper(NULLIF(btrim(COALESCE(codigo, '')), '')),
  nombre = COALESCE(NULLIF(btrim(COALESCE(nombre, '')), ''), upper(NULLIF(btrim(COALESCE(codigo, '')), ''))),
  descripcion = COALESCE(
    NULLIF(btrim(COALESCE(descripcion, '')), ''),
    NULLIF(btrim(COALESCE(nombre, '')), ''),
    upper(NULLIF(btrim(COALESCE(codigo, '')), ''))
  ),
  porcentaje = CASE
    WHEN porcentaje IS NULL THEN 0
    WHEN porcentaje < 0 THEN 0
    WHEN porcentaje > 100 THEN 100
    ELSE round(porcentaje::numeric, 4)
  END,
  tipo_calculo = upper(COALESCE(NULLIF(btrim(COALESCE(tipo_calculo, '')), ''), 'PORCENTAJE')),
  aplica_a = upper(COALESCE(NULLIF(btrim(COALESCE(aplica_a, '')), ''), 'VENTA')),
  activo = COALESCE(activo, true),
  estado = CASE WHEN COALESCE(activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END,
  updated_at = COALESCE(updated_at, now());

CREATE INDEX IF NOT EXISTS idx_configuracion_fiscal_lookup_runtime
ON public.configuracion_fiscal (pais_id, activo, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tipos_documentos_fiscales_lookup_runtime
ON public.tipos_documentos_fiscales (pais_id, activo, codigo);

CREATE INDEX IF NOT EXISTS idx_tipos_impuestos_lookup_runtime
ON public.tipos_impuestos (pais_id, activo, codigo);

COMMIT;
