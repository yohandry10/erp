import { ContabilidadEventsListener } from './contabilidad-events.listener';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';
import { ACCOUNTING_EVENT_TYPES } from '../../../shared/outbox/accounting-event-types';

const tenant = '62000000-0000-4000-8000-000000000001';
const eventId = '62000000-0000-4000-8000-000000000002';
const cxpId = '62000000-0000-4000-8000-000000000003';
const claim = '62000000-0000-4000-8000-000000000004';
const proof = () => ({
  success: true, event_id: eventId, cxp_id: cxpId,
  original_event_id: '62000000-0000-4000-8000-000000000005',
  asiento_id: '62000000-0000-4000-8000-000000000006',
  original_asiento_id: '62000000-0000-4000-8000-000000000007',
  total_debe: '23.60', total_haber: '23.60', idempotent: false,
});

function build(data: any = proof(), error: any = null) {
  const rpc = jest.fn().mockResolvedValue({ data, error });
  const generator = { marcarEventoComoProcesado: jest.fn(), marcarEventoComoFallido: jest.fn() };
  const listener = new ContabilidadEventsListener(generator as any, {} as any, {} as any,
    { getClient: () => ({ rpc }) } as any, new TenantContextService(), {} as any);
  const event = { id: 'row', event_id: eventId, event_type: 'cxp.anulada', claim_token: claim, retry_count: 0,
    event_data: { tenantId: tenant, cxpId, eventId, accountingHandledByOutbox: true } };
  return { rpc, generator, event, process: () => (listener as any).procesarEvento(event) };
}

describe('Contabilidad de la anulación de CxP', () => {
  it('pertenece al worker contable', () => {
    expect(ACCOUNTING_EVENT_TYPES).toContain('cxp.anulada');
  });

  it('contabiliza en la base con el claim y confirma sólo con una prueba completa', async () => {
    const s = build();
    await s.process();
    expect(s.rpc).toHaveBeenCalledWith('contabilizar_anulacion_cxp_620', {
      p_tenant_id: tenant, p_event_id: eventId, p_claim_token: claim,
    });
    expect(s.generator.marcarEventoComoProcesado).toHaveBeenCalledWith(eventId);
    expect(s.generator.marcarEventoComoFallido).not.toHaveBeenCalled();
  });

  const mutations: [string, (p: any) => void][] = [
    ['evento ajeno', p => { p.event_id = cxpId; }],
    ['CxP ajena', p => { p.cxp_id = eventId; }],
    ['success falso', p => { p.success = false; }],
    ['sin asiento', p => { delete p.asiento_id; }],
    ['misma identidad de asiento', p => { p.asiento_id = p.original_asiento_id; }],
    ['importe numérico', p => { p.total_debe = 23.6; }],
    ['contraasiento cero', p => { p.total_debe = '0.00'; p.total_haber = '0.00'; }],
    ['descuadre', p => { p.total_haber = '23.61'; }],
    ['sin marca de idempotencia', p => { delete p.idempotent; }],
  ];
  it.each(mutations)('no completa ante %s', async (_name, mutate) => {
    const data = proof(); mutate(data);
    const s = build(data);
    await expect(s.process()).rejects.toThrow();
    expect(s.generator.marcarEventoComoProcesado).not.toHaveBeenCalled();
    expect(s.generator.marcarEventoComoFallido).toHaveBeenCalledTimes(1);
  });

  it('sin claim no consulta ni confirma', async () => {
    const s = build(); s.event.claim_token = '';
    await expect(s.process()).rejects.toThrow();
    expect(s.rpc).not.toHaveBeenCalled();
    expect(s.generator.marcarEventoComoProcesado).not.toHaveBeenCalled();
  });

  it('el asiento de la factura pendiente se reintenta con la misma identidad', async () => {
    const s = build();
    s.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0002', message: 'CXP_ORIGINAL_JOURNAL_PENDING' } });
    await expect(s.process()).rejects.toThrow('CXP_ORIGINAL_JOURNAL_PENDING');
    expect(s.generator.marcarEventoComoProcesado).not.toHaveBeenCalled();
    await s.process();
    expect(s.generator.marcarEventoComoProcesado).toHaveBeenCalledTimes(1);
  });
});
