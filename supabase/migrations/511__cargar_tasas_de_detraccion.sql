-- 511__cargar_tasas_de_detraccion.sql
--
-- La 510 dejo el mecanismo y el catalogo vacio, diciendo que cargar tasas de
-- memoria seria escribir numeros que nadie verifico. Esta migracion lo carga,
-- pero de la fuente y no de la memoria: los apendices del sistema de
-- detracciones publicados por SUNAT en orientacion.sunat.gob.pe, contrastados
-- contra una segunda tabla para los codigos que la primera devolvia incompletos
-- (027, 040, 044 y 045).
--
-- Lo que se carga y lo que no:
--
--   * Se cargan los codigos con porcentaje vigente publicado.
--   * **No se carga el 044** --beneficio de minerales metalicos-- porque figura
--     como no vigente. Cargarlo con cualquier tasa seria inventarla.
--   * El importe minimo se fija en S/ 700 para los servicios del anexo 3, que es
--     el umbral general del sistema. Para los bienes del anexo 2 se deja **en
--     blanco** a proposito: hay excepciones sin monto minimo --azucar, arroz
--     pilado-- y poner 700 a todos haria que el sistema dejara de contrastar
--     operaciones que si estan sujetas.
--
-- Las tasas las modifica SUNAT por resolucion y sin preaviso. Por eso cada fila
-- lleva `fuente` y `vigente_desde`, y la busqueda es por fecha: cuando cambie
-- una tasa se cierra la fila con `vigente_hasta` y se anade la nueva, en vez de
-- editar la existente. Los documentos ya contrastados conservan asi la tasa con
-- la que se contrastaron.
--
-- Y se corrige algo de la 510 que se veria en cuanto hubiera catalogo: el
-- contraste no miraba el importe minimo, de modo que una operacion por debajo
-- del umbral --que no lleva detraccion-- habria salido avisada por no declarar
-- una que no corresponde.

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. El catalogo
-- ----------------------------------------------------------------------------
INSERT INTO public.tasas_detraccion
  (codigo, descripcion, anexo, tasa, importe_minimo, vigente_desde, fuente)
