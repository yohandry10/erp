BEGIN;
SET lock_timeout='10s';
SET statement_timeout='120s';

DO $block$
DECLARE
  v_table text;
  v_tables constant text[]:=ARRAY[
    'caja_operaciones_474',
    'configuration_operation_intents',
    'cxp_ajustes_proveedor',
    'pedido_cancelaciones',
    'rrhh_operaciones_475'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass(format('public.%I',v_table)) IS NULL THEN
      RAISE EXCEPTION 'SERVICE_ONLY_TABLE_MISSING:%',v_table;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',v_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',v_table);
    EXECUTE format('DROP POLICY IF EXISTS service_only_no_direct_access_485 ON public.%I',v_table);
    EXECUTE format(
      'CREATE POLICY service_only_no_direct_access_485 ON public.%I FOR ALL TO PUBLIC USING (false) WITH CHECK (false)',
      v_table
    );
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',v_table);
    EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON TABLE public.%I FROM service_role',v_table);
  END LOOP;
END $block$;

COMMIT;
NOTIFY pgrst,'reload schema';
