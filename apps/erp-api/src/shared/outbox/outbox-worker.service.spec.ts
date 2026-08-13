import { ACCOUNTING_EVENT_TYPES } from './accounting-event-types';
import { OutboxWorker } from './outbox-worker.service';

describe('OutboxWorker claim contract', () => {
  function buildWorker(claimed: any[] = []) {
    const publicRpc = jest.fn(async (name: string) => ({
      data: name === 'acquire_job_lock' ? true : true,
      error: null,
    }));
    const supabase = {
      getNetworkBackoffRemainingMs: jest.fn().mockReturnValue(0),
      getPublicClient: jest.fn().mockReturnValue({ rpc: publicRpc }),
    };
    const outboxService = {
      resetStuckEvents: jest.fn().mockResolvedValue(0),
      claimPendingEvents: jest.fn().mockResolvedValue(claimed),
      heartbeatEvent: jest.fn().mockResolvedValue(undefined),
      markEventCompleted: jest.fn().mockResolvedValue(undefined),
      markEventFailed: jest.fn().mockResolvedValue('failed'),
    };
    const eventBus = { emitAndAwait: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = { run: jest.fn(async (_ctx, callback) => callback()) };
    return {
      worker: new OutboxWorker(
        supabase as any, outboxService as any, eventBus as any, tenantContext as any,
      ),
      outboxService, eventBus, tenantContext,
    };
  }

  const emailClaim = {
    id: 'row-1', event_id: 'event-1', event_type: 'email.send',
    tenant_id: 'tenant-1', payload: { to: 'qa@example.test' },
    claim_token: 'claim-1', claimed_by: 'worker-1', created_at: new Date().toISOString(),
  };

  it('excluye en SQL los eventos cuyo propietario es contabilidad', async () => {
    const { worker, outboxService } = buildWorker();
    await worker.processPendingEvents();
    expect(outboxService.claimPendingEvents).toHaveBeenCalledWith(expect.objectContaining({
      excludedEventTypes: ACCOUNTING_EVENT_TYPES,
    }));
  });

  it('espera al listener de email antes de completar el claim', async () => {
    const { worker, outboxService, eventBus } = buildWorker([emailClaim]);
    await worker.processPendingEvents();
    expect(eventBus.emitAndAwait).toHaveBeenCalledWith(
      'email.send',
      expect.objectContaining({ outboxRowId: 'row-1', outboxClaimToken: 'claim-1' }),
      'outbox-worker',
    );
    expect(outboxService.heartbeatEvent).toHaveBeenCalledWith('row-1', 'claim-1');
    expect(outboxService.markEventCompleted).toHaveBeenCalledWith('row-1', 'claim-1');
  });

  it('falla el mismo claim cuando un listener rechaza', async () => {
    const { worker, outboxService, eventBus } = buildWorker([emailClaim]);
    eventBus.emitAndAwait.mockRejectedValueOnce(new Error('smtp down'));
    await worker.processPendingEvents();
    expect(outboxService.markEventCompleted).not.toHaveBeenCalled();
    expect(outboxService.markEventFailed).toHaveBeenCalledWith(
      'row-1', 'claim-1', 'smtp down',
    );
  });

  it('manual reporta sólo claims realmente cerrados', async () => {
    const { worker, eventBus } = buildWorker([emailClaim]);
    eventBus.emitAndAwait.mockRejectedValueOnce(new Error('smtp down'));
    await expect(worker.processPendingEventsManual()).resolves.toEqual({ processed: 0, failed: 1 });
  });
});
