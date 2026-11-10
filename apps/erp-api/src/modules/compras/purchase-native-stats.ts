import { ServiceUnavailableException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { readCompleteCatalog } from '../../shared/utils/complete-catalog-read';
import { fechaDeDocumentoEnPais, zonaHorariaDePais } from '../../shared/utils/fecha-peru.util';

const unavailable = () => new ServiceUnavailableException('No se pudo verificar el resumen de compras completo. Reintente la consulta.');
const Exact = Decimal.clone({ precision: 40 });
const amount = (value: unknown): Decimal => {
  if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') throw unavailable();
  const result = new Exact(value as string | number);
  if (!result.isFinite() || result.isNegative() || result.decimalPlaces() > 2 || result.gte('1000000000000')) throw unavailable();
  return result;
};

/** Original order amounts, grouped by currency; no inferred exchange rate. */
export async function readPurchaseStats(client: any, tenant: string) {
  const read = (table: string, fields: string, filter = (query: any) => query) => readCompleteCatalog(
    client, table, `id,tenant_id,${fields}`, query => filter(query.eq('tenant_id', tenant)), row => row.tenant_id === tenant,
  );
  const [orders, providers, config] = await Promise.all([
    read('ordenes_compra', 'total,moneda,estado,fecha_orden,created_at,fecha_entrega'),
    read('proveedores', 'activo', query => query.eq('activo', true)),
    read('empresa_config', 'pais'),
  ]);
  if (config.length !== 1 || !['PE', 'CO', 'AR'].includes(config[0].pais) || providers.some(row => row.activo !== true)) throw unavailable();
  const zone = zonaHorariaDePais(config[0].pais), now = new Date();
  const month = now.toLocaleDateString('en-CA', { timeZone: zone }).slice(0, 7);
  const groups = new Map<string, { total: Decimal; monthly: Decimal; count: number }>();
  let monthlyCount = 0;
  for (const row of orders) {
    if (typeof row.moneda !== 'string' || !/^[A-Z]{3}$/.test(row.moneda) || typeof row.estado !== 'string' || !row.estado) throw unavailable();
    const value = amount(row.total), day = fechaDeDocumentoEnPais(row.fecha_orden || row.created_at, zone);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw unavailable();
    const current = groups.get(row.moneda) ?? { total: new Exact(0), monthly: new Exact(0), count: 0 };
    current.total = current.total.plus(value);
    if (!['ANULADA', 'RECHAZADA'].includes(row.estado.toUpperCase()) && day.slice(0, 7) === month) {
      current.monthly = current.monthly.plus(value); current.count++; monthlyCount++;
    }
    if (current.total.gte('1000000000000') || current.monthly.gte('1000000000000')) throw unavailable();
    groups.set(row.moneda, current);
  }
  const active = ['BORRADOR', 'APROBACION', 'APROBADA', 'PARCIAL', 'PENDIENTE', 'ENTREGADO'];
  return {
    version: 2 as const, base: 'IMPORTES_ORIGINALES_SIN_CONVERSION' as const,
    porMoneda: [...groups.keys()].sort().map(moneda => ({ moneda, totalCompras: groups.get(moneda)!.total.toFixed(2), montoTotalMes: groups.get(moneda)!.monthly.toFixed(2), comprasDelMes: groups.get(moneda)!.count })),
    comprasDelMes: monthlyCount,
    ordenesActivas: orders.filter(row => active.includes(row.estado)).length,
    ordenesVencidas: orders.filter(row => row.estado === 'PENDIENTE' && row.fecha_entrega && new Date(row.fecha_entrega) < now).length,
    proveedoresActivos: providers.length,
  };
}
