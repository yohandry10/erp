import { EventBusService } from './event-bus.service';

describe('EventBusService', () => {
  it('persiste stock.movimiento con eventId e idempotencyKey determinísticos', async () => {
    const outboxService = {
      persistEventStandard: jest.fn().mockResolvedValue('mov-1'),
    };
    const service = new EventBusService(outboxService as any);

    await service.emitMovimientoStock(
      {
        movimientoId: 'mov-1',
        productoId: 'prod-1',
        tipoMovimiento: 'ENTRADA',
        cantidad: 3,
        stockAnterior: 7,
        stockNuevo: 10,
        motivo: 'Recepción R001',
        valor: 150,
      },
      'tenant-1',
    );

    expect(outboxService.persistEventStandard).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        eventType: 'stock.movimiento',
        aggregateType: 'stock',
        aggregateId: 'mov-1',
        eventId: 'mov-1',
        idempotencyKey: 'stock.movimiento:tenant-1:mov-1',
        eventData: expect.objectContaining({
          tenantId: 'tenant-1',
          movimientoId: 'mov-1',
          eventId: 'mov-1',
          aggregateId: 'mov-1',
          idempotencyKey: 'stock.movimiento:tenant-1:mov-1',
        }),
      }),
    );
  });

  it('espera la persistencia outbox antes de resolver emitMovimientoStock', async () => {
    let resolverPersistencia: () => void = () => undefined;
    const outboxService = {
      persistEventStandard: jest.fn(
        () =>
          new Promise<string>((resolve) => {
            resolverPersistencia = () => resolve('mov-2');
          }),
      ),
    };
    const service = new EventBusService(outboxService as any);
    let finalizado = false;

    const promesa = service
      .emitMovimientoStock(
        {
          movimientoId: 'mov-2',
          tenantId: 'tenant-1',
          productoId: 'prod-1',
          tipoMovimiento: 'SALIDA',
          cantidad: 1,
          stockAnterior: 10,
          stockNuevo: 9,
          motivo: 'Venta',
          valor: 50,
        },
        'tenant-1',
      )
      .then(() => {
        finalizado = true;
      });

    await Promise.resolve();
    expect(finalizado).toBe(false);

    resolverPersistencia();
    await promesa;

    expect(finalizado).toBe(true);
  });
});
