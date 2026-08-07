import { ArcaFiscalService, validateArgentinaTaxId } from './arca-fiscal.service';

describe('ArcaFiscalService', () => {
  const service = new ArcaFiscalService(
    { get: jest.fn() } as any,
    {} as any,
    {} as any,
  );

  const documento = (overrides: Record<string, unknown> = {}) =>
    ({
      tipoDocumento: 'FACTURA_A',
      serie: '00001',
      numero: '1',
      fechaEmision: new Date('2026-07-29T12:00:00Z'),
      moneda: 'ARS',
      emisor: {
        numeroDocumento: '30710158229',
        razonSocial: 'Empresa Argentina',
      },
      receptor: {
        tipoDocumento: 'CUIT',
        numeroDocumento: '30712345671',
        razonSocial: 'Cliente Argentina',
      },
      subtotal: 100,
      totalImpuestos: 21,
      importeTotal: 121,
      tasaImpuesto: 21,
      items: [
        {
          descripcion: 'Servicio',
          cantidad: 1,
          precioUnitario: 100,
          subtotal: 100,
          impuesto: 21,
          total: 121,
          tasaIgv: 21,
        },
      ],
      ...overrides,
    }) as any;

  it('valida CUIT con dígito verificador y rechaza uno alterado', () => {
    expect(validateArgentinaTaxId('30-71015822-9')).toBe(true);
    expect(validateArgentinaTaxId('30-71015822-8')).toBe(false);
  });

  it('acepta factura ARCA con ARS e IVA 21%', async () => {
    const result = await service.validarDocumento(documento());

    expect(result.valido).toBe(true);
    expect(result.errores).toEqual([]);
  });

  it('rechaza moneda, alícuota y totales que WSFE no admite', async () => {
    const result = await service.validarDocumento(
      documento({
        moneda: 'PEN',
        importeTotal: 120,
        items: [{ tasaIgv: 18 }],
      }),
    );

    expect(result.valido).toBe(false);
    expect(result.errores.join(' ')).toContain('ARS o USD');
    expect(result.errores.join(' ')).toContain('Subtotal + IVA');
    expect(result.errores.join(' ')).toContain('18%');
  });

  it('genera representación fiscal con tipo WSFE y moneda ARS', async () => {
    const xml = await service.generarXML(documento());

    expect(xml).toContain('<Tipo>1</Tipo>');
    expect(xml).toContain('<Moneda>ARS</Moneda>');
    expect(xml).toContain('<IVA>21.00</IVA>');
  });
});
