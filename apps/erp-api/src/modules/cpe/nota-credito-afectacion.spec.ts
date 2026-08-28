import { CpeXmlBuilder } from './cpe-xml.builder';
import { CreateFacturaDto } from '@erp-suite/dtos';
import { AFECTACION_IGV } from '../../shared/utils/igv-afectacion.util';

/**
 * Una nota de crédito sobre un comprobante con operaciones exoneradas.
 *
 * El comprobante original ya se emite bien: sus `TaxSubtotal` separan la base
 * gravada de la exonerada y el `LineExtensionAmount` suma las dos. La nota, en
 * cambio, se construía por otra rama del generador que declaraba **un solo**
 * `TaxSubtotal`, fijo en categoría `S` (gravado), y ponía en
 * `LineExtensionAmount` únicamente `total_gravadas`.
 *
 * Consecuencias, las dos rechazables por SUNAT:
 *
 *  - El `LineExtensionAmount` del documento no cuadra con la suma de sus
 *    líneas: 100,00 declarado frente a 200,00 en las líneas.
 *  - La base exonerada desaparece del resumen, así que la nota reporta como
 *    gravado lo que no lo es, o simplemente no lo reporta.
 *
 * Las líneas ya clasificaban bien --cada una lleva su `TaxExemptionReasonCode`
 * y su esquema 9997--, lo que hacía el defecto más fácil de pasar por alto:
 * mirando una línea todo parecía correcto.
 */
describe('CpeXmlBuilder — nota de crédito con operaciones no gravadas', () => {
  const builder = new CpeXmlBuilder();

  const notaConExonerado = (tipo: '07' | '08'): CreateFacturaDto =>
    ({
      tipo_documento: tipo,
      serie: tipo === '07' ? 'FC01' : 'FD01',
      numero: 1,
      ruc_emisor: '20123456786',
      razon_social_emisor: 'DEMO COMERCIAL SAC',
      tipo_documento_receptor: '6',
      documento_receptor: '20600000013',
      razon_social_receptor: 'CLIENTE SAC',
      moneda: 'PEN',
      documento_referencia_id: 'F001-00000001',
      documento_referencia_tipo: '01',
      motivo_nota: 'Devolución parcial',
      total_gravadas: 100,
      total_exoneradas: 100,
      total_igv: 18,
      total_venta: 218,
      items: [
        {
          cantidad: 1,
          descripcion: 'Producto gravado',
          unidad_medida: 'NIU',
          valor_unitario: 100,
          valor_venta: 100,
          precio_venta: 118,
          igv: 18,
          total: 118,
          tipo_afectacion_igv: AFECTACION_IGV.GRAVADO,
        },
        {
          cantidad: 1,
          descripcion: 'Arroz exonerado',
          unidad_medida: 'NIU',
          valor_unitario: 100,
          valor_venta: 100,
          precio_venta: 100,
          igv: 0,
          total: 100,
          tipo_afectacion_igv: AFECTACION_IGV.EXONERADO,
        },
      ],
    }) as unknown as CreateFacturaDto;

  const subtotalesDelResumen = (xml: string) => {
    // Sólo el `TaxTotal` de cabecera: los de cada línea van dentro de
    // CreditNoteLine/DebitNoteLine y esos ya estaban bien.
    const cabecera = xml.split(/<cac:(?:CreditNote|DebitNote)Line>/)[0];
    return [...cabecera.matchAll(/<cac:TaxSubtotal>[\s\S]*?<\/cac:TaxSubtotal>/g)].map((m) => m[0]);
  };

  const valorDe = (xml: string, etiqueta: string) => {
    const m = xml.match(new RegExp(`<cbc:${etiqueta}[^>]*>([^<]+)`));
    return m ? Number(m[1]) : null;
  };

  describe.each(['07', '08'] as const)('tipo %s', (tipo) => {
    it('declara la base exonerada en su propio TaxSubtotal', () => {
      const xml = builder.generateXmlContent(notaConExonerado(tipo));
      const subtotales = subtotalesDelResumen(xml);

      const exonerado = subtotales.find((s) => s.includes('9997'));
      expect(exonerado).toBeDefined();
      expect(exonerado).toContain('>E<');
      expect(exonerado).toMatch(/<cbc:TaxableAmount[^>]*>100\.00</);
    });

    it('el LineExtensionAmount cuadra con la suma de las líneas', () => {
      const xml = builder.generateXmlContent(notaConExonerado(tipo));

      // SUNAT compara este importe contra la suma de las líneas. Con 100,00
      // frente a 200,00 el comprobante se rechaza.
      expect(valorDe(xml, 'LineExtensionAmount')).toBe(200);
      expect(valorDe(xml, 'TaxInclusiveAmount')).toBe(218);
      expect(valorDe(xml, 'PayableAmount')).toBe(218);
    });

    it('el TaxSubtotal gravado sigue llevando sólo lo gravado', () => {
      const xml = builder.generateXmlContent(notaConExonerado(tipo));
      const gravado = subtotalesDelResumen(xml).find((s) => s.includes('1000'));

      // Que aparezca el bloque exonerado no puede lograrse metiendo su base
      // dentro del gravado: eso declararía IGV que no se cobró.
      expect(gravado).toMatch(/<cbc:TaxableAmount[^>]*>100\.00</);
      expect(gravado).toMatch(/<cbc:TaxAmount[^>]*>18\.00</);
    });
  });
});

