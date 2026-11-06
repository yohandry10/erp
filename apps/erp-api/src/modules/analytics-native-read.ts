import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { readCompleteCatalog } from '../shared/utils/complete-catalog-read';
import { fechaHoyEnPais } from '../shared/utils/fecha-peru.util';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#7c2d12'];
const STATES_WITHOUT_SALE = ['ANULADO', 'ANULADA', 'CANCELADO', 'CANCELADA', 'BORRADOR', 'RECHAZADO', 'ERROR'];
const fail = () => new ServiceUnavailableException('No se pudo verificar la lectura financiera completa. Reintente la consulta.');
const amount = (value: unknown): Decimal => {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') throw fail();
  const result = new Decimal(value as string | number);
  if (!result.isFinite() || result.decimalPlaces() > 2 || result.abs().gt(Number.MAX_SAFE_INTEGER / 100)) throw fail();
  return result;
};
const currency = (row: any): string => {
  if (typeof row.moneda !== 'string' || !/^[A-Z]{3}$/.test(row.moneda)) throw fail();
  return row.moneda;
};
const sum = (rows: any[], field: string) => rows.reduce((total, row) => total.plus(amount(row[field])), new Decimal(0)).toNumber();
const currencies = (...lists: any[][]): string[] => [...new Set(lists.flat().map(currency))].sort();
const envelope = (porMoneda: any[], empty: any) => ({ success: true, data: {
  version: 2, base: 'IMPORTES_ORIGINALES_SIN_CONVERSION', porMoneda,
  ...(porMoneda.length === 1 ? porMoneda[0] : porMoneda.length === 0 ? empty : {}),
} });

/** Lecturas nativas: ningún reductor suma importes de monedas distintas. */
export class AnalyticsNativeRead {
  constructor(private readonly client: any) {}

  private read(tenant: string, table: string, fields: string, filter: (query: any) => any = query => query): Promise<any[]> {
    return readCompleteCatalog(this.client, table, `id,tenant_id,${fields}`,
      query => filter(query.eq('tenant_id', tenant)), row => row.tenant_id === tenant);
  }

  private async country(tenant: string): Promise<{ country: string; book: string }> {
    const rows = await this.read(tenant, 'empresa_config', 'pais');
    const book = { PE: 'PEN', CO: 'COP', AR: 'ARS' };
    if (rows.length !== 1 || !Object.prototype.hasOwnProperty.call(book, rows[0].pais)) throw fail();
    return { country: rows[0].pais, book: book[rows[0].pais] };
  }

  range(filters: any = {}): { start: Date; end: Date } {
    const from = filters.fecha_desde ?? filters.fechaDesde;
    const to = filters.fecha_hasta ?? filters.fechaHasta;
    const parse = (value: unknown) => {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Fecha inválida. Use YYYY-MM-DD.');
      const date = new Date(`${value}T00:00:00.000Z`);
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException('Fecha inválida.');
      return date;
    };
    if (from || to) {
      if (!from || !to) throw new BadRequestException('Debe enviar fecha_desde y fecha_hasta juntas');
      const start = parse(from), end = parse(to);
      end.setUTCHours(23, 59, 59, 999);
      if (start > end) throw new BadRequestException('fecha_desde no puede ser mayor que fecha_hasta');
      return { start, end };
    }
    const days = { semanal: 7, mensual: 30, trimestral: 90, anual: 365 }[filters.periodo ?? 'mensual'];
    if (!days) throw new BadRequestException('Periodo inválido.');
    const end = new Date(), start = new Date(end);
    start.setUTCDate(start.getUTCDate() - days);
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCHours(23, 59, 59, 999);
    return { start, end };
  }

  private async documents(tenant: string, start: Date, end: Date) {
    const rows = await this.read(tenant, 'documentos', 'fecha_emision,total,moneda,tipo_documento,estado', query => query
      .in('tipo_documento', ['FACTURA', 'BOLETA']).not('estado', 'in', `(${STATES_WITHOUT_SALE.map(value => `"${value}"`).join(',')})`)
      .gte('fecha_emision', start.toISOString()).lte('fecha_emision', end.toISOString()));
    for (const row of rows) {
      currency(row); amount(row.total);
      if (!['FACTURA', 'BOLETA'].includes(row.tipo_documento) || !row.estado || STATES_WITHOUT_SALE.includes(row.estado) ||
          typeof row.fecha_emision !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(row.fecha_emision)) throw fail();
    }
    return rows;
  }

