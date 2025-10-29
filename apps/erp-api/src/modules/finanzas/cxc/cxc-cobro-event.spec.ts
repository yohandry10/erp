import { Test, TestingModule } from '@nestjs/testing';
import { CxcService } from './cxc.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { EventBusService } from '../../../shared/events/event-bus.service';

describe('CxcService - CobroRegistrado Event', () => {
  let service: CxcService;
  let supabaseService: SupabaseService;
  let eventBusService: EventBusService;
  let mockSupabaseClient: any;

  beforeEach(async () => {
    mockSupabaseClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      maybeSingle: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CxcService,
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn(() => mockSupabaseClient),
          },
        },
        {
          provide: EventBusService,
          useValue: {
            emitPagoFactura: jest.fn(),
            emitCobroRegistrado: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CxcService>(CxcService);
    supabaseService = module.get<SupabaseService>(SupabaseService);
    eventBusService = module.get<EventBusService>(EventBusService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registrarPago', () => {
    it('should emit CobroRegistrado event and insert into outbox when payment is registered', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const cuentaId = 'cxc-456';
      const userId = 'user-789';

      const cuentaMock = {
        id: cuentaId,
        tenant_id: tenantId,
        cliente_id: 'cliente-001',
        documento_id: 'doc-001',
        serie: 'F001',
        numero: '00001234',
        monto_total: 1000,
        monto_pendiente: 1000,
        moneda: 'PEN',
        estado: 'PENDIENTE',
        fecha_vencimiento: '2025-12-31',
        clientes: {
          razon_social: 'Cliente Test SAC',
        },
      };

      const pagoDto = {
        monto: 500,
        fecha_pago: '2025-10-26',
        metodo_pago: 'TRANSFERENCIA',
        referencia: 'REF-001',
        notas: 'Pago parcial',
      };

      const pagoRegistradoMock = {
        id: 'pago-001',
        tenant_id: tenantId,
        cuenta_id: cuentaId,
        monto: 500,
        moneda: 'PEN',
        fecha_pago: '2025-10-26',
        metodo_pago: 'TRANSFERENCIA',
        referencia: 'REF-001',
        notas: 'Pago parcial',
      };

      // Mock obtenerCuentaPorCobrar (called twice)
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: cuentaMock, error: null })
        .mockResolvedValueOnce({
          data: { ...cuentaMock, monto_pendiente: 500, estado: 'PARCIAL', pagos: [] },
          error: null,
        });

      // Mock insert pago
      const mockInsertPago = {
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: pagoRegistradoMock,
          error: null,
        }),
      };

      // Mock update cuenta (needs to chain two .eq() calls)
      const mockEq2 = jest.fn().mockResolvedValueOnce({ error: null });
      const mockEq1 = jest.fn().mockReturnValueOnce({ eq: mockEq2 });
      const mockUpdateCuenta = { eq: mockEq1 };

      // Setup mock chain
      mockSupabaseClient.insert
        .mockReturnValueOnce(mockInsertPago) // First insert for pago
        .mockResolvedValueOnce({ error: null }); // Second insert for outbox returns directly

      mockSupabaseClient.update.mockReturnValueOnce(mockUpdateCuenta);

      // Act
      await service.registrarPago(tenantId, cuentaId, pagoDto, userId);

      // Assert - Verify EventBus emission
      expect(eventBusService.emitCobroRegistrado).toHaveBeenCalledTimes(1);
      expect(eventBusService.emitCobroRegistrado).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          cobroId: 'pago-001',
          cxcId: cuentaId,
          clienteId: 'cliente-001',
          clienteNombre: 'Cliente Test SAC',
          documentoId: 'doc-001',
          numeroDocumento: 'F001-00001234',
          monto: 500,
          moneda: 'PEN',
          fecha: '2025-10-26',
          metodoPago: 'TRANSFERENCIA',
          referencia: 'REF-001',
          notas: 'Pago parcial',
          saldoAnterior: 1000,
          saldoNuevo: 500,
          estadoAnterior: 'PENDIENTE',
          estadoNuevo: 'PARCIAL',
          createdBy: userId,
        }),
      );

      // Assert - Verify outbox_events insertion (check that insert was called twice)
      expect(mockSupabaseClient.insert).toHaveBeenCalledTimes(2);
      // The second call should be for outbox_events
      expect(mockSupabaseClient.insert).toHaveBeenNthCalledWith(2,
        expect.objectContaining({
          event_type: 'CobroRegistrado',
          aggregate_type: 'CuentaPorCobrar',
          aggregate_id: cuentaId,
          event_data: expect.objectContaining({
            tenant_id: tenantId,
            cobro_id: 'pago-001',
            cxc_id: cuentaId,
            cliente_id: 'cliente-001',
            cliente_nombre: 'Cliente Test SAC',
            numero_documento: 'F001-00001234',
            monto: 500,
            moneda: 'PEN',
            metodo_pago: 'TRANSFERENCIA',
            referencia: 'REF-001',
            saldo_anterior: 1000,
            saldo_nuevo: 500,
            estado_anterior: 'PENDIENTE',
            estado_nuevo: 'PARCIAL',
          }),
          status: 'pending',
          retry_count: 0,
        }),
      );
    });

    it('should emit CobroRegistrado with CANCELADO state when fully paid', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const cuentaId = 'cxc-456';

      const cuentaMock = {
        id: cuentaId,
        tenant_id: tenantId,
        cliente_id: 'cliente-001',
        documento_id: 'doc-001',
        serie: 'F001',
        numero: '00001234',
        monto_total: 1000,
        monto_pendiente: 1000,
        moneda: 'PEN',
        estado: 'PENDIENTE',
        fecha_vencimiento: '2025-12-31',
        clientes: {
          razon_social: 'Cliente Test SAC',
        },
      };

      const pagoDto = {
        monto: 1000,
        fecha_pago: '2025-10-26',
        metodo_pago: 'EFECTIVO',
      };

      const pagoRegistradoMock = {
        id: 'pago-002',
        tenant_id: tenantId,
        cuenta_id: cuentaId,
        monto: 1000,
        moneda: 'PEN',
        fecha_pago: '2025-10-26',
        metodo_pago: 'EFECTIVO',
      };

      // Mock obtenerCuentaPorCobrar
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: cuentaMock, error: null })
        .mockResolvedValueOnce({
          data: { ...cuentaMock, monto_pendiente: 0, estado: 'CANCELADO', pagos: [] },
          error: null,
        });

      // Mock insert pago
      const mockInsertPago = {
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({
          data: pagoRegistradoMock,
          error: null,
        }),
      };

      // Mock update cuenta (needs to chain two .eq() calls)
      const mockEq2 = jest.fn().mockResolvedValueOnce({ error: null });
      const mockEq1 = jest.fn().mockReturnValueOnce({ eq: mockEq2 });
      const mockUpdateCuenta = { eq: mockEq1 };

      // Setup mock chain
      mockSupabaseClient.insert
        .mockReturnValueOnce(mockInsertPago)
        .mockResolvedValueOnce({ error: null }); // Second insert for outbox returns directly

      mockSupabaseClient.update.mockReturnValueOnce(mockUpdateCuenta);

      // Act
      await service.registrarPago(tenantId, cuentaId, pagoDto);

      // Assert - Verify EventBus emission
      expect(eventBusService.emitCobroRegistrado).toHaveBeenCalledWith(
        expect.objectContaining({
          estadoAnterior: 'PENDIENTE',
          estadoNuevo: 'CANCELADO',
          saldoAnterior: 1000,
          saldoNuevo: 0,
        }),
      );

      // Assert - Verify outbox_events insertion (check that insert was called twice)
      expect(mockSupabaseClient.insert).toHaveBeenCalledTimes(2);
      // The second call should be for outbox_events
      expect(mockSupabaseClient.insert).toHaveBeenNthCalledWith(2,
        expect.objectContaining({
          event_type: 'CobroRegistrado',
          aggregate_type: 'CuentaPorCobrar',
          status: 'pending',
        }),
      );
    });
  });
});