VALUES
  -- Anexo 1
  ('001', 'Azucar y melaza de cana',                                  '1', 0.1000, NULL,   DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('003', 'Alcohol etilico',                                          '1', 0.1000, NULL,   DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  -- Anexo 2: bienes. Sin importe minimo cargado, ver cabecera.
  ('004', 'Recursos hidrobiologicos',                                 '2', 0.0400, NULL,   DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('005', 'Maiz amarillo duro',                                       '2', 0.0400, NULL,   DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('007', 'Cana de azucar',                                           '2', 0.1000, NULL,   DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('008', 'Madera',                                                   '2', 0.0400, NULL,   DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('009', 'Arena y piedra',                                           '2', 0.1000, NULL,   DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('010', 'Residuos, subproductos, desechos, recortes y desperdicios','2', 0.1500, NULL,   DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('011', 'Bienes gravados con IGV por renuncia a la exoneracion',    '2', 0.1000, NULL,   DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('013', 'Animales vivos',                                           '2', 0.0400, NULL,   DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('014', 'Carnes y despojos comestibles',                            '2', 0.0400, NULL,   DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('015', 'Abonos, cueros y pieles de origen animal',                 '2', 0.0400, NULL,   DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('016', 'Aceite de pescado',                                        '2', 0.1000, NULL,   DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('017', 'Harina, polvo y pellets de pescado',                       '2', 0.0400, NULL,   DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('023', 'Leche',                                                    '2', 0.0400, NULL,   DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('031', 'Oro gravado con IGV',                                      '2', 0.1000, NULL,   DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('032', 'Paprika y otros frutos del genero capsicum',               '2', 0.1000, NULL,   DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('034', 'Minerales metalicos no auriferos',                         '2', 0.1000, NULL,   DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('035', 'Bienes exonerados del IGV',                                '2', 0.0150, NULL,   DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('036', 'Oro y demas minerales metalicos exonerados del IGV',       '2', 0.0150, NULL,   DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('039', 'Minerales no metalicos',                                   '2', 0.1000, NULL,   DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('041', 'Plomo',                                                    '2', 0.1500, NULL,   DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('045', 'Minerales de oro y sus concentrados gravados con IGV',     '2', 0.0150, NULL,   DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  -- Anexo 3: servicios. Umbral general del sistema, S/ 700.
  ('012', 'Intermediacion laboral y tercerizacion',                   '3', 0.1200, 700.00, DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('019', 'Arrendamiento de bienes',                                  '3', 0.1000, 700.00, DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('020', 'Mantenimiento y reparacion de bienes muebles',             '3', 0.1200, 700.00, DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('021', 'Movimiento de carga',                                      '3', 0.1000, 700.00, DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('022', 'Otros servicios empresariales',                            '3', 0.1200, 700.00, DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('024', 'Comision mercantil',                                       '3', 0.1000, 700.00, DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('025', 'Fabricacion de bienes por encargo',                        '3', 0.1000, 700.00, DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('026', 'Servicio de transporte de personas',                       '3', 0.1000, 700.00, DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  -- El transporte de carga se calcula sobre el mayor entre el importe de la
  -- operacion y el valor referencial, y su umbral es S/ 400. El sistema no
  -- conoce el valor referencial, asi que contrasta sobre el importe de la
  -- factura: si el referencial es mayor, el contraste avisara de una diferencia
  -- que en ese caso es correcta.
  ('027', 'Servicio de transporte de bienes por via terrestre',       '3', 0.0400, 400.00, DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('030', 'Contratos de construccion',                                '3', 0.0400, 700.00, DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('037', 'Demas servicios gravados con IGV',                         '3', 0.1200, 700.00, DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
  ('040', 'Primera venta de inmuebles gravada con IGV',               '3', 0.0400, 700.00, DATE '2020-01-01', 'SUNAT orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones')
ON CONFLICT (codigo, vigente_desde) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. El contraste respeta el importe minimo
--
--    Sin esto, una operacion por debajo del umbral --que no lleva detraccion--
--    saldria avisada por no declarar una que no corresponde. Con el catalogo
--    vacio el defecto no se veia; en cuanto hay tasas, si.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.contrastar_detraccion_510()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tasa numeric;
  v_minimo numeric;
  v_esperado numeric;
  v_fecha date;
BEGIN
  NEW.codigo_detraccion := NULLIF(btrim(COALESCE(NEW.codigo_detraccion, '')), '');
  IF NEW.codigo_detraccion IS NULL THEN
    RETURN NEW;
  END IF;

  -- Los codigos de SUNAT son de tres digitos. Se admite teclear '37' y se guarda
  -- '037', porque exigir el cero a la izquierda solo produce codigos que el
  -- catalogo no encuentra.
  IF NEW.codigo_detraccion ~ '^[0-9]{1,3}$' THEN
    NEW.codigo_detraccion := lpad(NEW.codigo_detraccion, 3, '0');
  END IF;

  v_fecha := COALESCE(NEW.fecha_emision, current_date);

  SELECT t.tasa, t.importe_minimo
    INTO v_tasa, v_minimo
  FROM public.tasas_detraccion t
  WHERE btrim(t.codigo) = NEW.codigo_detraccion
    AND t.vigente_desde <= v_fecha
    AND (t.vigente_hasta IS NULL OR t.vigente_hasta >= v_fecha)
  ORDER BY t.vigente_desde DESC
  LIMIT 1;

  IF v_tasa IS NULL THEN
    RAISE WARNING
      'DETRACCION: el codigo % no esta en el catalogo vigente; el importe declarado no se contrasta',
      NEW.codigo_detraccion;
    RETURN NEW;
  END IF;

  -- Por debajo del umbral no hay detraccion que contrastar.
  IF v_minimo IS NOT NULL AND COALESCE(NEW.total, 0) <= v_minimo THEN
    RETURN NEW;
  END IF;

  v_esperado := round(COALESCE(NEW.total, 0) * v_tasa, 2);

  IF round(COALESCE(NEW.detraccion_total, 0), 2) IS DISTINCT FROM v_esperado THEN
    RAISE WARNING
      'DETRACCION: el codigo % al %%% sobre % da %, y se declaro %',
      NEW.codigo_detraccion, round(v_tasa * 100, 2), round(COALESCE(NEW.total, 0), 2),
      v_esperado, round(COALESCE(NEW.detraccion_total, 0), 2);
  END IF;

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
    'detraccion_contraste', jsonb_build_object(
      'codigo', NEW.codigo_detraccion,
      'tasa', v_tasa,
      'importe_minimo', v_minimo,
      'importe_esperado', v_esperado,
      'importe_declarado', round(COALESCE(NEW.detraccion_total, 0), 2)
    )
  );

  RETURN NEW;
END;
$$;

COMMIT;
