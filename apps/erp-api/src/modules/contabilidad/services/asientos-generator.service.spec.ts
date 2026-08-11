import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AsientoContable, AsientosGeneratorService } from './asientos-generator.service';
import { PeriodosService, EstadoPeriodo } from './periodos.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { PlanCuentasService, PlanCuenta } from './plan-cuentas.service';
import { DocumentoFiscalGeneradoEvent } from '../../../shared/events/event-bus.service';

describe('AsientosGeneratorService', () => {
  let service: AsientosGeneratorService;
  let periodosService: jest.Mocked<PeriodosService>;
  let supabaseService: jest.Mocked<SupabaseService>;
  let planCuentasService: jest.Mocked<PlanCuentasService>;

  let mockSupabaseClient: any;

  const createMockSupabaseClient = () => {
    const mock: any = {
      from: jest.fn(),
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      eq: jest.fn(),
      gte: jest.fn(),
      lt: jest.fn(),
      order: jest.fn(),
      limit: jest.fn(),
      single: jest.fn(),
      maybeSingle: jest.fn(),
      rpc: jest.fn()
    };

    // Make all methods return the mock itself for chaining
    const returnMock = () => mock;
    mock.from.mockImplementation(returnMock);
    mock.select.mockImplementation(returnMock);
    mock.insert.mockImplementation(returnMock);
    mock.update.mockImplementation(returnMock);
    mock.delete.mockImplementation(returnMock);
    mock.eq.mockImplementation(returnMock);
    mock.gte.mockImplementation(returnMock);
    mock.lt.mockImplementation(returnMock);
    mock.order.mockImplementation(returnMock);
    mock.limit.mockImplementation(returnMock);
    mock.maybeSingle.mockImplementation(returnMock);
    mock.rpc.mockImplementation((fn: string) => {
      if (fn === 'crear_asiento_con_detalles_tx') {
        return mock.single();
      }

      if (fn === 'obtener_siguiente_numero_asiento') {
        return Promise.resolve({
          data: [{ numero: 1, codigo: 'A-202410-000001' }],
          error: null,
        });
      }

      return Promise.resolve({ data: true, error: null });
    });

    return mock;
  };

  beforeEach(async () => {
    mockSupabaseClient = createMockSupabaseClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AsientosGeneratorService,
        {
          provide: PeriodosService,
          useValue: {
            validarPeriodoAbierto: jest.fn()
          }
        },
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn(() => mockSupabaseClient)
          }
        },
        {
          provide: PlanCuentasService,
          useValue: {
            obtenerCuentasPorCodigos: jest.fn(),
            buscarCuentaPorCodigoONombre: jest.fn().mockResolvedValue(null)
          }
        }
      ]
    }).compile();

    service = module.get<AsientosGeneratorService>(AsientosGeneratorService);
    periodosService = module.get(PeriodosService) as jest.Mocked<PeriodosService>;
    supabaseService = module.get(SupabaseService) as jest.Mocked<SupabaseService>;
    planCuentasService = module.get(PlanCuentasService) as jest.Mocked<PlanCuentasService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Helper function to create mock PlanCuenta
  const createMockPlanCuenta = (codigo: string, nombre: string, tipo: PlanCuenta['tipo'] = 'ACTIVO'): PlanCuenta => ({
    id: `cuenta-${codigo}`,
    tenant_id: 'test-tenant-id',
    codigo,
    nombre,
    tipo,
    nivel: 1,
    acepta_movimiento: true,
    estado: 'ACTIVO'
  });

  describe('generarAsiento', () => {
    const tenantId = 'test-tenant-id';
    const fecha = new Date('2024-10-15');
    const concepto = 'Asiento de prueba';
    const detalles = [
      { cuenta_id: '10', debe: 1000, haber: 0, concepto: 'Caja' },
      { cuenta_id: '70', debe: 0, haber: 1000, concepto: 'Ventas' }
    ];

    it('debe validar período abierto antes de crear asiento', async () => {
      periodosService.validarPeriodoAbierto.mockResolvedValue();

      const asientoCreado = {
        id: 'asiento-1',
        tenant_id: tenantId,
        numero_asiento: 'A-202410-0001',
        fecha: fecha.toISOString(),
        concepto,
        total_debe: 1000,
        total_haber: 1000,
        estado: 'CONFIRMADO'
      };

      // Mock para obtener último número de asiento (limit(1) - no usa single)
      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: [],
        error: null
      });

      // Mock para crear asiento (usa .single())
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: asientoCreado,
        error: null
      });

      await service.generarAsiento(tenantId, fecha, concepto, detalles);

      expect(periodosService.validarPeriodoAbierto).toHaveBeenCalledWith(
        tenantId,
        fecha
      );
    });

    it('debe lanzar error si el período está cerrado', async () => {
      periodosService.validarPeriodoAbierto.mockRejectedValue(
        new BadRequestException('El período contable 2024-10 está CERRADO')
      );

      await expect(
        service.generarAsiento(tenantId, fecha, concepto, detalles)
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.generarAsiento(tenantId, fecha, concepto, detalles)
      ).rejects.toThrow('El período contable 2024-10 está CERRADO');
    });

    it('debe lanzar error si el asiento no cuadra', async () => {
      periodosService.validarPeriodoAbierto.mockResolvedValue();

      const detallesDescuadrados = [
        { cuenta_id: '10', debe: 1000, haber: 0, concepto: 'Caja' },
        { cuenta_id: '70', debe: 0, haber: 900, concepto: 'Ventas' }
      ];

      await expect(
        service.generarAsiento(tenantId, fecha, concepto, detallesDescuadrados)
      ).rejects.toThrow('El asiento no cuadra');
    });

    it('no usa advisory locks de sesión para eventos contables', async () => {
      periodosService.validarPeriodoAbierto.mockResolvedValue();
      const sourceEventId = 'event-no-session-lock';
      const asientoCreado = {
        id: 'asiento-session-lock',
        tenant_id: tenantId,
        numero_asiento: 1,
        codigo: 'A-202410-000001',
        fecha: fecha.toISOString(),
        concepto,
        total_debe: 1000,
        total_haber: 1000,
        estado: 'CONFIRMADO',
        source_event_id: sourceEventId,
      };

      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: null,
          error: { code: 'PGRST116', message: 'No rows found' },
        })
        .mockResolvedValueOnce({ data: asientoCreado, error: null })
        .mockResolvedValueOnce({ data: asientoCreado, error: null });

      await service.generarAsiento(tenantId, fecha, concepto, detalles, 'REF-LOCK', sourceEventId);

      expect(mockSupabaseClient.rpc).not.toHaveBeenCalledWith('obtener_siguiente_numero_asiento', expect.anything());
      expect(mockSupabaseClient.rpc).not.toHaveBeenCalledWith('acquire_pos_lock', expect.anything());
      expect(mockSupabaseClient.rpc).not.toHaveBeenCalledWith('release_pos_lock', expect.anything());
    });

    it('debe crear asiento correctamente cuando el período está abierto', async () => {
      periodosService.validarPeriodoAbierto.mockResolvedValue();

      const asientoCreado = {
        id: 'asiento-1',
        tenant_id: tenantId,
        numero_asiento: 'A-202410-0001',
        fecha: fecha.toISOString(),
        concepto,
        total_debe: 1000,
        total_haber: 1000,
        estado: 'CONFIRMADO'
      };

      // Mock para obtener último número de asiento (limit(1) - no usa single)
      // Esta llamada retorna directamente sin single()
      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: [],
        error: null
      });

      // Mock para crear asiento (usa .single())
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: asientoCreado,
        error: null
      });

      const resultado = await service.generarAsiento(
        tenantId,
        fecha,
        concepto,
        detalles
      );

      expect(resultado).toEqual(asientoCreado);
      expect(periodosService.validarPeriodoAbierto).toHaveBeenCalled();
    });

    it('debe implementar idempotencia con source_event_id', async () => {
      const sourceEventId = 'event-123';
      const asientoExistente = {
        id: 'asiento-1',
        tenant_id: tenantId,
        numero_asiento: 'A-202410-0001',
        fecha: fecha.toISOString(),
        concepto,
        total_debe: 1000,
        total_haber: 1000,
        estado: 'CONFIRMADO',
        source_event_id: sourceEventId
      };

      periodosService.validarPeriodoAbierto.mockResolvedValue();

      // Mock para buscar asiento existente por evento - debe retornar el asiento existente
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: asientoExistente,
        error: null
      });

      const resultado = await service.generarAsiento(
        tenantId,
        fecha,
        concepto,
        detalles,
        undefined,
        sourceEventId
      );

      expect(resultado).toEqual(asientoExistente);
      expect(resultado.source_event_id).toBe(sourceEventId);
      // No debe intentar crear un nuevo asiento
      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
    });

    it('debe crear asiento con source_event_id cuando no existe uno previo', async () => {
      const sourceEventId = 'event-new-123';

      periodosService.validarPeriodoAbierto.mockResolvedValue();

      // Mock para buscar asiento existente por evento - no existe
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' }
      });

      // Mock para obtener último número de asiento
      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: [],
        error: null
      });

      const asientoCreado = {
        id: 'asiento-new-1',
        tenant_id: tenantId,
        numero_asiento: 'A-202410-0001',
        fecha: fecha.toISOString(),
        concepto,
        total_debe: 1000,
        total_haber: 1000,
        estado: 'CONFIRMADO',
        source_event_id: sourceEventId
      };

      // Mock para crear asiento
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: asientoCreado,
        error: null
      });

      const resultado = await service.generarAsiento(
        tenantId,
        fecha,
        concepto,
        detalles,
        undefined,
        sourceEventId
      );

      expect(resultado).toEqual(asientoCreado);
      expect(resultado.source_event_id).toBe(sourceEventId);
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'crear_asiento_con_detalles_tx',
        expect.objectContaining({
          p_asiento: expect.objectContaining({ source_event_id: sourceEventId }),
          p_detalles: expect.arrayContaining(
            detalles.map(detalle => expect.objectContaining(detalle))
          )
        })
      );
    });

    it('debe rechazar source_event_id duplicado en lugar de crear otro asiento', async () => {
      const sourceEventId = 'event-duplicado-corrupto';

      periodosService.validarPeriodoAbierto.mockResolvedValue();

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: {
          code: 'PGRST116',
          details: 'Results contain 3 rows, application/vnd.pgrst.object+json requires 1 row',
          message: 'JSON object requested, multiple (or no) rows returned',
        },
      });

      await expect(
        service.generarAsiento(
          tenantId,
          fecha,
          concepto,
          detalles,
          undefined,
          sourceEventId
        )
      ).rejects.toThrow('Idempotencia contable corrupta');

      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
    });

    it('debe retornar el asiento existente si la inserción detecta source_event_id duplicado', async () => {
      const sourceEventId = 'event-race-123';
      const asientoExistente = {
        id: 'asiento-race-1',
        tenant_id: tenantId,
        numero_asiento: 1001,
        codigo: 'A-202410-001001',
        fecha: fecha.toISOString(),
        concepto,
        total_debe: 1000,
        total_haber: 1000,
        estado: 'CONFIRMADO',
        source_event_id: sourceEventId
      };

      periodosService.validarPeriodoAbierto.mockResolvedValue();

      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: null,
          error: { code: 'PGRST116' }
        })
        .mockResolvedValueOnce({
          data: null,
          error: {
            code: '23505',
            details: `Key (tenant_id, source_event_id)=(${tenantId}, ${sourceEventId}) already exists.`,
            message: 'duplicate key value violates unique constraint "idx_asientos_contables_tenant_source_event_unique"'
          }
        })
        .mockResolvedValueOnce({
          data: asientoExistente,
          error: null
        });

      const resultado = await service.generarAsiento(
        tenantId,
        fecha,
        concepto,
        detalles,
        undefined,
        sourceEventId
      );

      expect(resultado).toEqual(asientoExistente);
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'crear_asiento_con_detalles_tx',
        expect.any(Object)
      );
      expect(mockSupabaseClient.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' })
      );
    });

    it('no debe degradar a fallido un evento que ya fue completado por otro worker', async () => {
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: {
          retry_count: 0,
          status: 'completed'
        },
        error: null
      });

      await service.marcarEventoComoFallido('event-completed', 'Tipo de evento no manejado');

      expect(mockSupabaseClient.update).not.toHaveBeenCalled();
    });

    it('debe procesar múltiples intentos del mismo evento retornando el mismo asiento', async () => {
      const sourceEventId = 'event-duplicate-123';
      const asientoExistente = {
        id: 'asiento-duplicate-1',
        tenant_id: tenantId,
        numero_asiento: 'A-202410-0001',
        fecha: fecha.toISOString(),
        concepto,
        total_debe: 1000,
        total_haber: 1000,
        estado: 'CONFIRMADO',
        source_event_id: sourceEventId
      };

      periodosService.validarPeriodoAbierto.mockResolvedValue();

      // Primer intento - buscar asiento existente
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: asientoExistente,
        error: null
      });

      const resultado1 = await service.generarAsiento(
        tenantId,
        fecha,
        concepto,
        detalles,
        undefined,
        sourceEventId
      );

      // Segundo intento - buscar asiento existente
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: asientoExistente,
        error: null
      });

      const resultado2 = await service.generarAsiento(
        tenantId,
        fecha,
        concepto,
        detalles,
        undefined,
        sourceEventId
      );

      // Ambos resultados deben ser idénticos
      expect(resultado1).toEqual(resultado2);
      expect(resultado1.id).toBe(asientoExistente.id);
      expect(resultado2.id).toBe(asientoExistente.id);
      // No debe intentar crear nuevos asientos
      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
    });
  });

  describe('generarAsientoVenta', () => {
    it('debe generar asiento de venta correctamente', async () => {
      const evento = {
        tenant_id: 'test-tenant-id',
        fecha: '2024-10-15',
        total: 1180,
        base_imponible: 1000,
        igv: 180,
        costo_ventas: 600,
        referencia: 'F001-00001',
        event_id: 'event-venta-1'
      };

      periodosService.validarPeriodoAbierto.mockResolvedValue();

      // Mock para obtener cuentas del plan
      const mockCuentas = new Map([
        ['12', createMockPlanCuenta('12', 'Clientes', 'ACTIVO')],
        ['70', createMockPlanCuenta('70', 'Ventas', 'INGRESO')],
        ['40', createMockPlanCuenta('40', 'IGV', 'PASIVO')],
        ['69', createMockPlanCuenta('69', 'Costo de Ventas', 'GASTO')],
        ['20', createMockPlanCuenta('20', 'Mercaderías', 'ACTIVO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      const asientoCreado = {
        id: 'asiento-venta-1',
        numero_asiento: 'A-202410-0001',
        total_debe: 1780,
        total_haber: 1780
      };

      // Mock para buscar asiento existente por evento (usa .single())
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' }
      });

      // Mock para obtener último número de asiento (usa .limit(1))
      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: [],
        error: null
      });

      // Mock para crear asiento (usa .single())
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: asientoCreado,
        error: null
      });

      const resultado = await service.generarAsientoVenta(evento);

      expect(resultado).toBeDefined();
      expect(periodosService.validarPeriodoAbierto).toHaveBeenCalled();
      expect(planCuentasService.obtenerCuentasPorCodigos).toHaveBeenCalledWith(
        evento.tenant_id,
        // '10' (Caja) se agregó para poder debitar Caja en ventas al contado.
        ['12', '70', '40', '69', '20', '10']
      );
    });

    it('debe generar asiento de venta con centro de costo', async () => {
      const evento = {
        tenant_id: 'test-tenant-id',
        fecha: '2024-10-15',
        total: 1180,
        base_imponible: 1000,
        igv: 180,
        costo_ventas: 600,
        centro_costo_id: 'centro-1',
        referencia: 'F001-00001',
        event_id: 'event-venta-2'
      };

      periodosService.validarPeriodoAbierto.mockResolvedValue();

      const mockCuentas = new Map([
        ['12', createMockPlanCuenta('12', 'Clientes', 'ACTIVO')],
        ['70', createMockPlanCuenta('70', 'Ventas', 'INGRESO')],
        ['40', createMockPlanCuenta('40', 'IGV', 'PASIVO')],
        ['69', createMockPlanCuenta('69', 'Costo de Ventas', 'GASTO')],
        ['20', createMockPlanCuenta('20', 'Mercaderías', 'ACTIVO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      const asientoCreado = {
        id: 'asiento-venta-2',
        numero_asiento: 'A-202410-0002',
        total_debe: 1780,
        total_haber: 1780
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' }
      });

      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: [],
        error: null
      });

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: asientoCreado,
        error: null
      });

      const resultado = await service.generarAsientoVenta(evento);

      expect(resultado).toBeDefined();
      expect(resultado.id).toBe('asiento-venta-2');
    });

    it('distribuye una venta POS mixta entre caja, tarjeta y CxC sin tratar todo como contado', async () => {
      const evento = {
        tenant_id: 'test-tenant-id',
        fecha: '2026-08-09',
        total: 118,
        base_imponible: 100,
        igv: 18,
        monto_pendiente: 30,
        referencia: 'B001-00000042',
        es_contado: false,
        cobros: [
          { tipo: 'EFECTIVO', monto: 40 },
          { tipo: 'TARJETA', monto: 48 },
          { tipo: 'CREDITO', monto: 30 },
        ],
      };
      periodosService.validarPeriodoAbierto.mockResolvedValue();
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(new Map([
        ['12', createMockPlanCuenta('12', 'Clientes', 'ACTIVO')],
        ['70', createMockPlanCuenta('70', 'Ventas', 'INGRESO')],
        ['40', createMockPlanCuenta('40', 'IGV', 'PASIVO')],
        ['69', createMockPlanCuenta('69', 'Costo de Ventas', 'GASTO')],
        ['20', createMockPlanCuenta('20', 'Mercaderías', 'ACTIVO')],
        ['10', createMockPlanCuenta('10', 'Caja y bancos', 'ACTIVO')],
      ]));
      planCuentasService.buscarCuentaPorCodigoONombre.mockImplementation(
        async (_tenantId, criteria: any) =>
          createMockPlanCuenta(criteria.codigos[0], `Cuenta ${criteria.codigos[0]}`, 'ACTIVO'),
      );
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: 'asiento-pos-mixto', total_debe: 118, total_haber: 118 },
        error: null,
      });

      const resultado = await service.generarAsientoVenta(evento);

      expect(resultado.id).toBe('asiento-pos-mixto');
      const rpc = mockSupabaseClient.rpc.mock.calls.find(
        ([fn]: [string]) => fn === 'crear_asiento_con_detalles_tx',
      );
      expect(rpc?.[1].p_detalles).toEqual(expect.arrayContaining([
        expect.objectContaining({ cuenta_id: 'cuenta-10111', debe: 40, haber: 0 }),
        expect.objectContaining({ cuenta_id: 'cuenta-10411', debe: 48, haber: 0 }),
        expect.objectContaining({ cuenta_id: 'cuenta-12', debe: 30, haber: 0 }),
        expect.objectContaining({ cuenta_id: 'cuenta-70', debe: 0, haber: 100 }),
        expect.objectContaining({ cuenta_id: 'cuenta-40', debe: 0, haber: 18 }),
      ]));
    });
  });

  describe('generarAsientoCierreCaja', () => {
    it('contabiliza un faltante debitando resultado y acreditando la caja física', async () => {
      periodosService.validarPeriodoAbierto.mockResolvedValue();
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(new Map([
        ['10', createMockPlanCuenta('10', 'Caja y bancos', 'ACTIVO')],
        ['65', createMockPlanCuenta('65', 'Otros gastos', 'GASTO')],
        ['75', createMockPlanCuenta('75', 'Otros ingresos', 'INGRESO')],
      ]));
      planCuentasService.buscarCuentaPorCodigoONombre.mockResolvedValue(
        createMockPlanCuenta('10111', 'Caja principal', 'ACTIVO'),
      );
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: 'asiento-cierre-1', total_debe: 5.25, total_haber: 5.25 },
        error: null,
      });

      const resultado = await service.generarAsientoCierreCaja({
        tenant_id: 'test-tenant-id',
        fecha: '2026-08-09T18:00:00Z',
        diferencia: -5.25,
        referencia: 'CIERRE-CAJA-sesion-1',
        cuenta_caja_codigo: '10111',
      });

      expect(resultado?.id).toBe('asiento-cierre-1');
      const rpc = mockSupabaseClient.rpc.mock.calls.find(
        ([fn]: [string]) => fn === 'crear_asiento_con_detalles_tx',
      );
      expect(rpc?.[1].p_detalles).toEqual(expect.arrayContaining([
        expect.objectContaining({ cuenta_id: 'cuenta-65', debe: 5.25, haber: 0 }),
        expect.objectContaining({ cuenta_id: 'cuenta-10111', debe: 0, haber: 5.25 }),
      ]));
    });
  });

  describe('generarAsientoCobro', () => {
    it('debe generar asiento de cobro correctamente', async () => {
      const evento = {
        tenant_id: 'test-tenant-id',
        fecha: '2024-10-15',
        monto: 1180,
        referencia: 'COBRO-001',
        event_id: 'event-cobro-1'
      };

      periodosService.validarPeriodoAbierto.mockResolvedValue();

      const mockCuentas = new Map([
        ['10', createMockPlanCuenta('10', 'Bancos/Caja', 'ACTIVO')],
        ['12', createMockPlanCuenta('12', 'Clientes', 'ACTIVO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      const asientoCreado = {
        id: 'asiento-cobro-1',
        numero_asiento: 'A-202410-0003',
        total_debe: 1180,
        total_haber: 1180
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' }
      });

      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: [],
        error: null
      });

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: asientoCreado,
        error: null
      });

      const resultado = await service.generarAsientoCobro(evento);

      expect(resultado).toBeDefined();
      expect(resultado.id).toBe('asiento-cobro-1');
      expect(planCuentasService.obtenerCuentasPorCodigos).toHaveBeenCalledWith(
        evento.tenant_id,
        ['10', '12']
      );
    });
  });

  describe('generarAsientoCompra', () => {
    it('debe generar asiento de compra correctamente', async () => {
      const evento = {
        tenant_id: 'test-tenant-id',
        fecha: '2024-10-15',
        total: 1180,
        costo: 1000,
        igv: 180,
        referencia: 'OC-001',
        event_id: 'event-compra-1'
      };

      periodosService.validarPeriodoAbierto.mockResolvedValue();

      const mockCuentas = new Map([
        ['20', createMockPlanCuenta('20', 'Mercaderías', 'ACTIVO')],
        ['40', createMockPlanCuenta('40', 'IGV Crédito Fiscal', 'ACTIVO')],
        ['42', createMockPlanCuenta('42', 'Proveedores', 'PASIVO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      const asientoCreado = {
        id: 'asiento-compra-1',
        numero_asiento: 'A-202410-0004',
        total_debe: 1180,
        total_haber: 1180
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' }
      });

      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: [],
        error: null
      });

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: asientoCreado,
        error: null
      });

      const resultado = await service.generarAsientoCompra(evento);

      expect(resultado).toBeDefined();
      expect(resultado.id).toBe('asiento-compra-1');
      expect(planCuentasService.obtenerCuentasPorCodigos).toHaveBeenCalledWith(
        evento.tenant_id,
        ['20', '40', '42']
      );
    });

    it('debe validar que el asiento de compra cuadra (debe = haber)', async () => {
      const evento = {
        tenant_id: 'test-tenant-id',
        fecha: '2024-10-15',
        total: 1180,
        costo: 1000,
        igv: 180,
        referencia: 'OC-002',
        event_id: 'event-compra-2'
      };

      periodosService.validarPeriodoAbierto.mockResolvedValue();

      const mockCuentas = new Map([
        ['20', createMockPlanCuenta('20', 'Mercaderías', 'ACTIVO')],
        ['40', createMockPlanCuenta('40', 'IGV Crédito Fiscal', 'ACTIVO')],
        ['42', createMockPlanCuenta('42', 'Proveedores', 'PASIVO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      const asientoCreado = {
        id: 'asiento-compra-2',
        numero_asiento: 'A-202410-0005',
        total_debe: 1180,
        total_haber: 1180
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' }
      });

      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: [],
        error: null
      });

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: asientoCreado,
        error: null
      });

      const resultado = await service.generarAsientoCompra(evento);

      // Validar que el asiento cuadra
      expect(resultado.total_debe).toBe(resultado.total_haber);
      expect(resultado.total_debe).toBe(1180);
      expect(resultado.total_haber).toBe(1180);

      // Validar que la suma de debe = costo + igv
      const totalDebe = evento.costo + evento.igv;
      expect(totalDebe).toBe(evento.total);
      expect(resultado.total_debe).toBe(totalDebe);
    });
  });

  describe('generarAsientoRecepcion', () => {
    it('clasifica bienes físicos y servicios sin reconocer IGV ni CxP', async () => {
      const cuentas = new Map([
        ['20', createMockPlanCuenta('20', 'Mercaderías', 'ACTIVO')],
        ['63', createMockPlanCuenta('63', 'Servicios', 'GASTO')],
        ['4699', createMockPlanCuenta('4699', 'Recibido por facturar', 'PASIVO')],
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(cuentas);
      const asiento = {
        id: 'asiento-recepcion-mixta',
        numero_asiento: 'A-202410-0099',
        total_debe: 180,
        total_haber: 180,
      } as any;
      const generarSpy = jest.spyOn(service, 'generarAsiento').mockResolvedValue(asiento);

      await expect(service.generarAsientoRecepcion({
        tenant_id: 'test-tenant-id',
        fecha: '2024-10-15',
        costo: 180,
        mercaderia: 50,
        servicios: 100,
        no_stock: 30,
        referencia: 'REC-001',
        event_id: 'evt-recepcion-mixta',
      })).resolves.toEqual(asiento);

      expect(planCuentasService.obtenerCuentasPorCodigos).toHaveBeenCalledWith(
        'test-tenant-id',
        ['4699', '20', '63'],
      );
      expect(generarSpy).toHaveBeenCalledWith(
        'test-tenant-id',
        new Date('2024-10-15'),
        'Recepción pendiente de factura',
        [
          expect.objectContaining({ cuenta_id: 'cuenta-20', debe: 50, haber: 0 }),
          expect.objectContaining({ cuenta_id: 'cuenta-63', debe: 130, haber: 0 }),
          expect.objectContaining({ cuenta_id: 'cuenta-4699', debe: 0, haber: 180 }),
        ],
        'REC-001',
        'evt-recepcion-mixta',
      );
    });

    it('rechaza una clasificación cuyo total no coincide con el costo aceptado', async () => {
      await expect(service.generarAsientoRecepcion({
        tenant_id: 'test-tenant-id',
        fecha: '2024-10-15',
        costo: 100,
        mercaderia: 40,
        servicios: 30,
        no_stock: 20,
      })).rejects.toThrow('no coincide con el costo');
      expect(planCuentasService.obtenerCuentasPorCodigos).not.toHaveBeenCalled();
    });
  });

  describe('generarAsientoDevolucionProveedor', () => {
    it('revierte CxP, mercadería, servicios e IGV con la clasificación durable', async () => {
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(new Map([
        ['42', createMockPlanCuenta('42', 'Proveedores', 'PASIVO')],
        ['20', createMockPlanCuenta('20', 'Mercaderías', 'ACTIVO')],
        ['63', createMockPlanCuenta('63', 'Servicios', 'GASTO')],
        ['40', createMockPlanCuenta('40', 'IGV', 'ACTIVO')],
      ]));
      const asiento = { id: 'asiento-dev-450', total_debe: 271.4, total_haber: 271.4 } as any;
      const generarSpy = jest.spyOn(service, 'generarAsiento').mockResolvedValue(asiento);

      await service.generarAsientoDevolucionProveedor({
        tenant_id: 'test-tenant-id', fecha: '2024-10-15', subtotal: 230,
        igv: 41.4, total: 271.4, mercaderia: 100, servicios: 100,
        no_stock: 30, cuenta_pasivo: '42', referencia: 'DEV-450', event_id: 'evt-dev-450',
      });

      expect(planCuentasService.obtenerCuentasPorCodigos).toHaveBeenCalledWith(
        'test-tenant-id', ['42', '20', '63', '40'],
      );
      expect(generarSpy).toHaveBeenCalledWith(
        'test-tenant-id', new Date('2024-10-15'), 'Devolución a proveedor',
        [
          expect.objectContaining({ cuenta_id: 'cuenta-42', debe: 271.4, haber: 0 }),
          expect.objectContaining({ cuenta_id: 'cuenta-20', debe: 0, haber: 100 }),
          expect.objectContaining({ cuenta_id: 'cuenta-63', debe: 0, haber: 130 }),
          expect.objectContaining({ cuenta_id: 'cuenta-40', debe: 0, haber: 41.4 }),
        ],
        'DEV-450', 'evt-dev-450',
      );
    });

    it('sin factura revierte recibido por facturar y no inventa crédito fiscal', async () => {
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(new Map([
        ['4699', createMockPlanCuenta('4699', 'Recibido por facturar', 'PASIVO')],
        ['20', createMockPlanCuenta('20', 'Mercaderías', 'ACTIVO')],
      ]));
      const asiento = { id: 'asiento-dev-sin-cxp', total_debe: 50, total_haber: 50 } as any;
      const generarSpy = jest.spyOn(service, 'generarAsiento').mockResolvedValue(asiento);

      await service.generarAsientoDevolucionProveedor({
        tenant_id: 'test-tenant-id', fecha: '2024-10-15', subtotal: 50,
        igv: 0, total: 50, mercaderia: 50, cuenta_pasivo: '4699',
        referencia: 'DEV-SIN-CXP', event_id: 'evt-dev-sin-cxp',
      });

      expect(generarSpy).toHaveBeenCalledWith(
        'test-tenant-id', new Date('2024-10-15'), 'Devolución a proveedor',
        [
          expect.objectContaining({ cuenta_id: 'cuenta-4699', debe: 50, haber: 0 }),
          expect.objectContaining({ cuenta_id: 'cuenta-20', debe: 0, haber: 50 }),
        ],
        'DEV-SIN-CXP', 'evt-dev-sin-cxp',
      );
    });
  });

  describe('generarAsientoPago', () => {
    it('debe generar asiento de pago a proveedor correctamente', async () => {
      const evento = {
        tenant_id: 'test-tenant-id',
        fecha: '2024-10-15',
        monto: 1180,
        referencia: 'PAGO-001',
        event_id: 'event-pago-1'
      };

      periodosService.validarPeriodoAbierto.mockResolvedValue();

      const mockCuentas = new Map([
        ['42', createMockPlanCuenta('42', 'Proveedores', 'PASIVO')],
        ['10', createMockPlanCuenta('10', 'Bancos', 'ACTIVO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      const asientoCreado = {
        id: 'asiento-pago-1',
        numero_asiento: 'A-202410-0005',
        total_debe: 1180,
        total_haber: 1180
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' }
      });

      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: [],
        error: null
      });

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: asientoCreado,
        error: null
      });

      const resultado = await service.generarAsientoPago(evento);

      expect(resultado).toBeDefined();
      expect(resultado.id).toBe('asiento-pago-1');
      expect(planCuentasService.obtenerCuentasPorCodigos).toHaveBeenCalledWith(
        evento.tenant_id,
        ['42', '10']
      );
    });
  });

  describe('generarAsientoAjusteInventario', () => {
    it('debe generar asiento de ajuste de inventario por sobrante', async () => {
      const evento = {
        tenant_id: 'test-tenant-id',
        fecha: '2024-10-15',
        valor: 500,
        tipo: 'SOBRANTE',
        referencia: 'AJUSTE-001',
        event_id: 'event-ajuste-1'
      };

      periodosService.validarPeriodoAbierto.mockResolvedValue();

      const mockCuentas = new Map([
        ['20', createMockPlanCuenta('20', 'Mercaderías', 'ACTIVO')],
        ['76', createMockPlanCuenta('76', 'Ingresos Diversos', 'INGRESO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      const asientoCreado = {
        id: 'asiento-ajuste-1',
        numero_asiento: 'A-202410-0006',
        total_debe: 500,
        total_haber: 500
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' }
      });

      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: [],
        error: null
      });

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: asientoCreado,
        error: null
      });

      const resultado = await service.generarAsientoAjusteInventario(evento);

      expect(resultado).toBeDefined();
      expect(resultado.id).toBe('asiento-ajuste-1');
      expect(planCuentasService.obtenerCuentasPorCodigos).toHaveBeenCalledWith(
        evento.tenant_id,
        ['20', '76']
      );
    });

    it('debe generar asiento de ajuste de inventario por faltante', async () => {
      const evento = {
        tenant_id: 'test-tenant-id',
        fecha: '2024-10-15',
        valor: 300,
        tipo: 'FALTANTE',
        referencia: 'AJUSTE-002',
        event_id: 'event-ajuste-2'
      };

      periodosService.validarPeriodoAbierto.mockResolvedValue();

      const mockCuentas = new Map([
        ['68', createMockPlanCuenta('68', 'Valuación de Activos', 'GASTO')],
        ['20', createMockPlanCuenta('20', 'Mercaderías', 'ACTIVO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      const asientoCreado = {
        id: 'asiento-ajuste-2',
        numero_asiento: 'A-202410-0007',
        total_debe: 300,
        total_haber: 300
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' }
      });

      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: [],
        error: null
      });

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: asientoCreado,
        error: null
      });

      const resultado = await service.generarAsientoAjusteInventario(evento);

      expect(resultado).toBeDefined();
      expect(resultado.id).toBe('asiento-ajuste-2');
      expect(planCuentasService.obtenerCuentasPorCodigos).toHaveBeenCalledWith(
        evento.tenant_id,
        ['68', '20']
      );
    });
  });

  describe('generarAsientoPlanilla', () => {
    it('debe generar asiento de planilla correctamente', async () => {
      const evento = {
        tenant_id: 'test-tenant-id',
        fecha: '2024-10-15',
        sueldos: 10000,
        aportes: 930,
        retenciones: 1300,
        neto: 8700,
        referencia: 'PLANILLA-202410',
        event_id: 'event-planilla-1'
      };

      periodosService.validarPeriodoAbierto.mockResolvedValue();

      const mockCuentas = new Map([
        ['621', createMockPlanCuenta('621', 'Remuneraciones', 'GASTO')],
        ['627', createMockPlanCuenta('627', 'Seguridad y prevision social', 'GASTO')],
        ['403', createMockPlanCuenta('403', 'Instituciones publicas', 'PASIVO')],
        ['407', createMockPlanCuenta('407', 'Aportes patronales por pagar', 'PASIVO')],
        ['411', createMockPlanCuenta('411', 'Remuneraciones por Pagar', 'PASIVO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      const asientoCreado = {
        id: 'asiento-planilla-1',
        numero_asiento: 'A-202410-0008',
        total_debe: 10930,
        total_haber: 10930
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' }
      });

      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: [],
        error: null
      });

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: asientoCreado,
        error: null
      });

      const resultado = await service.generarAsientoPlanilla(evento);

      expect(resultado).toBeDefined();
      expect(resultado.id).toBe('asiento-planilla-1');
      expect(planCuentasService.obtenerCuentasPorCodigos).toHaveBeenCalledWith(
        evento.tenant_id,
        ['621', '627', '403', '407', '411']
      );
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'crear_asiento_con_detalles_tx',
        expect.objectContaining({
          p_detalles: expect.arrayContaining([
            expect.objectContaining({ cuenta_id: 'cuenta-621', debe: 10000, haber: 0 }),
            expect.objectContaining({ cuenta_id: 'cuenta-627', debe: 930, haber: 0 }),
            expect.objectContaining({ cuenta_id: 'cuenta-403', debe: 0, haber: 1300 }),
            expect.objectContaining({ cuenta_id: 'cuenta-407', debe: 0, haber: 930 }),
            expect.objectContaining({ cuenta_id: 'cuenta-411', debe: 0, haber: 8700 })
          ])
        })
      );
    });
  });

  describe('generarAsientoDepreciacion', () => {
    it('debe generar asiento de depreciación correctamente', async () => {
      const evento = {
        tenant_id: 'test-tenant-id',
        fecha: '2024-10-15',
        monto: 1500,
        referencia: 'DEP-202410',
        event_id: 'event-depreciacion-1'
      };

      periodosService.validarPeriodoAbierto.mockResolvedValue();

      const mockCuentas = new Map([
        ['68', createMockPlanCuenta('68', 'Depreciación', 'GASTO')],
        ['39', createMockPlanCuenta('39', 'Depreciación Acumulada', 'ACTIVO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      const asientoCreado = {
        id: 'asiento-depreciacion-1',
        numero_asiento: 'A-202410-0009',
        total_debe: 1500,
        total_haber: 1500
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' }
      });

      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: [],
        error: null
      });

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: asientoCreado,
        error: null
      });

      const resultado = await service.generarAsientoDepreciacion(evento);

      expect(resultado).toBeDefined();
      expect(resultado.id).toBe('asiento-depreciacion-1');
      expect(planCuentasService.obtenerCuentasPorCodigos).toHaveBeenCalledWith(
        evento.tenant_id,
        ['68', '39']
      );
    });
  });

  describe('Idempotencia de eventos', () => {
    it('debe implementar idempotencia en asiento de venta', async () => {
      const evento = {
        tenant_id: 'test-tenant-id',
        fecha: '2024-10-15',
        total: 1180,
        base_imponible: 1000,
        igv: 180,
        costo_ventas: 600,
        referencia: 'F001-00001',
        event_id: 'event-venta-idempotent'
      };

      const asientoExistente = {
        id: 'asiento-venta-existing',
        tenant_id: evento.tenant_id,
        numero_asiento: 'A-202410-0001',
        fecha: evento.fecha,
        concepto: 'Venta de mercadería',
        total_debe: 1780,
        total_haber: 1780,
        estado: 'CONFIRMADO',
        source_event_id: evento.event_id
      };

      periodosService.validarPeriodoAbierto.mockResolvedValue();

      // Mock para obtener cuentas (se llama antes de verificar idempotencia)
      const mockCuentas = new Map([
        ['12', createMockPlanCuenta('12', 'Clientes', 'ACTIVO')],
        ['70', createMockPlanCuenta('70', 'Ventas', 'INGRESO')],
        ['40', createMockPlanCuenta('40', 'IGV', 'PASIVO')],
        ['69', createMockPlanCuenta('69', 'Costo de Ventas', 'GASTO')],
        ['20', createMockPlanCuenta('20', 'Mercaderías', 'ACTIVO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      // Mock para buscar asiento existente por evento
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: asientoExistente,
        error: null
      });

      const resultado = await service.generarAsientoVenta(evento);

      expect(resultado).toEqual(asientoExistente);
      expect(resultado.source_event_id).toBe(evento.event_id);
      // Debe obtener cuentas pero no crear nuevo asiento
      expect(planCuentasService.obtenerCuentasPorCodigos).toHaveBeenCalled();
      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
    });

    it('debe implementar idempotencia en asiento de compra', async () => {
      const evento = {
        tenant_id: 'test-tenant-id',
        fecha: '2024-10-15',
        total: 1180,
        costo: 1000,
        igv: 180,
        referencia: 'OC-001',
        event_id: 'event-compra-idempotent'
      };

      const asientoExistente = {
        id: 'asiento-compra-existing',
        tenant_id: evento.tenant_id,
        numero_asiento: 'A-202410-0002',
        fecha: evento.fecha,
        concepto: 'Compra de mercadería',
        total_debe: 1180,
        total_haber: 1180,
        estado: 'CONFIRMADO',
        source_event_id: evento.event_id
      };

      periodosService.validarPeriodoAbierto.mockResolvedValue();

      const mockCuentas = new Map([
        ['20', createMockPlanCuenta('20', 'Mercaderías', 'ACTIVO')],
        ['40', createMockPlanCuenta('40', 'IGV Crédito Fiscal', 'ACTIVO')],
        ['42', createMockPlanCuenta('42', 'Proveedores', 'PASIVO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: asientoExistente,
        error: null
      });

      const resultado = await service.generarAsientoCompra(evento);

      expect(resultado).toEqual(asientoExistente);
      expect(resultado.source_event_id).toBe(evento.event_id);
      expect(planCuentasService.obtenerCuentasPorCodigos).toHaveBeenCalled();
      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
    });

    it('debe implementar idempotencia en asiento de cobro', async () => {
      const evento = {
        tenant_id: 'test-tenant-id',
        fecha: '2024-10-15',
        monto: 1180,
        referencia: 'COBRO-001',
        event_id: 'event-cobro-idempotent'
      };

      const asientoExistente = {
        id: 'asiento-cobro-existing',
        tenant_id: evento.tenant_id,
        numero_asiento: 'A-202410-0003',
        fecha: evento.fecha,
        concepto: 'Cobro de factura',
        total_debe: 1180,
        total_haber: 1180,
        estado: 'CONFIRMADO',
        source_event_id: evento.event_id
      };

      periodosService.validarPeriodoAbierto.mockResolvedValue();

      const mockCuentas = new Map([
        ['10', createMockPlanCuenta('10', 'Bancos/Caja', 'ACTIVO')],
        ['12', createMockPlanCuenta('12', 'Clientes', 'ACTIVO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: asientoExistente,
        error: null
      });

      const resultado = await service.generarAsientoCobro(evento);

      expect(resultado).toEqual(asientoExistente);
      expect(resultado.source_event_id).toBe(evento.event_id);
      expect(planCuentasService.obtenerCuentasPorCodigos).toHaveBeenCalled();
      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
    });

    it('debe implementar idempotencia en asiento de pago', async () => {
      const evento = {
        tenant_id: 'test-tenant-id',
        fecha: '2024-10-15',
        monto: 1180,
        referencia: 'PAGO-001',
        event_id: 'event-pago-idempotent'
      };

      const asientoExistente = {
        id: 'asiento-pago-existing',
        tenant_id: evento.tenant_id,
        numero_asiento: 'A-202410-0004',
        fecha: evento.fecha,
        concepto: 'Pago a proveedor',
        total_debe: 1180,
        total_haber: 1180,
        estado: 'CONFIRMADO',
        source_event_id: evento.event_id
      };

      periodosService.validarPeriodoAbierto.mockResolvedValue();

      const mockCuentas = new Map([
        ['42', createMockPlanCuenta('42', 'Proveedores', 'PASIVO')],
        ['10', createMockPlanCuenta('10', 'Bancos', 'ACTIVO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: asientoExistente,
        error: null
      });

      const resultado = await service.generarAsientoPago(evento);

      expect(resultado).toEqual(asientoExistente);
      expect(resultado.source_event_id).toBe(evento.event_id);
      expect(planCuentasService.obtenerCuentasPorCodigos).toHaveBeenCalled();
      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
    });

    it('debe implementar idempotencia en asiento de ajuste de inventario', async () => {
      const evento = {
        tenant_id: 'test-tenant-id',
        fecha: '2024-10-15',
        valor: 500,
        tipo: 'SOBRANTE',
        referencia: 'AJUSTE-001',
        event_id: 'event-ajuste-idempotent'
      };

      const asientoExistente = {
        id: 'asiento-ajuste-existing',
        tenant_id: evento.tenant_id,
        numero_asiento: 'A-202410-0005',
        fecha: evento.fecha,
        concepto: 'Ajuste de inventario - SOBRANTE',
        total_debe: 500,
        total_haber: 500,
        estado: 'CONFIRMADO',
        source_event_id: evento.event_id
      };

      periodosService.validarPeriodoAbierto.mockResolvedValue();

      const mockCuentas = new Map([
        ['20', createMockPlanCuenta('20', 'Mercaderías', 'ACTIVO')],
        ['76', createMockPlanCuenta('76', 'Ingresos Diversos', 'INGRESO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: asientoExistente,
        error: null
      });

      const resultado = await service.generarAsientoAjusteInventario(evento);

      expect(resultado).toEqual(asientoExistente);
      expect(resultado.source_event_id).toBe(evento.event_id);
      expect(planCuentasService.obtenerCuentasPorCodigos).toHaveBeenCalled();
      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
    });

    it('debe implementar idempotencia en asiento de planilla', async () => {
      const evento = {
        tenant_id: 'test-tenant-id',
        fecha: '2024-10-15',
        sueldos: 10000,
        aportes: 930,
        retenciones: 1300,
        neto: 8700,
        referencia: 'PLANILLA-202410',
        event_id: 'event-planilla-idempotent'
      };

      const asientoExistente = {
        id: 'asiento-planilla-existing',
        tenant_id: evento.tenant_id,
        numero_asiento: 'A-202410-0006',
        fecha: evento.fecha,
        concepto: 'Planilla de sueldos',
        total_debe: 10000,
        total_haber: 10000,
        estado: 'CONFIRMADO',
        source_event_id: evento.event_id
      };

      periodosService.validarPeriodoAbierto.mockResolvedValue();

      const mockCuentas = new Map([
        ['621', createMockPlanCuenta('621', 'Remuneraciones', 'GASTO')],
        ['627', createMockPlanCuenta('627', 'Seguridad y prevision social', 'GASTO')],
        ['403', createMockPlanCuenta('403', 'Instituciones publicas', 'PASIVO')],
        ['407', createMockPlanCuenta('407', 'Aportes patronales por pagar', 'PASIVO')],
        ['411', createMockPlanCuenta('411', 'Remuneraciones por Pagar', 'PASIVO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: asientoExistente,
        error: null
      });

      const resultado = await service.generarAsientoPlanilla(evento);

      expect(resultado).toEqual(asientoExistente);
      expect(resultado.source_event_id).toBe(evento.event_id);
      expect(planCuentasService.obtenerCuentasPorCodigos).toHaveBeenCalled();
      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
    });

    it('debe implementar idempotencia en asiento de depreciación', async () => {
      const evento = {
        tenant_id: 'test-tenant-id',
        fecha: '2024-10-15',
        monto: 1500,
        referencia: 'DEP-202410',
        event_id: 'event-depreciacion-idempotent'
      };

      const asientoExistente = {
        id: 'asiento-depreciacion-existing',
        tenant_id: evento.tenant_id,
        numero_asiento: 'A-202410-0007',
        fecha: evento.fecha,
        concepto: 'Depreciación de activos fijos',
        total_debe: 1500,
        total_haber: 1500,
        estado: 'CONFIRMADO',
        source_event_id: evento.event_id
      };

      periodosService.validarPeriodoAbierto.mockResolvedValue();

      const mockCuentas = new Map([
        ['68', createMockPlanCuenta('68', 'Depreciación', 'GASTO')],
        ['39', createMockPlanCuenta('39', 'Depreciación Acumulada', 'ACTIVO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: asientoExistente,
        error: null
      });

      const resultado = await service.generarAsientoDepreciacion(evento);

      expect(resultado).toEqual(asientoExistente);
      expect(resultado.source_event_id).toBe(evento.event_id);
      expect(planCuentasService.obtenerCuentasPorCodigos).toHaveBeenCalled();
      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
    });
  });

  describe('Manejo de errores en generación de asientos', () => {
    it('debe manejar errores al generar asiento de venta cuando falla obtención de cuentas', async () => {
      const evento = {
        tenant_id: 'test-tenant-id',
        fecha: '2024-10-15',
        total: 1180,
        base_imponible: 1000,
        igv: 180,
        costo_ventas: 600,
        event_id: 'event-venta-error'
      };

      periodosService.validarPeriodoAbierto.mockResolvedValue();
      planCuentasService.obtenerCuentasPorCodigos.mockRejectedValue(
        new Error('Cuentas no encontradas')
      );

      await expect(service.generarAsientoVenta(evento)).rejects.toThrow('Cuentas no encontradas');
    });

    it('debe manejar errores al generar asiento de cobro cuando falla obtención de cuentas', async () => {
      const evento = {
        tenant_id: 'test-tenant-id',
        fecha: '2024-10-15',
        monto: 1180,
        event_id: 'event-cobro-error'
      };

      periodosService.validarPeriodoAbierto.mockResolvedValue();
      planCuentasService.obtenerCuentasPorCodigos.mockRejectedValue(
        new Error('Cuentas no encontradas')
      );

      await expect(service.generarAsientoCobro(evento)).rejects.toThrow('Cuentas no encontradas');
    });

    it('debe manejar errores al generar asiento de compra cuando el período está cerrado', async () => {
      const evento = {
        tenant_id: 'test-tenant-id',
        fecha: '2024-10-15',
        total: 1180,
        costo: 1000,
        igv: 180,
        event_id: 'event-compra-error'
      };

      const mockCuentas = new Map([
        ['20', createMockPlanCuenta('20', 'Mercaderías', 'ACTIVO')],
        ['40', createMockPlanCuenta('40', 'IGV Crédito Fiscal', 'ACTIVO')],
        ['42', createMockPlanCuenta('42', 'Proveedores', 'PASIVO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      periodosService.validarPeriodoAbierto.mockRejectedValue(
        new Error('Período cerrado')
      );

      await expect(service.generarAsientoCompra(evento)).rejects.toThrow('Período cerrado');
    });
  });

  describe('Validación de período cerrado - Tests críticos', () => {
    const tenantId = 'test-tenant-id';
    const fechaCerrada = new Date('2024-10-15');
    const errorPeriodoCerrado = new BadRequestException('El período contable 2024-10 está CERRADO');

    beforeEach(() => {
      // Mock para simular período cerrado en todos los tests de este bloque
      periodosService.validarPeriodoAbierto.mockRejectedValue(errorPeriodoCerrado);
    });

    it('debe rechazar asiento de venta cuando el período está cerrado', async () => {
      const evento = {
        tenant_id: tenantId,
        fecha: fechaCerrada.toISOString(),
        total: 1180,
        base_imponible: 1000,
        igv: 180,
        costo_ventas: 600,
        referencia: 'F001-00001',
        event_id: 'event-venta-cerrado'
      };

      const mockCuentas = new Map([
        ['12', createMockPlanCuenta('12', 'Clientes', 'ACTIVO')],
        ['70', createMockPlanCuenta('70', 'Ventas', 'INGRESO')],
        ['40', createMockPlanCuenta('40', 'IGV', 'PASIVO')],
        ['69', createMockPlanCuenta('69', 'Costo de Ventas', 'GASTO')],
        ['20', createMockPlanCuenta('20', 'Mercaderías', 'ACTIVO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      await expect(service.generarAsientoVenta(evento)).rejects.toThrow(BadRequestException);
      await expect(service.generarAsientoVenta(evento)).rejects.toThrow('El período contable 2024-10 está CERRADO');

      // Verificar que se intentó validar el período
      expect(periodosService.validarPeriodoAbierto).toHaveBeenCalled();
      // Verificar que NO se intentó crear el asiento
      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
    });

    it('debe rechazar asiento de compra cuando el período está cerrado', async () => {
      const evento = {
        tenant_id: tenantId,
        fecha: fechaCerrada.toISOString(),
        total: 1180,
        costo: 1000,
        igv: 180,
        referencia: 'OC-001',
        event_id: 'event-compra-cerrado'
      };

      const mockCuentas = new Map([
        ['20', createMockPlanCuenta('20', 'Mercaderías', 'ACTIVO')],
        ['40', createMockPlanCuenta('40', 'IGV Crédito Fiscal', 'ACTIVO')],
        ['42', createMockPlanCuenta('42', 'Proveedores', 'PASIVO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      await expect(service.generarAsientoCompra(evento)).rejects.toThrow(BadRequestException);
      await expect(service.generarAsientoCompra(evento)).rejects.toThrow('El período contable 2024-10 está CERRADO');

      expect(periodosService.validarPeriodoAbierto).toHaveBeenCalled();
      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
    });

    it('debe rechazar asiento de cobro cuando el período está cerrado', async () => {
      const evento = {
        tenant_id: tenantId,
        fecha: fechaCerrada.toISOString(),
        monto: 1180,
        referencia: 'COBRO-001',
        event_id: 'event-cobro-cerrado'
      };

      const mockCuentas = new Map([
        ['10', createMockPlanCuenta('10', 'Bancos/Caja', 'ACTIVO')],
        ['12', createMockPlanCuenta('12', 'Clientes', 'ACTIVO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      await expect(service.generarAsientoCobro(evento)).rejects.toThrow(BadRequestException);
      await expect(service.generarAsientoCobro(evento)).rejects.toThrow('El período contable 2024-10 está CERRADO');

      expect(periodosService.validarPeriodoAbierto).toHaveBeenCalled();
      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
    });

    it('debe rechazar asiento de pago cuando el período está cerrado', async () => {
      const evento = {
        tenant_id: tenantId,
        fecha: fechaCerrada.toISOString(),
        monto: 1180,
        referencia: 'PAGO-001',
        event_id: 'event-pago-cerrado'
      };

      const mockCuentas = new Map([
        ['42', createMockPlanCuenta('42', 'Proveedores', 'PASIVO')],
        ['10', createMockPlanCuenta('10', 'Bancos', 'ACTIVO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      await expect(service.generarAsientoPago(evento)).rejects.toThrow(BadRequestException);
      await expect(service.generarAsientoPago(evento)).rejects.toThrow('El período contable 2024-10 está CERRADO');

      expect(periodosService.validarPeriodoAbierto).toHaveBeenCalled();
      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
    });

    it('debe rechazar asiento de ajuste de inventario cuando el período está cerrado', async () => {
      const evento = {
        tenant_id: tenantId,
        fecha: fechaCerrada.toISOString(),
        valor: 500,
        tipo: 'SOBRANTE',
        referencia: 'AJUSTE-001',
        event_id: 'event-ajuste-cerrado'
      };

      const mockCuentas = new Map([
        ['20', createMockPlanCuenta('20', 'Mercaderías', 'ACTIVO')],
        ['76', createMockPlanCuenta('76', 'Ingresos Diversos', 'INGRESO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      await expect(service.generarAsientoAjusteInventario(evento)).rejects.toThrow(BadRequestException);
      await expect(service.generarAsientoAjusteInventario(evento)).rejects.toThrow('El período contable 2024-10 está CERRADO');

      expect(periodosService.validarPeriodoAbierto).toHaveBeenCalled();
      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
    });

    it('debe rechazar asiento de planilla cuando el período está cerrado', async () => {
      const evento = {
        tenant_id: tenantId,
        fecha: fechaCerrada.toISOString(),
        sueldos: 10000,
        aportes: 930,
        retenciones: 1300,
        neto: 8700,
        referencia: 'PLANILLA-202410',
        event_id: 'event-planilla-cerrado'
      };

      const mockCuentas = new Map([
        ['621', createMockPlanCuenta('621', 'Remuneraciones', 'GASTO')],
        ['627', createMockPlanCuenta('627', 'Seguridad y prevision social', 'GASTO')],
        ['403', createMockPlanCuenta('403', 'Instituciones publicas', 'PASIVO')],
        ['407', createMockPlanCuenta('407', 'Aportes patronales por pagar', 'PASIVO')],
        ['411', createMockPlanCuenta('411', 'Remuneraciones por Pagar', 'PASIVO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      await expect(service.generarAsientoPlanilla(evento)).rejects.toThrow(BadRequestException);
      await expect(service.generarAsientoPlanilla(evento)).rejects.toThrow('El período contable 2024-10 está CERRADO');

      expect(periodosService.validarPeriodoAbierto).toHaveBeenCalled();
      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
    });

    it('debe rechazar asiento de depreciación cuando el período está cerrado', async () => {
      const evento = {
        tenant_id: tenantId,
        fecha: fechaCerrada.toISOString(),
        monto: 1500,
        referencia: 'DEP-202410',
        event_id: 'event-depreciacion-cerrado'
      };

      const mockCuentas = new Map([
        ['68', createMockPlanCuenta('68', 'Depreciación', 'GASTO')],
        ['39', createMockPlanCuenta('39', 'Depreciación Acumulada', 'ACTIVO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      await expect(service.generarAsientoDepreciacion(evento)).rejects.toThrow(BadRequestException);
      await expect(service.generarAsientoDepreciacion(evento)).rejects.toThrow('El período contable 2024-10 está CERRADO');

      expect(periodosService.validarPeriodoAbierto).toHaveBeenCalled();
      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
    });

    it('debe rechazar asiento manual cuando el período está cerrado', async () => {
      const detalles = [
        { cuenta_id: '10', debe: 1000, haber: 0, concepto: 'Caja' },
        { cuenta_id: '70', debe: 0, haber: 1000, concepto: 'Ventas' }
      ];

      await expect(
        service.generarAsiento(tenantId, fechaCerrada, 'Asiento manual', detalles)
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.generarAsiento(tenantId, fechaCerrada, 'Asiento manual', detalles)
      ).rejects.toThrow('El período contable 2024-10 está CERRADO');

      expect(periodosService.validarPeriodoAbierto).toHaveBeenCalled();
      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
    });

    it('debe validar período cerrado ANTES de cualquier otra operación', async () => {
      const evento = {
        tenant_id: tenantId,
        fecha: fechaCerrada.toISOString(),
        total: 1180,
        base_imponible: 1000,
        igv: 180,
        costo_ventas: 600,
        event_id: 'event-orden-validacion'
      };

      // Mock para cuentas (no debería llamarse)
      const mockCuentas = new Map([
        ['12', createMockPlanCuenta('12', 'Clientes', 'ACTIVO')],
        ['70', createMockPlanCuenta('70', 'Ventas', 'INGRESO')],
        ['40', createMockPlanCuenta('40', 'IGV', 'PASIVO')],
        ['69', createMockPlanCuenta('69', 'Costo de Ventas', 'GASTO')],
        ['20', createMockPlanCuenta('20', 'Mercaderías', 'ACTIVO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(mockCuentas);

      try {
        await service.generarAsientoVenta(evento);
        fail('Debería haber lanzado error de período cerrado');
      } catch (error) {
        // Verificar que la validación de período fue lo primero que se ejecutó
        expect(periodosService.validarPeriodoAbierto).toHaveBeenCalled();

        // Verificar que NO se realizaron otras operaciones
        expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
        expect(mockSupabaseClient.update).not.toHaveBeenCalled();

        // Verificar el error correcto
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.message).toContain('CERRADO');
      }
    });
  });

  describe('movimientos laborales de liquidaciones y CTS', () => {
    it.each([
      ['generarAsientoDevengoLiquidacion', '621', '411'],
      ['generarAsientoPagoLiquidacion', '411', '10'],
      ['generarAsientoReversaPagoLiquidacion', '10', '411'],
      ['generarAsientoDepositoCts', '621', '10'],
    ])('%s genera un asiento cuadrado e idempotente', async (metodo, debeCodigo, haberCodigo) => {
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(new Map([
        [debeCodigo, createMockPlanCuenta(debeCodigo, `Cuenta ${debeCodigo}`)],
        [haberCodigo, createMockPlanCuenta(haberCodigo, `Cuenta ${haberCodigo}`)],
      ]));
      const generarAsientoSpy = jest.spyOn(service, 'generarAsiento').mockResolvedValue({ id: 'asiento-laboral' } as any);

      await (service as any)[metodo]({
        tenant_id: 'tenant-rrhh',
        fecha: '2026-08-09',
        monto: 1250.45,
        referencia: 'RRHH-1',
        source_event_id: 'event-rrhh-1',
      });

      expect(planCuentasService.obtenerCuentasPorCodigos).toHaveBeenCalledWith(
        'tenant-rrhh',
        [debeCodigo, haberCodigo],
      );
      expect(generarAsientoSpy).toHaveBeenCalledWith(
        'tenant-rrhh',
        expect.any(Date),
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({ cuenta_id: `cuenta-${debeCodigo}`, debe: 1250.45, haber: 0 }),
          expect.objectContaining({ cuenta_id: `cuenta-${haberCodigo}`, debe: 0, haber: 1250.45 }),
        ]),
        'RRHH-1',
        'event-rrhh-1',
      );
    });
  });

  describe('asientos bancarios 457', () => {
    it('contabiliza ABONO y CARGO con las cuentas postables congeladas', async () => {
      const cuentaBanco = createMockPlanCuenta('10411', 'Banco principal');
      const cuentaContrapartida = createMockPlanCuenta('7599', 'Otros ingresos', 'INGRESO');
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(new Map([
        ['10411', cuentaBanco],
        ['7599', cuentaContrapartida],
      ]));
      const generar = jest.spyOn(service, 'generarAsiento').mockResolvedValue({
        id: 'asiento-banco-1',
      } as AsientoContable);

      await service.generarAsientoMovimientoBancario({
        tenant_id: 'test-tenant-id',
        event_id: 'evt-bank-abono',
        accountingHandledByOutbox: true,
        tipo: 'ABONO',
        monto: 37.5,
        montoOrigen: 37.5,
        tipoCambio: 1,
        cuentaBancoId: cuentaBanco.id,
        cuentaBancoCodigo: '10411',
        cuentaContrapartidaId: cuentaContrapartida.id,
        cuentaContrapartidaCodigo: '7599',
        fecha: '2026-08-09',
        descripcion: 'Interés bancario',
        referencia: 'BANCO-ABONO-1',
      });

      expect(generar).toHaveBeenCalledWith(
        'test-tenant-id',
        expect.any(Date),
        'Interés bancario',
        [
          expect.objectContaining({ cuenta_id: cuentaBanco.id, debe: 37.5, haber: 0 }),
          expect.objectContaining({ cuenta_id: cuentaContrapartida.id, debe: 0, haber: 37.5 }),
        ],
        'BANCO-ABONO-1',
        'evt-bank-abono',
      );

      generar.mockClear();
      await service.generarAsientoMovimientoBancario({
        tenant_id: 'test-tenant-id',
        event_id: 'evt-bank-cargo',
        accountingHandledByOutbox: true,
        tipo: 'CARGO',
        monto: 12.5,
        montoOrigen: 12.5,
        tipoCambio: 1,
        cuentaBancoId: cuentaBanco.id,
        cuentaBancoCodigo: '10411',
        cuentaContrapartidaId: cuentaContrapartida.id,
        cuentaContrapartidaCodigo: '7599',
        fecha: '2026-08-09',
        descripcion: 'Comisión bancaria',
        referencia: 'BANCO-CARGO-1',
      });
      expect(generar).toHaveBeenCalledWith(
        'test-tenant-id',
        expect.any(Date),
        'Comisión bancaria',
        [
          expect.objectContaining({ cuenta_id: cuentaContrapartida.id, debe: 12.5, haber: 0 }),
          expect.objectContaining({ cuenta_id: cuentaBanco.id, debe: 0, haber: 12.5 }),
        ],
        'BANCO-CARGO-1',
        'evt-bank-cargo',
      );
    });

    it('contabiliza transferencia Dr destino / Cr origen y rechaza payload alterado', async () => {
      const cuentaOrigen = createMockPlanCuenta('10411', 'Banco origen');
      const cuentaDestino = createMockPlanCuenta('10412', 'Banco destino');
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(new Map([
        ['10411', cuentaOrigen],
        ['10412', cuentaDestino],
      ]));
      const generar = jest.spyOn(service, 'generarAsiento').mockResolvedValue({
        id: 'asiento-transfer-1',
      } as AsientoContable);
      const payload = {
        tenant_id: 'test-tenant-id',
        event_id: 'evt-transfer-1',
        accountingHandledByOutbox: true,
        monto: 100,
        montoOrigen: 25,
        tipoCambio: 4,
        cuentaOrigenContableId: cuentaOrigen.id,
        cuentaOrigenCodigo: '10411',
        cuentaDestinoContableId: cuentaDestino.id,
        cuentaDestinoCodigo: '10412',
        fecha: '2026-08-09',
        referencia: 'TRANSFER-1',
      };

      await service.generarAsientoTransferenciaBancaria(payload);
      expect(generar).toHaveBeenCalledWith(
        'test-tenant-id',
        expect.any(Date),
        'Transferencia entre cuentas bancarias',
        [
          expect.objectContaining({ cuenta_id: cuentaDestino.id, debe: 100, haber: 0 }),
          expect.objectContaining({ cuenta_id: cuentaOrigen.id, debe: 0, haber: 100 }),
        ],
        'TRANSFER-1',
        'evt-transfer-1',
      );

      await expect(service.generarAsientoTransferenciaBancaria({
        ...payload,
        event_id: 'evt-transfer-corrupta',
        monto: 99,
      })).rejects.toThrow('valuación local');
    });
  });

  describe('ajustes fiscales de proveedor 465', () => {
    it('genera la factura compuesta y acredita sólo el saldo neto al proveedor', async () => {
      const codigos = ['4699', '40', '42', '40113', '40114', '421', '422'];
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(new Map(
        codigos.map((codigo) => [codigo, createMockPlanCuenta(codigo, `Cuenta ${codigo}`)]),
      ));
      const generar = jest.spyOn(service, 'generarAsiento').mockResolvedValue({ id: 'asiento-fp-465' } as any);

      await service.generarAsientoFacturaProveedor({
        tenant_id: 'test-tenant-id',
        fecha: '2026-08-10',
        subtotal: 100,
        igv: 18,
        total: 118,
        saldoProveedor: 87,
        ajustes: { retencion: 3, percepcion: 2, detraccion: 10, anticipo: 20 },
        recepcion_id: 'recepcion-1',
        referencia: 'F001-20',
        event_id: 'evt-fp-465',
      });

      expect(generar).toHaveBeenCalledWith(
        'test-tenant-id',
        expect.any(Date),
        'Factura de proveedor',
        expect.arrayContaining([
          expect.objectContaining({ cuenta_id: 'cuenta-4699', debe: 100, haber: 0 }),
          expect.objectContaining({ cuenta_id: 'cuenta-40', debe: 18, haber: 0 }),
          expect.objectContaining({ cuenta_id: 'cuenta-40113', debe: 2, haber: 0 }),
          expect.objectContaining({ cuenta_id: 'cuenta-42', debe: 0, haber: 87 }),
          expect.objectContaining({ cuenta_id: 'cuenta-40114', debe: 0, haber: 3 }),
          expect.objectContaining({ cuenta_id: 'cuenta-421', debe: 0, haber: 10 }),
          expect.objectContaining({ cuenta_id: 'cuenta-422', debe: 0, haber: 20 }),
        ]),
        'F001-20',
        'evt-fp-465',
      );
    });

    it('rechaza una factura cuyo saldo no cuadra con sus ajustes', async () => {
      await expect(service.generarAsientoFacturaProveedor({
        tenant_id: 'test-tenant-id',
        fecha: '2026-08-10', subtotal: 100, igv: 18, total: 118,
        saldoProveedor: 100,
        ajustes: { retencion: 3, percepcion: 2, detraccion: 10, anticipo: 20 },
      })).rejects.toThrow('saldo');
      expect(planCuentasService.obtenerCuentasPorCodigos).not.toHaveBeenCalled();
    });

    it.each([
      ['RETENCION', '42', '40114'],
      ['PERCEPCION', '40113', '42'],
      ['DETRACCION', '42', '421'],
      ['ANTICIPO', '42', '422'],
    ])('genera ajuste CxP %s sin usar banco', async (tipo, debe, haber) => {
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(new Map([
        [debe, createMockPlanCuenta(debe, `Cuenta ${debe}`)],
        [haber, createMockPlanCuenta(haber, `Cuenta ${haber}`)],
      ]));
      const generar = jest.spyOn(service, 'generarAsiento').mockResolvedValue({ id: `asiento-${tipo}` } as any);

      await service.generarAsientoAjusteCxp({
        tenant_id: 'test-tenant-id', fecha: '2026-08-10',
        tipoMovimiento: tipo, montoContabilizado: 25,
        referencia: `AJ-${tipo}`, event_id: `evt-${tipo}`,
      });

      expect(generar).toHaveBeenCalledWith(
        'test-tenant-id', expect.any(Date), expect.any(String),
        [
          expect.objectContaining({ cuenta_id: `cuenta-${debe}`, debe: 25, haber: 0 }),
          expect.objectContaining({ cuenta_id: `cuenta-${haber}`, debe: 0, haber: 25 }),
        ],
        `AJ-${tipo}`, `evt-${tipo}`,
      );
    });
  });

  describe('handleDocumentoFiscalGenerado', () => {
    it('genera asiento contable usando la plantilla configurada', async () => {
      const tenantId = 'test-tenant-id';
      const plantilla = {
        cuenta_debe_codigo: '12',
        cuenta_haber_ventas_codigo: '70',
        cuenta_haber_impuesto_codigo: '40'
      };

      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: plantilla,
        error: null
      });

      const cuentas = new Map<string, PlanCuenta>([
        ['12', createMockPlanCuenta('12', 'Clientes', 'ACTIVO')],
        ['70', createMockPlanCuenta('70', 'Ventas', 'INGRESO')],
        ['40', createMockPlanCuenta('40', 'IGV', 'PASIVO')]
      ]);
      planCuentasService.obtenerCuentasPorCodigos.mockResolvedValue(cuentas);

      const generarAsientoSpy = jest
        .spyOn(service, 'generarAsiento')
        .mockResolvedValue({} as any);

      const evento: DocumentoFiscalGeneradoEvent = {
        eventId: 'evt-1',
        tenantId,
        documentoId: 'doc-1',
        pedidoId: 'ped-1',
        tipoDocumento: '01',
        serie: 'F001',
        numero: '000123',
        subtotal: 1000,
        impuesto: 180,
        total: 1180,
        moneda: 'PEN',
        fechaEmision: new Date().toISOString(),
        paisId: 1
      };

      await service.handleDocumentoFiscalGenerado(evento);

      expect(planCuentasService.obtenerCuentasPorCodigos).toHaveBeenCalledWith(tenantId, [
        '12',
        '70',
        '40'
      ]);

      expect(generarAsientoSpy).toHaveBeenCalledWith(
        tenantId,
        expect.any(Date),
        'Venta F001-000123',
        [
          {
            cuenta_id: 'cuenta-12',
            debe: 1180,
            haber: 0,
            concepto: 'Cuenta por cobrar F001-000123'
          },
          {
            cuenta_id: 'cuenta-70',
            debe: 0,
            haber: 1000,
            concepto: 'Ingresos por venta F001-000123'
          },
          {
            cuenta_id: 'cuenta-40',
            debe: 0,
            haber: 180,
            concepto: 'Impuestos por pagar F001-000123'
          }
        ],
        evento.documentoId,
        evento.eventId
      );
    });
  });
});





