import { Test, TestingModule } from '@nestjs/testing';
import { PlanCuentasService } from './plan-cuentas.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

describe('PlanCuentasService', () => {
  let service: PlanCuentasService;
  let supabaseService: jest.Mocked<SupabaseService>;
  let mockSupabaseClient: any;

  beforeEach(async () => {
    // Crear un mock que siempre retorna a sí mismo para permitir encadenamiento
    mockSupabaseClient = {};
    mockSupabaseClient.from = jest.fn().mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.select = jest.fn().mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.insert = jest.fn().mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.eq = jest.fn().mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.in = jest.fn().mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.or = jest.fn().mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.order = jest.fn().mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.limit = jest.fn().mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.single = jest.fn();
    mockSupabaseClient.maybeSingle = jest.fn().mockResolvedValue({
      data: { pais: 'PE' },
      error: null,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanCuentasService,
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn(() => mockSupabaseClient)
          }
        }
      ]
    }).compile();

    service = module.get<PlanCuentasService>(PlanCuentasService);
    supabaseService = module.get(SupabaseService) as jest.Mocked<SupabaseService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('obtenerCuentaPorCodigo', () => {
    it('debe obtener una cuenta por su código', async () => {
      const mockCuenta = {
        id: '123',
        tenant_id: 'tenant-1',
        codigo: '10',
        nombre: 'Efectivo y Equivalentes',
        tipo: 'ACTIVO',
        nivel: 1,
        acepta_movimiento: true,
        estado: 'ACTIVO'
      };

      mockSupabaseClient.single.mockResolvedValue({
        data: mockCuenta,
        error: null
      });

      const result = await service.obtenerCuentaPorCodigo('tenant-1', '10');

      expect(result).toEqual(mockCuenta);
      expect(supabaseService.getClient).toHaveBeenCalled();
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('plan_cuentas');
    });

    it('debe lanzar error si la cuenta no existe', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' }
      });

      await expect(
        service.obtenerCuentaPorCodigo('tenant-1', '99')
      ).rejects.toThrow('No se encontró la cuenta 99 en el plan de cuentas');
      errorSpy.mockRestore();
    });

    it('debe lanzar error si la cuenta no acepta movimientos', async () => {
      const mockCuenta = {
        id: '123',
        tenant_id: 'tenant-1',
        codigo: '10',
        nombre: 'Efectivo y Equivalentes',
        tipo: 'ACTIVO',
        nivel: 1,
        acepta_movimiento: false,
        estado: 'ACTIVO'
      };

      mockSupabaseClient.single.mockResolvedValue({
        data: mockCuenta,
        error: null
      });

      await expect(
        service.obtenerCuentaPorCodigo('tenant-1', '10')
      ).rejects.toThrow('La cuenta 10 - Efectivo y Equivalentes no acepta movimientos');
    });
  });

  describe('obtenerCuentasPorCodigos', () => {
    it('debe obtener múltiples cuentas por sus códigos', async () => {
      const mockCuentas = [
        {
          id: '1',
          tenant_id: 'tenant-1',
          codigo: '10',
          nombre: 'Efectivo',
          tipo: 'ACTIVO',
          nivel: 1,
          acepta_movimiento: true,
          estado: 'ACTIVO'
        },
        {
          id: '2',
          tenant_id: 'tenant-1',
          codigo: '12',
          nombre: 'Clientes',
          tipo: 'ACTIVO',
          nivel: 1,
          acepta_movimiento: true,
          estado: 'ACTIVO'
        }
      ];

      // El último .in() en la cadena debe retornar la promesa
      mockSupabaseClient.in.mockResolvedValueOnce({
        data: mockCuentas,
        error: null
      });

      const result = await service.obtenerCuentasPorCodigos('tenant-1', ['10', '12']);

      expect(result.size).toBe(2);
      expect(result.get('10')).toEqual(mockCuentas[0]);
      expect(result.get('12')).toEqual(mockCuentas[1]);
    });

    it('debe lanzar error si faltan cuentas no estandarizadas', async () => {
      const mockCuentas = [
        {
          id: '1',
          tenant_id: 'tenant-1',
          codigo: '10',
          nombre: 'Efectivo',
          tipo: 'ACTIVO',
          nivel: 1,
          acepta_movimiento: true,
          estado: 'ACTIVO'
        }
      ];

      mockSupabaseClient.in.mockResolvedValueOnce({
        data: mockCuentas,
        error: null
      });

      await expect(
        service.obtenerCuentasPorCodigos('tenant-1', ['10', '98', '99'])
      ).rejects.toThrow('No se encontraron las siguientes cuentas: 98, 99');
    });

    it('debe crear cuentas operativas estándar faltantes para eventos contables', async () => {
      const mockCuentas = [
        {
          id: '1',
          tenant_id: 'tenant-1',
          codigo: '10',
          nombre: 'Efectivo',
          tipo: 'ACTIVO',
          nivel: 1,
          acepta_movimiento: true,
          estado: 'ACTIVO'
        }
      ];
      const cuentaClientes = {
        id: '12-id',
        tenant_id: 'tenant-1',
        codigo: '12',
        nombre: 'Cuentas por cobrar comerciales',
        tipo: 'ACTIVO',
        nivel: 2,
        acepta_movimiento: true,
        estado: 'ACTIVO'
      };

      mockSupabaseClient.in.mockResolvedValueOnce({
        data: mockCuentas,
        error: null
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: cuentaClientes,
        error: null
      });

      const result = await service.obtenerCuentasPorCodigos('tenant-1', ['10', '12']);

      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-1',
          codigo: '12',
          acepta_movimiento: true,
          estado: 'ACTIVO',
        })
      );
      expect(result.get('12')).toEqual(cuentaClientes);
    });

    it('reconoce la cuenta PCGE 18 requerida por gastos diferidos', async () => {
      const cuentaAnticipada = {
        id: '18-id',
        tenant_id: 'tenant-1',
        codigo: '18',
        nombre: 'Servicios y otros contratados por anticipado',
        tipo: 'ACTIVO',
        nivel: 2,
        acepta_movimiento: true,
        estado: 'ACTIVO'
      };

      mockSupabaseClient.in.mockResolvedValueOnce({ data: [], error: null });
      mockSupabaseClient.single.mockResolvedValueOnce({ data: cuentaAnticipada, error: null });

      const result = await service.obtenerCuentasPorCodigos('tenant-1', ['18']);

      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-1',
          codigo: '18',
          tipo: 'ACTIVO',
          nombre: 'Servicios y otros contratados por anticipado'
        })
      );
      expect(result.get('18')).toEqual(cuentaAnticipada);
    });

    it('debe crear la cuenta operativa con nomenclatura argentina para un tenant AR', async () => {
      const cuentaArgentina = {
        id: '12-ar-id',
        tenant_id: 'tenant-ar',
        codigo: '12',
        nombre: 'Créditos por ventas',
        tipo: 'ACTIVO',
        nivel: 2,
        acepta_movimiento: true,
        estado: 'ACTIVO',
      };

      mockSupabaseClient.in.mockResolvedValueOnce({
        data: [],
        error: null,
      });
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { pais: 'AR' },
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: cuentaArgentina,
        error: null,
      });

      const result = await service.obtenerCuentasPorCodigos('tenant-ar', ['12']);

      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-ar',
          codigo: '12',
          nombre: 'Créditos por ventas',
          metadata: expect.objectContaining({ pais_codigo: 'AR' }),
        }),
      );
      expect(result.get('12')).toEqual(cuentaArgentina);
    });

    it('debe lanzar error si alguna cuenta no acepta movimientos', async () => {
      const mockCuentas = [
        {
          id: '1',
          tenant_id: 'tenant-1',
          codigo: '10',
          nombre: 'Efectivo',
          tipo: 'ACTIVO',
          nivel: 1,
          acepta_movimiento: true,
          estado: 'ACTIVO'
        },
        {
          id: '2',
          tenant_id: 'tenant-1',
          codigo: '12',
          nombre: 'Clientes',
          tipo: 'ACTIVO',
          nivel: 1,
          acepta_movimiento: false,
          estado: 'ACTIVO'
        }
      ];

      mockSupabaseClient.in.mockResolvedValueOnce({
        data: mockCuentas,
        error: null
      });

      await expect(
        service.obtenerCuentasPorCodigos('tenant-1', ['10', '12'])
      ).rejects.toThrow('Las siguientes cuentas no aceptan movimientos: 12 - Clientes');
    });
  });

  describe('obtenerCuentas', () => {
    it('debe obtener todas las cuentas activas', async () => {
      const mockCuentas = [
        {
          id: '1',
          tenant_id: 'tenant-1',
          codigo: '10',
          nombre: 'Efectivo',
          tipo: 'ACTIVO',
          nivel: 1,
          acepta_movimiento: true,
          estado: 'ACTIVO'
        }
      ];

      // Cadena: .eq(tenant_id) -> .order() -> .eq(estado) -> promesa
      mockSupabaseClient.eq.mockReturnValueOnce(mockSupabaseClient);
      mockSupabaseClient.order.mockReturnValueOnce(mockSupabaseClient);
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: mockCuentas,
        error: null
      });

      const result = await service.obtenerCuentas('tenant-1');

      expect(result).toEqual(mockCuentas);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('plan_cuentas');
    });

    it('debe filtrar por tipo', async () => {
      const mockCuentas = [
        {
          id: '1',
          tenant_id: 'tenant-1',
          codigo: '10',
          nombre: 'Efectivo',
          tipo: 'ACTIVO',
          nivel: 1,
          acepta_movimiento: true,
          estado: 'ACTIVO'
        }
      ];

      // Cadena: .eq(tenant_id) -> .order() -> .eq(tipo) -> .eq(estado) -> promesa
      mockSupabaseClient.eq.mockReturnValueOnce(mockSupabaseClient);
      mockSupabaseClient.order.mockReturnValueOnce(mockSupabaseClient);
      mockSupabaseClient.eq.mockReturnValueOnce(mockSupabaseClient)
        .mockResolvedValueOnce({
          data: mockCuentas,
          error: null
        });

      const result = await service.obtenerCuentas('tenant-1', { tipo: 'ACTIVO' });

      expect(result).toEqual(mockCuentas);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('tipo', 'ACTIVO');
    });

    it('no expone códigos contables duplicados en formularios', async () => {
      const duplicadas = [
        { id: 'old', tenant_id: 'tenant-1', codigo: '407', nombre: 'AFP por pagar', tipo: 'PASIVO', nivel: 3, acepta_movimiento: true, estado: 'ACTIVO' },
        { id: 'new', tenant_id: 'tenant-1', codigo: '407', nombre: 'Aportes por pagar', tipo: 'PASIVO', nivel: 3, acepta_movimiento: true, estado: 'ACTIVO' },
        { id: 'other', tenant_id: 'tenant-1', codigo: '627', nombre: 'Seguridad social', tipo: 'GASTO', nivel: 3, acepta_movimiento: true, estado: 'ACTIVO' },
      ];
      mockSupabaseClient.eq.mockReturnValueOnce(mockSupabaseClient);
      mockSupabaseClient.order.mockReturnValueOnce(mockSupabaseClient);
      mockSupabaseClient.eq.mockResolvedValueOnce({ data: duplicadas, error: null });

      const result = await service.obtenerCuentas('tenant-1');

      expect(result.map((cuenta) => cuenta.codigo)).toEqual(['407', '627']);
      expect(result[0].id).toBe('old');
    });
  });

  describe('buscarCuentas', () => {
    it('debe buscar cuentas por término', async () => {
      const mockCuentas = [
        {
          id: '1',
          tenant_id: 'tenant-1',
          codigo: '10',
          nombre: 'Efectivo',
          tipo: 'ACTIVO',
          nivel: 1,
          acepta_movimiento: true,
          estado: 'ACTIVO'
        }
      ];

      mockSupabaseClient.limit.mockResolvedValue({
        data: mockCuentas,
        error: null
      });

      const result = await service.buscarCuentas('tenant-1', 'efectivo');

      expect(result).toEqual(mockCuentas);
      expect(mockSupabaseClient.or).toHaveBeenCalled();
    });
  });

  describe('obtenerCuentaPorId', () => {
    it('debe obtener una cuenta por su ID', async () => {
      const mockCuenta = {
        id: '123',
        tenant_id: 'tenant-1',
        codigo: '10',
        nombre: 'Efectivo y Equivalentes',
        tipo: 'ACTIVO',
        nivel: 1,
        acepta_movimiento: true,
        estado: 'ACTIVO'
      };

      mockSupabaseClient.single.mockResolvedValue({
        data: mockCuenta,
        error: null
      });

      const result = await service.obtenerCuentaPorId('tenant-1', '123');

      expect(result).toEqual(mockCuenta);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('plan_cuentas');
    });
  });
});
