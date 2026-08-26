const fs = require('node:fs');
const path = require('node:path');
const forge = require('node-forge');

// Debe coincidir con el RUC inmutable creado por el RPC de demo PE.
const TEST_RUC = '20123456786';
const PASSWORD = '12345678910';
const DEMO_CERTIFICATE_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

function createDemoCertificateValidity(now = new Date()) {
  const notBefore = new Date(now.getTime() - DEMO_CERTIFICATE_CLOCK_SKEW_MS);
  const notAfter = new Date(now);
  notAfter.setUTCFullYear(notAfter.getUTCFullYear() + 10);
  return { notBefore, notAfter };
}

function generateDemoPfx(destinationPath) {
  const destination = path.resolve(destinationPath || 'certs/demo.pfx');
  fs.mkdirSync(path.dirname(destination), { recursive: true });

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = '01';
  const validity = createDemoCertificateValidity();
  certificate.validity.notBefore = validity.notBefore;
  certificate.validity.notAfter = validity.notAfter;

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
}

if (require.main === module) {
  generateDemoPfx(process.argv[2]);
}

module.exports = {
  createDemoCertificateValidity,
  DEMO_CERTIFICATE_CLOCK_SKEW_MS,
  generateDemoPfx,
};
