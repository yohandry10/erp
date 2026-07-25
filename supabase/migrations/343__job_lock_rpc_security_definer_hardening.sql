-- ============================================================================
-- 343__job_lock_rpc_security_definer_hardening.sql
-- Corrige las RPC de locks distribuidos usadas por workers.
--
-- Motivo:
-- - Las funciones originales tocaban app.job_locks como invoker. En runtime,
--   service_role podia ejecutar la RPC pero no tenia privilegios directos sobre
--   app.job_locks, dejando outbox/contabilidad/POS sin cron efectivo.
-- - acquire_job_lock devolvia true si el lock existia y no habia expirado,
--   incluso cuando otro worker lo tenia vigente. Debe devolver true solo si
--   esta llamada inserto o actualizo el lock.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.acquire_job_lock(
  p_lock_key text,
  p_lock_ttl_seconds integer DEFAULT 300
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_rows integer := 0;
BEGIN
  INSERT INTO app.job_locks(lock_key, locked_until)
  VALUES (p_lock_key, v_now + make_interval(secs => p_lock_ttl_seconds))
  ON CONFLICT (lock_key) DO UPDATE
    SET locked_until = EXCLUDED.locked_until
    WHERE app.job_locks.locked_until < v_now;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_job_lock(p_lock_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_temp
AS $$
BEGIN
  DELETE FROM app.job_locks WHERE lock_key = p_lock_key;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_job_lock(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.acquire_job_lock(text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.acquire_job_lock(text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_job_lock(text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.release_job_lock(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_job_lock(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.release_job_lock(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_job_lock(text) TO service_role;

COMMENT ON FUNCTION public.acquire_job_lock(text, integer) IS
  'Adquiere lock distribuido de background jobs. SECURITY DEFINER para operar app.job_locks desde service_role; devuelve true solo si esta llamada inserto/actualizo el lock.';

COMMENT ON FUNCTION public.release_job_lock(text) IS
  'Libera lock distribuido de background jobs. Ejecucion restringida a service_role.';

COMMIT;
