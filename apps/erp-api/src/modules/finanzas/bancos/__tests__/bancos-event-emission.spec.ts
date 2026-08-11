import { BancosService } from '../bancos.service';

describe('BancosService - outbox durable 457', () => {
  it('no escribe ni emite eventos desde Node: la RPC posee movimiento, saldo y outbox', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { movimiento_id: 'mov-1', event_id: 'event-1' }, error: null,
    });
    const from = jest.fn();
    const service = new BancosService({ getClient: () => ({ rpc, from }) } as any);
    await service.registrarMovimientoBancarioAtomico('tenant', {
      cuenta_bancaria_id: '11111111-1111-4111-8111-111111111111',
      cuenta_contrapartida_id: '22222222-2222-4222-8222-222222222222',
      tipo: 'ABONO',
      monto: 100,
      moneda: 'PEN',
      fecha: '2026-08-09',
      descripcion: 'Aporte',
      categoria: 'APORTE_CAPITAL',
      idempotency_key: 'bank-movement-1',
    }, 'actor');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
    expect((service as any).eventBus).toBeUndefined();
  });
});
