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

            mockSupabaseClient.rpc.mockResolvedValueOnce({ data: 'mov-1', error: null });

            const result = await service.reservarStock(productoId, cantidad, tenantId);

            expect(result).toBe('mov-1');
            expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('reservar_stock_atomico', expect.objectContaining({
                p_producto_id: productoId,
                p_cantidad: 10,
            }));
            expect(mockSupabaseClient.update).not.toHaveBeenCalled();
            expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
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

            mockSupabaseClient.rpc.mockResolvedValueOnce({ data: 'mov-lib-1', error: null });

            const movimiento = await service.liberarReserva(productoId, cantidad, tenantId);

            expect(movimiento).toBe('mov-lib-1');
            expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('liberar_stock_atomico', expect.objectContaining({
                p_producto_id: productoId,
                p_cantidad: 5,
            }));
            expect(mockSupabaseClient.update).not.toHaveBeenCalled();
        });

        it('debe ajustar liberacion al maximo reservado si se intenta liberar mas', async () => {
            const productoId = 'prod-1';
            const cantidad = 50; // Trying to release 50
            const reservado = 20; // Only 20 reserved

            mockSupabaseClient.single.mockResolvedValueOnce({
                data: { id: productoId, stock_actual: '100', stock_reservado: reservado.toString() },
                error: null,
            });
            mockSupabaseClient.rpc.mockResolvedValueOnce({ data: null, error: { message: 'reserva insuficiente' } });

            await expect(service.liberarReserva(productoId, cantidad, 't1')).rejects.toThrow(BadRequestException);
            expect(mockSupabaseClient.update).not.toHaveBeenCalled();
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

        it('crearMovimiento debe usar el writer canónico con tenant y almacén', async () => {
            const tenantA = 'tenant-a';
            const movimiento = {
                tenant_id: tenantA,
                producto_id: 'prod-mov',
                almacen_id: '00000000-0000-4000-8000-000000000001',
                tipo: TipoMovimiento.ENTRADA as TipoMovimiento.ENTRADA,
                cantidad: 8,
                referencia_tipo: 'AJUSTE',
                referencia_id: '00000000-0000-4000-8000-000000000002',
                notas: 'Ajuste inicial',
                created_by: 'user-1',
            };

            mockSupabaseClient.rpc.mockResolvedValueOnce({ data: 'mov-1', error: null });
            mockSupabaseClient.single.mockResolvedValueOnce({
                    data: {
                        stock_actual: '100',
                        precio_venta: 12.5,
                        precio_compra: 10,
                    },
                    error: null,
                });

            await service.crearMovimiento(movimiento);

            expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
                'aplicar_movimiento_inventario_tx',
                expect.objectContaining({
                    p_tenant_id: tenantA,
                    p_producto_id: movimiento.producto_id,
                    p_almacen_id: movimiento.almacen_id,
                    p_tipo: TipoMovimiento.ENTRADA,
                }),
            );
            expect(mockSupabaseClient.insert).not.toHaveBeenCalled();

            expect(mockSupabaseClient.eq).toHaveBeenCalledWith('tenant_id', tenantA);
            expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', movimiento.producto_id);
        });
    });


    describe('obtenerKardexValorizado canónico', () => {
        it('aplica producto, almacén y fechas una sola vez en la RPC canónica', async () => {
            const payload = {
                success: true,
                data: [
                    {
                        id: 'mov-1',
                        tipo: 'DEVOLUCION',
                        sentido: 'SALIDA',
                        cantidad: 1,
                        cantidadFirmada: -1,
                        costoUnitario: 20,
                        valorTotal: 20,
                        moneda: 'PEN',
                        valuacionEstado: 'CONFIRMADA',
                    },
                ],
                resumen: {
                    totalMovimientos: 7,
                    totalEntradas: 13,
                    totalSalidas: 2,
                    saldoCantidad: 11,
                    valorPorMoneda: { PEN: 200, USD: 5 },
                    pendientesValorizacion: 1,
                    saldoValorizadoBase: null,
                },
            };
            mockSupabaseClient.rpc.mockResolvedValueOnce({ data: payload, error: null });
            jest.spyOn(service as any, 'registrarIntegrationLog').mockResolvedValue(undefined);

            const resultado = await service.obtenerKardexValorizado('tenant-a', {
                productoId: 'producto-a',
                almacenId: 'almacen-a',
                desde: '2026-08-01',
                hasta: '2026-08-10',
                limit: 2,
            });

            expect(mockSupabaseClient.rpc).toHaveBeenCalledTimes(1);
            expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('reporte_kardex_valorizado_470', {
                p_tenant_id: 'tenant-a',
                p_producto_id: 'producto-a',
                p_almacen_id: 'almacen-a',
                p_desde: '2026-08-01',
                p_hasta: '2026-08-10',
                p_limit: 2,
            });
            expect(resultado).toEqual(payload);
            expect(resultado.resumen.totalMovimientos).toBe(7);
            expect(resultado.data).toHaveLength(1);
            expect(resultado.resumen.saldoValorizadoBase).toBeNull();
        });

        it('falla cerrado si SQL no entrega detalle y resumen', async () => {
            mockSupabaseClient.rpc.mockResolvedValueOnce({
                data: { success: true },
                error: null,
            });

            await expect(
                service.obtenerKardexValorizado('tenant-a'),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('rechaza una fecha inválida sin ejecutar el reporte sin filtro', async () => {
            jest.spyOn(service as any, 'registrarIntegrationLog').mockResolvedValue(undefined);

            await expect(
                service.obtenerKardexValorizado('tenant-a', { desde: '2026-02-30' }),
            ).rejects.toBeInstanceOf(BadRequestException);

            expect(mockSupabaseClient.rpc).not.toHaveBeenCalled();
        });
    });

});
