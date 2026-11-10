import fs from 'node:fs';
import path from 'node:path';
import { ContabilidadEventsListener } from './contabilidad-events.listener';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';
import { ACCOUNTING_EVENT_TYPES } from '../../../shared/outbox/accounting-event-types';

// SQL proofs captured with real claims in verify615, then transaction rollback.
// Identity and receipt values are synthetic; the RPC boundary is substituted.
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'receipt-accounting.fixture.json'), 'utf8'));
const clone = (value: any) => JSON.parse(JSON.stringify(value));
const claim = '61500000-0000-4000-8000-000000000001';
const other = '61500000-0000-4000-8000-000000000002';
function build(f: any) {
  const context = new TenantContextService();
  const rpc = jest.fn().mockResolvedValue({ data: f.proof, error: null });
  const generator = { marcarEventoComoProcesado: jest.fn(), marcarEventoComoFallido: jest.fn(), generarAsientoRecepcion: jest.fn() };
  const listener = new ContabilidadEventsListener(generator as any, {} as any, {} as any,
    { getClient: () => ({ rpc }) } as any, context, {} as any);
  const event = { id: other, event_id: f.eventData.eventId, event_type: f.eventType, event_data: clone(f.eventData),
    claim_token: claim, claimed_by: 'verify615-worker', retry_count: 0 };
  return { listener, rpc, generator, context, event, process: () => (listener as any).procesarEvento(event) };
}

describe('Contabilidad de recepción y reversa ligada al origen', () => {
  it('conserva la propiedad del worker contable para el evento inverso', () => {
    expect(ACCOUNTING_EVENT_TYPES).toContain('recepcion.revertida');
  });
  it.each(fixtures)('acepta la prueba SQL $name y confirma sólo ese evento', async f => {
    const s = build(f); await s.process();
    expect(s.rpc).toHaveBeenCalledWith(f.name === 'original-zero' ? 'verificar_recepcion_sin_efecto_615' : 'contabilizar_reversa_recepcion_615', {
      p_tenant_id: f.eventData.tenantId, p_event_id: f.eventData.eventId, p_claim_token: claim,
    });
    expect(s.generator.marcarEventoComoProcesado).toHaveBeenCalledWith(f.eventData.eventId);
    expect(s.generator.marcarEventoComoProcesado).toHaveBeenCalledTimes(1);
    expect(s.generator.marcarEventoComoFallido).not.toHaveBeenCalled();
    expect(s.generator.generarAsientoRecepcion).not.toHaveBeenCalled();
  });
  const mutations: [string, (p: any) => void][] = [
    ['evento ajeno', p => { p.event_id = other; }],
    ['recepción ajena', p => { p.recepcion_id = other; }],
    ['reversa ajena', p => { p.reversa_id = other; }],
    ['evento original distinto', p => { p.original_event_id = other; }],
    ['success falso', p => { p.success = false; }],
    ['cache', p => { p.from_cache = true; }],
    ['en cola', p => { p.queued = true; }],
    ['sin prueba de efecto', p => { delete p.no_monetary_effect; }],
    ['asiento ausente', p => { delete p.asiento_id; }],
    ['asiento original ausente', p => { delete p.original_asiento_id; }],
    ['misma identidad de asiento', p => { p.asiento_id = p.original_asiento_id; }],
    ['importes numéricos sin contrato decimal', p => { p.total_debe = Number(p.total_debe); }],
    ['contraasiento cero inventado', p => { p.total_debe = '0.00'; p.total_haber = '0.00'; }],
    ['descuadre', p => { p.total_haber = '0.01'; }],
    ['sin efecto contradictorio', p => { p.no_monetary_effect = true; }],
  ];
  it.each(mutations)('no completa ante %s', async (_name, mutate) => {
    const f = clone(fixtures.find((x: any) => x.name === 'valued')); mutate(f.proof);
    const s = build(f); await expect(s.process()).rejects.toThrow();
    expect(s.generator.marcarEventoComoProcesado).not.toHaveBeenCalled();
    expect(s.generator.marcarEventoComoFallido).toHaveBeenCalledTimes(1); expect(s.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(['zero', 'original-zero'])('no inventa un asiento para %s ni acepta una prueba parcial', async name => {
    for (const mutate of [(p: any) => { p.asiento_id = other; }, (p: any) => { p.total_debe = '0.00'; },
      (p: any) => { delete p.recepcion_id; }, (p: any) => { p.cached = true; }]) {
      const f = clone(fixtures.find((x: any) => x.name === name)); mutate(f.proof);
      const s = build(f); await expect(s.process()).rejects.toThrow(); expect(s.generator.marcarEventoComoProcesado).not.toHaveBeenCalled();
      expect(s.generator.generarAsientoRecepcion).not.toHaveBeenCalled();
    }
  });
  it.each(fixtures)('claim ausente no consulta ni confirma $name', async f => {
    const s = build(f); s.event.claim_token = '';
    await expect(s.process()).rejects.toThrow(); expect(s.rpc).not.toHaveBeenCalled(); expect(s.generator.marcarEventoComoProcesado).not.toHaveBeenCalled();
  });
  it('el origen pendiente se reintenta con la misma identidad sin volver a mover stock', async () => {
    const f = fixtures.find((x: any) => x.name === 'valued'), s = build(f);
    s.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0002', message: 'RECEIPT_ORIGINAL_JOURNAL_PENDING' } });
    await expect(s.process()).rejects.toThrow('RECEIPT_ORIGINAL_JOURNAL_PENDING');
    expect(s.generator.marcarEventoComoProcesado).not.toHaveBeenCalled();
    expect(s.generator.marcarEventoComoFallido).toHaveBeenCalledWith(f.eventData.eventId, expect.stringContaining('Se reintentará'));
    await s.process(); expect(s.generator.marcarEventoComoProcesado).toHaveBeenCalledTimes(1);
    expect(s.rpc.mock.calls.map(([name]) => name)).toEqual(['contabilizar_reversa_recepcion_615', 'contabilizar_reversa_recepcion_615']);
    expect(s.rpc.mock.calls[0][1]).toEqual(s.rpc.mock.calls[1][1]);
  });
  it('no confirma tras una pérdida de transporte', async () => {
    const s = build(fixtures.find((x: any) => x.name === 'valued')); s.rpc.mockRejectedValueOnce(new Error('Controlled network loss'));
    await expect(s.process()).rejects.toThrow('Controlled network loss'); expect(s.rpc).toHaveBeenCalledTimes(1);
    expect(s.generator.marcarEventoComoProcesado).not.toHaveBeenCalled();
  });
});
