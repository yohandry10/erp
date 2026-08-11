import * as crypto from 'crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CpeRegistrationService } from './cpe-registration.service';
import { DesktopSignedCpeDto } from './dto/desktop-signed-cpe.dto';

describe('CpeRegistrationService - snapshot desktop 476', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
 <cbc:ID>F476-00000001</cbc:ID>
 <cbc:IssueDate>2026-08-11</cbc:IssueDate>
 <cbc:InvoiceTypeCode>01</cbc:InvoiceTypeCode>
 <cbc:DocumentCurrencyCode>PEN</cbc:DocumentCurrencyCode>
 <cac:AccountingSupplierParty><cac:Party>
  <cac:PartyIdentification><cbc:ID schemeID="6">20131312955</cbc:ID></cac:PartyIdentification>
  <cac:PartyLegalEntity><cbc:RegistrationName>Empresa QA 476</cbc:RegistrationName></cac:PartyLegalEntity>
 </cac:Party></cac:AccountingSupplierParty>
 <cac:AccountingCustomerParty><cac:Party>
  <cac:PartyIdentification><cbc:ID schemeID="6">20111111111</cbc:ID></cac:PartyIdentification>
  <cac:PartyLegalEntity><cbc:RegistrationName>Cliente Desktop</cbc:RegistrationName></cac:PartyLegalEntity>
 </cac:Party></cac:AccountingCustomerParty>
 <cac:TaxTotal><cbc:TaxAmount currencyID="PEN">18.00</cbc:TaxAmount></cac:TaxTotal>
 <cac:LegalMonetaryTotal>
  <cbc:LineExtensionAmount currencyID="PEN">100.00</cbc:LineExtensionAmount>
  <cbc:PayableAmount currencyID="PEN">118.00</cbc:PayableAmount>
 </cac:LegalMonetaryTotal>
 <cac:InvoiceLine>
  <cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="NIU">1</cbc:InvoicedQuantity>
  <cbc:LineExtensionAmount currencyID="PEN">100.00</cbc:LineExtensionAmount>
  <cac:TaxTotal><cbc:TaxAmount currencyID="PEN">18.00</cbc:TaxAmount></cac:TaxTotal>
  <cac:Item><cbc:Description>Item QA</cbc:Description>
   <cac:SellersItemIdentification><cbc:ID>ITEM1</cbc:ID></cac:SellersItemIdentification>
  </cac:Item>
  <cac:Price><cbc:PriceAmount currencyID="PEN">118.00</cbc:PriceAmount></cac:Price>
 </cac:InvoiceLine>
</Invoice>`;

  const validPayload = (): DesktopSignedCpeDto => ({
    local_fiscal_id: 'local-fiscal-47600000-0000-4760-8000-000000000001',
    idempotency_key: 'desktop.invoice.476',
    tipo_documento: '01', serie: 'F476', numero: 1,
    signed_xml: xml,
    hash: crypto.createHash('sha256').update(xml, 'utf8').digest('base64'),
    fecha_emision: '2026-08-11', source_type: 'documento', source_id: 'local-476',
    documento_receptor: '20111111111', tipo_documento_receptor: '6',
    razon_social_receptor: 'Cliente Desktop', moneda: 'PEN',
    items: [{
      codigo: 'ITEM1', descripcion: 'Item QA', unidad: 'NIU', cantidad: 1,
      precio_unitario: 118, valor_venta: 100, igv: 18, precio_venta: 118,
    }],
    total_gravadas: 100, total_igv: 18, total_venta: 118,
  });

  function createService(signatureValid = true) {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        cpe: { id: 'cpe-desktop-476' }, documento_id: 'documento-desktop-476',
        repaired: false,
      },
      error: null,
    });
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          ruc: '20131312955', razon_social: 'Empresa QA 476', pais: 'PE',
          moneda_defecto: 'PEN', direccion_fiscal: 'Lima',
        },
        error: null,
      }),
    };
    const client = { from: jest.fn(() => query), rpc };
    const supabase = { getClient: jest.fn(() => client), insert: jest.fn(), update: jest.fn() };
    const cache = { onCpeCreated: jest.fn().mockResolvedValue(undefined) };
    const signer = { validateSignatureStrict: jest.fn(() => signatureValid) };
    const certificate = { getXmlSigner: jest.fn().mockResolvedValue(signer) };
    return {
      service: new CpeRegistrationService(supabase as any, cache as any, certificate as any),
      rpc, supabase, certificate, signer,
    };
  }

  it('el DTO rechaza key/items ausentes y tenant inyectado por el body', async () => {
    const raw = { ...validPayload(), idempotency_key: undefined, items: undefined, tenant_id: 'otro' };
    const dto = plainToInstance(DesktopSignedCpeDto, raw);
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining([
      'idempotency_key', 'items', 'tenant_id',
    ]));
  });

  it('exige actor autenticado antes de validar o persistir', async () => {
    const { service, rpc, certificate } = createService();

    await expect(service.registerDesktopSignedXml(validPayload(), 'tenant-476', ''))
      .rejects.toThrow('actor autenticado');
    expect(certificate.getXmlSigner).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rechaza hash distinto antes de consultar el certificado', async () => {
    const { service, rpc, certificate } = createService();

    await expect(service.registerDesktopSignedXml(
      { ...validPayload(), hash: 'A'.repeat(43) + '=' }, 'tenant-476', 'actor-476',
    )).rejects.toThrow('hash SHA-256');
    expect(certificate.getXmlSigner).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rechaza una firma XMLDSig criptográficamente inválida', async () => {
    const { service, rpc, signer } = createService(false);

    await expect(service.registerDesktopSignedXml(validPayload(), 'tenant-476', 'actor-476'))
      .rejects.toThrow('firma XMLDSig no es válida');
    expect(signer.validateSignatureStrict).toHaveBeenCalledWith(xml);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(['07', '08'] as const)('bloquea tipo %s y deriva al contrato 472', async (tipo) => {
    const { service, rpc, certificate } = createService();

    await expect(service.registerDesktopSignedXml(
      { ...validPayload(), tipo_documento: tipo }, 'tenant-476', 'actor-476',
    )).rejects.toThrow('contrato atómico 472');
    expect(certificate.getXmlSigner).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rechaza receptor/totales/items que no coinciden con el XML firmado', async () => {
    const { service, rpc } = createService();

    await expect(service.registerDesktopSignedXml(
      { ...validPayload(), documento_receptor: '20999999999' }, 'tenant-476', 'actor-476',
    )).rejects.toThrow('campos fiscales del XML no coinciden');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('un retry idéntico delega otra vez a 443/476 para reparar sin DML local', async () => {
    const { service, rpc, supabase } = createService();
    rpc
      .mockResolvedValueOnce({
        data: { cpe: { id: 'cpe-desktop-476' }, documento_id: 'documento-desktop-476', repaired: false },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { cpe: { id: 'cpe-desktop-476' }, documento_id: 'documento-desktop-476', repaired: true },
        error: null,
      });

    const first = await service.registerDesktopSignedXml(validPayload(), 'tenant-476', 'actor-476');
    const retry = await service.registerDesktopSignedXml(validPayload(), 'tenant-476', 'actor-476');

    expect(first.repaired).toBe(false);
    expect(retry.repaired).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(rpc).toHaveBeenCalledWith('registrar_cpe_desktop_tx', expect.objectContaining({
      p_tenant_id: 'tenant-476', p_actor_id: 'actor-476',
      p_idempotency_key: 'desktop.invoice.476',
    }));
    expect(supabase.insert).not.toHaveBeenCalled();
    expect(supabase.update).not.toHaveBeenCalled();
  });
});
