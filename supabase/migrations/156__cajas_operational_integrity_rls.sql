
-- ============================================================================
-- 156__cajas_operational_integrity_rls.sql
-- Integridad, consistencia tenant y hardening RLS para Cajas/POS operativo.
-- Tablas: cajas, sesiones_caja, movimientos_caja, retiros_caja,
--         cambios_turno, cortes_caja, autorizaciones_caja.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill tenant y relaciones parent.
-- ----------------------------------------------------------------------------
UPDATE public.cajas c
SET tenant_id = s.tenant_id
FROM public.sucursales s
WHERE c.sucursal_id = s.id
  AND s.tenant_id IS NOT NULL
  AND (c.tenant_id IS NULL OR c.tenant_id <> s.tenant_id);

UPDATE public.cajas c
SET tenant_id = a.tenant_id
FROM public.almacenes a
WHERE c.almacen_id = a.id
  AND a.tenant_id IS NOT NULL
  AND (c.tenant_id IS NULL OR c.tenant_id <> a.tenant_id);

UPDATE public.sesiones_caja s
SET tenant_id = c.tenant_id
FROM public.cajas c
WHERE s.caja_id = c.id
  AND c.tenant_id IS NOT NULL
  AND (s.tenant_id IS NULL OR s.tenant_id <> c.tenant_id);

UPDATE public.movimientos_caja m
SET tenant_id = s.tenant_id
FROM public.sesiones_caja s
WHERE m.sesion_caja_id = s.id
  AND s.tenant_id IS NOT NULL
  AND (m.tenant_id IS NULL OR m.tenant_id <> s.tenant_id);

UPDATE public.retiros_caja r
SET
  tenant_id = s.tenant_id,
  caja_id = COALESCE(r.caja_id, s.caja_id)
FROM public.sesiones_caja s
WHERE r.sesion_caja_id = s.id
  AND (
    r.tenant_id IS NULL
    OR (s.tenant_id IS NOT NULL AND r.tenant_id <> s.tenant_id)
    OR (r.caja_id IS NULL AND s.caja_id IS NOT NULL)
  );

UPDATE public.cambios_turno ct
SET tenant_id = s.tenant_id
FROM public.sesiones_caja s
WHERE ct.sesion_caja_id = s.id
  AND s.tenant_id IS NOT NULL
  AND (ct.tenant_id IS NULL OR ct.tenant_id <> s.tenant_id);

UPDATE public.cortes_caja cc
SET
  tenant_id = s.tenant_id,
  caja_id = COALESCE(cc.caja_id, s.caja_id),
  cajero_id = COALESCE(cc.cajero_id, s.cajero_id, s.usuario_id, s.abierto_por)
FROM public.sesiones_caja s
WHERE cc.sesion_caja_id = s.id
  AND (
    cc.tenant_id IS NULL
    OR (s.tenant_id IS NOT NULL AND cc.tenant_id <> s.tenant_id)
    OR (cc.caja_id IS NULL AND s.caja_id IS NOT NULL)
    OR (cc.cajero_id IS NULL AND (s.cajero_id IS NOT NULL OR s.usuario_id IS NOT NULL OR s.abierto_por IS NOT NULL))
  );

UPDATE public.autorizaciones_caja a
SET
  tenant_id = s.tenant_id,
  solicitante_id = COALESCE(a.solicitante_id, s.cajero_id, s.usuario_id, s.abierto_por)
FROM public.sesiones_caja s
WHERE a.sesion_caja_id = s.id
  AND (
    a.tenant_id IS NULL
    OR (s.tenant_id IS NOT NULL AND a.tenant_id <> s.tenant_id)
    OR (a.solicitante_id IS NULL AND (s.cajero_id IS NOT NULL OR s.usuario_id IS NOT NULL OR s.abierto_por IS NOT NULL))
  );

-- Limpieza defensiva de referencias de usuarios no resolubles en alias canonico.
UPDATE public.sesiones_caja s
SET
  cajero_id = CASE
    WHEN s.cajero_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.usuarios_sistema u WHERE u.id = s.cajero_id)
      THEN NULL
    ELSE s.cajero_id
  END,
  usuario_id = CASE
    WHEN s.usuario_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.usuarios_sistema u WHERE u.id = s.usuario_id)
      THEN NULL
    ELSE s.usuario_id
  END,
  abierto_por = CASE
    WHEN s.abierto_por IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.usuarios_sistema u WHERE u.id = s.abierto_por)
      THEN NULL
    ELSE s.abierto_por
  END,
  usuario_apertura = CASE
    WHEN s.usuario_apertura IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.usuarios_sistema u WHERE u.id = s.usuario_apertura)
      THEN NULL
    ELSE s.usuario_apertura
  END,
  supervisor_cierre_id = CASE
    WHEN s.supervisor_cierre_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.usuarios_sistema u WHERE u.id = s.supervisor_cierre_id)
      THEN NULL
    ELSE s.supervisor_cierre_id
  END,
  autorizacion_supervisor_id = CASE
    WHEN s.autorizacion_supervisor_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.usuarios_sistema u WHERE u.id = s.autorizacion_supervisor_id)
      THEN NULL
    ELSE s.autorizacion_supervisor_id
  END
WHERE s.id IS NOT NULL;

UPDATE public.movimientos_caja m
SET
  usuario_id = CASE
    WHEN m.usuario_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.usuarios_sistema u WHERE u.id = m.usuario_id)
      THEN NULL
    ELSE m.usuario_id
  END,
  supervisor_id = CASE
    WHEN m.supervisor_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.usuarios_sistema u WHERE u.id = m.supervisor_id)
      THEN NULL
    ELSE m.supervisor_id
  END
WHERE m.id IS NOT NULL;

UPDATE public.retiros_caja r
SET autorizado_por = CASE
  WHEN r.autorizado_por IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.usuarios_sistema u WHERE u.id = r.autorizado_por)
    THEN NULL
  ELSE r.autorizado_por
END
WHERE r.id IS NOT NULL;

UPDATE public.cambios_turno ct
SET
  usuario_saliente_id = CASE
    WHEN ct.usuario_saliente_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.usuarios_sistema u WHERE u.id = ct.usuario_saliente_id)
      THEN NULL
    ELSE ct.usuario_saliente_id
  END,
  usuario_entrante_id = CASE
    WHEN ct.usuario_entrante_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.usuarios_sistema u WHERE u.id = ct.usuario_entrante_id)
      THEN NULL
    ELSE ct.usuario_entrante_id
  END
WHERE ct.id IS NOT NULL;

UPDATE public.cortes_caja cc
SET cajero_id = CASE
  WHEN cc.cajero_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.usuarios_sistema u WHERE u.id = cc.cajero_id)
    THEN NULL
  ELSE cc.cajero_id
END
WHERE cc.id IS NOT NULL;

UPDATE public.autorizaciones_caja a
SET
  supervisor_id = CASE
    WHEN a.supervisor_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.usuarios_sistema u WHERE u.id = a.supervisor_id)
      THEN NULL
    ELSE a.supervisor_id
  END,
  solicitante_id = CASE
    WHEN a.solicitante_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.usuarios_sistema u WHERE u.id = a.solicitante_id)
      THEN NULL
    ELSE a.solicitante_id
  END
