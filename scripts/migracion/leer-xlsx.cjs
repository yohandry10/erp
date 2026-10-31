// Lee la única hoja con datos de un libro Excel y la imprime en JSON. Va en un proceso
// aparte porque exceljs es asíncrono y el lector de extractos, síncrono.
const path = require('node:path');

const ExcelJS = require(require.resolve('exceljs', { paths: [path.join(__dirname, '../../apps/erp-api')] }));

const valorCelda = (v) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v !== 'object') return v;
  if ('result' in v) return valorCelda(v.result);
  if ('richText' in v) return v.richText.map((t) => t.text).join('');
  if ('text' in v) return valorCelda(v.text);
  return String(v);
};

(async () => {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(process.argv[2]);
  const hojas = libro.worksheets.filter((h) => h.actualRowCount > 0);
  if (hojas.length !== 1) {
    throw new Error(`Se esperaba una hoja con datos y hay ${hojas.length} (${hojas.map((h) => h.name).join(', ')}): guarde cada tabla en su archivo`);
  }
  const filas = [];
  hojas[0].eachRow({ includeEmpty: false }, (fila) => {
    const celdas = [];
    for (let c = 1; c <= hojas[0].actualColumnCount; c += 1) celdas.push(valorCelda(fila.getCell(c).value));
    filas.push(celdas);
  });
  process.stdout.write(JSON.stringify(filas));
})().catch((e) => {
  process.stderr.write(e.message);
  process.exit(1);
});
