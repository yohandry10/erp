import { ContabilidadEventsListener } from './contabilidad-events.listener';

describe('D28: factura atómica y moneda funcional', () => {
  function setup() {
    const generator = { generarAsientoVenta: jest.fn().mockResolvedValue({ id: 'journal' }) };
    const listener = new ContabilidadEventsListener(generator as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    jest.spyOn(listener as any, 'buscarAsientoPorReferenciaVenta').mockResolvedValue(null);
    jest.spyOn(listener as any, 'verificarAsientoCreado').mockResolvedValue({ id: 'journal' });
    return { listener, generator };
  }
  const event = (data = {}) => ({ event_id: 'event', event_data: {
    source: 'cpe.api.atomic', tenantId: 'tenant', moneda: 'USD', tipoCambio: 3.8,
    subtotal: .06, impuestos: .01, total: .07, costoVentas: 15.5,
    serie: 'F001', numero: '00000002', fechaEmision: '2026-11-06', ...data,
  } });

  it.each([
    [{}, { base_imponible: .23, igv: .04, total: .27 }],
    [{ subtotal: .01, impuestos: .02, total: .03 }, { base_imponible: .04, igv: .07, total: .11 }],
    [{ moneda: 'PEN', tipoCambio: 1 }, { base_imponible: .06, igv: .01, total: .07 }],
  ])('convierte importes y conserva costo ya funcional: %p', async (data, expected) => {
    const { listener, generator } = setup();
    const source = event(data), before = JSON.stringify(source);
    await (listener as any).handleFacturaEmitida(source);
    expect(generator.generarAsientoVenta).toHaveBeenCalledWith(expect.objectContaining({
      ...expected, costo_ventas: 15.5, event_id: 'event', tenant_id: 'tenant',
    }));
    expect(JSON.stringify(source)).toBe(before);
  });

  it.each([undefined, null, 0, -1, NaN, Infinity, 'incorrecto'])('rechaza tipo de cambio no verificable %p', async tipoCambio => {
    const { listener, generator } = setup();
    await expect((listener as any).handleFacturaEmitida(event({ tipoCambio })))
      .rejects.toThrow('CPE_ACCOUNTING_CURRENCY_SNAPSHOT_INVALID');
    expect(generator.generarAsientoVenta).not.toHaveBeenCalled();
  });

  it('rechaza una factura PEN con un tipo de cambio distinto de uno', async () => {
    const { listener, generator } = setup();
    await expect((listener as any).handleFacturaEmitida(event({ moneda: 'PEN' })))
      .rejects.toThrow('CPE_ACCOUNTING_CURRENCY_SNAPSHOT_INVALID');
    expect(generator.generarAsientoVenta).not.toHaveBeenCalled();
  });

  it.each(['retencion', 'detraccion', 'anticipo'])('convierte %s y la deuda desde el snapshot original', async key => {
    const { listener, generator } = setup();
    await (listener as any).handleFacturaEmitida(event({ ajustes: { [key]: .01 } }));
    expect(generator.generarAsientoVenta).toHaveBeenCalledWith(expect.objectContaining({
      monto_pendiente: .23, total: .27, ajustes: expect.objectContaining({ [key]: .04 }),
    }));
  });

  it('conserva percepción y los tres ajustes en PEN sin alterar el costo', async () => {
    const { listener, generator } = setup();
    const ajustes = { retencion: .01, detraccion: .01, anticipo: .01, percepcion: .01 };
    const source = event({ moneda: 'PEN', tipoCambio: 1, ajustes });
    const original = JSON.stringify(source);
    await (listener as any).handleFacturaEmitida(source);
    expect(generator.generarAsientoVenta).toHaveBeenCalledWith(expect.objectContaining({
      monto_pendiente: .05, total: .07, ajustes, costo_ventas: 15.5,
    }));
    expect(JSON.stringify(source)).toBe(original);
  });

  it('permite una factura completamente cubierta por anticipo', async () => {
    const { listener, generator } = setup();
    await (listener as any).handleFacturaEmitida(event({ moneda: 'PEN', tipoCambio: 1, ajustes: { anticipo: .07 } }));
    expect(generator.generarAsientoVenta).toHaveBeenCalledWith(expect.objectContaining({ monto_pendiente: 0 }));
  });

  it('detiene un redondeo cambiario que no concilia antes de crear el asiento', async () => {
    const { listener, generator } = setup();
    await expect((listener as any).handleFacturaEmitida(event({ ajustes: { percepcion: .01 } })))
      .rejects.toThrow('CPE_ACCOUNTING_CURRENCY_REVIEW_REQUIRED');
    expect(generator.generarAsientoVenta).not.toHaveBeenCalled();
  });

  it.each([-1, NaN, Infinity, .001, 'incorrecto', true])('rechaza ajuste inválido %p antes del asiento', async retencion => {
    const { listener, generator } = setup();
    await expect((listener as any).handleFacturaEmitida(event({ ajustes: { retencion } })))
      .rejects.toThrow('CPE_ACCOUNTING_CURRENCY_SNAPSHOT_INVALID');
    expect(generator.generarAsientoVenta).not.toHaveBeenCalled();
  });
});
