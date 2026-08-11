BEGIN;
SET lock_timeout='10s';
SET statement_timeout='120s';

DO $block$
DECLARE v record;
BEGIN
 FOR v IN
  SELECT p.oid::regprocedure AS signature,n.nspname,p.proname
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.prosecdef AND n.nspname IN('public','app')
    AND NOT(n.nspname='app' AND p.proname IN('hoy_tenant','puede_leer_grupo_consolidacion_393'))
 LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',v.signature);
 END LOOP;
END $block$;

COMMIT;
NOTIFY pgrst,'reload schema';
