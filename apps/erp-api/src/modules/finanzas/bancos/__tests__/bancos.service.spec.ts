import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BancosService } from '../bancos.service';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import { EventBusService } from '../../../../shared/events/event-bus.service';

describe('BancosService', () => {
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
    it('debe crear una cuenta bancaria exitosamente', async () => {
      const tenantId = 'test-tenant-id';
      const dto: any = {
        nombre: 'Cuenta Corriente BCP',
        banco: 'BCP',
        numero_cuenta: '191-1234567-0-01',
        tipo_cuenta: 'CORRIENTE',
        moneda: 'PEN',
        saldo: 10000,
        permite_sobregiro: false,
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

      const result = await service.crearCuentaBancaria(tenantId, dto);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockCuenta);
    });

    it('debe rechazar cuenta duplicada con mismo número', async () => {
      const tenantId = 'test-tenant-id';
      const dto: any = {
        nombre: 'Cuenta Test',
        banco: 'BCP',
        numero_cuenta: '191-1234567-0-01',
        tipo_cuenta: 'CORRIENTE',
        moneda: 'PEN',
      };

      const mockCuentaExistente = {
        id: 'cuenta-existente-id',
        numero_cuenta: '191-1234567-0-01',
      };

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockCuentaExistente, error: null }),
      });

      await expect(service.crearCuentaBancaria(tenantId, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.crearCuentaBancaria(tenantId, dto)).rejects.toThrow(
        'Ya existe una cuenta bancaria con el número',
      );
    });
  });

  describe('obtenerCuentasBancarias', () => {
    it('debe obtener todas las cuentas bancarias del tenant', async () => {
      const tenantId = 'test-tenant-id';
      const mockCuentas = [
        {
          id: 'cuenta-1',
          nombre: 'Cuenta BCP',
          banco: 'BCP',
          saldo: 10000,
        },
        {
          id: 'cuenta-2',
          nombre: 'Cuenta BBVA',
          banco: 'BBVA',
          saldo: 5000,
        },
      ];

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: mockCuentas, error: null }),
      });

      const result = await service.obtenerCuentasBancarias(tenantId);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockCuentas);
      expect(result.data).toHaveLength(2);
    });

    it('debe retornar array vacío si no hay cuentas', async () => {
      const tenantId = 'test-tenant-id';

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
      });

      const result = await service.obtenerCuentasBancarias(tenantId);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('obtenerCuentaBancariaPorId', () => {
    it('debe obtener una cuenta bancaria por ID', async () => {
      const tenantId = 'test-tenant-id';
      const cuentaId = 'cuenta-id';
      const mockCuenta = {
        id: cuentaId,
        nombre: 'Cuenta BCP',
        banco: 'BCP',
        saldo: 10000,
      };

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockCuenta, error: null }),
      });

      const result = await service.obtenerCuentaBancariaPorId(tenantId, cuentaId);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockCuenta);
    });

    it('debe lanzar NotFoundException si la cuenta no existe', async () => {
      const tenantId = 'test-tenant-id';
      const cuentaId = 'cuenta-inexistente';

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      await expect(
        service.obtenerCuentaBancariaPorId(tenantId, cuentaId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('actualizarCuentaBancaria', () => {
    it('debe actualizar una cuenta bancaria exitosamente', async () => {
      const tenantId = 'test-tenant-id';
      const cuentaId = 'cuenta-id';
      const dto = {
        nombre: 'Cuenta BCP Actualizada',
        activa: false,
      };

      const mockCuentaExistente = {
        id: cuentaId,
        nombre: 'Cuenta BCP',
        numero_cuenta: '191-1234567-0-01',
        saldo: 10000,
        permite_sobregiro: false,
      };

      const mockCuentaActualizada = {
        ...mockCuentaExistente,
        ...dto,
        updated_at: new Date().toISOString(),
      };

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        neq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockCuentaExistente, error: null }),
        update: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockCuentaActualizada, error: null }),
      });

      const result = await service.actualizarCuentaBancaria(tenantId, cuentaId, dto);

      expect(result.success).toBe(true);
      expect(result.data.nombre).toBe(dto.nombre);
    });

    it('debe rechazar actualización si la cuenta no existe', async () => {
      const tenantId = 'test-tenant-id';
      const cuentaId = 'cuenta-inexistente';
      const dto = { nombre: 'Nuevo Nombre' };

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      await expect(
        service.actualizarCuentaBancaria(tenantId, cuentaId, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe rechazar número de cuenta duplicado', async () => {
      const tenantId = 'test-tenant-id';
      const cuentaId = 'cuenta-id';
      const dto = {
        numero_cuenta: '191-9999999-0-01',
      };

      const mockCuentaExistente = {
        id: cuentaId,
        numero_cuenta: '191-1234567-0-01',
        saldo: 10000,
        permite_sobregiro: false,
      };

      const mockOtraCuenta = {
        id: 'otra-cuenta-id',
        numero_cuenta: '191-9999999-0-01',
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        const chain = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          neq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn(),
        };

        // Primera llamada: cuenta existente
        // Segunda llamada: otra cuenta con mismo número
        chain.maybeSingle
          .mockResolvedValueOnce({ data: mockCuentaExistente, error: null })
          .mockResolvedValueOnce({ data: mockOtraCuenta, error: null });

        return chain;
      });

      await expect(
        service.actualizarCuentaBancaria(tenantId, cuentaId, dto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('obtenerMovimientosBancarios', () => {
    it('debe interpretar conciliado=\"false\" como no conciliado y no como true', () => {
      const queryBuilder = {
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
      };

      (service as any).applyConciliadoFilter(queryBuilder, 'false');

      expect(queryBuilder.eq).not.toHaveBeenCalledWith('conciliado', true);
      expect(queryBuilder.or).toHaveBeenCalledWith('conciliado.is.false,conciliado.is.null');
    });

    it('debe interpretar conciliado=\"true\" como conciliado real', () => {
      const queryBuilder = {
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
      };

      (service as any).applyConciliadoFilter(queryBuilder, 'true');

      expect(queryBuilder.eq).toHaveBeenCalledWith('conciliado', true);
      expect(queryBuilder.or).not.toHaveBeenCalled();
    });

    it('debe obtener movimientos bancarios con paginación', async () => {
      const tenantId = 'test-tenant-id';
      const cuentaId = 'cuenta-id';
      const query = { page: 1, limit: 10 };

      const mockCuenta = { id: cuentaId };
      const mockMovimientos = [
        {
          id: 'mov-1',
          tipo: 'ABONO',
          monto: 1000,
          fecha: '2025-01-15',
        },
        {
          id: 'mov-2',
          tipo: 'CARGO',
          monto: 500,
          fecha: '2025-01-14',
        },
      ];

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'cuentas_bancarias') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockCuenta, error: null }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          range: jest.fn().mockResolvedValue({ data: mockMovimientos, error: null, count: 2 }),
        };
      });

      const result = await service.obtenerMovimientosBancarios(tenantId, cuentaId, query);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockMovimientos);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      });
    });

    it('debe aplicar filtros de fecha y tipo', async () => {
      const tenantId = 'test-tenant-id';
      const cuentaId = 'cuenta-id';
      const query = {
        fecha_desde: '2025-01-01',
        fecha_hasta: '2025-01-31',
        tipo: 'ABONO' as const,
        page: 1,
        limit: 10,
      };

      const mockCuenta = { id: cuentaId };
      const mockMovimientos = [
        {
          id: 'mov-1',
          tipo: 'ABONO',
          monto: 1000,
          fecha: '2025-01-15',
        },
      ];

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'cuentas_bancarias') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockCuenta, error: null }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          range: jest.fn().mockResolvedValue({ data: mockMovimientos, error: null, count: 1 }),
        };
      });

      const result = await service.obtenerMovimientosBancarios(tenantId, cuentaId, query);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].tipo).toBe('ABONO');
    });
  });

  describe('crearMovimientoBancario', () => {
    it('debe crear un movimiento ABONO y actualizar saldo', async () => {
      const tenantId = 'test-tenant-id';
      const dto = {
        cuenta_bancaria_id: 'cuenta-id',
        tipo: 'ABONO' as const,
        monto: 1000,
        fecha: '2025-01-15',
        descripcion: 'Depósito cliente',
      };

      const mockCuenta = {
        id: 'cuenta-id',
        nombre: 'Cuenta BCP',
        saldo: 5000,
        moneda: 'PEN',
        permite_sobregiro: false,
        activa: true,
      };

      const mockMovimiento = {
        id: 'mov-id',
        ...dto,
        tenant_id: tenantId,
        conciliado: false,
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

      const result = await service.crearMovimientoBancario(tenantId, dto);

      expect(result.success).toBe(true);
      expect(result.data.cuenta_bancaria.saldo_nuevo).toBe(6000);
    });

    it('debe crear un movimiento CARGO y actualizar saldo', async () => {
      const tenantId = 'test-tenant-id';
      const dto = {
        cuenta_bancaria_id: 'cuenta-id',
        tipo: 'CARGO' as const,
        monto: 500,
        fecha: '2025-01-15',
        descripcion: 'Pago proveedor',
      };

      const mockCuenta = {
        id: 'cuenta-id',
        nombre: 'Cuenta BCP',
        saldo: 5000,
        moneda: 'PEN',
        permite_sobregiro: false,
        activa: true,
      };

      const mockMovimiento = {
        id: 'mov-id',
        ...dto,
        tenant_id: tenantId,
        conciliado: false,
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

      const result = await service.crearMovimientoBancario(tenantId, dto);

      expect(result.success).toBe(true);
      expect(result.data.cuenta_bancaria.saldo_nuevo).toBe(4500);
    });

    it('debe rechazar monto negativo o cero', async () => {
      const tenantId = 'test-tenant-id';
      const dto = {
        cuenta_bancaria_id: 'cuenta-id',
        tipo: 'ABONO' as const,
        monto: 0,
        fecha: '2025-01-15',
        descripcion: 'Test',
      };

      await expect(service.crearMovimientoBancario(tenantId, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.crearMovimientoBancario(tenantId, dto)).rejects.toThrow(
        'El monto del movimiento debe ser mayor a 0',
      );
    });

    it('debe rechazar movimiento en cuenta inactiva', async () => {
      const tenantId = 'test-tenant-id';
      const dto = {
        cuenta_bancaria_id: 'cuenta-id',
        tipo: 'ABONO' as const,
        monto: 1000,
        fecha: '2025-01-15',
        descripcion: 'Test',
      };

      const mockCuenta = {
        id: 'cuenta-id',
        nombre: 'Cuenta BCP',
        saldo: 5000,
        moneda: 'PEN',
        permite_sobregiro: false,
        activa: false,
      };

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockCuenta, error: null }),
      });

      await expect(service.crearMovimientoBancario(tenantId, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.crearMovimientoBancario(tenantId, dto)).rejects.toThrow(
        'No se pueden crear movimientos en una cuenta bancaria inactiva',
      );
    });
  });

  describe('obtenerSaldosConsolidados', () => {
    it('debe consolidar saldos por moneda', async () => {
      const tenantId = 'test-tenant-id';
      const mockCuentas = [
        {
          id: 'cuenta-1',
          nombre: 'Cuenta BCP PEN',
          banco: 'BCP',
          numero_cuenta: '191-1234567-0-01',
          tipo_cuenta: 'CORRIENTE',
          moneda: 'PEN',
          saldo: 10000,
          activa: true,
        },
        {
          id: 'cuenta-2',
          nombre: 'Cuenta BBVA PEN',
          banco: 'BBVA',
          numero_cuenta: '011-1234567-0-01',
          tipo_cuenta: 'AHORROS',
          moneda: 'PEN',
          saldo: 5000,
          activa: true,
        },
        {
          id: 'cuenta-3',
          nombre: 'Cuenta BCP USD',
          banco: 'BCP',
          numero_cuenta: '191-7654321-0-01',
          tipo_cuenta: 'CORRIENTE',
          moneda: 'USD',
          saldo: 2000,
          activa: true,
        },
      ];

      let orderCallCount = 0;
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn(() => {
          orderCallCount++;
          if (orderCallCount < 2) {
            return mockChain;
          }
          return Promise.resolve({ data: mockCuentas, error: null });
        }),
      };
      mockSupabaseClient.from.mockReturnValue(mockChain);

      const result = await service.obtenerSaldosConsolidados(tenantId);

      expect(result.success).toBe(true);
      expect(result.data.por_moneda).toHaveLength(2);
      expect(result.data.por_moneda[0].moneda).toBe('PEN');
      expect(result.data.por_moneda[0].saldo_total).toBe(15000);
      expect(result.data.por_moneda[1].moneda).toBe('USD');
      expect(result.data.por_moneda[1].saldo_total).toBe(2000);
      expect(result.data.total_cuentas).toBe(3);
      expect(result.data.total_cuentas_activas).toBe(3);
    });

    it('debe manejar cuentas inactivas en consolidado', async () => {
      const tenantId = 'test-tenant-id';
      const mockCuentas = [
        {
          id: 'cuenta-1',
          nombre: 'Cuenta Activa',
          banco: 'BCP',
          numero_cuenta: '191-1234567-0-01',
          tipo_cuenta: 'CORRIENTE',
          moneda: 'PEN',
          saldo: 10000,
          activa: true,
        },
        {
          id: 'cuenta-2',
          nombre: 'Cuenta Inactiva',
          banco: 'BBVA',
          numero_cuenta: '011-1234567-0-01',
          tipo_cuenta: 'AHORROS',
          moneda: 'PEN',
          saldo: 5000,
          activa: false,
        },
      ];

      let orderCallCount = 0;
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn(() => {
          orderCallCount++;
          if (orderCallCount < 2) {
            return mockChain;
          }
          return Promise.resolve({ data: mockCuentas, error: null });
        }),
      };
      mockSupabaseClient.from.mockReturnValue(mockChain);

      const result = await service.obtenerSaldosConsolidados(tenantId);

      expect(result.success).toBe(true);
      expect(result.data.por_moneda[0].saldo_total).toBe(15000);
      expect(result.data.por_moneda[0].saldo_activas).toBe(10000);
      expect(result.data.total_cuentas).toBe(2);
      expect(result.data.total_cuentas_activas).toBe(1);
    });

    it('debe retornar estructura vacía si no hay cuentas', async () => {
      const tenantId = 'test-tenant-id';

      let orderCallCount = 0;
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn(() => {
          orderCallCount++;
          if (orderCallCount < 2) {
            return mockChain;
          }
          return Promise.resolve({ data: [], error: null });
        }),
      };
      mockSupabaseClient.from.mockReturnValue(mockChain);

      const result = await service.obtenerSaldosConsolidados(tenantId);

      expect(result.success).toBe(true);
      expect(result.data.por_moneda).toEqual([]);
      expect(result.data.por_cuenta).toEqual([]);
      expect(result.data.total_cuentas).toBe(0);
      expect(result.data.total_cuentas_activas).toBe(0);
    });
  });

  describe('obtenerMovimientosBancarios - casos de error', () => {
    it('debe lanzar NotFoundException si la cuenta no existe', async () => {
      const tenantId = 'test-tenant-id';
      const cuentaId = 'cuenta-inexistente';
      const query = {};

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      await expect(
        service.obtenerMovimientosBancarios(tenantId, cuentaId, query),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('crearMovimientoBancario - validación de proveedor', () => {
    it('debe rechazar si el proveedor no existe', async () => {
      const tenantId = 'test-tenant-id';
      const dto = {
        cuenta_bancaria_id: 'cuenta-id',
        tipo: 'CARGO' as const,
        monto: 1000,
        fecha: '2025-01-15',
        descripcion: 'Pago proveedor',
        proveedor_id: 'proveedor-inexistente',
      };

      const mockCuenta = {
        id: 'cuenta-id',
        nombre: 'Cuenta BCP',
        saldo: 5000,
        moneda: 'PEN',
        permite_sobregiro: false,
        activa: true,
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'cuentas_bancarias') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockCuenta, error: null }),
          };
        }
        if (table === 'proveedores') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      await expect(service.crearMovimientoBancario(tenantId, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.crearMovimientoBancario(tenantId, dto)).rejects.toThrow(
        'Proveedor no encontrado',
      );
    });
  });

  describe('crearCuentaBancaria - casos adicionales', () => {
    it('debe crear cuenta con valores por defecto', async () => {
      const tenantId = 'test-tenant-id';
      const dto = {
        nombre: 'Cuenta Test',
        banco: 'BCP',
        numero_cuenta: '191-1234567-0-01',
      };

      const mockCuenta = {
        id: 'cuenta-id',
        ...dto,
        tipo_cuenta: 'CORRIENTE',
        moneda: 'PEN',
        saldo: 0,
        permite_sobregiro: false,
        activa: true,
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

      const result = await service.crearCuentaBancaria(tenantId, dto);

      expect(result.success).toBe(true);
      expect(result.data.tipo_cuenta).toBe('CORRIENTE');
      expect(result.data.moneda).toBe('PEN');
      expect(result.data.saldo).toBe(0);
    });
  });

  describe('crearMovimientoBancario - casos de error adicionales', () => {
    it('debe rechazar si la cuenta bancaria no existe', async () => {
      const tenantId = 'test-tenant-id';
      const dto = {
        cuenta_bancaria_id: 'cuenta-inexistente',
        tipo: 'ABONO' as const,
        monto: 1000,
        fecha: '2025-01-15',
        descripcion: 'Test',
      };

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      await expect(service.crearMovimientoBancario(tenantId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('obtenerCuentasBancarias - casos de error', () => {
    it('debe manejar error de base de datos', async () => {
      const tenantId = 'test-tenant-id';

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB Error' } }),
      });

      await expect(service.obtenerCuentasBancarias(tenantId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('obtenerCuentaBancariaPorId - casos de error', () => {
    it('debe manejar error de base de datos', async () => {
      const tenantId = 'test-tenant-id';
      const cuentaId = 'cuenta-id';

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB Error' } }),
      });

      await expect(service.obtenerCuentaBancariaPorId(tenantId, cuentaId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('exportarMovimientosBancarios', () => {
    it('debe generar CSV con movimientos bancarios', async () => {
      const tenantId = 'test-tenant-id';
      const cuentaId = 'cuenta-id';
      const query = {};

      const mockCuenta = {
        id: cuentaId,
        nombre: 'Cuenta BCP',
        banco: 'BCP',
        numero_cuenta: '191-1234567-0-01',
        moneda: 'PEN',
      };

      const mockMovimientos = [
        {
          id: 'mov-1',
          tipo: 'ABONO',
          monto: 1000,
          fecha: '2025-01-15',
          descripcion: 'Depósito',
          referencia: 'REF-001',
          conciliado: true,
          created_at: '2025-01-15T10:00:00Z',
          proveedores: null,
        },
        {
          id: 'mov-2',
          tipo: 'CARGO',
          monto: 500,
          fecha: '2025-01-14',
          descripcion: 'Pago proveedor',
          referencia: 'REF-002',
          conciliado: false,
          created_at: '2025-01-14T15:30:00Z',
          proveedores: {
            id: 'prov-1',
            razon_social: 'Proveedor Test SAC',
            ruc: '20123456789',
          },
        },
      ];

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'cuentas_bancarias') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockCuenta, error: null }),
          };
        }
        let orderCallCount = 0;
        const mockChain = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          order: jest.fn(() => {
            orderCallCount++;
            if (orderCallCount < 2) {
              return mockChain;
            }
            return Promise.resolve({ data: mockMovimientos, error: null });
          }),
        };
        return mockChain;
      });

      const result = await service.exportarMovimientosBancarios(tenantId, cuentaId, query);

      expect(result.success).toBe(true);
      expect(result.data).toContain('Fecha,Tipo,Descripción');
      expect(result.data).toContain('ABONO');
      expect(result.data).toContain('CARGO');
      expect(result.data).toContain('Proveedor Test SAC');
      expect(result.filename).toContain('movimientos_BCP_191-1234567-0-01');
    });

    it('debe lanzar NotFoundException si la cuenta no existe', async () => {
      const tenantId = 'test-tenant-id';
      const cuentaId = 'cuenta-inexistente';
      const query = {};

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      await expect(
        service.exportarMovimientosBancarios(tenantId, cuentaId, query),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('obtenerMovimientosPorPeriodo', () => {
    it('debe obtener movimientos de todas las cuentas con resumen', async () => {
      const tenantId = 'test-tenant-id';
      const query = { page: 1, limit: 10 };

      const mockMovimientos = [
        {
          id: 'mov-1',
          tipo: 'ABONO',
          monto: 1000,
          fecha: '2025-01-15',
          descripcion: 'Depósito',
          cuentas_bancarias: {
            id: 'cuenta-1',
            nombre: 'Cuenta BCP',
            banco: 'BCP',
            numero_cuenta: '191-1234567-0-01',
            moneda: 'PEN',
          },
          proveedores: null,
        },
        {
          id: 'mov-2',
          tipo: 'CARGO',
          monto: 500,
          fecha: '2025-01-14',
          descripcion: 'Pago proveedor',
          cuentas_bancarias: {
            id: 'cuenta-1',
            nombre: 'Cuenta BCP',
            banco: 'BCP',
            numero_cuenta: '191-1234567-0-01',
            moneda: 'PEN',
          },
          proveedores: {
            id: 'prov-1',
            razon_social: 'Proveedor Test',
            ruc: '20123456789',
          },
        },
      ];

      const mockTodosMovimientos = [
        {
          tipo: 'ABONO',
          monto: 1000,
          cuentas_bancarias: { moneda: 'PEN' },
        },
        {
          tipo: 'CARGO',
          monto: 500,
          cuentas_bancarias: { moneda: 'PEN' },
        },
      ];

      let callCount = 0;
      mockSupabaseClient.from.mockImplementation(() => {
        callCount++;
        
        if (callCount === 1) {
          // Primera llamada: obtener movimientos paginados
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            range: jest.fn().mockResolvedValue({ 
              data: mockMovimientos, 
              error: null, 
              count: 2 
            }),
          };
        } else {
          // Segunda llamada: obtener todos los movimientos para resumen
          const mockChain = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
          };
          mockChain.eq = jest.fn().mockResolvedValue({ 
            data: mockTodosMovimientos, 
            error: null 
          });
          return mockChain;
        }
      });

      const result = await service.obtenerMovimientosPorPeriodo(tenantId, query);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockMovimientos);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      });
      expect(result.resumen).toBeDefined();
      expect(result.resumen.por_moneda).toHaveLength(1);
      expect(result.resumen.por_moneda[0].moneda).toBe('PEN');
      expect(result.resumen.por_moneda[0].total_abonos).toBe(1000);
      expect(result.resumen.por_moneda[0].total_cargos).toBe(500);
      expect(result.resumen.por_moneda[0].flujo_neto).toBe(500);
    });

    it('debe aplicar filtros de fecha correctamente', async () => {
      const tenantId = 'test-tenant-id';
      const query = {
        fecha_desde: '2025-01-01',
        fecha_hasta: '2025-01-31',
        page: 1,
        limit: 10,
      };

      const mockMovimientos = [
        {
          id: 'mov-1',
          tipo: 'ABONO',
          monto: 1000,
          fecha: '2025-01-15',
          cuentas_bancarias: {
            id: 'cuenta-1',
            nombre: 'Cuenta BCP',
            banco: 'BCP',
            numero_cuenta: '191-1234567-0-01',
            moneda: 'PEN',
          },
        },
      ];

      let callCount = 0;
      mockSupabaseClient.from.mockImplementation(() => {
        callCount++;
        
        if (callCount === 1) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            gte: jest.fn().mockReturnThis(),
            lte: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            range: jest.fn().mockResolvedValue({ 
              data: mockMovimientos, 
              error: null, 
              count: 1 
            }),
          };
        } else {
          const mockChain = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            gte: jest.fn().mockReturnThis(),
            lte: jest.fn(),
          };
          mockChain.lte = jest.fn().mockResolvedValue({ 
            data: [{ tipo: 'ABONO', monto: 1000, cuentas_bancarias: { moneda: 'PEN' } }], 
            error: null 
          });
          return mockChain;
        }
      });

      const result = await service.obtenerMovimientosPorPeriodo(tenantId, query);

      expect(result.success).toBe(true);
      expect(result.resumen.periodo.desde).toBe('2025-01-01');
      expect(result.resumen.periodo.hasta).toBe('2025-01-31');
    });

    it('debe filtrar por tipo de movimiento', async () => {
      const tenantId = 'test-tenant-id';
      const query = {
        tipo: 'ABONO' as const,
        page: 1,
        limit: 10,
      };

      const mockMovimientos = [
        {
          id: 'mov-1',
          tipo: 'ABONO',
          monto: 1000,
          fecha: '2025-01-15',
          cuentas_bancarias: {
            id: 'cuenta-1',
            nombre: 'Cuenta BCP',
            banco: 'BCP',
            numero_cuenta: '191-1234567-0-01',
            moneda: 'PEN',
          },
        },
      ];

      let callCount = 0;
      mockSupabaseClient.from.mockImplementation(() => {
        callCount++;
        
        if (callCount === 1) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            range: jest.fn().mockResolvedValue({ 
              data: mockMovimientos, 
              error: null, 
              count: 1 
            }),
          };
        } else {
          let eqCallCount = 0;
          const mockChain = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn(() => {
              eqCallCount++;
              if (eqCallCount < 2) {
                return mockChain;
              }
              return Promise.resolve({ 
                data: [{ tipo: 'ABONO', monto: 1000, cuentas_bancarias: { moneda: 'PEN' } }], 
                error: null 
              });
            }),
          };
          return mockChain;
        }
      });

      const result = await service.obtenerMovimientosPorPeriodo(tenantId, query);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].tipo).toBe('ABONO');
    });

    it('debe consolidar resumen por múltiples monedas', async () => {
      const tenantId = 'test-tenant-id';
      const query = { page: 1, limit: 10 };

      const mockMovimientos = [
        {
          id: 'mov-1',
          tipo: 'ABONO',
          monto: 1000,
          fecha: '2025-01-15',
          cuentas_bancarias: {
            moneda: 'PEN',
          },
        },
        {
          id: 'mov-2',
          tipo: 'ABONO',
          monto: 500,
          fecha: '2025-01-14',
          cuentas_bancarias: {
            moneda: 'USD',
          },
        },
      ];

      const mockTodosMovimientos = [
        { tipo: 'ABONO', monto: 1000, cuentas_bancarias: { moneda: 'PEN' } },
        { tipo: 'CARGO', monto: 300, cuentas_bancarias: { moneda: 'PEN' } },
        { tipo: 'ABONO', monto: 500, cuentas_bancarias: { moneda: 'USD' } },
        { tipo: 'CARGO', monto: 200, cuentas_bancarias: { moneda: 'USD' } },
      ];

      let callCount = 0;
      mockSupabaseClient.from.mockImplementation(() => {
        callCount++;
        
        if (callCount === 1) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            range: jest.fn().mockResolvedValue({ 
              data: mockMovimientos, 
              error: null, 
              count: 2 
            }),
          };
        } else {
          const mockChain = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn(),
          };
          mockChain.eq = jest.fn().mockResolvedValue({ 
            data: mockTodosMovimientos, 
            error: null 
          });
          return mockChain;
        }
      });

      const result = await service.obtenerMovimientosPorPeriodo(tenantId, query);

      expect(result.success).toBe(true);
      expect(result.resumen.por_moneda).toHaveLength(2);
      
      const resumenPEN = result.resumen.por_moneda.find((m: any) => m.moneda === 'PEN');
      expect(resumenPEN.total_abonos).toBe(1000);
      expect(resumenPEN.total_cargos).toBe(300);
      expect(resumenPEN.flujo_neto).toBe(700);
      
      const resumenUSD = result.resumen.por_moneda.find((m: any) => m.moneda === 'USD');
      expect(resumenUSD.total_abonos).toBe(500);
      expect(resumenUSD.total_cargos).toBe(200);
      expect(resumenUSD.flujo_neto).toBe(300);
    });

    it('debe manejar error al obtener movimientos', async () => {
      const tenantId = 'test-tenant-id';
      const query = { page: 1, limit: 10 };

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({ 
          data: null, 
          error: { message: 'DB Error' } 
        }),
      });

      await expect(
        service.obtenerMovimientosPorPeriodo(tenantId, query),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.obtenerMovimientosPorPeriodo(tenantId, query),
      ).rejects.toThrow('No se pudieron obtener los movimientos bancarios por período');
    });
  });
});
