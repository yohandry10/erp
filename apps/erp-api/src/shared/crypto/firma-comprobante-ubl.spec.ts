import { XmlSigner } from '@erp-suite/crypto';

/**
 * Un comprobante UBL de SUNAT lleva **siempre** un bloque `<cac:Signature>`.
 * No es una firma: es el metadato que declara quién firma y dónde está la firma
 * real, y el esquema lo exige en toda factura y boleta.
 *
 * `validateSignatureStrict` buscaba "cualquier elemento llamado Signature", así
 * que contaba ese bloque como una segunda firma, exigía que hubiera exactamente
 * una y devolvía false. `cpe.service` aborta cuando eso pasa, de modo que
 * **ningún comprobante llegaba a persistirse**: en producción los 66 CPE
 * estaban todos en BORRADOR, ninguno firmado, y el POS respondía «La firma XML
 * generada no pudo validarse».
 *
 * Las pruebas que ya existían firmaban un XML mínimo, sin el bloque UBL, y por
 * eso pasaban en verde mientras la emisión real estaba rota. Esta firma un
 * comprobante con la forma que tiene de verdad.
 */

const COMPROBANTE_UBL = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions>
  <cbc:ID>B001-00000001</cbc:ID>
  <cac:Signature>
    <cbc:ID>SignatureSP</cbc:ID>
    <cac:SignatoryParty>
      <cac:PartyIdentification><cbc:ID>20123456786</cbc:ID></cac:PartyIdentification>
    </cac:SignatoryParty>
    <cac:DigitalSignatureAttachment>
      <cac:ExternalReference><cbc:URI>#SignatureSP</cbc:URI></cac:ExternalReference>
    </cac:DigitalSignatureAttachment>
  </cac:Signature>
</Invoice>`;

describe('firma de un comprobante UBL de SUNAT', () => {
  const firmador = new XmlSigner({ useDemoMode: true });

  it('valida la firma aunque el comprobante lleve el bloque UBL <cac:Signature>', () => {
    const firmado = firmador.signXml(COMPROBANTE_UBL);

    expect(firmador.validateSignatureStrict(firmado)).toBe(true);
  });

  it('el comprobante de partida ya trae un elemento llamado Signature que no es una firma', () => {
    // Control positivo: si esto dejara de ser cierto, la prueba de arriba
    // pasaría sin ejercitar el caso que se corrigió.
    const porNombre = COMPROBANTE_UBL.match(
      /<(?:[\w.-]+:)?Signature\b[\s\S]*?<\/(?:[\w.-]+:)?Signature>/g,
    );

    expect(porNombre).toHaveLength(1);
    expect(COMPROBANTE_UBL).not.toContain('http://www.w3.org/2000/09/xmldsig#');
  });

  it('sigue rechazando un XML con dos firmas XMLDSig de verdad', () => {
    const firmado = firmador.signXml(COMPROBANTE_UBL);
    const firma = firmado.match(
      /<(?:[\w.-]+:)?Signature\b[^>]*http:\/\/www\.w3\.org\/2000\/09\/xmldsig#[\s\S]*?<\/(?:[\w.-]+:)?Signature>/,
    );

    expect(firma).not.toBeNull();
    const duplicado = firmado.replace('</Invoice>', `${firma![0]}</Invoice>`);

    expect(firmador.validateSignatureStrict(duplicado)).toBe(false);
  });
});
