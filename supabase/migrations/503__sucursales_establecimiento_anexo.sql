-- 503__sucursales_establecimiento_anexo.sql
--
-- `public.sucursales` existe desde el esqueleto 002 y nunca se altero. Es una
-- tabla muerta: cero endpoints en el API, cero pantallas en la web, cero
-- politicas RLS que la nombren y ninguna funcion que la siembre. Las columnas
-- `sucursal_id` que hay en `ventas`, `cajas`, `producto_stock_sucursal` y
-- `producto_precios_sucursal` solo las rellena el importador masivo, pegando un
-- UUID en una columna de CSV. Es decir: hoy la sucursal es una etiqueta de
-- migracion de datos, no una entidad del producto.
--
-- Esta migracion la convierte en lo que en Peru es de verdad: un ESTABLECIMIENTO
-- ANEXO del RUC. Eso fija el diseno y evita inventar:
--
--   * Un establecimiento tiene un codigo de cuatro digitos en la ficha RUC.
--     `0000` es la casa matriz y existe siempre. El CPE ya emite ese codigo en
--     `cbc:AddressTypeCode` --lo escribe `cpe-xml.builder.ts` en dos sitios-- pero
--     lo tiene fijado a '0000' porque no habia de donde sacarlo.
--
--   * Las series de comprobante se asignan POR ESTABLECIMIENTO. Esta es la pieza
--     fiscal que faltaba y la que hace que el resto encaje: si la serie sabe a que
--     sucursal pertenece, el comprobante sabe su establecimiento, y la numeracion
--     de cada local queda separada sin tocar el correlativo.
--
--   * Los libros electronicos son POR RUC, no por establecimiento. Por eso esta
--     migracion **no** cuelga `sucursal_id` de `asientos_contables`: separar la
--     contabilidad por sucursal dentro de un mismo RUC describiria mal el producto
--     y ademas no es lo que SUNAT recibe. El resultado por local se obtiene con
--     `centros_costo`, que ya llega hasta `detalle_asientos`, y por eso la sucursal
--     lleva un `centro_costo_id` opcional que las une. Quien necesite contabilidad
--     realmente separada necesita otro RUC, y eso ya existe: es un tenant, con su
--     grupo de consolidacion.
--
-- Decisiones que conviene leer antes de tocar esto:
--
--   * **Sin asignacion explicita, un usuario ve todas las sucursales.** La tabla
--     `usuario_sucursales` empieza vacia, asi que el sistema se comporta hoy
--     exactamente igual que antes de esta migracion; nadie pierde acceso al
--     aplicarla. Restringir es un acto deliberado: asignar una fila. Un usuario
--     sin filas es la oficina central, no un usuario capado.
--
--   * **Todo lo que ya existe pertenece a la casa matriz.** Antes de esta
--     migracion no habia sucursales, luego toda venta, caja, almacen y serie
--     historica ocurrio en el unico establecimiento que existia. El relleno los
--     engancha ahi en vez de dejarlos en NULL, para que los informes por sucursal
--     no nazcan con un agujero silencioso.
--
--   * **La casa matriz la crea un trigger sobre `tenants`**, no la funcion de alta
--     de demos. Asi cualquier camino que cree un contribuyente --demo, wizard,
--     importacion, mano-- produce un `0000`, y el invariante "todo tenant tiene
--     exactamente una casa matriz" no depende de que nadie se acuerde.
--
--   * **La integridad tenant/sucursal es una clave foranea compuesta**, no un
--     trigger de validacion como el que usan `cajas` (156) y `ventas` (162). Un
--     trigger comprueba en el momento del INSERT y se puede desactivar; la
--     compuesta la sostiene el motor y hace imposible que la serie de un
--     contribuyente apunte a la sucursal de otro.

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. La sucursal como establecimiento anexo
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.sucursales
  ADD COLUMN IF NOT EXISTS codigo_establecimiento text,
  ADD COLUMN IF NOT EXISTS es_principal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS ubigeo text,
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS centro_costo_id uuid;

