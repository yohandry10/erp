const fs = require('node:fs');
const path = require('node:path');
const forge = require('node-forge');

const TEST_RUC = '12345678910';
const PASSWORD = '12345678910';

const destination = path.resolve(process.argv[2] || 'certs/demo.pfx');
fs.mkdirSync(path.dirname(destination), { recursive: true });

const keys = forge.pki.rsa.generateKeyPair(2048);
const certificate = forge.pki.createCertificate();
certificate.publicKey = keys.publicKey;
certificate.serialNumber = '01';
certificate.validity.notBefore = new Date();
certificate.validity.notAfter = new Date();
certificate.validity.notAfter.setFullYear(
  certificate.validity.notBefore.getFullYear() + 10,
);

const attributes = [
  { name: 'commonName', value: `CERTIFICADO DE PRUEBA ${TEST_RUC}` },
  { name: 'countryName', value: 'PE' },
  { name: 'organizationName', value: 'ERP SUITE PRUEBAS' },
  { type: '2.5.4.5', value: TEST_RUC },
];
certificate.setSubject(attributes);
certificate.setIssuer(attributes);
certificate.sign(keys.privateKey, forge.md.sha256.create());

const pkcs12 = forge.pkcs12.toPkcs12Asn1(
  keys.privateKey,
  [certificate],
  PASSWORD,
  { algorithm: '3des' },
);
const der = forge.asn1.toDer(pkcs12).getBytes();
fs.writeFileSync(destination, Buffer.from(der, 'binary'), { mode: 0o600 });
