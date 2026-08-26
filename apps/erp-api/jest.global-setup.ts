import * as fs from 'fs';
import * as path from 'path';

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

  if (fs.existsSync(destino)) return;

  const { generateDemoPfx } = require(
    path.resolve(__dirname, 'scripts/generate-demo-pfx.cjs'),
  ) as { generateDemoPfx: (destination: string) => void };
  generateDemoPfx(destino);
}
