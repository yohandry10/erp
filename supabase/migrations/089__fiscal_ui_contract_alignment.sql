-- ============================================================================
-- 089__fiscal_ui_contract_alignment.sql
-- Alinea columnas para contrato de UI dinámica por país.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Configuración fiscal: flags/propiedades usados por frontend country-config.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.configuracion_fiscal
  ADD COLUMN IF NOT EXISTS requiere_registro_compras boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS requiere_registro_ventas boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS permite_multiples_monedas boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS requiere_autorizacion_sunat boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS url_webservice text;

UPDATE public.configuracion_fiscal cf
SET
  requiere_registro_compras = COALESCE(cf.requiere_registro_compras, cf.requiere_libro_compras, true),
  requiere_registro_ventas = COALESCE(cf.requiere_registro_ventas, cf.requiere_libro_ventas, true),
  permite_multiples_monedas = COALESCE(cf.permite_multiples_monedas, false),
  requiere_autorizacion_sunat = COALESCE(
    cf.requiere_autorizacion_sunat,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.paises p
        WHERE p.id = cf.pais_id
          AND upper(COALESCE(p.codigo_iso, '')) = 'PE'
      ) THEN true
      ELSE false
    END
  ),
  url_webservice = NULLIF(btrim(COALESCE(cf.url_webservice, '')), '')
WHERE
  cf.requiere_registro_compras IS NULL
  OR cf.requiere_registro_ventas IS NULL
  OR cf.permite_multiples_monedas IS NULL
  OR cf.requiere_autorizacion_sunat IS NULL
  OR cf.url_webservice IS NULL
  OR btrim(COALESCE(cf.url_webservice, '')) = '';

-- ----------------------------------------------------------------------------
-- Tipos de documentos: metadatos de validación usados por frontend.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.tipos_documentos_fiscales
  ADD COLUMN IF NOT EXISTS longitud_minima integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS longitud_maxima integer DEFAULT 20,
  ADD COLUMN IF NOT EXISTS patron_validacion text DEFAULT '^[A-Z0-9\\-]+$';

UPDATE public.tipos_documentos_fiscales
SET
  longitud_minima = GREATEST(COALESCE(longitud_minima, 1), 1),
  longitud_maxima = GREATEST(COALESCE(longitud_maxima, 20), COALESCE(longitud_minima, 1), 1),
  patron_validacion = COALESCE(NULLIF(btrim(COALESCE(patron_validacion, '')), ''), '^[A-Z0-9\\-]+$')
WHERE
  longitud_minima IS NULL
  OR longitud_maxima IS NULL
  OR patron_validacion IS NULL
  OR btrim(COALESCE(patron_validacion, '')) = '';

-- ----------------------------------------------------------------------------
-- Tipos de impuestos: alias de tasa y bandera de retención.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.tipos_impuestos
  ADD COLUMN IF NOT EXISTS tasa_porcentaje numeric(10,4),
  ADD COLUMN IF NOT EXISTS es_retencion boolean DEFAULT false;

UPDATE public.tipos_impuestos
SET
  tasa_porcentaje = COALESCE(
    tasa_porcentaje,
    porcentaje,
    0
  ),
  es_retencion = COALESCE(
    es_retencion,
    CASE
      WHEN upper(COALESCE(codigo, '')) LIKE '%RET%'
        OR upper(COALESCE(codigo, '')) LIKE 'RETE%'
        OR upper(COALESCE(nombre, '')) LIKE '%RETEN%'
      THEN true
      ELSE false
    END
  )
WHERE
  tasa_porcentaje IS NULL
  OR es_retencion IS NULL;

CREATE INDEX IF NOT EXISTS idx_tipos_documentos_fiscales_pais_activo_codigo_ui
ON public.tipos_documentos_fiscales (pais_id, activo, codigo);

CREATE INDEX IF NOT EXISTS idx_tipos_impuestos_pais_activo_codigo_ui
ON public.tipos_impuestos (pais_id, activo, codigo);

COMMIT;
