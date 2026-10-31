import { NotFoundException } from '@nestjs/common';
import { lecturaFinancieraFallida } from '../finanzas-errors';

const pageSize = 1000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const fail = (): never => { throw lecturaFinancieraFallida('el historial completo de pagos'); };
function paymentAmount(value: unknown): number {
  if (!['string', 'number'].includes(typeof value) || value === '') return fail();
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100))
    || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) return fail();
  return amount;
}
function validDate(value: unknown): boolean {
  if (!text(value) || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return year > 0 && month >= 1 && month <= 12 && day >= 1
    && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
async function completeRows(query: () => any): Promise<any[]> {
  const rows: any[] = [];
  let total: number | null = null;
  for (let offset = 0; ; offset += pageSize) {
    let result: any;
    try { result = await query().range(offset, offset + pageSize - 1); } catch { return fail(); }
    if (!result || result.error || !Array.isArray(result.data) || !Number.isSafeInteger(result.count)
      || result.count < 0 || (total !== null && result.count !== total)) return fail();
    total = result.count;
    if (result.data.length !== Math.min(pageSize, total! - offset)) return fail();
    rows.push(...result.data);
    if (rows.length === total) return rows;
  }
}

export async function readCxpPaymentHistory(client: any, tenantId: string, accountId: string) {
  if (!uuid.test(tenantId) || !uuid.test(accountId)) throw new NotFoundException('Cuenta por pagar no encontrada');
  let parent: any;
  try {
    parent = await client.from('cuentas_por_pagar').select('id,tenant_id,moneda')
      .eq('tenant_id', tenantId).eq('id', accountId).maybeSingle();
  } catch { return fail(); }
  if (!parent || parent.error) return fail();
  if (parent.data === null) throw new NotFoundException('Cuenta por pagar no encontrada');
  const account = parent.data;
  if (account?.id !== accountId || account.tenant_id !== tenantId || !/^[A-Z]{3}$/.test(account.moneda || '')) return fail();
  const bankRows = await completeRows(() => client.from('movimientos_bancarios').select(`
    id,tenant_id,cxp_id,fecha,monto,tipo,descripcion,referencia,metodo_pago,conciliado,cuenta_bancaria_id,created_at,
    cuenta_bancaria:cuentas_bancarias!movimientos_bancarios_cuenta_bancaria_id_fkey(id,banco,numero_cuenta,tipo_cuenta,moneda)
  `, { count: 'exact' }).eq('tenant_id', tenantId).eq('cxp_id', accountId).eq('tipo', 'CARGO')
    .order('id', { ascending: true }));
  const cashRows = await completeRows(() => client.from('pagos_facturas')
    .select('id,tenant_id,cuenta_por_pagar_id,fecha_pago,monto,moneda,metodo_pago,referencia,estado,activo,created_at', { count: 'exact' })
    .eq('tenant_id', tenantId).eq('cuenta_por_pagar_id', accountId)
    .eq('metodo_pago', 'EFECTIVO').eq('estado', 'APLICADO').eq('activo', true).order('id', { ascending: true }));
  const ids = new Set<string>();
  const data = [...bankRows.map(row => {
    if (!row || row.tenant_id !== tenantId || row.cxp_id !== accountId || row.tipo !== 'CARGO'
      || !['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA'].includes(row.metodo_pago)
      || !validDate(row.fecha) || typeof row.conciliado !== 'boolean' || !uuid.test(row.cuenta_bancaria_id || '')
      || row.cuenta_bancaria?.id !== row.cuenta_bancaria_id || row.cuenta_bancaria.moneda !== account.moneda
      || !text(row.cuenta_bancaria.banco) || !text(row.cuenta_bancaria.numero_cuenta)) return fail();
    return { ...row, monto: paymentAmount(row.monto), moneda: account.moneda, cuenta_por_pagar_id: accountId, fuente: 'BANCO' };
  }), ...cashRows.map(row => {
    if (!row || row.tenant_id !== tenantId || row.cuenta_por_pagar_id !== accountId || row.moneda !== account.moneda
      || row.metodo_pago !== 'EFECTIVO' || row.estado !== 'APLICADO' || row.activo !== true || !validDate(row.fecha_pago)) return fail();
    return { ...row, monto: paymentAmount(row.monto), cxp_id: accountId, fecha: row.fecha_pago, cuenta_bancaria: null, conciliado: false, fuente: 'CAJA' };
  })];
  for (const row of data) {
    if (!uuid.test(row.id || '') || ids.has(row.id)) return fail();
    ids.add(row.id);
  }
  if (!Number.isSafeInteger(data.reduce((sum, row) => sum + Math.round(row.monto * 100), 0))) return fail();
  data.sort((left, right) => String(right.fecha).localeCompare(String(left.fecha))
    || String(right.created_at || '').localeCompare(String(left.created_at || '')) || left.id.localeCompare(right.id));
  return { success: true, tenant_id: tenantId, cuenta_por_pagar_id: accountId, moneda: account.moneda,
    total: data.length, data, fuentes_pagos: { complete: true, total: data.length,
      bank_total: bankRows.length, cash_total: cashRows.length, page_size: pageSize } };
}
