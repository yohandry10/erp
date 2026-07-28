import { calcularDesgloseIgv } from '../../../shared/utils/igv-afectacion.util';

// El pedido y la cotización aplicaban la tasa de IGV al subtotal completo, sin
// mirar la afectación del Catálogo 07 de cada producto. Un pedido con un bien
// exonerado registraba S/ 36 de IGV donde correspondían S/ 18, y quedaba
// descuadrado contra el CPE, que sí desglosa.
describe('afectación del IGV en ventas', () => {
  const tasa = 0.18;

  it('no grava la parte exonerada del pedido', () => {
    const desglose = calcularDesgloseIgv(
      [
        { baseImponible: 100, afectacionIgv: '10' },
        { baseImponible: 100, afectacionIgv: '20' },
      ],
      tasa,
    );

    expect(desglose.gravadas).toBe(100);
    expect(desglose.exoneradas).toBe(100);
    expect(desglose.igv).toBe(18);
    expect(desglose.total).toBe(218);
  });

  it('tampoco grava lo inafecto ni la exportación', () => {
    const desglose = calcularDesgloseIgv(
      [
        { baseImponible: 50, afectacionIgv: '30' },
        { baseImponible: 50, afectacionIgv: '40' },
      ],
      tasa,
    );

    expect(desglose.igv).toBe(0);
    expect(desglose.total).toBe(100);
  });

  it('un pedido íntegramente gravado mantiene la tasa sobre todo el subtotal', () => {
    const desglose = calcularDesgloseIgv([{ baseImponible: 200, afectacionIgv: '10' }], tasa);
    expect(desglose.igv).toBe(36);
  });

  it('sin afectación conocida asume gravado, que es lo que no sub-declara', () => {
    const desglose = calcularDesgloseIgv([{ baseImponible: 200 }], tasa);
    expect(desglose.igv).toBe(36);
  });
});
