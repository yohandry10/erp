-- Migracion 520: saber si un RUC existe, si esta activo y si esta habido.
--
-- Hasta ahora solo se comprobaba el **formato** del RUC y su digito verificador.
-- Eso descarta un numero mal tecleado, pero no dice nada de lo que le importa a
-- un contador:
--
--   * si el contribuyente **existe** de verdad;
--   * si esta ACTIVO o de BAJA;
--   * y si esta HABIDO o NO HABIDO, que es lo que decide si una compra da
--     derecho a credito fiscal.
--
-- Los datos son publicos y **globales**: un RUC es el mismo para todos los
-- contribuyentes del sistema, asi que la tabla no lleva `tenant_id`. Es el mismo
-- patron que `tasas_detraccion`.
--
-- Se guarda como cache, no como copia del padron. SUNAT publica el padron
-- completo en un fichero diario de 391 MB (~11 millones de filas); traerlo entero
-- cada dia a esta base seria pagar por 11 millones de registros para consultar
-- unos pocos miles. Aqui solo entra el RUC que alguien consulta de verdad, y se
-- refresca cuando envejece.

BEGIN;

CREATE TABLE IF NOT EXISTS public.padron_ruc (
  ruc text PRIMARY KEY,
  razon_social text,
  estado text,
  condicion text,
  direccion text,
  ubigeo text,
  -- De donde salio el dato, para poder rastrear una respuesta rara.
  fuente text NOT NULL,
  consultado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_padron_ruc_formato_520 CHECK (ruc ~ '^[0-9]{11}$')
);

COMMENT ON TABLE public.padron_ruc IS
  'Cache de la consulta de RUC al padron de SUNAT. Datos publicos y globales: sin tenant_id.';
COMMENT ON COLUMN public.padron_ruc.condicion IS
  'HABIDO / NO HABIDO. Una compra a un proveedor NO HABIDO tiene problemas de credito fiscal.';

-- Para saber cuales hay que refrescar sin recorrer la tabla entera.
CREATE INDEX IF NOT EXISTS idx_padron_ruc_consultado_en_520
  ON public.padron_ruc (consultado_en);

ALTER TABLE public.padron_ruc ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.padron_ruc FORCE ROW LEVEL SECURITY;

-- Lectura para todos: es informacion publica y no lleva tenant. La escritura la
-- hace el API con `service_role`, que es quien consulta la fuente.
DROP POLICY IF EXISTS padron_ruc_lectura_520 ON public.padron_ruc;
CREATE POLICY padron_ruc_lectura_520 ON public.padron_ruc
  FOR SELECT TO authenticated, service_role USING (true);

REVOKE ALL ON public.padron_ruc FROM PUBLIC, anon;
GRANT SELECT ON public.padron_ruc TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.padron_ruc TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
