import * as fs from 'fs';
import * as path from 'path';

const RUC_DEMO = '20123456786';
const RUC_DEMO_PASSWORD = '12345678910';

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

export default async function globalSetup(): Promise<void> {
  const raizWorkspace = path.resolve(__dirname, '..', '..');
  const directorio = path.join(raizWorkspace, 'certs');
  const destino = path.join(directorio, 'demo.pfx');

  const { generateDemoPfx } = require(
    path.resolve(__dirname, 'scripts/generate-demo-pfx.cjs'),
  ) as { generateDemoPfx: (destination: string) => void };

  // No basta con que el fichero exista: uno viejo o de otro RUC pasa la
  // comprobacion de existencia y luego **rompe siete suites** con un error que
  // no se parece a su causa («el certificado no contiene el RUC esperado»).
  // Paso una tarde con eso. Si el que hay no sirve, se rehace.
  if (fs.existsSync(destino) && certificadoUtilizable(destino)) return;

  generateDemoPfx(destino);
}

/**
 * Comprueba que el PFX se abre con la contrasena de la demo y pertenece al RUC
 * que esperan las pruebas. Cualquier fallo se trata como «no sirve».
 */
function certificadoUtilizable(ruta: string): boolean {
  try {
    const forge = require('node-forge');
    const p12Asn1 = forge.asn1.fromDer(fs.readFileSync(ruta).toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, RUC_DEMO_PASSWORD);
    const bolsas = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];
    const certificado = bolsas?.[0]?.cert;
    if (!certificado) return false;
    return forge.pki
      .certificateToPem(certificado)
      .length > 0 && String(certificado.subject.attributes.map((a: any) => a.value).join(' '))
      .includes(RUC_DEMO);
  } catch {
    return false;
  }
}