/**
 * La exportación en el resumen del comprobante.
 *
 * `totalBaseImponible` --lo que va en `LineExtensionAmount`-- ya sumaba
 * `total_exportacion`, y cada línea de exportación se clasificaba bien (5305 «O»
 * y esquema 9995 EXP). Pero el resumen sólo emitía bloques para gravado,
 * exonerado e inafecto, de modo que la base exportada entraba en el importe del
 * documento sin que ningún `TaxSubtotal` la declarase: el mismo descuadre que
 * en las notas, por la misma causa --los códigos estaban escritos a mano en tres
 * sitios y al añadir uno nuevo se olvidó el cuarto--.
 */
describe('CpeXmlBuilder — exportación en el resumen del comprobante', () => {
  const builder = new CpeXmlBuilder();

  const facturaExportacion = () =>
    ({
      tipo_documento: '01',
      serie: 'F001',
      numero: 7,
      ruc_emisor: '20123456786',
      razon_social_emisor: 'DEMO COMERCIAL SAC',
      tipo_documento_receptor: '6',
      documento_receptor: '20600000013',
      razon_social_receptor: 'CLIENTE DEL EXTERIOR',
      moneda: 'PEN',
      total_gravadas: 0,
      total_exportacion: 500,
      total_igv: 0,
      total_venta: 500,
      items: [
        {
          cantidad: 1,
          descripcion: 'Mercancía exportada',
          unidad_medida: 'NIU',
          valor_unitario: 500,
          valor_venta: 500,
          precio_venta: 500,
          igv: 0,
          total: 500,
          tipo_afectacion_igv: AFECTACION_IGV.EXPORTACION,
        },
      ],
    }) as unknown as CreateFacturaDto;

  it('declara la base exportada con su esquema 9995', () => {
    const xml = builder.generateXmlContent(facturaExportacion());
    const cabecera = xml.split('<cac:InvoiceLine>')[0];
    const subtotales = [...cabecera.matchAll(/<cac:TaxSubtotal>[\s\S]*?<\/cac:TaxSubtotal>/g)].map((m) => m[0]);

    const exportacion = subtotales.find((s) => s.includes('9995'));
    expect(exportacion).toBeDefined();
    expect(exportacion).toMatch(/<cbc:TaxableAmount[^>]*>500\.00</);
    expect(exportacion).toContain('EXP');
  });

  it('el importe del documento sigue cuadrando con la línea', () => {
    const xml = builder.generateXmlContent(facturaExportacion());
    const valorDe = (etiqueta: string) => {
      const m = xml.match(new RegExp(`<cbc:${etiqueta}[^>]*>([^<]+)`));
      return m ? Number(m[1]) : null;
    };

    expect(valorDe('LineExtensionAmount')).toBe(500);
    expect(valorDe('PayableAmount')).toBe(500);
  });
});

/**
 * Los importes del XML son siempre positivos.
 *
 * Una nota de crédito puede llegar con los totales en negativo --es una
 * devolución--, y las líneas ya lo normalizaban con `Math.abs`. La cabecera lo
 * hacía con `formatAbsAmount`. Al pasar la cabecera a los ayudantes comunes hay
 * que conservar esa normalización: SUNAT no admite importes negativos, el signo
 * lo lleva el tipo de documento.
 */
describe('CpeXmlBuilder — una nota con totales negativos', () => {
  const builder = new CpeXmlBuilder();

  it('emite importes positivos en el resumen', () => {
    const xml = builder.generateXmlContent({
      tipo_documento: '07',
      serie: 'FC01',
      numero: 9,
      ruc_emisor: '20123456786',
      razon_social_emisor: 'DEMO COMERCIAL SAC',
      tipo_documento_receptor: '6',
      documento_receptor: '20600000013',
      razon_social_receptor: 'CLIENTE SAC',
      moneda: 'PEN',
      documento_referencia_id: 'F001-00000001',
      documento_referencia_tipo: '01',
      total_gravadas: -100,
      total_exoneradas: -50,
      total_igv: -18,
      total_venta: -168,
      items: [
        {
          cantidad: -1,
          descripcion: 'Devolución gravada',
          unidad_medida: 'NIU',
          valor_unitario: -100,
          valor_venta: -100,
          precio_venta: -118,
          igv: -18,
          total: -118,
          tipo_afectacion_igv: AFECTACION_IGV.GRAVADO,
        },
      ],
    } as unknown as CreateFacturaDto);

    expect(xml).not.toMatch(/<cbc:(TaxableAmount|TaxAmount|LineExtensionAmount|PayableAmount|TaxInclusiveAmount)[^>]*>-/);
    expect(xml).toMatch(/<cbc:LineExtensionAmount[^>]*>150\.00</);
  });
});

