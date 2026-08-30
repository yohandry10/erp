import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import * as forge from 'node-forge';
import { DocumentoElectronico } from '../src/shared/integration/fiscal.interfaces';
import { DianSignerService } from '../src/modules/fiscal/colombia/dian-signer.service';
import {
  DianApplicationResponseInput,
  DianEventResponseCode,
  DianXmlBuilderService,
} from '../src/modules/fiscal/colombia/dian-xml-builder.service';

const PASSWORD = 'ci-dian-contract-only';

function bogotaClock(now: Date): { date: string; time: string } {
  const local = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString();
  return { date: local.slice(0, 10), time: `${local.slice(11, 19)}-05:00` };
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function contractCertificate(
  now: Date,
  subject: { serial: string; commonName: string; organizationName: string },
): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = subject.serial;
  certificate.validity.notBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  certificate.validity.notAfter = new Date(now.getTime() + 366 * 24 * 60 * 60 * 1000);
  const attributes = [
    { name: 'commonName', value: subject.commonName },
    { name: 'organizationName', value: subject.organizationName },
    { name: 'countryName', value: 'CO' },
  ];
  certificate.setSubject(attributes);
  certificate.setIssuer(attributes);
  certificate.setExtensions([{
    name: 'keyUsage', critical: true, digitalSignature: true, nonRepudiation: true,
  }]);
  certificate.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [certificate], PASSWORD, {
    algorithm: '3des', friendlyName: 'DIAN contract CI',
  });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
}

function baseDocument(now: Date): DocumentoElectronico {
  const clock = bogotaClock(now);
  const validFrom = dateOnly(new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000));
  const validTo = dateOnly(new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000));
  return {
    id: 'ci-dian-invoice',
    tipoDocumento: '01',
    serie: 'FV',
    numero: '125',
    fechaEmision: `${clock.date}T${clock.time}`,
    moneda: 'COP',
    emisor: {
      tipoDocumento: '31',
      numeroDocumento: '9001234568',
      razonSocial: 'EMISOR CONTRATO CI S.A.S.',
      direccion: 'Carrera 7 72 41',
      ciudad: 'Bogotá D.C.',
      departamento: 'Bogotá D.C.',
      codigoUbigeo: '11001',
      codigoDepartamento: '11',
      regimenFiscal: 'O-13',
      tipoContribuyente: '1',
    },
    receptor: {
      tipoDocumento: '31',
      numeroDocumento: '9001082813',
      razonSocial: 'ADQUIRENTE CONTRATO CI S.A.S.',
      direccion: 'Calle 100 10 20',
      ciudad: 'Bogotá D.C.',
      departamento: 'Bogotá D.C.',
      codigoUbigeo: '11001',
      codigoDepartamento: '11',
      dianTaxProfile: {
        profile: 'ADQUIRIENTE_NIT_B2B',
        taxLevelCode: 'O-99',
        taxLevelListName: '04',
        taxSchemeId: '01',
        taxSchemeName: 'IVA',
      },
    },
    subtotal: 100,
    totalGravadas: 100,
    totalImpuestos: 19,
    importeTotal: 119,
    tasaImpuesto: 0.19,
    formaPago: 'CONTADO',
    medioPago: '10',
    items: [{
      descripcion: 'Servicio de integración',
      cantidad: 1,
      unidadMedida: 'NIU',
      precioUnitario: 100,
      valorVenta: 100,
      igv: 19,
      tasaIgv: 0.19,
      codigoProducto: '81111500',
      dianTaxCategory: 'GRAVADO',
    }],
    dianContext: {
      environmentId: '2',
      software: { id: 'SOFTWARE-CONTRATO-CI', pin: 'PIN-CONTRATO-CI' },
      authorization: {
        number: '18760000001',
        prefix: 'FV',
        rangeFrom: 1,
        rangeTo: 50000,
        validFrom,
        validTo,
        technicalKey: 'CLAVE-TECNICA-CONTRATO-CI',
      },
      taxes: { iva: 19, inc: 0, ica: 0 },
    },
  };
}

