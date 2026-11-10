import fs from 'node:fs';
import path from 'node:path';
import { ContabilidadEventsListener } from './contabilidad-events.listener';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';

// Four journal proofs captured by the real SQL verifier inside ROLLBACK.
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'receipt-valuation.fixture.json'), 'utf8'));
const claim = '61700000-0000-4000-8000-000000000001';
const tenant = '61700000-0000-4000-8000-000000000002';
function build(f = fixtures[0]) {
  const proof = JSON.parse(JSON.stringify(f.proof));
  const rpc = jest.fn().mockResolvedValue({ data: proof, error: null });
  const generator = { marcarEventoComoProcesado: jest.fn(), marcarEventoComoFallido: jest.fn(), generarAsientoRecepcion: jest.fn() };
  const listener = new ContabilidadEventsListener(generator as any, {} as any, {} as any,
    { getClient: () => ({ rpc }) } as any, new TenantContextService(), {} as any);
  const event = { id: claim, event_id: proof.event_id, claim_token: claim, event_type: 'recepcion.registrada', retry_count: 0,
    event_data: { tenantId: tenant, recepcionId: proof.recepcion_id, moneda: 'USD', subtotalParcial: 5.17 } };
  return { proof, rpc, generator, event, process: () => (listener as any).procesarEvento(event) };
}
describe('Recepción: conversión y asiento con autoridad durable', () => {
  it.each(fixtures)('confirma el asiento SQL de $kind con la conversión del origen', async f => {
    const s = build(f); await s.process();
    expect(s.rpc).toHaveBeenCalledTimes(1);
    expect(s.rpc).toHaveBeenCalledWith('contabilizar_recepcion_617', { p_tenant_id: tenant, p_event_id: f.proof.event_id, p_claim_token: claim });
    expect(s.generator.generarAsientoRecepcion).not.toHaveBeenCalled();
    expect(s.generator.marcarEventoComoProcesado).toHaveBeenCalledWith(f.proof.event_id);
  });
  const invalid: [string, (p: any) => void][] = [
    ['nominal USD presentado como PEN', p => { p.total_debe = p.total_haber = '5.17'; }],
    ['sin valuación', p => { delete p.valuacion; }],
    ['evento ajeno', p => { p.event_id = claim; }],
    ['recepción ajena', p => { p.recepcion_id = claim; }],
    ['sin asiento', p => { delete p.asiento_id; }],
    ['importe incompleto', p => { p.total_debe = 19.13; }],
    ['sin tasa', p => { delete p.valuacion.tipo_cambio; }],
    ['tasa cero', p => { p.valuacion.tipo_cambio = '0'; }],
    ['moneda del origen cambiada', p => { p.valuacion.moneda = 'PEN'; }],
    ['paridad de moneda local inválida', p => { p.valuacion.moneda_base = 'USD'; }],
    ['legacy FX sin snapshot', p => { p.valuacion.version = 444; }],
    ['clasificación descuadrada', p => { p.valuacion.mercaderia = '0.01'; }],
    ['subtotal distinto', p => { p.valuacion.subtotal_origen = '5.16'; }],
    ['cache', p => { p.cached = true; }],
    ['cola', p => { p.queued = true; }],
    ['cero contradictorio', p => { p.no_monetary_effect = true; }],
  ];
  it.each(invalid)('no completa ante %s', async (_name, mutate) => {
    const s = build();mutate(s.proof);
    await expect(s.process()).rejects.toThrow();
    expect(s.generator.marcarEventoComoProcesado).not.toHaveBeenCalled();
    expect(s.generator.generarAsientoRecepcion).not.toHaveBeenCalled();
  });
  it.each(['RECEIPT_HISTORICAL_FX_UNVERIFIABLE', 'RECEIPT_ORIGINAL_JOURNAL_LINES_MISMATCH', 'RECEIPT_ACCOUNTING_CLAIM_INVALID'])('conserva el fallo SQL %s sin fallback nominal', async message => {
    const s = build();s.rpc.mockResolvedValueOnce({ data: null, error: { message } });
    await expect(s.process()).rejects.toThrow(message);
    expect(s.generator.marcarEventoComoProcesado).not.toHaveBeenCalled();
    expect(s.generator.generarAsientoRecepcion).not.toHaveBeenCalled();
  });
  it('sin claim no consulta ni confirma', async () => {
    const s = build();s.event.claim_token = '';
    await expect(s.process()).rejects.toThrow('identidad y claim');
    expect(s.rpc).not.toHaveBeenCalled();
  });
});
