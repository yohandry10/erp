-- Contratos comerciales durables para la conversión demo.
-- Separa el nivel funcional (BASICO/PROFESIONAL/ENTERPRISE) del plazo
-- prepagado y congela meses pagados, bonificados y vigencia al confirmar.

BEGIN;

ALTER TABLE public.demo_conversiones_pendientes
  ADD COLUMN IF NOT EXISTS meses_pagados integer,
  ADD COLUMN IF NOT EXISTS meses_bonificados integer,
  ADD COLUMN IF NOT EXISTS meses_servicio integer,
  ADD COLUMN IF NOT EXISTS oferta_version integer,
  ADD COLUMN IF NOT EXISTS oferta_snapshot jsonb;

-- Los registros históricos conservan su contrato original. No se les concede
-- retroactivamente una promoción ni se activa un vencimiento inesperado.
UPDATE public.demo_conversiones_pendientes
SET meses_pagados = CASE lower(periodo) WHEN 'anual' THEN 12 ELSE 1 END,
    meses_bonificados = 0,
    meses_servicio = CASE lower(periodo) WHEN 'anual' THEN 12 ELSE 1 END,
    oferta_version = 0,
    oferta_snapshot = jsonb_build_object(
      'legacy', true,
      'periodo', lower(COALESCE(periodo, 'mensual')),
      'monto', monto,
      'moneda', COALESCE(moneda, 'PEN')
    )
WHERE meses_pagados IS NULL
   OR meses_bonificados IS NULL
   OR meses_servicio IS NULL
   OR oferta_version IS NULL
   OR oferta_snapshot IS NULL;

ALTER TABLE public.demo_conversiones_pendientes
  ALTER COLUMN meses_pagados SET NOT NULL,
  ALTER COLUMN meses_pagados SET DEFAULT 1,
  ALTER COLUMN meses_bonificados SET NOT NULL,
  ALTER COLUMN meses_bonificados SET DEFAULT 0,
  ALTER COLUMN meses_servicio SET NOT NULL,
  ALTER COLUMN meses_servicio SET DEFAULT 1,
  ALTER COLUMN oferta_version SET NOT NULL,
  ALTER COLUMN oferta_version SET DEFAULT 0,
  ALTER COLUMN oferta_snapshot SET NOT NULL,
  ALTER COLUMN oferta_snapshot SET DEFAULT '{}'::jsonb;

ALTER TABLE public.demo_conversiones_pendientes
  DROP CONSTRAINT IF EXISTS ck_demo_conv_periodo_valid,
  DROP CONSTRAINT IF EXISTS ck_demo_conv_commercial_term_488;

ALTER TABLE public.demo_conversiones_pendientes
  ADD CONSTRAINT ck_demo_conv_periodo_valid
    CHECK (lower(periodo) IN ('mensual', 'trimestral', 'semestral', 'anual')),
  ADD CONSTRAINT ck_demo_conv_commercial_term_488 CHECK (
    meses_pagados > 0
    AND meses_bonificados >= 0
    AND meses_servicio = meses_pagados + meses_bonificados
    AND oferta_version >= 0
    AND jsonb_typeof(oferta_snapshot) = 'object'
    AND (
      oferta_version = 0
      OR (lower(periodo) = 'trimestral' AND meses_pagados = 3 AND meses_bonificados = 0 AND meses_servicio = 3)
      OR (lower(periodo) = 'semestral' AND meses_pagados = 6 AND meses_bonificados = 3 AND meses_servicio = 9)
      OR (lower(periodo) = 'anual' AND meses_pagados = 12 AND meses_bonificados = 6 AND meses_servicio = 18)
    )
  );

ALTER TABLE public.empresa_config
  ADD COLUMN IF NOT EXISTS plan_periodo text,
  ADD COLUMN IF NOT EXISTS plan_meses_pagados integer,
  ADD COLUMN IF NOT EXISTS plan_meses_bonificados integer,
  ADD COLUMN IF NOT EXISTS plan_meses_servicio integer,
  ADD COLUMN IF NOT EXISTS plan_inicia_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan_vence_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan_estado text,
  ADD COLUMN IF NOT EXISTS plan_oferta_snapshot jsonb;

