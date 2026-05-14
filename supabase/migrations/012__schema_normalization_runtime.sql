-- ============================================================================
-- 012__schema_normalization_runtime.sql
-- Normalizacion de columnas/tipos para compatibilidad de runtime.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Helpers de conversion segura
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.to_numeric_or_zero(p_input text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_input IS NULL OR btrim(p_input) = '' THEN
    RETURN 0;
  END IF;
  IF p_input ~ '^-?[0-9]+([.][0-9]+)?$' THEN
    RETURN p_input::numeric;
  END IF;
  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION app.to_int_or_zero(p_input text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_input IS NULL OR btrim(p_input) = '' THEN
    RETURN 0;
  END IF;
  IF p_input ~ '^-?[0-9]+$' THEN
    RETURN p_input::integer;
  END IF;
  RETURN 0;
END;
$$;

-- ----------------------------------------------------------------------------
-- Usuarios y sesiones (compatibilidad auth/web)
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.usuarios_sistema ADD COLUMN IF NOT EXISTS nombre_usuario text;
ALTER TABLE IF EXISTS public.usuarios_sistema ADD COLUMN IF NOT EXISTS is_demo_user boolean DEFAULT false;
ALTER TABLE IF EXISTS public.usuarios_sistema ADD COLUMN IF NOT EXISTS demo_email_temp text;

ALTER TABLE IF EXISTS public.empresa_config
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.usuarios
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS nombre text,
  ADD COLUMN IF NOT EXISTS apellido text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'ACTIVO';

ALTER TABLE IF EXISTS public.users
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS nombre text,
  ADD COLUMN IF NOT EXISTS apellido text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'ACTIVO';

ALTER TABLE IF EXISTS public.user_sessions
  ADD COLUMN IF NOT EXISTS usuario_sistema_id uuid,
  ADD COLUMN IF NOT EXISTS session_token text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_sessions_token
ON public.user_sessions (session_token)
WHERE session_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_sessions_usuario
ON public.user_sessions (usuario_sistema_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_sessions_tenant
ON public.user_sessions (tenant_id, expires_at DESC);

-- Replica operativa: usuarios <- usuarios_sistema (para consultas legacy/web)
CREATE OR REPLACE FUNCTION app.sync_usuarios_from_usuarios_sistema()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.usuarios WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO public.usuarios (
    id, tenant_id, email, nombre, apellido, activo, estado, created_at, updated_at
  )
  VALUES (
    NEW.id,
    NEW.tenant_id,
    NEW.email,
    NEW.nombre,
    NEW.apellido,
    COALESCE(NEW.activo, true),
    COALESCE(NEW.estado, 'ACTIVO'),
    COALESCE(NEW.created_at, now()),
    COALESCE(NEW.updated_at, now())
  )
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    email = EXCLUDED.email,
    nombre = EXCLUDED.nombre,
    apellido = EXCLUDED.apellido,
    activo = EXCLUDED.activo,
    estado = EXCLUDED.estado,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_usuarios_from_usuarios_sistema ON public.usuarios_sistema;
CREATE TRIGGER trg_sync_usuarios_from_usuarios_sistema
AFTER INSERT OR UPDATE OR DELETE ON public.usuarios_sistema
FOR EACH ROW
EXECUTE FUNCTION app.sync_usuarios_from_usuarios_sistema();

INSERT INTO public.usuarios (id, tenant_id, email, nombre, apellido, activo, estado, created_at, updated_at)
SELECT
  us.id,
  us.tenant_id,
  us.email,
  us.nombre,
  us.apellido,
  COALESCE(us.activo, true),
  COALESCE(us.estado, 'ACTIVO'),
  COALESCE(us.created_at, now()),
  COALESCE(us.updated_at, now())
FROM public.usuarios_sistema us
ON CONFLICT (id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  email = EXCLUDED.email,
  nombre = EXCLUDED.nombre,
  apellido = EXCLUDED.apellido,
  activo = EXCLUDED.activo,
  estado = EXCLUDED.estado,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- Catalogos fiscales/paises (compatibilidad servicios fiscales)
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.paises
  ADD COLUMN IF NOT EXISTS codigo_iso text,
  ADD COLUMN IF NOT EXISTS nombre_fiscal text,
  ADD COLUMN IF NOT EXISTS moneda_codigo text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS moneda_simbolo text DEFAULT 'S/',
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS ux_paises_codigo_iso
ON public.paises (upper(codigo_iso))
WHERE codigo_iso IS NOT NULL;

ALTER TABLE IF EXISTS public.configuracion_fiscal
  ADD COLUMN IF NOT EXISTS pais_id uuid,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS impuesto_principal_nombre text DEFAULT 'IGV',
  ADD COLUMN IF NOT EXISTS impuesto_principal_porcentaje numeric(10,4) DEFAULT 0.18,
  ADD COLUMN IF NOT EXISTS documento_identidad_empresa text DEFAULT 'RUC',
  ADD COLUMN IF NOT EXISTS longitud_documento_empresa integer DEFAULT 11,
  ADD COLUMN IF NOT EXISTS formato_fecha text DEFAULT 'DD/MM/YYYY',
  ADD COLUMN IF NOT EXISTS separador_decimal text DEFAULT '.',
  ADD COLUMN IF NOT EXISTS separador_miles text DEFAULT ',',
  ADD COLUMN IF NOT EXISTS requiere_libro_diario boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS requiere_libro_mayor boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS requiere_libro_inventarios boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS requiere_libro_compras boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS requiere_libro_ventas boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS requiere_kardex_valorizado boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS requiere_libro_mayor_balances boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS requiere_libros_societarios boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_configuracion_fiscal_pais_id
ON public.configuracion_fiscal (pais_id);

ALTER TABLE IF EXISTS public.tipos_documentos_fiscales
  ADD COLUMN IF NOT EXISTS pais_id uuid,
  ADD COLUMN IF NOT EXISTS codigo text,
  ADD COLUMN IF NOT EXISTS nombre text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_tipos_documentos_fiscales_pais
ON public.tipos_documentos_fiscales (pais_id, activo);

ALTER TABLE IF EXISTS public.tipos_impuestos
  ADD COLUMN IF NOT EXISTS pais_id uuid,
  ADD COLUMN IF NOT EXISTS codigo text,
  ADD COLUMN IF NOT EXISTS nombre text,
  ADD COLUMN IF NOT EXISTS porcentaje numeric(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_tipos_impuestos_pais
ON public.tipos_impuestos (pais_id, activo);

ALTER TABLE IF EXISTS public.usuario_configuracion
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS pais_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS ux_usuario_configuracion_usuario
ON public.usuario_configuracion (usuario_id);

-- ----------------------------------------------------------------------------
-- Inventario y stock (tipos/columnas usadas por RPC)
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.vista_pos_productos;

ALTER TABLE IF EXISTS public.productos
  ADD COLUMN IF NOT EXISTS stock numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS precio_unitario numeric(14,2) DEFAULT 0;

ALTER TABLE IF EXISTS public.productos
  ALTER COLUMN stock TYPE numeric(14,2) USING app.to_numeric_or_zero(stock::text),
  ALTER COLUMN stock_actual TYPE numeric(14,2) USING app.to_numeric_or_zero(stock_actual::text),
  ALTER COLUMN stock_reservado TYPE numeric(14,2) USING app.to_numeric_or_zero(stock_reservado::text),
  ALTER COLUMN stock_minimo TYPE numeric(14,2) USING app.to_numeric_or_zero(stock_minimo::text),
  ALTER COLUMN precio TYPE numeric(14,2) USING app.to_numeric_or_zero(precio::text),
  ALTER COLUMN precio_venta TYPE numeric(14,2) USING app.to_numeric_or_zero(precio_venta::text),
  ALTER COLUMN precio_compra TYPE numeric(14,2) USING app.to_numeric_or_zero(precio_compra::text),
  ALTER COLUMN costo TYPE numeric(14,2) USING app.to_numeric_or_zero(costo::text);

ALTER TABLE IF EXISTS public.productos
  ALTER COLUMN stock SET DEFAULT 0,
  ALTER COLUMN stock_actual SET DEFAULT 0,
  ALTER COLUMN stock_reservado SET DEFAULT 0;

CREATE OR REPLACE VIEW public.vista_pos_productos AS
SELECT
  p.id,
  p.tenant_id,
  p.codigo,
  p.nombre,
  COALESCE(p.activo, true) AS activo,
  COALESCE(p.precio_venta, p.precio, 0::numeric) AS precio_venta,
  COALESCE(p.stock_actual, 0::numeric) AS stock_actual,
  COALESCE(p.stock_reservado, 0::numeric) AS stock_reservado
FROM public.productos p;

ALTER TABLE IF EXISTS public.producto_existencias
  ADD COLUMN IF NOT EXISTS almacen_id uuid,
  ADD COLUMN IF NOT EXISTS ubicacion_id uuid,
  ADD COLUMN IF NOT EXISTS lote text,
  ADD COLUMN IF NOT EXISTS fecha_expiracion date;

ALTER TABLE IF EXISTS public.producto_existencias
  ALTER COLUMN stock_actual TYPE numeric(14,2) USING app.to_numeric_or_zero(stock_actual::text),
  ALTER COLUMN stock_reservado TYPE numeric(14,2) USING app.to_numeric_or_zero(stock_reservado::text),
  ALTER COLUMN stock_danado TYPE numeric(14,2) USING app.to_numeric_or_zero(stock_danado::text);

ALTER TABLE IF EXISTS public.producto_existencias
  ALTER COLUMN stock_actual SET DEFAULT 0,
  ALTER COLUMN stock_reservado SET DEFAULT 0,
  ALTER COLUMN stock_danado SET DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS ux_producto_existencias_tenant_producto_almacen
ON public.producto_existencias (tenant_id, producto_id, almacen_id);

DROP VIEW IF EXISTS public.vw_kardex_valorizado;

ALTER TABLE IF EXISTS public.movimientos_inventario
  ADD COLUMN IF NOT EXISTS almacen_id uuid,
  ADD COLUMN IF NOT EXISTS ubicacion_id uuid,
  ADD COLUMN IF NOT EXISTS lote text,
  ADD COLUMN IF NOT EXISTS fecha_expiracion timestamptz;

ALTER TABLE IF EXISTS public.movimientos_inventario
  ALTER COLUMN cantidad TYPE numeric(14,2) USING app.to_numeric_or_zero(cantidad::text);

CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_tenant_producto_created
ON public.movimientos_inventario (tenant_id, producto_id, created_at DESC);

CREATE OR REPLACE VIEW public.vw_kardex_valorizado AS
SELECT
  m.id AS movimiento_id,
  m.tenant_id,
  m.producto_id,
  m.tipo_movimiento,
  m.cantidad,
  m.created_at
FROM public.movimientos_inventario m;

-- ----------------------------------------------------------------------------
-- Caja/POS (tipos y columnas para RPC)
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.vw_turnos_metrics;
DROP VIEW IF EXISTS public.vw_sesiones_caja_resumen;
DROP VIEW IF EXISTS public.vw_sesiones_activas;
DROP VIEW IF EXISTS public.vw_ranking_cajeros;

ALTER TABLE IF EXISTS public.sesiones_caja
  ADD COLUMN IF NOT EXISTS abierto_por uuid,
  ADD COLUMN IF NOT EXISTS monto_esperado numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN';

ALTER TABLE IF EXISTS public.cajas
  ADD COLUMN IF NOT EXISTS ubicacion text;

ALTER TABLE IF EXISTS public.sesiones_caja
  ALTER COLUMN monto_inicio TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_inicio::text),
  ALTER COLUMN monto_inicial TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_inicial::text),
  ALTER COLUMN monto_esperado TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_esperado::text),
  ALTER COLUMN monto_contado TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_contado::text),
  ALTER COLUMN diferencia TYPE numeric(14,2) USING app.to_numeric_or_zero(diferencia::text),
  ALTER COLUMN total_efectivo TYPE numeric(14,2) USING app.to_numeric_or_zero(total_efectivo::text),
  ALTER COLUMN total_tarjeta TYPE numeric(14,2) USING app.to_numeric_or_zero(total_tarjeta::text),
  ALTER COLUMN hora_apertura TYPE timestamptz USING CASE
    WHEN hora_apertura IS NULL OR btrim(hora_apertura::text) = '' THEN NULL
    ELSE hora_apertura::timestamptz
  END,
  ALTER COLUMN hora_cierre TYPE timestamptz USING CASE
    WHEN hora_cierre IS NULL OR btrim(hora_cierre::text) = '' THEN NULL
    ELSE hora_cierre::timestamptz
  END;

ALTER TABLE IF EXISTS public.sesiones_caja
  ALTER COLUMN estado SET DEFAULT 'ABIERTA',
  ALTER COLUMN monto_inicio SET DEFAULT 0,
  ALTER COLUMN monto_inicial SET DEFAULT 0,
  ALTER COLUMN monto_esperado SET DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_sesiones_caja_tenant_estado_apertura
ON public.sesiones_caja (tenant_id, estado, hora_apertura DESC);

CREATE OR REPLACE VIEW public.vw_ranking_cajeros AS
SELECT
  s.tenant_id,
  s.cajero_id,
  COUNT(*) AS total_sesiones,
  COALESCE(SUM(s.total_efectivo), 0) AS total_efectivo,
  COALESCE(SUM(s.total_tarjeta), 0) AS total_tarjeta
FROM public.sesiones_caja s
GROUP BY s.tenant_id, s.cajero_id;

CREATE OR REPLACE VIEW public.vw_sesiones_activas AS
SELECT
  s.*
FROM public.sesiones_caja s
WHERE s.estado = 'ABIERTA';

CREATE OR REPLACE VIEW public.vw_sesiones_caja_resumen AS
SELECT
  s.tenant_id,
  s.id AS sesion_id,
  s.estado,
  COALESCE(s.total_efectivo, 0) AS total_efectivo,
  COALESCE(s.total_tarjeta, 0) AS total_tarjeta,
  COALESCE(s.total_efectivo, 0) + COALESCE(s.total_tarjeta, 0) AS total_sesion
FROM public.sesiones_caja s;

CREATE OR REPLACE VIEW public.vw_turnos_metrics AS
SELECT
  s.tenant_id,
  s.cajero_id,
  COUNT(*) AS total_turnos,
  SUM(COALESCE(s.total_efectivo, 0) + COALESCE(s.total_tarjeta, 0)) AS total_vendido
FROM public.sesiones_caja s
GROUP BY s.tenant_id, s.cajero_id;

ALTER TABLE IF EXISTS public.movimientos_caja
  ADD COLUMN IF NOT EXISTS saldo_anterior numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_nuevo numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motivo text,
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS supervisor_id uuid,
  ADD COLUMN IF NOT EXISTS "timestamp" timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ip_address inet;

ALTER TABLE IF EXISTS public.movimientos_caja
  ALTER COLUMN secuencia TYPE integer USING app.to_int_or_zero(secuencia::text),
  ALTER COLUMN monto TYPE numeric(14,2) USING app.to_numeric_or_zero(monto::text),
  ALTER COLUMN saldo_anterior TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo_anterior::text),
  ALTER COLUMN saldo_nuevo TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo_nuevo::text);

