-- La conversion demo -> tenant real debe ser atomica y el borrado de semillas
-- no puede declarar exito si alguna relacion impidio limpiar datos.

CREATE OR REPLACE FUNCTION app.reiniciar_datos_tenant(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_conservar text[] := ARRAY[
    'tenants',
    'empresa_config',
    'usuarios',
    'usuarios_sistema',
    'usuario_configuracion',
    'roles',
    'permisos',
    'permissions',
    'role_permissions',
    'user_roles',
    'sucursales',
    'almacenes',
    'almacen_ubicaciones',
    'plan_cuentas',
    'metodos_pago',
    'cajas',
    'configuracion_fiscal',
    'conceptos_planilla',
    -- La aprobacion necesita esta fila para cerrarla DESPUES del reset.
    'demo_conversiones_pendientes'
  ];
  v_tabla text;
  v_borradas bigint;
  v_restantes bigint;
  v_total bigint := 0;
  v_vuelta int := 0;
  v_progreso bigint;
  v_detalle jsonb := '{}'::jsonb;
  v_pendientes jsonb := '{}'::jsonb;
BEGIN
  IF p_tenant IS NULL THEN
    RAISE EXCEPTION 'reiniciar_datos_tenant requiere un tenant';
  END IF;

  LOOP
    v_vuelta := v_vuelta + 1;
    v_progreso := 0;

    FOR v_tabla IN
      SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema
       AND t.table_name = c.table_name
       AND t.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'public'
        AND c.column_name = 'tenant_id'
        AND NOT (c.table_name = ANY (v_conservar))
      ORDER BY c.table_name
    LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1', v_tabla)
          USING p_tenant;
        GET DIAGNOSTICS v_borradas = ROW_COUNT;

        IF v_borradas > 0 THEN
          v_progreso := v_progreso + v_borradas;
          v_total := v_total + v_borradas;
          v_detalle := v_detalle || jsonb_build_object(
            v_tabla,
            COALESCE((v_detalle ->> v_tabla)::bigint, 0) + v_borradas
          );
        END IF;
      EXCEPTION WHEN integrity_constraint_violation THEN
        -- Algunas FK usan ON DELETE SET NULL, pero la fila hija exige ese id
        -- mediante un CHECK (por ejemplo pedidos_venta.cliente_id). Esa tabla
        -- hija se elimina mas adelante y la tabla padre entra en la siguiente
        -- vuelta. Capturar solo foreign_key_violation dejaba la conversion rota.
        NULL;
      END;
    END LOOP;

    EXIT WHEN v_progreso = 0 OR v_vuelta >= 20;
  END LOOP;

  -- No se acepta un exito parcial. Toda tabla operativa que no esta en la lista
  -- de estructura debe quedar realmente vacia para este tenant.
  FOR v_tabla IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
     AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenant_id'
      AND NOT (c.table_name = ANY (v_conservar))
    ORDER BY c.table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id = $1', v_tabla)
      INTO v_restantes
      USING p_tenant;
    IF v_restantes > 0 THEN
      v_pendientes := v_pendientes || jsonb_build_object(v_tabla, v_restantes);
    END IF;
  END LOOP;

  IF v_pendientes <> '{}'::jsonb THEN
    RAISE EXCEPTION 'El reinicio dejo filas operativas: %', v_pendientes;
  END IF;

  RETURN jsonb_build_object(
    'reiniciado', true,
    'filas_borradas', v_total,
    'vueltas', v_vuelta,
    'detalle', v_detalle,
    'pendientes', v_pendientes
  );
END;
$$;

REVOKE ALL ON FUNCTION app.reiniciar_datos_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reiniciar_datos_tenant(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.reiniciar_datos_tenant(p_tenant uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT app.reiniciar_datos_tenant(p_tenant);
$$;

REVOKE ALL ON FUNCTION public.reiniciar_datos_tenant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reiniciar_datos_tenant(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reiniciar_datos_tenant(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reiniciar_datos_tenant(uuid) TO service_role;

-- Actualiza empresa, limpia semillas, convierte usuarios y cierra la solicitud
-- dentro de una sola transaccion PostgreSQL. Cualquier fallo revierte TODO.
CREATE OR REPLACE FUNCTION app.completar_conversion_demo(
  p_tenant uuid,
  p_razon_social text,
  p_ruc text,
  p_telefono text,
  p_plan text,
  p_email text,
  p_password_hash text,
  p_conservar_datos boolean DEFAULT true,
  p_solicitud_id uuid DEFAULT NULL,
  p_aprobado_por text DEFAULT NULL,
  p_stripe_session_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_principal uuid;
  v_reinicio jsonb := NULL;
  v_solicitudes integer := 0;
BEGIN
  IF p_tenant IS NULL OR NULLIF(btrim(p_email), '') IS NULL OR
     NULLIF(btrim(p_password_hash), '') IS NULL THEN
    RAISE EXCEPTION 'tenant, email y password_hash son obligatorios';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text, 385));

  SELECT id
    INTO v_principal
  FROM public.usuarios_sistema
  WHERE tenant_id = p_tenant
    AND is_demo_user = true
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_principal IS NULL THEN
    RAISE EXCEPTION 'La cuenta demo no tiene usuario principal que convertir';
  END IF;

  IF NOT COALESCE(p_conservar_datos, true) THEN
    v_reinicio := app.reiniciar_datos_tenant(p_tenant);
    IF COALESCE((v_reinicio ->> 'reiniciado')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'El reinicio del tenant no confirmo su finalizacion';
    END IF;
  END IF;

  UPDATE public.empresa_config
  SET razon_social = p_razon_social,
      ruc = p_ruc,
      telefono = p_telefono,
      is_demo = false,
      demo_expires_at = NULL,
      demo_conversion_attempted = true,
      estado = 'ACTIVO',
      plan = upper(COALESCE(NULLIF(btrim(p_plan), ''), 'basico')),
      certificado_pfx = NULL,
      certificado_password = NULL,
      sunat_username = NULL,
      sunat_password = NULL,
      sunat_cert_expected_ruc = NULL,
      sunat_cert_ruc_mismatch_confirmed = false,
      sunat_cert_ruc_mismatch_reason = NULL,
      sunat_environment = 'homologacion',
      configuracion_completa = false,
      updated_at = now()
  WHERE tenant_id = p_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe empresa_config para el tenant %', p_tenant;
  END IF;

  UPDATE public.usuarios_sistema
  SET email = p_email,
      password_hash = p_password_hash,
      is_demo_user = false,
      demo_email_temp = NULL,
      updated_at = now()
  WHERE id = v_principal;

  UPDATE public.usuarios_sistema
  SET is_demo_user = false,
      demo_email_temp = NULL,
      updated_at = now()
  WHERE tenant_id = p_tenant
    AND id <> v_principal
    AND is_demo_user = true;

  IF p_solicitud_id IS NOT NULL THEN
    UPDATE public.demo_conversiones_pendientes
    SET estado = 'COMPLETADA',
        completed_at = now(),
        aprobado_por = p_aprobado_por,
        aprobado_at = now()
    WHERE id = p_solicitud_id
      AND tenant_id = p_tenant
      AND estado = 'PENDIENTE';
    GET DIAGNOSTICS v_solicitudes = ROW_COUNT;
  ELSIF p_stripe_session_id IS NOT NULL THEN
    UPDATE public.demo_conversiones_pendientes
    SET estado = 'COMPLETADA',
        completed_at = now()
    WHERE upper(stripe_session_id) = upper(p_stripe_session_id)
      AND tenant_id = p_tenant
      AND estado = 'PENDIENTE';
    GET DIAGNOSTICS v_solicitudes = ROW_COUNT;
  END IF;

  IF (p_solicitud_id IS NOT NULL OR p_stripe_session_id IS NOT NULL)
     AND v_solicitudes <> 1 THEN
    RAISE EXCEPTION 'La solicitud pendiente no pudo cerrarse atomicamente';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant,
    'usuario_id', v_principal,
    'reinicio', v_reinicio
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.completar_conversion_demo(
  p_tenant uuid,
  p_razon_social text,
  p_ruc text,
  p_telefono text,
  p_plan text,
  p_email text,
  p_password_hash text,
  p_conservar_datos boolean DEFAULT true,
  p_solicitud_id uuid DEFAULT NULL,
  p_aprobado_por text DEFAULT NULL,
  p_stripe_session_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT app.completar_conversion_demo(
    p_tenant, p_razon_social, p_ruc, p_telefono, p_plan, p_email,
    p_password_hash, p_conservar_datos, p_solicitud_id, p_aprobado_por,
    p_stripe_session_id
  );
$$;

REVOKE ALL ON FUNCTION public.completar_conversion_demo(uuid, text, text, text, text, text, text, boolean, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.completar_conversion_demo(uuid, text, text, text, text, text, text, boolean, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.completar_conversion_demo(uuid, text, text, text, text, text, text, boolean, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.completar_conversion_demo(uuid, text, text, text, text, text, text, boolean, uuid, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
