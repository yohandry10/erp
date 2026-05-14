-- Backfill idempotente de configuracion_retenciones obligatoria por tenant.
-- Corrige drift operativo detectado por validar_retenciones_runtime cuando la
-- base remota queda sin las categorias minimas CUARTA/QUINTA.

BEGIN;

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
  s.categoria AS codigo,
  format('RETENCION_%s', s.categoria) AS nombre,
  s.descripcion,
  s.tasa_porcentaje,
  s.monto_minimo,
  true AS activo,
  'ACTIVO' AS estado,
  jsonb_build_object('source', '305__retenciones_required_seed_backfill') AS metadata,
  now() AS created_at,
  now() AS updated_at
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('CUARTA'::text, 'Configuracion de retencion cuarta categoria'::text, 8.00::numeric, 1500.00::numeric),
    ('QUINTA'::text, 'Configuracion de retencion quinta categoria'::text, 8.00::numeric, 0.00::numeric)
) AS s(categoria, descripcion, tasa_porcentaje, monto_minimo)
WHERE COALESCE(t.activo, true) = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.configuracion_retenciones cr
    WHERE cr.tenant_id = t.id
      AND upper(COALESCE(cr.categoria, '')) = s.categoria
      AND COALESCE(cr.activo, true) = true
  );

COMMIT;
