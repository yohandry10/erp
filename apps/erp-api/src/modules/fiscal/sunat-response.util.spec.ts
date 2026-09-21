import AdmZip = require('adm-zip');
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { OseService } from '../ose/ose.service';
import { SunatFiscalService } from './sunat-fiscal.service';
import { OseApiFiscalService } from './ose-api-fiscal.service';
import { parseSunatCdr, parseSunatSoapResponse } from './sunat-response.util';

const cdrXml = (code = '0') => `<?xml version="1.0" encoding="UTF-8"?>
<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
 <cbc:Note>Observación &amp; detalle</cbc:Note>
 <cac:DocumentResponse><cac:Response><cbc:ResponseCode>${code}</cbc:ResponseCode>
 <cbc:Description>Resultado del documento</cbc:Description></cac:Response></cac:DocumentResponse>
</ApplicationResponse>`;

const zipCdr = (xml: string) => {
  const zip = new AdmZip();
  zip.addFile('R-20123456786-01-F001-1.xml', Buffer.from(xml));
  return zip.toBuffer();
};
const soap = (body: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>${body}</s:Body></s:Envelope>`;

describe('evidencia SUNAT del CDR', () => {
  it.each([OseService, SunatFiscalService])('preserva caracteres especiales de SOL al enviar y consultar en %p', (Service) => {
    const service = Object.create(Service.prototype);
    const config = { usuario: '20123456786USER', password: 'Clave&<local>"\'' };
    service.config = config;
    service.oseConfig = config;
    const send = Service === OseService
      ? service.buildZipSoapRequest(Buffer.from('zip'), 'archivo', 'sendBill', config)
      : service.buildSunatRequest(Buffer.from('zip'), 'archivo', 'sendBill');
    const query = service.buildStatusCdrRequest('20123456786', '01', 'F001', '1', config);
    for (const xml of [send, query]) {
      expect(XMLValidator.validate(xml)).toBe(true);
      const parsed = new XMLParser({ removeNSPrefix: true, parseTagValue: false }).parse(xml);
      expect(parsed.Envelope.Header.Security.UsernameToken.Password).toBe(config.password);
      expect(xml).not.toContain(config.password);
    }
  });

  it.each(['0', '2335', '2010'])('obtiene el resultado %s del XML y conserva el rechazo', (code) => {
    const cdr = zipCdr(cdrXml(code)).toString('base64');
    expect(parseSunatSoapResponse(soap(`<status><statusCode>0</statusCode><content>${cdr}</content></status>`)))
      .toMatchObject({ success: code === '0', codigoRespuesta: code, cdr, observaciones: ['Observación & detalle'] });
  });

  it.each([
    ['sin ResponseCode', cdrXml().replace('<cbc:ResponseCode>0</cbc:ResponseCode>', '')],
    ['código duplicado', cdrXml().replace('</cbc:ResponseCode>', '</cbc:ResponseCode><cbc:ResponseCode>2335</cbc:ResponseCode>')],
    ['código fuera de la respuesta', '<ApplicationResponse><ResponseCode>0</ResponseCode></ApplicationResponse>'],
    ['otro documento', '<Invoice><ResponseCode>0</ResponseCode></Invoice>'],
    ['XML truncado', cdrXml().slice(0, -15)],
    ['entidad externa', '<!DOCTYPE ApplicationResponse [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + cdrXml()],
  ])('no acepta un CDR %s', (_label, xml) => {
    expect(parseSunatCdr(zipCdr(xml).toString('base64'))).toBeNull();
  });

  it('rechaza un ZIP con CRC corrupto', () => {
    const zip = zipCdr(cdrXml());
    zip.writeUInt32LE(0, 14);
    expect(parseSunatCdr(zip.toString('base64'))).toBeNull();
  });

  it('lee ZIP con bandera data descriptor usando el directorio central', () => {
    const zip = zipCdr(cdrXml());
    const central = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    zip.writeUInt16LE(zip.readUInt16LE(6) | 8, 6);
    zip.writeUInt16LE(zip.readUInt16LE(central + 8) | 8, central + 8);
    zip.writeUInt32LE(0, 14);
    zip.writeUInt32LE(0, 18);
    zip.writeUInt32LE(0, 22);
    expect(parseSunatCdr(zip.toString('base64'))).toMatchObject({ success: true, codigoRespuesta: '0' });
  });

  it('limita el tamaño descomprimido y rechaza un ZIP ambiguo con dos XML', () => {
    const zip = zipCdr(cdrXml());
    const central = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    zip.writeUInt32LE(6 * 1024 * 1024, central + 24);
    expect(parseSunatCdr(zip.toString('base64'))).toBeNull();
    const multiple = new AdmZip(zipCdr(cdrXml()));
    multiple.addFile('rechazo.xml', Buffer.from(cdrXml('2335')));
    expect(parseSunatCdr(multiple.toBuffer().toString('base64'))).toBeNull();
  });

  it.each([
    '<applicationResponse>Q0RSX0JBU0U2NA==</applicationResponse>',
    '<status><statusCode>0</statusCode></status>',
    '<status><statusMessage>Aceptado</statusMessage></status>',
    '<status><statusCode>0</statusCode><content>Aceptado</content></status>',
  ])('no infiere aceptación de una respuesta sin CDR válido: %s', (body) => {
    expect(parseSunatSoapResponse(soap(body))).toMatchObject({ success: false, codigoRespuesta: '97' });
  });

  it('conserva el ticket como recepción asíncrona y el estado 98 como pendiente', () => {
    expect(parseSunatSoapResponse(soap('<ticket>1234567890</ticket>'))).toMatchObject({ success: true, ticket: '1234567890' });
    expect(parseSunatSoapResponse(soap('<status><statusCode>98</statusCode><statusMessage>En proceso</statusMessage></status>')))
      .toMatchObject({ success: false, codigoRespuesta: '98' });
  });

  it('reconoce fault SOAP con prefijo sin inferir aceptación de un CDR adjunto', () => {
    expect(parseSunatSoapResponse(soap('<s:Fault><s:faultstring>2335</s:faultstring></s:Fault>')))
      .toMatchObject({ success: false, codigoRespuesta: '2335' });
  });

  it.each([OseService, SunatFiscalService])('aplica la misma regla en el transporte %p', (Service) => {
    const cdr = zipCdr(cdrXml('2335')).toString('base64');
    const parser = (Service.prototype as any).parseSunatResponse;
    expect(parser.call(Object.create(Service.prototype), soap(`<applicationResponse>${cdr}</applicationResponse>`)))
      .toMatchObject({ success: false, codigoRespuesta: '2335' });
  });

  it.each([
    [{ codRespuesta: '0' }, false, '97'],
    [{ codRespuesta: '0', arcCdr: 'Q0RSX0JBU0U2NA==' }, false, '97'],
    [{ codRespuesta: '0', arcCdr: zipCdr(cdrXml('2335')).toString('base64') }, false, '2335'],
    [{ codRespuesta: '0', arcCdr: zipCdr(cdrXml()).toString('base64') }, true, '0'],
    [{ codRespuesta: '99', arcCdr: zipCdr(cdrXml()).toString('base64') }, false, '97'],
    [{ codRespuesta: '98' }, false, '98'],
  ])('valida el CDR también al consultar un ticket GRE REST (%#)', (payload, success, codigoRespuesta) => {
    const service = Object.create(OseService.prototype);
    expect(service.parseGreRestTicketResponse(payload)).toMatchObject({ success, codigoRespuesta });
  });

  it.each([
    [200, {}, false, '97'],
    [200, { success: true }, false, '97'],
    [200, { codigo: '0' }, false, '97'],
    [200, { codigo: '2335', message: 'Documento rechazado' }, false, '2335'],
    [200, { success: true, cdrBase64: 'Q0RSX0JBU0U2NA==' }, false, '97'],
    [200, { success: true, cdrBase64: zipCdr(cdrXml('2335')).toString('base64') }, false, '2335'],
    [200, { cdrBase64: zipCdr(cdrXml()).toString('base64') }, true, '0'],
    [503, { success: true, cdrBase64: zipCdr(cdrXml()).toString('base64') }, false, 'HTTP_503'],
  ])('el proveedor OSE API tampoco puede aceptar sólo por HTTP (%#)', async (status, data, success, codigoRespuesta) => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: status === 200, status, json: async () => data } as Response);
    try {
      const response = await new OseApiFiscalService().consultarEstado({} as any, { url: 'https://ose.example.invalid/status', authTipo: 'NONE' });
      expect(response).toMatchObject({ success, codigoRespuesta });
      expect(fetchSpy).toHaveBeenCalledWith('https://ose.example.invalid/status', expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }));
    } finally { fetchSpy.mockRestore(); }
  });
});
