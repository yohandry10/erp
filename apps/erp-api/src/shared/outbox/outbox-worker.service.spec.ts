import { OutboxWorker } from './outbox-worker.service';

describe('OutboxWorker', () => {
  function buildWorker(pendingEvents: any[]) {
    const updateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      lt: jest.fn().mockResolvedValue({ error: null, count: 0 }),
    };
    const supabase = {
      getNetworkBackoffRemainingMs: jest.fn().mockReturnValue(0),
      getPublicClient: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue(updateChain),
      }),
    };
    const outboxService = {
      getPendingEvents: jest.fn().mockResolvedValue(pendingEvents),
      markEventProcessing: jest.fn().mockResolvedValue(undefined),
      markEventCompleted: jest.fn().mockResolvedValue(undefined),
      markEventFailed: jest.fn().mockResolvedValue(undefined),
    };
    const eventBus = {
      emit: jest.fn().mockResolvedValue(undefined),
      emitAndAwait: jest.fn().mockResolvedValue(undefined),
    };
    const tenantContext = {
      run: jest.fn(async (_ctx, callback) => callback()),
    };

    return {
      worker: new OutboxWorker(
        supabase as any,
        outboxService as any,
        eventBus as any,
        tenantContext as any,
      ),
      outboxService,
      eventBus,
    };
  }

  it.each([
    'cxc.creada',
    'cpe.anulado',
    'factura.emitida',
    'factura.proveedor.registrada',
    'FacturaProveedorRegistrada',
  ])('deja %s al ContabilidadEventsListener para evitar carreras contables', async (eventType) => {
    const pendingEvent = {
      id: 'outbox-row-1',
      event_id: 'event-1',
      event_type: eventType,
      tenant_id: 'tenant-1',
      payload: { tenantId: 'tenant-1', eventId: 'source-event-1' },
      created_at: new Date().toISOString(),
    };
    const { worker, outboxService, eventBus } = buildWorker([pendingEvent]);

    await worker.processPendingEvents();

    expect(outboxService.markEventProcessing).not.toHaveBeenCalled();
    expect(outboxService.markEventCompleted).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('tambien reserva los eventos contables durante el procesamiento manual', async () => {
    const pendingEvent = {
      id: 'outbox-row-supplier-invoice',
      event_id: 'event-supplier-invoice',
      event_type: 'factura.proveedor.registrada',
      tenant_id: 'tenant-1',
      payload: { tenantId: 'tenant-1', numeroDocumento: 'F001-00000001' },
      created_at: new Date().toISOString(),
    };
    const { worker, outboxService, eventBus } = buildWorker([pendingEvent]);

    await expect(worker.processPendingEventsManual()).resolves.toEqual({ processed: 0, failed: 0 });

    expect(outboxService.markEventProcessing).not.toHaveBeenCalled();
    expect(outboxService.markEventCompleted).not.toHaveBeenCalled();
    expect(eventBus.emitAndAwait).not.toHaveBeenCalled();
  });

  it('reemite eventos no contables y los marca completados', async () => {
    const pendingEvent = {
      id: 'outbox-row-2',
      event_id: 'event-2',
      event_type: 'email.send',
      tenant_id: 'tenant-1',
      payload: { to: 'qa@example.test' },
      created_at: new Date().toISOString(),
    };
    const { worker, outboxService, eventBus } = buildWorker([pendingEvent]);

    await worker.processPendingEvents();

    expect(outboxService.markEventProcessing).toHaveBeenCalledWith('outbox-row-2');
    expect(eventBus.emit).toHaveBeenCalledWith('email.send', expect.objectContaining({
      to: 'qa@example.test',
    }), 'outbox-worker');
    expect(outboxService.markEventCompleted).not.toHaveBeenCalled();
  });
});
