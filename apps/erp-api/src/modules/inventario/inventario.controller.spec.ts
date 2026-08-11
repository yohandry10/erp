import { BadRequestException } from '@nestjs/common';
import { InventarioController } from './inventario.controller';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';

describe('InventarioController', () => {
  const buildController = (
    client: any,
    tasaIgv = 0.18,
    inventario: any = {},
    almacenes: any = {},
    productImages: any = {},
  ) =>
    new InventarioController(
      { getClient: () => client } as any,
      almacenes as any,
      inventario as any,
      { getTasaIgv: jest.fn().mockResolvedValue(tasaIgv) } as any,
      productImages as any,
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

  it('delega el alta del producto al contrato atomico con actor e idempotencia', async () => {
    const crearProductoMaestro = jest.fn().mockResolvedValue({
      id: 'product-1', codigo: 'SKU-1', stock_actual: 3,
    });
    const controller = buildController({}, 0.18, { crearProductoMaestro });

    const result = await controller.createProducto('tenant-1', 'actor-1', {
      idempotency_key: 'product-create-key',
      codigo: 'SKU-1',
      nombre: 'Producto',
      marca: 'Marca Uno',
      categoria: 'OTROS',
      precio_venta: 20,
      precio_compra: 10,
      stock_inicial: 3,
      almacen_id: 'warehouse-1',
    });

    expect(result.success).toBe(true);
    expect(crearProductoMaestro).toHaveBeenCalledWith(
      'tenant-1',
      'actor-1',
      expect.objectContaining({
        idempotency_key: 'product-create-key',
        codigo: 'SKU-1',
        marca: 'Marca Uno',
        stock_inicial: 3,
        impuesto: 18,
      }),
    );
  });

  it('devuelve 400 cuando el codigo ya existe en el tenant', async () => {
    const crearProductoMaestro = jest.fn().mockRejectedValue(
      new BadRequestException('Código duplicado'),
    );
    const controller = buildController({}, 0.18, { crearProductoMaestro });

    await expect(
      controller.createProducto('tenant-1', 'actor-1', {
        idempotency_key: 'product-create-key',
        codigo: 'SKU-1',
        nombre: 'Producto',
        categoria: 'OTROS',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('toma el actor autenticado y no acepta uno suministrado por el body', async () => {
    const registrarAjusteAtomico = jest.fn().mockResolvedValue({ operacion_id: 'op-1' });
    const controller = buildController({}, 0.18, { registrarAjusteAtomico });
    const dto = {
      producto_id: '10000000-0000-4000-8000-000000000001',
      almacen_id: '20000000-0000-4000-8000-000000000001',
      delta: 0.5,
      motivo: 'Conteo físico',
      idempotency_key: 'stable-adjustment-key',
    };

    const response = await controller.realizarMovimiento('tenant-1', 'jwt-actor', dto);

    expect(response).toEqual({ success: true, data: { operacion_id: 'op-1' } });
    expect(registrarAjusteAtomico).toHaveBeenCalledWith('tenant-1', 'jwt-actor', dto);
  });

  it('rechaza operaciones sin actor JWT', async () => {
    const controller = buildController({}, 0.18, {
      transferirStockAtomico: jest.fn(),
    });

    await expect(controller.transferirInventario('tenant-1', '', {
      producto_id: '10000000-0000-4000-8000-000000000001',
      almacen_origen_id: '20000000-0000-4000-8000-000000000001',
      almacen_destino_id: '20000000-0000-4000-8000-000000000002',
      cantidad: 1,
      motivo: 'Traslado',
      idempotency_key: 'stable-transfer-key',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('actualiza metadatos mediante el contrato atomico sin tocar stock', async () => {
    const actualizarProductoMaestro = jest.fn().mockResolvedValue({ id: 'product-1' });
    const controller = buildController({}, 0.18, { actualizarProductoMaestro });

    const response = await controller.updateProducto('tenant-1', 'actor-1', 'product-1', {
      idempotency_key: 'product-update-key',
      nombre: 'Producto',
      marca: 'Marca Actualizada',
    });

    expect(response.success).toBe(true);
    expect(actualizarProductoMaestro).toHaveBeenCalledWith(
      'tenant-1',
      'actor-1',
      'product-1',
      {
        idempotency_key: 'product-update-key',
        nombre: 'Producto',
        marca: 'Marca Actualizada',
      },
    );
  });

  it('crea almacenes con actor JWT y contrato idempotente', async () => {
    const crearAlmacenMaestro = jest.fn().mockResolvedValue({ id: 'warehouse-1' });
    const controller = buildController({}, 0.18, { crearAlmacenMaestro });

    const response = await controller.createAlmacen('tenant-1', 'actor-1', {
      idempotency_key: 'warehouse-create-key',
      codigo: 'WH-1',
      nombre: 'Principal',
      es_principal: true,
    });

    expect(response.success).toBe(true);
    expect(crearAlmacenMaestro).toHaveBeenCalledWith('tenant-1', 'actor-1', {
      idempotency_key: 'warehouse-create-key',
      codigo: 'WH-1',
      nombre: 'Principal',
      es_principal: true,
    });
  });

  it('crea ubicaciones dentro del almacen del path', async () => {
    const crearUbicacionMaestro = jest.fn().mockResolvedValue({ id: 'location-1' });
    const controller = buildController({}, 0.18, { crearUbicacionMaestro });

    await controller.createUbicacion('tenant-1', 'actor-1', 'warehouse-1', {
      idempotency_key: 'location-create-key',
      codigo: 'R01',
      nombre: 'Rack 1',
      tipo: 'RACK',
    });

    expect(crearUbicacionMaestro).toHaveBeenCalledWith(
      'tenant-1',
      'actor-1',
      'warehouse-1',
      expect.objectContaining({ idempotency_key: 'location-create-key', codigo: 'R01' }),
    );
  });

  it('rechaza desactivar un maestro sin Idempotency-Key', async () => {
    const controller = buildController({}, 0.18, { desactivarAlmacenMaestro: jest.fn() });
    await expect(
      controller.deleteAlmacen('tenant-1', 'actor-1', 'warehouse-1', undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sube la imagen con tenant, actor e intención del header', async () => {
    const upload = jest.fn().mockResolvedValue({ imagen_url: 'https://storage/image.png' });
    const controller = buildController({}, 0.18, {}, {}, { upload });
    const file = {
      buffer: Buffer.from('png'), mimetype: 'image/png', size: 3, originalname: 'foto.png',
    };

    const response = await controller.uploadProductImage(
      'tenant-1', 'actor-1', 'product-1', 'product-image-upload-key', file,
    );

    expect(response.success).toBe(true);
    expect(upload).toHaveBeenCalledWith(
      'tenant-1', 'actor-1', 'product-1', 'product-image-upload-key', file,
    );
  });

  it('no permite borrar una imagen sin Idempotency-Key', async () => {
    const remove = jest.fn();
    const controller = buildController({}, 0.18, {}, {}, { remove });

    await expect(
      controller.deleteProductImage('tenant-1', 'actor-1', 'product-1', undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(remove).not.toHaveBeenCalled();
  });

  it('protege carga y borrado con el permiso de actualización del producto', () => {
    for (const method of ['uploadProductImage', 'deleteProductImage'] as const) {
      expect(Reflect.getMetadata(
        PERMISSION_KEY,
        InventarioController.prototype[method],
      )).toEqual(expect.objectContaining({ raw: 'inventario.productos.update' }));
    }
  });
});
