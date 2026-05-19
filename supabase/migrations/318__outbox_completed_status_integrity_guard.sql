-- 318: Enforce outbox completion as a terminal state at the database boundary.

CREATE OR REPLACE FUNCTION public.prevent_completed_outbox_downgrade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF lower(COALESCE(OLD.status::text, '')) = 'completed'
     AND lower(COALESCE(NEW.status::text, '')) IN ('failed', 'dead_letter') THEN
    NEW.status := OLD.status;
    NEW.processed_at := OLD.processed_at;
    NEW.retry_count := OLD.retry_count;
    NEW.error_message := OLD.error_message;
    NEW.next_retry_at := OLD.next_retry_at;
  END IF;

  IF OLD.processed_at IS NOT NULL
     AND lower(COALESCE(NEW.status::text, '')) IN ('failed', 'dead_letter') THEN
    NEW.status := 'completed';
    NEW.processed_at := OLD.processed_at;
    NEW.error_message := NULL;
    NEW.next_retry_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_completed_outbox_downgrade ON public.outbox_events;
CREATE TRIGGER trg_prevent_completed_outbox_downgrade
BEFORE UPDATE ON public.outbox_events
FOR EACH ROW
EXECUTE FUNCTION public.prevent_completed_outbox_downgrade();

REVOKE ALL ON FUNCTION public.prevent_completed_outbox_downgrade() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_completed_outbox_downgrade() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_completed_outbox_downgrade() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_completed_outbox_downgrade() TO service_role;

COMMENT ON FUNCTION public.prevent_completed_outbox_downgrade()
IS 'Prevents completed/processed outbox events from being downgraded to failed or dead_letter by late asynchronous writers.';
