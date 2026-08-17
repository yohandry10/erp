import { EventBusService } from './event-bus.service';

describe('EventBusService', () => {
  it('conserva el eventId fiscal de factura.emitida en el outbox contable', async () => {
    const outboxService = {
      persistEventStandard: jest.fn().mockResolvedValue('evt-cpe-1'),
    };
    const service = new EventBusService(outboxService as any);

    await service.emitFacturaEmitidaEvent({
      eventId: 'evt-cpe-1',
      tenantId: 'tenant-1',
      idempotencyKey: 'cpe-1',
      cpeId: 'cpe-1',
      facturaId: 'documento-1',
      serie: 'F001',
      numero: '1',
      clienteId: 'cliente-1',
      subtotal: 100,
      impuestos: 18,
      total: 118,
      moneda: 'PEN',
      fechaEmision: '2026-07-15',
      fechaVencimiento: '2026-08-14',
      source: 'cpe.api',
    });

    expect(outboxService.persistEventStandard).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        eventType: 'factura.emitida',
        eventId: 'evt-cpe-1',
        idempotencyKey: 'cpe-1',
      }),
    );
  });

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

  it('falla cerrado si un evento canónico no puede persistirse', async () => {
    const outboxService = {
      persistEventStandard: jest.fn().mockRejectedValue(new Error('outbox no disponible')),
    };
    const service = new EventBusService(outboxService as any);

    await expect(service.emit(
      'cobro.registrado',
      { eventId: 'cobro-1', idempotencyKey: 'cobro-1' },
      'finanzas',
      'tenant-1',
    )).rejects.toThrow('outbox no disponible');
  });

  it('no permite completar silenciosamente un evento outbox sin handler', async () => {
    const service = new EventBusService(undefined);

    await expect(service.emitAndAwait(
      'email.send',
      { outboxRowId: 'row-without-handler' },
      'outbox-worker',
    )).rejects.toThrow('OUTBOX_HANDLER_NOT_REGISTERED:email.send');
  });
});
