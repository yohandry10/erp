import { Test, TestingModule } from '@nestjs/testing';
import { CxpService } from './cxp.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { RetencionesValidationService } from '../shared/retenciones-validation.service';

describe('CxpService - PagoProveedorRegistrado Event Emission', () => {
  let service: CxpService;
  let eventBusService: EventBusService;
  let supabaseService: SupabaseService;

  const mockSupabaseClient = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
    maybeSingle: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CxpService,
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn(() => mockSupabaseClient),
          },
        },
        {
          provide: EventBusService,
          useValue: {
            emitPagoProveedorRegistrado: jest.fn(),
            emitFacturaProveedorRegistrada: jest.fn(),
          },
        },
        {
          provide: RetencionesValidationService,
          useValue: {
            obtenerConfiguracionEmpresa: jest.fn().mockResolvedValue({}),
            validarCalculoAjustes: jest.fn().mockResolvedValue({ valido: true, errores: [] }),
            validarMontoPendiente: jest.fn().mockReturnValue({ valido: true, montoEsperado: 0 }),
          },
        },
      ],
    }).compile();

    service = module.get<CxpService>(CxpService);
    eventBusService = module.get<EventBusService>(EventBusService);
    supabaseService = module.get<SupabaseService>(SupabaseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('aplicarPago', () => {
    it('should emit PagoProveedorRegistrado event when payment is applied successfully', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const cxpId = 'cxp-456';
      const userId = 'user-789';
      
      const mockCxp = {
        id: cxpId,
        estado: 'PENDIENTE',
        saldo: 1000,
        total: 1000,
        moneda: 'PEN',
        proveedor_id: 'prov-001',
        numero_documento: 'F001-00001',
      };

      const mockCuentaBancaria = {
        id: 'cuenta-001',
        nombre: 'Cuenta BCP',
        saldo: 5000,
        moneda: 'PEN',
        permite_sobregiro: false,
        activa: true,
      };

      const mockCxpActualizada = {
        ...mockCxp,
        saldo: 500,
        estado: 'PARCIAL',
        ultimo_pago: '2025-10-25',
        updated_at: new Date().toISOString(),
      };

      const pagoDto = {
        monto: 500,
        fecha_pago: '2025-10-25',
        metodo_pago: 'TRANSFERENCIA',
        cuenta_bancaria_id: 'cuenta-001',
        referencia: 'REF-001',
        observaciones: 'Pago parcial',
      };

      // Mock Supabase responses
      mockSupabaseClient.maybeSingle
        .mockResolvedValueOnce({ data: mockCxp, error: null }) // Get CxP
        .mockResolvedValueOnce({ data: mockCuentaBancaria, error: null }); // Get cuenta bancaria

      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: mockCxpActualizada, error: null }); // Update CxP

      // Act
      await service.aplicarPago(tenantId, cxpId, pagoDto, userId);

      // Assert
      expect(eventBusService.emitPagoProveedorRegistrado).toHaveBeenCalledTimes(1);
      expect(eventBusService.emitPagoProveedorRegistrado).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          eventId: expect.any(String),
          idempotencyKey: expect.any(String),
          cxpId,
          pagoId: expect.any(String),
          proveedorId: 'prov-001',
          proveedorNombre: 'prov-001',
          numeroDocumento: 'F001-00001',
          monto: 500,
          moneda: 'PEN',
          fecha: '2025-10-25',
          metodoPago: 'TRANSFERENCIA',
          cuentaBancariaId: 'cuenta-001',
          cuentaBancariaNombre: 'Cuenta BCP',
          referencia: 'REF-001',
          observaciones: 'Pago parcial',
          saldoAnterior: 1000,
          saldoNuevo: 500,
          estadoAnterior: 'PENDIENTE',
          estadoNuevo: 'PARCIAL',
          createdBy: userId,
          cuentaSaldoAnterior: 5000,
          cuentaSaldoNuevo: 4500,
          source: 'cxp.aplicarPago',
        }),
      );
    });

    it('should emit event with PAGADA status when payment completes the balance', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const cxpId = 'cxp-456';
      
      const mockCxp = {
        id: cxpId,
        estado: 'PARCIAL',
        saldo: 500,
        total: 1000,
        moneda: 'PEN',
        proveedor_id: 'prov-001',
        numero_documento: 'F001-00001',
      };

      const mockCxpActualizada = {
        ...mockCxp,
        saldo: 0,
        estado: 'PAGADA',
        ultimo_pago: '2025-10-25',
        updated_at: new Date().toISOString(),
      };

      const pagoDto = {
        monto: 500,
        fecha_pago: '2025-10-25',
        metodo_pago: 'EFECTIVO',
      };

      // Mock Supabase responses
      mockSupabaseClient.maybeSingle
        .mockResolvedValueOnce({ data: mockCxp, error: null });

      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: mockCxpActualizada, error: null });

      // Act
      await service.aplicarPago(tenantId, cxpId, pagoDto);

      // Assert
      expect(eventBusService.emitPagoProveedorRegistrado).toHaveBeenCalledTimes(1);
      expect(eventBusService.emitPagoProveedorRegistrado).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          eventId: expect.any(String),
          idempotencyKey: expect.any(String),
          cxpId,
          pagoId: expect.any(String),
          estadoAnterior: 'PARCIAL',
          estadoNuevo: 'PAGADA',
          saldoAnterior: 500,
          saldoNuevo: 0,
          proveedorNombre: 'prov-001',
          cuentaBancariaId: null,
          cuentaBancariaNombre: null,
          cuentaSaldoAnterior: null,
          cuentaSaldoNuevo: null,
          source: 'cxp.aplicarPago',
        })
      );
    });

    it('should not fail the operation if event emission fails', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const cxpId = 'cxp-456';
      
      const mockCxp = {
        id: cxpId,
        estado: 'PENDIENTE',
        saldo: 1000,
        total: 1000,
        moneda: 'PEN',
        proveedor_id: 'prov-001',
        numero_documento: 'F001-00001',
      };

      const mockCxpActualizada = {
        ...mockCxp,
        saldo: 500,
        estado: 'PARCIAL',
        ultimo_pago: '2025-10-25',
        updated_at: new Date().toISOString(),
      };

      const pagoDto = {
        monto: 500,
        fecha_pago: '2025-10-25',
        metodo_pago: 'TRANSFERENCIA',
      };

      // Mock Supabase responses
      mockSupabaseClient.maybeSingle
        .mockResolvedValueOnce({ data: mockCxp, error: null });

      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: mockCxpActualizada, error: null });

      // Mock event emission failure
      (eventBusService.emitPagoProveedorRegistrado as jest.Mock).mockImplementation(() => {
        throw new Error('Event bus error');
      });

      // Act & Assert - should not throw
      const result = await service.aplicarPago(tenantId, cxpId, pagoDto);

      // The operation should succeed despite event emission failure
      expect(result.success).toBe(true);
      expect(result.data.cxp).toEqual(mockCxpActualizada);
    });
  });
});