-- Numerador por contribuyente para las sucursales que se creen sin codigo.
-- Empieza en 1 porque el 0000 es siempre la casa matriz.
CREATE OR REPLACE FUNCTION app.siguiente_codigo_establecimiento(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_max integer;
BEGIN
  SELECT COALESCE(MAX(app.to_int_or_zero(codigo_establecimiento)), 0)
    INTO v_max
  FROM public.sucursales
  WHERE tenant_id = p_tenant_id
    AND codigo_establecimiento ~ '^[0-9]{4}$';

  IF v_max >= 9999 THEN
    RAISE EXCEPTION
      'SUCURSALES: el contribuyente % agoto los codigos de establecimiento (9999)', p_tenant_id;
  END IF;

  RETURN lpad((v_max + 1)::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_sucursal_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.nombre := NULLIF(btrim(COALESCE(NEW.nombre, '')), '');
  IF NEW.nombre IS NULL THEN
    RAISE EXCEPTION 'SUCURSALES: el nombre es obligatorio';
  END IF;

  -- El codigo de establecimiento no se inventa al vuelo si ya venia puesto:
  -- corresponde a la ficha RUC y lo teclea quien da de alta el anexo.
  NEW.codigo_establecimiento := NULLIF(btrim(COALESCE(NEW.codigo_establecimiento, '')), '');
  IF NEW.codigo_establecimiento IS NOT NULL THEN
    NEW.codigo_establecimiento := lpad(NEW.codigo_establecimiento, 4, '0');
  ELSIF TG_OP = 'INSERT' THEN
    NEW.codigo_establecimiento := CASE
      WHEN COALESCE(NEW.es_principal, false) THEN '0000'
      ELSE app.siguiente_codigo_establecimiento(NEW.tenant_id)
    END;
  END IF;

  -- La casa matriz y el 0000 son la misma cosa, en los dos sentidos.
  NEW.es_principal := (NEW.codigo_establecimiento = '0000');

  NEW.codigo := COALESCE(
    NULLIF(btrim(COALESCE(NEW.codigo, '')), ''),
    'SUC-' || NEW.codigo_establecimiento
  );

  NEW.direccion := NULLIF(btrim(COALESCE(NEW.direccion, '')), '');
  NEW.telefono := NULLIF(btrim(COALESCE(NEW.telefono, '')), '');
  NEW.ubigeo := NULLIF(btrim(COALESCE(NEW.ubigeo, '')), '');
  IF NEW.ubigeo IS NOT NULL THEN
    NEW.ubigeo := lpad(NEW.ubigeo, 6, '0');
  END IF;

  -- Convencion de la casa: `activo` y `estado` dicen lo mismo y no se contradicen.
  NEW.activo := COALESCE(
    NEW.activo,
    CASE WHEN upper(COALESCE(NEW.estado, 'ACTIVO')) = 'INACTIVO' THEN false ELSE true END
  );
  NEW.estado := CASE WHEN NEW.activo THEN 'ACTIVO' ELSE 'INACTIVO' END;

  -- La casa matriz no se apaga: es el establecimiento del RUC.
  IF NEW.es_principal AND NOT NEW.activo THEN
    RAISE EXCEPTION 'SUCURSALES: la casa matriz (0000) no se puede desactivar';
  END IF;

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_sucursal_row ON public.sucursales;
CREATE TRIGGER trg_normalize_sucursal_row
BEFORE INSERT OR UPDATE ON public.sucursales
FOR EACH ROW
EXECUTE FUNCTION app.normalize_sucursal_row();

-- ----------------------------------------------------------------------------
-- 2. Casa matriz para todo contribuyente: la que existe y la que venga
-- ----------------------------------------------------------------------------
-- Primero se PROMUEVE la sede que el contribuyente ya tenga, en vez de crearle
-- una casa matriz nueva al lado.
--
-- Esto no se ve en una cadena limpia --ahi la tabla esta vacia-- y si en
-- produccion: hay 58 filas 'Sede Lima', una por contribuyente, sembradas por el
-- alta de demo (`WHERE NOT EXISTS` sobre sucursales, migraciones 412/497/498).
-- Esa sede *es* su local principal. Insertar un 'Casa matriz' junto a ella
-- dejaria a cada contribuyente con dos locales donde tenia uno, y el relleno
-- posterior engancharia sus almacenes y cajas a la casa matriz recien creada
-- mientras la sede de verdad se queda vacia. Se promueve la mas antigua.
WITH candidatas AS (
  SELECT DISTINCT ON (s.tenant_id) s.id
  FROM public.sucursales s
  WHERE s.tenant_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.sucursales x
      WHERE x.tenant_id = s.tenant_id AND x.codigo_establecimiento = '0000'
    )
  ORDER BY s.tenant_id, s.created_at, s.id
)
UPDATE public.sucursales s
SET codigo_establecimiento = '0000'
FROM candidatas c
WHERE s.id = c.id;

-- Y solo despues se crea una para quien no tenia ninguna.
INSERT INTO public.sucursales (tenant_id, nombre, codigo, codigo_establecimiento, es_principal, activo, estado, metadata)
SELECT
  t.id,
  'Casa matriz',
  'SUC-0000',
  '0000',
  true,
  true,
  'ACTIVO',
  jsonb_build_object('source', 'migration_503')
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.sucursales s
  WHERE s.tenant_id = t.id AND s.codigo_establecimiento = '0000'
);

