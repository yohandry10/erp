import { Test, TestingModule } from '@nestjs/testing';
import { InventarioService, TipoMovimiento } from './inventario.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { AuditService } from '../audit/audit.service';
import { EventBusService } from '../../shared/events/event-bus.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('InventarioService', () => {
    let service: InventarioService;
    let supabaseService: jest.Mocked<SupabaseService>;
    let auditService: jest.Mocked<AuditService>;
    let eventBusService: jest.Mocked<EventBusService>;
    let mockSupabaseClient: any;
    let testingModule: TestingModule;

    beforeEach(async () => {
        // Mock Supabase Client Chain
        mockSupabaseClient = {
            from: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn(),
            insert: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            rpc: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                InventarioService,
                {
                    provide: SupabaseService,
                    useValue: {
                        getClient: jest.fn(() => mockSupabaseClient),
                    },
                },
                {
                    provide: AuditService,
                    useValue: {
                        registrarCambio: jest.fn(),
                    },
                },
                {
                    provide: EventBusService,
                    useValue: {
                        emitMovimientoStock: jest.fn(),
                    },
                },
            ],
        }).compile();

        testingModule = module;
        service = module.get<InventarioService>(InventarioService);
        supabaseService = module.get(SupabaseService);
        auditService = module.get(AuditService);
        eventBusService = module.get(EventBusService);
    });

    afterEach(async () => {
        await testingModule.close();
        jest.clearAllMocks();
    });

    describe('getStockDisponible', () => {
        it('debe calcular el stock disponible correctamente', async () => {
            const mockProducto = {
                id: 'prod-1',
                stock_actual: '100',
                stock_reservado: '20',
            };

            mockSupabaseClient.single.mockResolvedValue({ data: mockProducto, error: null });

            const stock = await service.getStockDisponible('prod-1', 'tenant-1');
            expect(stock).toBe(80); // 100 - 20
        });

        it('debe lanzar NotFoundException si el producto no existe', async () => {
            mockSupabaseClient.single.mockResolvedValue({ data: null, error: { message: 'Not found' } });

            await expect(service.getStockDisponible('prod-999', 'tenant-1')).rejects.toThrow(NotFoundException);
        });
    });

    describe('verificarDisponibilidad', () => {
        it('debe retornar disponible: true si hay suficiente stock', async () => {
            // Mock getStockDisponible behavior by mocking supabase response
            mockSupabaseClient.single.mockResolvedValue({
                data: { id: 'prod-1', stock_actual: '100', stock_reservado: '0' },
                error: null,
            });

            const items = [{ producto_id: 'prod-1', cantidad: 50 }];
            const result = await service.verificarDisponibilidad(items, 'tenant-1');

            expect(result.disponible).toBe(true);
            expect(result.warnings).toHaveLength(0);
        });

        it('debe retornar disponible: false y warnings si falta stock', async () => {
            // Mock para el primer item (insuficiente) y segundo item (suficiente)
            // Nota: Como es un loop, mockearemos single para devolver el producto
            mockSupabaseClient.single
                .mockResolvedValueOnce({
                    data: { id: 'prod-1', stock_actual: '10', stock_reservado: '0', nombre: 'Producto Escaso', codigo: 'P01' },
                    error: null,
                })
                .mockResolvedValueOnce({ // Llamada dentro del if warning
                    data: { id: 'prod-1', stock_actual: '10', stock_reservado: '0', nombre: 'Producto Escaso', codigo: 'P01' },
                    error: null,
                });

            const items = [{ producto_id: 'prod-1', cantidad: 50 }];
            const result = await service.verificarDisponibilidad(items, 'tenant-1');

            expect(result.disponible).toBe(false);
            expect(result.warnings).toHaveLength(1);
            expect(result.warnings[0].faltante).toBe(40);
            expect(result.warnings[0].nombre).toBe('Producto Escaso');
        });
    });

    describe('reservarStock', () => {
        it('debe reservar stock exitosamente', async () => {
            const productoId = 'prod-1';
            const tenantId = 'tenant-1';
            const cantidad = 10;

            // 1. Get Producto
            mockSupabaseClient.single.mockResolvedValueOnce({
                data: { id: productoId, stock_actual: '100', stock_reservado: '0' },
                error: null,
            });

            // 2. Update Producto
            mockSupabaseClient.update.mockReturnValueOnce(mockSupabaseClient); // For update chain

            // 3. Crear Movimiento (insert -> select -> single)
            mockSupabaseClient.single.mockResolvedValueOnce({
                data: { id: 'mov-1' },
                error: null
            });

            const result = await service.reservarStock(productoId, cantidad, tenantId);

            expect(result).toBe('mov-1');
            // Verifica update de stock_reservado
            expect(mockSupabaseClient.update).toHaveBeenCalledWith({ stock_reservado: 10 });
            // Verifica insert de movimiento
            expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
                expect.objectContaining({
                    tipo: TipoMovimiento.RESERVA,
                    cantidad: 10,
                    producto_id: productoId,
                })
            );
        });

        it('debe lanzar BadRequestException si cantidad <= 0', async () => {
            await expect(service.reservarStock('p1', 0, 't1')).rejects.toThrow(BadRequestException);
        });

        it('debe lanzar NotFoundException si producto no existe', async () => {
            mockSupabaseClient.single.mockResolvedValue({ data: null, error: { message: 'Not found' } });
            await expect(service.reservarStock('p1', 10, 't1')).rejects.toThrow(NotFoundException);
        });
    });


    describe('liberarReserva', () => {
        it('debe liberar reserva exitosamente', async () => {
            const productoId = 'prod-1';
            const tenantId = 'tenant-1';
            const cantidad = 5;

            // 1. Get Producto
            mockSupabaseClient.single.mockResolvedValueOnce({
                data: { id: productoId, stock_actual: '100', stock_reservado: '20' },
                error: null,
            });

            // 2. Update Producto
            mockSupabaseClient.update.mockReturnValueOnce(mockSupabaseClient);

            // 3. Crear Movimiento
            mockSupabaseClient.single.mockResolvedValueOnce({
                data: { id: 'mov-lib-1' },
                error: null
            });

            await service.liberarReserva(productoId, cantidad, tenantId);

            expect(mockSupabaseClient.update).toHaveBeenCalledWith({ stock_reservado: 15 }); // 20 - 5
        });

        it('debe ajustar liberacion al maximo reservado si se intenta liberar mas', async () => {
            const productoId = 'prod-1';
            const cantidad = 50; // Trying to release 50
            const reservado = 20; // Only 20 reserved

            mockSupabaseClient.single.mockResolvedValueOnce({
                data: { id: productoId, stock_actual: '100', stock_reservado: reservado.toString() },
                error: null,
            });
            mockSupabaseClient.single.mockResolvedValueOnce({ data: { id: 'mov-lib-2' } });

            await service.liberarReserva(productoId, cantidad, 't1');

            // Should release only 'reservado' amount (20), so new reserved stock is 0
            expect(mockSupabaseClient.update).toHaveBeenCalledWith({ stock_reservado: 0 });
        });
    });

    describe('descontarStock', () => {
        it('debe descontar stock y liberar reserva', async () => {
            const productoId = 'prod-1';
            const tenantId = 'tenant-1';
            const cantidad = 5;

            // 1. Get Producto (Initial state: Stock 100, Reserved 10)
            mockSupabaseClient.single.mockResolvedValueOnce({
                data: { id: productoId, nombre: 'Prod 1', stock_actual: '100', stock_reservado: '10', precio_venta: 50 },
                error: null,
            });

            mockSupabaseClient.rpc.mockResolvedValueOnce({
                data: 'mov-salida-1',
                error: null,
            });

            mockSupabaseClient.single.mockResolvedValueOnce({
                data: { precio_venta: 100, stock_actual: '95', stock_reservado: '5' },
                error: null
            });

            const movimientoId = await service.descontarStock(productoId, cantidad, tenantId, 'VENTA', 'v1');

            expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('descontar_stock_y_liberar_reserva', {
                p_producto_id: productoId,
                p_cantidad: cantidad,
                p_referencia_tipo: 'VENTA',
                p_referencia_id: 'v1',
                p_notas: 'Salida de 5 unidades (VENTA)',
            });

            expect(movimientoId).toBe('mov-salida-1');
            expect(mockSupabaseClient.update).not.toHaveBeenCalled();
            expect(eventBusService.emitMovimientoStock).toHaveBeenCalled();
        });

        it('debe lanzar BadRequestException si stock es insuficiente', async () => {
            mockSupabaseClient.single.mockResolvedValueOnce({
                data: { id: 'p1', nombre: 'Prod 1', stock_actual: '5', stock_reservado: '0' },
                error: null,
            });

            await expect(service.descontarStock('p1', 10, 't1')).rejects.toThrow(BadRequestException);
        });
    });

    describe('registrarEntradaStockAtomico', () => {
        it('debe llamar RPC y emitir evento', async () => {
            const params = {
                tenantId: 't1',
                productoId: 'p1',
                almacenId: 'alm1',
                tipo: 'ENTRADA' as const,
                cantidad: 10,
                referenciaTipo: 'COMPRA',
                referenciaId: 'c1'
            };

            // RPC Call
            mockSupabaseClient.rpc.mockResolvedValueOnce({ data: 'mov-rpc-1', error: null });

            // Get updated stock
            mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: { stock_actual: 110, stock_reservado: 0 }, error: null });

            // Get product for event
            mockSupabaseClient.single.mockResolvedValueOnce({ data: { stock_actual: 110, precio_compra: 50 }, error: null });

            const result = await service.registrarEntradaStockAtomico(params);

            expect(result).toBe('mov-rpc-1');
            expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('registrar_entrada_stock_atomico', expect.anything());
            expect(eventBusService.emitMovimientoStock).toHaveBeenCalled();
        });
    });

    describe('Aislamiento multi-tenant (P2.2)', () => {
        it('getStockDisponible debe consultar con tenant_id explícito', async () => {
            const tenantA = 'tenant-a';
            const productoId = 'prod-stock';

            mockSupabaseClient.single.mockResolvedValue({
                data: {
                    stock_actual: '50',
                    stock_reservado: '10',
                },
                error: null,
            });

            const stock = await service.getStockDisponible(productoId, tenantA);

            expect(stock).toBe(40);
            expect(mockSupabaseClient.from).toHaveBeenCalledWith('productos');
            expect(mockSupabaseClient.eq).toHaveBeenCalledWith('tenant_id', tenantA);
            expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', productoId);
        });

        it('crearMovimiento debe persistir tenant del contexto en insert', async () => {
            const tenantA = 'tenant-a';
            const movimiento = {
                tenant_id: tenantA,
                producto_id: 'prod-mov',
                tipo: TipoMovimiento.ENTRADA as TipoMovimiento.ENTRADA,
                cantidad: 8,
                referencia_tipo: 'AJUSTE',
                referencia_id: 'ref-001',
                notas: 'Ajuste inicial',
                created_by: 'user-1',
            };

            mockSupabaseClient.single
                .mockResolvedValueOnce({
                    data: { id: 'mov-1' },
                    error: null,
                })
                .mockResolvedValueOnce({
                    data: {
                        stock_actual: '100',
                        precio_venta: 12.5,
                        precio_compra: 10,
                    },
                    error: null,
                });

            await service.crearMovimiento(movimiento);

            expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
                expect.objectContaining({
                    tenant_id: tenantA,
                    producto_id: movimiento.producto_id,
                    tipo: TipoMovimiento.ENTRADA,
                }),
            );

            expect(mockSupabaseClient.eq).toHaveBeenCalledWith('tenant_id', tenantA);
            expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', movimiento.producto_id);
        });
    });

});
