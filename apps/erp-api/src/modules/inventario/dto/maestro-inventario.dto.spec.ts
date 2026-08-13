import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductoMaestroDto, UpdateAlmacenDto, UpdateUbicacionDto } from './maestro-inventario.dto';

describe('DTOs de maestros de inventario 460', () => {
  it('exige una intención idempotente en el alta de producto', async () => {
    const dto = plainToInstance(CreateProductoMaestroDto, {
      codigo: 'SKU-1', nombre: 'Producto', categoria: 'REPUESTOS',
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'idempotency_key')).toBe(true);
  });

  it('acepta una marca comercial acotada y rechaza valores mayores a 120 caracteres', async () => {
    const valido = plainToInstance(CreateProductoMaestroDto, {
      codigo: 'SKU-MARCA', nombre: 'Producto', categoria: 'REPUESTOS',
      marca: 'Marca operable', idempotency_key: 'product-brand-create',
    });
    await expect(validate(valido)).resolves.toHaveLength(0);

    const invalido = plainToInstance(CreateProductoMaestroDto, {
      codigo: 'SKU-MARCA-2', nombre: 'Producto', categoria: 'REPUESTOS',
      marca: 'M'.repeat(121), idempotency_key: 'product-brand-too-long',
    });
    const errors = await validate(invalido);
    expect(errors.some((error) => error.property === 'marca')).toBe(true);
  });

  it('acepta unidades soportadas y rechaza texto libre o códigos inventados', async () => {
    const valido = plainToInstance(CreateProductoMaestroDto, {
      codigo: 'SKU-KGM', nombre: 'Producto kg', categoria: 'REPUESTOS',
      unidad_medida: 'KGM', idempotency_key: 'product-unit-create',
    });
    await expect(validate(valido)).resolves.toHaveLength(0);

    const invalido = plainToInstance(CreateProductoMaestroDto, {
      codigo: 'SKU-BAD-UNIT', nombre: 'Producto', categoria: 'REPUESTOS',
      unidad_medida: 'kilogramos', idempotency_key: 'product-unit-invalid',
    });
    const errors = await validate(invalido);
    expect(errors.some((error) => error.property === 'unidad_medida')).toBe(true);

    const codigoInventado = plainToInstance(CreateProductoMaestroDto, {
      codigo: 'SKU-FAKE-UNIT', nombre: 'Producto', categoria: 'REPUESTOS',
      unidad_medida: 'LOL', idempotency_key: 'product-unit-fake-code',
    });
    const fakeErrors = await validate(codigoInventado);
    expect(fakeErrors.some((error) => error.property === 'unidad_medida')).toBe(true);
  });

  it('no permite desactivar almacenes usando el permiso de actualización', async () => {
    const dto = plainToInstance(UpdateAlmacenDto, {
      idempotency_key: 'warehouse-update-key', activo: false,
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'activo')).toBe(true);
  });

  it('permite reactivar ubicaciones por actualización', async () => {
    const dto = plainToInstance(UpdateUbicacionDto, {
      idempotency_key: 'location-reactivate-key', activo: true,
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
