import { CxpEventsListener } from '../cxp-events.listener';
import { CxpService } from '../../cxp.service';
import { DevolucionProveedorEmitidaEvent, RecepcionRegistradaEvent } from '../../../../../shared/events/event-bus.service';

describe('CxpEventsListener', () => {
  const crearCuentaPorPagar = jest.fn();
  const aplicarDevolucionProveedorEmitida = jest.fn();
  const cxpService = { crearCuentaPorPagar, aplicarDevolucionProveedorEmitida } as unknown as CxpService;

  const onRecepcionRegistrada = jest.fn();
  const onDevolucionProveedorEmitida = jest.fn();
  const eventBus = { onRecepcionRegistrada, onDevolucionProveedorEmitida } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('no crea una CxP hasta que se registre la factura del proveedor', async () => {
    const listener = new CxpEventsListener(eventBus, cxpService);
    listener.onModuleInit();

    // Capturar el callback registrado
    expect(onRecepcionRegistrada).toHaveBeenCalledTimes(1);
    const callback = onRecepcionRegistrada.mock.calls[0][0];

    const recepcionEvent: RecepcionRegistradaEvent = {
      tenantId: 'tenant-1',
      eventId: 'evt-1',
      idempotencyKey: 'idem-1',
      recepcionId: 'rec-1',
      numeroRecepcion: 'REC-001',
      ordenId: 'oc-1',
      numeroOrden: 'OC-001',
      proveedorId: 'prov-1',
      proveedorNombre: 'Proveedor SA',
      proveedorRuc: '12345678901',
      fechaRecepcion: '2025-11-16',
      subtotal: 100,
      igv: 18,
      total: 118,
      subtotalParcial: 90,
      igvParcial: 16.2,
      totalParcial: 106.2,
      moneda: 'PEN',
      diasCredito: 30,
      condicionesPago: 'CREDITO_30',
      almacenId: 'alm-1',
      emittedAt: new Date().toISOString(),
      items: [],
      greProveedor: null,
    };

    await callback({ data: recepcionEvent });

    expect(crearCuentaPorPagar).not.toHaveBeenCalled();
  });

  it('aplica reversa en CxP cuando llega devolucion.proveedor.emitida', async () => {
    const listener = new CxpEventsListener(eventBus, cxpService);
    listener.onModuleInit();

    expect(onDevolucionProveedorEmitida).toHaveBeenCalledTimes(1);
    const callback = onDevolucionProveedorEmitida.mock.calls[0][0];

    const devolucionEvent: DevolucionProveedorEmitidaEvent = {
      devolucionId: 'dev-1',
      numeroDevolucion: 'DEV-001',
      ordenId: 'oc-1',
      recepcionId: 'rec-1',
      proveedorId: 'prov-1',
      proveedorNombre: 'Proveedor SA',
      fechaDevolucion: '2025-11-16',
      motivo: 'CANCELACION_OC',
      subtotal: 100,
      igv: 18,
      total: 118,
      moneda: 'USD',
      items: [],
      emitidoEn: new Date().toISOString(),
      tenantId: 'tenant-1',
      idempotencyKey: 'devolucion:tenant-1:dev-1',
    };

    await callback({ data: devolucionEvent });

    expect(aplicarDevolucionProveedorEmitida).toHaveBeenCalledWith('tenant-1', devolucionEvent);
  });
});
