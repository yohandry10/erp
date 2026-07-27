-- ============================================================================
-- 359__metodos_pago_tipo_por_codigo.sql
-- El sembrado de métodos de pago por tenant insertaba codigo/nombre sin `tipo`,
-- y la columna cae a su default 'EFECTIVO'. Resultado: tarjeta, transferencia y
-- Yape quedaban tipificados como efectivo, así que toda venta con esos medios
-- acreditaba la gaveta por el importe completo. Al cierre, el arqueo esperaba
-- efectivo que nunca entró.
--
-- Esta migración realinea el `tipo` de las filas por tenant con la taxonomía del
-- catálogo global sembrado en `024__seed_minimum_operational_catalogs.sql`. Sólo
-- toca filas cuyo `codigo` identifica el medio sin ambigüedad y que hoy están
-- marcadas como efectivo; no inventa tipos para códigos desconocidos.
-- ============================================================================

BEGIN;

UPDATE public.metodos_pago mp
SET tipo = t.tipo,
    updated_at = now()
FROM (
  VALUES
    ('tarjeta', 'TARJETA'),
    ('transferencia', 'TRANSFERENCIA'),
    ('yape', 'BILLETERA_DIGITAL'),
    ('plin', 'BILLETERA_DIGITAL')
) AS t(codigo, tipo)
WHERE mp.tenant_id IS NOT NULL
  AND lower(btrim(COALESCE(mp.codigo, ''))) = t.codigo
  AND upper(COALESCE(mp.tipo, 'EFECTIVO')) = 'EFECTIVO';

COMMIT;
