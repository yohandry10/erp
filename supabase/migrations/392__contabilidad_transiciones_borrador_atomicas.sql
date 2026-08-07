-- Transiciones del ciclo de vida bajo lock.
--
-- La comprobacion de BORRADOR y el cambio de estado deben ocurrir en el mismo
-- statement; de otro modo dos solicitudes concurrentes pueden reportar exito
-- aunque solo una haya modificado la fila.

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

CREATE OR REPLACE FUNCTION public.transicionar_asiento_borrador_tx(
  p_tenant_id uuid,
  p_asiento_id uuid,
  p_destino text,
  p_actor text,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $function$
DECLARE
  v_asiento public.asientos_contables;
  v_destino text := upper(COALESCE(NULLIF(btrim(p_destino), ''), ''));
  v_num_detalles integer;
  v_total_debe numeric;
  v_total_haber numeric;
BEGIN
  SELECT * INTO v_asiento
  FROM public.asientos_contables a
  WHERE a.id = p_asiento_id
    AND a.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASIENTO_NO_ENCONTRADO';
  END IF;

  IF upper(COALESCE(v_asiento.estado::text, '')) <> 'BORRADOR' THEN
    RAISE EXCEPTION 'ASIENTO_CAMBIO_CONCURRENTEMENTE:%', v_asiento.estado;
  END IF;

  IF v_destino = 'CONFIRMADO' THEN
    SELECT
      count(*),
      round(COALESCE(sum(COALESCE(d.debe, 0)), 0), 2),
      round(COALESCE(sum(COALESCE(d.haber, 0)), 0), 2)
    INTO v_num_detalles, v_total_debe, v_total_haber
    FROM public.detalle_asientos d
    WHERE d.asiento_id = p_asiento_id
      AND d.tenant_id = p_tenant_id;

    IF v_num_detalles < 2 OR v_total_debe <= 0 OR v_total_debe <> v_total_haber THEN
      RAISE EXCEPTION 'ASIENTO_NO_CUADRA:%:%:%', v_num_detalles, v_total_debe, v_total_haber;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.detalle_asientos d
      LEFT JOIN public.plan_cuentas c
        ON c.id = d.cuenta_id
       AND c.tenant_id = p_tenant_id
      WHERE d.asiento_id = p_asiento_id
        AND d.tenant_id = p_tenant_id
        AND (
          c.id IS NULL
          OR COALESCE(d.debe, 0) < 0
          OR COALESCE(d.haber, 0) < 0
          OR (COALESCE(d.debe, 0) = 0 AND COALESCE(d.haber, 0) = 0)
          OR (COALESCE(d.debe, 0) > 0 AND COALESCE(d.haber, 0) > 0)
        )
    ) THEN
      RAISE EXCEPTION 'ASIENTO_DETALLE_INVALIDO';
    END IF;

    UPDATE public.asientos_contables a
    SET estado = 'CONFIRMADO',
        total_debe = v_total_debe,
        total_haber = v_total_haber,
        confirmado_por = p_actor,
        confirmado_en = now(),
        updated_at = now()
    WHERE a.id = p_asiento_id
      AND a.tenant_id = p_tenant_id
    RETURNING * INTO v_asiento;
  ELSIF v_destino = 'ANULADO' THEN
    IF NULLIF(btrim(COALESCE(p_motivo, '')), '') IS NULL THEN
      RAISE EXCEPTION 'ASIENTO_MOTIVO_ANULACION_REQUERIDO';
    END IF;

    UPDATE public.asientos_contables a
    SET estado = 'ANULADO',
        anulado_por = p_actor,
        anulado_en = now(),
        motivo_anulacion = btrim(p_motivo),
        updated_at = now()
    WHERE a.id = p_asiento_id
      AND a.tenant_id = p_tenant_id
    RETURNING * INTO v_asiento;
  ELSE
    RAISE EXCEPTION 'ASIENTO_TRANSICION_INVALIDA:%', v_destino;
  END IF;

  RETURN to_jsonb(v_asiento);
END;
$function$;

CREATE OR REPLACE FUNCTION public.eliminar_asiento_borrador_tx(
  p_tenant_id uuid,
  p_asiento_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $function$
DECLARE
  v_estado text;
BEGIN
  SELECT a.estado::text INTO v_estado
  FROM public.asientos_contables a
  WHERE a.id = p_asiento_id
    AND a.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASIENTO_NO_ENCONTRADO';
  END IF;

  IF upper(COALESCE(v_estado, '')) <> 'BORRADOR' THEN
    RAISE EXCEPTION 'ASIENTO_CAMBIO_CONCURRENTEMENTE:%', v_estado;
  END IF;

  DELETE FROM public.asientos_contables a
  WHERE a.id = p_asiento_id
    AND a.tenant_id = p_tenant_id;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.transicionar_asiento_borrador_tx(uuid, uuid, text, text, text)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.eliminar_asiento_borrador_tx(uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.transicionar_asiento_borrador_tx(uuid, uuid, text, text, text)
TO service_role;
GRANT EXECUTE ON FUNCTION public.eliminar_asiento_borrador_tx(uuid, uuid)
TO service_role;

COMMENT ON FUNCTION public.transicionar_asiento_borrador_tx(uuid, uuid, text, text, text)
IS 'Confirma o anula un borrador bajo lock; al confirmar recalcula el cuadre desde las lineas.';
COMMENT ON FUNCTION public.eliminar_asiento_borrador_tx(uuid, uuid)
IS 'Elimina un borrador bajo lock y rechaza cambios concurrentes de estado.';

COMMIT;
