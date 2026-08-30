
import { Test, TestingModule } from '@nestjs/testing';
import { CPEIntegrationService } from './cpe-integration.service';
import { CpeService } from '../../cpe/cpe.service';
import { SucursalesService } from '../../cpe/../sucursales/sucursales.service';
import { FiscalAdapterService } from '../../cpe/fiscal-adapter.service';
import { SunatFiscalService } from '../../fiscal/sunat-fiscal.service';
import { DianFiscalService } from '../../fiscal/dian-fiscal.service';
import { ArcaFiscalService } from '../../fiscal/arca-fiscal.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { ConfigService } from '@nestjs/config';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { ValidationService } from '../../validations/validation.service';
import { IntegrationAlertsService } from '../../notifications/integration-alerts.service';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';
import { AuditService } from '../../audit/audit.service';
import { CacheInvalidationService } from '../../../shared/cache/cache-invalidation.service';
import { PdfGeneratorService } from '../../cpe/pdf-generator.service';
import { OseService } from '../../ose/ose.service';
import { FiscalServiceFactory } from '../../fiscal/fiscal-service.factory';
import { OseApiFiscalService } from '../../fiscal/ose-api-fiscal.service';
import { PedidoVenta, PedidoDetalle } from './entities';

describe('CPE Integration Verification', () => {
    let cpeIntegrationService: CPEIntegrationService;
    let cpeService: CpeService;
    let supabaseService: SupabaseService;
    let mockSupabaseUpdate: jest.Mock;
    let mockFiscalAdapter: {
        obtenerNombreServicioFiscal: jest.Mock;
        obtenerCodigoPais: jest.Mock;
        obtenerConfiguracionFiscal: jest.Mock;
        enviarDocumento: jest.Mock;
    };

    const mockSupabaseClient = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockReturnThis(),
        rpc: jest.fn().mockReturnThis(),
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        mockSupabaseUpdate = jest.fn().mockResolvedValue({ data: {}, error: null });
        mockFiscalAdapter = {
            obtenerNombreServicioFiscal: jest.fn().mockResolvedValue('SUNAT'),
            obtenerCodigoPais: jest.fn().mockResolvedValue('PE'),
            obtenerConfiguracionFiscal: jest.fn().mockResolvedValue({ tasaImpuesto: 0.18 }),
            enviarDocumento: jest.fn().mockResolvedValue({
                success: true,
                codigoRespuesta: '0',
                descripcionRespuesta: 'Aceptado',
                cdr: 'CDR_TEST',
                hash: 'hash-sunat-test',
                numeroComprobante: 'F001-101',
            }),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CPEIntegrationService,
                CpeService,
                {
                    provide: SucursalesService,
                    useValue: { codigoEstablecimientoDeSerie: jest.fn().mockResolvedValue('0000') },
                },
                {
                    provide: FiscalAdapterService,
                    useValue: mockFiscalAdapter,
                },
                SunatFiscalService,
                FiscalServiceFactory,
                {
                    provide: DianFiscalService,
                    useValue: {
                        enviarDocumento: jest.fn(),
                        consultarEstado: jest.fn(),
                        validarDocumento: jest.fn(),
                    },
                },
                {
                    provide: ArcaFiscalService,
                    useValue: {
                        enviarDocumento: jest.fn(),
                        consultarEstado: jest.fn(),
                        validarDocumento: jest.fn(),
                    },
                },
                {
                    provide: SupabaseService,
                    useValue: {
                        getClient: jest.fn().mockReturnValue(mockSupabaseClient),
                        getPublicClient: jest.fn().mockReturnValue({
                            from: jest.fn().mockReturnValue({
                                select: jest.fn().mockReturnThis(),
                                eq: jest.fn().mockReturnThis(),
                                maybeSingle: jest.fn().mockResolvedValue({
                                    data: { is_demo: false },
                                    error: null,
                                }),
                            }),
                        }),
                        update: mockSupabaseUpdate,
                    },
                },
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn((key) => {
                            if (key === 'SUNAT_ENVIRONMENT') return 'homologacion';
                            return 'mock-value';
                        }),
                    },
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
                    provide: ValidationService,
                    useValue: {
                        validateCertificate: jest.fn().mockResolvedValue({ isValid: true, warnings: [] }),
                        validateRucConfiguration: jest.fn().mockResolvedValue({ isValid: true }),
                        validateDocumentBeforeEmission: jest.fn().mockResolvedValue({ isValid: true, warnings: [] }),
                    },
                },
                {
                    provide: IntegrationAlertsService,
                    useValue: {
                        recordSuccess: jest.fn(),
                        recordError: jest.fn(),
                    },
                },
                {
                    provide: TaxCalculatorService,
                    useValue: {
                        getTasaIgv: jest.fn().mockResolvedValue(0.18),
                    },
                },
                {
                    provide: AuditService,
                    useValue: {
                        registrarCambio: jest.fn(),
                    },
                },
                {
                    provide: CacheInvalidationService,
                    useValue: {
                        onCpeCreated: jest.fn(),
                    },
                },
                {
                    provide: PdfGeneratorService,
                    useValue: {
                        generateSunatCompliantPdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
                    },
                },
                {
                    provide: OseService,
                    useValue: {},
                },
                {
                    provide: OseApiFiscalService,
                    useValue: {
                        enviarDocumento: jest.fn(),
                        consultarEstado: jest.fn(),
                    },
                },
            ],
        }).compile();

        cpeIntegrationService = module.get<CPEIntegrationService>(CPEIntegrationService);
        cpeService = module.get<CpeService>(CpeService);
        supabaseService = module.get<SupabaseService>(SupabaseService);
    });

    it('should successfully generate a CPE and simulate SUNAT acceptance', async () => {
        const tenantId = 'tenant-123';
        jest.spyOn(cpeService as any, 'getXmlSigner').mockResolvedValue({
            signXml: jest.fn().mockReturnValue('<xml>signed</xml>'),
            generateHash: jest.fn().mockReturnValue('hash-123'),
            validateSignature: jest.fn().mockReturnValue(true),
            validateSignatureStrict: jest.fn().mockReturnValue(true),
        });
        const pedido: PedidoVenta & { detalle: PedidoDetalle[] } = {
            id: 'pedido-123',
            tenant_id: tenantId,
            cliente_id: 'cliente-123',
            subtotal: 100,
            igv: 18,
            total: 118,
            moneda: 'PEN',
            estado: 'APROBADO',
            fecha_emision: new Date().toISOString(),
            detalle: [
                {
                    id: 'det-1',
                    pedido_id: 'pedido-123',
                    producto_id: 'prod-1',
                    cantidad: 1,
                    precio_unitario: 100,
                    subtotal: 100,
                    descripcion: 'Producto Test',
                    tenant_id: tenantId,
                },
            ],
        } as any;

        // Mock DB responses
        // 1. Cliente
        mockSupabaseClient.single.mockResolvedValueOnce({
            data: {
                id: 'cliente-123',
                documento_tipo: 'RUC',
                numero_documento: '20123456789',
                razon_social: 'Cliente Test SAC',
                direccion: 'Av. Test 123',
            },
            error: null,
        });

        // 2. Empresa Config
        mockSupabaseClient.single.mockResolvedValueOnce({
            data: {
                ruc: '20987654321',
                razon_social: 'Mi Empresa SAC',
                moneda_defecto: 'PEN',
                serie_factura: 'F001',
                ultimo_numero_factura: 100,
                pais_id: 1, // Perú
            },
            error: null,
        });

        // 3. ObtenerSerieYNumero -> empresa_config
        mockSupabaseClient.single.mockResolvedValueOnce({
            data: {
                serie_factura: 'F001',
                ultimo_numero_factura: 100,
            },
            error: null,
        });

        // 4. Reserva atómica del correlativo fiscal vía RPC
        mockSupabaseClient.rpc.mockResolvedValueOnce({ data: 101, error: null });

        // 5. CpeService: getXmlSigner -> empresa_config (certificado)
        mockSupabaseClient.single.mockResolvedValueOnce({
            data: { certificado_pfx: null }, // Use demo certificate
            error: null,
        });

        // 6. CpeService: resultado de la emisión atómica
        const mockCreatedCpe = {
            id: 'cpe-123',
            tipo_documento: '01',
            serie: 'F001',
            numero: 101,
            ruc_emisor: '20987654321',
            razon_social_emisor: 'Mi Empresa SAC',
            tipo_documento_receptor: '6',
            documento_receptor: '20123456789',
            razon_social_receptor: 'Cliente Test SAC',
            direccion_receptor: 'Av. Test 123',
            moneda: 'PEN',
            total_gravadas: 100,
            total_igv: 18,
            total_venta: 118,
            items: [{
                descripcion: 'Producto de integración pedido-CPE',
                cantidad: 1,
                unidad_medida: 'NIU',
                precio_unitario: 100,
                valor_venta: 100,
                igv: 18,
                tasa_igv: 18,
                total: 118,
            }],
            estado: 'FIRMADO',
            xml_firmado: '<xml>signed</xml>',
            hash: 'hash-123',
            tenant_id: tenantId,
        };
        mockSupabaseClient.rpc.mockResolvedValueOnce({
            data: {
                cpe: { ...mockCreatedCpe, documento_id: 'doc-123', sunat_status: 'READY' },
                cpe_id: 'cpe-123',
                documento_id: 'doc-123',
                cxc_id: 'cxc-123',
                pedido_id: pedido.id,
                pedido_estado: 'FACTURADO',
            },
            error: null,
        });
        mockSupabaseClient.insert.mockReturnThis();
        mockSupabaseClient.select.mockReturnThis();
        mockSupabaseClient.single.mockResolvedValueOnce({
            data: mockCreatedCpe,
            error: null,
        });

        // 8. CpeService: política financiera del cliente para la CxC atómica
        mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
            data: {
                id: 'cliente-123',
                sujeto_retencion: false,
                sujeto_percepcion: false,
                sujeto_detraccion: false,
            },
            error: null,
        });

        // 9. CpeService: configuración financiera para la CxC atómica
        mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
            data: {},
            error: null,
        });

        // 10. CpeService: ensureDocumentoParaCpe -> insert documento operativo
        mockSupabaseClient.single.mockResolvedValueOnce({
            data: { id: 'doc-123' },
            error: null,
        });

        // 11. CpeService: update CPE with document_id
        mockSupabaseClient.update.mockReturnThis();

        // 12. CpeService: getXmlSigner (again for prepareXmlForSunat)
        mockSupabaseClient.single.mockResolvedValueOnce({
            data: { certificado_pfx: null },
            error: null,
        });

        // 13. CpeService: update CPE (FIRMADO)
        mockSupabaseClient.update.mockReturnThis();

        // 14. CpeService: refresh CPE persisted after events
        mockSupabaseClient.single.mockResolvedValueOnce({
            data: { ...mockCreatedCpe, documento_id: 'doc-123' },
            error: null,
        });

        // 15. CpeService: update CPE (ENVIADO)
        mockSupabaseClient.update.mockReturnThis();

        // 16. CpeService: update CPE (ACEPTADO)
        mockSupabaseClient.update.mockReturnThis();

        // Execute
        const result = await cpeIntegrationService.generarFacturaDesdePedido(
          pedido,
          tenantId,
          `ventas.cpe.factura:${tenantId}:${pedido.id}`,
          '11111111-1111-4111-8111-111111111111',
        );

        // Assertions for Creation
        expect(result).toBeDefined();
        expect(result.estado).toBe('FIRMADO');
        expect(result.documento_id).toBe('doc-123');

        console.log('Result State (Creation):', result.estado);

        // Now verify the manual send flow
        mockSupabaseClient.single.mockReset();
        mockSupabaseClient.maybeSingle.mockReset();
        mockSupabaseClient.rpc.mockReset();
        const reservedCpe = {
                ...mockCreatedCpe,
                tenant_id: tenantId,
                simulated_origin: false,
                ruc_emisor: '20987654321',
                tipo_documento: '01',
                xml_firmado: '<xml>signed</xml>'
        };
        mockSupabaseClient.rpc
            .mockResolvedValueOnce({
                data: {
                    claimed: true,
                    idempotent: false,
                    cpe: reservedCpe,
                    operation: { id: 'operation-476', claim_token: 'claim-476' },
                },
                error: null,
            })
            .mockResolvedValueOnce({
                data: {
                    claimed: true,
                    idempotent: false,
                    cpe: { ...reservedCpe, estado: 'ACEPTADO', sunat_status: 'ACCEPTED' },
                    operation: { id: 'operation-476', result_kind: 'ACCEPTED', response_code: '0' },
                },
                error: null,
            });
        mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
            data: {
                ruc: '20987654321',
                razon_social: 'Mi Empresa SAC',
                moneda_defecto: 'PEN',
                direccion_fiscal: 'Av. Empresa 456',
            },
            error: null,
        });

        jest.spyOn((cpeService as any).cancellationService, 'finalizarAnulacionAceptada')
            .mockResolvedValue(null);

        await cpeService.sendToOseManual('cpe-123', '<xml>signed</xml>', 'fileName', {
          idempotencyKey: 'test-idempotency',
          actorId: 'actor-1',
          origin: 'USER',
        }, tenantId);

        expect(mockFiscalAdapter.enviarDocumento).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'cpe-123',
            tipoDocumento: '01',
            serie: 'F001',
            numero: '101',
            xmlContent: '<xml>signed</xml>',
          }),
          tenantId,
          'PE',
        );
        expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
          'finalizar_envio_cpe_tx',
          expect.objectContaining({
            p_tenant_id: tenantId,
            p_operation_id: 'operation-476',
            p_claim_token: 'claim-476',
            p_result_kind: 'ACCEPTED',
            p_cdr: 'CDR_TEST',
          }),
        );
    });

});
