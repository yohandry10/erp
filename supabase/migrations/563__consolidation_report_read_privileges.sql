BEGIN;
SET lock_timeout = '10s';
SET statement_timeout = '120s';

-- La API valida controladora, consentimiento y tenant antes de leer estas
-- fuentes. Las mutaciones siguen entrando sólo por gestionar_consolidacion_tx.
GRANT SELECT ON public.mapeos_cuentas_consolidacion,
  public.tipos_cambio_consolidacion, public.ajustes_consolidacion TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
