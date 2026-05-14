-- 304: Add tenant-aware overload for outbox pending event polling.
-- Keeps the legacy get_pending_outbox_events(p_limit) contract while supporting
-- the API worker contract get_pending_outbox_events(p_limit, p_tenant_id).

CREATE OR REPLACE FUNCTION public.get_pending_outbox_events(
  p_limit integer DEFAULT 100,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS SETOF public.outbox_events
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT *
  FROM public.outbox_events
  WHERE status IN ('pending', 'failed')
    AND (next_retry_at IS NULL OR next_retry_at <= now())
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
  ORDER BY created_at
  LIMIT GREATEST(COALESCE(p_limit, 100), 1);
$$;

REVOKE ALL ON FUNCTION public.get_pending_outbox_events(integer, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pending_outbox_events(integer, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_pending_outbox_events(integer, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_outbox_events(integer, uuid) TO service_role;

COMMENT ON FUNCTION public.get_pending_outbox_events(integer, uuid)
IS 'Tenant-aware pending outbox event polling used by API outbox worker. p_tenant_id NULL preserves global polling.';