WHERE a.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Re-normalizacion defensiva pre-integridad.
-- ----------------------------------------------------------------------------
UPDATE public.cajas c
SET
  nombre = COALESCE(NULLIF(btrim(COALESCE(c.nombre, '')), ''), 'CAJA-' || right(replace(c.id::text, '-', ''), 6)),
  codigo = COALESCE(NULLIF(upper(btrim(COALESCE(c.codigo, ''))), ''), 'CAJA-' || right(replace(c.id::text, '-', ''), 6)),
  tipo = CASE
    WHEN upper(COALESCE(NULLIF(btrim(c.tipo), ''), 'TIENDA')) IN ('STORE', 'TIENDA') THEN 'TIENDA'
    WHEN upper(COALESCE(NULLIF(btrim(c.tipo), ''), 'TIENDA')) IN ('MOSTRADOR', 'COUNTER') THEN 'MOSTRADOR'
    WHEN upper(COALESCE(NULLIF(btrim(c.tipo), ''), 'TIENDA')) IN ('KIOSKO', 'KIOSK') THEN 'KIOSKO'
    ELSE 'TIENDA'
  END,
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(c.estado), ''), 'ACTIVO')) IN ('ACTIVO', 'INACTIVO', 'MANTENIMIENTO', 'BLOQUEADA')
      THEN upper(COALESCE(NULLIF(btrim(c.estado), ''), 'ACTIVO'))
    WHEN upper(COALESCE(NULLIF(btrim(c.estado), ''), 'ACTIVO')) IN ('CERRADA', 'DISABLED') THEN 'INACTIVO'
    ELSE 'ACTIVO'
  END
WHERE c.id IS NOT NULL;

UPDATE public.sesiones_caja s
SET
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(s.estado), ''), 'ABIERTA')) IN ('ABIERTA', 'CERRADA', 'PAUSADA', 'ANULADA')
      THEN upper(COALESCE(NULLIF(btrim(s.estado), ''), 'ABIERTA'))
    WHEN upper(COALESCE(NULLIF(btrim(s.estado), ''), 'ABIERTA')) IN ('ACTIVO', 'OPEN') THEN 'ABIERTA'
    WHEN upper(COALESCE(NULLIF(btrim(s.estado), ''), 'ABIERTA')) IN ('INACTIVO', 'CLOSED', 'CERRADO') THEN 'CERRADA'
    ELSE 'ABIERTA'
  END,
  moneda = COALESCE(NULLIF(upper(btrim(COALESCE(s.moneda, ''))), ''), 'PEN'),
  monto_inicio = GREATEST(COALESCE(NULLIF(s.monto_inicio, 0), s.monto_inicial, 0), 0),
  monto_inicial = GREATEST(COALESCE(NULLIF(s.monto_inicial, 0), s.monto_inicio, 0), 0),
  monto_esperado = GREATEST(COALESCE(s.monto_esperado, s.monto_inicial, s.monto_inicio, 0), 0),
  monto_contado = GREATEST(COALESCE(s.monto_contado, 0), 0),
  monto_cierre = GREATEST(COALESCE(NULLIF(s.monto_cierre, 0), s.monto_contado, 0), 0),
  total_efectivo = GREATEST(COALESCE(s.total_efectivo, 0), 0),
  total_tarjeta = GREATEST(COALESCE(s.total_tarjeta, 0), 0),
  duracion_horas = GREATEST(COALESCE(s.duracion_horas, 0), 0),
  fecha_apertura = COALESCE(s.fecha_apertura, s.hora_apertura, s.created_at, now()),
  hora_apertura = COALESCE(s.hora_apertura, s.fecha_apertura, s.created_at, now()),
  fecha_cierre = CASE
    WHEN upper(COALESCE(NULLIF(btrim(s.estado), ''), 'ABIERTA')) IN ('CERRADA', 'INACTIVO', 'CLOSED', 'CERRADO')
      THEN COALESCE(s.fecha_cierre, s.hora_cierre)
    ELSE NULL
  END,
  hora_cierre = CASE
    WHEN upper(COALESCE(NULLIF(btrim(s.estado), ''), 'ABIERTA')) IN ('CERRADA', 'INACTIVO', 'CLOSED', 'CERRADO')
      THEN COALESCE(s.hora_cierre, s.fecha_cierre)
    ELSE NULL
  END
WHERE s.id IS NOT NULL;

UPDATE public.movimientos_caja m
SET
  tipo_movimiento = CASE
    WHEN upper(COALESCE(NULLIF(btrim(m.tipo_movimiento), ''), 'INGRESO')) IN ('VENTA', 'RETIRO', 'INGRESO', 'AJUSTE', 'CAMBIO_TURNO', 'APERTURA', 'CIERRE')
      THEN upper(COALESCE(NULLIF(btrim(m.tipo_movimiento), ''), 'INGRESO'))
    WHEN upper(COALESCE(NULLIF(btrim(m.tipo_movimiento), ''), 'INGRESO')) = 'GASTO' THEN 'RETIRO'
    ELSE 'INGRESO'
  END,
  secuencia = CASE WHEN COALESCE(m.secuencia, 0) < 1 THEN 1 ELSE m.secuencia END,
  "timestamp" = COALESCE(m."timestamp", m.created_at, now()),
  saldo_anterior = COALESCE(m.saldo_anterior, 0),
  saldo_nuevo = COALESCE(m.saldo_nuevo, COALESCE(m.saldo_anterior, 0) + COALESCE(m.monto, 0))
WHERE m.id IS NOT NULL;

UPDATE public.retiros_caja r
SET
  monto = GREATEST(COALESCE(r.monto, 0), 0),
  motivo = CASE
    WHEN upper(COALESCE(NULLIF(btrim(r.motivo), ''), 'OTRO')) IN ('DEPOSITO_BANCARIO', 'COMPRA_EMERGENCIA', 'BOVEDA', 'BÓVEDA', 'OTRO')
      THEN replace(upper(COALESCE(NULLIF(btrim(r.motivo), ''), 'OTRO')), 'Ó', 'O')
    ELSE 'OTRO'
  END,
  estado_conciliacion = CASE
    WHEN upper(COALESCE(NULLIF(btrim(r.estado_conciliacion), ''), 'PENDIENTE')) IN ('PENDIENTE', 'CONCILIADO', 'RECHAZADO')
      THEN upper(COALESCE(NULLIF(btrim(r.estado_conciliacion), ''), 'PENDIENTE'))
    ELSE 'PENDIENTE'
  END,
  fecha_conciliacion = CASE
    WHEN upper(COALESCE(NULLIF(btrim(r.estado_conciliacion), ''), 'PENDIENTE')) = 'CONCILIADO'
      THEN COALESCE(r.fecha_conciliacion, now())
    ELSE r.fecha_conciliacion
  END
WHERE r.id IS NOT NULL;

UPDATE public.cambios_turno ct
SET
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(ct.estado), ''), 'EN_PROCESO')) IN ('EN_PROCESO', 'COMPLETADO', 'CANCELADO')
      THEN upper(COALESCE(NULLIF(btrim(ct.estado), ''), 'EN_PROCESO'))
    WHEN upper(COALESCE(NULLIF(btrim(ct.estado), ''), 'EN_PROCESO')) IN ('ACTIVO', 'BORRADOR', 'PENDIENTE')
      THEN 'EN_PROCESO'
    WHEN upper(COALESCE(NULLIF(btrim(ct.estado), ''), 'EN_PROCESO')) = 'FINALIZADO'
      THEN 'COMPLETADO'
    WHEN upper(COALESCE(NULLIF(btrim(ct.estado), ''), 'EN_PROCESO')) = 'ANULADO'
      THEN 'CANCELADO'
    ELSE 'EN_PROCESO'
  END,
  saldo_sistema = GREATEST(COALESCE(ct.saldo_sistema, 0), 0),
  saldo_contado = GREATEST(COALESCE(ct.saldo_contado, 0), 0),
  timestamp_inicio = COALESCE(ct.timestamp_inicio, ct.created_at, now()),
  timestamp_fin = CASE
    WHEN upper(COALESCE(NULLIF(btrim(ct.estado), ''), 'EN_PROCESO')) IN ('COMPLETADO', 'CANCELADO', 'FINALIZADO', 'ANULADO')
      THEN COALESCE(ct.timestamp_fin, now())
    ELSE NULL
  END
WHERE ct.id IS NOT NULL;