-- Las sucursales que ya existieran sin codigo --ninguna en produccion, pero el
-- esqueleto lo permitia-- reciben uno correlativo y estable por antiguedad.
WITH numeradas AS (
  SELECT
    s.id,
    lpad(row_number() OVER (PARTITION BY s.tenant_id ORDER BY s.created_at, s.id)::text, 4, '0') AS codigo
  FROM public.sucursales s
  WHERE s.codigo_establecimiento IS NULL
)
UPDATE public.sucursales s
SET codigo_establecimiento = n.codigo,
    es_principal = false
FROM numeradas n
WHERE s.id = n.id;

CREATE OR REPLACE FUNCTION app.seed_casa_matriz_for_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  INSERT INTO public.sucursales (tenant_id, nombre, codigo, codigo_establecimiento, es_principal, activo, estado, metadata)
  VALUES (
    NEW.id,
    'Casa matriz',
    'SUC-0000',
    '0000',
    true,
    true,
    'ACTIVO',
    jsonb_build_object('source', 'trg_seed_casa_matriz_for_tenant')
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_casa_matriz_for_tenant ON public.tenants;
CREATE TRIGGER trg_seed_casa_matriz_for_tenant
AFTER INSERT ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION app.seed_casa_matriz_for_tenant();

-- ----------------------------------------------------------------------------
-- 3. Los invariantes del establecimiento
-- ----------------------------------------------------------------------------
ALTER TABLE public.sucursales
  ALTER COLUMN codigo_establecimiento SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_sucursales_codigo_establecimiento'
  ) THEN
    ALTER TABLE public.sucursales
      ADD CONSTRAINT ck_sucursales_codigo_establecimiento
      CHECK (codigo_establecimiento ~ '^[0-9]{4}$');
  END IF;

  -- La casa matriz y el 0000 no se separan nunca.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_sucursales_principal_es_0000'
  ) THEN
    ALTER TABLE public.sucursales
      ADD CONSTRAINT ck_sucursales_principal_es_0000
      CHECK (es_principal = (codigo_establecimiento = '0000'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_sucursales_ubigeo'
  ) THEN
    ALTER TABLE public.sucursales
      ADD CONSTRAINT ck_sucursales_ubigeo
      CHECK (ubigeo IS NULL OR ubigeo ~ '^[0-9]{6}$');
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_sucursales_tenant_establecimiento
ON public.sucursales (tenant_id, codigo_establecimiento);

-- Exactamente una casa matriz por contribuyente. El CHECK de arriba ya ata
-- es_principal al 0000 y este indice ata el 0000 a una sola fila, pero se declara
-- explicito porque es el invariante que se lee, no el que se deduce.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sucursales_tenant_principal
ON public.sucursales (tenant_id)
WHERE es_principal;

-- Objetivo de las claves foraneas compuestas: la sucursal de una fila no puede
-- pertenecer a otro contribuyente.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sucursales_tenant_id_id
ON public.sucursales (tenant_id, id);

CREATE INDEX IF NOT EXISTS idx_sucursales_tenant_activo
ON public.sucursales (tenant_id, activo);

SELECT app.add_fk_if_possible('sucursales', 'centro_costo_id', 'centros_costo', 'id', 'fk_sucursales_centro_costo_id');

-- ----------------------------------------------------------------------------
-- 4. Lo que cuelga de la sucursal
--
--    `documento_series` es la pieza fiscal --la serie decide el establecimiento
--    del comprobante--. `almacenes` es la operativa: el stock de un local esta en
--    sus almacenes. `cajas` y `ventas` ya tenian la columna desde 155 y 161.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.documento_series
  ADD COLUMN IF NOT EXISTS sucursal_id uuid;

ALTER TABLE IF EXISTS public.almacenes
  ADD COLUMN IF NOT EXISTS sucursal_id uuid;

-- Todo lo historico ocurrio en el unico establecimiento que existia.
UPDATE public.documento_series ds
SET sucursal_id = s.id
FROM public.sucursales s
WHERE s.tenant_id = ds.tenant_id
  AND s.es_principal
  AND ds.sucursal_id IS NULL
  AND ds.tenant_id IS NOT NULL;

UPDATE public.almacenes a
SET sucursal_id = s.id
FROM public.sucursales s
WHERE s.tenant_id = a.tenant_id
  AND s.es_principal
  AND a.sucursal_id IS NULL
  AND a.tenant_id IS NOT NULL;

UPDATE public.cajas c
SET sucursal_id = s.id
FROM public.sucursales s
WHERE s.tenant_id = c.tenant_id
  AND s.es_principal
  AND c.sucursal_id IS NULL
  AND c.tenant_id IS NOT NULL;

UPDATE public.ventas v
SET sucursal_id = s.id
FROM public.sucursales s
WHERE s.tenant_id = v.tenant_id
  AND s.es_principal
  AND v.sucursal_id IS NULL
  AND v.tenant_id IS NOT NULL;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('documento_series', 'fk_documento_series_sucursal_tenant'),
      ('almacenes',        'fk_almacenes_sucursal_tenant'),
      ('cajas',            'fk_cajas_sucursal_tenant'),
      ('ventas',           'fk_ventas_sucursal_tenant')
    ) AS t(tabla, constraint_name)
  LOOP
    IF to_regclass('public.' || r.tabla) IS NULL THEN
      CONTINUE;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = r.constraint_name) THEN
      CONTINUE;
    END IF;

    -- Se declara NOT VALID a proposito: valida toda fila nueva y toda
    -- modificacion, y no bloquea el despliegue reescaneando el historico. La
    -- validacion completa se hace a continuacion, fuera del camino critico.
    EXECUTE format(
      'ALTER TABLE public.%I
         ADD CONSTRAINT %I FOREIGN KEY (tenant_id, sucursal_id)
         REFERENCES public.sucursales (tenant_id, id)
         ON DELETE RESTRICT NOT VALID',
      r.tabla, r.constraint_name
    );

    EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', r.tabla, r.constraint_name);
  END LOOP;
