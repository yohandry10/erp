import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { AuditService } from '../../audit/audit.service';
import { CreateClienteDto, UpdateClienteDto } from './dto';

describe('ClientesService', () => {
  let service: ClientesService;
  let mockSupabaseClient: any;

  const createChainMock = () => {
    const mock: any = {};
    mock.from = jest.fn().mockReturnValue(mock);
    mock.select = jest.fn().mockReturnValue(mock);
    mock.insert = jest.fn().mockReturnValue(mock);
    mock.update = jest.fn().mockReturnValue(mock);
    mock.delete = jest.fn().mockReturnValue(mock);
    mock.eq = jest.fn().mockReturnValue(mock);
    mock.neq = jest.fn().mockReturnValue(mock);
    mock.range = jest.fn().mockReturnValue(mock);
    mock.order = jest.fn().mockReturnValue(mock);
    mock.limit = jest.fn().mockReturnValue(mock);
    mock.or = jest.fn().mockReturnValue(mock);
    mock.ilike = jest.fn().mockReturnValue(mock);
    mock.single = jest.fn();
    mock.maybeSingle = jest.fn();
    return mock;
  };

  beforeEach(async () => {
    mockSupabaseClient = createChainMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientesService,
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn().mockReturnValue(mockSupabaseClient),
          },
        },
        {
          provide: AuditService,
          useValue: {
            registrarCambio: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<ClientesService>(ClientesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('Aislamiento multi-tenant (P2.2)', () => {
    it('findOne debe filtrar por tenant_id y no traer recurso del tenant erróneo', async () => {
      const tenantA = 'tenant-a';

      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'No encontrado' },
      });

      await expect(service.findOne('cliente-1', tenantA)).rejects.toThrow(NotFoundException);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('clientes');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('tenant_id', tenantA);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'cliente-1');
    });

    it('findAll debe devolver solo registros del tenant', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: [],
        count: 0,
        error: null,
      });

      const result = await service.findAll('tenant-a', {
        search: 'Acme',
        tipo: 'EMPRESA',
        page: 1,
        limit: 10,
      });

      expect(result.data).toEqual([]);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('clientes');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('tenant_id', 'tenant-a');
    });

    it('create debe insertar con tenant_id del contexto', async () => {
      const tenantA = 'tenant-a';
      const createDto: CreateClienteDto = {
        tipo: 'EMPRESA' as any,
        documento_tipo: 'RUC' as any,
        documento_numero: '20600900000',
        razon_social: 'ACME S.A.C.',
        nombre_comercial: 'ACME',
        direccion: 'Av. Demo 123',
        email: 'contabilidad@acme.com',
        telefono: '+51999999999',
      };

      mockSupabaseClient.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      });

      mockSupabaseClient.single.mockResolvedValue({
        data: {
          id: 'cliente-1',
          tenant_id: tenantA,
          documento_numero: createDto.documento_numero,
        },
        error: null,
      });

      const nuevo = await service.create(createDto, tenantA, 'user-1');
      const insertPayload = mockSupabaseClient.insert.mock.calls[0][0];

      expect(nuevo).toBeDefined();
      expect(insertPayload).toMatchObject({
        tenant_id: tenantA,
        numero_documento: null,
        documento_tipo: createDto.documento_tipo,
        codigo: createDto.documento_numero,
        ruc: createDto.documento_numero,
      });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('tenant_id', tenantA);
    });

    it('create mantiene DNI seguro en columnas numéricas', async () => {
      const tenantA = 'tenant-a';
      const createDto: CreateClienteDto = {
        tipo: 'PERSONA' as any,
        documento_tipo: 'DNI' as any,
        documento_numero: '12345678',
        razon_social: 'Cliente DNI',
      };

      mockSupabaseClient.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      });

      mockSupabaseClient.single.mockResolvedValue({
        data: {
          id: 'cliente-2',
          tenant_id: tenantA,
          documento_numero: 12345678,
        },
        error: null,
      });

      await service.create(createDto, tenantA, 'user-1');
      const insertPayload = mockSupabaseClient.insert.mock.calls[0][0];

      expect(insertPayload).toMatchObject({
        tenant_id: tenantA,
        numero_documento: 12345678,
        documento_numero: 12345678,
        codigo: '12345678',
        ruc: null,
      });
    });

    it('update no debe actualizar recurso de otro tenant', async () => {
      const tenantA = 'tenant-a';
      const tenantB = 'tenant-b';
      const dto: UpdateClienteDto = {
        razon_social: 'ACME EDITADA',
      };

      mockSupabaseClient.single
        .mockResolvedValue({
          data: null,
          error: { message: 'No encontrado' },
        });

      await expect(service.update('cliente-cross', dto, tenantA)).rejects.toThrow(NotFoundException);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('tenant_id', tenantA);
      expect(mockSupabaseClient.eq).not.toHaveBeenCalledWith('tenant_id', tenantB);
    });

    it('update debe persistir nombre comercial y no enviar telefono inexistente', async () => {
      const tenantA = 'tenant-a';
      const dto: UpdateClienteDto = {
        razon_social: 'Cliente editado',
        nombre_comercial: 'Marca Cliente',
        direccion: 'Av. Runtime 123',
        telefono: '+51999990000',
      };

      mockSupabaseClient.single
        .mockResolvedValueOnce({
          data: {
            id: 'cliente-1',
            tenant_id: tenantA,
            razon_social: 'Cliente original',
            documento_tipo: 'DNI',
            codigo: '12345678',
          },
          error: null,
        })
        .mockResolvedValueOnce({
          data: {
            id: 'cliente-1',
            tenant_id: tenantA,
            razon_social: 'Cliente editado',
            nombre: 'Cliente editado',
            direccion: 'Av. Runtime 123',
          },
          error: null,
        });

      await service.update('cliente-1', dto, tenantA, 'user-1');
      const updatePayload = mockSupabaseClient.update.mock.calls[0][0];

      expect(updatePayload).toMatchObject({
        razon_social: 'Cliente editado',
        nombre: 'Cliente editado',
        nombre_comercial: 'Marca Cliente',
        direccion: 'Av. Runtime 123',
      });
      expect(updatePayload).not.toHaveProperty('telefono');
    });

    it('validarRUC solo confirma el dígito verificador y no inventa datos SUNAT', async () => {
      const result = await service.validarRUC({ ruc: '20100066603' });

      expect(result).toEqual(expect.objectContaining({
        ruc: '20100066603',
        validado_formato: true,
        consulta_sunat: false,
        fuente: 'VALIDACION_LOCAL',
      }));
      expect(result).not.toHaveProperty('razon_social');
      expect(result).not.toHaveProperty('estado');
      expect(result).not.toHaveProperty('condicion');
      expect(result).not.toHaveProperty('direccion');
    });
  });
});