UPDATE public.cortes_caja cc
SET
  fecha_corte = COALESCE(cc.fecha_corte, cc.created_at, now()),
  moneda = COALESCE(NULLIF(upper(btrim(COALESCE(cc.moneda, ''))), ''), 'PEN'),
  total_ventas = GREATEST(COALESCE(cc.total_ventas, 0), 0),
  total_impuestos = GREATEST(COALESCE(cc.total_impuestos, 0), 0),
  total_neto = GREATEST(COALESCE(NULLIF(cc.total_neto, 0), COALESCE(cc.total_ventas, 0) - COALESCE(cc.total_impuestos, 0)), 0),
  total_documentos = GREATEST(COALESCE(cc.total_documentos, 0), 0)
WHERE cc.id IS NOT NULL;

UPDATE public.autorizaciones_caja a
SET
  tipo_autorizacion = CASE
    WHEN upper(COALESCE(NULLIF(btrim(a.tipo_autorizacion), ''), 'AJUSTE_MANUAL')) IN ('APERTURA_MONTO_BAJO', 'APERTURA_MONTO_ALTO', 'CIERRE_DIFERENCIA_ALTA', 'RETIRO_MONTO_ALTO', 'AJUSTE_MANUAL')
      THEN upper(COALESCE(NULLIF(btrim(a.tipo_autorizacion), ''), 'AJUSTE_MANUAL'))
    WHEN upper(COALESCE(NULLIF(btrim(a.tipo_autorizacion), ''), 'AJUSTE_MANUAL')) = 'APERTURA_ATIPICA'
      THEN 'APERTURA_MONTO_ALTO'
    ELSE 'AJUSTE_MANUAL'
  END,
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(a.estado), ''), 'PENDIENTE')) IN ('APROBADO', 'RECHAZADO', 'PENDIENTE')
      THEN upper(COALESCE(NULLIF(btrim(a.estado), ''), 'PENDIENTE'))
    ELSE 'PENDIENTE'
  END,
  monto_solicitado = GREATEST(COALESCE(a.monto_solicitado, 0), 0),
  aprobado_at = CASE
    WHEN upper(COALESCE(NULLIF(btrim(a.estado), ''), 'PENDIENTE')) = 'APROBADO'
      THEN COALESCE(a.aprobado_at, a.created_at, now())
    ELSE a.aprobado_at
  END
WHERE a.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- FKs operativas para joins/embeds runtime.
-- ----------------------------------------------------------------------------
SELECT app.add_fk_if_possible(
  'cajas',
  'sucursal_id',
  'sucursales',
  'id',
  'cajas_sucursal_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'cajas',
  'almacen_id',
  'almacenes',
  'id',
  'cajas_almacen_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'cajas',
  'creado_por',
  'usuarios_sistema',
  'id',
  'cajas_creado_por_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'sesiones_caja',
  'caja_id',
  'cajas',
  'id',
  'sesiones_caja_caja_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'sesiones_caja',
  'cajero_id',
  'usuarios_sistema',
  'id',
  'sesiones_caja_cajero_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'sesiones_caja',
  'usuario_id',
  'usuarios_sistema',
  'id',
  'sesiones_caja_usuario_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'sesiones_caja',
  'abierto_por',
  'usuarios_sistema',
  'id',
  'sesiones_caja_abierto_por_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'sesiones_caja',
  'usuario_apertura',
  'usuarios_sistema',
  'id',
  'sesiones_caja_usuario_apertura_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'sesiones_caja',
  'supervisor_cierre_id',
  'usuarios_sistema',
  'id',
  'sesiones_caja_supervisor_cierre_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'sesiones_caja',
  'autorizacion_supervisor_id',
  'usuarios_sistema',
  'id',
  'sesiones_caja_autorizacion_supervisor_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'movimientos_caja',
  'sesion_caja_id',
  'sesiones_caja',
  'id',
  'movimientos_caja_sesion_caja_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'movimientos_caja',
  'usuario_id',
  'usuarios_sistema',
  'id',
  'movimientos_caja_usuario_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'movimientos_caja',
  'supervisor_id',
  'usuarios_sistema',
  'id',
  'movimientos_caja_supervisor_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'retiros_caja',
  'sesion_caja_id',
  'sesiones_caja',
  'id',
  'retiros_caja_sesion_caja_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'retiros_caja',
  'movimiento_caja_id',
  'movimientos_caja',
  'id',
  'retiros_caja_movimiento_caja_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'retiros_caja',
  'autorizado_por',
  'usuarios_sistema',
  'id',
  'retiros_caja_autorizado_por_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'retiros_caja',
  'caja_id',
  'cajas',
  'id',
  'retiros_caja_caja_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'cambios_turno',
  'sesion_caja_id',
  'sesiones_caja',
  'id',
  'cambios_turno_sesion_caja_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'cambios_turno',
  'usuario_saliente_id',
  'usuarios_sistema',
  'id',
  'cambios_turno_usuario_saliente_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'cambios_turno',
  'usuario_entrante_id',
  'usuarios_sistema',
  'id',
  'cambios_turno_usuario_entrante_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'cortes_caja',
  'sesion_caja_id',
  'sesiones_caja',
  'id',
  'cortes_caja_sesion_caja_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'cortes_caja',
  'caja_id',
  'cajas',
  'id',
  'cortes_caja_caja_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'cortes_caja',
  'cajero_id',
  'usuarios_sistema',
  'id',
  'cortes_caja_cajero_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'autorizaciones_caja',
  'sesion_caja_id',
  'sesiones_caja',
  'id',
  'autorizaciones_caja_sesion_caja_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'autorizaciones_caja',
  'supervisor_id',
  'usuarios_sistema',
  'id',
  'autorizaciones_caja_supervisor_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'autorizaciones_caja',
  'solicitante_id',
  'usuarios_sistema',
  'id',
  'autorizaciones_caja_solicitante_id_fkey_runtime'
);

-- ----------------------------------------------------------------------------
-- Dedupe por scope previo a indices unicos.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    c.id,
    c.codigo,
    row_number() OVER (
      PARTITION BY c.tenant_id, upper(btrim(c.codigo))
      ORDER BY COALESCE(c.updated_at, c.created_at, now()) DESC, c.id::text DESC
    ) AS rn
  FROM public.cajas c
  WHERE c.tenant_id IS NOT NULL
    AND c.codigo IS NOT NULL
    AND btrim(c.codigo) <> ''
)
UPDATE public.cajas c
SET codigo = format('%s-DUP-%s', upper(btrim(r.codigo)), r.rn),
    updated_at = now()
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    s.id,
    row_number() OVER (
      PARTITION BY s.tenant_id, s.caja_id
      ORDER BY COALESCE(s.hora_apertura, s.fecha_apertura, s.created_at, now()) DESC, s.id::text DESC
    ) AS rn
  FROM public.sesiones_caja s
  WHERE s.tenant_id IS NOT NULL
    AND s.caja_id IS NOT NULL
    AND s.estado = 'ABIERTA'
)
UPDATE public.sesiones_caja s
SET
  estado = 'ANULADA',
  fecha_cierre = COALESCE(s.fecha_cierre, now()),
  hora_cierre = COALESCE(s.hora_cierre, now()),
  notas_cierre = COALESCE(NULLIF(btrim(COALESCE(s.notas_cierre, '')), ''), 'Auto-anulada por dedupe de sesion ABIERTA por caja')
FROM ranked r
WHERE s.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    s.id,
    row_number() OVER (
      PARTITION BY s.tenant_id, s.cajero_id
      ORDER BY COALESCE(s.hora_apertura, s.fecha_apertura, s.created_at, now()) DESC, s.id::text DESC
    ) AS rn
  FROM public.sesiones_caja s
  WHERE s.tenant_id IS NOT NULL
    AND s.cajero_id IS NOT NULL
    AND s.estado = 'ABIERTA'
)
UPDATE public.sesiones_caja s
SET
  estado = 'ANULADA',
  fecha_cierre = COALESCE(s.fecha_cierre, now()),
  hora_cierre = COALESCE(s.hora_cierre, now()),
  notas_cierre = COALESCE(NULLIF(btrim(COALESCE(s.notas_cierre, '')), ''), 'Auto-anulada por dedupe de sesion ABIERTA por cajero')
