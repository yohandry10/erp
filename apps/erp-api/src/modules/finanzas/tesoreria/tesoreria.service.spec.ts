import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TesoreriaService } from './tesoreria.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { EventBusService } from '../../../shared/events/event-bus.service';

describe('TesoreriaService', () => {
  let service: TesoreriaService;
  let supabaseService: jest.Mocked<SupabaseService>;
  let eventBusService: jest.Mocked<EventBusService>;

  const mockSupabaseClient = {
    from: jest.fn(),
    rpc: jest.fn(),
  };

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(),
    single: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TesoreriaService,
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
            emitMovimientoBancarioRegistrado: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TesoreriaService>(TesoreriaService);
    supabaseService = module.get(SupabaseService) as jest.Mocked<SupabaseService>;
    eventBusService = module.get(EventBusService) as jest.Mocked<EventBusService>;

    jest.clearAllMocks();
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registrarPago', () => {
    const tenantId = 'tenant-123';
    const userId = 'user-123';
    const mockCxp = {
      id: 'cxp-123',
      estado: 'PENDIENTE',
      saldo: 1000,
      total: 1000,
      moneda: 'PEN',
      proveedor_id: 'prov-123',
      numero_documento: 'F001-123',
      proveedor: {
        id: 'prov-123',
        razon_social: 'Proveedor Test',
        ruc: '12345678901',
      },
    };

    const mockCuentaBancaria = {
      id: 'cuenta-123',
      nombre: 'Cuenta Corriente BCP',
      saldo: 5000,
      moneda: 'PEN',
      permite_sobregiro: false,
    };

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should throw BadRequestException if monto is zero or negative', async () => {
      const dto = {
        cxp_id: 'cxp-123',
        monto: 0,
        fecha_pago: '2024-01-15',
        metodo_pago: 'TRANSFERENCIA',
      };

      await expect(service.registrarPago(tenantId, dto, userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if CxP does not exist', async () => {
      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const dto = {
        cxp_id: 'cxp-999',
        monto: 500,
        fecha_pago: '2024-01-15',
        metodo_pago: 'TRANSFERENCIA',
      };

      await expect(service.registrarPago(tenantId, dto, userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if CxP is ANULADA', async () => {
      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
        data: { ...mockCxp, estado: 'ANULADA' },
        error: null,
      });

      const dto = {
        cxp_id: 'cxp-123',
        monto: 500,
        fecha_pago: '2024-01-15',
        metodo_pago: 'TRANSFERENCIA',
      };

      await expect(service.registrarPago(tenantId, dto, userId)).rejects.toThrow(
        'No se puede aplicar pago a una cuenta por pagar anulada',
      );
    });

    it('should throw BadRequestException if CxP is already PAGADA', async () => {
      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
        data: { ...mockCxp, estado: 'PAGADA', saldo: 0 },
        error: null,
      });

      const dto = {
        cxp_id: 'cxp-123',
        monto: 500,
        fecha_pago: '2024-01-15',
        metodo_pago: 'TRANSFERENCIA',
      };

      await expect(service.registrarPago(tenantId, dto, userId)).rejects.toThrow(
        'La cuenta por pagar ya está completamente pagada',
      );
    });

    it('should throw BadRequestException if monto exceeds saldo', async () => {
      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
        data: mockCxp,
        error: null,
      });

      const dto = {
        cxp_id: 'cxp-123',
        monto: 1500,
        fecha_pago: '2024-01-15',
        metodo_pago: 'TRANSFERENCIA',
      };

      await expect(service.registrarPago(tenantId, dto, userId)).rejects.toThrow(
        'El monto del pago (1500) no puede ser mayor al saldo pendiente (1000)',
      );
    });

    it('should throw BadRequestException if cuenta bancaria does not exist', async () => {
      mockQueryBuilder.maybeSingle
        .mockResolvedValueOnce({ data: mockCxp, error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      const dto = {
        cxp_id: 'cxp-123',
        monto: 500,
        fecha_pago: '2024-01-15',
        metodo_pago: 'TRANSFERENCIA',
        cuenta_bancaria_id: 'cuenta-999',
      };

      await expect(service.registrarPago(tenantId, dto, userId)).rejects.toThrow(
        'Cuenta bancaria no encontrada',
      );
    });

    it('should throw BadRequestException if moneda does not match', async () => {
      mockQueryBuilder.maybeSingle
        .mockResolvedValueOnce({ data: mockCxp, error: null })
        .mockResolvedValueOnce({
          data: { ...mockCuentaBancaria, moneda: 'USD' },
          error: null,
        });

      const dto = {
        cxp_id: 'cxp-123',
        monto: 500,
        fecha_pago: '2024-01-15',
        metodo_pago: 'TRANSFERENCIA',
        cuenta_bancaria_id: 'cuenta-123',
      };

      await expect(service.registrarPago(tenantId, dto, userId)).rejects.toThrow(
        'La moneda de la cuenta bancaria (USD) no coincide con la moneda de la CxP (PEN)',
      );
    });

    it('should throw BadRequestException if saldo insuficiente and no sobregiro', async () => {
      mockQueryBuilder.maybeSingle
        .mockResolvedValueOnce({ data: mockCxp, error: null })
        .mockResolvedValueOnce({
          data: { ...mockCuentaBancaria, saldo: 300 },
          error: null,
        });

      const dto = {
        cxp_id: 'cxp-123',
        monto: 500,
        fecha_pago: '2024-01-15',
        metodo_pago: 'TRANSFERENCIA',
        cuenta_bancaria_id: 'cuenta-123',
      };

      await expect(service.registrarPago(tenantId, dto, userId)).rejects.toThrow(
        'Saldo insuficiente en la cuenta bancaria',
      );
    });

    it('should successfully register pago and update CxP to PAGADA when saldo becomes zero', async () => {
      mockQueryBuilder.maybeSingle
        .mockResolvedValueOnce({ data: mockCxp, error: null })
        .mockResolvedValueOnce({ data: mockCuentaBancaria, error: null });

      const updatedCxp = { ...mockCxp, saldo: 0, estado: 'PAGADA' };
      mockQueryBuilder.single
        .mockResolvedValueOnce({ data: updatedCxp, error: null })
        .mockResolvedValueOnce({
          data: { id: 'mov-123', monto: 1000 },
          error: null,
        });

      mockQueryBuilder.update.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.eq.mockReturnValue(mockQueryBuilder);

      const dto = {
        cxp_id: 'cxp-123',
        monto: 1000,
        fecha_pago: '2024-01-15',
        metodo_pago: 'TRANSFERENCIA',
        cuenta_bancaria_id: 'cuenta-123',
      };

      const result = await service.registrarPago(tenantId, dto, userId);

      expect(result.success).toBe(true);
      expect(result.data.cxp.estado).toBe('PAGADA');
      expect(result.data.cxp.saldo).toBe(0);
      expect(eventBusService.emitPagoProveedorRegistrado).toHaveBeenCalled();
    });

    it('should successfully register partial pago and update CxP to PARCIAL', async () => {
      mockQueryBuilder.maybeSingle
        .mockResolvedValueOnce({ data: mockCxp, error: null })
        .mockResolvedValueOnce({ data: mockCuentaBancaria, error: null });

      const updatedCxp = { ...mockCxp, saldo: 500, estado: 'PARCIAL' };
      mockQueryBuilder.single
        .mockResolvedValueOnce({ data: updatedCxp, error: null })
        .mockResolvedValueOnce({
          data: { id: 'mov-123', monto: 500 },
          error: null,
        });

      mockQueryBuilder.update.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.eq.mockReturnValue(mockQueryBuilder);

      const dto = {
        cxp_id: 'cxp-123',
        monto: 500,
        fecha_pago: '2024-01-15',
        metodo_pago: 'TRANSFERENCIA',
        cuenta_bancaria_id: 'cuenta-123',
      };

      const result = await service.registrarPago(tenantId, dto, userId);

      expect(result.success).toBe(true);
      expect(result.data.cxp.estado).toBe('PARCIAL');
      expect(result.data.cxp.saldo).toBe(500);
      expect(eventBusService.emitPagoProveedorRegistrado).toHaveBeenCalled();
    });

    it('should register pago without cuenta bancaria', async () => {
      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
        data: mockCxp,
        error: null,
      });

      const updatedCxp = { ...mockCxp, saldo: 0, estado: 'PAGADA' };
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: updatedCxp,
        error: null,
      });

      const dto = {
        cxp_id: 'cxp-123',
        monto: 1000,
        fecha_pago: '2024-01-15',
        metodo_pago: 'EFECTIVO',
      };

      const result = await service.registrarPago(tenantId, dto, userId);

      expect(result.success).toBe(true);
      expect(result.data.movimiento_bancario).toBeNull();
    });
  });

  describe('listarPagos', () => {
    const tenantId = 'tenant-123';

    it('should list pagos with default pagination', async () => {
      const mockPagos = [
        {
          id: 'mov-1',
          fecha: '2024-01-15',
          monto: 1000,
          metodo_pago: 'TRANSFERENCIA',
          cuenta_bancaria: { nombre: 'BCP' },
          proveedor: { razon_social: 'Proveedor 1' },
          cxp: { numero_documento: 'F001-123' },
        },
      ];

      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
        data: mockPagos,
        error: null,
        count: 1,
      });

      const result = await service.listarPagos(tenantId, {});

      expect(result.success).toBe(true);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('should apply filters correctly', async () => {
      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
        data: [],
        error: null,
        count: 0,
      });

      const query = {
        fecha_desde: '2024-01-01',
        fecha_hasta: '2024-01-31',
        proveedor_id: 'prov-123',
        cuenta_bancaria_id: 'cuenta-123',
        metodo_pago: 'TRANSFERENCIA',
        conciliado: true,
      };

      await service.listarPagos(tenantId, query);

      expect(mockQueryBuilder.gte).toHaveBeenCalledWith('fecha', '2024-01-01');
      expect(mockQueryBuilder.lte).toHaveBeenCalledWith('fecha', '2024-01-31');
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('proveedor_id', 'prov-123');
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('cuenta_bancaria_id', 'cuenta-123');
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('metodo_pago', 'TRANSFERENCIA');
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('conciliado', true);
    });

    it('should handle pagination correctly', async () => {
      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
        data: [],
        error: null,
        count: 100,
      });

      const result = await service.listarPagos(tenantId, { page: 2, limit: 20 });

      expect(result.page).toBe(2);
      expect(result.limit).toBe(20);
      expect(mockQueryBuilder.range).toHaveBeenCalledWith(20, 39);
    });
  });

  describe('obtenerProgramacionPagos', () => {
    const tenantId = 'tenant-123';

    it('should return programacion with urgencia classification', async () => {
      const hoy = new Date();
      const manana = new Date(hoy);
      manana.setDate(manana.getDate() + 1);

      const mockCxp = [
        {
          id: 'cxp-1',
          numero_documento: 'F001-123',
          fecha_vencimiento: manana.toISOString().split('T')[0],
          saldo: 1000,
          total: 1000,
          estado: 'PENDIENTE',
          proveedor: { razon_social: 'Proveedor 1' },
        },
      ];

      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnValue(
          Promise.resolve({
            data: mockCxp,
            error: null,
            count: 1,
          })
        ),
      };

      mockSupabaseClient.from.mockReturnValue(mockChain);

      const result = await service.obtenerProgramacionPagos(tenantId, {});

      expect(result.success).toBe(true);
      expect(result.data[0]).toHaveProperty('dias_hasta_vencimiento');
      expect(result.data[0]).toHaveProperty('urgencia');
    });

    it('should classify urgencia as VENCIDA for past dates', async () => {
      const ayer = new Date();
      ayer.setDate(ayer.getDate() - 1);

      const mockCxp = [
        {
          id: 'cxp-1',
          numero_documento: 'F001-123',
          fecha_vencimiento: ayer.toISOString().split('T')[0],
          saldo: 1000,
          total: 1000,
          estado: 'VENCIDA',
          proveedor: { razon_social: 'Proveedor 1' },
        },
      ];

      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnValue(
          Promise.resolve({
            data: mockCxp,
            error: null,
            count: 1,
          })
        ),
      };

      mockSupabaseClient.from.mockReturnValue(mockChain);

      const result = await service.obtenerProgramacionPagos(tenantId, {});

      expect(result.data[0].urgencia).toBe('VENCIDA');
      expect(result.data[0].dias_hasta_vencimiento).toBeLessThan(0);
    });

    it('should classify urgencia as HOY for today', async () => {
      const hoy = new Date();

      const mockCxp = [
        {
          id: 'cxp-1',
          numero_documento: 'F001-123',
          fecha_vencimiento: hoy.toISOString().split('T')[0],
          saldo: 1000,
          total: 1000,
          estado: 'PENDIENTE',
          proveedor: { razon_social: 'Proveedor 1' },
        },
      ];

      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnValue(
          Promise.resolve({
            data: mockCxp,
            error: null,
            count: 1,
          })
        ),
      };

      mockSupabaseClient.from.mockReturnValue(mockChain);

      const result = await service.obtenerProgramacionPagos(tenantId, {});

      expect(result.data[0].urgencia).toBe('HOY');
    });
  });

  describe('registrarPagoLote', () => {
    const tenantId = 'tenant-123';
    const userId = 'user-123';

    it('should throw BadRequestException if pagos array is empty', async () => {
      const dto = {
        cuenta_bancaria_id: 'cuenta-123',
        fecha_pago: '2024-01-15',
        metodo_pago: 'TRANSFERENCIA',
        pagos: [],
      };

      await expect(service.registrarPagoLote(tenantId, dto, userId)).rejects.toThrow(
        'Debe incluir al menos un pago en el lote',
      );
    });

    it('should successfully process pago lote', async () => {
      const mockResult = {
        success: true,
        total_procesado: 2000,
        cantidad_pagos: 2,
        pagos: [
          {
            cxp_id: 'cxp-1',
            numero_documento: 'F001-123',
            proveedor: 'Proveedor 1',
            monto: 1000,
            saldo_anterior: 1000,
            saldo_nuevo: 0,
            estado_anterior: 'PENDIENTE',
            estado_nuevo: 'PAGADA',
          },
          {
            cxp_id: 'cxp-2',
            numero_documento: 'F001-124',
            proveedor: 'Proveedor 2',
            monto: 1000,
            saldo_anterior: 1000,
            saldo_nuevo: 0,
            estado_anterior: 'PENDIENTE',
            estado_nuevo: 'PAGADA',
          },
        ],
      };

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: mockResult,
        error: null,
      });

      const dto = {
        cuenta_bancaria_id: 'cuenta-123',
        fecha_pago: '2024-01-15',
        metodo_pago: 'TRANSFERENCIA',
        pagos: [
          { cxp_id: 'cxp-1', monto: 1000 },
          { cxp_id: 'cxp-2', monto: 1000 },
        ],
      };

      const result = await service.registrarPagoLote(tenantId, dto, userId);

      expect(result.success).toBe(true);
      expect(result.data.cantidad_pagos).toBe(2);
      expect(eventBusService.emitPagoProveedorRegistrado).toHaveBeenCalledTimes(2);
    });

    it('should generate lote ID if not provided', async () => {
      const mockResult = {
        success: true,
        total_procesado: 1000,
        cantidad_pagos: 1,
        pagos: [
          {
            cxp_id: 'cxp-1',
            numero_documento: 'F001-123',
            proveedor: 'Proveedor 1',
            monto: 1000,
            saldo_anterior: 1000,
            saldo_nuevo: 0,
            estado_anterior: 'PENDIENTE',
            estado_nuevo: 'PAGADA',
          },
        ],
      };

      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: mockResult,
        error: null,
      });

      const dto = {
        cuenta_bancaria_id: 'cuenta-123',
        fecha_pago: '2024-01-15',
        metodo_pago: 'TRANSFERENCIA',
        pagos: [{ cxp_id: 'cxp-1', monto: 1000 }],
      };

      await service.registrarPagoLote(tenantId, dto, userId);

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'procesar_pago_lote',
        expect.objectContaining({
          p_referencia_lote: expect.stringContaining('LOTE-'),
        }),
      );
    });
  });

  describe('obtenerFlujoCaja', () => {
    const tenantId = 'tenant-123';

    it('should return flujo de caja projection', async () => {
      const mockCuentas = [
        {
          id: 'cuenta-1',
          nombre: 'BCP',
          banco: 'BCP',
          numero_cuenta: '123456',
          moneda: 'PEN',
          saldo: 10000,
          activa: true,
        },
      ];

      const mockCxp = [
        {
          id: 'cxp-1',
          fecha_vencimiento: '2024-01-20',
          saldo: 1000,
          moneda: 'PEN',
          numero_documento: 'F001-123',
          proveedor: { razon_social: 'Proveedor 1' },
        },
      ];

      // Mock for cuentas bancarias query - needs to support chaining .eq() twice
      const mockChainCuentas = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn(),
      };
      // First .eq() returns this, second .eq() returns the promise
      mockChainCuentas.eq
        .mockReturnValueOnce(mockChainCuentas)
        .mockReturnValue(Promise.resolve({ data: mockCuentas, error: null }));

      // Mock for CxP query
      const mockChainCxp = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnValue(
          Promise.resolve({ data: mockCxp, error: null })
        ),
      };

      // Mock for CxC query
      const mockChainCxc = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnValue(
          Promise.resolve({ data: [], error: null })
        ),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockChainCuentas)
        .mockReturnValueOnce(mockChainCxp)
        .mockReturnValueOnce(mockChainCxc);

      const result = await service.obtenerFlujoCaja(tenantId, {});

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('periodo');
      expect(result.data).toHaveProperty('cuentas_bancarias');
      expect(result.data).toHaveProperty('resumen');
      expect(result.data).toHaveProperty('proyeccion');
    });

    it('should return an empty flujo caja when there are no active cuentas bancarias', async () => {
      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const result = await service.obtenerFlujoCaja(tenantId, {});

      expect(result.success).toBe(true);
      expect(result.data.cuentas_bancarias).toEqual([]);
      expect(result.data.resumen).toEqual([]);
      expect(result.data.proyeccion).toEqual([]);
      expect(result.data.estadisticas).toEqual({
        total_movimientos: 0,
        total_cxp_pendientes: 0,
        total_cxc_pendientes: 0,
      });
    });

    it('should calculate resumen correctly', async () => {
      const mockCuentas = [
        {
          id: 'cuenta-1',
          nombre: 'BCP',
          banco: 'BCP',
          numero_cuenta: '123456',
          moneda: 'PEN',
          saldo: 10000,
          activa: true,
        },
      ];

      const mockCxp = [
        {
          id: 'cxp-1',
          fecha_vencimiento: '2024-01-20',
          saldo: 3000,
          moneda: 'PEN',
          numero_documento: 'F001-123',
          proveedor: { razon_social: 'Proveedor 1' },
        },
      ];

      // Mock for cuentas bancarias query - needs to support chaining .eq() twice
      const mockChainCuentas = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn(),
      };
      // First .eq() returns this, second .eq() returns the promise
      mockChainCuentas.eq
        .mockReturnValueOnce(mockChainCuentas)
        .mockReturnValue(Promise.resolve({ data: mockCuentas, error: null }));

      // Mock for CxP query
      const mockChainCxp = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnValue(
          Promise.resolve({ data: mockCxp, error: null })
        ),
      };

      // Mock for CxC query
      const mockChainCxc = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnValue(
          Promise.resolve({ data: [], error: null })
        ),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockChainCuentas)
        .mockReturnValueOnce(mockChainCxp)
        .mockReturnValueOnce(mockChainCxc);

      const result = await service.obtenerFlujoCaja(tenantId, {});

      expect(result.data.resumen).toHaveLength(1);
      expect(result.data.resumen[0].moneda).toBe('PEN');
      expect(result.data.resumen[0].saldo_actual).toBe(10000);
      expect(result.data.resumen[0].total_egresos).toBe(3000);
      expect(result.data.resumen[0].saldo_proyectado).toBe(7000);
    });

    it('should set alerta for SALDO_NEGATIVO', async () => {
      const mockCuentas = [
        {
          id: 'cuenta-1',
          nombre: 'BCP',
          banco: 'BCP',
          numero_cuenta: '123456',
          moneda: 'PEN',
          saldo: 1000,
          activa: true,
        },
      ];

      const mockCxp = [
        {
          id: 'cxp-1',
          fecha_vencimiento: '2024-01-20',
          saldo: 2000,
          moneda: 'PEN',
          numero_documento: 'F001-123',
          proveedor: { razon_social: 'Proveedor 1' },
        },
      ];

      // Mock for cuentas bancarias query - needs to support chaining .eq() twice
      const mockChainCuentas = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn(),
      };
      // First .eq() returns this, second .eq() returns the promise
      mockChainCuentas.eq
        .mockReturnValueOnce(mockChainCuentas)
        .mockReturnValue(Promise.resolve({ data: mockCuentas, error: null }));

      // Mock for CxP query
      const mockChainCxp = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnValue(
          Promise.resolve({ data: mockCxp, error: null })
        ),
      };

      // Mock for CxC query
      const mockChainCxc = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnValue(
          Promise.resolve({ data: [], error: null })
        ),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockChainCuentas)
        .mockReturnValueOnce(mockChainCxp)
        .mockReturnValueOnce(mockChainCxc);

      const result = await service.obtenerFlujoCaja(tenantId, {});

      expect(result.data.resumen[0].alerta).toBe('SALDO_NEGATIVO');
    });
  });
});