END
$$;

-- Rellenar el historico no basta: los caminos de alta --el alta de un
-- contribuyente demo, el wizard, los importadores-- siguen insertando filas sin
-- decir a que establecimiento pertenecen, y quedarian en NULL. Antes que
-- perseguir cada writer, se declara la regla una vez: una fila que no dice su
-- establecimiento pertenece a la casa matriz, que es literalmente lo que
-- significaba el sistema entero hasta esta migracion.
--
-- El nombre del trigger empieza por `trg_sucursal_` a proposito: los BEFORE se
-- disparan en orden alfabetico y este tiene que correr despues de los
-- `trg_normalize_*` --que normalizan el uuid-- y despues de los
-- `trg_enforce_*_tenant_consistency` de 156 y 162.
CREATE OR REPLACE FUNCTION app.default_sucursal_casa_matriz()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF NEW.sucursal_id IS NULL AND NEW.tenant_id IS NOT NULL THEN
    SELECT s.id INTO NEW.sucursal_id
    FROM public.sucursales s
    WHERE s.tenant_id = NEW.tenant_id AND s.es_principal;

    -- Sin casa matriz no hay establecimiento al que atribuir la fila, y el CHECK
    -- de mas abajo la rechazaria de todos modos con un mensaje que no dice nada.
    -- El unico modo de llegar aqui es que alguien haya retirado
    -- `trg_seed_casa_matriz_for_tenant`, asi que se nombra.
    IF NEW.sucursal_id IS NULL THEN
      RAISE EXCEPTION
        'SUCURSALES: el contribuyente % no tiene casa matriz; falta el trigger trg_seed_casa_matriz_for_tenant',
        NEW.tenant_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT unnest(ARRAY['documento_series', 'almacenes', 'cajas', 'ventas']) AS tabla
  LOOP
    IF to_regclass('public.' || r.tabla) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS trg_sucursal_default_%I ON public.%I', r.tabla, r.tabla);
    EXECUTE format(
      'CREATE TRIGGER trg_sucursal_default_%I
         BEFORE INSERT OR UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION app.default_sucursal_casa_matriz()',
      r.tabla, r.tabla
    );

    -- No es NOT NULL sobre la columna porque `tenant_id` si admite nulos en
    -- estas tablas y una fila sin contribuyente no tiene establecimiento posible.
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'ck_' || r.tabla || '_sucursal_presente'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I
           CHECK (sucursal_id IS NOT NULL OR tenant_id IS NULL) NOT VALID',
        r.tabla, 'ck_' || r.tabla || '_sucursal_presente'
      );
      EXECUTE format(
        'ALTER TABLE public.%I VALIDATE CONSTRAINT %I',
        r.tabla, 'ck_' || r.tabla || '_sucursal_presente'
      );
    END IF;
  END LOOP;
