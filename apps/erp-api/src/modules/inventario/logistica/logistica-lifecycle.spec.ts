import { LogisticaService } from './logistica.service';

describe('Logística transaccional', () => {
  const setup = (reply: unknown = { data: { success: true }, error: null }) => {
    const rpc = jest.fn().mockResolvedValue(reply);
    const from = jest.fn(() => { throw new Error('No debe escribir directamente'); });
    const service = new LogisticaService({ getClient: () => ({ rpc, from }) } as any,
      { createNotification: jest.fn().mockResolvedValue(undefined) } as any, {} as any, {} as any);
    return { service, rpc, from };
  };

  it('confirma preparación y packing por RPC separando la clave del payload', async () => {
    const { service, rpc, from } = setup();
    const dto = { idempotency_key: 'picking-retry-1', items_preparados: ['linea'] };
    await service.prepararPedido('pedido', 'tenant', dto, 'actor');
    await service.marcarListoDespacho('pedido', 'tenant', 'actor', { idempotency_key: 'packing-retry-1' });
    expect(rpc).toHaveBeenNthCalledWith(1, 'operar_logistica_tx', {
      p_tenant_id: 'tenant', p_pedido_id: 'pedido', p_actor_id: 'actor',
      p_accion: 'PREPARAR', p_payload: { items_preparados: ['linea'] }, p_idempotency_key: 'picking-retry-1',
    });
    expect(rpc.mock.calls[1][1].p_accion).toBe('LISTO');
    expect(from).not.toHaveBeenCalled();
  });

  it('rechaza actor ausente antes de contactar la base', async () => {
    const { service, rpc } = setup();
    await expect(service.prepararPedido('pedido', 'tenant', { idempotency_key: 'intent-123' }))
      .rejects.toThrow('actor');
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([{ data: null, error: { message: 'LOGISTICS_IDEMPOTENCY_CONFLICT' } },
    { data: {}, error: null }, { data: { success: false }, error: null }])(
    'no anuncia éxito con fallo o respuesta incompleta: %j', async reply => {
      const { service } = setup(reply);
      await expect(service.actualizarTracking('pedido', 'tenant', {
        idempotency_key: 'tracking-123', estado: 'ENTREGADO',
      }, 'actor')).rejects.toThrow();
    });
});
