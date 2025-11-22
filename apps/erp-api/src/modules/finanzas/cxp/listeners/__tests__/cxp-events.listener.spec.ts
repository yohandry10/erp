import { CxpEventsListener } from '../cxp-events.listener';
import { CxpService } from '../../cxp.service';
import { RecepcionRegistradaEvent } from '../../../../../shared/events/event-bus.service';

describe('CxpEventsListener', () => {
  const crearCuentaPorPagar = jest.fn();
  const cxpService = { crearCuentaPorPagar } as unknown as CxpService;

  const onRecepcionRegistrada = jest.fn();
  const eventBus = { onRecepcionRegistrada } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('crea una CxP cuando llega recepcion.registrada', async () => {
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

    expect(crearCuentaPorPagar).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        proveedor_id: 'prov-1',
        orden_id: 'oc-1',
        recepcion_id: 'rec-1',
        numero_documento: 'REC-001',
        subtotal: 90,
        igv: 16.2,
        total: 106.2,
        idempotency_key: 'idem-1',
      }),
      null,
    );
  });
});