FROM ranked r
WHERE s.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    s.id,
    row_number() OVER (
      PARTITION BY s.tenant_id, lower(btrim(s.dispositivo))
      ORDER BY COALESCE(s.hora_apertura, s.fecha_apertura, s.created_at, now()) DESC, s.id::text DESC
    ) AS rn
  FROM public.sesiones_caja s
  WHERE s.tenant_id IS NOT NULL
    AND s.dispositivo IS NOT NULL
    AND btrim(s.dispositivo) <> ''
    AND s.estado = 'ABIERTA'
)
UPDATE public.sesiones_caja s
SET
  estado = 'ANULADA',
  fecha_cierre = COALESCE(s.fecha_cierre, now()),
  hora_cierre = COALESCE(s.hora_cierre, now()),
  notas_cierre = COALESCE(NULLIF(btrim(COALESCE(s.notas_cierre, '')), ''), 'Auto-anulada por dedupe de sesion ABIERTA por dispositivo')
FROM ranked r
WHERE s.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    m.id,
    row_number() OVER (
      PARTITION BY m.tenant_id, m.sesion_caja_id
      ORDER BY COALESCE(m."timestamp", m.created_at, now()), m.id::text
    ) AS rn
  FROM public.movimientos_caja m
  WHERE m.tenant_id IS NOT NULL
    AND m.sesion_caja_id IS NOT NULL
)
UPDATE public.movimientos_caja m
SET secuencia = r.rn,
    updated_at = now()
FROM ranked r
WHERE m.id = r.id
  AND (m.secuencia IS NULL OR m.secuencia < 1 OR m.secuencia <> r.rn);

WITH ranked AS (
  SELECT
    a.id,
    row_number() OVER (
      PARTITION BY a.tenant_id, a.sesion_caja_id, upper(btrim(a.tipo_autorizacion)), a.solicitante_id
      ORDER BY COALESCE(a.updated_at, a.created_at, now()) DESC, a.id::text DESC
    ) AS rn
  FROM public.autorizaciones_caja a
  WHERE a.tenant_id IS NOT NULL
    AND a.sesion_caja_id IS NOT NULL
    AND a.tipo_autorizacion IS NOT NULL
    AND btrim(a.tipo_autorizacion) <> ''
    AND a.solicitante_id IS NOT NULL
    AND a.estado = 'PENDIENTE'
)
UPDATE public.autorizaciones_caja a
SET
  estado = 'RECHAZADO',
  razon_autorizacion = COALESCE(NULLIF(btrim(COALESCE(a.razon_autorizacion, '')), ''), 'Auto-rechazada por dedupe de autorizacion PENDIENTE'),
  updated_at = now()
FROM ranked r
WHERE a.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Triggers de consistencia tenant.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_cajas_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.sucursal_id := app.to_uuid_or_null(COALESCE(NEW.sucursal_id::text, ''));
  NEW.almacen_id := app.to_uuid_or_null(COALESCE(NEW.almacen_id::text, ''));
  NEW.creado_por := app.to_uuid_or_null(COALESCE(NEW.creado_por::text, ''));

  IF NEW.sucursal_id IS NOT NULL THEN
    SELECT s.tenant_id INTO v_ref_tenant
    FROM public.sucursales s
    WHERE s.id = NEW.sucursal_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Sucursal no existe: %s', NEW.sucursal_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con sucursal en cajas',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.almacen_id IS NOT NULL THEN
    SELECT a.tenant_id INTO v_ref_tenant
    FROM public.almacenes a
    WHERE a.id = NEW.almacen_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Almacen no existe: %s', NEW.almacen_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con almacen en cajas',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.creado_por IS NOT NULL THEN
    SELECT u.tenant_id INTO v_ref_tenant
    FROM public.usuarios_sistema u
    WHERE u.id = NEW.creado_por;

    IF FOUND AND v_ref_tenant IS NOT NULL AND NEW.tenant_id IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'creado_por pertenece a otro tenant en cajas',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id es obligatorio en cajas',
            ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_cajas_tenant_consistency ON public.cajas;
CREATE TRIGGER trg_enforce_cajas_tenant_consistency
BEFORE INSERT OR UPDATE ON public.cajas
FOR EACH ROW EXECUTE FUNCTION app.enforce_cajas_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_sesiones_caja_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.caja_id := app.to_uuid_or_null(COALESCE(NEW.caja_id::text, ''));
  NEW.cajero_id := app.to_uuid_or_null(COALESCE(NEW.cajero_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));
  NEW.abierto_por := app.to_uuid_or_null(COALESCE(NEW.abierto_por::text, ''));
  NEW.usuario_apertura := app.to_uuid_or_null(COALESCE(NEW.usuario_apertura::text, ''));
  NEW.supervisor_cierre_id := app.to_uuid_or_null(COALESCE(NEW.supervisor_cierre_id::text, ''));
  NEW.autorizacion_supervisor_id := app.to_uuid_or_null(COALESCE(NEW.autorizacion_supervisor_id::text, ''));

  IF NEW.caja_id IS NOT NULL THEN
    SELECT c.tenant_id INTO v_ref_tenant
    FROM public.cajas c
    WHERE c.id = NEW.caja_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Caja no existe: %s', NEW.caja_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con caja en sesiones_caja',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id es obligatorio en sesiones_caja',
            ERRCODE = '23514';
  END IF;

  IF NEW.cajero_id IS NOT NULL THEN
    SELECT u.tenant_id INTO v_ref_tenant FROM public.usuarios_sistema u WHERE u.id = NEW.cajero_id;
    IF FOUND AND v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'cajero_id pertenece a otro tenant en sesiones_caja', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.usuario_id IS NOT NULL THEN
    SELECT u.tenant_id INTO v_ref_tenant FROM public.usuarios_sistema u WHERE u.id = NEW.usuario_id;
    IF FOUND AND v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'usuario_id pertenece a otro tenant en sesiones_caja', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.abierto_por IS NOT NULL THEN
    SELECT u.tenant_id INTO v_ref_tenant FROM public.usuarios_sistema u WHERE u.id = NEW.abierto_por;
    IF FOUND AND v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'abierto_por pertenece a otro tenant en sesiones_caja', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.usuario_apertura IS NOT NULL THEN
    SELECT u.tenant_id INTO v_ref_tenant FROM public.usuarios_sistema u WHERE u.id = NEW.usuario_apertura;
    IF FOUND AND v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'usuario_apertura pertenece a otro tenant en sesiones_caja', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.supervisor_cierre_id IS NOT NULL THEN
    SELECT u.tenant_id INTO v_ref_tenant FROM public.usuarios_sistema u WHERE u.id = NEW.supervisor_cierre_id;
    IF FOUND AND v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'supervisor_cierre_id pertenece a otro tenant en sesiones_caja', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.autorizacion_supervisor_id IS NOT NULL THEN
    SELECT u.tenant_id INTO v_ref_tenant FROM public.usuarios_sistema u WHERE u.id = NEW.autorizacion_supervisor_id;
    IF FOUND AND v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'autorizacion_supervisor_id pertenece a otro tenant en sesiones_caja', ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_sesiones_caja_tenant_consistency ON public.sesiones_caja;
