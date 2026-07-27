import { Test, TestingModule } from '@nestjs/testing';
import { OrdenesCompraRepository } from './ordenes-compra.repository';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';

describe('OrdenesCompraRepository - findAll con filtros compuestos', () => {
  let repository: OrdenesCompraRepository;
  let supabaseService: SupabaseService;

  const mockSupabaseClient = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdenesCompraRepository,
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn(() => mockSupabaseClient),
          },
        },
        {
          provide: TaxCalculatorService,
          useValue: {},
        },
      ],
    }).compile();

    repository = module.get<OrdenesCompraRepository>(OrdenesCompraRepository);
    supabaseService = module.get<SupabaseService>(SupabaseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Filtro de estado', () => {
    it('debe usar .eq() para un solo estado', async () => {
      const tenantId = 'test-tenant-id';
      const filters = { estado: 'APROBADA' };

      const eqMock = jest.fn().mockReturnThis();
      const inMock = jest.fn().mockReturnThis();
      const orderMock = jest.fn().mockReturnThis();
      const thenable = Promise.resolve({ data: [], error: null, count: 0 } as any);
      const query = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: eqMock,
        in: inMock,
        order: orderMock,
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        then: thenable.then.bind(thenable),
      };

      jest.spyOn(supabaseService, 'getClient').mockReturnValue(query as any);

      await repository.findAll(tenantId, filters);

      // Verificar que se llamó a .eq() con el estado en el query real
      expect(eqMock).toHaveBeenCalledWith('estado', 'APROBADA');
      expect(inMock).not.toHaveBeenCalled();
    });

    it('debe usar .in() para múltiples estados separados por coma', async () => {
      const tenantId = 'test-tenant-id';
      const filters = { estado: 'APROBADA,PARCIAL' };

      // Mock de respuesta
      const mockQuery = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };

      jest.spyOn(supabaseService, 'getClient').mockReturnValue(mockQuery as any);

      await repository.findAll(tenantId, filters);

      // Verificar que se llamó a .in() con array de estados
      expect(mockQuery.in).toHaveBeenCalledWith('estado', ['APROBADA', 'PARCIAL']);
    });

    it('debe manejar espacios en filtros compuestos', async () => {
      const tenantId = 'test-tenant-id';
      const filters = { estado: 'APROBADA, PARCIAL, ENTREGADO' };

      const mockQuery = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };

      jest.spyOn(supabaseService, 'getClient').mockReturnValue(mockQuery as any);

      await repository.findAll(tenantId, filters);

      // Verificar que se eliminaron los espacios
      expect(mockQuery.in).toHaveBeenCalledWith('estado', ['APROBADA', 'PARCIAL', 'ENTREGADO']);
    });

    it('debe funcionar sin filtro de estado', async () => {
      const tenantId = 'test-tenant-id';
      const filters = { proveedor_id: 'proveedor-123' };

      const mockQuery = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };

      jest.spyOn(supabaseService, 'getClient').mockReturnValue(mockQuery as any);

      await repository.findAll(tenantId, filters);

      // Verificar que NO se llamó a .in() ni .eq() con estado
      expect(mockQuery.in).not.toHaveBeenCalledWith('estado', expect.anything());
      expect(mockQuery.eq).toHaveBeenCalledWith('tenant_id', tenantId);
      expect(mockQuery.eq).toHaveBeenCalledWith('proveedor_id', 'proveedor-123');
    });
  });

  describe('Casos de uso reales', () => {
    it('debe soportar el caso de recepciones: APROBADA,PARCIAL', async () => {
      const tenantId = 'test-tenant-id';
      const filters = { estado: 'APROBADA,PARCIAL' };

      const mockQuery = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };

      jest.spyOn(supabaseService, 'getClient').mockReturnValue(mockQuery as any);

      await repository.findAll(tenantId, filters);

      // Este es el caso crítico que estaba roto
      expect(mockQuery.in).toHaveBeenCalledWith('estado', ['APROBADA', 'PARCIAL']);
    });
  });
});
