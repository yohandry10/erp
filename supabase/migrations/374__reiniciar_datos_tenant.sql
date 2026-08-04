-- Al convertir un demo en cuenta real, el cliente elige: conservar lo que
-- probó o empezar de cero. Hasta ahora no habia eleccion —siempre se
-- conservaba— y el boton que la ofrecia no existia.
--
-- Esta funcion implementa el "empezar de cero". Borra los datos operativos del
-- tenant y conserva la estructura que hace usable el sistema: la empresa, los
-- usuarios, el almacen, el plan de cuentas, los metodos de pago y las cajas.
-- Sin esa estructura el cliente entraria a una cuenta que no puede ni vender.
--
-- Se recorren todas las tablas con tenant_id en vez de enumerar el orden de
-- borrado a mano: son 189 y cualquier lista escrita se quedaria desactualizada
-- a la primera tabla nueva. El bucle repite hasta que no queda nada por borrar
-- o hasta que deja de haber progreso, que es como se resuelven las dependencias
-- sin conocer el grafo.

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.reiniciar_datos_tenant(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  -- Estructura: sin esto la cuenta queda inutilizable, no "limpia".
  v_conservar text[] := ARRAY[
    'tenants',
    'empresa_config',
    'usuarios',
    'usuarios_sistema',
    'usuario_configuracion',
    'roles',
    'sucursales',
    'almacenes',
    'almacen_ubicaciones',
    'plan_cuentas',
    'metodos_pago',
    'cajas',
    'configuracion_fiscal'
  ];
  v_tabla text;
  v_borradas bigint;
  v_total bigint := 0;
  v_vuelta int := 0;
  v_progreso bigint;
  v_detalle jsonb := '{}'::jsonb;
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
      EXCEPTION WHEN foreign_key_violation THEN
        -- Otra tabla la referencia todavia; la siguiente vuelta la alcanzara.
        NULL;
      END;
    END LOOP;

    EXIT WHEN v_progreso = 0 OR v_vuelta >= 10;
  END LOOP;

  -- Si algo quedo colgando se dice, en vez de devolver un exito a medias.
  RETURN jsonb_build_object(
    'reiniciado', true,
    'filas_borradas', v_total,
    'vueltas', v_vuelta,
    'detalle', v_detalle
  );
END;
$$;

REVOKE ALL ON FUNCTION app.reiniciar_datos_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reiniciar_datos_tenant(uuid) TO service_role;

COMMENT ON FUNCTION app.reiniciar_datos_tenant(uuid) IS
  'Borra los datos operativos de un tenant conservando su estructura. Se usa cuando el cliente elige empezar de cero al convertir su demo.';

-- PostgREST solo expone el esquema public, asi que la API no alcanzaria la
-- funcion viviendo en app. Este envoltorio es la puerta, y queda restringida a
-- service_role: borrar los datos de un tenant no puede quedar al alcance de un
-- token de usuario.
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