END
$$;

-- `producto_stock_sucursal` y `producto_precios_sucursal` se quedan fuera a
-- proposito. Sus indices unicos son `NULLS NOT DISTINCT`, es decir que el NULL
-- ahi ya significa algo --precio o stock global, sin establecimiento-- y es la
-- clave sobre la que el controlador de inventario hace `onConflict`. Rellenarlas
-- con la casa matriz cambiaria la semantica de esos upserts.

CREATE INDEX IF NOT EXISTS idx_documento_series_sucursal
ON public.documento_series (tenant_id, sucursal_id, tipo_documento, activo);

CREATE INDEX IF NOT EXISTS idx_almacenes_sucursal
ON public.almacenes (tenant_id, sucursal_id);

CREATE INDEX IF NOT EXISTS idx_cajas_sucursal
ON public.cajas (tenant_id, sucursal_id);

CREATE INDEX IF NOT EXISTS idx_ventas_sucursal
ON public.ventas (tenant_id, sucursal_id);

-- ----------------------------------------------------------------------------
-- 5. Alcance del usuario
--
--    Sin filas, el usuario ve todas las sucursales: es la oficina central y es
--    tambien el estado en el que queda todo el mundo al aplicar esta migracion.
--    Con filas, ve exactamente las suyas.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usuario_sucursales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  usuario_sistema_id uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE CASCADE,
  sucursal_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_usuario_sucursales_sucursal_tenant'
  ) THEN
    ALTER TABLE public.usuario_sucursales
      ADD CONSTRAINT fk_usuario_sucursales_sucursal_tenant
      FOREIGN KEY (tenant_id, sucursal_id)
      REFERENCES public.sucursales (tenant_id, id)
      ON DELETE CASCADE;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_usuario_sucursales_usuario_sucursal
ON public.usuario_sucursales (usuario_sistema_id, sucursal_id);

CREATE INDEX IF NOT EXISTS idx_usuario_sucursales_tenant_usuario
ON public.usuario_sucursales (tenant_id, usuario_sistema_id);

-- El usuario y la sucursal han de ser del mismo contribuyente. La compuesta ata
-- la sucursal al tenant de la fila; falta atar el usuario, y `usuarios_sistema`
-- no tiene indice por (tenant_id, id), asi que aqui si toca trigger.
CREATE OR REPLACE FUNCTION app.validate_usuario_sucursal_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM public.usuarios_sistema
  WHERE id = NEW.usuario_sistema_id;

  IF v_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION
      'USUARIO_SUCURSALES: el usuario % pertenece al contribuyente % y la asignacion dice %',
      NEW.usuario_sistema_id, v_tenant, NEW.tenant_id;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_usuario_sucursal_tenant ON public.usuario_sucursales;
CREATE TRIGGER trg_validate_usuario_sucursal_tenant
BEFORE INSERT OR UPDATE ON public.usuario_sucursales
FOR EACH ROW
EXECUTE FUNCTION app.validate_usuario_sucursal_tenant();

SELECT app.apply_tenant_policy('public', 'usuario_sucursales');

-- Resuelve el alcance de un usuario en una sola consulta, para que el API no
-- reimplemente la regla "sin filas = todas" en cada listado.
CREATE OR REPLACE FUNCTION public.sucursales_visibles(p_tenant_id uuid, p_usuario_sistema_id uuid)
RETURNS TABLE (sucursal_id uuid)
LANGUAGE sql
STABLE
SET search_path = public, app, pg_temp
AS $$
  SELECT s.id
  FROM public.sucursales s
  WHERE s.tenant_id = p_tenant_id
    AND s.activo
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.usuario_sucursales us
        WHERE us.usuario_sistema_id = p_usuario_sistema_id
      )
      OR EXISTS (
        SELECT 1 FROM public.usuario_sucursales us
        WHERE us.usuario_sistema_id = p_usuario_sistema_id
          AND us.sucursal_id = s.id
      )
    );
