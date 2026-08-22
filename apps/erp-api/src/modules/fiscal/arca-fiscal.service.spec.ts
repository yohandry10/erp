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

  /**
   * `cpe.fecha_emision` es `timestamptz` y `CbteFch` se armaba con los getters
   * UTC. En Argentina (UTC-3) una factura emitida entre las 00:00 y las 03:00
   * salía fechada al día siguiente, y ARCA compara `CbteFch` contra su propia
   * fecha. El QR llevaba el mismo desfase, así que ni siquiera se contradecían
   * entre sí: los dos mentían igual.
   *
   * `CbteFch` es una fecha de calendario, no un instante: el día fiscal del
   * contribuyente.
   */
  describe('fecha del comprobante', () => {
    const medianocheDeBuenosAires = new Date('2026-08-21T02:30:00Z'); // 20/08 23:30 en AR

    it('fecha el comprobante en el día argentino, no en el día UTC', () => {
      const xml = (service as any).buildAuthorizeRequest(
        { cuit: '30710158229', puntoVenta: 1 },
        { token: 't', sign: 's' },
        documento({ fechaEmision: medianocheDeBuenosAires }),
        1,
        1,
      );

      expect(xml).toContain('<ar:CbteFch>20260820</ar:CbteFch>');
      expect(xml).not.toContain('20260821');
    });

    it('el QR declara la misma fecha que el XML', () => {
      const qr = (service as any).buildQrUrl(
        { cuit: '30710158229', puntoVenta: 1 },
        documento({ fechaEmision: medianocheDeBuenosAires }),
        1,
        1,
        '75000000000000',
      );

      const datos = JSON.parse(
        Buffer.from(new URL(qr).searchParams.get('p') as string, 'base64').toString('utf8'),
      );
      expect(datos.fecha).toBe('2026-08-20');
    });
  });
});