CREATE TRIGGER trg_enforce_sesiones_caja_tenant_consistency
BEFORE INSERT OR UPDATE ON public.sesiones_caja
FOR EACH ROW EXECUTE FUNCTION app.enforce_sesiones_caja_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_movimientos_caja_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.sesion_caja_id := app.to_uuid_or_null(COALESCE(NEW.sesion_caja_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));
  NEW.supervisor_id := app.to_uuid_or_null(COALESCE(NEW.supervisor_id::text, ''));

  IF NEW.sesion_caja_id IS NOT NULL THEN
    SELECT s.tenant_id INTO v_ref_tenant
    FROM public.sesiones_caja s
    WHERE s.id = NEW.sesion_caja_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Sesion de caja no existe: %s', NEW.sesion_caja_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con sesion_caja en movimientos_caja',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id es obligatorio en movimientos_caja',
            ERRCODE = '23514';
  END IF;

  IF NEW.usuario_id IS NOT NULL THEN
    SELECT u.tenant_id INTO v_ref_tenant FROM public.usuarios_sistema u WHERE u.id = NEW.usuario_id;
    IF FOUND AND v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'usuario_id pertenece a otro tenant en movimientos_caja', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.supervisor_id IS NOT NULL THEN
    SELECT u.tenant_id INTO v_ref_tenant FROM public.usuarios_sistema u WHERE u.id = NEW.supervisor_id;
    IF FOUND AND v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'supervisor_id pertenece a otro tenant en movimientos_caja', ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_movimientos_caja_tenant_consistency ON public.movimientos_caja;
CREATE TRIGGER trg_enforce_movimientos_caja_tenant_consistency
BEFORE INSERT OR UPDATE ON public.movimientos_caja
FOR EACH ROW EXECUTE FUNCTION app.enforce_movimientos_caja_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_retiros_caja_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
  v_ref_caja uuid;
  v_mov_tenant uuid;
  v_mov_sesion uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.sesion_caja_id := app.to_uuid_or_null(COALESCE(NEW.sesion_caja_id::text, ''));
  NEW.movimiento_caja_id := app.to_uuid_or_null(COALESCE(NEW.movimiento_caja_id::text, ''));
  NEW.autorizado_por := app.to_uuid_or_null(COALESCE(NEW.autorizado_por::text, ''));
  NEW.caja_id := app.to_uuid_or_null(COALESCE(NEW.caja_id::text, ''));

  IF NEW.sesion_caja_id IS NOT NULL THEN
    SELECT s.tenant_id, s.caja_id
    INTO v_ref_tenant, v_ref_caja
    FROM public.sesiones_caja s
    WHERE s.id = NEW.sesion_caja_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Sesion de caja no existe: %s', NEW.sesion_caja_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con sesion_caja en retiros_caja',
              ERRCODE = '23514';
    END IF;

    IF NEW.caja_id IS NULL THEN
      NEW.caja_id := v_ref_caja;
    ELSIF v_ref_caja IS NOT NULL AND NEW.caja_id <> v_ref_caja THEN
      RAISE EXCEPTION
        USING MESSAGE = 'caja_id no coincide con sesion_caja en retiros_caja',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.movimiento_caja_id IS NOT NULL THEN
    SELECT m.tenant_id, m.sesion_caja_id
    INTO v_mov_tenant, v_mov_sesion
    FROM public.movimientos_caja m
    WHERE m.id = NEW.movimiento_caja_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Movimiento de caja no existe: %s', NEW.movimiento_caja_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.sesion_caja_id IS NULL THEN
      NEW.sesion_caja_id := v_mov_sesion;
    ELSIF v_mov_sesion IS NOT NULL AND NEW.sesion_caja_id <> v_mov_sesion THEN
      RAISE EXCEPTION
        USING MESSAGE = 'movimiento_caja_id pertenece a otra sesion_caja',
              ERRCODE = '23514';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_mov_tenant;
    ELSIF v_mov_tenant IS NOT NULL AND NEW.tenant_id <> v_mov_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'movimiento_caja_id pertenece a otro tenant',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.autorizado_por IS NOT NULL THEN
    SELECT u.tenant_id INTO v_ref_tenant
    FROM public.usuarios_sistema u
    WHERE u.id = NEW.autorizado_por;

    IF FOUND AND v_ref_tenant IS NOT NULL AND NEW.tenant_id IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'autorizado_por pertenece a otro tenant en retiros_caja',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id es obligatorio en retiros_caja',
            ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_retiros_caja_tenant_consistency ON public.retiros_caja;
CREATE TRIGGER trg_enforce_retiros_caja_tenant_consistency
BEFORE INSERT OR UPDATE ON public.retiros_caja
FOR EACH ROW EXECUTE FUNCTION app.enforce_retiros_caja_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_cambios_turno_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.sesion_caja_id := app.to_uuid_or_null(COALESCE(NEW.sesion_caja_id::text, ''));
  NEW.usuario_saliente_id := app.to_uuid_or_null(COALESCE(NEW.usuario_saliente_id::text, ''));
  NEW.usuario_entrante_id := app.to_uuid_or_null(COALESCE(NEW.usuario_entrante_id::text, ''));

  IF NEW.sesion_caja_id IS NOT NULL THEN
    SELECT s.tenant_id INTO v_ref_tenant
    FROM public.sesiones_caja s
    WHERE s.id = NEW.sesion_caja_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Sesion de caja no existe: %s', NEW.sesion_caja_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con sesion_caja en cambios_turno',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id es obligatorio en cambios_turno',
            ERRCODE = '23514';
  END IF;

  IF NEW.usuario_saliente_id IS NOT NULL THEN
    SELECT u.tenant_id INTO v_ref_tenant FROM public.usuarios_sistema u WHERE u.id = NEW.usuario_saliente_id;
    IF FOUND AND v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'usuario_saliente_id pertenece a otro tenant', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.usuario_entrante_id IS NOT NULL THEN
    SELECT u.tenant_id INTO v_ref_tenant FROM public.usuarios_sistema u WHERE u.id = NEW.usuario_entrante_id;
    IF FOUND AND v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'usuario_entrante_id pertenece a otro tenant', ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_cambios_turno_tenant_consistency ON public.cambios_turno;
CREATE TRIGGER trg_enforce_cambios_turno_tenant_consistency
BEFORE INSERT OR UPDATE ON public.cambios_turno
FOR EACH ROW EXECUTE FUNCTION app.enforce_cambios_turno_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_cortes_caja_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
  v_ref_caja uuid;
  v_ref_cajero uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.sesion_caja_id := app.to_uuid_or_null(COALESCE(NEW.sesion_caja_id::text, ''));
  NEW.caja_id := app.to_uuid_or_null(COALESCE(NEW.caja_id::text, ''));
  NEW.cajero_id := app.to_uuid_or_null(COALESCE(NEW.cajero_id::text, ''));

  IF NEW.sesion_caja_id IS NOT NULL THEN
    SELECT s.tenant_id, s.caja_id, COALESCE(s.cajero_id, s.usuario_id, s.abierto_por)
    INTO v_ref_tenant, v_ref_caja, v_ref_cajero
    FROM public.sesiones_caja s
    WHERE s.id = NEW.sesion_caja_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Sesion de caja no existe: %s', NEW.sesion_caja_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con sesion_caja en cortes_caja',
              ERRCODE = '23514';
    END IF;

    IF NEW.caja_id IS NULL THEN
      NEW.caja_id := v_ref_caja;
    ELSIF v_ref_caja IS NOT NULL AND NEW.caja_id <> v_ref_caja THEN
      RAISE EXCEPTION
        USING MESSAGE = 'caja_id no coincide con sesion_caja en cortes_caja',
              ERRCODE = '23514';
    END IF;

    IF NEW.cajero_id IS NULL THEN
      NEW.cajero_id := v_ref_cajero;
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id es obligatorio en cortes_caja',
            ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_cortes_caja_tenant_consistency ON public.cortes_caja;
