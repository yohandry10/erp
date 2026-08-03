import * as fs from 'fs';
import * as path from 'path';
import * as forge from 'node-forge';

/**
 * Nueve pruebas de firma (XmlSigner, OSE, SUNAT fiscal y el seed demo) leen
 * `certs/demo.pfx`. Ese directorio esta en .gitignore —y debe estarlo, son claves
 * privadas—, asi que en CI no existe y las nueve fallaban. La suite solo estaba
 * verde en las maquinas que tenian el certificado a mano: un verde que no
 * significaba nada fuera de ellas.
 *
 * Aqui se fabrica uno autofirmado y desechable cuando falta. No es un secreto:
 * se genera en cada arranque, sirve solo para ejercitar el camino de firma, y
 * nunca sustituye al certificado real de produccion.
 */

const RUC_DE_PRUEBA = '12345678910';
const CLAVE = '12345678910';

export default async function globalSetup(): Promise<void> {
  const raizWorkspace = path.resolve(__dirname, '..', '..');
  const directorio = path.join(raizWorkspace, 'certs');
  const destino = path.join(directorio, 'demo.pfx');

  if (fs.existsSync(destino)) return;

  fs.mkdirSync(directorio, { recursive: true });

  const par = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = par.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

  // El RUC va en el subject porque es de ahi de donde el firmador comprueba la
  // titularidad del certificado.
  const atributos = [
    { name: 'commonName', value: `CERTIFICADO DE PRUEBA ${RUC_DE_PRUEBA}` },
    { name: 'countryName', value: 'PE' },
    { name: 'organizationName', value: 'ERP SUITE PRUEBAS' },
    // OID explicito: node-forge no reconoce 'SERIALNUMBER' por nombre corto.
    { type: '2.5.4.5', value: RUC_DE_PRUEBA },
  ];
  cert.setSubject(atributos);
  cert.setIssuer(atributos);
  cert.sign(par.privateKey, forge.md.sha256.create());

  const p12 = forge.pkcs12.toPkcs12Asn1(par.privateKey, [cert], CLAVE, {
    algorithm: '3des',
  });
  const der = forge.asn1.toDer(p12).getBytes();

  fs.writeFileSync(destino, Buffer.from(der, 'binary'));
}
