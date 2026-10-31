import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { calcularMetricasInventario, obtenerPaisMetricasInventario } from './inventario-metrics.util';

describe('Valorización de métricas de inventario por país', () => {
  it('Perú usa promedio ponderado de alta precisión y respeta costo cero', () => {
    const resultado = calcularMetricasInventario([
      { costo_promedio_base: '0', costo: '999', precio_compra: '999', stock_actual: 10 },
      { costo_promedio_base: '1.23456789', costo: '1.23', precio_compra: '25', stock_actual: 10000 },
    ], 'PE');
    expect(resultado.valorInventario).toBe(12345.68);
  });
  it.each(['CO', 'AR'])('mantiene la precedencia histórica de catálogo para %s', pais => {
    expect(calcularMetricasInventario([{ costo: 20, precio_compra: 10, stock_actual: 3 }], pais).valorInventario).toBe(30);
  });
  it('una empresa nueva sin stock y los servicios no producen una valorización inventada ni bloquean', () => {
    const resultado = calcularMetricasInventario([
      { costo: null, precio_compra: 15, stock_actual: 0 },
      { costo: null, precio_compra: 500, stock_actual: 10, es_servicio: true },
    ], 'PE');
    expect(resultado.totalProductos).toBe(2);
    expect(resultado.valorInventario).toBe(0);
  });
  it.each([null, '', 'NaN', '-1'])('no sustituye por precio de compra un stock cuyo costo está incompleto (%s)', costo => {
    expect(() => calcularMetricasInventario([{ costo_promedio_base: costo, costo: 15, precio_compra: 15, stock_actual: 2 }], 'PE'))
      .toThrow(ConflictException);
  });
  it('no aplica la política peruana cuando falla la lectura de país', async () => {
    const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: { code: '42501' } }) };
    await expect(obtenerPaisMetricasInventario({ from: () => q }, 'tenant')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
