import { OutboxService } from './outbox.service';

describe('OutboxService', () => {
  function buildService(status: string | null = null) {
    const rpc = jest.fn().mockResolvedValue({ error: null });
    const maybeSingle = jest.fn().mockResolvedValue({
      data: status ? { status } : null,
      error: null,
    });
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    const client = { rpc, from };
    const supabase = {
      getClient: jest.fn().mockReturnValue(client),
    };

    return {
      service: new OutboxService(supabase as any),
      rpc,
      from,
      select,
      eq,
      maybeSingle,
    };
  }

  it('no degrada eventos ya completados a fallidos', async () => {
    const { service, rpc } = buildService('completed');

    await service.markEventFailed('event-row-1', 'error tardio de listener');

    expect(rpc).not.toHaveBeenCalled();
  });

  it('marca como fallido un evento no completado', async () => {
    const { service, rpc } = buildService('processing');

    await service.markEventFailed('event-row-2', 'error real');

    expect(rpc).toHaveBeenCalledWith('mark_outbox_event_failed', {
      p_event_id: 'event-row-2',
      p_error_message: 'error real',
    });
  });
});