CREATE TRIGGER trg_enforce_cortes_caja_tenant_consistency
BEFORE INSERT OR UPDATE ON public.cortes_caja
FOR EACH ROW EXECUTE FUNCTION app.enforce_cortes_caja_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_autorizaciones_caja_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
  v_ref_solicitante uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.sesion_caja_id := app.to_uuid_or_null(COALESCE(NEW.sesion_caja_id::text, ''));
  NEW.supervisor_id := app.to_uuid_or_null(COALESCE(NEW.supervisor_id::text, ''));
  NEW.solicitante_id := app.to_uuid_or_null(COALESCE(NEW.solicitante_id::text, ''));

  IF NEW.sesion_caja_id IS NOT NULL THEN
    SELECT s.tenant_id, COALESCE(s.cajero_id, s.usuario_id, s.abierto_por)
    INTO v_ref_tenant, v_ref_solicitante
    FROM public.sesiones_caja s
    WHERE s.id = NEW.sesion_caja_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Sesion de caja no existe: %s', NEW.sesion_caja_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con sesion_caja en autorizaciones_caja',
              ERRCODE = '23514';
    END IF;

    IF NEW.solicitante_id IS NULL THEN
      NEW.solicitante_id := v_ref_solicitante;
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id es obligatorio en autorizaciones_caja',
            ERRCODE = '23514';
  END IF;

  IF NEW.supervisor_id IS NOT NULL THEN
    SELECT u.tenant_id INTO v_ref_tenant FROM public.usuarios_sistema u WHERE u.id = NEW.supervisor_id;
    IF FOUND AND v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'supervisor_id pertenece a otro tenant', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.solicitante_id IS NOT NULL THEN
    SELECT u.tenant_id INTO v_ref_tenant FROM public.usuarios_sistema u WHERE u.id = NEW.solicitante_id;
    IF FOUND AND v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'solicitante_id pertenece a otro tenant', ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_autorizaciones_caja_tenant_consistency ON public.autorizaciones_caja;
