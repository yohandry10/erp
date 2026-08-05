import { BadRequestException } from '@nestjs/common';
import { InventarioController } from './inventario.controller';

describe('InventarioController', () => {
  const buildController = (client: any, tasaIgv = 0.18) =>
    new InventarioController(
      {} as any,
      { getClient: () => client } as any,
      {} as any,
      {} as any,
      { getTasaIgv: jest.fn().mockResolvedValue(tasaIgv) } as any,
    );

  it('calcula stats con costo y el ledger canonico', async () => {
    const from = jest.fn((table: string) => {
      if (table === 'productos') {
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({
                data: [
                  { precio_compra: 10, costo: 20, stock_actual: 3, stock_minimo: 1 },
                  { precio_compra: 0, costo: 4, stock_actual: 2, stock_minimo: 2 },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'movimientos_inventario') {
        return {
          select: () => ({
            eq: () => ({
              gte: () => ({
                lt: async () => ({ count: 7, error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Tabla inesperada: ${table}`);
    });

    const result = await buildController({ from }).getStats('tenant-1');

    expect(result).toEqual({
      success: true,
      data: {
        totalProductos: 2,
        valorInventario: 38,
        productosStockBajo: 1,
        movimientosHoy: 7,
      },
    });
    expect(from).toHaveBeenCalledWith('movimientos_inventario');
    expect(from).not.toHaveBeenCalledWith('stock_movimientos');
  });

  it('crea producto mediante una sola RPC transaccional', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { id: 'product-1', codigo: 'SKU-1', stock_actual: 3 },
      error: null,
    });
    const controller = buildController({ rpc });

    const result = await controller.createProducto('tenant-1', {
      codigo: 'SKU-1',
      nombre: 'Producto',
      categoria: 'OTROS',
      precioVenta: 20,
      precioCompra: 10,
      stock: 3,
      almacen_id: 'warehouse-1',
    });

    expect(result.success).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      'crear_producto_inventario_tx',
      expect.objectContaining({
        p_tenant_id: 'tenant-1',
        p_almacen_id: 'warehouse-1',
        p_stock_inicial: 3,
        p_stock_reservado: 0,
        p_precios_sucursal: [],
        p_producto: expect.objectContaining({ codigo: 'SKU-1', stock_actual: 0 }),
      }),
    );
  });

  it('devuelve 400 cuando el codigo ya existe en el tenant', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    });
    const controller = buildController({ rpc });

    await expect(
      controller.createProducto('tenant-1', {
        codigo: 'SKU-1',
        nombre: 'Producto',
        categoria: 'OTROS',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
