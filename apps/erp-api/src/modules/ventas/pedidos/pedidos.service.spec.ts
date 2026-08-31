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
    let mockEventBus: any;

    beforeEach(async () => {
        mockSupabaseClient = {
            from: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            delete: jest.fn().mockReturnThis(),
            rpc: jest.fn(),
            order: jest.fn().mockReturnThis(),
            like: jest.fn().mockReturnThis(),
            limit: jest.fn(),
            maybeSingle: jest.fn(),
        };

        mockTaxCalculator = {
            calcularImpuestos: jest.fn(),
            getTasaIgv: jest.fn().mockResolvedValue(0.18),
        };

        mockTenantContext = {
            getTenantId: jest.fn().mockReturnValue('tenant-123'),
        };
        mockEventBus = {
            emitVentaProcessed: jest.fn(),
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
                { provide: EventBusService, useValue: mockEventBus },
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
        const userId = 'user-123';
        const createDto = {
            cliente_id: 'client-1',
            detalle: [
                { producto_id: 'prod-1', cantidad: 1, precio_unitario: 100, descripcion: 'Item 1' },
            ],
        };

        it('crea el pedido pendiente por RPC con tenant y actor explícitos, sin reservar stock', async () => {
            mockSupabaseClient.single.mockResolvedValueOnce({ data: { id: 'client-1' }, error: null });
            mockTaxCalculator.calcularImpuestos.mockResolvedValue({
                subtotal: 100,
                igv: 18,
                total: 118,
            });
            mockSupabaseClient.rpc.mockResolvedValueOnce({ data: { pedido_id: 'new-pedido-id' }, error: null });
            mockSupabaseClient.single.mockResolvedValueOnce({
                data: { id: 'new-pedido-id', estado: 'PENDIENTE' },
                error: null
            });
            mockSupabaseClient.order.mockResolvedValueOnce({ data: [], error: null });

            const result = await service.create(createDto as any, tenantId, userId);

            expect(result).toBeDefined();
            expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
                'crear_pedido_comercial_pago_tx_531',
                expect.objectContaining({
                    p_pedido: expect.objectContaining({
                        tenant_id: tenantId,
                        cliente_id: 'client-1',
                        created_by: userId,
                        subtotal: 100,
                    }),
                    p_detalle: [expect.objectContaining({
                        producto_id: 'prod-1',
                        cantidad: 1,
                        subtotal: 100,
                    })],
                }),
            );
            expect(mockSupabaseClient.select).toHaveBeenCalledWith('id, afectacion_igv');
            expect(mockSupabaseClient.select).not.toHaveBeenCalledWith(expect.stringContaining('stock_actual'));
            expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('movimientos_almacen');
        });

        it('rechaza crear un pedido sin actor antes de consultar datos', async () => {
            await expect(service.create(createDto as any, tenantId))
                .rejects.toThrow('No se pudo identificar al creador del pedido');

            expect(mockSupabaseClient.from).not.toHaveBeenCalled();
            expect(mockSupabaseClient.rpc).not.toHaveBeenCalled();
        });

        it('persiste una intención de crédito validada desde el DTO del pedido', async () => {
            const dto = {
                ...createDto,
                condicion_pago: 'CREDITO',
                medio_pago: '42',
                plazo_pago_dias: 30,
                fecha_vencimiento: '2026-09-30',
            };
            mockSupabaseClient.single.mockResolvedValueOnce({ data: { id: 'client-1' }, error: null });
            mockTaxCalculator.calcularImpuestos.mockResolvedValue({
                subtotal: 100,
                igv: 18,
                total: 118,
            });
            mockSupabaseClient.rpc.mockResolvedValueOnce({
                data: { pedido_id: 'pedido-credito' },
                error: null,
            });
            jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'pedido-credito' } as any);

            await service.create(dto as any, tenantId, userId);

            expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
                'crear_pedido_comercial_pago_tx_531',
                expect.objectContaining({
                    p_payment_intent: {
                        condicion_pago: 'CREDITO',
                        medio_pago: '42',
                        plazo_pago_dias: 30,
                        fecha_vencimiento: '2026-09-30',
                    },
                }),
            );
        });

        it('mantiene precisión decimal en el payload transaccional', async () => {
            const dto = {
                cliente_id: 'client-1',
                detalle: [
                    { producto_id: 'p1', cantidad: 1, precio_unitario: 0.1, descripcion: 'A' },
                    { producto_id: 'p2', cantidad: 1, precio_unitario: 0.2, descripcion: 'B' },
                ],
            };

            mockSupabaseClient.single.mockResolvedValueOnce({ data: { id: 'client-1' }, error: null });
            mockTaxCalculator.calcularImpuestos.mockImplementation(async ({ subtotal }) => {
                return { subtotal, igv: subtotal * 0.18, total: subtotal * 1.18 };
            });
            mockSupabaseClient.rpc.mockResolvedValueOnce({ data: { pedido_id: 'pid' }, error: null });
            mockSupabaseClient.single.mockResolvedValueOnce({ data: { id: 'pid' }, error: null });
            mockSupabaseClient.order.mockResolvedValueOnce({ data: [], error: null });

            await service.create(dto as any, tenantId, userId);

            expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
                'crear_pedido_comercial_pago_tx_531',
                expect.objectContaining({
                    p_pedido: expect.objectContaining({ subtotal: 0.3 }),
                }),
            );
        });

        it('no reporta fallo si el alta hizo commit y sólo falla la hidratación', async () => {
            mockSupabaseClient.single.mockResolvedValueOnce({ data: { id: 'client-1' }, error: null });
            mockTaxCalculator.calcularImpuestos.mockResolvedValue({
                subtotal: 100,
                igv: 18,
                total: 118,
            });
            mockSupabaseClient.rpc.mockResolvedValueOnce({
                data: { pedido_id: 'pedido-commit' },
                error: null,
            });
            jest.spyOn(service, 'findOne').mockRejectedValueOnce(
                new Error('timeout de lectura post-commit'),
            );

            await expect(service.create(createDto as any, tenantId, userId)).resolves.toEqual(
                expect.objectContaining({
                    id: 'pedido-commit',
                    tenant_id: tenantId,
                    estado: 'PENDIENTE',
                    detalle: [expect.objectContaining({ producto_id: 'prod-1' })],
                }),
            );
        });
    });

    describe('confirmarPedido', () => {
        const pedidoPendiente = {
            id: 'pedido-1',
            tenant_id: 'tenant-123',
            cliente_id: 'cliente-1',
            numero: 'PV-0001',
            estado: 'PENDIENTE',
            estado_credito: 'PENDIENTE',
            detalle: [
                { producto_id: 'prod-1', descripcion: 'Producto', cantidad: 2, precio_unitario: 10, subtotal: 20 },
            ],
        };

        it('confirma con la política vigente y la reserva atómica sin reconocer ingreso', async () => {
            jest.spyOn(service, 'findOne').mockResolvedValue(pedidoPendiente as any);
            jest.spyOn(service as any, 'registrarAuditoriaAccion').mockResolvedValue(undefined);
            jest.spyOn(service as any, 'enviarNotificacion').mockResolvedValue(undefined);
            mockSupabaseClient.rpc
                .mockResolvedValueOnce({
                    data: {
                        requiere_aprobacion: true,
                        estado_credito: 'OBSERVADO',
                        motivos: ['Excede límite'],
                        usar_flujo_logistica: false,
                        pedido_fingerprint: 'fp-pedido-1',
                    },
                    error: null,
                })
                .mockResolvedValueOnce({ data: true, error: null })
                .mockResolvedValueOnce({
                    data: {
                        estado: 'LISTO_FACTURAR',
                        reserva: { skipped: false, movimientos: [{ movimiento_id: 'mov-1' }] },
                    },
                    error: null,
                });

            const result = await service.confirmarPedido('pedido-1', 'tenant-123', 'user-1');

            expect(result).toEqual(expect.objectContaining({
                success: true,
                confirmado: true,
                estado_credito: 'APROBADO',
            }));
            expect(mockSupabaseClient.rpc).toHaveBeenCalledTimes(3);
            expect(mockSupabaseClient.rpc).toHaveBeenNthCalledWith(1, 'evaluar_politica_pedido_441', {
                p_pedido_id: 'pedido-1',
                p_tenant_id: 'tenant-123',
            });
            expect(mockSupabaseClient.rpc).toHaveBeenNthCalledWith(2, 'pedido_tiene_aprobacion_vigente', {
                p_pedido_id: 'pedido-1',
                p_tenant_id: 'tenant-123',
            });
            expect(mockSupabaseClient.rpc).toHaveBeenNthCalledWith(3, 'confirmar_pedido_tx', {
                p_pedido_id: 'pedido-1',
                p_tenant_id: 'tenant-123',
                p_estado_credito: 'APROBADO',
                p_estado_destino: 'LISTO_FACTURAR',
                p_forzado: false,
                p_requiere_aprobacion: true,
                p_aprobado_por: null,
                p_motivos: 'Excede límite',
                p_expected_fingerprint: 'fp-pedido-1',
                p_actor_id: 'user-1',
            });
            expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('productos');
            expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('movimientos_almacen');
            expect(mockEventBus.emitVentaProcessed).not.toHaveBeenCalled();
        });

        it('propaga el fallo de reserva transaccional sin intentar cambios parciales en JavaScript', async () => {
            jest.spyOn(service, 'findOne').mockResolvedValue(pedidoPendiente as any);
            mockSupabaseClient.rpc
                .mockResolvedValueOnce({
                    data: {
                        requiere_aprobacion: false,
                        estado_credito: 'OK',
                        motivos: [],
                        usar_flujo_logistica: true,
                        pedido_fingerprint: 'fp-pedido-1',
                    },
                    error: null,
                })
                .mockResolvedValueOnce({
                    data: null,
                    error: { message: 'Stock insuficiente para completar reserva' },
                });

            await expect(
                service.confirmarPedido('pedido-1', 'tenant-123', 'user-1'),
            ).rejects.toThrow(BadRequestException);

            expect(mockSupabaseClient.rpc).toHaveBeenCalledTimes(2);
            expect(mockSupabaseClient.rpc).toHaveBeenLastCalledWith(
                'confirmar_pedido_tx',
                expect.objectContaining({
                    p_pedido_id: 'pedido-1',
                    p_tenant_id: 'tenant-123',
                    p_expected_fingerprint: 'fp-pedido-1',
                }),
            );
            expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('productos');
            expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('movimientos_almacen');
            expect(mockEventBus.emitVentaProcessed).not.toHaveBeenCalled();
        });

        it('devuelve un outcome 2xx consumible si el pedido ya está pendiente de aprobación', async () => {
            jest.spyOn(service, 'findOne').mockResolvedValue({
                ...pedidoPendiente,
                estado: 'PENDIENTE_APROBACION',
                estado_credito: 'REVISION',
                motivo_requiere_aprobacion: 'Excede el monto autorizado',
            } as any);

            await expect(
                service.confirmarPedido('pedido-1', 'tenant-123', 'user-1'),
            ).resolves.toEqual({
                success: true,
                confirmado: false,
                requiere_aprobacion: true,
                motivos: ['Excede el monto autorizado'],
                estado_credito: 'REVISION',
            });

            expect(mockSupabaseClient.rpc).not.toHaveBeenCalled();
        });

        it('exige un actor trazable antes de consultar o confirmar', async () => {
            await expect(
                service.confirmarPedido('pedido-1', 'tenant-123'),
            ).rejects.toThrow('confirmador');

            expect(mockSupabaseClient.rpc).not.toHaveBeenCalled();
        });

        it('responde idempotentemente si el commit se perdió después de confirmar', async () => {
            jest.spyOn(service, 'findOne').mockResolvedValue({
                ...pedidoPendiente,
                estado: 'LISTO_FACTURAR',
                estado_credito: 'OK',
                metadata: {
                    confirmation_fingerprint: 'sha256-confirmado',
                    confirmation_fingerprint_version: 2,
                },
            } as any);

            await expect(
                service.confirmarPedido('pedido-1', 'tenant-123', 'user-1'),
            ).resolves.toEqual({ success: true, confirmado: true, estado_credito: 'OK' });

            expect(mockSupabaseClient.rpc).not.toHaveBeenCalled();
        });

        it('deriva una excepción comercial a aprobación como outcome exitoso sin confirmar', async () => {
            jest.spyOn(service, 'findOne').mockResolvedValue(pedidoPendiente as any);
            const solicitarAprobacion = jest
                .spyOn(service as any, 'registrarSolicitudAprobacion')
                .mockResolvedValue(undefined);
            jest.spyOn(service as any, 'enviarNotificacion').mockResolvedValue(undefined);
            mockSupabaseClient.rpc
                .mockResolvedValueOnce({
                    data: {
                        requiere_aprobacion: true,
                        estado_credito: 'REVISION',
                        motivos: ['Excede el monto autorizado'],
                        usar_flujo_logistica: true,
                        pedido_fingerprint: 'fp-aprobacion',
                    },
                    error: null,
                })
                .mockResolvedValueOnce({ data: false, error: null });

            await expect(
                service.confirmarPedido('pedido-1', 'tenant-123', 'user-1'),
            ).resolves.toEqual({
                success: true,
                confirmado: false,
                requiere_aprobacion: true,
                motivos: ['Excede el monto autorizado'],
                estado_credito: 'REVISION',
            });

            expect(solicitarAprobacion).toHaveBeenCalledWith(
                pedidoPendiente,
                'tenant-123',
                ['Excede el monto autorizado'],
                'REVISION',
            );
            expect(mockSupabaseClient.rpc).not.toHaveBeenCalledWith(
                'confirmar_pedido_tx',
                expect.anything(),
            );
        });

        it('bloquea por crédito sin crear una solicitud de aprobación comercial', async () => {
            jest.spyOn(service, 'findOne').mockResolvedValue(pedidoPendiente as any);
            const solicitarAprobacion = jest
                .spyOn(service as any, 'registrarSolicitudAprobacion')
                .mockResolvedValue(undefined);
            jest.spyOn(service as any, 'enviarNotificacion').mockResolvedValue(undefined);
            mockSupabaseClient.rpc.mockResolvedValueOnce({
                data: {
                    requiere_aprobacion: true,
                    estado_credito: 'BLOQUEADO',
                    motivos: ['Cliente con documentos vencidos'],
                    usar_flujo_logistica: true,
                    pedido_fingerprint: 'fp-bloqueado',
                },
                error: null,
            });

            await expect(
                service.confirmarPedido('pedido-1', 'tenant-123', 'user-1'),
            ).rejects.toThrow('Crédito bloqueado');

            expect(solicitarAprobacion).not.toHaveBeenCalled();
            expect(mockSupabaseClient.rpc).not.toHaveBeenCalledWith(
                'solicitar_aprobacion_pedido_tx',
                expect.anything(),
            );
        });

    });

    describe('update', () => {
        it('no reporta fallo si el update hizo commit y sólo falla la hidratación', async () => {
            mockSupabaseClient.rpc.mockResolvedValueOnce({
                data: {
                    id: 'pedido-1',
                    tenant_id: 'tenant-123',
                    estado: 'PENDIENTE',
                    observaciones: 'Nota confirmada',
                },
                error: null,
            });
            jest.spyOn(service, 'findOne').mockRejectedValueOnce(
                new Error('timeout de lectura post-commit'),
            );

            await expect(
                service.update('pedido-1', { notas: 'Nota confirmada' }, 'tenant-123'),
            ).resolves.toEqual(expect.objectContaining({
                id: 'pedido-1',
                tenant_id: 'tenant-123',
                observaciones: 'Nota confirmada',
                detalle: [],
            }));
        });
    });

    describe('Aislamiento multi-tenant y límite de inventario', () => {
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

            await expect(service.create(createDto as any, tenantA, 'actor-a')).rejects.toThrow(NotFoundException);

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
                .mockResolvedValueOnce({ data: { id: 'new-pedido-id', estado: 'PENDIENTE' }, error: null });

            mockTaxCalculator.calcularImpuestos.mockResolvedValue({
                subtotal: 100,
                igv: 18,
                total: 118,
            });

            mockSupabaseClient.rpc.mockResolvedValueOnce({ data: { pedido_id: 'new-pedido-id' }, error: null });

            mockSupabaseClient.order.mockResolvedValueOnce({ data: [], error: null });

            await service.create(createDto as any, tenantA, 'actor-a');

            const [functionName, rpcPayload] = mockSupabaseClient.rpc.mock.calls[0];
            expect(functionName).toBe('crear_pedido_comercial_pago_tx_531');
            expect(rpcPayload).toEqual(
                expect.objectContaining({
                    p_pedido: expect.objectContaining({
                        tenant_id: tenantA,
                        cliente_id: 'client-1',
                        created_by: 'actor-a',
                    }),
                }),
            );
            expect(rpcPayload.p_pedido.tenant_id).not.toBe('tenant-b');
        });

        it('delega a confirmar_pedido_tx la clasificación de servicios y productos sin stock', async () => {
            jest.spyOn(service, 'findOne').mockResolvedValue({
                id: 'pedido-servicios',
                tenant_id: 'tenant-a',
                numero: 'PV-0002',
                estado: 'PENDIENTE',
                detalle: [
                    { producto_id: 'servicio-1', cantidad: 1, es_servicio: true },
                    { producto_id: 'no-stock-1', cantidad: 1, controla_stock: false },
                ],
            } as any);
            jest.spyOn(service as any, 'registrarAuditoriaAccion').mockResolvedValue(undefined);
            jest.spyOn(service as any, 'enviarNotificacion').mockResolvedValue(undefined);
            mockSupabaseClient.rpc
                .mockResolvedValueOnce({
                    data: {
                        requiere_aprobacion: false,
                        estado_credito: 'OK',
                        motivos: [],
                        usar_flujo_logistica: false,
                        pedido_fingerprint: 'fp-servicios',
                    },
                    error: null,
                })
                .mockResolvedValueOnce({
                    data: { estado: 'LISTO_FACTURAR', reserva: { skipped: true, movimientos: [] } },
                    error: null,
                });

            await expect(
                service.confirmarPedido('pedido-servicios', 'tenant-a', 'actor-a'),
            ).resolves.toEqual({ success: true, confirmado: true, estado_credito: 'OK' });

            expect(mockSupabaseClient.rpc).toHaveBeenLastCalledWith(
                'confirmar_pedido_tx',
                expect.objectContaining({
                    p_pedido_id: 'pedido-servicios',
                    p_tenant_id: 'tenant-a',
                    p_expected_fingerprint: 'fp-servicios',
                }),
            );
            expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('productos');
            expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('movimientos_almacen');
            expect(mockEventBus.emitVentaProcessed).not.toHaveBeenCalled();
        });
    });
});
