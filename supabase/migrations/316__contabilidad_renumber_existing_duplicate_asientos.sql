-- Reparacion de duplicados existentes de numeracion contable por tenant/periodo.
-- Conserva el primer asiento de cada numero y reasigna los duplicados con la
-- misma funcion transaccional usada por runtime.

BEGIN;

DO $$
DECLARE
  r record;
  v_reserved record;
BEGIN
  FOR r IN
    WITH ranked AS (
      SELECT
        id,
        tenant_id,
        fecha,
        row_number() OVER (
          PARTITION BY tenant_id, date_trunc('month', fecha), numero_asiento
          ORDER BY created_at, id
        ) AS rn
      FROM public.asientos_contables
      WHERE tenant_id IS NOT NULL
        AND fecha IS NOT NULL
        AND numero_asiento IS NOT NULL
    )
    SELECT id, tenant_id, fecha
    FROM ranked
    WHERE rn > 1
    ORDER BY fecha, id
  LOOP
    SELECT numero, codigo
      INTO v_reserved
    FROM public.obtener_siguiente_numero_asiento(r.tenant_id, r.fecha);

    UPDATE public.asientos_contables
      SET numero_asiento = v_reserved.numero,
          codigo = v_reserved.codigo,
          updated_at = now()
    WHERE id = r.id;
  END LOOP;
END;
$$;

COMMIT;
