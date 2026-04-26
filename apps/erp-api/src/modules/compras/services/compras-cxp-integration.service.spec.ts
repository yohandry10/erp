import { Test, TestingModule } from '@nestjs/testing';
import { ComprasCxpIntegrationService } from './compras-cxp-integration.service';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';

describe('ComprasCxpIntegrationService', () => {
  let service: ComprasCxpIntegrationService;
  let eventBus: jest.Mocked<EventBusService>;

  const mockSupabaseClient = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
  };

  beforeEach(async () => {
    eventBus = {
      onRecepcionRegistrada: jest.fn(),
      emitFacturaProveedorRegistrada: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComprasCxpIntegrationService,
        { provide: EventBusService, useValue: eventBus },
        { provide: SupabaseService, useValue: { getClient: () => mockSupabaseClient } },
        {
          provide: TaxCalculatorService,
          useValue: {
            calcularTotalesConAjustes: jest.fn().mockReturnValue({
              subtotal: 100,
              igv: 18,
              total: 118,
              ajustes: { retencion: 0, percepcion: 0, detraccion: 0, anticipo: 0 },
            }),
          },
        },
      ],
    }).compile();

    service = module.get(ComprasCxpIntegrationService);

    jest.clearAllMocks();
  });

  it('uses empresa_config.moneda_defecto when event has no moneda', async () => {
    const recepcionEvent: any = {
      tenantId: 'tenant-123',
      recepcionId: 'rec-1',
      numeroRecepcion: 'REC-001',
      fechaRecepcion: '2025-01-01',
      ordenId: 'oc-1',
      numeroOrden: 'OC-001',
      proveedorId: 'prov-1',
      condicionesPago: null,
      diasCredito: null,
      moneda: undefined,
      items: [
        { productoId: 'prod-1', cantidad: 1, precioUnitario: 100 },
      ],
    };

    // proveedores.single()
    mockSupabaseClient.single.mockResolvedValueOnce({
      data: { condiciones_pago: 'CONTADO', dias_credito: 0 },
      error: null,
    });

    // cuentas_por_pagar.insert().select().single()
    mockSupabaseClient.insert.mockReturnValueOnce({
      select: () => ({
        single: async () => ({ data: { id: 'cxp-1' }, error: null }),
      }),
    } as any);

    // Evitar ramas internas que dependen de DB real: stubs directos.
    jest.spyOn(service as any, 'calcularMontoRecepcionParcial').mockResolvedValue({
      subtotal: 100,
      igv: 18,
      total: 118,
    });
    jest.spyOn(service as any, 'calcularDiscrepanciasRecepcion').mockResolvedValue({
      estado: 'OK',
      discrepancias: [],
    });
    jest.spyOn(service as any, 'generarNumeroCxp').mockResolvedValue('CXP-001');
    jest.spyOn(service as any, 'esRecepcionParcial').mockResolvedValue(false);

    await (service as any).crearCuentaPorPagar(recepcionEvent, { moneda_defecto: 'USD' });

    expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
      expect.objectContaining({ moneda: 'USD' }),
    );
    expect(eventBus.emitFacturaProveedorRegistrada).toHaveBeenCalledWith(
      expect.objectContaining({ moneda: 'USD' }),
    );
  });
});

