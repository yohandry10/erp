-- Conserva la aprobación de nómina como estado contable/laboral explícito.
-- La normalización anterior trataba "aprobada" como sinónimo de "calculada",
-- por lo que el PUT respondía 200 pero la transición nunca quedaba persistida.

ALTER TABLE public.planillas DROP CONSTRAINT IF EXISTS ck_planillas_estado_pago_consistency_runtime_200;
ALTER TABLE public.planillas DROP CONSTRAINT IF EXISTS ck_planillas_estado_runtime_200;

CREATE OR REPLACE FUNCTION app.normalize_planilla_estado(
  p_estado text,
  p_estado_pago text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_estado text := lower(COALESCE(NULLIF(btrim(p_estado), ''), 'borrador'));
  v_estado_pago text := app.normalize_planilla_estado_pago(p_estado_pago);
BEGIN
  IF v_estado_pago = 'pagado' THEN
    RETURN 'pagada';
  END IF;

  IF v_estado_pago = 'anulado' THEN
    RETURN 'anulada';
  END IF;

  IF v_estado IN ('aprobada', 'aprobado', 'confirmada', 'confirmado') THEN
    RETURN 'aprobada';
  END IF;

  IF v_estado IN ('calculada', 'calculo', 'lista') THEN
    RETURN 'calculada';
  END IF;

  IF v_estado IN ('pagada', 'pagado', 'cerrada', 'cerrado', 'finalizada', 'finalizado', 'completada', 'completado') THEN
    RETURN 'pagada';
  END IF;

  IF v_estado IN ('anulada', 'anulado', 'cancelada', 'cancelado', 'rechazada', 'rechazado', 'inactiva', 'inactivo', 'baja') THEN
    RETURN 'anulada';
  END IF;

  IF v_estado_pago = 'parcial' THEN
    RETURN 'calculada';
  END IF;

  RETURN 'borrador';
END;
$$;

ALTER TABLE public.planillas
  ADD CONSTRAINT ck_planillas_estado_runtime_200
  CHECK (lower(estado::text) IN ('borrador', 'calculada', 'aprobada', 'pagada', 'anulada'))
  NOT VALID;

ALTER TABLE public.planillas
  ADD CONSTRAINT ck_planillas_estado_pago_consistency_runtime_200
  CHECK (
    (
      lower(estado::text) = 'borrador'
      AND lower(estado_pago::text) = 'pendiente'
    )
    OR (
      lower(estado::text) IN ('calculada', 'aprobada')
      AND lower(estado_pago::text) IN ('pendiente', 'parcial')
    )
    OR (
      lower(estado::text) = 'pagada'
      AND lower(estado_pago::text) = 'pagado'
    )
    OR (
      lower(estado::text) = 'anulada'
      AND lower(estado_pago::text) = 'anulado'
    )
  )
  NOT VALID;

ALTER TABLE public.planillas VALIDATE CONSTRAINT ck_planillas_estado_runtime_200;
ALTER TABLE public.planillas VALIDATE CONSTRAINT ck_planillas_estado_pago_consistency_runtime_200;
