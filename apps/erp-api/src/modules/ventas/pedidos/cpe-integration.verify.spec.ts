
import { Test, TestingModule } from '@nestjs/testing';
import { CPEIntegrationService } from './cpe-integration.service';
import { CpeService } from '../../cpe/cpe.service';
import { FiscalAdapterService } from '../../cpe/fiscal-adapter.service';
import { SunatFiscalService } from '../../fiscal/sunat-fiscal.service';
import { DianFiscalService } from '../../fiscal/dian-fiscal.service';
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
import { PedidoVenta, PedidoDetalle } from './entities';

describe('CPE Integration Verification', () => {
    let cpeIntegrationService: CPEIntegrationService;
    let cpeService: CpeService;
    let supabaseService: SupabaseService;

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
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CPEIntegrationService,
                CpeService,
                FiscalAdapterService,
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
                    provide: SupabaseService,
                    useValue: {
                        getClient: jest.fn().mockReturnValue(mockSupabaseClient),
                        update: jest.fn().mockResolvedValue({ data: {}, error: null }),
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
            ],
        }).compile();

        cpeIntegrationService = module.get<CPEIntegrationService>(CPEIntegrationService);
        cpeService = module.get<CpeService>(CpeService);
        supabaseService = module.get<SupabaseService>(SupabaseService);
    });

    it('should successfully generate a CPE and simulate SUNAT acceptance', async () => {
        const tenantId = 'tenant-123';
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
                serie_factura: 'F001',
                ultimo_numero_factura: 100,
                pais_id: 1, // Perú
            },
            error: null,
        });

        // 3. Update correlativo (update)
        mockSupabaseClient.update.mockReturnThis();
        mockSupabaseClient.eq.mockReturnThis();

        // 4. CpeService: getXmlSigner -> empresa_config (certificado)
        mockSupabaseClient.single.mockResolvedValueOnce({
            data: { certificado_pfx: null }, // Use demo certificate
            error: null,
        });

        // 5. CpeService: check idempotency
        mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

        // 6. CpeService: insert CPE
        const mockCreatedCpe = {
            id: 'cpe-123',
            serie: 'F001',
            numero: 101,
            estado: 'FIRMADO',
            xml_firmado: '<xml>signed</xml>',
            hash: 'hash-123',
            tenant_id: tenantId,
        };
        mockSupabaseClient.insert.mockReturnThis();
        mockSupabaseClient.select.mockReturnThis();
        mockSupabaseClient.single.mockResolvedValueOnce({
            data: mockCreatedCpe,
            error: null,
        });

        // 7. CpeService: ensureDocumentoParaCpe -> rpc
        mockSupabaseClient.rpc.mockResolvedValueOnce({ data: 'doc-123', error: null });

        // 8. CpeService: update CPE with document_id
        mockSupabaseClient.update.mockReturnThis();

        // 9. CpeService: getXmlSigner (again for prepareXmlForSunat)
        mockSupabaseClient.single.mockResolvedValueOnce({
            data: { certificado_pfx: null },
            error: null,
        });

        // 10. CpeService: update CPE (FIRMADO)
        mockSupabaseClient.update.mockReturnThis();

        // 11. FiscalAdapter: obtenerPaisTenant
        mockSupabaseClient.single.mockResolvedValueOnce({ data: { pais_id: 1 }, error: null });

        // 12. FiscalAdapter: obtenerPaisTenant (again inside sendToOse if needed, or cached)
        // Note: sendToOse does a select first
        mockSupabaseClient.single.mockResolvedValueOnce({
            data: { ...mockCreatedCpe, tenant_id: tenantId, ruc_emisor: '20987654321', tipo_documento: '01' },
            error: null
        });

        // 13. FiscalAdapter: obtenerPaisTenant (inside sendToOse -> obtenerNombreServicioFiscal)
        // It might be cached, but let's mock just in case
        // mockSupabaseClient.single.mockResolvedValueOnce({ data: { pais_id: 1 }, error: null });

        // 14. CpeService: update CPE (ENVIADO)
        mockSupabaseClient.update.mockReturnThis();

        // 15. CpeService: update CPE (ACEPTADO)
        mockSupabaseClient.update.mockReturnThis();

        // Execute
        const result = await cpeIntegrationService.generarFacturaDesdePedido(pedido, tenantId);

        // Assertions for Creation
        expect(result).toBeDefined();
        expect(result.estado).toBe('FIRMADO');

        console.log('Result State (Creation):', result.estado);

        // Now verify the manual send flow
        // Mock for sendToOseManual -> sendToOse -> supabase.select(cpe)
        mockSupabaseClient.single.mockResolvedValueOnce({
            data: {
                ...mockCreatedCpe,
                tenant_id: tenantId,
                ruc_emisor: '20987654321',
                tipo_documento: '01',
                xml_firmado: '<xml>signed</xml>'
            },
            error: null
        });

        // Mock for sendToOse -> update(ENVIADO)
        mockSupabaseClient.update.mockReturnThis();

        // Mock for sendToOse -> update(ACEPTADO)
        mockSupabaseClient.update.mockReturnThis();

        await cpeService.sendToOseManual('cpe-123', '<xml>signed</xml>', 'fileName');

        // If no error thrown, it means success (since sendToOseManual returns void but logs success)
        console.log('Manual Send Executed Successfully');
    });
});
