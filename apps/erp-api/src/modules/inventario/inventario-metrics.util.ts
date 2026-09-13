import Decimal from 'decimal.js';

export interface InventarioMetrics {
  totalProductos: number;
  valorInventario: number;
  productosStockBajo: number;
}

type ProductoInventarioMetric = {
  precio_compra?: unknown;
  costo?: unknown;
  stock_actual?: unknown;
  stock_minimo?: unknown;
};

function decimalSeguro(value: unknown): Decimal {
  try {
    const decimal = new Decimal(value == null || value === '' ? 0 : value as Decimal.Value);
    return decimal.isFinite() ? decimal : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

/**
 * Contrato compartido por Inventario y Dashboard para no presentar dos cifras
 * distintas sobre el mismo catálogo activo. La valorización es a costo: el
 * precio de venta no representa el valor del stock mantenido por la empresa.
 */
export function calcularMetricasInventario(
  productos: ProductoInventarioMetric[] | null | undefined,
): InventarioMetrics {
  const filas = Array.isArray(productos) ? productos : [];

  const valorInventario = filas.reduce((total, producto) => {
    const precioCompra = decimalSeguro(producto.precio_compra);
    const costo = precioCompra.isZero()
      ? decimalSeguro(producto.costo)
      : precioCompra;
    return total.plus(costo.times(decimalSeguro(producto.stock_actual)));
  }, new Decimal(0));

  const productosStockBajo = filas.filter((producto) =>
    decimalSeguro(producto.stock_actual).lessThanOrEqualTo(
      decimalSeguro(producto.stock_minimo),
    ),
  ).length;

  return {
    totalProductos: filas.length,
    valorInventario: valorInventario.toDecimalPlaces(2).toNumber(),
    productosStockBajo,
  };
}
