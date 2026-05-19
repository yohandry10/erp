-- 317: Prevent late asynchronous failures from downgrading completed outbox events.

CREATE OR REPLACE FUNCTION public.mark_outbox_event_failed(
  p_event_id uuid,
  p_error text DEFAULT NULL,
  p_next_retry_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  UPDATE public.outbox_events
     SET status = 'failed',
         retry_count = COALESCE(retry_count, 0) + 1,
         error_message = p_error,
         next_retry_at = COALESCE(p_next_retry_at, now() + interval '5 minutes'),
         updated_at = now()
   WHERE id = p_event_id
     AND lower(COALESCE(status::text, '')) <> 'completed';
$$;

REVOKE ALL ON FUNCTION public.mark_outbox_event_failed(uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_outbox_event_failed(uuid, text, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.mark_outbox_event_failed(uuid, text, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_outbox_event_failed(uuid, text, timestamptz) TO service_role;

COMMENT ON FUNCTION public.mark_outbox_event_failed(uuid, text, timestamptz)
IS 'Marks an outbox event failed only while it is not already completed; protects completed events from late listener failures.';