$$;

-- ----------------------------------------------------------------------------
-- 6. Permisos
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sembrar_permisos_sucursales_503(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  WITH defs(modulo, recurso, accion, codigo, descripcion) AS (
    VALUES
      ('configuracion', 'sucursales', 'read',   'configuracion.sucursales.read',   'Ver los establecimientos del contribuyente'),
      ('configuracion', 'sucursales', 'create', 'configuracion.sucursales.create', 'Dar de alta un establecimiento anexo'),
      ('configuracion', 'sucursales', 'update', 'configuracion.sucursales.update', 'Modificar un establecimiento'),
      ('configuracion', 'sucursales', 'delete', 'configuracion.sucursales.delete', 'Desactivar un establecimiento'),
      ('configuracion', 'sucursales', 'assign', 'configuracion.sucursales.assign', 'Asignar usuarios a establecimientos')
  )
  INSERT INTO public.permisos (tenant_id, modulo, recurso, accion, codigo, descripcion, activo)
  SELECT p_tenant_id, d.modulo, d.recurso, d.accion, d.codigo, d.descripcion, true
  FROM defs d
  WHERE NOT EXISTS (
    SELECT 1 FROM public.permisos p
    WHERE p.tenant_id = p_tenant_id AND lower(p.codigo) = lower(d.codigo)
  );

  -- Solo administracion. Un jefe de local no da de alta establecimientos ante
  -- SUNAT, y la lectura la reciben los roles que ya consolidan resultados.
  INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
  SELECT r.id, p.id, true
  FROM public.roles r
  JOIN public.permisos p ON p.tenant_id = r.tenant_id
  WHERE r.tenant_id = p_tenant_id
    AND COALESCE(r.activo, true)
    AND COALESCE(p.activo, true)
    AND (
      (upper(r.nombre) IN ('ADMIN', 'ADMIN_DEMO') AND lower(p.codigo) IN (
         'configuracion.sucursales.read', 'configuracion.sucursales.create',
         'configuracion.sucursales.update', 'configuracion.sucursales.delete',
         'configuracion.sucursales.assign'
       ))
      OR (upper(r.nombre) IN ('CONTADOR', 'FINANZAS', 'GERENCIA', 'AUDITOR')
          AND lower(p.codigo) = 'configuracion.sucursales.read')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.rol_permisos rp
      WHERE rp.role_id = r.id AND rp.permiso_id = p.id
    );
END;
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.tenants LOOP
    PERFORM app.sembrar_permisos_sucursales_503(r.id);
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION app.trg_seed_sucursales_permissions_503()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  PERFORM app.sembrar_permisos_sucursales_503(NEW.tenant_id);
  RETURN NEW;
END;
$$;

-- Cuelga de `roles` y no de `tenants` porque los roles se siembran despues del
-- alta del contribuyente: sembrar los permisos en el INSERT de `tenants` los
-- dejaria sin rol al que concederselos.
DROP TRIGGER IF EXISTS trg_seed_sucursales_permissions_503 ON public.roles;
CREATE TRIGGER trg_seed_sucursales_permissions_503
AFTER INSERT ON public.roles
FOR EACH ROW
EXECUTE FUNCTION app.trg_seed_sucursales_permissions_503();

-- ----------------------------------------------------------------------------
-- 7. Privilegios
--
--    Las tres funciones SECURITY DEFINER de esta migracion son sembradores y
--    disparadores internos: nadie las llama por PostgREST. El verificador 435
--    exige que ninguna sea alcanzable por `anon` ni `authenticated`, y sin este
--    REVOKE heredarian el EXECUTE que PostgreSQL concede a PUBLIC por defecto.
--    Comprobado: sin estas tres lineas, el 435 se pone rojo y las nombra.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION app.seed_casa_matriz_for_tenant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.sembrar_permisos_sucursales_503(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.trg_seed_sucursales_permissions_503() FROM PUBLIC, anon, authenticated;

COMMIT;
