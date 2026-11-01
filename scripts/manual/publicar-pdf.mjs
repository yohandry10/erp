// Imprime a PDF el HTML que deja publicar_html.py, con el Chromium de Playwright del repositorio.
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = createRequire(path.join(root, 'apps/web/package.json'))('@playwright/test');
const carpeta = path.join(root, 'manual/publicado');
const navegador = await chromium.launch();
try {
  const pagina = await navegador.newPage();
  await pagina.goto(pathToFileURL(path.join(carpeta, 'MANUAL_DEL_PRODUCTO.html')).href);
  await pagina.pdf({
    path: path.join(carpeta, 'MANUAL_DEL_PRODUCTO.pdf'), format: 'A4', printBackground: true, displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="font-size:9px;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
  });
} finally {
  await navegador.close();
}