  async sales(tenant: string, filters: any = {}) {
    const { start, end } = this.range(filters);
    const previousEnd = new Date(start.getTime() - 1);
    const previousStart = new Date(start.getTime() - (end.getTime() - start.getTime() + 1));
    const [rows, previous] = await Promise.all([this.documents(tenant, start, end), this.documents(tenant, previousStart, previousEnd)]);
    const porMoneda = currencies(rows, previous).map(moneda => {
      const selected = rows.filter(row => row.moneda === moneda);
      const days = new Map<string, Decimal>();
      for (const row of selected) {
        const day = row.fecha_emision.slice(0, 10);
        days.set(day, (days.get(day) ?? new Decimal(0)).plus(amount(row.total)));
      }
      const labels = [...days.keys()].sort();
      const ventasActuales = sum(selected, 'total'), ventasAnterior = sum(previous.filter(row => row.moneda === moneda), 'total');
      return { moneda, labels, datasets: [{ label: `Ventas ${moneda}`, data: labels.map(day => days.get(day)!.toNumber()) }],
        totales: { ventasActuales, ventasAnterior, crecimiento: ventasAnterior > 0 ? `${((ventasActuales - ventasAnterior) / ventasAnterior * 100).toFixed(1)}%` : 'SIN DATOS' } };
    });
    return envelope(porMoneda, { labels: [], datasets: [], totales: { ventasActuales: 0, ventasAnterior: 0, crecimiento: 'SIN DATOS' } });
  }