ALTER TABLE public.empresa_config
  DROP CONSTRAINT IF EXISTS ck_empresa_plan_term_488,
  DROP CONSTRAINT IF EXISTS ck_empresa_plan_estado_488;

ALTER TABLE public.empresa_config
  ADD CONSTRAINT ck_empresa_plan_term_488 CHECK (
    plan_estado IS NULL
    OR (
      lower(plan_periodo) IN ('trimestral', 'semestral', 'anual')
      AND plan_meses_pagados > 0
      AND plan_meses_bonificados >= 0
      AND plan_meses_servicio = plan_meses_pagados + plan_meses_bonificados
      AND plan_inicia_at IS NOT NULL
      AND plan_vence_at > plan_inicia_at
      AND jsonb_typeof(plan_oferta_snapshot) = 'object'
    )
  ),
  ADD CONSTRAINT ck_empresa_plan_estado_488 CHECK (
    plan_estado IS NULL OR upper(plan_estado) IN ('ACTIVO', 'VENCIDO', 'SUSPENDIDO', 'CANCELADO')
  );

CREATE INDEX IF NOT EXISTS idx_empresa_config_plan_vence_488
  ON public.empresa_config (plan_vence_at)
  WHERE plan_estado = 'ACTIVO' AND plan_vence_at IS NOT NULL;

CREATE OR REPLACE FUNCTION app.activar_plan_conversion_demo_488()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_inicio timestamptz;
BEGIN
  IF upper(NEW.estado::text) <> 'COMPLETADA'
     OR upper(COALESCE(OLD.estado::text, '')) = 'COMPLETADA' THEN
    RETURN NEW;
  END IF;

  IF NEW.oferta_version < 1
     OR lower(NEW.periodo) NOT IN ('trimestral', 'semestral', 'anual') THEN
    -- Las conversiones históricas carecen de una promesa comercial durable.
    -- Se preservan como legacy; no se inventa una fecha de corte retroactiva.
    RETURN NEW;
  END IF;

  v_inicio := COALESCE(NEW.completed_at, now());
  UPDATE public.empresa_config ec
  SET plan_periodo = lower(NEW.periodo),
      plan_meses_pagados = NEW.meses_pagados,
      plan_meses_bonificados = NEW.meses_bonificados,
      plan_meses_servicio = NEW.meses_servicio,
      plan_inicia_at = v_inicio,
      plan_vence_at = v_inicio + make_interval(months => NEW.meses_servicio),
      plan_estado = 'ACTIVO',
      plan_oferta_snapshot = NEW.oferta_snapshot || jsonb_build_object(
        'conversion_id', NEW.id,
        'confirmed_at', v_inicio,
        'meses_pagados', NEW.meses_pagados,
        'meses_bonificados', NEW.meses_bonificados,
        'meses_servicio', NEW.meses_servicio
      ),
      updated_at = now()
  WHERE ec.tenant_id = NEW.tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEMO_PLAN_COMPANY_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_activar_plan_conversion_demo_488
  ON public.demo_conversiones_pendientes;
CREATE TRIGGER trg_activar_plan_conversion_demo_488
AFTER UPDATE OF estado ON public.demo_conversiones_pendientes
FOR EACH ROW
EXECUTE FUNCTION app.activar_plan_conversion_demo_488();