CREATE TRIGGER trg_enforce_autorizaciones_caja_tenant_consistency
BEFORE INSERT OR UPDATE ON public.autorizaciones_caja
FOR EACH ROW EXECUTE FUNCTION app.enforce_autorizaciones_caja_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Constraints de negocio/integridad.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_cajas_ids_required'
      AND conrelid = 'public.cajas'::regclass
  ) THEN
    ALTER TABLE public.cajas
      ADD CONSTRAINT ck_cajas_ids_required
      CHECK (tenant_id IS NOT NULL) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_cajas_nombre_nonempty'
      AND conrelid = 'public.cajas'::regclass
  ) THEN
    ALTER TABLE public.cajas
      ADD CONSTRAINT ck_cajas_nombre_nonempty
      CHECK (nombre IS NOT NULL AND btrim(nombre) <> '') NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_cajas_codigo_nonempty'
      AND conrelid = 'public.cajas'::regclass
  ) THEN
    ALTER TABLE public.cajas
      ADD CONSTRAINT ck_cajas_codigo_nonempty
      CHECK (codigo IS NOT NULL AND btrim(codigo) <> '') NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_cajas_tipo_valid'
      AND conrelid = 'public.cajas'::regclass
  ) THEN
    ALTER TABLE public.cajas
      ADD CONSTRAINT ck_cajas_tipo_valid
      CHECK (tipo IN ('TIENDA', 'MOSTRADOR', 'KIOSKO')) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_cajas_estado_valid'
      AND conrelid = 'public.cajas'::regclass
  ) THEN
    ALTER TABLE public.cajas
      ADD CONSTRAINT ck_cajas_estado_valid
      CHECK (estado IN ('ACTIVO', 'INACTIVO', 'MANTENIMIENTO', 'BLOQUEADA')) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_sesiones_caja_ids_required'
      AND conrelid = 'public.sesiones_caja'::regclass
  ) THEN
    ALTER TABLE public.sesiones_caja
      ADD CONSTRAINT ck_sesiones_caja_ids_required
      CHECK (tenant_id IS NOT NULL AND caja_id IS NOT NULL) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_sesiones_caja_estado_valid'
      AND conrelid = 'public.sesiones_caja'::regclass
  ) THEN
    ALTER TABLE public.sesiones_caja
      ADD CONSTRAINT ck_sesiones_caja_estado_valid
      CHECK (estado IN ('ABIERTA', 'CERRADA', 'PAUSADA', 'ANULADA')) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_sesiones_caja_moneda_iso3'
      AND conrelid = 'public.sesiones_caja'::regclass
  ) THEN
    ALTER TABLE public.sesiones_caja
      ADD CONSTRAINT ck_sesiones_caja_moneda_iso3
      CHECK (moneda ~ '^[A-Z]{3}$') NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_sesiones_caja_montos_nonnegative'
      AND conrelid = 'public.sesiones_caja'::regclass
  ) THEN
    ALTER TABLE public.sesiones_caja
      ADD CONSTRAINT ck_sesiones_caja_montos_nonnegative
      CHECK (
        monto_inicio >= 0
        AND monto_inicial >= 0
        AND monto_esperado >= 0
        AND monto_contado >= 0
        AND monto_cierre >= 0
        AND total_efectivo >= 0
        AND total_tarjeta >= 0
      ) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_sesiones_caja_duracion_nonnegative'
      AND conrelid = 'public.sesiones_caja'::regclass
  ) THEN
    ALTER TABLE public.sesiones_caja
      ADD CONSTRAINT ck_sesiones_caja_duracion_nonnegative
      CHECK (duracion_horas >= 0) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_sesiones_caja_fechas_consistent'
      AND conrelid = 'public.sesiones_caja'::regclass
  ) THEN
    ALTER TABLE public.sesiones_caja
      ADD CONSTRAINT ck_sesiones_caja_fechas_consistent
      CHECK (
        COALESCE(hora_cierre, fecha_cierre) IS NULL
        OR (
          COALESCE(hora_apertura, fecha_apertura) IS NOT NULL
          AND COALESCE(hora_cierre, fecha_cierre) >= COALESCE(hora_apertura, fecha_apertura)
        )
      ) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_movimientos_caja_ids_required'
      AND conrelid = 'public.movimientos_caja'::regclass
  ) THEN
    ALTER TABLE public.movimientos_caja
      ADD CONSTRAINT ck_movimientos_caja_ids_required
      CHECK (tenant_id IS NOT NULL AND sesion_caja_id IS NOT NULL) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_movimientos_caja_secuencia_positive'
      AND conrelid = 'public.movimientos_caja'::regclass
  ) THEN
    ALTER TABLE public.movimientos_caja
      ADD CONSTRAINT ck_movimientos_caja_secuencia_positive
      CHECK (secuencia >= 1) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_movimientos_caja_tipo_valid'
      AND conrelid = 'public.movimientos_caja'::regclass
  ) THEN
    ALTER TABLE public.movimientos_caja
      ADD CONSTRAINT ck_movimientos_caja_tipo_valid
      CHECK (tipo_movimiento IN ('VENTA', 'RETIRO', 'INGRESO', 'AJUSTE', 'CAMBIO_TURNO', 'APERTURA', 'CIERRE')) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_movimientos_caja_timestamp_required'
      AND conrelid = 'public.movimientos_caja'::regclass
  ) THEN
    ALTER TABLE public.movimientos_caja
      ADD CONSTRAINT ck_movimientos_caja_timestamp_required
      CHECK ("timestamp" IS NOT NULL) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_movimientos_caja_saldo_consistency'
      AND conrelid = 'public.movimientos_caja'::regclass
  ) THEN
    ALTER TABLE public.movimientos_caja
      ADD CONSTRAINT ck_movimientos_caja_saldo_consistency
      CHECK (round(COALESCE(saldo_anterior, 0) + COALESCE(monto, 0), 2) = round(COALESCE(saldo_nuevo, 0), 2)) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_retiros_caja_ids_required'
      AND conrelid = 'public.retiros_caja'::regclass
  ) THEN
    ALTER TABLE public.retiros_caja
      ADD CONSTRAINT ck_retiros_caja_ids_required
      CHECK (tenant_id IS NOT NULL AND sesion_caja_id IS NOT NULL) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_retiros_caja_monto_nonnegative'
      AND conrelid = 'public.retiros_caja'::regclass
  ) THEN
    ALTER TABLE public.retiros_caja
      ADD CONSTRAINT ck_retiros_caja_monto_nonnegative
      CHECK (monto >= 0) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_retiros_caja_motivo_valid'
      AND conrelid = 'public.retiros_caja'::regclass
  ) THEN
    ALTER TABLE public.retiros_caja
      ADD CONSTRAINT ck_retiros_caja_motivo_valid
      CHECK (motivo IN ('DEPOSITO_BANCARIO', 'COMPRA_EMERGENCIA', 'BOVEDA', 'OTRO')) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_retiros_caja_estado_valid'
      AND conrelid = 'public.retiros_caja'::regclass
  ) THEN
    ALTER TABLE public.retiros_caja
      ADD CONSTRAINT ck_retiros_caja_estado_valid
      CHECK (estado_conciliacion IN ('PENDIENTE', 'CONCILIADO', 'RECHAZADO')) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_retiros_caja_conciliacion_fecha'
      AND conrelid = 'public.retiros_caja'::regclass
  ) THEN
    ALTER TABLE public.retiros_caja
      ADD CONSTRAINT ck_retiros_caja_conciliacion_fecha
      CHECK (estado_conciliacion <> 'CONCILIADO' OR fecha_conciliacion IS NOT NULL) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_cambios_turno_ids_required'
      AND conrelid = 'public.cambios_turno'::regclass
  ) THEN
    ALTER TABLE public.cambios_turno
      ADD CONSTRAINT ck_cambios_turno_ids_required
      CHECK (
        tenant_id IS NOT NULL
        AND sesion_caja_id IS NOT NULL
        AND usuario_saliente_id IS NOT NULL
        AND usuario_entrante_id IS NOT NULL
      ) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_cambios_turno_estado_valid'
      AND conrelid = 'public.cambios_turno'::regclass
  ) THEN
    ALTER TABLE public.cambios_turno
      ADD CONSTRAINT ck_cambios_turno_estado_valid
      CHECK (estado IN ('EN_PROCESO', 'COMPLETADO', 'CANCELADO')) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_cambios_turno_saldos_nonnegative'
      AND conrelid = 'public.cambios_turno'::regclass
  ) THEN
    ALTER TABLE public.cambios_turno
      ADD CONSTRAINT ck_cambios_turno_saldos_nonnegative
      CHECK (saldo_sistema >= 0 AND saldo_contado >= 0) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_cambios_turno_timestamps_valid'
      AND conrelid = 'public.cambios_turno'::regclass
  ) THEN
    ALTER TABLE public.cambios_turno
      ADD CONSTRAINT ck_cambios_turno_timestamps_valid
      CHECK (
        timestamp_inicio IS NOT NULL
        AND (timestamp_fin IS NULL OR timestamp_fin >= timestamp_inicio)
      ) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_cambios_turno_estado_fin_consistency'
      AND conrelid = 'public.cambios_turno'::regclass
  ) THEN
    ALTER TABLE public.cambios_turno
      ADD CONSTRAINT ck_cambios_turno_estado_fin_consistency
      CHECK (
        (estado = 'EN_PROCESO' AND timestamp_fin IS NULL)
        OR (estado IN ('COMPLETADO', 'CANCELADO') AND timestamp_fin IS NOT NULL)
      ) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_cortes_caja_ids_required'
      AND conrelid = 'public.cortes_caja'::regclass
  ) THEN
    ALTER TABLE public.cortes_caja
      ADD CONSTRAINT ck_cortes_caja_ids_required
      CHECK (tenant_id IS NOT NULL AND sesion_caja_id IS NOT NULL AND caja_id IS NOT NULL) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_cortes_caja_fecha_required'
      AND conrelid = 'public.cortes_caja'::regclass
  ) THEN
    ALTER TABLE public.cortes_caja
      ADD CONSTRAINT ck_cortes_caja_fecha_required
      CHECK (fecha_corte IS NOT NULL) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_cortes_caja_moneda_iso3'
      AND conrelid = 'public.cortes_caja'::regclass
  ) THEN
    ALTER TABLE public.cortes_caja
      ADD CONSTRAINT ck_cortes_caja_moneda_iso3
      CHECK (moneda ~ '^[A-Z]{3}$') NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_cortes_caja_totals_nonnegative'
      AND conrelid = 'public.cortes_caja'::regclass
  ) THEN
    ALTER TABLE public.cortes_caja
      ADD CONSTRAINT ck_cortes_caja_totals_nonnegative
      CHECK (total_ventas >= 0 AND total_impuestos >= 0 AND total_neto >= 0 AND total_documentos >= 0) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_autorizaciones_caja_ids_required'
      AND conrelid = 'public.autorizaciones_caja'::regclass
  ) THEN
    ALTER TABLE public.autorizaciones_caja
      ADD CONSTRAINT ck_autorizaciones_caja_ids_required
      CHECK (
        tenant_id IS NOT NULL
        AND sesion_caja_id IS NOT NULL
        AND supervisor_id IS NOT NULL
        AND solicitante_id IS NOT NULL
      ) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_autorizaciones_caja_tipo_valid'
      AND conrelid = 'public.autorizaciones_caja'::regclass
  ) THEN
    ALTER TABLE public.autorizaciones_caja
      ADD CONSTRAINT ck_autorizaciones_caja_tipo_valid
      CHECK (tipo_autorizacion IN ('APERTURA_MONTO_BAJO', 'APERTURA_MONTO_ALTO', 'CIERRE_DIFERENCIA_ALTA', 'RETIRO_MONTO_ALTO', 'AJUSTE_MANUAL')) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_autorizaciones_caja_estado_valid'
      AND conrelid = 'public.autorizaciones_caja'::regclass
  ) THEN
    ALTER TABLE public.autorizaciones_caja
      ADD CONSTRAINT ck_autorizaciones_caja_estado_valid
      CHECK (estado IN ('APROBADO', 'RECHAZADO', 'PENDIENTE')) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_autorizaciones_caja_monto_nonnegative'
      AND conrelid = 'public.autorizaciones_caja'::regclass
  ) THEN
    ALTER TABLE public.autorizaciones_caja
      ADD CONSTRAINT ck_autorizaciones_caja_monto_nonnegative
      CHECK (monto_solicitado >= 0) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_autorizaciones_caja_razon_nonempty'
      AND conrelid = 'public.autorizaciones_caja'::regclass
  ) THEN
    ALTER TABLE public.autorizaciones_caja
      ADD CONSTRAINT ck_autorizaciones_caja_razon_nonempty
      CHECK (razon_autorizacion IS NOT NULL AND btrim(razon_autorizacion) <> '') NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_autorizaciones_caja_aprobado_at_consistency'
      AND conrelid = 'public.autorizaciones_caja'::regclass
  ) THEN
    ALTER TABLE public.autorizaciones_caja
      ADD CONSTRAINT ck_autorizaciones_caja_aprobado_at_consistency
      CHECK (estado <> 'APROBADO' OR aprobado_at IS NOT NULL) NOT VALID;
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.cajas
  VALIDATE CONSTRAINT ck_cajas_ids_required;
ALTER TABLE IF EXISTS public.cajas
  VALIDATE CONSTRAINT ck_cajas_nombre_nonempty;
ALTER TABLE IF EXISTS public.cajas
  VALIDATE CONSTRAINT ck_cajas_codigo_nonempty;
ALTER TABLE IF EXISTS public.cajas
  VALIDATE CONSTRAINT ck_cajas_tipo_valid;
ALTER TABLE IF EXISTS public.cajas
  VALIDATE CONSTRAINT ck_cajas_estado_valid;

ALTER TABLE IF EXISTS public.sesiones_caja
  VALIDATE CONSTRAINT ck_sesiones_caja_ids_required;
