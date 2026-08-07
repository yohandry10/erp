-- Permisos granulares para que CONTADOR prepare PLAME/T-Registro y revise la
-- planilla fuente sin heredar el acceso global de RRHH (empleados, pagos y
-- configuracion laboral). RRHH conserva el flujo completo y ADMIN permanece
-- explicitamente representado en la matriz, aunque el guard ya lo omite.

CREATE OR REPLACE FUNCTION app.sembrar_permisos_planilla_electronica_contador(
  p_tenant_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $fn$
DECLARE
  v_seeded integer := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_tenant_id es requerido';
  END IF;

  INSERT INTO public.permisos (
    tenant_id, modulo, recurso, accion, codigo, descripcion, activo
  )
  VALUES
    (p_tenant_id, 'rrhh', 'planillas', 'read',
      'rrhh.planillas.read', 'Consultar planillas como fuente contable', true),
    (p_tenant_id, 'rrhh', 'planillas', 'accounting',
      'rrhh.planillas.accounting', 'Generar asientos contables de planilla', true),
    (p_tenant_id, 'rrhh', 'planilla_electronica', 'read',
      'rrhh.planilla_electronica.read', 'Consultar y descargar PLAME/T-Registro', true),
    (p_tenant_id, 'rrhh', 'planilla_electronica', 'write',
      'rrhh.planilla_electronica.write', 'Preparar y registrar evidencia PLAME/T-Registro', true)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_seeded = ROW_COUNT;

  INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
  SELECT r.id, p.id, true
  FROM public.roles r
  JOIN public.permisos p ON p.tenant_id = r.tenant_id
  WHERE r.tenant_id = p_tenant_id
    AND COALESCE(r.activo, true) = true
    AND COALESCE(p.activo, true) = true
    AND upper(r.nombre) IN ('ADMIN', 'RRHH', 'CONTADOR')
    AND lower(p.codigo) IN (
      'rrhh.planillas.read',
      'rrhh.planillas.accounting',
      'rrhh.planilla_electronica.read',
      'rrhh.planilla_electronica.write'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.rol_permisos existing
      WHERE existing.role_id = r.id
        AND existing.permiso_id = p.id
    );

  RETURN v_seeded;
END;
$fn$;

REVOKE ALL ON FUNCTION app.sembrar_permisos_planilla_electronica_contador(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.sembrar_permisos_planilla_electronica_contador(uuid)
  TO service_role;

DO $$
DECLARE
  v_tenant record;
BEGIN
  FOR v_tenant IN SELECT id FROM public.tenants LOOP
    PERFORM app.sembrar_permisos_planilla_electronica_contador(v_tenant.id);
  END LOOP;
END;
$$;
