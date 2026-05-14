import { Test, TestingModule } from '@nestjs/testing';
import { PedidosService } from './pedidos.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditService } from '../../audit/audit.service';
import { CPEIntegrationService } from './cpe-integration.service';
import { GREIntegrationService } from './gre-integration.service';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';
import { DocumentosService } from '../../documentos.service';
import { Decimal } from 'decimal.js';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('PedidosService', () => {
    let service: PedidosService;
    let supabaseService: SupabaseService;
    let taxCalculatorService: TaxCalculatorService;
    let mockSupabaseClient: any;
    let mockTaxCalculator: any;
    let mockTenantContext: any;

    beforeEach(async () => {
        mockSupabaseClient = {
            from: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            delete: jest.fn().mockReturnThis(),
            rpc: jest.fn(),
            order: jest.fn().mockReturnThis(),
            like: jest.fn().mockReturnThis(),
            limit: jest.fn(),
        };

        mockTaxCalculator = {
            calcularImpuestos: jest.fn(),
        };

        mockTenantContext = {
            getTenantId: jest.fn().mockReturnValue('tenant-123'),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PedidosService,
                {
                    provide: SupabaseService,
                    useValue: {
                        getClient: jest.fn().mockReturnValue(mockSupabaseClient),
                    },
                },
                { provide: NotificationsService, useValue: {} },
                { provide: AuditService, useValue: {} },
                { provide: CPEIntegrationService, useValue: {} },
                { provide: GREIntegrationService, useValue: {} },
                { provide: EventBusService, useValue: {} },
                { provide: DocumentosService, useValue: {} },
                {
                    provide: TaxCalculatorService,
                    useValue: mockTaxCalculator,
                },
                {
                    provide: TenantContextService,
                    useValue: mockTenantContext,
                },
            ],
        }).compile();

        service = module.get<PedidosService>(PedidosService);
        supabaseService = module.get<SupabaseService>(SupabaseService);
        taxCalculatorService = module.get<TaxCalculatorService>(TaxCalculatorService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('create', () => {
        const tenantId = 'tenant-123';
        const createDto = {
            cliente_id: 'client-1',
            detalle: [
                { producto_id: 'prod-1', cantidad: 1, precio_unitario: 100, descripcion: 'Item 1' },
            ],
        };

        it('should create a pedido successfully using atomic RPC', async () => {
            // 1. Mock Cliente exists
            mockSupabaseClient.single.mockResolvedValueOnce({ data: { id: 'client-1' }, error: null });

            // 2. Mock Stock Check
            mockSupabaseClient.single.mockResolvedValueOnce({
                data: { stock_actual: 20, stock_reservado: 10 },
                error: null
            });

            // 3. Mock Tax Calc
            mockTaxCalculator.calcularImpuestos.mockResolvedValue({
                subtotal: 100,
                igv: 18,
                total: 118,
            });

            // 4. Mock generarNumero (limit returns { data, error })
            mockSupabaseClient.limit.mockResolvedValueOnce({ data: [], error: null }); // No previous orders

            // 5. Mock RPC creation
            mockSupabaseClient.rpc.mockResolvedValueOnce({ data: { pedido_id: 'new-pedido-id' }, error: null });

            // 6. Mock findOne for return (Header)
            mockSupabaseClient.single.mockResolvedValueOnce({
                data: { id: 'new-pedido-id', estado: 'PENDIENTE' },
                error: null
            });

            // 7. Mock findOne details (order returns { data, error })
            mockSupabaseClient.order
                .mockReturnValueOnce(mockSupabaseClient) // Call #1 (generarNumero)
                .mockResolvedValueOnce({ data: [], error: null }); // Call #2 (findOne details)

            const result = await service.create(createDto as any, tenantId);

            expect(result).toBeDefined();
            expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('crear_pedido_completo', expect.any(Object));

            // Verify Decimal precision in tax calc
            expect(mockTaxCalculator.calcularImpuestos).toHaveBeenCalledWith(expect.objectContaining({
                subtotal: 100,
            }));
        });

        it('should throw BadRequestException if stock is insufficient', async () => {
            // Mock Cliente exists
            mockSupabaseClient.single.mockResolvedValueOnce({ data: { id: 'client-1' }, error: null });

            // Mock Stock Check -> 0 available (stock 10, reserved 10)
            mockSupabaseClient.single.mockResolvedValueOnce({
                data: { stock_actual: 10, stock_reservado: 10 },
                error: null
            });

            await expect(service.create(createDto as any, tenantId))
                .rejects.toThrow(BadRequestException);
        });

        it('should handle floating point precision correctly', async () => {
            // 0.1 + 0.2 case
            const dto = {
                cliente_id: 'client-1',
                detalle: [
                    { producto_id: 'p1', cantidad: 1, precio_unitario: 0.1, descripcion: 'A' },
                    { producto_id: 'p2', cantidad: 1, precio_unitario: 0.2, descripcion: 'B' },
                ],
            };

            // 1. Mock Cliente
            mockSupabaseClient.single.mockResolvedValueOnce({ data: { id: 'client-1' }, error: null });

            // 2. Mock Stock (plenty) for 2 items
            mockSupabaseClient.single
                .mockResolvedValueOnce({ data: { stock_actual: 100, stock_reservado: 0 }, error: null })
                .mockResolvedValueOnce({ data: { stock_actual: 100, stock_reservado: 0 }, error: null });

            // 3. Mock Tax Calc
            mockTaxCalculator.calcularImpuestos.mockImplementation(async ({ subtotal }) => {
                return { subtotal, igv: subtotal * 0.18, total: subtotal * 1.18 };
            });

            // 4. Mock generarNumero
            mockSupabaseClient.limit.mockResolvedValueOnce({ data: [], error: null });

            // 5. Mock RPC creation
            mockSupabaseClient.rpc.mockResolvedValueOnce({ data: { pedido_id: 'pid' }, error: null });

            // 6. Mock findOne
            mockSupabaseClient.single.mockResolvedValueOnce({ data: { id: 'pid' }, error: null });

            // 7. Mock findOne details
            mockSupabaseClient.order
                .mockReturnValueOnce(mockSupabaseClient)
                .mockResolvedValueOnce({ data: [], error: null });

            await service.create(dto as any, tenantId);

            // Verify that subtotal passed to tax calc is exactly 0.3, not 0.30000000000000004
            expect(mockTaxCalculator.calcularImpuestos).toHaveBeenCalledWith(expect.objectContaining({
                subtotal: 0.3,
            }));
        });
    });

    describe('numeración de documentos de venta', () => {
        it('no reutiliza correlativos si el RPC quedó por detrás de documentos ya emitidos', async () => {
            const query = {
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockResolvedValue({
                    data: [{ tipo_documento: '03', numero: '00000004' }],
                    error: null,
                }),
            };
            const client = {
                rpc: jest.fn().mockResolvedValue({ data: '00000001', error: null }),
                from: jest.fn().mockReturnValue(query),
            };

            const result = await (service as any).obtenerSiguienteNumeroDocumentoSeguro(
                client,
                'tenant-123',
                'BOLETA',
                'B001',
            );

            expect(result).toBe('00000005');
            expect(client.rpc).toHaveBeenCalledWith('obtener_siguiente_numero_documento', {
                p_tenant_id: 'tenant-123',
                p_tipo_documento: 'BOLETA',
                p_serie: 'B001',
            });
            expect(query.eq).toHaveBeenCalledWith('serie', 'B001');
        });
    });

    describe('Aislamiento multi-tenant (P2.2)', () => {
        it('debe validar cliente solo dentro del tenant del contexto', async () => {
            const tenantA = 'tenant-a';
            const createDto = {
                cliente_id: 'cliente-tenant-a',
                detalle: [
                    {
                        producto_id: 'prod-1',
                        cantidad: 1,
                        precio_unitario: 100,
                        descripcion: 'Item cross-tenant',
                    },
                ],
            };

            mockSupabaseClient.single.mockResolvedValue({
                data: null,
                error: { message: 'No encontrado' },
            });

            await expect(service.create(createDto as any, tenantA)).rejects.toThrow(NotFoundException);

            expect(mockSupabaseClient.from).toHaveBeenCalledWith('clientes');
            expect(mockSupabaseClient.eq).toHaveBeenCalledWith('tenant_id', tenantA);
            expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'cliente-tenant-a');
            expect(mockSupabaseClient.eq).not.toHaveBeenCalledWith('tenant_id', 'tenant-b');
        });

        it('debe usar tenant_id del contexto al construir el pedido', async () => {
            const tenantA = 'tenant-a';
            const createDto = {
                cliente_id: 'client-1',
                detalle: [
                    { producto_id: 'prod-1', cantidad: 1, precio_unitario: 100, descripcion: 'Item 1' },
                ],
            };

            mockSupabaseClient.single
                .mockResolvedValueOnce({ data: { id: 'client-1' }, error: null })
                .mockResolvedValueOnce({ data: { stock_actual: 20, stock_reservado: 10 }, error: null })
                .mockResolvedValueOnce({ data: { id: 'new-pedido-id', estado: 'PENDIENTE' }, error: null });

            mockTaxCalculator.calcularImpuestos.mockResolvedValue({
                subtotal: 100,
                igv: 18,
                total: 118,
            });

            mockSupabaseClient.limit.mockResolvedValueOnce({ data: [], error: null });
            mockSupabaseClient.rpc.mockResolvedValueOnce({ data: { pedido_id: 'new-pedido-id' }, error: null });

            mockSupabaseClient.order
                .mockReturnValueOnce(mockSupabaseClient)
                .mockResolvedValueOnce({ data: [], error: null });

            await service.create(createDto as any, tenantA);

            const [functionName, rpcPayload] = mockSupabaseClient.rpc.mock.calls[0];
            expect(functionName).toBe('crear_pedido_completo');
            expect(rpcPayload).toEqual(
                expect.objectContaining({
                    p_pedido: expect.objectContaining({
                        tenant_id: tenantA,
                        cliente_id: 'client-1',
                    }),
                }),
            );
            expect(rpcPayload.p_pedido.tenant_id).not.toBe('tenant-b');
        });

        it('getStockDisponible debe filtrar stock por tenant', async () => {
            mockSupabaseClient.single.mockResolvedValueOnce({
                data: { stock_actual: 10, stock_reservado: 3 },
                error: null,
            });

            const disponible = await (service as any).getStockDisponible('prod-1', 'tenant-a');

            expect(disponible).toBe(7);
            expect(mockSupabaseClient.from).toHaveBeenCalledWith('productos');
            expect(mockSupabaseClient.eq).toHaveBeenCalledWith('tenant_id', 'tenant-a');
            expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'prod-1');
        });
    });
});
