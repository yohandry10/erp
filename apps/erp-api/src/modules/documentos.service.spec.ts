import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
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
  let mockCpeService: { anularComprobante: jest.Mock };

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
    query.limit = jest.fn().mockReturnValue(query);
    query.maybeSingle = jest.fn();
    return query;
  };

  beforeEach(async () => {
    mockSupabaseClient = createSupabaseQuery();
    mockCpeService = {
      anularComprobante: jest.fn(),
    };

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
          useValue: mockCpeService,
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
        mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
            data: {
                pais: 'PE',
                moneda_defecto: 'PEN',
                ruc: '20123456789',
            },
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

  describe('anulación fiscal integral', () => {
    it('delega un documento con CPE al flujo fiscal completo sin actualizarlo superficialmente', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 'doc-pos',
          tenant_id: 'tenant-a',
          tipo_documento: 'BOLETA',
          estado: 'EMITIDO',
          serie: 'B001',
          numero: '00000001',
        },
        error: null,
      });
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { id: 'cpe-pos' },
        error: null,
      });
      mockCpeService.anularComprobante.mockResolvedValueOnce({
        success: true,
        cpe_anulado: { id: 'cpe-pos', estado: 'ANULADO' },
        nota_credito: { id: 'nc-pos' },
      });

      const result = await service.anularDocumento(
        'doc-pos',
        'Devolución total',
        'tenant-a',
        'user-1',
      );

      expect(mockCpeService.anularComprobante).toHaveBeenCalledWith(
        'cpe-pos',
        'Devolución total',
        'tenant-a',
        'user-1',
      );
      expect(mockSupabaseClient.update).not.toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({
        success: true,
        nota_credito: { id: 'nc-pos' },
      }));
    });

    it('falla cerrado si un documento fiscal emitido no tiene CPE vinculado', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 'doc-sin-cpe',
          tenant_id: 'tenant-a',
          tipo_documento: 'BOLETA',
          estado: 'EMITIDO',
          serie: 'B001',
          numero: '9',
        },
        error: null,
      });
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });
      mockSupabaseClient.pushResult({ data: [], error: null });

      await expect(
        service.anularDocumento(
          'doc-sin-cpe',
          'QA sin trazabilidad',
          'tenant-a',
          'user-1',
        ),
      ).rejects.toThrow(ConflictException);

      expect(mockCpeService.anularComprobante).not.toHaveBeenCalled();
      expect(mockSupabaseClient.update).not.toHaveBeenCalled();
    });
  });

  describe('validación honesta de RUC', () => {
    it('no simula padrón SUNAT ni autocompleta datos registrales', async () => {
      const result = await service.validarRUC('20100066603');

      expect(result).toEqual(expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          ruc: '20100066603',
          validado_formato: true,
          consulta_sunat: false,
          fuente: 'VALIDACION_LOCAL',
        }),
      }));
      expect(result.data).not.toHaveProperty('razon_social');
      expect(result.data).not.toHaveProperty('estado');
      expect(result.data).not.toHaveProperty('condicion');
      expect(result.data).not.toHaveProperty('direccion');
    });

    it('rechaza RUC con dígito verificador inválido', async () => {
      const result = await service.validarRUC('20100066604');

      expect(result.success).toBe(false);
      expect(result.error).toContain('dígito verificador');
    });

    it('usa CUIT y validación argentina cuando el tenant es AR', async () => {
      jest.spyOn(service as any, 'obtenerContextoPaisTenant').mockResolvedValue({
        pais: 'AR',
        moneda: 'ARS',
        ruc: '30710158229',
      });

      const valid = await service.validarRUC('20301234563', 'tenant-ar');
      const invalid = await service.validarRUC('20301234564', 'tenant-ar');

      expect(valid).toEqual(expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          cuit: '20301234563',
          consulta_arca: false,
          fuente: 'VALIDACION_LOCAL',
        }),
      }));
      expect(valid.data).not.toHaveProperty('consulta_sunat');
      expect(invalid.success).toBe(false);
      expect(invalid.error).toContain('CUIT');
    });
  });

  describe('documentos fiscales Argentina', () => {
    beforeEach(() => {
      jest.spyOn(service as any, 'obtenerContextoPaisTenant').mockResolvedValue({
        pais: 'AR',
        moneda: 'ARS',
        ruc: '30710158229',
      });
    });

    it('exige CUIT válido para factura y no aplica el umbral peruano de boleta', async () => {
      const factura = await service.validarDocumento({
        tipo_documento: 'FACTURA',
        receptor_numero_doc: '20301234564',
        receptor_razon_social: 'Cliente Argentina',
        total: 1000,
      }, 'tenant-ar');
      const comprobanteB = await service.validarDocumento({
        tipo_documento: 'BOLETA',
        receptor_numero_doc: '99999999',
        receptor_razon_social: 'Consumidor final',
        total: 1000,
      }, 'tenant-ar');

      expect(factura.data.valido).toBe(false);
      expect(factura.data.errores.join(' ')).toContain('CUIT');
      expect(comprobanteB.data.valido).toBe(true);
      expect(comprobanteB.data.errores.join(' ')).not.toContain('S/ 700');
    });
  });

  describe('boleta mayor a S/ 700 (SUNAT)', () => {
    const boleta = (overrides: Record<string, any> = {}) => ({
      tipo_documento: 'BOLETA',
      receptor_numero_doc: '45678912',
      receptor_razon_social: 'Juan Perez Lopez',
      total: 850,
      ...overrides,
    });

    it('acepta la boleta cuando el adquirente está identificado con DNI y nombre', async () => {
      const result = await service.validarDocumento(boleta());

      expect(result.data.valido).toBe(true);
      expect(result.data.errores).toEqual([]);
    });

    it('rechaza la boleta cuando el documento es el genérico de clientes varios', async () => {
      const result = await service.validarDocumento(
        boleta({ receptor_numero_doc: '99999999', receptor_razon_social: 'Clientes Varios' }),
      );

      expect(result.data.valido).toBe(false);
      expect(result.data.errores.join(' ')).toContain('S/ 700');
    });

    it('no exige identificación por debajo del umbral', async () => {
      const result = await service.validarDocumento(
        boleta({ total: 700, receptor_numero_doc: '99999999', receptor_razon_social: 'Clientes Varios' }),
      );

      expect(result.data.valido).toBe(true);
    });
  });
});
