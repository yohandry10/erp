import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConciliacionService } from './conciliacion.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { CsvParserService } from './csv-parser.service';

describe('ConciliacionService - Validación de Cierre', () => {
  let service: ConciliacionService;
  let supabaseService: SupabaseService;

  const createMockQueryBuilder = (data: any, error: any = null) => {
    const builder: any = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      like: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      contains: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data, error }),
      maybeSingle: jest.fn().mockResolvedValue({ data, error }),
    };
    // Make it thenable for await builder
    builder.then = (resolve: any) => resolve({ data, error });
    return builder;
  };

  const mockSupabaseClient = {
    from: jest.fn(),
  };

  const mockSupabaseService = {
    getClient: jest.fn(() => mockSupabaseClient),
  };

  const mockCsvParserService = {
    parsearExtractoBancario: jest.fn(),
    listarPlantillas: jest.fn(),
    registrarPlantilla: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConciliacionService,
        {
          provide: SupabaseService,
          useValue: mockSupabaseService,
        },
        {
          provide: CsvParserService,
          useValue: mockCsvParserService,
        },
      ],
    }).compile();

    service = module.get<ConciliacionService>(ConciliacionService);
    supabaseService = module.get<SupabaseService>(SupabaseService);

    jest.clearAllMocks();
  });

  describe('cerrarConciliacion - Validación de ítems procesados', () => {
    const tenantId = 'test-tenant';
    const conciliacionId = 'test-conciliacion-id';
    const userId = 'test-user-id';

    const mockConciliacion = {
      id: conciliacionId,
      tenant_id: tenantId,
      cuenta_bancaria_id: 'cuenta-1',
      periodo: '2024-01',
      fecha_desde: '2024-01-01',
      fecha_hasta: '2024-01-31',
      estado: 'EN_PROCESO',
      saldo_libro: 10000,
      saldo_banco: 10000,
      diferencia: 0,
      cuentas_bancarias: {
        banco: 'BCP',
        numero_cuenta: '123456789',
        moneda: 'PEN',
      },
    };

    it('debe rechazar el cierre si hay movimientos pendientes y no se fuerza', async () => {
      // Mock chain for conciliación query
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockConciliacion));

      // Mock chain for movimientos sistema
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder([
        { id: '1', conciliado: true, tipo: 'ABONO', monto: '1000' },
        { id: '2', conciliado: false, tipo: 'CARGO', monto: '500' },
      ]));

      // Mock chain for movimientos extracto
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder([
        { id: '3', conciliado: true, tipo: 'ABONO', monto: '1000' },
        { id: '4', conciliado: false, tipo: 'CARGO', monto: '500' },
      ]));

      // Ejecutar: Intentar cerrar sin forzar
      await expect(
        service.cerrarConciliacion(tenantId, conciliacionId, userId, false),
      ).rejects.toThrow(/movimientos pendientes de procesar/);
    });

    it('debe permitir el cierre si todos los movimientos están conciliados', async () => {
      // Mock: Conciliación existe
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockConciliacion));

      // Mock: Movimientos del sistema (todos conciliados)
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder([
        { id: '1', conciliado: true, tipo: 'ABONO', monto: '1000' },
        { id: '2', conciliado: true, tipo: 'CARGO', monto: '500' },
      ]));

      // Mock: Movimientos del extracto (todos conciliados)
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder([
        { id: '3', conciliado: true, tipo: 'ABONO', monto: '1000' },
        { id: '4', conciliado: true, tipo: 'CARGO', monto: '500' },
      ]));

      // Mock: Update conciliación
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder({ ...mockConciliacion, estado: 'CERRADA' }));

      // Ejecutar: Cerrar sin forzar (debe funcionar)
      const resultado = await service.cerrarConciliacion(
        tenantId,
        conciliacionId,
        userId,
        false,
      );

      expect(resultado.success).toBe(true);
      expect(resultado.data.conciliacion.estado).toBe('CERRADA');
    });

    it('debe permitir el cierre forzado incluso con movimientos pendientes', async () => {
      // Mock: Conciliación existe
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockConciliacion));

      // Mock: Movimientos del sistema (con pendientes)
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder([
        { id: '1', conciliado: true, tipo: 'ABONO', monto: '1000' },
        { id: '2', conciliado: false, tipo: 'CARGO', monto: '500' },
      ]));

      // Mock: Movimientos del extracto (con pendientes)
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder([
        { id: '3', conciliado: true, tipo: 'ABONO', monto: '1000' },
        { id: '4', conciliado: false, tipo: 'CARGO', monto: '500' },
      ]));

      // Mock: Update conciliación
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder({ ...mockConciliacion, estado: 'CERRADA' }));

      // Ejecutar: Cerrar forzando (debe funcionar)
      const resultado = await service.cerrarConciliacion(
        tenantId,
        conciliacionId,
        userId,
        true, // forzar_cierre = true
      );

      expect(resultado.success).toBe(true);
      expect(resultado.data.conciliacion.estado).toBe('CERRADA');
      expect(resultado.data.reporte.forzado).toBe(true);
    });

    it('debe rechazar el cierre si no se ha importado extracto', async () => {
      // Mock: Conciliación existe
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockConciliacion));

      // Mock: Movimientos del sistema (existen)
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder([
        { id: '1', conciliado: true, tipo: 'ABONO', monto: '1000' }
      ]));

      // Mock: Movimientos del extracto (NO existen)
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder([]));

      // Ejecutar: Intentar cerrar
      await expect(
        service.cerrarConciliacion(tenantId, conciliacionId, userId, false),
      ).rejects.toThrow(/sin haber importado un extracto bancario/);
    });

    it('debe rechazar el cierre si la conciliación ya está cerrada', async () => {
      // Mock: Conciliación ya cerrada
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder({ ...mockConciliacion, estado: 'CERRADA' }));

      // Ejecutar: Intentar cerrar
      await expect(
        service.cerrarConciliacion(tenantId, conciliacionId, userId, false),
      ).rejects.toThrow(/ya está cerrada/);
    });
  });

  describe('round2 helper', () => {
    it('debe redondear a 2 decimales correctamente', () => {
      // Access private method through any cast for testing
      const service_any = service as any;

      expect(service_any.round2(10.123)).toBe(10.12);
      expect(service_any.round2(10.126)).toBe(10.13);
      expect(service_any.round2(10.125)).toBe(10.13);
      expect(service_any.round2(10)).toBe(10);
      expect(service_any.round2(10.1)).toBe(10.1);
    });
  });

  describe('listarConciliaciones', () => {
    const tenantId = 'test-tenant';

    it('debe listar todas las conciliaciones del tenant', async () => {
      const mockConciliaciones = [
        {
          id: 'conc-1',
          tenant_id: tenantId,
          cuenta_bancaria_id: 'cuenta-1',
          periodo: '2024-01',
          estado: 'CERRADA',
          cuentas_bancarias: {
            id: 'cuenta-1',
            banco: 'BCP',
            numero_cuenta: '123456789',
          },
        },
        {
          id: 'conc-2',
          tenant_id: tenantId,
          cuenta_bancaria_id: 'cuenta-2',
          periodo: '2024-02',
          estado: 'ABIERTA',
          cuentas_bancarias: {
            id: 'cuenta-2',
            banco: 'BBVA',
            numero_cuenta: '987654321',
          },
        },
      ];

      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockConciliaciones));

      const resultado = await service.listarConciliaciones(tenantId, {});

      expect(resultado.success).toBe(true);
      expect(resultado.data).toHaveLength(2);
      expect(resultado.data[0].id).toBe('conc-1');
    });

    it('debe filtrar por cuenta bancaria', async () => {
      const mockConciliaciones = [
        {
          id: 'conc-1',
          cuenta_bancaria_id: 'cuenta-1',
          periodo: '2024-01',
        },
      ];

      const selectMock = jest.fn().mockReturnThis();
      const eqMock = jest.fn().mockReturnThis();
      const orderMock = jest.fn().mockResolvedValue({
        data: mockConciliaciones,
        error: null,
      });

      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockConciliaciones));

      const resultado = await service.listarConciliaciones(tenantId, {
        cuenta_bancaria_id: 'cuenta-1',
      });

      expect(resultado.success).toBe(true);
      expect(resultado.data).toHaveLength(1);
    });

    it('debe filtrar por estado', async () => {
      const selectMock = jest.fn().mockReturnThis();
      const eqMock = jest.fn().mockReturnThis();

      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder([]));

      const resultado = await service.listarConciliaciones(tenantId, {
        estado: 'CERRADA',
      });

      expect(resultado.success).toBe(true);
    });
  });

  describe('obtenerConciliacion', () => {
    const tenantId = 'test-tenant';
    const conciliacionId = 'conc-1';

    it('debe obtener una conciliación por ID', async () => {
      const mockConciliacion = {
        id: conciliacionId,
        tenant_id: tenantId,
        periodo: '2024-01',
        estado: 'ABIERTA',
        cuentas_bancarias: {
          banco: 'BCP',
          numero_cuenta: '123456789',
        },
      };

      const selectMock = jest.fn().mockReturnThis();
      const eqMock1 = jest.fn().mockReturnThis();
      const eqMock2 = jest.fn().mockReturnThis();

      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockConciliacion));

      const resultado = await service.obtenerConciliacion(tenantId, conciliacionId);

      expect(resultado.success).toBe(true);
      expect(resultado.data.id).toBe(conciliacionId);
      expect(resultado.data.periodo).toBe('2024-01');
    });

    it('debe lanzar NotFoundException si no existe', async () => {
      const selectMock = jest.fn().mockReturnThis();
      const eqMock1 = jest.fn().mockReturnThis();
      const eqMock2 = jest.fn().mockReturnThis();

      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(null));

      await expect(
        service.obtenerConciliacion(tenantId, conciliacionId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('crearConciliacion', () => {
    const tenantId = 'test-tenant';
    const userId = 'user-1';

    const mockCuenta = {
      id: 'cuenta-1',
      banco: 'BCP',
      numero_cuenta: '123456789',
      saldo_actual: 10000,
      saldo_contable: 10000,
      moneda: 'PEN',
    };

    it('debe crear una conciliación correctamente', async () => {
      // Mock: Verificar cuenta bancaria
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockCuenta));

      // Mock: Verificar que no existe conciliación para el período
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(null));

      // Mock: Obtener movimientos hasta la fecha
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder([
        { tipo: 'ABONO', monto: '5000' },
        { tipo: 'CARGO', monto: '2000' },
      ]));

      // Mock: Insertar conciliación
      const mockConciliacion = {
        id: 'conc-1',
        tenant_id: tenantId,
        cuenta_bancaria_id: mockCuenta.id,
        periodo: '2024-01',
        estado: 'ABIERTA',
        saldo_libro: 3000,
      };

      // Mock: Insertar conciliación
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockConciliacion));

      const resultado = await service.crearConciliacion(
        tenantId,
        {
          cuenta_bancaria_id: mockCuenta.id,
          periodo: '2024-01',
          fecha_desde: '2024-01-01',
          fecha_hasta: '2024-01-31',
        },
        userId,
      );

      expect(resultado.success).toBe(true);
      expect(resultado.data.estado).toBe('ABIERTA');
      expect(resultado.data.saldo_libro).toBe(3000);
    });

    it('debe rechazar si la fecha desde es mayor a fecha hasta', async () => {
      // Mock: Verificar cuenta bancaria
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockCuenta));

      await expect(
        service.crearConciliacion(tenantId, {
          cuenta_bancaria_id: mockCuenta.id,
          periodo: '2024-01',
          fecha_desde: '2024-01-31',
          fecha_hasta: '2024-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar si ya existe conciliación para el período', async () => {
      // Mock: Verificar cuenta bancaria
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockCuenta));

      // Mock: Ya existe conciliación
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder({ id: 'conc-existente', periodo: '2024-01' }));

      await expect(
        service.crearConciliacion(tenantId, {
          cuenta_bancaria_id: mockCuenta.id,
          periodo: '2024-01',
          fecha_desde: '2024-01-01',
          fecha_hasta: '2024-01-31',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('importarCsv', () => {
    const tenantId = 'test-tenant';
    const conciliacionId = 'conc-1';

    const mockConciliacion = {
      id: conciliacionId,
      tenant_id: tenantId,
      cuenta_bancaria_id: 'cuenta-1',
      estado: 'ABIERTA',
      saldo_libro: 10000,
      cuentas_bancarias: {
        banco: 'BCP',
      },
    };

    it('debe importar CSV y crear movimientos del extracto', async () => {
      const csvContent = 'fecha,descripcion,cargo,abono\n2024-01-15,Pago cliente,,1000\n2024-01-16,Pago proveedor,500,';

      // Mock: Obtener conciliación
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockConciliacion));

      // Mock: Count existing extracto (re-import guard)
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(null));

      // Mock: CSV parser
      mockCsvParserService.parsearExtractoBancario.mockReturnValue({
        movimientos: [
          {
            tipo: 'ABONO',
            monto: 1000,
            fecha: '2024-01-15',
            descripcion: 'Pago cliente',
            referencia: null,
          },
          {
            tipo: 'CARGO',
            monto: 500,
            fecha: '2024-01-16',
            descripcion: 'Pago proveedor',
            referencia: null,
          },
        ],
        totalAbonos: 1000,
        totalCargos: 500,
        saldoFinal: 10500,
        errores: [],
      });

      // Mock: Insertar movimientos
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder([{}, {}]));

      // Mock: Actualizar conciliación
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(null));

      const resultado = await service.importarCsv(tenantId, conciliacionId, {
        contenidoCsv: csvContent,
        banco: 'BCP',
      });

      expect(resultado.success).toBe(true);
      expect(resultado.data.movimientos_importados).toBe(2);
      expect(resultado.data.saldo_final).toBe(10500);
    });

    it('debe rechazar si la conciliación está cerrada', async () => {
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder({ ...mockConciliacion, estado: 'CERRADA' }));

      await expect(
        service.importarCsv(tenantId, conciliacionId, {
          contenidoCsv: 'test',
          banco: 'BCP',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar si no hay movimientos válidos en el CSV', async () => {
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockConciliacion));

      // Mock: Count existing extracto (re-import guard)
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(null));

      mockCsvParserService.parsearExtractoBancario.mockReturnValue({
        movimientos: [],
        totalAbonos: 0,
        totalCargos: 0,
        saldoFinal: 0,
        errores: ['No se encontraron movimientos'],
      });

      await expect(
        service.importarCsv(tenantId, conciliacionId, {
          contenidoCsv: 'invalid',
          banco: 'BCP',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('matchAutomatico', () => {
    const tenantId = 'test-tenant';
    const conciliacionId = 'conc-1';

    const mockConciliacion = {
      id: conciliacionId,
      tenant_id: tenantId,
      cuenta_bancaria_id: 'cuenta-1',
      estado: 'EN_PROCESO',
      fecha_desde: '2024-01-01',
      fecha_hasta: '2024-01-31',
      cuentas_bancarias: {
        banco: 'BCP',
      },
    };

    it('debe hacer match automático por referencia exacta', async () => {
      // Mock: Obtener conciliación
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: mockConciliacion,
          error: null,
        }),
      });

      // Mock: Movimientos del sistema
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [
            {
              id: 'mov-sistema-1',
              tipo: 'ABONO',
              monto: '1000',
              fecha: '2024-01-15',
              referencia: 'REF-001',
              conciliado: false,
            },
          ],
          error: null,
        }),
      });

      // Mock: Movimientos del extracto
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [
            {
              id: 'mov-extracto-1',
              tipo: 'ABONO',
              monto: '1000',
              fecha: '2024-01-15',
              referencia: 'REF-001',
              conciliado: false,
            },
          ],
          error: null,
        }),
      });

      // Mock: Updates (2 veces, uno por cada movimiento)
      const updateSistemaBuilder = createMockQueryBuilder(null);
      const updateExtractoBuilder = createMockQueryBuilder(null);
      mockSupabaseClient.from
        .mockReturnValueOnce(updateSistemaBuilder)
        .mockReturnValueOnce(updateExtractoBuilder);

      const resultado = await service.matchAutomatico(tenantId, conciliacionId, {
        tolerancia_dias: 2,
      });

      expect(resultado.success).toBe(true);
      expect(resultado.data.matches_realizados).toBe(1);
      expect(resultado.data.matches_por_referencia).toBe(1);
      expect(updateSistemaBuilder.update).toHaveBeenCalledWith(expect.objectContaining({
        conciliado: true,
        conciliacion_id: conciliacionId,
        match_automatico: true,
        match_id: 'mov-extracto-1',
        movimiento_relacionado_id: 'mov-extracto-1',
      }));
      expect(updateExtractoBuilder.update).toHaveBeenCalledWith(expect.objectContaining({
        conciliado: true,
        conciliacion_id: conciliacionId,
        match_automatico: true,
        match_id: 'mov-sistema-1',
        movimiento_relacionado_id: 'mov-sistema-1',
      }));
    });

    it('debe hacer match automático por monto y fecha con tolerancia', async () => {
      // Mock: Obtener conciliación
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockConciliacion));

      // Mock: Movimientos del sistema
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder([
        {
          id: 'mov-sistema-1',
          tipo: 'CARGO',
          monto: '500',
          fecha: '2024-01-15',
          referencia: null,
          conciliado: false,
        },
      ]));

      // Mock: Movimientos del extracto (fecha +1 día)
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder([
        {
          id: 'mov-extracto-1',
          tipo: 'CARGO',
          monto: '500',
          fecha: '2024-01-16',
          referencia: null,
          conciliado: false,
        },
      ]));

      // Mock: Updates
      mockSupabaseClient.from.mockReturnValue(createMockQueryBuilder(null));

      const resultado = await service.matchAutomatico(tenantId, conciliacionId, {
        tolerancia_dias: 2,
      });

      expect(resultado.success).toBe(true);
      expect(resultado.data.matches_realizados).toBe(1);
      expect(resultado.data.matches_por_monto_fecha).toBe(1);
    });

    it('debe retornar sin matches si no hay movimientos del sistema', async () => {
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockConciliacion));

      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder([]));

      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder([{ id: 'mov-1' }]));

      const resultado = await service.matchAutomatico(tenantId, conciliacionId, {});

      expect(resultado.success).toBe(true);
      expect(resultado.data.matches_realizados).toBe(0);
      expect(resultado.data.mensaje).toContain('No hay movimientos del sistema');
    });
  });

  describe('obtenerDiferencias', () => {
    const tenantId = 'test-tenant';
    const conciliacionId = 'conc-1';

    const mockConciliacion = {
      id: conciliacionId,
      tenant_id: tenantId,
      cuenta_bancaria_id: 'cuenta-1',
      periodo: '2024-01',
      estado: 'EN_PROCESO',
      fecha_desde: '2024-01-01',
      fecha_hasta: '2024-01-31',
      saldo_libro: 10000,
      saldo_banco: 9800,
      diferencia: 200,
      cuentas_bancarias: {
        banco: 'BCP',
        numero_cuenta: '123456789',
        moneda: 'PEN',
      },
    };

    it('debe generar reporte de diferencias correctamente', async () => {
      // Mock: Obtener conciliación
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockConciliacion));

      // Mock: Movimientos del sistema
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder([
        { id: '1', conciliado: true, tipo: 'ABONO', monto: '5000' },
        { id: '2', conciliado: false, tipo: 'CARGO', monto: '1000' },
      ]));

      // Mock: Movimientos del extracto
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder([
        { id: '3', conciliado: true, tipo: 'ABONO', monto: '5000' },
        { id: '4', conciliado: false, tipo: 'CARGO', monto: '800' },
      ]));

      const resultado = await service.obtenerDiferencias(tenantId, conciliacionId);

      expect(resultado.success).toBe(true);
      expect(resultado.data.conciliacion.id).toBe(conciliacionId);
      expect(resultado.data.movimientos_sistema.total).toBe(2);
      expect(resultado.data.movimientos_sistema.conciliados).toBe(1);
      expect(resultado.data.movimientos_sistema.pendientes).toBe(1);
      expect(resultado.data.movimientos_extracto.total).toBe(2);
      expect(resultado.data.metricas.porcentaje_conciliado_sistema).toBe(50);
    });

    it('debe incluir movimientos pendientes detallados', async () => {
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: mockConciliacion,
          error: null,
        }),
      });

      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [
            {
              id: '1',
              conciliado: false,
              tipo: 'ABONO',
              monto: '1000',
              fecha: '2024-01-15',
              descripcion: 'Pago pendiente',
              referencia: 'REF-001',
            },
          ],
          error: null,
        }),
      });

      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      });

      const resultado = await service.obtenerDiferencias(tenantId, conciliacionId);

      expect(resultado.success).toBe(true);
      expect(resultado.data.movimientos_sistema.pendientes_detalle).toHaveLength(1);
      expect(resultado.data.movimientos_sistema.pendientes_detalle[0].descripcion).toBe('Pago pendiente');
    });
  });

  describe('listarPlantillasCsv', () => {
    it('debe listar plantillas CSV disponibles', async () => {
      const mockPlantillas = [
        { codigo: 'BCP', nombre: 'Banco de Crédito del Perú' },
        { codigo: 'BBVA', nombre: 'BBVA Continental' },
      ];

      mockCsvParserService.listarPlantillas.mockReturnValue(mockPlantillas);

      const resultado = await service.listarPlantillasCsv();

      expect(resultado.success).toBe(true);
      expect(resultado.data).toHaveLength(2);
      expect(resultado.data[0].codigo).toBe('BCP');
    });
  });

  describe('registrarPlantillaCsv', () => {
    it('debe registrar una nueva plantilla CSV', async () => {
      const mockPlantilla = {
        codigo: 'INTERBANK',
        nombre: 'Interbank',
        descripcion: 'Plantilla para Interbank',
        tieneEncabezado: true,
        separador: ',',
        formatoFecha: 'DD/MM/YYYY',
        columnas: {
          fecha: 0,
          descripcion: 1,
          cargo: 2,
          abono: 3,
        },
        usaCargoAbonoSeparado: true,
        simbolosMoneda: ['S/', 'PEN'],
        separadorDecimal: '.',
        separadorMiles: ',',
      };

      mockCsvParserService.registrarPlantilla.mockImplementation(() => { });

      const resultado = await service.registrarPlantillaCsv(mockPlantilla);

      expect(resultado.success).toBe(true);
      expect(resultado.data.plantilla.codigo).toBe('INTERBANK');
      expect(mockCsvParserService.registrarPlantilla).toHaveBeenCalled();
    });

    it('debe manejar errores al registrar plantilla', async () => {
      mockCsvParserService.registrarPlantilla.mockImplementation(() => {
        throw new Error('Error al registrar');
      });

      await expect(
        service.registrarPlantillaCsv({
          codigo: 'TEST',
          nombre: 'Test',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('marcarItem - Registro de diferencias', () => {
    const tenantId = 'test-tenant';
    const conciliacionId = 'test-conciliacion-id';
    const cuentaBancariaId = 'cuenta-1';

    const mockConciliacion = {
      id: conciliacionId,
      tenant_id: tenantId,
      cuenta_bancaria_id: cuentaBancariaId,
      estado: 'EN_PROCESO',
    };

    const mockMovimientoSistema = {
      id: 'mov-sistema-1',
      tenant_id: tenantId,
      cuenta_bancaria_id: cuentaBancariaId,
      tipo: 'ABONO',
      monto: '1500.00',
      fecha: '2024-12-15',
      descripcion: 'Pago de cliente',
      referencia: 'REF-001',
      conciliado: false,
      es_extracto: false,
    };

    const mockMovimientoExtracto = {
      id: 'mov-extracto-1',
      tenant_id: tenantId,
      cuenta_bancaria_id: cuentaBancariaId,
      tipo: 'ABONO',
      monto: '1485.50', // Diferencia de 14.50 (comisión bancaria)
      fecha: '2024-12-15',
      descripcion: 'Deposito cliente (con comision)',
      referencia: 'REF-001',
      conciliado: false,
      es_extracto: true,
      conciliacion_id: conciliacionId,
    };

    it('debe rechazar la conciliación con montos distintos sin autorización explícita', async () => {
      // Mock: Conciliación existe y está abierta
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockConciliacion));

      // Mock: Movimiento del sistema existe
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockMovimientoSistema));

      // Mock: Movimiento del extracto existe
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockMovimientoExtracto));

      await expect(
        service.marcarItem(tenantId, conciliacionId, {
          movimiento_sistema_id: mockMovimientoSistema.id,
          movimiento_extracto_id: mockMovimientoExtracto.id,
        }),
      ).rejects.toThrow(/montos no coinciden/i);
    });

    it('debe registrar diferencia cero cuando los montos coinciden exactamente', async () => {
      const mockMovimientoExtractoIgual = {
        ...mockMovimientoExtracto,
        monto: '1500.00', // Mismo monto que el sistema
      };

      // Mock: Conciliación existe
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockConciliacion));

      // Mock: Movimiento del sistema
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockMovimientoSistema));

      // Mock: Movimiento del extracto (monto igual)
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockMovimientoExtractoIgual));

      // Mock: Updates
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(null));
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(null));

      // Ejecutar
      const resultado = await service.marcarItem(tenantId, conciliacionId, {
        movimiento_sistema_id: mockMovimientoSistema.id,
        movimiento_extracto_id: mockMovimientoExtractoIgual.id,
      });

      // Verificar: Diferencia es cero
      expect(resultado.success).toBe(true);
      expect(resultado.data.diferencia).toBe(0);
      expect(resultado.data.mensaje).toContain('sin diferencias');
    });

    it('debe permitir una diferencia manual si está autorizada explícitamente', async () => {
      // Mock: Conciliación existe
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockConciliacion));

      // Mock: Movimiento del sistema
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockMovimientoSistema));

      // Mock: Movimiento del extracto
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockMovimientoExtracto));

      // Mock: Updates
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(null));
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(null));

      // Ejecutar: Con diferencia manual
      const diferenciaManual = 14.50;
      const resultado = await service.marcarItem(tenantId, conciliacionId, {
        movimiento_sistema_id: mockMovimientoSistema.id,
        movimiento_extracto_id: mockMovimientoExtracto.id,
        diferencia: diferenciaManual,
        aceptar_diferencia: true,
      });

      // Verificar: Se usó la diferencia manual
      expect(resultado.success).toBe(true);
      expect(resultado.data.diferencia).toBe(diferenciaManual);
    });

    it('debe rechazar una diferencia manual que no coincide con la diferencia real', async () => {
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockConciliacion));
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockMovimientoSistema));
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockMovimientoExtracto));

      await expect(
        service.marcarItem(tenantId, conciliacionId, {
          movimiento_sistema_id: mockMovimientoSistema.id,
          movimiento_extracto_id: mockMovimientoExtracto.id,
          diferencia: 20,
          aceptar_diferencia: true,
        }),
      ).rejects.toThrow(/no coincide con la diferencia real/i);
    });

    it('debe rechazar el match si los tipos de movimiento no coinciden', async () => {
      const mockMovimientoExtractoCargo = {
        ...mockMovimientoExtracto,
        tipo: 'CARGO', // Diferente al sistema (ABONO)
      };

      // Mock: Conciliación existe
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockConciliacion));

      // Mock: Movimiento del sistema
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockMovimientoSistema));

      // Mock: Movimiento del extracto (tipo diferente)
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockMovimientoExtractoCargo));

      // Ejecutar: Debe fallar
      await expect(
        service.marcarItem(tenantId, conciliacionId, {
          movimiento_sistema_id: mockMovimientoSistema.id,
          movimiento_extracto_id: mockMovimientoExtractoCargo.id,
        }),
      ).rejects.toThrow(/tipos de movimiento no coinciden/);
    });

    it('debe vincular ambos movimientos con movimiento_relacionado_id', async () => {
      // Mock: Conciliación existe
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockConciliacion));

      // Mock: Movimiento del sistema
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockMovimientoSistema));

      // Mock: Movimiento del extracto
      mockSupabaseClient.from.mockReturnValueOnce(createMockQueryBuilder(mockMovimientoExtracto));

      // Mock: Update movimiento sistema - capturar el objeto de actualización
      let updateDataSistema: any;
      const mockBuilderSistema = createMockQueryBuilder(null);
      mockBuilderSistema.update = jest.fn((data) => {
        updateDataSistema = data;
        return mockBuilderSistema;
      });
      mockSupabaseClient.from.mockReturnValueOnce(mockBuilderSistema);

      // Mock: Update movimiento extracto - capturar el objeto de actualización
      let updateDataExtracto: any;
      const mockBuilderExtracto = createMockQueryBuilder(null);
      mockBuilderExtracto.update = jest.fn((data) => {
        updateDataExtracto = data;
        return mockBuilderExtracto;
      });
      mockSupabaseClient.from.mockReturnValueOnce(mockBuilderExtracto);

      // Ejecutar
      await service.marcarItem(tenantId, conciliacionId, {
        movimiento_sistema_id: mockMovimientoSistema.id,
        movimiento_extracto_id: mockMovimientoExtracto.id,
        aceptar_diferencia: true,
      });

      // Verificar: Vinculación correcta
      expect(updateDataSistema.movimiento_relacionado_id).toBe(mockMovimientoExtracto.id);
      expect(updateDataExtracto.movimiento_relacionado_id).toBe(mockMovimientoSistema.id);

      // Verificar: Ambos marcados como conciliados
      expect(updateDataSistema.conciliado).toBe(true);
      expect(updateDataExtracto.conciliado).toBe(true);

      // Verificar: Diferencia registrada en ambos
      expect(updateDataSistema.diferencia_conciliacion).toBeDefined();
      expect(updateDataExtracto.diferencia_conciliacion).toBeDefined();
    });
  });
});
