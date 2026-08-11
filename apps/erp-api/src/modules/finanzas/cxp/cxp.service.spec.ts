import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CxpService } from './cxp.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { RetencionesValidationService } from '../shared/retenciones-validation.service';
import { TesoreriaService } from '../tesoreria/tesoreria.service';

describe('CxpService', () => {
  let service: CxpService;
  let supabaseService: SupabaseService;
  let eventBusService: EventBusService;
  let retencionesValidation: jest.Mocked<RetencionesValidationService>;

  const mockSupabaseClient = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    rpc: jest.fn(),
    single: jest.fn(),
    maybeSingle: jest.fn(),
  };

  const mockTesoreriaService = {
    registrarPago: jest.fn(),
  };

  mockSupabaseClient.rpc.mockImplementation(() => mockSupabaseClient.single());

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
        {
          provide: TesoreriaService,
          useValue: mockTesoreriaService,
        },
      ],
    }).compile();

    service = module.get<CxpService>(CxpService);
    supabaseService = module.get<SupabaseService>(SupabaseService);
    eventBusService = module.get<EventBusService>(EventBusService);
    retencionesValidation = module.get(RetencionesValidationService) as jest.Mocked<RetencionesValidationService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('crearCuentaPorPagar', () => {
    const tenantId = 'tenant-123';
    const userId = 'user-456';

    it('rechaza moneda extranjera sin tipo de cambio antes de persistir', async () => {
      await expect(service.crearCuentaPorPagar(tenantId, {
        proveedor_id: 'prov-001',
        numero_documento: 'F001-USD-1',
        fecha_emision: '2025-10-25',
        subtotal: 100,
        igv: 18,
        total: 118,
        moneda: 'USD',
      }, userId)).rejects.toThrow('tipo de cambio es obligatorio');

      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
    });

    it('rechaza nota de credito sin comprobante modificado completo', async () => {
      await expect(service.crearCuentaPorPagar(tenantId, {
        proveedor_id: 'prov-001',
        numero_documento: 'FC01-1',
        fecha_emision: '2025-10-25',
        subtotal: 100,
        igv: 18,
        total: 118,
        tipo_documento: '07',
      }, userId)).rejects.toThrow('comprobante modificado');

      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
    });

    it('should create a CxP successfully', async () => {
      const dto = {
        proveedor_id: 'prov-001',
        numero_documento: 'F001-00001',
        fecha_emision: '2025-10-25',
        subtotal: 1000,
        igv: 180,
        total: 1180,
      };

      const mockProveedor = {
        id: 'prov-001',
        razon_social: 'Proveedor Test',
      };

      const mockCxp = {
        id: 'cxp-001',
        ...dto,
        tenant_id: tenantId,
        saldo: 1180,
        estado: 'PENDIENTE',
        moneda: 'PEN',
      };

      mockSupabaseClient.single.mockResolvedValueOnce({ data: mockProveedor, error: null });
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      mockSupabaseClient.single.mockResolvedValueOnce({ data: mockCxp, error: null });

      const result = await service.crearCuentaPorPagar(tenantId, dto, userId);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockCxp);
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'crear_factura_proveedor_tx',
        expect.objectContaining({
          p_tenant_id: tenantId,
          p_event_id: expect.any(String),
          p_idempotency_key: expect.stringContaining(dto.numero_documento),
          p_cxp: expect.objectContaining({
            numero_documento: dto.numero_documento,
            total: dto.total,
          }),
        }),
      );
      expect(eventBusService.emitFacturaProveedorRegistrada).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if proveedor does not exist', async () => {
      const dto = {
        proveedor_id: 'prov-999',
        numero_documento: 'F001-00001',
        fecha_emision: '2025-10-25',
        subtotal: 1000,
        igv: 180,
        total: 1180,
      };

      mockSupabaseClient.single.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });

      await expect(service.crearCuentaPorPagar(tenantId, dto, userId)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if duplicate numero_documento exists', async () => {
      const dto = {
        proveedor_id: 'prov-001',
        numero_documento: 'F001-00001',
        fecha_emision: '2025-10-25',
        subtotal: 1000,
        igv: 180,
        total: 1180,
      };

      const mockProveedor = { id: 'prov-001', razon_social: 'Proveedor Test' };
      const mockExistente = { id: 'cxp-existing' };

      mockSupabaseClient.single.mockResolvedValueOnce({ data: mockProveedor, error: null });
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: mockExistente, error: null });

      await expect(service.crearCuentaPorPagar(tenantId, dto, userId)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if total does not match subtotal + igv', async () => {
      const dto = {
        proveedor_id: 'prov-001',
        numero_documento: 'F001-00001',
        fecha_emision: '2025-10-25',
        subtotal: 1000,
        igv: 180,
        total: 1500, // Incorrect total
      };

      const mockProveedor = { id: 'prov-001', razon_social: 'Proveedor Test' };

      mockSupabaseClient.single.mockResolvedValueOnce({ data: mockProveedor, error: null });
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      await expect(service.crearCuentaPorPagar(tenantId, dto, userId)).rejects.toThrow(BadRequestException);
    });

    it('should validate and persist fiscal adjustments for CxP', async () => {
      const dto = {
        proveedor_id: 'prov-001',
        numero_documento: 'F001-00002',
        fecha_emision: '2025-10-25',
        subtotal: 1000,
        igv: 180,
        total: 1180,
        retencion: 70.8,
        percepcion: 0,
        detraccion: 47.2,
        anticipo: 0,
      };

      const mockProveedor = {
        id: 'prov-001',
        razon_social: 'Proveedor Test',
      };
      const mockCxp = {
        id: 'cxp-002',
        ...dto,
        tenant_id: tenantId,
        saldo: 1062,
        retencion_total: 70.8,
        percepcion_total: 0,
        detraccion_total: 47.2,
        anticipo_total: 0,
        estado: 'PARCIAL',
        moneda: 'PEN',
      };

      retencionesValidation.obtenerConfiguracionEmpresa.mockResolvedValueOnce({
        aplicar_retencion: true,
        retencion_tasa: 6,
        aplicar_detraccion: true,
        detraccion_tasa: 4,
      });
      retencionesValidation.validarMontoPendiente.mockReturnValue({
        valido: true,
        montoEsperado: 1062,
      });
      mockSupabaseClient.single.mockResolvedValueOnce({ data: mockProveedor, error: null });
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      mockSupabaseClient.single.mockResolvedValueOnce({ data: mockCxp, error: null });

      const result = await service.crearCuentaPorPagar(tenantId, dto, userId);

      expect(result.success).toBe(true);
      expect(retencionesValidation.validarCalculoAjustes).toHaveBeenCalledWith(
        dto.total,
        expect.objectContaining({ retencion: 70.8, detraccion: 47.2 }),
        undefined,
        expect.objectContaining({ aplicar_retencion: true }),
      );
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'crear_factura_proveedor_tx',
        expect.objectContaining({
          p_cxp: expect.objectContaining({
            saldo: 1062,
            saldo_pendiente: 1062,
            retencion_total: 70.8,
            detraccion_total: 47.2,
            estado: 'PARCIAL',
          }),
        }),
      );
    });
  });

  describe('obtenerCuentaPorPagar', () => {
    const tenantId = 'tenant-123';
    const cxpId = 'cxp-001';

    it('should return a CxP by ID', async () => {
      const mockCxp = {
        id: cxpId,
        numero_documento: 'F001-00001',
        total: 1180,
        saldo: 1180,
        estado: 'PENDIENTE',
        proveedor: { id: 'prov-001', razon_social: 'Proveedor Test' },
      };

      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: mockCxp, error: null });

      const result = await service.obtenerCuentaPorPagar(tenantId, cxpId);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockCxp);
    });

    it('should throw NotFoundException if CxP does not exist', async () => {
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      await expect(service.obtenerCuentaPorPagar(tenantId, cxpId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('listarCuentasPorPagar', () => {
    const tenantId = 'tenant-123';

    it('should list all CxPs without filters', async () => {
      const mockCxps = [
        { id: 'cxp-001', numero_documento: 'F001-00001', total: 1180 },
        { id: 'cxp-002', numero_documento: 'F001-00002', total: 2360 },
      ];

      const mockQuery = {
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValueOnce({ data: mockCxps, error: null, count: mockCxps.length }),
      };

      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue(mockQuery),
      });

      const result = await service.listarCuentasPorPagar(tenantId, {});

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockCxps);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 50,
        total: 2,
        totalPages: 1,
      });
      expect(mockQuery.range).toHaveBeenCalledWith(0, 49);
    });

    // Note: Filtering test is covered by integration tests
    // Unit test mocking for complex query chains is challenging
  });

  describe('actualizarCuentaPorPagar', () => {
    const tenantId = 'tenant-123';
    const cxpId = 'cxp-001';
    const userId = 'user-456';

    it('should update a CxP successfully', async () => {
      const dto = {
        observaciones: 'Actualizado',
      };

      const mockCxpActualizada = {
        id: cxpId,
        estado: 'PENDIENTE',
        observaciones: 'Actualizado',
      };
      mockSupabaseClient.rpc.mockResolvedValueOnce({ data: { cuenta: mockCxpActualizada }, error: null });

      const result = await service.actualizarCuentaPorPagar(tenantId, cxpId, dto, userId, 'cxp-update-test-001');

      expect(result.success).toBe(true);
      expect(result.data.observaciones).toBe('Actualizado');
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('gestionar_cxp_tx', expect.objectContaining({
        p_action: 'UPDATE_TERMS', p_cxp_id: cxpId, p_actor_id: userId,
        p_idempotency_key: 'cxp-update-test-001',
      }));
      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
    });

    it('propaga validaciones transaccionales del writer', async () => {
      const dto = { observaciones: 'Test' };
      mockSupabaseClient.rpc.mockResolvedValueOnce({ data: null, error: { message: 'CXP_UPDATE_STATE_INVALID:PAGADA' } });
      await expect(service.actualizarCuentaPorPagar(tenantId, cxpId, dto, userId)).rejects.toThrow(BadRequestException);
    });
  });

  describe('aplicarPago', () => {
    const tenantId = 'tenant-123';
    const cxpId = 'cxp-001';
    const userId = 'user-456';

    it('delegates payment atomically to TesoreriaService', async () => {
      const dto = {
        monto: 500,
        fecha_pago: '2025-10-25',
        metodo_pago: 'TRANSFERENCIA',
        cuenta_bancaria_id: '11111111-1111-4111-8111-111111111111',
        referencia: 'OP-001',
        idempotency_key: 'cxp-payment-attempt-001',
      };

      const writerResult = {
        success: true,
        data: { cxp: { id: cxpId, saldo: 680, estado: 'PARCIAL' } },
      };
      mockTesoreriaService.registrarPago.mockResolvedValueOnce(writerResult);

      const result = await service.aplicarPago(tenantId, cxpId, dto, userId);

      expect(result).toBe(writerResult);
      expect(mockTesoreriaService.registrarPago).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({
          cxp_id: cxpId,
          monto: 500,
          fecha_pago: '2025-10-25',
          idempotency_key: 'cxp-payment-attempt-001',
        }),
        userId,
      );
      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
      expect(eventBusService.emitPagoProveedorRegistrado).not.toHaveBeenCalled();
    });

    it('propagates writer failures without an event-based fallback', async () => {
      const dto = {
        monto: 500,
        fecha_pago: '2025-10-25',
        metodo_pago: 'TRANSFERENCIA',
        idempotency_key: 'cxp-payment-attempt-002',
      };
      mockTesoreriaService.registrarPago.mockRejectedValueOnce(new Error('rollback outbox'));

      await expect(service.aplicarPago(tenantId, cxpId, dto, userId)).rejects.toThrow('rollback outbox');
      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
      expect(eventBusService.emitPagoProveedorRegistrado).not.toHaveBeenCalled();
    });

    it('propagates writer validation for an invalid amount', async () => {
      const dto = {
        monto: 0,
        fecha_pago: '2025-10-25',
        metodo_pago: 'TRANSFERENCIA',
        idempotency_key: 'cxp-payment-attempt-003',
      };
      mockTesoreriaService.registrarPago.mockRejectedValueOnce(
        new BadRequestException('El monto del pago debe ser mayor a 0'),
      );

      await expect(service.aplicarPago(tenantId, cxpId, dto, userId)).rejects.toThrow(BadRequestException);
      expect(mockTesoreriaService.registrarPago).toHaveBeenCalledTimes(1);
    });
  });

  describe('anularCuentaPorPagar', () => {
    const tenantId = 'tenant-123';
    const cxpId = 'cxp-001';
    const userId = 'user-456';

    it('should anular a CxP successfully', async () => {
      const dto = {
        motivo: 'Error en factura',
        observaciones: 'Factura duplicada',
      };

      const mockCxpAnulada = {
        id: cxpId,
        estado: 'ANULADA',
      };
      mockSupabaseClient.rpc.mockResolvedValueOnce({ data: { cuenta: mockCxpAnulada }, error: null });

      const result = await service.anularCuentaPorPagar(tenantId, cxpId, dto, userId, 'cxp-cancel-test-001');

      expect(result.success).toBe(true);
      expect(result.data.estado).toBe('ANULADA');
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('gestionar_cxp_tx', expect.objectContaining({
        p_action: 'CANCEL', p_cxp_id: cxpId, p_idempotency_key: 'cxp-cancel-test-001',
      }));
      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
    });

    it('propaga rechazo cuando ya está anulada o tiene pagos', async () => {
      const dto = {
        motivo: 'Error en factura',
      };
      mockSupabaseClient.rpc.mockResolvedValueOnce({ data: null, error: { message: 'CXP_ALREADY_CANCELLED' } });
      await expect(service.anularCuentaPorPagar(tenantId, cxpId, dto, userId)).rejects.toThrow(BadRequestException);
    });
  });

  describe('obtenerAgingCxp', () => {
    const tenantId = 'tenant-123';

    it('should generate aging report correctly', async () => {
      const mockCxps = [
        {
          id: 'cxp-001',
          proveedor_id: 'prov-001',
          numero_documento: 'F001-00001',
          fecha_emision: '2025-09-01',
          fecha_vencimiento: '2025-10-01',
          saldo: 1000,
          total: 1000,
          moneda: 'PEN',
          estado: 'VENCIDA',
          proveedor: { id: 'prov-001', razon_social: 'Proveedor 1', ruc: '12345678901' },
        },
        {
          id: 'cxp-002',
          proveedor_id: 'prov-001',
          numero_documento: 'F001-00002',
          fecha_emision: '2025-08-01',
          fecha_vencimiento: '2025-09-01',
          saldo: 2000,
          total: 2000,
          moneda: 'PEN',
          estado: 'VENCIDA',
          proveedor: { id: 'prov-001', razon_social: 'Proveedor 1', ruc: '12345678901' },
        },
      ];

      const mockQuery = {
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValueOnce({ data: mockCxps, error: null }),
      };

      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue(mockQuery),
      });

      const result = await service.obtenerAgingCxp(tenantId);

      expect(result.success).toBe(true);
      expect(result.data.resumen).toBeDefined();
      expect(result.data.por_proveedor).toBeDefined();
      expect(result.data.detalle).toBeDefined();
    });

    it('should return empty report when no CxPs exist', async () => {
      const mockQuery = {
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValueOnce({ data: [], error: null }),
      };

      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue(mockQuery),
      });

      const result = await service.obtenerAgingCxp(tenantId);

      expect(result.success).toBe(true);
      expect(result.data.resumen.total.cantidad).toBe(0);
      expect(result.data.resumen.total.monto).toBe(0);
    });
  });

  describe('obtenerProximosVencimientos', () => {
    const tenantId = 'tenant-123';

    it('should return upcoming vencimientos', async () => {
      const mockCxps = [
        {
          id: 'cxp-001',
          proveedor_id: 'prov-001',
          numero_documento: 'F001-00001',
          fecha_emision: '2025-10-15',
          fecha_vencimiento: '2025-11-15',
          condiciones_pago: 'CREDITO_30',
          dias_credito: 30,
          subtotal: 847.46,
          igv: 152.54,
          saldo: 1000,
          total: 1000,
          moneda: 'PEN',
          estado: 'PENDIENTE',
          observaciones: null,
          proveedor: { id: 'prov-001', razon_social: 'Proveedor 1' },
          orden: null,
        },
      ];

      const mockQuery = {
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValueOnce({ data: mockCxps, error: null }),
      };

      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue(mockQuery),
      });

      const result = await service.obtenerProximosVencimientos(tenantId, { dias: 30 });

      expect(result.success).toBe(true);
      expect(result.data.vencimientos).toBeDefined();
      expect(result.data.resumen).toBeDefined();
    });
  });

  describe('obtenerProveedoresMayorDeuda', () => {
    const tenantId = 'tenant-123';

    it('should return proveedores ranked by debt', async () => {
      const mockCxps = [
        {
          proveedor_id: 'prov-001',
          saldo: 5000,
          moneda: 'PEN',
          proveedor: { id: 'prov-001', razon_social: 'Proveedor 1', ruc: '12345678901', email: 'prov1@test.com', telefono: '123456789' },
        },
        {
          proveedor_id: 'prov-002',
          saldo: 3000,
          moneda: 'PEN',
          proveedor: { id: 'prov-002', razon_social: 'Proveedor 2', ruc: '98765432109', email: 'prov2@test.com', telefono: '987654321' },
        },
      ];

      const mockQuery = {
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValueOnce({ data: mockCxps, error: null }),
      };

      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue(mockQuery),
      });

      const result = await service.obtenerProveedoresMayorDeuda(tenantId, 10);

      expect(result.success).toBe(true);
      expect(result.data.proveedores).toBeDefined();
      expect(result.data.proveedores.length).toBeGreaterThan(0);
    });
  });

  describe('aplicarDevolucionProveedorEmitida', () => {
    it('bloquea el writer legacy porque la devolución 450 ya ajusta CxP atómicamente', async () => {
      const tenantId = 'tenant-123';
      await expect(service.aplicarDevolucionProveedorEmitida(tenantId, {
        devolucionId: 'dev-1',
        numeroDevolucion: 'DEV-001',
        ordenId: 'oc-1',
        recepcionId: 'rec-1',
        proveedorId: 'prov-1',
        proveedorNombre: 'Proveedor SA',
        fechaDevolucion: '2025-11-16',
        motivo: 'CANCELACION_OC',
        subtotal: 200,
        igv: 36,
        total: 236,
        moneda: 'USD',
        items: [],
        emitidoEn: new Date().toISOString(),
        tenantId,
        idempotencyKey: 'devolucion:tenant-123:dev-1',
      })).rejects.toThrow('RPC atómica de devolución');
      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
    });
  });
});
