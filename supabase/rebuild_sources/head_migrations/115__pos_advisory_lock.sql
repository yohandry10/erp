-- Funciones para advisory locks en POS por tenant/key
CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.acquire_pos_lock(p_tenant_id uuid, p_lock_key text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_key text := coalesce(p_lock_key, 'default');
BEGIN
  PERFORM pg_advisory_lock(hashtext(p_tenant_id::text || ':' || v_key));
END;
$$;

CREATE OR REPLACE FUNCTION app.release_pos_lock(p_tenant_id uuid, p_lock_key text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_key text := coalesce(p_lock_key, 'default');
BEGIN
  PERFORM pg_advisory_unlock(hashtext(p_tenant_id::text || ':' || v_key));
END;
$$;
