import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { CPEIntegrationService } from './cpe-integration.service';

function servicio(productos: any[], error?: any) {
  const q: any = {};
  for (const m of ['select', 'eq', 'in']) q[m] = jest.fn(() => q);
  q.then = (resolve: any) => resolve({ data: productos, error: error ?? null });
  const service = new CPEIntegrationService({ getClient: () => ({ from: () => q }) } as any, {} as any, {} as any, {} as any, {} as any);
  return { service, q };
}

describe('Costo de facturación de pedidos Perú', () => {
  it('conserva cero y alta precisión del costo PE sin usar el precio de catálogo', async () => {
    const { service, q } = servicio([{ id: 'p1', costo_promedio_base: '0', costo: 99, stock_actual: 10, precio_compra: 99 }, { id: 'p2', costo_promedio_base: '1.23456789', costo: '1.23', stock_actual: 2, precio_compra: 99 }]);
    const costos = await (service as any).obtenerCostoPorProducto('tenant', ['p1', 'p2'], 'PE');
    expect(costos.get('p1')).toBe(0);
    expect(costos.get('p2')).toBe(1.23456789);
    expect(q.eq).toHaveBeenCalledWith('tenant_id', 'tenant');
    expect(q.in).toHaveBeenCalledWith('id', ['p1', 'p2']);
  });
  it('rechaza existencias sin costo canónico aunque el catálogo tenga costo', async () => {
    const { service } = servicio([{ id: 'p1', costo_promedio_base: null, costo: 99, precio_compra: 99, stock_actual: 2 }]);
    await expect((service as any).obtenerCostoPorProducto('tenant', ['p1'], 'PE')).rejects.toBeInstanceOf(ConflictException);
  });
  it('un servicio sin costo de inventario no usa su precio de compra como mercadería', async () => {
    const { service } = servicio([{ id: 's1', costo: null, precio_compra: 500, es_servicio: true }]);
    expect((await (service as any).obtenerCostoPorProducto('tenant', ['s1'], 'PE')).get('s1')).toBe(0);
  });
  it.each([null, '', 'NaN', '-1'])('rechaza un costo físico no verificado (%s)', async costo => {
    const { service } = servicio([{ id: 'p1', costo, precio_compra: 99 }]);
    await expect((service as any).obtenerCostoPorProducto('tenant', ['p1'], 'PE')).rejects.toBeInstanceOf(ConflictException);
  });
  it('una lectura fallida es 503 y no entrega un mapa vacío que termine como costo de ventas cero', async () => {
    const { service } = servicio([], { code: '42501', message: 'lectura denegada' });
    await expect((service as any).obtenerCostoPorProducto('tenant', ['p1'], 'PE')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('una fila ausente no se transforma en un costo cero', async () => {
    const { service } = servicio([]);
    await expect((service as any).obtenerCostoPorProducto('tenant', ['p1'], 'PE')).rejects.toBeInstanceOf(ConflictException);
  });
  it.each(['CO', 'AR'])('preserva el fallback existente del catálogo para %s', async pais => {
    const { service } = servicio([{ id: 'p1', costo: 0, precio_compra: 99 }]);
    expect((await (service as any).obtenerCostoPorProducto('tenant', ['p1'], pais)).get('p1')).toBe(99);
  });
});
