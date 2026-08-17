import { OutboxService } from './outbox.service';

describe('OutboxService RPC contract 492', () => {
  function buildService(handler?: (name: string, params: any) => any) {
    const rpc = jest.fn(async (name: string, params: any) => {
      if (handler) return handler(name, params);
      return { data: true, error: null };
    });
    const client = { rpc, from: jest.fn() };
    const supabase = { getClient: jest.fn().mockReturnValue(client) };
    return { service: new OutboxService(supabase as any), rpc, client };
  }

  it('encola exclusivamente mediante enqueue_outbox_event_tx', async () => {
    const eventId = '2eb72434-6675-4f80-9ea1-3e0c0c05b847';
    const { service, rpc, client } = buildService((name) => ({
      data: name === 'enqueue_outbox_event_tx' ? { event_id: eventId } : null,
      error: null,
    }));

    await expect(service.persistEventStandard({
      tenantId: '9ece963a-50ea-4ccb-bc70-e402b859810e',
      eventType: 'qa.runtime',
      aggregateType: 'qa',
      aggregateId: '1',
      eventData: { ok: true },
    })).resolves.toBe(eventId);

    expect(rpc).toHaveBeenCalledWith('enqueue_outbox_event_tx', {
      p_event: expect.objectContaining({ event_type: 'qa.runtime', status: 'pending' }),
    });
    expect(client.from).not.toHaveBeenCalled();
  });

  it('reclama con propietario, tipos excluidos y token obligatorio', async () => {
    const row = {
      id: 'row-1', event_id: 'event-1', tenant_id: 'tenant-1',
      event_type: 'email.send', created_at: new Date().toISOString(),
      claim_token: 'claim-1', claimed_by: 'worker-1',
    };
    const { service, rpc } = buildService(() => ({ data: [row], error: null }));

    await expect(service.claimPendingEvents({
      worker: 'worker-1', limit: 7, excludedEventTypes: ['venta.procesada'],
    })).resolves.toEqual([row]);
    expect(rpc).toHaveBeenCalledWith('claim_outbox_events_tx', expect.objectContaining({
      p_worker: 'worker-1', p_limit: 7,
      p_excluded_event_types: ['venta.procesada'],
    }));
  });

  it('falla cerrado si el claim no devuelve token', async () => {
    const { service } = buildService(() => ({
      data: [{ id: 'row-1', tenant_id: 'tenant-1' }], error: null,
    }));
    await expect(service.claimPendingEvents({ worker: 'worker-1' }))
      .rejects.toThrow('claim incompleto');
  });

  it('envía p_error y el claim token exactos al fallar', async () => {
    const { service, rpc } = buildService(() => ({
      data: { updated: true, status: 'failed' }, error: null,
    }));

    await expect(service.markEventFailed('row-2', 'claim-2', 'error real', 3))
      .resolves.toBe('failed');
    expect(rpc).toHaveBeenCalledWith('fail_outbox_event_tx', {
      p_id: 'row-2', p_claim_token: 'claim-2', p_error: 'error real',
      p_next_retry_at: null, p_max_retries: 3,
    });
  });

  it('no reporta completed si SQL no reconoce el claim', async () => {
    const { service } = buildService(() => ({ data: false, error: null }));
    await expect(service.markEventCompleted('row-3', 'claim-perdido'))
      .rejects.toThrow('OUTBOX_CLAIM_LOST:row-3');
  });

  it('renueva sólo el claim exacto y falla si el token ya no es propietario', async () => {
    const { service, rpc } = buildService(() => ({ data: false, error: null }));

    await expect(service.heartbeatEvent('row-4', 'claim-vencido'))
      .rejects.toThrow('OUTBOX_CLAIM_LOST:row-4');
    expect(rpc).toHaveBeenCalledWith('heartbeat_outbox_event_tx', {
      p_id: 'row-4',
      p_claim_token: 'claim-vencido',
    });
  });
});
