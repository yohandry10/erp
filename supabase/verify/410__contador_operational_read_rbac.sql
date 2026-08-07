DO $$
DECLARE
  v_missing integer;
  v_wrapper text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version = '410'
      AND name = '_contador_operational_read_rbac'
  ) THEN
    RAISE EXCEPTION '410: migracion no registrada';
  END IF;

  SELECT count(*)
  INTO v_missing
  FROM public.roles r
  WHERE upper(r.nombre) = 'CONTADOR'
    AND COALESCE(r.activo, true) = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.rol_permisos rp
      JOIN public.permisos p ON p.id = rp.permiso_id
      WHERE rp.role_id = r.id
        AND p.tenant_id = r.tenant_id
        AND lower(p.codigo) = 'compras.proveedores.ver'
        AND COALESCE(p.activo, true) = true
        AND COALESCE(rp.concedido, true) = true
    );

  IF v_missing <> 0 THEN
    RAISE EXCEPTION '410: faltan % permisos de lectura de proveedores para CONTADOR', v_missing;
  END IF;

  SELECT pg_get_functiondef(
    'app.seed_operational_rbac_for_tenant(uuid,uuid)'::regprocedure
  ) INTO v_wrapper;

  IF position('sembrar_permisos_planilla_electronica_contador' IN v_wrapper) = 0
     OR position('sembrar_permisos_contador_operativo' IN v_wrapper) = 0 THEN
    RAISE EXCEPTION '410: el alta de tenants no integra los seeders de CONTADOR';
  END IF;
END;
$$;

SELECT
  count(DISTINCT r.tenant_id) AS tenants_cubiertos,
  count(DISTINCT r.id) AS roles_contador_cubiertos
FROM public.roles r
JOIN public.rol_permisos rp ON rp.role_id = r.id
JOIN public.permisos p ON p.id = rp.permiso_id
WHERE upper(r.nombre) = 'CONTADOR'
  AND lower(p.codigo) = 'compras.proveedores.ver'
  AND COALESCE(rp.concedido, true) = true;
