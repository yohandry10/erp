import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CotizacionCompraDetalleDto } from '../create-cotizacion-compra.dto';
import { OrdenCompraDetalleDto } from '../create-orden-compra.dto';

describe.each([CotizacionCompraDetalleDto, OrdenCompraDetalleDto])('%s purchase quantity persistence boundary', (Dto) => {
  it.each([0.12, 0.29, 0.87, 2.5, 100])('accepts exact supported quantity %s', async (cantidad) => {
    const dto = plainToInstance(Dto, { producto_id: '78a0935c-c48d-4b35-bd8c-9c86361936aa', descripcion: 'Insumo', cantidad, precio_unitario: 24 });
    expect(await validate(dto)).toEqual([]);
  });
  it.each([0.125, 0.875, 0.001, NaN, Infinity, -1, 0])('rejects %s before silently changing stock or money', async (cantidad) => {
    const dto = plainToInstance(Dto, { producto_id: '78a0935c-c48d-4b35-bd8c-9c86361936aa', descripcion: 'Insumo', cantidad, precio_unitario: 24 });
    expect((await validate(dto)).some(error => error.property === 'cantidad')).toBe(true);
  });
  it.each([0.125, 0.875, NaN, Infinity, -1])('rejects unsupported unit price %s', async (precio_unitario) => {
    const dto = plainToInstance(Dto, { producto_id: '78a0935c-c48d-4b35-bd8c-9c86361936aa', descripcion: 'Insumo', cantidad: 2, precio_unitario });
    expect((await validate(dto)).some(error => error.property === 'precio_unitario')).toBe(true);
  });
  it.each([0, 0.29, 24])('accepts exact unit price %s', async (precio_unitario) => {
    const dto = plainToInstance(Dto, { producto_id: '78a0935c-c48d-4b35-bd8c-9c86361936aa', descripcion: 'Insumo', cantidad: 2, precio_unitario });
    expect(await validate(dto)).toEqual([]);
  });
});
