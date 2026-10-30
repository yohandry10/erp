import { ServiceUnavailableException } from '@nestjs/common';
import { readCompleteCatalog } from '../../shared/utils/complete-catalog-read';

const knownId = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const quantity = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Number.isSafeInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < 0.000001;
const reference = (id: unknown, row: any, tenant: string): boolean => id === null ? row === null : knownId(id) && !!row && row.id === id && row.tenant_id === tenant;

/** Complete child sources, independently scoped to each bounded product-ID batch. */
export async function readProductSucursalSources(client: any, tenant: string, products: any[]) {
  const ids = products.map(p => p?.id);
  if (!knownId(tenant) || ids.some(id => !knownId(id)) || new Set(ids).size !== ids.length || products.some(p => p.tenant_id !== tenant)) {
    throw new ServiceUnavailableException('No se pudo confirmar el alcance de los productos.');
  }
  const prices: any[] = [], stocks: any[] = [];
  const sourceIds = { prices: new Set<string>(), stocks: new Set<string>() };
  const sourceKeys = { prices: new Set<string>(), stocks: new Set<string>() };
  for (let start = 0; start < ids.length; start += 100) {
    const batch = ids.slice(start, start + 100), allowed = new Set(batch);
    const belongs = (row: any) => row.tenant_id === tenant && allowed.has(row.producto_id) && typeof row.activo === 'boolean' && reference(row.sucursal_id, row.sucursal_scope, tenant);
    const [pagePrices, pageStocks] = await Promise.all([
      readCompleteCatalog(client, 'producto_precios_sucursal', '*,sucursal_scope:sucursales(id,tenant_id)', q => q.eq('tenant_id', tenant).in('producto_id', batch), row => belongs(row) && typeof row.moneda === 'string' && /^[A-Z]{3}$/.test(row.moneda) && quantity(row.precio) && row.precio >= 0),
      readCompleteCatalog(client, 'producto_stock_sucursal', '*,sucursal_scope:sucursales(id,tenant_id),almacen_scope:almacenes(id,tenant_id)', q => q.eq('tenant_id', tenant).in('producto_id', batch), row => belongs(row) && reference(row.almacen_id, row.almacen_scope, tenant) && [row.stock, row.stock_actual, row.reservado, row.minimo].every(quantity) && row.reservado >= 0 && row.minimo >= 0),
    ]);
    for (const [kind, rows, target] of [['prices', pagePrices, prices], ['stocks', pageStocks, stocks]] as const) {
      for (const row of rows) {
        const key = JSON.stringify(kind === 'prices' ? [row.producto_id, row.sucursal_id, row.moneda] : [row.producto_id, row.sucursal_id, row.almacen_id]);
        if (sourceIds[kind].has(row.id) || sourceKeys[kind].has(key)) throw new ServiceUnavailableException('Las fuentes de sucursal contienen identidades duplicadas.');
        sourceIds[kind].add(row.id); sourceKeys[kind].add(key);
        const { sucursal_scope: _branch, almacen_scope: _warehouse, ...data } = row;
        target.push(data);
      }
    }
  }
  const priceIndex = new Map<string, any[]>(), stockIndex = new Map<string, any[]>();
  for (const [rows, index] of [[prices, priceIndex], [stocks, stockIndex]] as const) {
    for (const row of rows) {
      if (!index.has(row.producto_id)) index.set(row.producto_id, []);
      index.get(row.producto_id)!.push(row);
    }
  }
  return {
    data: products.map(p => ({ ...p, precios_sucursal: priceIndex.get(p.id) || [], stock_sucursal: stockIndex.get(p.id) || [] })),
    sources: { completas: true, precios_total: prices.length, stock_total: stocks.length },
  };
}