ALTER TABLE IF EXISTS public.sesiones_caja
  VALIDATE CONSTRAINT ck_sesiones_caja_estado_valid;
ALTER TABLE IF EXISTS public.sesiones_caja
  VALIDATE CONSTRAINT ck_sesiones_caja_moneda_iso3;
ALTER TABLE IF EXISTS public.sesiones_caja
  VALIDATE CONSTRAINT ck_sesiones_caja_montos_nonnegative;
ALTER TABLE IF EXISTS public.sesiones_caja
  VALIDATE CONSTRAINT ck_sesiones_caja_duracion_nonnegative;
ALTER TABLE IF EXISTS public.sesiones_caja
  VALIDATE CONSTRAINT ck_sesiones_caja_fechas_consistent;

ALTER TABLE IF EXISTS public.movimientos_caja
  VALIDATE CONSTRAINT ck_movimientos_caja_ids_required;
ALTER TABLE IF EXISTS public.movimientos_caja
  VALIDATE CONSTRAINT ck_movimientos_caja_secuencia_positive;
ALTER TABLE IF EXISTS public.movimientos_caja
  VALIDATE CONSTRAINT ck_movimientos_caja_tipo_valid;
ALTER TABLE IF EXISTS public.movimientos_caja
  VALIDATE CONSTRAINT ck_movimientos_caja_timestamp_required;
ALTER TABLE IF EXISTS public.movimientos_caja
  VALIDATE CONSTRAINT ck_movimientos_caja_saldo_consistency;

ALTER TABLE IF EXISTS public.retiros_caja
  VALIDATE CONSTRAINT ck_retiros_caja_ids_required;
ALTER TABLE IF EXISTS public.retiros_caja
  VALIDATE CONSTRAINT ck_retiros_caja_monto_nonnegative;
ALTER TABLE IF EXISTS public.retiros_caja
  VALIDATE CONSTRAINT ck_retiros_caja_motivo_valid;
ALTER TABLE IF EXISTS public.retiros_caja
  VALIDATE CONSTRAINT ck_retiros_caja_estado_valid;
ALTER TABLE IF EXISTS public.retiros_caja
  VALIDATE CONSTRAINT ck_retiros_caja_conciliacion_fecha;

ALTER TABLE IF EXISTS public.cambios_turno
  VALIDATE CONSTRAINT ck_cambios_turno_ids_required;
ALTER TABLE IF EXISTS public.cambios_turno
  VALIDATE CONSTRAINT ck_cambios_turno_estado_valid;
ALTER TABLE IF EXISTS public.cambios_turno
  VALIDATE CONSTRAINT ck_cambios_turno_saldos_nonnegative;
ALTER TABLE IF EXISTS public.cambios_turno
  VALIDATE CONSTRAINT ck_cambios_turno_timestamps_valid;
ALTER TABLE IF EXISTS public.cambios_turno
  VALIDATE CONSTRAINT ck_cambios_turno_estado_fin_consistency;

ALTER TABLE IF EXISTS public.cortes_caja
  VALIDATE CONSTRAINT ck_cortes_caja_ids_required;
ALTER TABLE IF EXISTS public.cortes_caja
  VALIDATE CONSTRAINT ck_cortes_caja_fecha_required;
ALTER TABLE IF EXISTS public.cortes_caja
  VALIDATE CONSTRAINT ck_cortes_caja_moneda_iso3;
ALTER TABLE IF EXISTS public.cortes_caja
  VALIDATE CONSTRAINT ck_cortes_caja_totals_nonnegative;

ALTER TABLE IF EXISTS public.autorizaciones_caja
  VALIDATE CONSTRAINT ck_autorizaciones_caja_ids_required;
ALTER TABLE IF EXISTS public.autorizaciones_caja
  VALIDATE CONSTRAINT ck_autorizaciones_caja_tipo_valid;
ALTER TABLE IF EXISTS public.autorizaciones_caja
  VALIDATE CONSTRAINT ck_autorizaciones_caja_estado_valid;
ALTER TABLE IF EXISTS public.autorizaciones_caja
  VALIDATE CONSTRAINT ck_autorizaciones_caja_monto_nonnegative;
ALTER TABLE IF EXISTS public.autorizaciones_caja
  VALIDATE CONSTRAINT ck_autorizaciones_caja_razon_nonempty;
ALTER TABLE IF EXISTS public.autorizaciones_caja
  VALIDATE CONSTRAINT ck_autorizaciones_caja_aprobado_at_consistency;

-- ----------------------------------------------------------------------------
-- Indices de unicidad y soporte.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_cajas_tenant_codigo_runtime
ON public.cajas (tenant_id, upper(codigo))
WHERE tenant_id IS NOT NULL
  AND codigo IS NOT NULL
  AND btrim(codigo) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_sesiones_caja_open_by_caja_runtime
ON public.sesiones_caja (tenant_id, caja_id)
WHERE tenant_id IS NOT NULL
  AND caja_id IS NOT NULL
  AND estado = 'ABIERTA';

CREATE UNIQUE INDEX IF NOT EXISTS ux_sesiones_caja_open_by_cajero_runtime
ON public.sesiones_caja (tenant_id, cajero_id)
WHERE tenant_id IS NOT NULL
  AND cajero_id IS NOT NULL
  AND estado = 'ABIERTA';

CREATE UNIQUE INDEX IF NOT EXISTS ux_sesiones_caja_open_by_dispositivo_runtime
ON public.sesiones_caja (tenant_id, lower(dispositivo))
WHERE tenant_id IS NOT NULL
  AND dispositivo IS NOT NULL
  AND btrim(dispositivo) <> ''
  AND estado = 'ABIERTA';

CREATE UNIQUE INDEX IF NOT EXISTS ux_movimientos_caja_tenant_sesion_secuencia_runtime
ON public.movimientos_caja (tenant_id, sesion_caja_id, secuencia)
WHERE tenant_id IS NOT NULL
  AND sesion_caja_id IS NOT NULL
  AND secuencia >= 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_autorizaciones_caja_pending_scope_runtime
ON public.autorizaciones_caja (tenant_id, sesion_caja_id, upper(tipo_autorizacion), solicitante_id)
WHERE tenant_id IS NOT NULL
  AND sesion_caja_id IS NOT NULL
  AND tipo_autorizacion IS NOT NULL
  AND btrim(tipo_autorizacion) <> ''
  AND solicitante_id IS NOT NULL
  AND estado = 'PENDIENTE';

CREATE INDEX IF NOT EXISTS idx_retiros_caja_tenant_movimiento_runtime
ON public.retiros_caja (tenant_id, movimiento_caja_id)
WHERE tenant_id IS NOT NULL
  AND movimiento_caja_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cambios_turno_tenant_usuario_estado_runtime
ON public.cambios_turno (tenant_id, usuario_saliente_id, estado, timestamp_inicio DESC)
WHERE tenant_id IS NOT NULL
  AND usuario_saliente_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cortes_caja_tenant_sesion_runtime
ON public.cortes_caja (tenant_id, sesion_caja_id)
WHERE tenant_id IS NOT NULL
  AND sesion_caja_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_autorizaciones_caja_tenant_sesion_estado_runtime
ON public.autorizaciones_caja (tenant_id, sesion_caja_id, estado, created_at DESC)
WHERE tenant_id IS NOT NULL
  AND sesion_caja_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Hardening RLS explicito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'cajas');
SELECT app.apply_tenant_policy('public', 'sesiones_caja');
SELECT app.apply_tenant_policy('public', 'movimientos_caja');
SELECT app.apply_tenant_policy('public', 'retiros_caja');
SELECT app.apply_tenant_policy('public', 'cambios_turno');
SELECT app.apply_tenant_policy('public', 'cortes_caja');
SELECT app.apply_tenant_policy('public', 'autorizaciones_caja');

COMMIT;
