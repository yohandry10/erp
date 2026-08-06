-- El formulario y las vistas de clientes exponen telefono, pero el esquema
-- reconstruido no conservaba la columna y el backend descartaba silenciosamente
-- el dato. Se restablece el contrato compartido por Ventas, POS y CxC.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS telefono text;

UPDATE public.clientes
SET telefono = NULL
WHERE telefono IS NOT NULL
  AND btrim(telefono) = '';

ALTER TABLE public.clientes
  DROP CONSTRAINT IF EXISTS ck_clientes_telefono_runtime_387;

ALTER TABLE public.clientes
  ADD CONSTRAINT ck_clientes_telefono_runtime_387
  CHECK (telefono IS NULL OR length(btrim(telefono)) BETWEEN 6 AND 20)
  NOT VALID;

ALTER TABLE public.clientes
  VALIDATE CONSTRAINT ck_clientes_telefono_runtime_387;

COMMENT ON COLUMN public.clientes.telefono IS
  'Telefono opcional del cliente; contrato compartido por Ventas, POS y CxC.';