async function main(): Promise<void> {
  const output = resolve(process.argv[2] || 'tmp/dian-official-contract');
  mkdirSync(output, { recursive: true });
  const now = new Date();
  const clock = bogotaClock(now);
  const builder = new DianXmlBuilderService();
  const signer = new DianSignerService();
  const issuerCertificate = contractCertificate(now, {
    serial: '2026082901',
    commonName: '900123456-8 EMISOR CONTRATO CI',
    organizationName: 'EMISOR CONTRATO CI S.A.S.',
  });
  const buyerCertificate = contractCertificate(now, {
    serial: '2026082902',
    commonName: '900108281-3 ADQUIRENTE CONTRATO CI',
    organizationName: 'ADQUIRENTE CONTRATO CI S.A.S.',
  });
  const signature = (certificateBuffer: Buffer, signatureId: string) => ({
    certificateBuffer,
    certificatePassword: PASSWORD,
    signatureId,
    signingTime: now,
    signerRole: 'supplier' as const,
  });

  const invoice = baseDocument(now);
  const creditNote: DocumentoElectronico = {
    ...baseDocument(now),
    id: 'ci-dian-credit-note',
    tipoDocumento: '91',
    serie: 'NC',
    numero: '1',
    dianContext: {
      ...baseDocument(now).dianContext!,
      authorization: undefined,
      operationCode: '20',
    },
    documentoReferencia: {
      tipo: '01',
      numero: 'FV125',
      fecha: clock.date,
      uuid: 'a'.repeat(96),
      uuidSchemeName: 'CUFE-SHA384',
    },
    dianDiscrepancy: { responseCode: '1', description: 'Devolución parcial' },
  };
  const debitNote: DocumentoElectronico = {
    ...baseDocument(now),
    id: 'ci-dian-debit-note',
    tipoDocumento: '92',
    serie: 'ND',
    numero: '1',
    dianContext: {
      ...baseDocument(now).dianContext!,
      authorization: undefined,
      operationCode: '30',
    },
    documentoReferencia: {
      tipo: '01',
      numero: 'FV125',
      fecha: clock.date,
      uuid: 'a'.repeat(96),
      uuidSchemeName: 'CUFE-SHA384',
    },
    dianDiscrepancy: { responseCode: '2', description: 'Intereses causados' },
  };

  const signedInvoice = await signer.firmarXML(
    await builder.generarFacturaElectronica(invoice),
    signature(issuerCertificate, 'xmldsig-ci-invoice'),
  );
  const signedCreditNote = await signer.firmarXML(
    await builder.generarNotaCredito(creditNote),
    signature(issuerCertificate, 'xmldsig-ci-credit-note'),
  );
  const signedDebitNote = await signer.firmarXML(
    await builder.generarNotaDebito(debitNote),
    signature(issuerCertificate, 'xmldsig-ci-debit-note'),
  );
  const eventBase: Omit<DianApplicationResponseInput,
  'id' | 'responseCode' | 'responseDescription'> = {
    issueDate: clock.date,
    issueTime: clock.time,
    environmentId: '2',
    softwareId: 'SOFTWARE-CONTRATO-CI',
    softwarePin: 'PIN-CONTRATO-CI',
    sender: { type: '31', number: '9001082813', name: 'ADQUIRENTE CONTRATO CI S.A.S.' },
    receiver: { type: '31', number: '9001234568', name: 'EMISOR CONTRATO CI S.A.S.' },
    referencedDocumentId: 'FV125',
    referencedDocumentTypeCode: '01',
    referencedDocumentUuid: 'a'.repeat(96),
  };
  const events: Record<DianEventResponseCode, DianApplicationResponseInput> = {
    '030': {
      ...eventBase,
      id: 'AR0300000001',
      responseCode: '030',
      responseDescription: 'Acuse de recibo de Factura Electrónica de Venta',
      issuerPerson: {
        identity: { type: '13', number: '1020304050' },
        firstName: 'Andrea',
        familyName: 'Gómez',
        jobTitle: 'Analista de recepción',
        organizationDepartment: 'Compras',
      },
    },
    '031': {
      ...eventBase,
      id: 'AR0310000001',
      responseCode: '031',
      responseDescription: 'Reclamo de la Factura Electrónica de Venta',
      claimReason: { listId: '02', name: 'Mercancía no entregada totalmente' },
    },
    '032': {
      ...eventBase,
      id: 'AR0320000001',
      responseCode: '032',
      responseDescription: 'Recibo del bien y/o prestación del servicio',
      issuerPerson: {
        identity: { type: '13', number: '1020304050' },
        firstName: 'Andrea',
        familyName: 'Gómez',
        jobTitle: 'Analista de recepción',
        organizationDepartment: 'Compras',
      },
    },
    '033': {
      ...eventBase,
      id: 'AR0330000001',
      responseCode: '033',
      responseDescription: 'Aceptación expresa',
    },
    '034': {
      ...eventBase,
      id: 'AR0340000001',
      receiver: {
        type: '31',
        number: '8001972684',
        name: 'Unidad Administrativa Especial Dirección de Impuestos y Aduanas Nacionales',
      },
      responseCode: '034',
      responseDescription: 'Aceptación tácita',
      swornStatement: [
        'Manifiesto bajo la gravedad de juramento que transcurridos 3 días hábiles',
        'siguientes a la recepción del bien o servicio, el adquirente no manifestó',
        'expresamente aceptación, rechazo ni reclamo de la factura referenciada.',
      ].join(' '),
    },
  };
  const signedEvents = Object.fromEntries(await Promise.all(
    (Object.entries(events) as [DianEventResponseCode, DianApplicationResponseInput][])
      .map(async ([code, event]) => [
        code,
        await signer.firmarXML(
          builder.generarApplicationResponse(event),
          signature(
            code === '034' ? issuerCertificate : buyerCertificate,
            `xmldsig-ci-application-response-${code}`,
          ),
        ),
      ]),
  )) as Record<DianEventResponseCode, string>;
  const attachedDocument = await signer.firmarXML(
    builder.generarAttachedDocument(invoice, signedInvoice, signedEvents['030']),
    signature(issuerCertificate, 'xmldsig-ci-attached-document'),
  );

  const files: Record<string, string> = {
    'invoice.xml': signedInvoice,
    'credit-note.xml': signedCreditNote,
    'debit-note.xml': signedDebitNote,
    ...Object.fromEntries(Object.entries(signedEvents).map(([code, xml]) => [
      `application-response-${code}.xml`,
      xml,
    ])),
    'attached-document.xml': attachedDocument,
  };
  for (const [name, xml] of Object.entries(files)) {
    writeFileSync(resolve(output, name), xml, 'utf8');
  }
  writeFileSync(resolve(output, 'generated.json'), JSON.stringify({
    generatedAt: now.toISOString(),
    files: Object.keys(files),
  }, null, 2), 'utf8');
  process.stdout.write(`DIAN contract fixtures generated in ${output}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
