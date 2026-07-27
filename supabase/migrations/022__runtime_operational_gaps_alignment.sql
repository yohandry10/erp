-- ============================================================================
-- 022__runtime_operational_gaps_alignment.sql
-- Cierra brechas operativas detectadas post 021 en módulos críticos.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Configuración operativa/fiscal
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.empresa_config
  ADD COLUMN IF NOT EXISTS habilitar_dashboards_sunat boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS frecuencia_actualizacion_dashboards integer DEFAULT 60;

ALTER TABLE IF EXISTS public.configuracion_fiscal
  ADD COLUMN IF NOT EXISTS max_items_por_documento integer DEFAULT 999,
  ADD COLUMN IF NOT EXISTS monto_maximo_documento numeric(14,2) DEFAULT 999999999.99;

ALTER TABLE IF EXISTS public.metodos_pago
  ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'EFECTIVO';

-- ----------------------------------------------------------------------------
-- Notificaciones con targeting por usuario/roles
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.notificaciones
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS roles_destinatarios uuid[] DEFAULT '{}'::uuid[];

CREATE INDEX IF NOT EXISTS idx_notificaciones_tenant_usuario_created
ON public.notificaciones (tenant_id, usuario_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- Seguridad/rate limit
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.request_logs
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS endpoint text,
  ADD COLUMN IF NOT EXISTS method text,
  ADD COLUMN IF NOT EXISTS ip_address inet,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS status_code integer,
  ADD COLUMN IF NOT EXISTS response_time_ms integer,
  ADD COLUMN IF NOT EXISTS request_id text;

CREATE INDEX IF NOT EXISTS idx_request_logs_tenant_created_at
ON public.request_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_request_logs_tenant_user_endpoint
ON public.request_logs (tenant_id, user_id, endpoint, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_request_logs_endpoint_created_at
ON public.request_logs (endpoint, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rate_limit_baselines_user_tenant_endpoint
ON public.rate_limit_baselines (user_id, tenant_id, endpoint)
WHERE user_id IS NOT NULL
  AND tenant_id IS NOT NULL
  AND endpoint IS NOT NULL;

-- ----------------------------------------------------------------------------
-- RRHH / logística / auditoría operativa
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.solicitudes
  ADD COLUMN IF NOT EXISTS dias integer DEFAULT 0;

ALTER TABLE IF EXISTS public.gastos
  ADD COLUMN IF NOT EXISTS monto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS categoria text;

ALTER TABLE IF EXISTS public.almacen_ubicaciones
  ADD COLUMN IF NOT EXISTS descripcion text;

ALTER TABLE IF EXISTS public.centros_costo
  ADD COLUMN IF NOT EXISTS descripcion text;

ALTER TABLE IF EXISTS public.depreciaciones
  ADD COLUMN IF NOT EXISTS activo_id uuid,
  ADD COLUMN IF NOT EXISTS periodo text,
  ADD COLUMN IF NOT EXISTS monto_depreciacion numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS centro_costo_id uuid;

CREATE INDEX IF NOT EXISTS idx_depreciaciones_tenant_periodo
ON public.depreciaciones (tenant_id, periodo);

CREATE INDEX IF NOT EXISTS idx_depreciaciones_tenant_activo
ON public.depreciaciones (tenant_id, activo_id);

ALTER TABLE IF EXISTS public.gre_detalles
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS cantidad numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unidad_medida text,
  ADD COLUMN IF NOT EXISTS peso numeric(14,3),
  ADD COLUMN IF NOT EXISTS producto_id uuid;

CREATE INDEX IF NOT EXISTS idx_gre_detalles_gre_id
ON public.gre_detalles (gre_id);

ALTER TABLE IF EXISTS public.caja_audit_log
  ADD COLUMN IF NOT EXISTS sesion_caja_id uuid,
  ADD COLUMN IF NOT EXISTS ip_address inet,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS parametros jsonb,
  ADD COLUMN IF NOT EXISTS resultado text;

CREATE INDEX IF NOT EXISTS idx_caja_audit_log_tenant_timestamp
ON public.caja_audit_log (tenant_id, "timestamp" DESC);

-- ----------------------------------------------------------------------------
-- Ventas históricas (analytics/reportes)
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.ventas
  ADD COLUMN IF NOT EXISTS numero_documento text,
  ADD COLUMN IF NOT EXISTS tipo_documento text,
  ADD COLUMN IF NOT EXISTS cliente_id uuid,
  ADD COLUMN IF NOT EXISTS vendedor_id uuid,
  ADD COLUMN IF NOT EXISTS sucursal_id uuid,
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igv numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total numeric(14,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_ventas_tenant_fecha_estado
ON public.ventas (tenant_id, fecha DESC, estado);

CREATE INDEX IF NOT EXISTS idx_ventas_tenant_cliente
ON public.ventas (tenant_id, cliente_id, fecha DESC);

ALTER TABLE IF EXISTS public.venta_detalles
  ADD COLUMN IF NOT EXISTS venta_id uuid,
  ADD COLUMN IF NOT EXISTS producto_id uuid,
  ADD COLUMN IF NOT EXISTS cantidad numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS precio_unitario numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_venta_detalles_tenant_venta
ON public.venta_detalles (tenant_id, venta_id);

ALTER TABLE IF EXISTS public.pagos_ventas
  ADD COLUMN IF NOT EXISTS venta_id uuid,
  ADD COLUMN IF NOT EXISTS monto numeric(14,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_pagos_ventas_tenant_venta
ON public.pagos_ventas (tenant_id, venta_id);

SELECT app.add_fk_if_possible('venta_detalles', 'venta_id', 'ventas', 'id', 'fk_venta_detalles_venta_id');
SELECT app.add_fk_if_possible('venta_detalles', 'producto_id', 'productos', 'id', 'fk_venta_detalles_producto_id');
SELECT app.add_fk_if_possible('pagos_ventas', 'venta_id', 'ventas', 'id', 'fk_pagos_ventas_venta_id');

-- ----------------------------------------------------------------------------
-- CPE runtime (idempotencia/eventos/hash/cliente)
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cpe
  ADD COLUMN IF NOT EXISTS cliente_id uuid,
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS hash text,
  ADD COLUMN IF NOT EXISTS hash_firma text,
  ADD COLUMN IF NOT EXISTS hash_code text;

-- Alineación defensiva: items debe ser jsonb para payload estructurado.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cpe'
      AND column_name = 'items'
  ) THEN
    BEGIN
      ALTER TABLE public.cpe
        ALTER COLUMN items TYPE jsonb
        USING (
          CASE
            WHEN items IS NULL THEN '[]'::jsonb
            WHEN btrim(items::text) = '' THEN '[]'::jsonb
            ELSE items::text::jsonb
          END
        );
    EXCEPTION
      WHEN others THEN
        -- Entornos con payload legado no parseable: se sanea a NULL y se reintenta.
        UPDATE public.cpe SET items = NULL;
        ALTER TABLE public.cpe
          ALTER COLUMN items TYPE jsonb
          USING COALESCE(NULLIF(btrim(items::text), '')::jsonb, '[]'::jsonb);
    END;

    ALTER TABLE public.cpe
      ALTER COLUMN items SET DEFAULT '[]'::jsonb;
  ELSE
    ALTER TABLE public.cpe
      ADD COLUMN items jsonb DEFAULT '[]'::jsonb;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_cpe_tenant_cliente
ON public.cpe (tenant_id, cliente_id);

CREATE INDEX IF NOT EXISTS idx_cpe_event_id
ON public.cpe (event_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_cpe_tenant_idempotency
ON public.cpe (tenant_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Compatibilidad de nombres: usuarios_sistema.nombre/apellido <-> nombres/apellidos
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.usuarios_sistema
  ADD COLUMN IF NOT EXISTS nombres text,
  ADD COLUMN IF NOT EXISTS apellidos text;

UPDATE public.usuarios_sistema
SET
  nombres = COALESCE(nombres, nombre),
  apellidos = COALESCE(apellidos, apellido),
  nombre = COALESCE(nombre, nombres),
  apellido = COALESCE(apellido, apellidos)
WHERE nombre IS NOT NULL
   OR apellido IS NOT NULL
   OR nombres IS NOT NULL
   OR apellidos IS NOT NULL;

CREATE OR REPLACE FUNCTION app.sync_usuarios_sistema_nombre_aliases()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.nombre := COALESCE(NEW.nombre, NEW.nombres);
  NEW.apellido := COALESCE(NEW.apellido, NEW.apellidos);
  NEW.nombres := COALESCE(NEW.nombres, NEW.nombre);
  NEW.apellidos := COALESCE(NEW.apellidos, NEW.apellido);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_usuarios_sistema_nombre_aliases ON public.usuarios_sistema;
CREATE TRIGGER trg_sync_usuarios_sistema_nombre_aliases
BEFORE INSERT OR UPDATE OF nombre, apellido, nombres, apellidos
ON public.usuarios_sistema
FOR EACH ROW
EXECUTE FUNCTION app.sync_usuarios_sistema_nombre_aliases();

-- Campo previsto en flujo de autorización de supervisor (hoy TODO en código).
ALTER TABLE IF EXISTS public.supervisor_pins
  ADD COLUMN IF NOT EXISTS hash_pin text;

COMMIT;
