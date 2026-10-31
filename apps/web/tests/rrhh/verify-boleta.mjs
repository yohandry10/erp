import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('../../lib/rrhh/boleta-planilla.ts', import.meta.url)), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { generarBoletaPlanillaHtml } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const data = { empresa: { razon_social: 'Empresa <UAT> & Perú', ruc: '20100070970' },
  empleados: { nombres: 'Elena', apellidos: 'Flores', numero_documento: '74638571', puesto: '<img src=x onerror=alert(1)>' },
  planillas: { periodo: '2026-07', estado: 'pagada', fecha_pago: '2026-10-07' },
  total_ingresos: 2054, total_descuentos: 156, total_aportes: 81, neto_pagar: 1898,
  metadata: { essalud: { bruto: 108, credito_eps: 27, neto: 81 } },
  empleado_planilla_conceptos: [
    ['001','Sueldo básico','ingreso',1200], ['006','Gratificación','ingreso',800],
    ['007','Bonificación extraordinaria','ingreso',54], ['104','ONP','descuento',156], ['201','EsSalud','aporte',81],
  ].map(([codigo,nombre,tipo,monto]) => ({ monto, conceptos_planilla: { codigo,nombre,metadata:{tipo} } })) };
const html = generarBoletaPlanillaHtml(data, { currencySymbol: 'S/', locale: 'es-PE', countryCode: 'PE' });
assert.match(html,/Empresa &lt;UAT&gt; &amp; Perú/);
assert.match(html,/RUC: 20100070970/);
assert.match(html,/Gratificación<\/td><td class="amount">S\/ 800.00/);
assert.match(html,/Bonificación extraordinaria<\/td><td class="amount">S\/ 54.00/);
assert.match(html,/ONP<\/td><td class="amount">S\/ 156.00/);
assert.match(html,/NETO A PAGAR: S\/ 1898.00/);
const aportes = html.indexOf('APORTES DEL EMPLEADOR');
assert.ok(html.indexOf('EsSalud</td>') > aportes);
assert.ok(!html.includes('descuento_essalud') && !html.includes('NEON SYSTEM'));
assert.ok(!html.includes('<img src=x') && html.includes('&lt;img src=x'));
assert.match(html,/Crédito EPS imputado: S\/ 27.00/);
console.log('PASS: identificación real, conceptos monetarios persistidos, aporte patronal separado, neto y escape HTML.');
