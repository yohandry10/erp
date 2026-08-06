-- A converted tenant must not retain demo identity in its real account.
-- This hook runs after the atomic conversion has changed the principal email
-- and closed the request, so the company summary can use the final identity.

ALTER TABLE public.empresa_config
  ADD COLUMN IF NOT EXISTS serie_guia_remision text;

CREATE OR REPLACE FUNCTION app.normalizar_identidad_conversion_demo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $$
DECLARE
  v_principal uuid;
  v_email text;
BEGIN
  IF NEW.estado IS DISTINCT FROM 'COMPLETADA' THEN
    RETURN NEW;
  END IF;

  SELECT id, email
    INTO v_principal, v_email
  FROM public.usuarios_sistema
  WHERE tenant_id = NEW.tenant_id
    AND activo = true
    AND is_super_admin = false
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  UPDATE public.empresa_config
  SET nombre_comercial = CASE
        WHEN nombre_comercial IS NULL
          OR btrim(nombre_comercial) = ''
          OR lower(nombre_comercial) LIKE '%demo%'
        THEN razon_social
        ELSE nombre_comercial
      END,
      email = COALESCE(NULLIF(btrim(v_email), ''), email),
      updated_at = now()
  WHERE tenant_id = NEW.tenant_id
    AND is_demo = false;

  UPDATE public.usuarios_sistema
  SET nombre = 'Administrador',
      apellido = NULL,
      nombre_usuario = 'administrador',
      updated_at = now()
  WHERE id = v_principal
    AND (
      nombre IS NULL
      OR btrim(nombre) = ''
      OR lower(concat_ws(' ', nombre, apellido)) LIKE '%demo%'
      OR lower(COALESCE(nombre_usuario, '')) = 'demo'
    );

  UPDATE public.usuarios
  SET nombre = 'Administrador',
      apellido = NULL,
      updated_at = now()
  WHERE id = v_principal;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalizar_identidad_conversion_demo
  ON public.demo_conversiones_pendientes;

CREATE TRIGGER trg_normalizar_identidad_conversion_demo
AFTER UPDATE OF estado ON public.demo_conversiones_pendientes
FOR EACH ROW
WHEN (NEW.estado = 'COMPLETADA')
EXECUTE FUNCTION app.normalizar_identidad_conversion_demo();

-- Replace the atomic conversion with the definitive identity cleanup. When a
-- tenant chooses "start from zero", secondary demo users are test data too:
-- their RBAC rows are removed by the existing foreign-key cascades.
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

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text, 386));

  SELECT id
    INTO v_principal
  FROM public.usuarios_sistema
  WHERE tenant_id = p_tenant
    AND is_demo_user = true
  ORDER BY created_at ASC, id ASC
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

    DELETE FROM public.usuarios
    WHERE tenant_id = p_tenant
      AND id <> v_principal;

    DELETE FROM public.usuarios_sistema
    WHERE tenant_id = p_tenant
      AND id <> v_principal
      AND is_demo_user = true;
  END IF;

  UPDATE public.empresa_config
  SET razon_social = p_razon_social,
      nombre_comercial = p_razon_social,
      email = p_email,
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
      nombre = 'Administrador',
      apellido = NULL,
      nombre_usuario = 'administrador',
      is_demo_user = false,
      demo_email_temp = NULL,
      updated_at = now()
  WHERE id = v_principal;

  UPDATE public.usuarios
  SET nombre = 'Administrador',
      apellido = NULL,
      updated_at = now()
  WHERE id = v_principal;

  IF COALESCE(p_conservar_datos, true) THEN
    UPDATE public.usuarios_sistema
    SET is_demo_user = false,
        demo_email_temp = NULL,
        updated_at = now()
    WHERE tenant_id = p_tenant
      AND id <> v_principal
      AND is_demo_user = true;
  END IF;

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

