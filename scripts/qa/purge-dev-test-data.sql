\set ON_ERROR_STOP on
\if :{?commit_cleanup}
\else
  \set commit_cleanup 0
\endif
\pset pager off

BEGIN;

DO $$
DECLARE
  v_environment text;
  v_project_ref text;
  v_allow_demo boolean;
BEGIN
  SELECT environment, project_ref, allow_demo_data
    INTO v_environment, v_project_ref, v_allow_demo
  FROM app.deployment_environment
  WHERE singleton = true
  FOR UPDATE;

  IF v_environment <> 'DEV'
    OR v_project_ref <> 'hbueraexcbowpfnjlppi'
    OR NOT COALESCE(v_allow_demo, false) THEN
    RAISE EXCEPTION 'PURGE_BLOCKED: la base no es DEV canonica';
  END IF;
END;
$$;

SELECT 'before_tenants' AS metric, count(*)::bigint AS value FROM public.tenants
UNION ALL SELECT 'before_auth_users', count(*) FROM auth.users
UNION ALL SELECT 'before_storage_objects', count(*) FROM storage.objects;

DO $$
BEGIN
  IF (SELECT count(*) FROM storage.objects) <> 0 THEN
    RAISE EXCEPTION 'PURGE_BLOCKED: Storage contiene objetos; eliminarlos mediante Storage API antes de continuar';
  END IF;
END;
$$;

CREATE TEMP TABLE dev_purge_stats (
  round_no integer,
  table_name text,
  deleted_rows bigint
) ON COMMIT DROP;

DO $$
DECLARE
  v_round integer;
  v_progress bigint;
  v_pending integer;
  v_rows bigint;
  r record;
BEGIN
  FOR v_round IN 1..30 LOOP
    v_progress := 0;
    v_pending := 0;

    FOR r IN
      SELECT n.nspname AS schema_name, c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public', 'app')
        AND c.relkind IN ('r', 'p')
        AND c.relname <> 'tenants'
        AND EXISTS (
          SELECT 1
          FROM pg_attribute a
          WHERE a.attrelid = c.oid
            AND a.attname = 'tenant_id'
            AND a.attnum > 0
            AND NOT a.attisdropped
        )
      ORDER BY n.nspname, c.relname
    LOOP
      BEGIN
        EXECUTE format(
          'DELETE FROM %I.%I WHERE tenant_id IS NOT NULL',
          r.schema_name,
          r.table_name
        );
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
          v_progress := v_progress + v_rows;
          INSERT INTO dev_purge_stats VALUES (
            v_round,
            format('%I.%I', r.schema_name, r.table_name),
            v_rows
          );
        END IF;
      EXCEPTION
        WHEN foreign_key_violation OR check_violation OR raise_exception THEN
          v_pending := v_pending + 1;
      END;
    END LOOP;

    RAISE NOTICE 'purge round %, deleted %, pending tables %', v_round, v_progress, v_pending;
    EXIT WHEN v_pending = 0;
    IF v_progress = 0 THEN
      RAISE EXCEPTION 'PURGE_BLOCKED: % tablas tenant-scoped no convergen por FK', v_pending;
    END IF;
  END LOOP;

  IF v_pending <> 0 THEN
    RAISE EXCEPTION 'PURGE_BLOCKED: se excedio el maximo de rondas';
  END IF;
END;
$$;

DELETE FROM public.tenants;
DELETE FROM auth.users;

DO $$
DECLARE
  r record;
  v_rows bigint;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'app')
      AND c.relkind IN ('r', 'p')
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.oid
          AND a.attname = 'tenant_id'
          AND a.attnum > 0
          AND NOT a.attisdropped
      )
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I.%I WHERE tenant_id IS NOT NULL',
      r.schema_name,
      r.table_name
    ) INTO v_rows;
    IF v_rows <> 0 THEN
      RAISE EXCEPTION 'PURGE_VERIFY_FAIL: %.% conserva % filas tenant',
        r.schema_name, r.table_name, v_rows;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.tenants) <> 0
    OR (SELECT count(*) FROM auth.users) <> 0
    OR (SELECT count(*) FROM storage.objects) <> 0 THEN
    RAISE EXCEPTION 'PURGE_VERIFY_FAIL: tenants/auth/storage no quedaron vacios';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM app.deployment_environment
    WHERE singleton = true
      AND environment = 'DEV'
      AND project_ref = 'hbueraexcbowpfnjlppi'
      AND allow_demo_data
  ) THEN
    RAISE EXCEPTION 'PURGE_VERIFY_FAIL: se perdio la marca DEV';
  END IF;
END;
$$;

SELECT round_no, table_name, deleted_rows
FROM dev_purge_stats
ORDER BY round_no, table_name;

SELECT 'after_tenants' AS metric, count(*)::bigint AS value FROM public.tenants
UNION ALL SELECT 'after_auth_users', count(*) FROM auth.users
UNION ALL SELECT 'after_storage_objects', count(*) FROM storage.objects;

\if :commit_cleanup
  COMMIT;
  \echo 'DEV_PURGE_COMMITTED'
\else
  ROLLBACK;
  \echo 'DEV_PURGE_ROLLED_BACK'
\endif
