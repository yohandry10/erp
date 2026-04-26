import { Test, TestingModule } from '@nestjs/testing';
import { CpeService } from './cpe.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { ConfigService } from '@nestjs/config';
import { EventBusService } from '../../shared/events/event-bus.service';
import { OseService } from '../ose/ose.service';
import { ValidationService } from '../validations/validation.service';
import { AuditService } from '../audit/audit.service';
import { CacheInvalidationService } from '../../shared/cache/cache-invalidation.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { FiscalAdapterService } from './fiscal-adapter.service';
import { CreateFacturaDto } from '@erp-suite/dtos';
import { BadRequestException } from '@nestjs/common';

// Mock XmlSigner
jest.mock('@erp-suite/crypto', () => {
    return {
        XmlSigner: jest.fn().mockImplementation(() => ({
            signXml: jest.fn().mockReturnValue('<xml>signed</xml>'),
            generateHash: jest.fn().mockReturnValue('mock-hash'),
            validateSignature: jest.fn().mockReturnValue(true),
        })),
    };
});

describe('CpeService', () => {
    let service: CpeService;
    let supabaseService: jest.Mocked<SupabaseService>;
    let validationService: jest.Mocked<ValidationService>;
    let eventBusService: jest.Mocked<EventBusService>;
    let module: TestingModule;

    let mockSupabaseClient: any;

    const mockTenantId = 'tenant-123';
    const mockCreateFacturaDto: CreateFacturaDto = {
        tipo_documento: '01' as any,
        serie: 'F001',
        numero: 1,
        fecha_emision: '2023-10-27T10:00:00Z',
        fecha_vencimiento: '2023-10-27T10:00:00Z',
        moneda: 'PEN',
        items: [
            {
                codigo: 'PROD1',
                descripcion: 'Producto 1',
                cantidad: 1,
                precio_unitario: 100,
                unidad: 'NIU',
                valor_venta: 100,
                impuesto_igv: 18,
                total_item: 118
            }
        ],
        ruc_emisor: '20100100100',
        razon_social_emisor: 'Empresa Demo',
        direccion_emisor: 'Av. Demo 123',
        tipo_documento_receptor: '6',
        documento_receptor: '20600600600',
        razon_social_receptor: 'Cliente Demo',
        direccion_receptor: 'Av. Cliente 456',
        total_gravadas: 100,
        total_igv: 18,
        total_venta: 118,
        condicion_pago: 'CONTADO'
    };

    beforeEach(async () => {
        mockSupabaseClient = {
            from: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn(),
            single: jest.fn(),
            insert: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            rpc: jest.fn().mockReturnThis(),
        };

        module = await Test.createTestingModule({
            providers: [
                CpeService,
                {
                    provide: SupabaseService,
                    useValue: {
                        getClient: jest.fn(() => mockSupabaseClient),
                        update: jest.fn()
                    },
                },
                {
                    provide: ConfigService,
                    useValue: { get: jest.fn((key) => key === 'PFX_PASS' ? 'pass' : null) },
                },
                {
                    provide: EventBusService,
                    useValue: {
                        emitComprobanteCreadoEvent: jest.fn(),
                        emitFacturaEmitidaEvent: jest.fn(),
                        emit: jest.fn(),
                    },
                },
                {
                    provide: OseService,
                    useValue: {},
                },
                {
                    provide: ValidationService,
                    useValue: {
                        validateCertificate: jest.fn(),
                        validateRucConfiguration: jest.fn(),
                        validateDocumentBeforeEmission: jest.fn(),
                    },
                },
                {
                    provide: AuditService,
                    useValue: { registrarCambio: jest.fn() },
                },
                {
                    provide: CacheInvalidationService,
                    useValue: { onCpeCreated: jest.fn() },
                },
                {
                    provide: PdfGeneratorService,
                    useValue: {},
                },
                {
                    provide: FiscalAdapterService,
                    useValue: {},
                },
            ],
        }).compile();

        const noopLogger = {
            log: () => { },
            error: () => { },
            warn: () => { },
            debug: () => { },
            verbose: () => { },
            setContext: () => { },
        };
        module.useLogger(noopLogger as any);

        service = module.get<CpeService>(CpeService);
        supabaseService = module.get(SupabaseService);
        validationService = module.get(ValidationService);
        eventBusService = module.get(EventBusService);
    });

    afterEach(async () => {
        jest.clearAllMocks();
        if (module) {
            await module.close();
        }
    });

    describe('create', () => {
        it('debe crear un CPE exitosamente si pasa todas las validaciones', async () => {
            // 1. Validaciones
            validationService.validateCertificate.mockResolvedValue({ isValid: true, warnings: [], errors: [] });
            validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, missingFields: [], errors: [] });
            validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, warnings: [], errors: [] });

            // 2. Idempotencia check
            mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null } as any); // No existing CPE

            // 3. Get certificate (1st call in create) -> Fallback to demo
            mockSupabaseClient.single.mockResolvedValueOnce({
                data: null, // No tenant cert -> fallback to demo
                error: { message: 'Not found' }
            });

            // 4. Insert CPE
            const mockCreatedCpe = {
                id: 'cpe-123',
                ...mockCreateFacturaDto,
                created_at: new Date().toISOString(),
            };
            mockSupabaseClient.single.mockResolvedValueOnce({ data: mockCreatedCpe, error: null });

            // 5. Ensure Document (RPC check)
            mockSupabaseClient.rpc.mockResolvedValueOnce({ data: 'doc-123', error: null });

            // 6. Refresh CPE (optional step in service)
            mockSupabaseClient.single.mockResolvedValueOnce({ data: mockCreatedCpe, error: null });

            // 7. Get certificate (2nd call in prepareXmlForSunat) -> Fallback to demo
            mockSupabaseClient.single.mockResolvedValueOnce({
                data: null, // No tenant cert -> fallback to demo
                error: { message: 'Not found' }
            });

            // 8. Update in prepareXmlForSunat
            supabaseService.update.mockResolvedValue({ data: null, error: null });

            const result = await service.create(mockCreateFacturaDto, mockTenantId);

            expect(result).toBeDefined();
            expect(result.id).toBe('cpe-123');
            expect(mockSupabaseClient.insert).toHaveBeenCalled();
            expect(eventBusService.emitFacturaEmitidaEvent).toHaveBeenCalled();
            expect(supabaseService.update).toHaveBeenCalled();
        });

        it('debe lanzar BadRequestException si falla validación de certificado', async () => {
            const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
            mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null } as any);

            validationService.validateCertificate.mockResolvedValue({
                isValid: false,
                warnings: [],
                errors: ['Certificado expirado']
            });

            await expect(service.create(mockCreateFacturaDto, mockTenantId))
                .rejects.toThrow(BadRequestException);
            errorSpy.mockRestore();
        });

        it('debe lanzar BadRequestException si falla validación fiscal del documento', async () => {
            const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
            mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null });
            validationService.validateCertificate.mockResolvedValue({ isValid: true, warnings: [], errors: [] });
            validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, missingFields: [], errors: [] });

            validationService.validateDocumentBeforeEmission.mockResolvedValue({
                isValid: false,
                warnings: [],
                errors: [{ message: 'IGV incorrecto', code: 'IGV_ERROR' } as any]
            });

            await expect(service.create(mockCreateFacturaDto, mockTenantId))
                .rejects.toThrow(BadRequestException);
            errorSpy.mockRestore();
        });

        it('debe retornar CPE existente si se detecta idempotencia', async () => {
            // Mock existing CPE found
            const existingCpe = { id: 'existing-1', ...mockCreateFacturaDto };
            mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: existingCpe, error: null } as any);

            const result = await service.create(mockCreateFacturaDto, mockTenantId);

            expect(result.id).toBe('existing-1');
            expect(mockSupabaseClient.insert).not.toHaveBeenCalled(); // Should not try to insert again
        });
    });

    describe('recalculateTotals', () => {
        it('debe lanzar error si no hay items', async () => {
            const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
            const invalidDto = { ...mockCreateFacturaDto, items: [] };
            mockSupabaseClient.maybeSingle.mockResolvedValue({ data: null } as any); // Idempotencia

            await expect(service.create(invalidDto, mockTenantId)).rejects.toThrow(/El comprobante debe incluir al menos un ítem/);
            errorSpy.mockRestore();
        });

        it('debe lanzar error si item tiene cantidad <= 0', async () => {
            const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
            const invalidDto = {
                ...mockCreateFacturaDto,
                items: [{ ...mockCreateFacturaDto.items[0], cantidad: 0 }]
            };
            mockSupabaseClient.maybeSingle.mockResolvedValue({ data: null } as any); // Idempotencia

            await expect(service.create(invalidDto, mockTenantId)).rejects.toThrow(/Cada ítem debe tener cantidad > 0/);
            errorSpy.mockRestore();
        });
    });

    describe('crearCPEDesdeDocumento', () => {
        it('debe crear CPE desde documento fiscal', async () => {
            const mockDocumento: any = {
                id: 'doc-1',
                serie: 'F001',
                numero: 100,
                fecha_emision: '2023-11-01',
                fecha_vencimiento: '2023-11-30',
                cliente_id: 'cli-1',
                moneda: 'PEN',
                subtotal: 100,
                impuesto_igv: 18,
                total: 118,
                tipo_documento: '01',
                detalles: [{
                    descripcion: 'Item 1',
                    cantidad: 1,
                    precio_unitario: 100,
                    valor_venta: 100,
                    impuesto_igv: 18,
                    total_item: 118
                }],
                cliente: {
                    documento_tipo: '6',
                    numero_documento: '20600000001',
                    razon_social: 'Cliente 1',
                    direccion: 'Av 1'
                },
                emisor: {
                    ruc: '20100000001',
                    razon_social: 'Emisor 1'
                }
            };

            // 1. Check existing CPE for document (idempotency by doc id)
            mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null } as any);

            // 2. Get Certificate
            mockSupabaseClient.single.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } }); // Demo cert

            // 3. Insert CPE
            const mockInsertedCpe = { id: 'cpe-doc-1' };
            mockSupabaseClient.single.mockResolvedValueOnce({ data: mockInsertedCpe, error: null });

            const result = await service.crearCPEDesdeDocumento(mockDocumento, mockTenantId);

            expect(result).toBe(mockInsertedCpe);
            expect(mockSupabaseClient.insert).toHaveBeenCalledWith(expect.objectContaining({
                documento_id: 'doc-1',
                total_venta: 118
            }));
            expect(eventBusService.emitComprobanteCreadoEvent).toHaveBeenCalled();
            expect(eventBusService.emitFacturaEmitidaEvent).toHaveBeenCalled();
        });

        it('debe retornar CPE existente si ya fue creado', async () => {
            const mockDocumento: any = { id: 'doc-1' };
            const existingCpe = { id: 'cpe-existing-1' };

            mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: existingCpe, error: null });

            const result = await service.crearCPEDesdeDocumento(mockDocumento, mockTenantId);

            expect(result).toBe(existingCpe);
            expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
        });
    });

    describe('checkOseStatus', () => {
        it('debe actualizar estado a ACEPETADO si SUNAT responde success', async () => {
            const mockCpe = {
                id: 'cpe-1',
                tipo_documento: '01',
                serie: 'F001',
                numero: 1,
                hash: 'hash-1',
                estado: 'ENVIADO'
            };

            // 1. Find CPE
            mockSupabaseClient.single.mockResolvedValueOnce({ data: mockCpe, error: null });

            // 2. Mock Fiscal Adapter
            const mockFiscalAdapter = (service as any).fiscalAdapter;
            mockFiscalAdapter.obtenerNombreServicioFiscal = jest.fn().mockResolvedValue('SUNAT');
            mockFiscalAdapter.consultarEstado = jest.fn().mockResolvedValue({
                success: true,
                cdr: 'CDR_XML_CONTENT',
                codigoRespuesta: '0',
                descripcionRespuesta: 'Aceptado'
            });

            // 3. Update CPE
            supabaseService.update.mockResolvedValue({ data: null, error: null });

            const result = await service.checkOseStatus('cpe-1', mockTenantId);

            expect(result.estado).toBe('ACEPTADO');
            expect(supabaseService.update).toHaveBeenCalledWith(
                'cpe',
                expect.objectContaining({
                    estado: 'ACEPTADO',
                    sunat_status: 'ACCEPTED'
                }),
                { id: 'cpe-1' }
            );
        });
    });
});
