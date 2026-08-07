DO $$
DECLARE
  v_missing_permissions integer;
  v_missing_assignments integer;
  v_duplicate_codes integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version = '401'
      AND name = '_peru_plame_contador_rbac'
  ) THEN
    RAISE EXCEPTION '401: migracion no registrada';
  END IF;

  SELECT count(*)
  INTO v_missing_permissions
  FROM public.tenants t
  CROSS JOIN (VALUES
    ('rrhh.planillas.read'),
    ('rrhh.planillas.accounting'),
    ('rrhh.planilla_electronica.read'),
    ('rrhh.planilla_electronica.write')
  ) expected(codigo)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.permisos p
    WHERE p.tenant_id = t.id
      AND lower(p.codigo) = expected.codigo
      AND COALESCE(p.activo, true) = true
  );

  IF v_missing_permissions <> 0 THEN
    RAISE EXCEPTION '401: faltan % permisos tenant-scoped', v_missing_permissions;
  END IF;

  SELECT count(*)
  INTO v_missing_assignments
  FROM public.roles r
  CROSS JOIN (VALUES
    ('rrhh.planillas.read'),
    ('rrhh.planillas.accounting'),
    ('rrhh.planilla_electronica.read'),
    ('rrhh.planilla_electronica.write')
  ) expected(codigo)
  WHERE upper(r.nombre) IN ('ADMIN', 'RRHH', 'CONTADOR')
    AND COALESCE(r.activo, true) = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.rol_permisos rp
      JOIN public.permisos p ON p.id = rp.permiso_id
      WHERE rp.role_id = r.id
        AND p.tenant_id = r.tenant_id
        AND lower(p.codigo) = expected.codigo
        AND COALESCE(rp.concedido, true) = true
    );

  IF v_missing_assignments <> 0 THEN
    RAISE EXCEPTION '401: faltan % asignaciones ADMIN/RRHH/CONTADOR', v_missing_assignments;
  END IF;

  SELECT count(*)
  INTO v_duplicate_codes
  FROM (
    SELECT tenant_id, lower(codigo)
    FROM public.permisos
    WHERE lower(codigo) IN (
      'rrhh.planillas.read',
      'rrhh.planillas.accounting',
      'rrhh.planilla_electronica.read',
      'rrhh.planilla_electronica.write'
    )
    GROUP BY tenant_id, lower(codigo)
    HAVING count(*) <> 1
  ) duplicates;

  IF v_duplicate_codes <> 0 THEN
    RAISE EXCEPTION '401: hay % codigos duplicados por tenant', v_duplicate_codes;
  END IF;
END;
$$;

SELECT
  count(DISTINCT p.tenant_id) AS tenants_cubiertos,
  count(DISTINCT p.id) AS permisos_creados,
  count(DISTINCT rp.role_id) AS roles_asignados
FROM public.permisos p
LEFT JOIN public.rol_permisos rp ON rp.permiso_id = p.id
WHERE lower(p.codigo) IN (
  'rrhh.planillas.read',
  'rrhh.planillas.accounting',
  'rrhh.planilla_electronica.read',
  'rrhh.planilla_electronica.write'
);
