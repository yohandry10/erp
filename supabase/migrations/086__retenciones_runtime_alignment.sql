-- ============================================================================
-- 086__retenciones_runtime_alignment.sql
-- Alinea configuracion_retenciones con el contrato runtime del módulo.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Shape operativo usado por RetencionesService.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.configuracion_retenciones
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS tasa_porcentaje numeric(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_minimo numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ----------------------------------------------------------------------------
-- Normalización de filas de configuración de retenciones.
-- ----------------------------------------------------------------------------
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
  NEW.estado := CASE WHEN NEW.activo THEN 'ACTIVO' ELSE 'INACTIVO' END;
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_configuracion_retenciones_row ON public.configuracion_retenciones;
CREATE TRIGGER trg_normalize_configuracion_retenciones_row
BEFORE INSERT OR UPDATE ON public.configuracion_retenciones
FOR EACH ROW
EXECUTE FUNCTION app.normalize_configuracion_retenciones_row();

-- ----------------------------------------------------------------------------
-- Backfill de normalización.
-- ----------------------------------------------------------------------------
UPDATE public.configuracion_retenciones
SET updated_at = COALESCE(updated_at, now());

-- ----------------------------------------------------------------------------
-- Seed mínimo por tenant para categorías CUARTA/QUINTA.
-- ----------------------------------------------------------------------------
INSERT INTO public.configuracion_retenciones (
  tenant_id,
  categoria,
  codigo,
  nombre,
  descripcion,
  tasa_porcentaje,
  monto_minimo,
  activo,
  estado,
  metadata,
  created_at,
  updated_at
)
SELECT
  t.id AS tenant_id,
  s.categoria,
  s.categoria,
  format('RETENCION_%s', s.categoria),
  s.descripcion,
  s.tasa_porcentaje,
  s.monto_minimo,
  true,
  'ACTIVO',
  '{}'::jsonb,
  now(),
  now()
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('CUARTA'::text, 'Configuración de retención cuarta categoría'::text, 8.00::numeric, 1500.00::numeric),
    ('QUINTA'::text, 'Configuración de retención quinta categoría'::text, 8.00::numeric, 0.00::numeric)
) AS s(categoria, descripcion, tasa_porcentaje, monto_minimo)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.configuracion_retenciones cr
  WHERE cr.tenant_id = t.id
    AND upper(COALESCE(cr.categoria, '')) = s.categoria
);

CREATE INDEX IF NOT EXISTS idx_configuracion_retenciones_tenant_categoria_activo
ON public.configuracion_retenciones (tenant_id, categoria, activo);

CREATE INDEX IF NOT EXISTS idx_configuracion_retenciones_tenant_updated_at
ON public.configuracion_retenciones (tenant_id, updated_at DESC);

COMMIT;
