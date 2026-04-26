-- Migration: Add function to calculate year result for closing entries
-- Description: Creates a function to calculate the net result (income - expenses) for a fiscal year

-- Function to calculate the result of the fiscal year (ingresos - gastos)
CREATE OR REPLACE FUNCTION calcular_resultado_ejercicio(
  p_tenant_id uuid,
  p_anio integer
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ingresos numeric := 0;
  v_gastos numeric := 0;
  v_resultado numeric := 0;
  v_fecha_inicio date;
  v_fecha_fin date;
BEGIN
  -- Construir rango de fechas para el año
  v_fecha_inicio := make_date(p_anio, 1, 1);
  v_fecha_fin := make_date(p_anio, 12, 31);

  -- Calcular total de ingresos (cuentas clase 7 en PCGE Perú)
  -- Ingresos tienen naturaleza acreedora, por lo que sumamos el haber y restamos el debe
  SELECT COALESCE(SUM(da.haber - da.debe), 0)
  INTO v_ingresos
  FROM detalle_asientos da
  INNER JOIN asientos_contables ac ON da.asiento_contable_id = ac.id
  INNER JOIN plan_cuentas pc ON da.cuenta_id = pc.id
  WHERE ac.tenant_id = p_tenant_id
    AND ac.fecha >= v_fecha_inicio
    AND ac.fecha <= v_fecha_fin
    AND ac.estado = 'APROBADO'
    AND pc.codigo LIKE '7%'; -- Cuentas de ingresos (clase 7)

  -- Calcular total de gastos (cuentas clase 6 en PCGE Perú)
  -- Gastos tienen naturaleza deudora, por lo que sumamos el debe y restamos el haber
  SELECT COALESCE(SUM(da.debe - da.haber), 0)
  INTO v_gastos
  FROM detalle_asientos da
  INNER JOIN asientos_contables ac ON da.asiento_contable_id = ac.id
  INNER JOIN plan_cuentas pc ON da.cuenta_id = pc.id
  WHERE ac.tenant_id = p_tenant_id
    AND ac.fecha >= v_fecha_inicio
    AND ac.fecha <= v_fecha_fin
    AND ac.estado = 'APROBADO'
    AND pc.codigo LIKE '6%'; -- Cuentas de gastos (clase 6)

  -- Calcular resultado (ingresos - gastos)
  v_resultado := v_ingresos - v_gastos;

  -- Log para debugging
  RAISE NOTICE 'Resultado ejercicio %: Ingresos=%, Gastos=%, Resultado=%', 
    p_anio, v_ingresos, v_gastos, v_resultado;

  RETURN v_resultado;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION calcular_resultado_ejercicio(uuid, integer) TO authenticated;

-- Add comment
COMMENT ON FUNCTION calcular_resultado_ejercicio IS 
  'Calcula el resultado del ejercicio (ingresos - gastos) para un año fiscal específico';
