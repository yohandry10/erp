-- Migracion 512: la suspension de retenciones de cuarta se puede anotar.
--
-- La 508 puso la columna `proveedores.suspension_retencion_cuarta_hasta` y el
-- disparador que la respeta: con una constancia vigente no se retiene el 8 %.
-- Lo que faltaba es la forma de anotarla. `proveedores` no se escribe directo
-- --lo impide la 459-- y su funcion de actualizacion lleva lista explicita de
-- columnas, asi que el campo llegaba y se ignoraba **en silencio**, que es la
-- peor de las formas de fallar: el contador cree que lo guardo, y al proveedor
-- le siguen reteniendo.
--
-- Esta migracion solo anade esa asignacion. El resto de la funcion es el que ya
-- estaba en produccion, copiado tal cual.

BEGIN;

CREATE OR REPLACE FUNCTION public.actualizar_proveedor_maestro_tx(p_proveedor_id uuid, p_tenant_id uuid, p_actor_id uuid, p_cambios jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app', 'pg_temp'
AS $function$
DECLARE
  v_old public.proveedores;
  v_new public.proveedores;
  v_doc text;
  v_name text;
BEGIN
  PERFORM app.assert_actor_comercial_459(p_tenant_id, p_actor_id);
  SELECT * INTO v_old FROM public.proveedores p
  WHERE p.id = p_proveedor_id AND p.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMMERCIAL_SUPPLIER_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  v_doc := CASE WHEN p_cambios ? 'ruc' OR p_cambios ? 'documento_identidad'
    THEN app.normalizar_identidad_comercial_459(COALESCE(p_cambios->>'documento_identidad', p_cambios->>'ruc'))
    ELSE v_old.documento_identidad END;
  v_name := CASE WHEN p_cambios ? 'razon_social' THEN NULLIF(btrim(p_cambios->>'razon_social'), '') ELSE v_old.razon_social END;
  IF v_doc IS NULL OR length(v_doc) NOT BETWEEN 9 AND 20 OR v_name IS NULL THEN
    RAISE EXCEPTION 'COMMERCIAL_SUPPLIER_INVALID_UPDATE' USING ERRCODE = '22023';
  END IF;

  UPDATE public.proveedores p SET
    documento_identidad = v_doc, ruc = v_doc, documento_numero = v_doc, numero_documento = v_doc, codigo = v_doc,
    documento_tipo = CASE WHEN p_cambios ? 'documento_tipo' THEN upper(p_cambios->>'documento_tipo') ELSE p.documento_tipo END,
    tipo_documento = CASE WHEN p_cambios ? 'documento_tipo' THEN upper(p_cambios->>'documento_tipo') ELSE p.tipo_documento END,
    razon_social = v_name, nombre = v_name,
    nombre_comercial = CASE WHEN p_cambios ? 'nombre_comercial' THEN COALESCE(NULLIF(btrim(p_cambios->>'nombre_comercial'), ''), v_name) ELSE p.nombre_comercial END,
    direccion = CASE WHEN p_cambios ? 'direccion' THEN NULLIF(btrim(p_cambios->>'direccion'), '') ELSE p.direccion END,
    telefono = CASE WHEN p_cambios ? 'telefono' THEN NULLIF(btrim(p_cambios->>'telefono'), '') ELSE p.telefono END,
    email = CASE WHEN p_cambios ? 'email' THEN NULLIF(lower(btrim(p_cambios->>'email')), '') ELSE p.email END,
    contacto = CASE WHEN p_cambios ? 'contacto' THEN NULLIF(btrim(p_cambios->>'contacto'), '') ELSE p.contacto END,
    condiciones_pago = CASE WHEN p_cambios ? 'condiciones_pago' THEN upper(p_cambios->>'condiciones_pago') ELSE p.condiciones_pago END,
    limite_credito = CASE WHEN p_cambios ? 'limite_credito' THEN (p_cambios->>'limite_credito')::numeric ELSE p.limite_credito END,
    dias_credito = CASE WHEN p_cambios ? 'dias_credito' THEN (p_cambios->>'dias_credito')::integer ELSE p.dias_credito END,
    activo = CASE WHEN p_cambios ? 'activo' THEN (p_cambios->>'activo')::boolean ELSE p.activo END,
    -- Constancia de suspension de retenciones de cuarta categoria. Se admite la
    -- cadena vacia para retirarla: la suspension caduca y hay que poder quitarla
    -- sin borrar el proveedor.
    suspension_retencion_cuarta_hasta = CASE
      WHEN p_cambios ? 'suspension_retencion_cuarta_hasta'
      THEN NULLIF(btrim(p_cambios->>'suspension_retencion_cuarta_hasta'), '')::date
      ELSE p.suspension_retencion_cuarta_hasta END,
    updated_by = p_actor_id, updated_at = now()
  WHERE p.id = p_proveedor_id AND p.tenant_id = p_tenant_id RETURNING * INTO v_new;
  IF COALESCE(v_new.limite_credito, 0) < 0 OR COALESCE(v_new.dias_credito, 0) < 0 OR v_new.email IS NULL THEN
    RAISE EXCEPTION 'COMMERCIAL_SUPPLIER_INVALID_UPDATE' USING ERRCODE = '22023';
  END IF;
  PERFORM app.auditar_comercial_459(p_tenant_id, p_actor_id, 'proveedores', 'UPDATE', p_proveedor_id, to_jsonb(v_old), to_jsonb(v_new), 'EDITAR_PROVEEDOR');
  RETURN to_jsonb(v_new);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'COMMERCIAL_SUPPLIER_IDENTITY_CONFLICT' USING ERRCODE = '23505';
END;
$function$;

COMMIT;
NOTIFY pgrst, 'reload schema';
