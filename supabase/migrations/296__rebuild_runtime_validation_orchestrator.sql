-- ============================================================================
-- 296__rebuild_runtime_validation_orchestrator.sql
-- Orquestador transversal de validaciones runtime para cierre de reconstruccion.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_rebuild_runtime_orchestrator(
  p_tenant_id uuid DEFAULT NULL,
  p_only_failed boolean DEFAULT false
)
RETURNS TABLE (
  pack_name text,
  check_name text,
  ok boolean,
  detail text
)
LANGUAGE plpgsql
STABLE
SET search_path = public, extensions, app, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
  v_fn record;
  v_row record;
  v_functions_found integer := 0;
BEGIN
  v_tenant_id := COALESCE(p_tenant_id, app.resolve_request_tenant_id(), app.current_tenant_id());

  FOR v_fn IN
    SELECT
      p.proname,
      p.pronargs,
      pg_get_function_identity_arguments(p.oid) AS arg_signature,
      CASE
        WHEN p.pronargs = 1 THEN format_type((p.proargtypes::oid[])[1], NULL)
        ELSE NULL
      END AS arg1_type
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname LIKE 'validar\_%\_runtime' ESCAPE '\'
      AND p.proname <> 'validar_rebuild_runtime_orchestrator'
      AND p.proname <> 'validar_rebuild_runtime_summary'
      AND p.proname <> 'validar_rebuild_orchestrator_runtime'
    ORDER BY p.proname
  LOOP
    v_functions_found := v_functions_found + 1;

    BEGIN
      IF v_fn.pronargs = 0 THEN
        FOR v_row IN
          EXECUTE format(
            'SELECT %L::text AS pack_name, x.check_name, x.ok, x.detail FROM public.%I() AS x',
            v_fn.proname,
            v_fn.proname
          )
        LOOP
          IF (NOT p_only_failed) OR (v_row.ok = false) THEN
            pack_name := v_row.pack_name;
            check_name := v_row.check_name;
            ok := v_row.ok;
            detail := v_row.detail;
            RETURN NEXT;
          END IF;
        END LOOP;

      ELSIF v_fn.pronargs = 1 AND lower(COALESCE(v_fn.arg1_type, '')) = 'uuid' THEN
        FOR v_row IN
          EXECUTE format(
            'SELECT %L::text AS pack_name, x.check_name, x.ok, x.detail FROM public.%I($1) AS x',
            v_fn.proname,
            v_fn.proname
          ) USING v_tenant_id
        LOOP
          IF (NOT p_only_failed) OR (v_row.ok = false) THEN
            pack_name := v_row.pack_name;
            check_name := v_row.check_name;
            ok := v_row.ok;
            detail := v_row.detail;
            RETURN NEXT;
          END IF;
        END LOOP;

      ELSE
        pack_name := v_fn.proname;
        check_name := 'function_signature_not_supported';
        ok := false;
        detail := format('signature=%s', COALESCE(v_fn.arg_signature, '<unknown>'));
        RETURN NEXT;
      END IF;

    EXCEPTION
      WHEN OTHERS THEN
        pack_name := v_fn.proname;
        check_name := 'function_execution_error';
        ok := false;
        detail := SQLERRM;
        RETURN NEXT;
    END;
  END LOOP;

  IF v_functions_found = 0 THEN
    pack_name := 'orchestrator';
    check_name := 'no_validation_functions_discovered';
    ok := false;
    detail := 'No se encontraron funciones public.validar_*_runtime en el esquema actual';
    RETURN NEXT;
  END IF;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_rebuild_runtime_checks_actual AS
SELECT *
FROM public.validar_rebuild_runtime_orchestrator(app.resolve_request_tenant_id(), false);

COMMIT;
