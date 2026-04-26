-- Migration 140: Corregir trigger que verifica stock negativo
-- El trigger actual referencia NEW.stock_actual que NO EXISTE en la tabla productos
-- La tabla productos solo tiene la columna 'stock', no 'stock_actual'

CREATE OR REPLACE FUNCTION public.trigger_prevenir_stock_negativo()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Verificar stock principal en tabla productos
  IF TG_TABLE_NAME = 'productos' THEN
    IF NEW.stock IS NOT NULL AND NEW.stock < 0 THEN
      RAISE EXCEPTION 'No se permite stock negativo. Producto: %, Stock intentado: %', NEW.id, NEW.stock;
    END IF;
    -- NOTA: La columna stock_actual NO EXISTE en tabla productos, solo existe 'stock'
    -- Se removió la verificación de NEW.stock_actual que causaba el error
  END IF;

  -- Verificar existencias por almacén (esta tabla SÍ tiene stock_actual)
  IF TG_TABLE_NAME = 'producto_existencias' THEN
    IF NEW.stock_actual IS NOT NULL AND NEW.stock_actual < 0 THEN
      RAISE EXCEPTION 'No se permite stock negativo en almacén. Producto: %, Almacén: %, Stock intentado: %', 
        NEW.producto_id, NEW.almacen_id, NEW.stock_actual;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION trigger_prevenir_stock_negativo IS 
'Previene stock negativo en productos y existencias. Corregido para usar columna stock (no stock_actual) en tabla productos.';
