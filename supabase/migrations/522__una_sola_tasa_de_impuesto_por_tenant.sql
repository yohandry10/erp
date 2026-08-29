-- 522: una sola tasa de impuesto por contribuyente.
--
-- Habia dos ramas del servidor calculando el mismo numero de fuentes distintas:
--
--   ventas  (RPC del POS, 451)         -> empresa_config.igv_porcentaje
--   compras (439/440/441/444/453)      -> app.tasa_impuesto_tenant, que
--                                         prefiere configuracion_fiscal por pais
--
-- Mientras coincidieran no se notaba, y hoy coinciden: los 79 contribuyentes de
-- produccion estan a 18,00 en las dos. Pero el asistente inicial deja escribir
-- ese porcentaje y `PUT /configuration/empresa` deja cambiarlo, y en cuanto se
-- separan el mismo tenant vende a una tasa y compra a otra. Comprobado el
-- 2026-08-28 poniendo un tenant al 10 %: ventas 10,00 y compras 18,00.
--
-- Que discrepen es peor que cualquiera de las dos por separado: el credito
-- fiscal de las compras deja de cuadrar con el debito de las ventas, y el
-- descuadre no lo denuncia nadie.
--
-- Manda `empresa_config.igv_porcentaje` porque es la que el usuario escribe y
-- la que ya usa la venta, que es el camino de mas volumen. `configuracion_fiscal`
-- pasa a ser el valor por defecto del pais, para el tenant que nunca la fijo.
--
-- Como los 79 estan alineados, esto no cambia ningun importe existente: cierra
-- un hueco latente.

CREATE OR REPLACE FUNCTION app.tasa_impuesto_tenant(
  p_tenant_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tasa numeric;
BEGIN
  -- La del contribuyente primero: es la que escribe en el asistente y la que
  -- aplica la venta. `IS NOT NULL` y no `coalesce`, porque **0 es una tasa**
  -- --exonerado por la Ley de Amazonia-- y no un hueco.
  SELECT ec.igv_porcentaje INTO v_tasa
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id
    AND ec.igv_porcentaje IS NOT NULL;

  -- Sin tasa propia, la del pais. Se conserva el orden original: una fila del
  -- propio tenant gana a la global.
  IF v_tasa IS NULL THEN
    SELECT coalesce(cf.tasa_igv, cf.impuesto_principal_porcentaje)
      INTO v_tasa
    FROM public.empresa_config ec
    JOIN public.configuracion_fiscal cf
      ON cf.pais_id::text = ec.pais_id::text
     AND coalesce(cf.activo, true)
     AND (cf.tenant_id = p_tenant_id OR cf.tenant_id IS NULL)
    WHERE ec.tenant_id = p_tenant_id
    ORDER BY (cf.tenant_id = p_tenant_id) DESC NULLS LAST, cf.updated_at DESC, cf.id
    LIMIT 1;
  END IF;

  v_tasa := coalesce(v_tasa, 0.18);
  IF v_tasa > 1 THEN v_tasa := v_tasa / 100; END IF;
  IF v_tasa < 0 OR v_tasa > 1 THEN
    RAISE EXCEPTION 'La tasa tributaria configurada para el tenant es inválida: %', v_tasa;
  END IF;
  RETURN v_tasa;
END;
$$;

DO $seguridad$
BEGIN
  -- Recrear conserva los privilegios, pero se reafirman para que un despliegue
  -- parcial no deje compras sin poder calcular.
  REVOKE ALL ON FUNCTION app.tasa_impuesto_tenant(uuid)
    FROM PUBLIC, anon, authenticated;
END
$seguridad$;