-- Repair conversions completed before this trigger existed without touching
-- tenants that intentionally chose a non-demo commercial name.
DELETE FROM public.usuarios AS u
USING public.usuarios_sistema AS us
WHERE u.id = us.id
  AND lower(COALESCE(us.apellido, '')) = 'demo'
  AND lower(COALESCE(us.nombre_usuario, '')) IN ('aprobador', 'vendedor', 'cajero', 'almacenero')
  AND EXISTS (
    SELECT 1
    FROM public.demo_conversiones_pendientes AS dcp
    WHERE dcp.tenant_id = us.tenant_id
      AND dcp.estado = 'COMPLETADA'
      AND dcp.conservar_datos = false
  );

DELETE FROM public.usuarios_sistema AS us
WHERE lower(COALESCE(us.apellido, '')) = 'demo'
  AND lower(COALESCE(us.nombre_usuario, '')) IN ('aprobador', 'vendedor', 'cajero', 'almacenero')
  AND EXISTS (
    SELECT 1
    FROM public.demo_conversiones_pendientes AS dcp
    WHERE dcp.tenant_id = us.tenant_id
      AND dcp.estado = 'COMPLETADA'
      AND dcp.conservar_datos = false
  );

UPDATE public.empresa_config AS ec
SET nombre_comercial = ec.razon_social,
    email = COALESCE(
      (
        SELECT us.email
        FROM public.usuarios_sistema AS us
        WHERE us.tenant_id = ec.tenant_id
          AND us.activo = true
          AND us.is_super_admin = false
        ORDER BY us.created_at ASC, us.id ASC
        LIMIT 1
      ),
      ec.email
    ),
    updated_at = now()
WHERE ec.is_demo = false
  AND (
    ec.nombre_comercial IS NULL
    OR btrim(ec.nombre_comercial) = ''
    OR lower(ec.nombre_comercial) LIKE '%demo%'
  )
  AND EXISTS (
    SELECT 1
    FROM public.demo_conversiones_pendientes AS dcp
    WHERE dcp.tenant_id = ec.tenant_id
      AND dcp.estado = 'COMPLETADA'
  );

UPDATE public.empresa_config AS ec
SET serie_guia_remision = 'T001',
    updated_at = now()
WHERE ec.is_demo = false
  AND ec.configuracion_completa = true
  AND upper(COALESCE(ec.pais, 'PE')) = 'PE'
  AND NULLIF(btrim(ec.serie_guia_remision), '') IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.demo_conversiones_pendientes AS dcp
    WHERE dcp.tenant_id = ec.tenant_id
      AND dcp.estado = 'COMPLETADA'
  );

UPDATE public.usuarios_sistema AS us
SET nombre = 'Administrador',
    apellido = NULL,
    nombre_usuario = 'administrador',
    updated_at = now()
WHERE us.activo = true
  AND us.is_super_admin = false
  AND (
    us.nombre IS NULL
    OR btrim(us.nombre) = ''
    OR lower(concat_ws(' ', us.nombre, us.apellido)) LIKE '%demo%'
    OR lower(COALESCE(us.nombre_usuario, '')) = 'demo'
  )
  AND us.id = (
    SELECT principal.id
    FROM public.usuarios_sistema AS principal
    WHERE principal.tenant_id = us.tenant_id
      AND principal.activo = true
      AND principal.is_super_admin = false
    ORDER BY principal.created_at ASC, principal.id ASC
    LIMIT 1
  )
  AND EXISTS (
    SELECT 1
    FROM public.demo_conversiones_pendientes AS dcp
    WHERE dcp.tenant_id = us.tenant_id
      AND dcp.estado = 'COMPLETADA'
  );

UPDATE public.usuarios AS u
SET nombre = 'Administrador',
    apellido = NULL,
    updated_at = now()
WHERE EXISTS (
    SELECT 1
    FROM public.usuarios_sistema AS us
    JOIN public.demo_conversiones_pendientes AS dcp
      ON dcp.tenant_id = us.tenant_id
     AND dcp.estado = 'COMPLETADA'
    WHERE us.id = u.id
      AND us.nombre = 'Administrador'
      AND us.nombre_usuario = 'administrador'
  );

NOTIFY pgrst, 'reload schema';
