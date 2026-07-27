import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { BancosService } from '../bancos.service';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import { EventBusService } from '../../../../shared/events/event-bus.service';

describe('BancosService - Validación de Sobregiro', () => {
  let service: BancosService;
  let supabaseService: SupabaseService;

  const mockSupabaseClient = {
    from: jest.fn(),
  };

  const mockEventBus = {
    emitMovimientoBancarioRegistrado: jest.fn(),
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
          useValue: mockEventBus,
        },
      ],
    }).compile();

    service = module.get<BancosService>(BancosService);
    supabaseService = module.get<SupabaseService>(SupabaseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('crearCuentaBancaria', () => {
    it('debe rechazar saldo inicial negativo si no permite sobregiro', async () => {
      // Arrange
      const tenantId = 'test-tenant-id';
      const dto: any = {
        nombre: 'Cuenta Test',
        banco: 'BCP',
        numero_cuenta: '123456789',
        tipo_cuenta: 'CORRIENTE',
        moneda: 'PEN',
        saldo: -100,
        permite_sobregiro: false,
        activa: true,
      };

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      // Act & Assert
      await expect(service.crearCuentaBancaria(tenantId, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.crearCuentaBancaria(tenantId, dto)).rejects.toThrow(
        'El saldo inicial no puede ser negativo si la cuenta no permite sobregiro',
      );
    });

    it('debe permitir saldo inicial negativo si permite sobregiro', async () => {
      // Arrange
      const tenantId = 'test-tenant-id';
      const dto: any = {
        nombre: 'Cuenta Test',
        banco: 'BCP',
        numero_cuenta: '123456789',
        tipo_cuenta: 'CORRIENTE',
        moneda: 'PEN',
        saldo: -100,
        permite_sobregiro: true,
        activa: true,
      };

      const mockCuenta = {
        id: 'cuenta-id',
        ...dto,
        tenant_id: tenantId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        insert: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockCuenta, error: null }),
      });

      // Act
      const result = await service.crearCuentaBancaria(tenantId, dto);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.saldo).toBe(-100);
    });
  });

  describe('crearMovimientoBancario', () => {
    it('debe rechazar movimiento CARGO que deje saldo negativo si no permite sobregiro', async () => {
      // Arrange
      const tenantId = 'test-tenant-id';
      const dto = {
        cuenta_bancaria_id: 'cuenta-id',
        tipo: 'CARGO' as const,
        monto: 1000,
        fecha: '2025-01-15',
        descripcion: 'Pago test',
      };

      const mockCuenta = {
        id: 'cuenta-id',
        nombre: 'Cuenta Test',
        saldo: 500,
        moneda: 'PEN',
        permite_sobregiro: false,
        activa: true,
      };

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockCuenta, error: null }),
      });

      // Act & Assert
      await expect(service.crearMovimientoBancario(tenantId, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.crearMovimientoBancario(tenantId, dto)).rejects.toThrow(
        /Saldo insuficiente/,
      );
    });

    it('debe permitir movimiento CARGO que deje saldo negativo si permite sobregiro', async () => {
      // Arrange
      const tenantId = 'test-tenant-id';
      const dto = {
        cuenta_bancaria_id: 'cuenta-id',
        tipo: 'CARGO' as const,
        monto: 1000,
        fecha: '2025-01-15',
        descripcion: 'Pago test',
      };

      const mockCuenta = {
        id: 'cuenta-id',
        nombre: 'Cuenta Test',
        saldo: 500,
        moneda: 'PEN',
        permite_sobregiro: true,
        activa: true,
      };

      const mockMovimiento = {
        id: 'movimiento-id',
        ...dto,
        tenant_id: tenantId,
        created_at: new Date().toISOString(),
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'cuentas_bancarias') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockCuenta, error: null }),
            update: jest.fn().mockReturnThis(),
          };
        }
        if (table === 'movimientos_bancarios') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockMovimiento, error: null }),
          };
        }
        if (table === 'outbox_events') {
          return {
            insert: jest.fn().mockResolvedValue({ error: null }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      // Act
      const result = await service.crearMovimientoBancario(tenantId, dto);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.cuenta_bancaria.saldo_nuevo).toBe(-500);
    });

    it('debe permitir movimiento ABONO sin restricciones', async () => {
      // Arrange
      const tenantId = 'test-tenant-id';
      const dto = {
        cuenta_bancaria_id: 'cuenta-id',
        tipo: 'ABONO' as const,
        monto: 1000,
        fecha: '2025-01-15',
        descripcion: 'Ingreso test',
      };

      const mockCuenta = {
        id: 'cuenta-id',
        nombre: 'Cuenta Test',
        saldo: 500,
        moneda: 'PEN',
        permite_sobregiro: false,
        activa: true,
      };

      const mockMovimiento = {
        id: 'movimiento-id',
        ...dto,
        tenant_id: tenantId,
        created_at: new Date().toISOString(),
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'cuentas_bancarias') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockCuenta, error: null }),
            update: jest.fn().mockReturnThis(),
          };
        }
        if (table === 'movimientos_bancarios') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockMovimiento, error: null }),
          };
        }
        if (table === 'outbox_events') {
          return {
            insert: jest.fn().mockResolvedValue({ error: null }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      // Act
      const result = await service.crearMovimientoBancario(tenantId, dto);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.cuenta_bancaria.saldo_nuevo).toBe(1500);
    });
  });

  describe('actualizarCuentaBancaria', () => {
    it('debe rechazar desactivar sobregiro si la cuenta tiene saldo negativo', async () => {
      // Arrange
      const tenantId = 'test-tenant-id';
      const cuentaId = 'cuenta-id';
      const dto = {
        permite_sobregiro: false,
      };

      const mockCuentaExistente = {
        id: cuentaId,
        nombre: 'Cuenta Test',
        saldo: -500,
        permite_sobregiro: true,
        activa: true,
      };

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockCuentaExistente, error: null }),
      });

      // Act & Assert
      await expect(
        service.actualizarCuentaBancaria(tenantId, cuentaId, dto),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.actualizarCuentaBancaria(tenantId, cuentaId, dto),
      ).rejects.toThrow(
        'No se puede desactivar el sobregiro cuando la cuenta tiene saldo negativo',
      );
    });
  });
});