  async debt(tenant: string, payable: boolean) {
    const [{ country }, rows] = await Promise.all([this.country(tenant), this.read(tenant, payable ? 'cuentas_por_pagar' : 'cuentas_por_cobrar', 'saldo,moneda,fecha_vencimiento')]);
    const today = Date.parse(`${fechaHoyEnPais(country)}T00:00:00Z`);
    const empty = () => ({ graficoEdadSaldos: { labels: ['Por vencer', '0-30 días', '31-60 días', '61-90 días', '90+ días'], data: [0, 0, 0, 0, 0], backgroundColor: COLORS },
      totales: { [payable ? 'totalPorPagar' : 'totalPorCobrar']: 0, vencido: 0, porcentajeVencido: 0 } });
    const porMoneda = currencies(rows).map(moneda => {
      const selected = rows.filter(row => row.moneda === moneda), result = empty();
      const amounts = Array.from({ length: 5 }, () => new Decimal(0));
      for (const row of selected) {
        const value = amount(row.saldo);
        if (value.isNegative()) throw fail();
        if (value.isZero()) continue;
        const due = typeof row.fecha_vencimiento === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.fecha_vencimiento) ? Date.parse(`${row.fecha_vencimiento}T00:00:00Z`) : NaN;
        if (!Number.isFinite(due) || new Date(due).toISOString().slice(0, 10) !== row.fecha_vencimiento) throw fail();
        const days = Math.floor((today - due) / 86400000);
        const index = days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
        amounts[index] = amounts[index].plus(value);
      }
      const total = sum(selected, 'saldo'), overdue = amounts.slice(1).reduce((a, b) => a.plus(b), new Decimal(0)).toNumber();
      result.graficoEdadSaldos.data = amounts.map(value => value.toNumber());
      result.totales = { [payable ? 'totalPorPagar' : 'totalPorCobrar']: total, vencido: overdue, porcentajeVencido: total > 0 ? Number((overdue / total * 100).toFixed(1)) : 0 };
      return { moneda, ...result };
    });
    return envelope(porMoneda, empty());
  }

  async categories(tenant: string, filters: any = {}) {
    const { start, end } = this.range(filters), docs = await this.documents(tenant, start, end);
    const byId = new Map(docs.map(row => [row.id, row]));
    // Leer completo evita truncar un IN grande o la segunda página de líneas.
    const details = docs.length ? (await this.read(tenant, 'documento_detalles', 'documento_id,producto_id,total_item')).filter(row => byId.has(row.documento_id)) : [];
    const products = details.length ? await this.read(tenant, 'productos', 'categoria') : [];
    const productById = new Map(products.map(row => [row.id, row.categoria]));
    const porMoneda = currencies(docs).map(moneda => {
      const groups = new Map<string, Decimal>();
      for (const row of details) {
        if (byId.get(row.documento_id)!.moneda !== moneda) continue;
        const category = row.producto_id ? productById.get(row.producto_id) : 'Sin categoría';
        if (row.producto_id && !productById.has(row.producto_id)) throw fail();
        const name = typeof category === 'string' && category ? category : 'Sin categoría';
        groups.set(name, (groups.get(name) ?? new Decimal(0)).plus(amount(row.total_item)));
      }
      return { moneda, graficoPie: { labels: [...groups.keys()], data: [...groups.values()].map(value => value.toNumber()), backgroundColor: COLORS } };
    });
    return envelope(porMoneda, { graficoPie: { labels: [], data: [], backgroundColor: [] } });
  }

  async kpis(tenant: string) {
    const { book } = await this.country(tenant);
    const { start, end } = this.range();
    const [docs, receivables, payables, banks] = await Promise.all([
      this.documents(tenant, start, end),
      this.read(tenant, 'cuentas_por_cobrar', 'saldo,moneda'), this.read(tenant, 'cuentas_por_pagar', 'saldo,moneda'),
      this.read(tenant, 'cuentas_bancarias', 'saldo,moneda', query => query.eq('activo', true)),
    ]);
    const unavailable = () => ({ success: true, data: { version: 2, moneda: book, disponible: false,
      motivo: 'Liquidez y rentabilidad requieren una valuación contable común. Hay importes en otras monedas; consulte los reportes contables.', liquidez: null, rentabilidad: null, crecimiento: null, eficiencia: null } });
    // Una exposición ya comprobada en divisa basta para impedir el ratio.
    // No se amplían permisos de gastos para fabricar un resultado alternativo.
    if (currencies(docs, receivables, payables, banks).some(unit => unit !== book)) return unavailable();
    const [expenses, products, details] = await Promise.all([
      this.read(tenant, 'gastos', 'monto,moneda', query => query.gte('fecha', start.toISOString()).lte('fecha', end.toISOString())),
      this.read(tenant, 'productos', 'stock_actual,costo', query => query.eq('activo', true)),
      this.read(tenant, 'documento_detalles', 'documento_id,producto_id,cantidad'),
    ]);
    if (currencies(expenses).some(unit => unit !== book)) return unavailable();
    const productById = new Map(products.map(row => [row.id, row]));
    const documentIds = new Set(docs.map(row => row.id));
    const quantity = (value: unknown) => { if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') throw fail(); const d = new Decimal(value as any); if (!d.isFinite()) throw fail(); return d; };
    const inventory = products.reduce((total, row) => total.plus(quantity(row.stock_actual).mul(amount(row.costo))), new Decimal(0));
    const sold = details.filter(row => documentIds.has(row.documento_id));
    const documentsWithLines = new Set(sold.map(row => row.documento_id));
    let costKnown = docs.every(row => documentsWithLines.has(row.id));
    const cost = sold.reduce((total, row) => {
      if (!row.producto_id) { costKnown = false; return total; }
      const product = productById.get(row.producto_id);
      if (!product) { costKnown = false; return total; }
      return total.plus(quantity(row.cantidad).mul(amount(product.costo)));
    }, new Decimal(0));
    const sales = sum(docs, 'total'), payable = sum(payables, 'saldo');
    const current = inventory.plus(sum(receivables, 'saldo')).plus(sum(banks, 'saldo'));
    const liquidity = payable > 0 ? current.div(payable).toDecimalPlaces(1).toNumber() : null;
    const margin = sales > 0 && costKnown ? new Decimal(sales).minus(cost).minus(sum(expenses, 'monto')).div(sales).mul(100).toDecimalPlaces(1).toNumber() : null;
    return { success: true, data: { version: 2, moneda: book, disponible: true,
      liquidez: { valor: liquidity, objetivo: 1.5, estado: liquidity === null ? 'NO APLICA' : liquidity >= 1.5 ? 'OK' : 'REVISAR' },
      rentabilidad: { valor: margin, objetivo: 15, estado: margin === null ? 'SIN DATOS' : margin >= 15 ? 'OK' : 'REVISAR' },
      crecimiento: { valor: null, estado: 'SIN DATOS' }, eficiencia: null } };
  }
}
