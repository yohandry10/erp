-- Cambiar la contraseña propia con sesión iniciada. El hash esperado evita que dos
-- cambios simultáneos se pisen, y revocar las sesiones saca a quien la conociera.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION public.cambiar_password_propio_auth_tx(
  p_usuario_id uuid, p_expected_password_hash text, p_new_password_hash text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF p_usuario_id IS NULL OR COALESCE(p_expected_password_hash, '') = '' OR COALESCE(p_new_password_hash, '') = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUTH_PASSWORD_CHANGE_INVALID';
  END IF;

  UPDATE public.usuarios_sistema u SET
    password_hash = p_new_password_hash,
    password_reset_token = NULL,
    password_reset_expires = NULL,
    failed_login_attempts = 0,
    locked_until = NULL,
    updated_at = now()
  WHERE u.id = p_usuario_id
    AND u.password_hash = p_expected_password_hash
    AND COALESCE(u.activo, false);

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.user_sessions s SET
    estado = 'REVOCADA', revoked_at = COALESCE(s.revoked_at, now()),
    revocation_reason = COALESCE(s.revocation_reason, 'PASSWORD_CHANGED'), updated_at = now()
  WHERE s.usuario_sistema_id = p_usuario_id AND s.revoked_at IS NULL;

  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.cambiar_password_propio_auth_tx(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cambiar_password_propio_auth_tx(uuid, text, text) TO service_role;

COMMIT;
