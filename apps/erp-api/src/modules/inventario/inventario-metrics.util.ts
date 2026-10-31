import Decimal from 'decimal.js';
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';

export interface InventarioMetrics {
  totalProductos: number;
  valorInventario: number;
  productosStockBajo: number;
}

type ProductoInventarioMetric = {
  precio_compra?: unknown;
  costo?: unknown;
  costo_promedio_base?: unknown;
  stock_actual?: unknown;
  stock_minimo?: unknown;
  es_servicio?: boolean;
  controla_stock?: boolean;
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
  pais = 'PE',
): InventarioMetrics {
  const filas = Array.isArray(productos) ? productos : [];

  const valorInventario = filas.reduce((total, producto) => {
    if (pais === 'PE' && (producto.es_servicio === true || producto.controla_stock === false)) return total;
    const precioCompra = decimalSeguro(producto.precio_compra);
    let costo: Decimal;
    if (pais === 'PE') {
      try {
        if (producto.costo_promedio_base == null && !decimalSeguro(producto.stock_actual).isZero()) {
          throw new Error('existencias sin valorización confirmada');
        }
        const valorCosto = producto.costo_promedio_base ?? producto.costo;
        if (valorCosto == null || valorCosto === '') throw new Error('costo ausente');
        costo = new Decimal(valorCosto as Decimal.Value);
        if (!costo.isFinite() || costo.isNegative()) throw new Error('costo inválido');
      } catch {
        if (!decimalSeguro(producto.stock_actual).isZero()) {
          throw new ConflictException('El inventario contiene existencias sin costo verificado; regularice la valorización');
        }
        costo = new Decimal(0);
      }
    } else {
      costo = precioCompra.isZero() ? decimalSeguro(producto.costo) : precioCompra;
    }
    return total.plus(costo.times(decimalSeguro(producto.stock_actual)));
  }, new Decimal(0));

  const productosStockBajo = filas.filter((producto) =>
    !(pais === 'PE' && (producto.es_servicio === true || producto.controla_stock === false))
    && decimalSeguro(producto.stock_actual).lessThanOrEqualTo(
      decimalSeguro(producto.stock_minimo),
    ),
  ).length;

  return {
    totalProductos: filas.length,
    valorInventario: valorInventario.toDecimalPlaces(2).toNumber(),
    productosStockBajo,
  };
}

/** El país determina la política de costo; una lectura fallida no presupone Perú. */
export async function obtenerPaisMetricasInventario(client: any, tenantId: string): Promise<string> {
  try {
    const { data, error } = await client.from('empresa_config').select('pais')
      .eq('tenant_id', tenantId).maybeSingle();
    const pais = String(data?.pais || '').trim().toUpperCase();
    if (error || !pais) throw new Error('país no disponible');
    return pais;
  } catch {
    throw new ServiceUnavailableException('No se pudo verificar el país para valorizar el inventario; reintente');
  }
}
