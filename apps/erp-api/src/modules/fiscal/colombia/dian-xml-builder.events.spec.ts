import {
  DianApplicationResponseInput,
  DianXmlBuilderService,
} from './dian-xml-builder.service';

const PROFILE = 'DIAN 2.1: ApplicationResponse de Factura Electrónica de Venta';
const DIAN_NAME = 'Unidad Administrativa Especial Dirección de Impuestos y Aduanas Nacionales';
const SWORN = [
  'Manifiesto bajo la gravedad de juramento que transcurridos 3 días hábiles',
  'siguientes a la recepción del bien o servicio, el adquirente no manifestó',
  'aceptación, rechazo ni reclamo de la factura referenciada.',
].join(' ');

function baseInput(
  override: Partial<DianApplicationResponseInput> = {},
): DianApplicationResponseInput {
  return {
    id: 'AR0330000001',
    issueDate: '2026-08-29',
    issueTime: '10:30:00-05:00',
    environmentId: '2',
    softwareId: 'SOFTWARE-DIAN-01',
    softwarePin: 'PIN-DIAN-01',
    sender: { type: '31', number: '9001082813', name: 'ADQUIRENTE CO S.A.S.' },
    receiver: { type: '31', number: '9001234568', name: 'EMISOR CO S.A.S.' },
    responseCode: '033',
    responseDescription: 'Aceptación expresa',
    referencedDocumentId: 'FV125',
    referencedDocumentTypeCode: '01',
    referencedDocumentUuid: 'a'.repeat(96),
    ...override,
  };
}

const RESPONSIBLE = {
  identity: { type: '13', number: '1020304050' },
  firstName: 'Andrea',
  familyName: 'Gómez',
  jobTitle: 'Analista de recepción',
  organizationDepartment: 'Compras',
};

describe('DianXmlBuilderService eventos RADIAN 030-034', () => {
  const service = new DianXmlBuilderService();

  it.each([
    ['030', 'Acuse de recibo de Factura Electrónica de Venta'],
    ['032', 'Recibo del bien y/o prestación del servicio'],
  ] as const)('emite %s con responsable explícito', (responseCode, responseDescription) => {
    const xml = service.generarApplicationResponse(baseInput({
      id: `AR${responseCode}0000001`, responseCode, responseDescription,
      issuerPerson: RESPONSIBLE,
    }));

    expect(xml).toContain(`<cbc:ProfileID>${PROFILE}</cbc:ProfileID>`);
    expect(xml).toContain(`<cbc:ResponseCode>${responseCode}</cbc:ResponseCode>`);
    expect(xml).toContain('<cac:IssuerParty>');
    expect(xml).toContain('<cbc:ID schemeName="13" schemeAgencyID="195">1020304050</cbc:ID>');
    expect(xml).toContain('<cbc:FirstName>Andrea</cbc:FirstName>');
    expect(xml).toContain('<cbc:OrganizationDepartment>Compras</cbc:OrganizationDepartment>');
  });

  it('emite 031 con el motivo y código del catálogo de reclamos', () => {
    const xml = service.generarApplicationResponse(baseInput({
      id: 'AR0310000001',
      responseCode: '031',
      responseDescription: 'Reclamo de la Factura Electrónica de Venta',
      claimReason: { listId: '02', name: 'Mercancía no entregada totalmente' },
      notes: ['Reclamo registrado por el adquirente'],
    }));

    expect(xml).toContain(
      '<cbc:ResponseCode listID="02" name="Mercancía no entregada totalmente">031</cbc:ResponseCode>',
    );
    expect(xml).toContain('<cbc:Note>Reclamo registrado por el adquirente</cbc:Note>');
  });

  it('emite 033 sin inventar responsable, motivo ni declaración', () => {
    const xml = service.generarApplicationResponse(baseInput());

    expect(xml).toContain('<cbc:ResponseCode>033</cbc:ResponseCode>');
    expect(xml).not.toContain('<cac:IssuerParty>');
    expect(xml).not.toContain('listID=');
    expect(xml).not.toContain('<cbc:Note>');
  });

  it('emite 034 sólo hacia DIAN y con declaración juramentada explícita', () => {
    const xml = service.generarApplicationResponse(baseInput({
      id: 'AR0340000001',
      receiver: { type: '31', number: '8001972684', name: DIAN_NAME },
      responseCode: '034',
      responseDescription: 'Aceptación tácita',
      swornStatement: SWORN,
    }));

    expect(xml).toContain(`<cbc:RegistrationName>${DIAN_NAME}</cbc:RegistrationName>`);
    expect(xml).toContain(
      '<cbc:CompanyID schemeID="4" schemeName="31" schemeAgencyID="195">800197268</cbc:CompanyID>',
    );
    expect(xml).toContain(`<cbc:Note>${SWORN}</cbc:Note>`);
    expect(xml).toContain('<cbc:ResponseCode>034</cbc:ResponseCode>');
  });

  it('falla cerrado cuando 030/032 no identifican al responsable', () => {
    expect(() => service.generarApplicationResponse(baseInput({
      responseCode: '030', responseDescription: 'Acuse de recibo',
    }))).toThrow('evento 030 requiere issuerPerson');
    expect(() => service.generarApplicationResponse(baseInput({
      responseCode: '032', responseDescription: 'Recibo del bien',
    }))).toThrow('evento 032 requiere issuerPerson');
  });

  it('falla cerrado cuando 031 no declara un motivo válido', () => {
    expect(() => service.generarApplicationResponse(baseInput({
      responseCode: '031', responseDescription: 'Reclamo',
    }))).toThrow('evento 031 requiere claimReason');
    expect(() => service.generarApplicationResponse(baseInput({
      responseCode: '031', responseDescription: 'Reclamo',
      claimReason: { listId: '09' as '01', name: 'Fuera de catálogo' },
    }))).toThrow('catálogo 01-04');
  });

  it('falla cerrado cuando 034 no se dirige a DIAN o carece de declaración válida', () => {
    expect(() => service.generarApplicationResponse(baseInput({
      responseCode: '034', responseDescription: 'Aceptación tácita', swornStatement: SWORN,
    }))).toThrow('ReceiverParty del evento 034');
    expect(() => service.generarApplicationResponse(baseInput({
      responseCode: '034', responseDescription: 'Aceptación tácita',
      receiver: { type: '31', number: '8001972684', name: DIAN_NAME },
      swornStatement: 'Aceptación tácita solicitada',
    }))).toThrow('gravedad de juramento por 3 días hábiles');
  });

  it('rechaza códigos, tipo de referencia y CUFE fuera del contrato oficial', () => {
    expect(() => service.generarApplicationResponse(baseInput({
      responseCode: '099' as '033',
    }))).toThrow('evento RADIAN no soportado');
    expect(() => service.generarApplicationResponse(baseInput({
      referencedDocumentTypeCode: '91',
    }))).toThrow('sólo referencian factura tipo 01');
    expect(() => service.generarApplicationResponse(baseInput({
      referencedDocumentUuid: 'no-es-cufe',
    }))).toThrow('SHA-384 hexadecimal');
  });
});