CREATE UNIQUE INDEX IF NOT EXISTS ux_movimientos_caja_sesion_secuencia
ON public.movimientos_caja (sesion_caja_id, secuencia);

CREATE INDEX IF NOT EXISTS idx_movimientos_caja_tenant_timestamp
ON public.movimientos_caja (tenant_id, "timestamp" DESC);

ALTER TABLE IF EXISTS public.configuracion_caja
  ADD COLUMN IF NOT EXISTS caja_id uuid,
  ADD COLUMN IF NOT EXISTS monto_apertura_min numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_apertura_max numeric(10,2) DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS requiere_supervisor_fuera_rango boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tolerancia_diferencia_cierre numeric(10,2) DEFAULT 10;

ALTER TABLE IF EXISTS public.configuracion_caja
  ALTER COLUMN monto_apertura_min TYPE numeric(10,2) USING app.to_numeric_or_zero(monto_apertura_min::text),
  ALTER COLUMN monto_apertura_max TYPE numeric(10,2) USING app.to_numeric_or_zero(monto_apertura_max::text),
  ALTER COLUMN tolerancia_diferencia_cierre TYPE numeric(10,2) USING app.to_numeric_or_zero(tolerancia_diferencia_cierre::text);

CREATE UNIQUE INDEX IF NOT EXISTS ux_configuracion_caja_tenant_caja
ON public.configuracion_caja (tenant_id, caja_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_configuracion_caja_tenant_default
ON public.configuracion_caja (tenant_id)
WHERE caja_id IS NULL;

ALTER TABLE IF EXISTS public.eventos_pos
  ADD COLUMN IF NOT EXISTS sesion_caja_id uuid,
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS tipo_evento text,
  ADD COLUMN IF NOT EXISTS subtipo text,
  ADD COLUMN IF NOT EXISTS venta_id uuid,
  ADD COLUMN IF NOT EXISTS producto_id uuid,
  ADD COLUMN IF NOT EXISTS item_index integer,
  ADD COLUMN IF NOT EXISTS datos jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "timestamp" timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ip_address inet,
  ADD COLUMN IF NOT EXISTS dispositivo text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS requiere_supervisor boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS supervisor_id uuid,
  ADD COLUMN IF NOT EXISTS justificacion text;

CREATE INDEX IF NOT EXISTS idx_eventos_pos_tenant_timestamp
ON public.eventos_pos (tenant_id, "timestamp" DESC);

-- ----------------------------------------------------------------------------
-- RLS security dashboard tables/views soporte
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.rls_audit_log
  ADD COLUMN IF NOT EXISTS "timestamp" timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS user_email text,
  ADD COLUMN IF NOT EXISTS attempted_tenant_id uuid,
  ADD COLUMN IF NOT EXISTS actual_tenant_id uuid,
  ADD COLUMN IF NOT EXISTS table_name text,
  ADD COLUMN IF NOT EXISTS operation text,
  ADD COLUMN IF NOT EXISTS severity text DEFAULT 'WARNING',
  ADD COLUMN IF NOT EXISTS violation_type text,
  ADD COLUMN IF NOT EXISTS ip_address inet;

CREATE INDEX IF NOT EXISTS idx_rls_audit_log_timestamp
ON public.rls_audit_log ("timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_rls_audit_log_table
ON public.rls_audit_log (table_name);

ALTER TABLE IF EXISTS public.rls_alert_config
  ADD COLUMN IF NOT EXISTS alert_name text,
  ADD COLUMN IF NOT EXISTS enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS severity_threshold text DEFAULT 'CRITICAL';

ALTER TABLE IF EXISTS public.rls_alert_history
  ADD COLUMN IF NOT EXISTS alert_name text,
  ADD COLUMN IF NOT EXISTS triggered_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS severity text DEFAULT 'WARNING',
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS violation_count integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS affected_table text,
  ADD COLUMN IF NOT EXISTS user_email text,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS acknowledged boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid;

CREATE INDEX IF NOT EXISTS idx_rls_alert_history_triggered_at
ON public.rls_alert_history (triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_rls_alert_history_ack
ON public.rls_alert_history (acknowledged);

-- ----------------------------------------------------------------------------
-- Base de conocimiento (bot ayuda)
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.knowledge_base
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS rol text,
  ADD COLUMN IF NOT EXISTS pregunta text,
  ADD COLUMN IF NOT EXISTS palabras_clave text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS respuesta text,
  ADD COLUMN IF NOT EXISTS pasos jsonb,
  ADD COLUMN IF NOT EXISTS url_modulo text,
  ADD COLUMN IF NOT EXISTS orden integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_knowledge_base_categoria_rol
ON public.knowledge_base (categoria, rol)
WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_kb_fulltext_search
ON public.knowledge_base
USING gin (to_tsvector('spanish', COALESCE(pregunta, '')));

-- ----------------------------------------------------------------------------
-- RMA columnas requeridas por RPC de retorno
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.rma_items
  ADD COLUMN IF NOT EXISTS rma_id uuid,
  ADD COLUMN IF NOT EXISTS producto_id uuid,
  ADD COLUMN IF NOT EXISTS cantidad_autorizada numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cantidad_devuelta numeric(14,2) DEFAULT 0;

ALTER TABLE IF EXISTS public.rma_items
  ALTER COLUMN cantidad_autorizada TYPE numeric(14,2) USING app.to_numeric_or_zero(cantidad_autorizada::text),
  ALTER COLUMN cantidad_devuelta TYPE numeric(14,2) USING app.to_numeric_or_zero(cantidad_devuelta::text);

ALTER TABLE IF EXISTS public.rma_eventos
  ADD COLUMN IF NOT EXISTS rma_id uuid,
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS descripcion text;

COMMIT;
