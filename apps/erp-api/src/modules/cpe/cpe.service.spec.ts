import { Test, TestingModule } from '@nestjs/testing';
import { CpeService } from './cpe.service';
import { SucursalesService } from './../sucursales/sucursales.service';
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
import { BadRequestException, ConflictException } from '@nestjs/common';

// Mock XmlSigner
jest.mock('@erp-suite/crypto', () => {
    return {
        XmlSigner: jest.fn().mockImplementation(() => ({
            signXml: jest.fn().mockReturnValue('<xml>signed</xml>'),
            generateHash: jest.fn().mockReturnValue('mock-hash'),
            validateSignature: jest.fn().mockReturnValue(true),
            validateSignatureStrict: jest.fn().mockReturnValue(true),
        })),
    };
});

describe('CpeService', () => {
    let service: CpeService;
    let supabaseService: jest.Mocked<SupabaseService>;
    let validationService: jest.Mocked<ValidationService>;
    let eventBusService: jest.Mocked<EventBusService>;
    let auditService: jest.Mocked<AuditService>;
    let module: TestingModule;

    let mockSupabaseClient: any;

    const mockTenantId = 'tenant-123';
    const mockUserId = '11111111-1111-4111-8111-111111111111';
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
                igv: 18,
                precio_venta: 118
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
        costo_ventas: 60,
        condicion_pago: 'CONTADO'
    } as any;

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
                    provide: SucursalesService,
                    useValue: { codigoEstablecimientoDeSerie: jest.fn().mockResolvedValue('0000') },
                },
                {
                    provide: SupabaseService,
                    useValue: {
                        getClient: jest.fn(() => mockSupabaseClient),
                        update: jest.fn()
                    },
                },
                {
                provide: ConfigService,
                    useValue: { get: jest.fn((key) => {
                      if (key === 'PFX_PASS') return 'pass1234';
                      if (key === 'PFX_PATH') return '/tmp/demo.pfx';
                      return null;
                    }) },
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
                    useValue: {
                        // Estas pruebas ejercitan el contrato SUNAT. El servicio
                        // resuelve el país antes de validar/idempotencia, por lo que
                        // el doble debe representar explícitamente un tenant PE.
                        obtenerCodigoPais: jest.fn().mockResolvedValue('PE'),
                    },
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
        auditService = module.get(AuditService);
    });

    afterEach(async () => {
        jest.clearAllMocks();
        if (module) {
            await module.close();
        }
    });

    describe('create', () => {
        it.each(['07', '08'])('rechaza el writer genérico para la nota %s', async (tipo) => {
            await expect(service.create({
                ...mockCreateFacturaDto,
                tipo_documento: tipo,
            } as any, mockTenantId, mockUserId)).rejects.toThrow(
                /notas 07\/08 deben crearse desde \/cpe\/notas-referenciadas/i,
            );
            expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
            expect(mockSupabaseClient.rpc).not.toHaveBeenCalled();
        });

        it('finaliza un CPE POS sobre el documento reservado sin crear otra factura/CxC', async () => {
            validationService.validateCertificate.mockResolvedValue({ isValid: true, warnings: [], errors: [] });
            validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, missingFields: [], errors: [] });
            validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, warnings: [], errors: [] });
            mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

            jest.spyOn(service as any, 'validarDocumentoPosReservado').mockResolvedValue(undefined);
            jest.spyOn(service as any, 'getXmlSigner').mockResolvedValue({
                signXml: jest.fn().mockReturnValue('<xml>signed-pos</xml>'),
                generateHash: jest.fn().mockReturnValue('pos-hash'),
                validateSignature: jest.fn().mockReturnValue(true),
                validateSignatureStrict: jest.fn().mockReturnValue(true),
            });

            const dto = {
                ...mockCreateFacturaDto,
                idempotency_key: 'pos.cpe:tenant-123:venta-1',
                documento_id: 'doc-pos-1',
                venta_pos_id: 'venta-pos-1',
            } as any;
            const cpeCreado = {
                id: 'cpe-pos-1',
                ...dto,
                documento_id: 'doc-pos-1',
                estado: 'FIRMADO',
            };
            mockSupabaseClient.rpc.mockResolvedValueOnce({
                data: {
                    cpe: cpeCreado,
                    documento_id: 'doc-pos-1',
                    venta: { cpe_id: 'cpe-pos-1' },
                },
                error: null,
            });

            const result = await service.create(
                dto,
                mockTenantId,
                mockUserId,
                { finalizarDocumentoPosReservado: true },
            );

            expect(result.id).toBe('cpe-pos-1');
            expect(mockSupabaseClient.rpc).not.toHaveBeenCalledWith(
                'emitir_factura_cliente_tx',
                expect.anything(),
            );
            expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
                'finalizar_cpe_pos_tx',
                expect.objectContaining({ p_venta_id: 'venta-pos-1', p_actor_id: mockUserId }),
            );
            expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
            expect(eventBusService.emitComprobanteCreadoEvent).not.toHaveBeenCalled();
        });

        it('rechaza adoptar un documento POS que no coincide con la venta atómica', async () => {
            mockSupabaseClient.single.mockResolvedValueOnce({
                data: {
                    id: 'venta-pos-1',
                    documento_id: 'doc-distinto',
                    cpe_data: {
                        documento_id: 'doc-distinto',
                        serie: 'F001',
                        numero: 1,
                    },
                    total: 118,
                    cliente_documento: '20600600600',
                    accounting_event_id: 'event-pos-1',
                    atomic_result: { venta_id: 'venta-pos-1' },
                },
                error: null,
            });

            await expect((service as any).validarDocumentoPosReservado({
                ...mockCreateFacturaDto,
                documento_id: 'doc-pos-1',
                venta_pos_id: 'venta-pos-1',
            }, mockTenantId)).rejects.toThrow(
                'El CPE POS no coincide con la venta y el documento reservados atómicamente',
            );
        });

        it('acepta finalizar un documento POS PE/AR sin exigir metadata de numeración DIAN', async () => {
            mockSupabaseClient.single.mockResolvedValueOnce({
                data: {
                    id: 'venta-pos-1',
                    documento_id: 'doc-pos-1',
                    cpe_data: {
                        documento_id: 'doc-pos-1',
                        serie: 'F001',
                        numero: 1,
                        metadata: {},
                    },
                    total: 118,
                    cliente_documento: '20600600600',
                    accounting_event_id: 'event-pos-1',
                    atomic_result: { venta_id: 'venta-pos-1' },
                },
                error: null,
            });

            await expect((service as any).validarDocumentoPosReservado({
                ...mockCreateFacturaDto,
                documento_id: 'doc-pos-1',
                venta_pos_id: 'venta-pos-1',
            }, mockTenantId, false)).resolves.toBeNull();
        });

        it('debe crear un CPE exitosamente si pasa todas las validaciones', async () => {
            // 1. Validaciones
            validationService.validateCertificate.mockResolvedValue({ isValid: true, warnings: [], errors: [] });
            validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, missingFields: [], errors: [] });
            validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, warnings: [], errors: [] });

            // 2. Idempotencia check
            mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null } as any); // No existing CPE

            // 3. El contrato de creación se prueba con un firmador tenant ya resuelto.
            // La política real/demo del certificado tiene su suite específica.
            jest.spyOn(service as any, 'getXmlSigner').mockResolvedValue({
                signXml: jest.fn().mockReturnValue('<xml>signed-success</xml>'),
                generateHash: jest.fn().mockReturnValue('success-hash'),
                validateSignature: jest.fn().mockReturnValue(true),
                validateSignatureStrict: jest.fn().mockReturnValue(true),
            });

            const mockCreatedCpe = {
                id: 'cpe-123',
                ...mockCreateFacturaDto,
                estado: 'FIRMADO',
                sunat_status: 'READY',
                created_at: new Date().toISOString(),
            };
            mockSupabaseClient.rpc.mockResolvedValueOnce({
                data: {
                    cpe: mockCreatedCpe,
                    cpe_id: 'cpe-123',
                    documento_id: 'doc-123',
                    cxc_id: null,
                    idempotent: false,
                    repaired: false,
                },
                error: null,
            });

            const result = await service.create(mockCreateFacturaDto, mockTenantId, mockUserId);

            expect(result).toBeDefined();
            expect(result.id).toBe('cpe-123');
            expect((result as any).documento_id).toBe('doc-123');
            expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
                'emitir_factura_cliente_tx',
                expect.objectContaining({
                    p_tenant_id: mockTenantId,
                    p_event_id: expect.any(String),
                    p_idempotency_key: expect.any(String),
                    p_cxc: null,
                    p_detalles: [
                        expect.objectContaining({
                            orden: 1,
                            valor_venta: 100,
                            impuesto_igv: 18,
                            total_item: 118,
                        }),
                    ],
                }),
            );
            expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
            expect(supabaseService.update).not.toHaveBeenCalled();
            expect(eventBusService.emitComprobanteCreadoEvent).not.toHaveBeenCalled();
            expect(eventBusService.emitFacturaEmitidaEvent).not.toHaveBeenCalled();
        });

        it('debe crear la CxC y sus ajustes dentro de la misma RPC para una venta a crédito', async () => {
            const completedDirectRetrySpy = jest.spyOn(
                service as any,
                'findCompletedDirectDianCpe',
            );
            validationService.validateCertificate.mockResolvedValue({ isValid: true, warnings: [], errors: [] });
            validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, missingFields: [], errors: [] });
            validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, warnings: [], errors: [] });

            jest.spyOn(service as any, 'getXmlSigner').mockResolvedValue({
                signXml: jest.fn().mockReturnValue('<xml>signed-credit</xml>'),
                generateHash: jest.fn().mockReturnValue('credit-hash'),
                validateSignature: jest.fn().mockReturnValue(true),
                validateSignatureStrict: jest.fn().mockReturnValue(true),
            });

            mockSupabaseClient.maybeSingle
                .mockResolvedValueOnce({
                    data: {
                        id: '22222222-2222-4222-8222-222222222222',
                        sujeto_retencion: true,
                        retencion_tasa: 3,
                    },
                    error: null,
                })
                .mockResolvedValueOnce({ data: {}, error: null });
            mockSupabaseClient.rpc.mockResolvedValueOnce({
                data: {
                    cpe: {
                        id: 'cpe-credit',
                        ...mockCreateFacturaDto,
                        estado: 'FIRMADO',
                        sunat_status: 'READY',
                    },
                    documento_id: 'doc-credit',
                    cxc_id: 'cxc-credit',
                },
                error: null,
            });

            const dto = {
                ...mockCreateFacturaDto,
                cliente_id: '22222222-2222-4222-8222-222222222222',
                condicion_pago: 'CREDITO',
            } as CreateFacturaDto;
            const result = await service.create(dto, mockTenantId, mockUserId);

            expect(result.id).toBe('cpe-credit');
            expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
                'emitir_factura_cliente_tx',
                expect.objectContaining({
                    p_cxc: expect.objectContaining({
                        cliente_id: dto.cliente_id,
                        monto_total: 118,
                        monto_pendiente: 114.46,
                        retencion_total: 3.54,
                        percepcion_total: 0,
                        detraccion_total: 0,
                        anticipo_total: 0,
                    }),
                }),
            );
            expect(eventBusService.emitFacturaEmitidaEvent).not.toHaveBeenCalled();
            expect(completedDirectRetrySpy).not.toHaveBeenCalled();
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

        it('debe reconciliar un CPE existente mediante la RPC en vez de retornar temprano', async () => {
            const completedDirectRetrySpy = jest.spyOn(
                service as any,
                'findCompletedDirectDianCpe',
            );
            const existingCpe = { id: 'existing-1', ...mockCreateFacturaDto };
            mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: existingCpe, error: null } as any);

            validationService.validateCertificate.mockResolvedValue({ isValid: true, warnings: [], errors: [] });
            validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, missingFields: [], errors: [] });
            validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, warnings: [], errors: [] });
            jest.spyOn(service as any, 'getXmlSigner').mockResolvedValue({
                signXml: jest.fn().mockReturnValue('<xml>signed-reconciled</xml>'),
                generateHash: jest.fn().mockReturnValue('reconciled-hash'),
                validateSignature: jest.fn().mockReturnValue(true),
                validateSignatureStrict: jest.fn().mockReturnValue(true),
            });
            mockSupabaseClient.rpc.mockResolvedValueOnce({
                data: {
                    cpe: { ...existingCpe, estado: 'FIRMADO', sunat_status: 'READY' },
                    documento_id: 'doc-repaired',
                    cxc_id: null,
                    idempotent: true,
                    repaired: true,
                },
                error: null,
            });

            const result = await service.create(mockCreateFacturaDto, mockTenantId, mockUserId);

            expect(result.id).toBe('existing-1');
            expect((result as any).documento_id).toBe('doc-repaired');
            expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
                'emitir_factura_cliente_tx',
                expect.any(Object),
            );
            expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
            expect(completedDirectRetrySpy).not.toHaveBeenCalled();
        });
    });

    describe('recalculateTotals', () => {
        it('debe lanzar error si no hay items', async () => {
            const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
            const invalidDto = { ...mockCreateFacturaDto, items: [] };
            mockSupabaseClient.maybeSingle.mockResolvedValue({ data: null } as any); // Idempotencia

            await expect(service.create(invalidDto, mockTenantId, mockUserId)).rejects.toThrow(/El comprobante debe incluir al menos un ítem/);
            errorSpy.mockRestore();
        });

        it('debe lanzar error si item tiene cantidad <= 0', async () => {
            const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
            const invalidDto = {
                ...mockCreateFacturaDto,
                items: [{ ...mockCreateFacturaDto.items[0], cantidad: 0 }]
            };
            mockSupabaseClient.maybeSingle.mockResolvedValue({ data: null } as any); // Idempotencia

            await expect(service.create(invalidDto, mockTenantId, mockUserId)).rejects.toThrow(/Cada ítem debe tener cantidad > 0/);
            errorSpy.mockRestore();
        });

        it('debe rechazar totales declarados que no coinciden con items', async () => {
            const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
            const invalidDto = {
                ...mockCreateFacturaDto,
                total_venta: 999,
            };
            mockSupabaseClient.maybeSingle.mockResolvedValue({ data: null } as any);

            await expect(service.create(invalidDto, mockTenantId, mockUserId)).rejects.toThrow(/Totales inconsistentes/);
            errorSpy.mockRestore();
        });

        it('debe rechazar factura con receptor sin RUC válido', async () => {
            const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
            const invalidDto = {
                ...mockCreateFacturaDto,
                tipo_documento: '01' as any,
                tipo_documento_receptor: '1',
                documento_receptor: '12345678',
            };
            mockSupabaseClient.maybeSingle.mockResolvedValue({ data: null } as any);

            await expect(service.create(invalidDto, mockTenantId, mockUserId)).rejects.toThrow(/factura requiere receptor con RUC/i);
            errorSpy.mockRestore();
        });
    });

    describe('generateXmlContent SUNAT UBL 2.1', () => {
        it('genera factura con forma de pago, firma UBL y atributos SUNAT requeridos por beta', () => {
            const xml = (service as any).generateXmlContent(mockCreateFacturaDto);

            expect(xml).toContain('<cbc:ProfileID schemeName="Tipo de Operacion"');
            expect(xml).toContain('schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo51">0101</cbc:ProfileID>');
            expect(xml).toContain('<cbc:InvoiceTypeCode listID="0101"');
            expect(xml).toContain('<cac:Signature>');
            expect(xml).toContain('<cbc:URI>#SignatureSP</cbc:URI>');
            expect(xml).toContain('<cac:PaymentTerms>');
            expect(xml).toContain('<cbc:ID>FormaPago</cbc:ID>');
            expect(xml).toContain('<cbc:PaymentMeansID>Contado</cbc:PaymentMeansID>');
            expect(xml).toContain('<cbc:PriceTypeCode listName="Tipo de Precio"');
            expect(xml).toContain('<cbc:TaxExemptionReasonCode listAgencyName="PE:SUNAT" listName="Afectacion del IGV"');
            expect(xml).toContain('<cbc:ID schemeID="UN/ECE 5153" schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT">1000</cbc:ID>');
            expect(xml).toContain('<cbc:PriceAmount currencyID="PEN">100.000000</cbc:PriceAmount>');
        });

        it('genera forma de pago credito con cuota SUNAT cuando corresponde', () => {
            const xml = (service as any).generateXmlContent({
                ...mockCreateFacturaDto,
                condicion_pago: 'CREDITO',
                fecha_vencimiento: '2026-07-16T15:30:00.000Z',
                cuotas: [{ monto: 118, fecha_vencimiento: '2026-07-16T15:30:00.000Z' }],
            });

            expect(xml).toContain('<cbc:PaymentMeansID>Credito</cbc:PaymentMeansID>');
            expect(xml).toContain('<cbc:Amount currencyID="PEN">118.00</cbc:Amount>');
            expect(xml).toContain('<cbc:PaymentMeansID>Cuota001</cbc:PaymentMeansID>');
            expect(xml).toContain('<cbc:PaymentDueDate>2026-07-16</cbc:PaymentDueDate>');
            expect(xml).not.toContain('<cbc:PaymentDueDate>2026-07-16T15:30:00.000Z</cbc:PaymentDueDate>');
        });

        it('preserva fecha y hora local SUNAT sin corrimiento UTC al generar XML', () => {
            const xml = (service as any).generateXmlContent({
                ...mockCreateFacturaDto,
                fecha_emision: '2026-06-17T23:30:00-05:00',
                hora_emision: undefined,
                fecha_vencimiento: '2026-07-17T01:00:00-05:00',
            });

            expect(xml).toContain('<cbc:IssueDate>2026-06-17</cbc:IssueDate>');
            expect(xml).toContain('<cbc:IssueTime>23:30:00</cbc:IssueTime>');
            expect(xml).toContain('<cbc:DueDate>2026-07-17</cbc:DueDate>');
            expect(xml).not.toContain('<cbc:IssueDate>2026-06-18</cbc:IssueDate>');
            expect(xml).not.toContain('<cbc:DueDate>2026-07-18</cbc:DueDate>');
        });

        it('genera nota de credito SUNAT como CreditNote UBL con comprobante afectado', () => {
            const xml = (service as any).generateXmlContent({
                ...mockCreateFacturaDto,
                tipo_documento: '07',
                serie: 'FC01',
                numero: 12,
                total_gravadas: -100,
                total_igv: -18,
                total_venta: -118,
                documento_referencia_tipo: '01',
                documento_referencia_serie: 'F001',
                documento_referencia_numero: '50507464',
                tipo_nota_credito: '01',
                motivo_nota: 'ANULACION DE LA OPERACION',
                items: [{ ...mockCreateFacturaDto.items[0], valor_venta: -100, igv: -18, precio_venta: -118 }],
            } as any);

            expect(xml).toContain('<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"');
            expect(xml).not.toContain('<Invoice xmlns=');
            expect(xml).toContain('<cbc:ReferenceID>F001-50507464</cbc:ReferenceID>');
            expect(xml).toContain('listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo09">01</cbc:ResponseCode>');
            expect(xml).toContain('<cbc:DocumentTypeCode listAgencyName="PE:SUNAT" listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01">01</cbc:DocumentTypeCode>');
            expect(xml).toContain('<cbc:AddressTypeCode>0000</cbc:AddressTypeCode>');
            expect(xml).toContain('<cac:CreditNoteLine>');
            expect(xml).toContain('<cbc:CreditedQuantity unitCode="NIU"');
            expect(xml).toContain('<cbc:PayableAmount currencyID="PEN">118.00</cbc:PayableAmount>');
            expect(xml).not.toContain('>-118.00<');
        });

        it('genera nota de debito SUNAT como DebitNote UBL con RequestedMonetaryTotal', () => {
            const xml = (service as any).generateXmlContent({
                ...mockCreateFacturaDto,
                tipo_documento: '08',
                serie: 'FD01',
                numero: 7,
                documento_referencia_tipo: '03',
                documento_referencia_serie: 'B001',
                documento_referencia_numero: '50578301',
                tipo_nota_debito: '01',
                motivo_nota: 'INTERESES POR MORA',
            } as any);

            expect(xml).toContain('<DebitNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2"');
            expect(xml).not.toContain('<Invoice xmlns=');
            expect(xml).toContain('<cbc:ReferenceID>B001-50578301</cbc:ReferenceID>');
            expect(xml).toContain('listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo10">01</cbc:ResponseCode>');
            expect(xml).toContain('<cac:RequestedMonetaryTotal>');
            expect(xml).toContain('<cac:DebitNoteLine>');
            expect(xml).toContain('<cbc:DebitedQuantity unitCode="NIU"');
        });

        it('rechaza notas SUNAT sin comprobante afectado', () => {
            expect(() => (service as any).generateXmlContent({
                ...mockCreateFacturaDto,
                tipo_documento: '07',
                serie: 'FC01',
                numero: 13,
            } as any)).toThrow(/comprobante afectado/i);
        });
    });

    describe('anulación CPE y contabilidad', () => {
        const createAccountingValidationClient = (responses: Record<string, any>) => ({
            from: jest.fn((table: string) => {
                const response = () => {
                    const configured = responses[table];
                    if (Array.isArray(configured)) {
                        return configured.shift() ?? { data: [], error: null };
                    }
                    return configured ?? { data: [], error: null };
                };
                const chain = {
                    select: jest.fn().mockReturnThis(),
                    eq: jest.fn().mockReturnThis(),
                    in: jest.fn().mockReturnThis(),
                    limit: jest.fn().mockImplementation(() => Promise.resolve(response())),
                    maybeSingle: jest.fn().mockImplementation(() => Promise.resolve(response())),
                };
                return chain;
            }),
        });

        it('bloquea anulación si el CPE no conserva source_event_id contable y audita el intento', async () => {
            const cpe = {
                id: 'cpe-sin-evento',
                estado: 'FIRMADO',
                nota_credito_id: null,
            };
            const client = createAccountingValidationClient({});

            await expect(
                (service as any).assertCpeOriginalAccountingReady(
                    client,
                    mockTenantId,
                    cpe,
                    'user-1',
                    'QA intento sin contabilidad',
                ),
            ).rejects.toThrow(ConflictException);

            expect(auditService.registrarCambio).toHaveBeenCalledWith(
                'cpe',
                'UPDATE',
                'user-1',
                expect.objectContaining({
                    new: expect.objectContaining({ anulacion_bloqueada: true }),
                }),
                mockTenantId,
                'cpe-sin-evento',
                expect.objectContaining({ accion: 'ANULACION_CPE_BLOQUEADA' }),
            );
        });

        it('bloquea anulación si no existe exactamente un asiento original con detalle', async () => {
            const cpe = {
                id: 'cpe-sin-asiento',
                estado: 'FIRMADO',
                event_id: 'event-cpe-1',
                nota_credito_id: null,
            };
            const client = createAccountingValidationClient({
                asientos_contables: { data: [], error: null },
            });

            await expect(
                (service as any).assertCpeOriginalAccountingReady(
                    client,
                    mockTenantId,
                    cpe,
                    'user-1',
                    'QA intento sin asiento',
                ),
            ).rejects.toThrow(/se esperaban 1 asiento contable original/i);
        });

        it('permite continuar si existe un único asiento original con detalle', async () => {
            const cpe = {
                id: 'cpe-contabilizado',
                estado: 'FIRMADO',
                event_id: 'event-cpe-2',
                nota_credito_id: null,
            };
            const client = createAccountingValidationClient({
                asientos_contables: { data: [{ id: 'asiento-1' }], error: null },
                detalle_asientos: { data: [{ id: 'detalle-1' }], error: null },
            });

            await expect(
                (service as any).assertCpeOriginalAccountingReady(
                    client,
                    mockTenantId,
                    cpe,
                    'user-1',
                    'QA anulación con asiento',
                ),
            ).resolves.toBeUndefined();
        });

        it('permite anular POS cuando factura.emitida y venta.procesada convergen en un asiento único por referencia', async () => {
            const cpe = {
                id: 'cpe-pos',
                estado: 'FIRMADO',
                serie: 'B001',
                numero: 3,
                event_id: 'evento-factura-emitida',
                nota_credito_id: null,
            };
            const client = createAccountingValidationClient({
                asientos_contables: [
                    { data: [], error: null },
                    {
                        data: [{
                            id: 'asiento-pos',
                            source_event_id: 'evento-venta-procesada',
                            referencia: 'B001-00000003',
                        }],
                        error: null,
                    },
                ],
                detalle_asientos: { data: [{ id: 'detalle-pos' }], error: null },
            });

            await expect(
                (service as any).assertCpeOriginalAccountingReady(
                    client,
                    mockTenantId,
                    cpe,
                    'user-1',
                    'QA anulación POS',
                ),
            ).resolves.toBeUndefined();

            const fallbackQuery = (client.from as jest.Mock).mock.results[1].value;
            expect(fallbackQuery.in).toHaveBeenCalledWith('referencia', [
                'B001-00000003',
                'B001-3',
            ]);
        });

        it('bloquea el fallback POS si la referencia fiscal apunta a más de un asiento', async () => {
            const cpe = {
                id: 'cpe-pos-duplicado',
                estado: 'FIRMADO',
                serie: 'B001',
                numero: 4,
                event_id: 'evento-factura-duplicado',
                nota_credito_id: null,
            };
            const client = createAccountingValidationClient({
                asientos_contables: [
                    { data: [], error: null },
                    {
                        data: [
                            { id: 'asiento-1', referencia: 'B001-00000004' },
                            { id: 'asiento-2', referencia: 'B001-4' },
                        ],
                        error: null,
                    },
                ],
            });

            await expect(
                (service as any).assertCpeOriginalAccountingReady(
                    client,
                    mockTenantId,
                    cpe,
                    'user-1',
                    'QA referencia duplicada',
                ),
            ).rejects.toThrow(/se encontraron 2/i);
        });

    });

    describe('crearCPEDesdeDocumento', () => {
        const buildDocumento = (): any => ({
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
            });

        const prepararEmisionAtomica = (cpeId: string, idempotent = false) => {
            validationService.validateCertificate.mockResolvedValue({ isValid: true, warnings: [], errors: [] });
            validationService.validateRucConfiguration.mockResolvedValue({ isValid: true, missingFields: [], errors: [] });
            validationService.validateDocumentBeforeEmission.mockResolvedValue({ isValid: true, warnings: [], errors: [] });
            jest.spyOn(service as any, 'getXmlSigner').mockResolvedValue({
                signXml: jest.fn().mockReturnValue('<xml>signed-document</xml>'),
                generateHash: jest.fn().mockReturnValue('document-hash'),
                validateSignature: jest.fn().mockReturnValue(true),
                validateSignatureStrict: jest.fn().mockReturnValue(true),
            });
            mockSupabaseClient.rpc.mockResolvedValueOnce({
                data: {
                    cpe: { id: cpeId, estado: 'FIRMADO', sunat_status: 'READY' },
                    documento_id: 'doc-1',
                    cxc_id: null,
                    idempotent,
                },
                error: null,
            });
        };

        it('debe crear CPE desde documento fiscal mediante la RPC atómica', async () => {
            const completedDirectRetrySpy = jest.spyOn(
                service as any,
                'findCompletedDirectDianCpe',
            );
            const mockDocumento = buildDocumento();
            prepararEmisionAtomica('cpe-doc-1');

            const result = await service.crearCPEDesdeDocumento(mockDocumento, mockTenantId, 'actor-476');

            expect(result.id).toBe('cpe-doc-1');
            expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
                'emitir_factura_cliente_tx',
                expect.objectContaining({
                    p_idempotency_key: 'doc.cpe:doc-1',
                    p_tenant_id: mockTenantId,
                }),
            );
            expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
            expect(eventBusService.emitComprobanteCreadoEvent).not.toHaveBeenCalled();
            expect(eventBusService.emitFacturaEmitidaEvent).not.toHaveBeenCalled();
            expect(completedDirectRetrySpy).not.toHaveBeenCalled();
        });

        it('debe reconciliar el retry mediante la misma RPC atómica', async () => {
            const completedDirectRetrySpy = jest.spyOn(
                service as any,
                'findCompletedDirectDianCpe',
            );
            const mockDocumento = buildDocumento();
            prepararEmisionAtomica('cpe-existing-1', true);

            const result = await service.crearCPEDesdeDocumento(mockDocumento, mockTenantId, 'actor-476');

            expect(result.id).toBe('cpe-existing-1');
            expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
                'emitir_factura_cliente_tx',
                expect.objectContaining({ p_idempotency_key: 'doc.cpe:doc-1' }),
            );
            expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
            expect(completedDirectRetrySpy).not.toHaveBeenCalled();
        });
    });

    describe('checkOseStatus', () => {
        it('debe delegar la consulta durable y finalizar una posible anulación', async () => {
            const deliveryResult = { estado: 'ACEPTADO', sunat_status: 'ACCEPTED' };
            const deliverySpy = jest
                .spyOn((service as any).deliveryService, 'checkOseStatus')
                .mockResolvedValue(deliveryResult);
            const cancellationSpy = jest
                .spyOn((service as any).cancellationService, 'finalizarAnulacionAceptada')
                .mockResolvedValue(null);
            const options = {
                idempotencyKey: 'query-476',
                actorId: mockUserId,
                origin: 'USER' as const,
            };

            const result = await service.checkOseStatus('cpe-1', mockTenantId, options);

            expect(result.estado).toBe('ACEPTADO');
            expect(deliverySpy).toHaveBeenCalledWith('cpe-1', mockTenantId, options);
            expect(cancellationSpy).toHaveBeenCalledWith('cpe-1', mockTenantId);
            expect(supabaseService.update).not.toHaveBeenCalled();
        });
    });

    describe('boleta mayor a S/ 700 (SUNAT)', () => {
        const boleta = (overrides: Record<string, any> = {}) => ({
            tipo_documento: '03',
            tipo_documento_receptor: '1',
            documento_receptor: '45678912',
            razon_social_receptor: 'Juan Perez Lopez',
            moneda: 'PEN',
            total_venta: 850,
            ...overrides,
        }) as unknown as CreateFacturaDto;

        const validar = (dto: CreateFacturaDto) => (service as any).assertReceptorValido(dto);

        it('acepta la boleta cuando el adquirente está identificado', () => {
            expect(() => validar(boleta())).not.toThrow();
        });

        it('rechaza la boleta emitida a "clientes varios" (99999999)', () => {
            expect(() =>
                validar(boleta({ documento_receptor: '99999999', razon_social_receptor: 'Cliente General' })),
            ).toThrow(BadRequestException);
        });

        it('rechaza la boleta sin nombre ni razón social del adquirente', () => {
            expect(() => validar(boleta({ razon_social_receptor: '   ' }))).toThrow(BadRequestException);
        });

        it('no exige identificación por debajo del umbral', () => {
            expect(() =>
                validar(boleta({ total_venta: 700, documento_receptor: '99999999', razon_social_receptor: 'Cliente General' })),
            ).not.toThrow();
        });
    });

    describe('serie coherente con el tipo de comprobante (SUNAT)', () => {
        const validarSerie = (serie: string, tipo_documento: string) =>
            (service as any).assertSerieCoherenteConTipo({ serie, tipo_documento } as any);

        it('acepta las combinaciones válidas', () => {
            expect(() => validarSerie('F001', '01')).not.toThrow();
            expect(() => validarSerie('B001', '03')).not.toThrow();
            expect(() => validarSerie('FC01', '07')).not.toThrow();
            expect(() => validarSerie('BC01', '07')).not.toThrow();
        });

        it('rechaza una factura con serie de boleta', () => {
            expect(() => validarSerie('B001', '01')).toThrow(BadRequestException);
        });

        it('rechaza una boleta con serie de factura', () => {
            expect(() => validarSerie('F001', '03')).toThrow(BadRequestException);
        });

        it('rechaza series con largo distinto de 4', () => {
            expect(() => validarSerie('FC001', '07')).toThrow(BadRequestException);
            expect(() => validarSerie('F01', '01')).toThrow(BadRequestException);
        });
    });

    describe('fecha de emisión no futura (SUNAT)', () => {
        const validarFecha = (fecha: string) => (service as any).assertFechaEmisionNoFutura(fecha);
        const hoyEnPeru = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
        const desplazarDias = (dias: number) => {
            const base = new Date(`${hoyEnPeru}T12:00:00Z`);
            base.setUTCDate(base.getUTCDate() + dias);
            return base.toISOString().slice(0, 10);
        };

        it('acepta la fecha de hoy en Perú', () => {
            expect(() => validarFecha(hoyEnPeru)).not.toThrow();
        });

        it('acepta fechas pasadas', () => {
            expect(() => validarFecha(desplazarDias(-3))).not.toThrow();
        });

        it('rechaza una fecha futura', () => {
            expect(() => validarFecha(desplazarDias(1))).toThrow(BadRequestException);
        });
    });
});
