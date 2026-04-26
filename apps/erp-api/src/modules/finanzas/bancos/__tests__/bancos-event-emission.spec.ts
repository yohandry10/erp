import { Test, TestingModule } from '@nestjs/testing';
import { BancosService } from '../bancos.service';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import { EventBusService } from '../../../../shared/events/event-bus.service';

describe('BancosService - MovimientoBancarioRegistrado Event Emission', () => {
  let service: BancosService;
  let eventBusService: EventBusService;
  let supabaseService: SupabaseService;

  const mockSupabaseClient = {
    from: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BancosService,
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn(() => mockSupabaseClient),
          },
        },
        {
          provide: EventBusService,
          useValue: {
            emitMovimientoBancarioRegistrado: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BancosService>(BancosService);
    eventBusService = module.get<EventBusService>(EventBusService);
    supabaseService = module.get<SupabaseService>(SupabaseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('crearMovimientoBancario', () => {
    it('should emit MovimientoBancarioRegistrado event when ABONO movement is created', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const userId = 'user-789';

      const mockCuentaBancaria = {
        id: 'cuenta-001',
        nombre: 'Cuenta BCP',
        saldo: 5000,
        moneda: 'PEN',
        permite_sobregiro: false,
        activa: true,
      };

      const mockMovimiento = {
        id: 'mov-001',
        tenant_id: tenantId,
        cuenta_bancaria_id: 'cuenta-001',
        tipo: 'ABONO',
        monto: 1000,
        fecha: '2025-10-26',
        descripcion: 'Depósito bancario',
        referencia: 'REF-001',
        metodo_pago: 'TRANSFERENCIA',
        proveedor_id: null,
        proveedores: null,
        cxp_id: null,
        conciliado: false,
        created_by: userId,
        created_at: new Date().toISOString(),
      };

      const movimientoDto = {
        cuenta_bancaria_id: 'cuenta-001',
        tipo: 'ABONO' as const,
        monto: 1000,
        fecha: '2025-10-26',
        descripcion: 'Depósito bancario',
        referencia: 'REF-001',
        metodo_pago: 'TRANSFERENCIA',
      };

      // Mock Supabase responses
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'cuentas_bancarias') {
          const mockChain = {
            select: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockCuentaBancaria, error: null }),
          };
          return mockChain;
        } else if (table === 'movimientos_bancarios') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockMovimiento, error: null }),
          };
        } else if (table === 'outbox_events') {
          return {
            insert: jest.fn().mockResolvedValue({ error: null }),
          };
        }
      });

      // Act
      await service.crearMovimientoBancario(tenantId, movimientoDto, userId);

      // Assert
      expect(eventBusService.emitMovimientoBancarioRegistrado).toHaveBeenCalledTimes(1);
      expect(eventBusService.emitMovimientoBancarioRegistrado).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          movimientoId: 'mov-001',
          cuentaBancariaId: 'cuenta-001',
          cuentaBancariaNombre: 'Cuenta BCP',
          tipo: 'ABONO',
          monto: 1000,
          moneda: 'PEN',
          fecha: '2025-10-26',
          descripcion: 'Depósito bancario',
          referencia: 'REF-001',
          metodoPago: 'TRANSFERENCIA',
          proveedorId: undefined,
          proveedorNombre: undefined,
          cxpId: null,
          saldoAnterior: 5000,
          saldoNuevo: 6000,
          createdBy: userId,
        })
      );
    });

    it('should emit MovimientoBancarioRegistrado event when CARGO movement is created', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const userId = 'user-789';

      const mockCuentaBancaria = {
        id: 'cuenta-001',
        nombre: 'Cuenta BCP',
        saldo: 5000,
        moneda: 'PEN',
        permite_sobregiro: false,
        activa: true,
      };

      const mockProveedor = {
        id: 'prov-001',
        razon_social: 'Proveedor Test SAC',
        ruc: '20123456789',
      };

      const mockMovimiento = {
        id: 'mov-002',
        tenant_id: tenantId,
        cuenta_bancaria_id: 'cuenta-001',
        tipo: 'CARGO',
        monto: 500,
        fecha: '2025-10-26',
        descripcion: 'Pago a proveedor',
        referencia: 'REF-002',
        metodo_pago: 'TRANSFERENCIA',
        proveedor_id: 'prov-001',
        proveedores: mockProveedor,
        cxp_id: null,
        conciliado: false,
        created_by: userId,
        created_at: new Date().toISOString(),
      };

      const movimientoDto = {
        cuenta_bancaria_id: 'cuenta-001',
        tipo: 'CARGO' as const,
        monto: 500,
        fecha: '2025-10-26',
        descripcion: 'Pago a proveedor',
        referencia: 'REF-002',
        metodo_pago: 'TRANSFERENCIA',
        proveedor_id: 'prov-001',
      };

      // Mock Supabase responses
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'cuentas_bancarias') {
          const mockChain = {
            select: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockCuentaBancaria, error: null }),
          };
          return mockChain;
        } else if (table === 'proveedores') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockProveedor, error: null }),
          };
        } else if (table === 'movimientos_bancarios') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockMovimiento, error: null }),
          };
        } else if (table === 'outbox_events') {
          return {
            insert: jest.fn().mockResolvedValue({ error: null }),
          };
        }
      });

      // Act
      await service.crearMovimientoBancario(tenantId, movimientoDto, userId);

      // Assert
      expect(eventBusService.emitMovimientoBancarioRegistrado).toHaveBeenCalledTimes(1);
      expect(eventBusService.emitMovimientoBancarioRegistrado).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          movimientoId: 'mov-002',
          cuentaBancariaId: 'cuenta-001',
          cuentaBancariaNombre: 'Cuenta BCP',
          tipo: 'CARGO',
          monto: 500,
          moneda: 'PEN',
          fecha: '2025-10-26',
          descripcion: 'Pago a proveedor',
          referencia: 'REF-002',
          metodoPago: 'TRANSFERENCIA',
          proveedorId: 'prov-001',
          proveedorNombre: 'Proveedor Test SAC',
          cxpId: null,
          saldoAnterior: 5000,
          saldoNuevo: 4500,
          createdBy: userId,
        })
      );
    });

    it('should not fail the operation if event emission fails', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const userId = 'user-789';

      const mockCuentaBancaria = {
        id: 'cuenta-001',
        nombre: 'Cuenta BCP',
        saldo: 5000,
        moneda: 'PEN',
        permite_sobregiro: false,
        activa: true,
      };

      const mockMovimiento = {
        id: 'mov-003',
        tenant_id: tenantId,
        cuenta_bancaria_id: 'cuenta-001',
        tipo: 'ABONO',
        monto: 1000,
        fecha: '2025-10-26',
        descripcion: 'Depósito bancario',
        referencia: null,
        metodo_pago: null,
        proveedor_id: null,
        proveedores: null,
        cxp_id: null,
        conciliado: false,
        created_by: userId,
        created_at: new Date().toISOString(),
      };

      const movimientoDto = {
        cuenta_bancaria_id: 'cuenta-001',
        tipo: 'ABONO' as const,
        monto: 1000,
        fecha: '2025-10-26',
        descripcion: 'Depósito bancario',
      };

      // Mock Supabase responses
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'cuentas_bancarias') {
          const mockChain = {
            select: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockCuentaBancaria, error: null }),
          };
          return mockChain;
        } else if (table === 'movimientos_bancarios') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockMovimiento, error: null }),
          };
        } else if (table === 'outbox_events') {
          return {
            insert: jest.fn().mockResolvedValue({ error: null }),
          };
        }
      });

      // Mock event emission failure
      (eventBusService.emitMovimientoBancarioRegistrado as jest.Mock).mockImplementation(() => {
        throw new Error('Event bus error');
      });

      // Act & Assert - should not throw
      const result = await service.crearMovimientoBancario(tenantId, movimientoDto, userId);

      // The operation should succeed despite event emission failure
      expect(result.success).toBe(true);
      expect(result.data.id).toBe('mov-003');
    });
  });
});