-- Reemplaza únicamente el writer de sesión de 462 para hacer cumplir el
-- vencimiento de contratos nuevos. Los tenants legacy con plan_estado NULL
-- conservan su comportamiento hasta que tengan un contrato migrado de forma
-- explícita.
CREATE OR REPLACE FUNCTION public.crear_sesion_login_auth_tx(
  p_usuario_id uuid,
  p_session_token text,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_user public.usuarios_sistema;
  v_session public.user_sessions;
BEGIN
  IF NULLIF(btrim(COALESCE(p_session_token, '')), '') IS NULL
     OR p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'AUTH_SESSION_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_user
  FROM public.usuarios_sistema u
  WHERE u.id = p_usuario_id
  FOR UPDATE;
  IF NOT FOUND
     OR NOT COALESCE(v_user.activo, false)
     OR lower(v_user.estado::text) <> 'activo' THEN
    RAISE EXCEPTION 'AUTH_USER_INACTIVE_OR_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.empresa_config ec
    WHERE ec.tenant_id = v_user.tenant_id
      AND (
        (
          lower(COALESCE(ec.estado::text, 'activo')) = 'activo'
          AND (
            ec.plan_estado IS NULL
            OR (upper(ec.plan_estado) = 'ACTIVO' AND ec.plan_vence_at > now())
          )
        )
        OR (
          lower(ec.estado::text) = 'prueba'
          AND COALESCE(ec.is_demo, false)
          AND ec.demo_expires_at > now()
        )
      )
  ) THEN
    RAISE EXCEPTION 'AUTH_TENANT_INACTIVE_OR_PLAN_EXPIRED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.usuarios_sistema SET
    failed_login_attempts = 0,
    locked_until = NULL,
    fecha_ultimo_acceso = now(),
    updated_at = now()
  WHERE id = p_usuario_id;

  INSERT INTO public.user_sessions (
    tenant_id, usuario_sistema_id, session_token, estado,
    expires_at, last_activity, created_at, updated_at
  ) VALUES (
    v_user.tenant_id, p_usuario_id, btrim(p_session_token), 'ACTIVO',
    p_expires_at, now(), now(), now()
  )
  RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'session_id', v_session.id,
    'session_token', v_session.session_token,
    'expires_at', v_session.expires_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.validar_sesion_auth_tx(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_session public.user_sessions;
  v_user public.usuarios_sistema;
  v_company public.empresa_config;
  v_reason text;
BEGIN
  SELECT * INTO v_session
  FROM public.user_sessions s
  WHERE s.session_token = btrim(COALESCE(p_session_token, ''))
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'SESSION_NOT_FOUND');
  END IF;

  SELECT * INTO v_user FROM public.usuarios_sistema u WHERE u.id = v_session.usuario_sistema_id;
  SELECT * INTO v_company FROM public.empresa_config ec WHERE ec.tenant_id = v_session.tenant_id;

  IF v_session.revoked_at IS NOT NULL OR upper(COALESCE(v_session.estado, '')) <> 'ACTIVO' THEN
    v_reason := 'SESSION_REVOKED';
  ELSIF v_session.expires_at IS NULL OR v_session.expires_at <= now() THEN
    v_reason := 'SESSION_EXPIRED';
  ELSIF v_user.id IS NULL OR NOT COALESCE(v_user.activo, false)
        OR lower(COALESCE(v_user.estado, '')) <> 'activo' THEN
    v_reason := 'USER_INACTIVE';
  ELSIF v_company.tenant_id IS NULL OR NOT (
    (
      lower(COALESCE(v_company.estado, 'activo')) = 'activo'
      AND (
        v_company.plan_estado IS NULL
        OR (upper(v_company.plan_estado) = 'ACTIVO' AND v_company.plan_vence_at > now())
      )
    )
    OR (
      lower(COALESCE(v_company.estado, '')) = 'prueba'
      AND COALESCE(v_company.is_demo, false)
      AND v_company.demo_expires_at > now()
    )
  ) THEN
    v_reason := 'TENANT_INACTIVE_OR_PLAN_EXPIRED';
  END IF;

  IF v_reason IS NOT NULL THEN
    UPDATE public.user_sessions
    SET estado = 'REVOCADA', revoked_at = COALESCE(revoked_at, now()),
        revocation_reason = COALESCE(revocation_reason, v_reason), updated_at = now()
    WHERE id = v_session.id;
    RETURN jsonb_build_object('valid', false, 'reason', v_reason);
  END IF;

  UPDATE public.user_sessions
  SET last_activity = now(), updated_at = now()
  WHERE id = v_session.id;
  RETURN jsonb_build_object(
    'valid', true,
    'session_id', v_session.id,
    'usuario_id', v_session.usuario_sistema_id,
    'tenant_id', v_session.tenant_id,
    'expires_at', v_session.expires_at,
    'plan_vence_at', v_company.plan_vence_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION app.activar_plan_conversion_demo_488() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crear_sesion_login_auth_tx(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validar_sesion_auth_tx(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_sesion_login_auth_tx(uuid, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.validar_sesion_auth_tx(text) TO service_role;

COMMIT;
