-- Migracion 520: excepcion administrativa, acotada y auditable, a la
-- segregacion de funciones de cotizaciones.
--
-- La regla general sigue siendo que el creador no decide su propia cotizacion.
-- Sin embargo, ADMIN y ADMIN_DEMO son roles operativos de administracion y el
-- producto permite que creen y aprueben una cotizacion. La excepcion se concede
-- solo cuando el actor conserva un rol canonico del tenant y ese rol tiene
-- concedido explicitamente `ventas.cotizaciones.approve`.
--
-- La autorrechazo permanece prohibida y una autoaprobacion sin observacion
-- recibe un texto de auditoria estable. El RPC sigue siendo invocable solo por
-- service_role; el guard HTTP conserva la primera barrera de permisos.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.cambiar_estado_cotizacion_tx(
  p_cotizacion_id uuid,
  p_tenant_id uuid,
  p_nuevo_estado text,
  p_actor_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_cot public.cotizaciones%ROWTYPE;
  v_estado text := upper(nullif(btrim(p_nuevo_estado), ''));
  v_motivo text := nullif(btrim(p_motivo), '');
  v_admin_autorizado boolean := false;
  v_autoaprobacion_admin boolean := false;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = p_actor_id
      AND u.tenant_id = p_tenant_id
      AND coalesce(u.activo, true)
  ) THEN
    RAISE EXCEPTION 'El actor no pertenece al tenant o está inactivo';
  END IF;

  SELECT * INTO v_cot
  FROM public.cotizaciones
  WHERE id = p_cotizacion_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cotización no encontrada';
  END IF;

  IF NOT (
    (upper(v_cot.estado::text) = 'BORRADOR' AND v_estado = 'ENVIADA')
    OR (
      upper(v_cot.estado::text) IN ('BORRADOR', 'ENVIADA')
      AND v_estado IN ('APROBADA', 'RECHAZADA')
    )
  ) THEN
    RAISE EXCEPTION 'Transición de cotización inválida: % -> %', v_cot.estado, v_estado;
  END IF;

  IF v_estado IN ('APROBADA', 'RECHAZADA') THEN
    IF v_cot.created_by IS NULL THEN
      RAISE EXCEPTION 'La cotización no tiene creador trazable';
    END IF;

    IF v_cot.created_by = p_actor_id THEN
      IF v_estado = 'RECHAZADA' THEN
        RAISE EXCEPTION 'El creador no puede rechazar su propia cotización';
      END IF;

      SELECT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles r
          ON r.id = ur.role_id
         AND r.tenant_id = p_tenant_id
        JOIN public.rol_permisos rp
          ON rp.role_id = r.id
         AND coalesce(rp.concedido, false)
        JOIN public.permisos p
          ON p.id = rp.permiso_id
         AND p.tenant_id = p_tenant_id
        WHERE ur.usuario_sistema_id = p_actor_id
          AND ur.tenant_id = p_tenant_id
          AND coalesce(r.activo, true)
          AND coalesce(r.is_system_role, false)
          AND upper(btrim(r.nombre)) IN ('ADMIN', 'ADMIN_DEMO')
          AND coalesce(p.activo, true)
          AND lower(coalesce(
            nullif(btrim(p.codigo), ''),
            p.modulo || '.' || p.recurso || '.' || p.accion
          )) = 'ventas.cotizaciones.approve'
      ) INTO v_admin_autorizado;

      IF NOT v_admin_autorizado THEN
        RAISE EXCEPTION 'La cotización requiere un aprobador distinto del creador';
      END IF;

      v_autoaprobacion_admin := true;
    END IF;
  END IF;

  UPDATE public.cotizaciones
  SET estado = v_estado,
      aprobado_por = CASE
        WHEN v_estado = 'APROBADA' THEN p_actor_id
        ELSE aprobado_por
      END,
      fecha_aprobacion = CASE
        WHEN v_estado = 'APROBADA' THEN now()
        ELSE fecha_aprobacion
      END,
      observaciones_aprobacion = CASE
        WHEN v_estado = 'APROBADA' THEN coalesce(
          v_motivo,
          CASE WHEN v_autoaprobacion_admin THEN 'Autoaprobación administrativa' END
        )
        ELSE observaciones_aprobacion
      END,
      rechazado_por = CASE
        WHEN v_estado = 'RECHAZADA' THEN p_actor_id
        ELSE rechazado_por
      END,
      fecha_rechazo = CASE
        WHEN v_estado = 'RECHAZADA' THEN now()
        ELSE fecha_rechazo
      END,
      motivo_rechazo = CASE
        WHEN v_estado = 'RECHAZADA' THEN v_motivo
        ELSE motivo_rechazo
      END,
      updated_at = now()
  WHERE id = p_cotizacion_id
    AND tenant_id = p_tenant_id
  RETURNING * INTO v_cot;

  RETURN to_jsonb(v_cot);
END;
$$;

REVOKE ALL ON FUNCTION public.cambiar_estado_cotizacion_tx(uuid, uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_cotizacion_tx(uuid, uuid, text, uuid, text)
  TO service_role;

COMMENT ON FUNCTION public.cambiar_estado_cotizacion_tx(uuid, uuid, text, uuid, text) IS
  'Envía o decide una cotización con actor tenant; mantiene segregación operativa y permite autoaprobación trazable a ADMIN/ADMIN_DEMO con permiso explícito.';

COMMIT;
