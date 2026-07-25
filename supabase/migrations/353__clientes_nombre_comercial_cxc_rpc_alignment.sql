-- Alinea el contrato de clientes usado por la UI y por registrar_cxc_pago_tx.
-- La RPC 334 resuelve la etiqueta del cliente con razon_social/nombre_comercial,
-- pero la reconstrucción runtime no conservaba la segunda columna. Eso forzaba
-- al backend a abandonar la RPC transaccional y ejecutar el cobro por el flujo
-- legacy no atómico.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS nombre_comercial text;

UPDATE public.clientes
SET nombre_comercial = NULL
WHERE nombre_comercial IS NOT NULL
  AND btrim(nombre_comercial) = '';

ALTER TABLE public.clientes
  DROP CONSTRAINT IF EXISTS ck_clientes_nombre_comercial_runtime_353;

ALTER TABLE public.clientes
  ADD CONSTRAINT ck_clientes_nombre_comercial_runtime_353
  CHECK (nombre_comercial IS NULL OR length(btrim(nombre_comercial)) BETWEEN 1 AND 255)
  NOT VALID;

ALTER TABLE public.clientes
  VALIDATE CONSTRAINT ck_clientes_nombre_comercial_runtime_353;

COMMENT ON COLUMN public.clientes.nombre_comercial IS
  'Nombre comercial opcional del cliente; contrato compartido por Ventas, CxC y documentos.';

