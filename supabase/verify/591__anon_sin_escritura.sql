-- anon sin escritura en public, tampoco a través de PUBLIC ni en tablas futuras.
BEGIN READ ONLY;

DO $$
DECLARE
  pendientes text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO pendientes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
     AND (has_table_privilege('anon', c.oid, 'INSERT')
       OR has_table_privilege('anon', c.oid, 'UPDATE')
       OR has_table_privilege('anon', c.oid, 'DELETE')
       OR has_table_privilege('anon', c.oid, 'TRUNCATE'));
  IF pendientes IS NOT NULL THEN
    RAISE EXCEPTION 'anon conserva escritura en: %', pendientes;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_default_acl d
      JOIN pg_namespace n ON n.oid = d.defaclnamespace
      CROSS JOIN LATERAL aclexplode(d.defaclacl) a
     WHERE n.nspname = 'public'
       -- Las migraciones crean sus tablas como postgres; los de supabase_admin son de la plataforma.
       AND d.defaclrole = 'postgres'::regrole
       AND d.defaclobjtype = 'r'
       AND a.grantee = 'anon'::regrole
       AND a.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  ) THEN
    RAISE EXCEPTION 'Los privilegios por defecto siguen dando escritura a anon';
  END IF;
END $$;

ROLLBACK;
