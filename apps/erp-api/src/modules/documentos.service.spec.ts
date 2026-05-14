import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DocumentosService } from './documentos.service';
import { SupabaseService } from '../shared/supabase/supabase.service';
import { CacheInvalidationService } from '../shared/cache/cache-invalidation.service';
import { TaxCalculatorService } from '../shared/utils/tax-calculator';
import { EventBusService } from '../shared/events/event-bus.service';
import { CpeService } from './cpe/cpe.service';
import { CxcService } from './finanzas/cxc/cxc.service';

describe('DocumentosService', () => {
  let service: DocumentosService;
  let mockSupabaseClient: any;

  const createSupabaseQuery = () => {
    const queue: any[] = [];
    const query: any = {
      __queue: queue,
      single: jest.fn(),
      rpc: jest.fn(),
      pushResult: (result: any) => {
        queue.push(result);
        return query;
      },
      then: (resolve: any) =>
        Promise.resolve(
          queue.length ? queue.shift() : { data: null, error: null, count: 0 },
        ).then(resolve),
    };
    // Self-referencing chainable methods must be assigned after declaration
    query.from = jest.fn().mockReturnValue(query);
    query.select = jest.fn().mockReturnValue(query);
    query.insert = jest.fn().mockReturnValue(query);
    query.update = jest.fn().mockReturnValue(query);
    query.or = jest.fn().mockReturnValue(query);
    query.order = jest.fn().mockReturnValue(query);
    query.eq = jest.fn().mockReturnValue(query);
    query.gte = jest.fn().mockReturnValue(query);
    query.lte = jest.fn().mockReturnValue(query);
    query.ilike = jest.fn().mockReturnValue(query);
    query.in = jest.fn().mockReturnValue(query);
    return query;
  };

  beforeEach(async () => {
    mockSupabaseClient = createSupabaseQuery();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentosService,
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn().mockReturnValue(mockSupabaseClient),
          },
        },
        {
          provide: CacheInvalidationService,
          useValue: { onDocumentoCreated: jest.fn() },
        },
        {
          provide: TaxCalculatorService,
          useValue: { calcularImpuestos: jest.fn() },
        },
        {
          provide: EventBusService,
          useValue: { emitDocumentoFiscalGenerado: jest.fn() },
        },
        {
          provide: CpeService,
          useValue: {},
        },
        {
          provide: CxcService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<DocumentosService>(DocumentosService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('Aislamiento multi-tenant (P2.2)', () => {
    it('getDocumentos debe incluir filtro tenant_id cuando se indica tenant', async () => {
      const tenantA = 'tenant-a';
      mockSupabaseClient.pushResult({
        data: [
          { id: 'doc-1', tenant_id: tenantA },
          { id: 'doc-2', tenant_id: tenantA },
        ],
      });

      const result = await service.getDocumentos({}, tenantA);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
        expect(mockSupabaseClient.from).toHaveBeenCalledWith('documentos');
        expect(mockSupabaseClient.eq).toHaveBeenCalledWith('tenant_id', tenantA);
        expect(mockSupabaseClient.eq).not.toHaveBeenCalledWith('tenant_id', 'tenant-b');
    });

    it('crearDocumento debe insertar con tenant_id del contexto y no permitir tenant externo', async () => {
        const tenantA = 'tenant-a';

        mockSupabaseClient.rpc.mockResolvedValueOnce({
            data: '00000001',
            error: null,
        });

        mockSupabaseClient.single
            .mockResolvedValueOnce({
                data: {
                    ruc: '20123456789',
                    razon_social: 'Empresa Demo',
                    direccion_fiscal: 'Av. Demo 123',
                },
                error: null,
            })
            .mockResolvedValueOnce({
                data: {
                    id: 'doc-tenant-a',
                    tenant_id: tenantA,
                    tipo_documento: 'FACTURA',
                },
                error: null,
            });

        await service.crearDocumento(
            {
                tipo_documento: 'FACTURA',
                receptor_numero_doc: '20100100111',
                total: 100,
                serie: 'F001',
                moneda: 'PEN',
            },
            tenantA,
            'user-1',
        );

        const insertPayload = mockSupabaseClient.insert.mock.calls[0][0];
        expect(insertPayload).toMatchObject({
            tenant_id: tenantA,
            tipo_documento: 'FACTURA',
            receptor_numero_doc: '20100100111',
        });
        expect(insertPayload).not.toHaveProperty('tenant_id', 'tenant-b');
        expect(mockSupabaseClient.from).toHaveBeenCalledWith('documentos');
        expect(mockSupabaseClient.eq).toHaveBeenCalledWith('tenant_id', tenantA);
    });

    it('getDocumento filtra por tenant_id y falla si no pertenece al tenant', async () => {
        mockSupabaseClient.single.mockResolvedValue({
            data: null,
            error: { message: 'No encontrado' },
        });

      await expect(service.getDocumento('doc-cross', 'tenant-a')).rejects.toThrow(NotFoundException);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('documentos');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('tenant_id', 'tenant-a');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'doc-cross');
    });
  });
});
