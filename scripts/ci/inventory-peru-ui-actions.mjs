import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Relaciona navegación observada, controles visibles y llamadas declaradas.
// No inventa una asociación entre un botón y una petición ni acepta su ejecución.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ts = createRequire(path.join(root, 'apps/web/package.json'))('typescript');
const directory = path.resolve(root, process.argv[2] || '');
assert.ok(directory.startsWith(path.join(root, 'artifacts') + path.sep), 'Se requiere evidencia exportada dentro de artifacts');
const read = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
const run = read('run.json');
assert.equal(run.success, true);
assert.equal(run.scope, 'full');
assert.equal(run.remoteWrites, false);
const survey = read('module-survey-result.json');
const records = read('record-survey-result.json');
const navigation = read('peru-navigation-admin.json');
const routes = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/peru-route-inventory-20260923.json'), 'utf8'));
const api = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/peru-api-operation-matrix-20260930.json'), 'utf8'));
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const normal = route => route.replace(/\/$/, '');
const cache = new Map();
const methods = { get: 'GET', post: 'POST', put: 'PUT', patch: 'PATCH', del: 'DELETE', delete: 'DELETE', fetch: 'GET' };
function template(node) {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map(span => ':dynamic' + span.literal.text).join('');
  return null;
}
function resolveImport(file, name) {
  const base = name.startsWith('.') ? path.resolve(path.dirname(file), name)
    : name.startsWith('@/') ? path.join(root, 'apps/web', name.slice(2)) : null;
  if (!base || !base.startsWith(path.join(root, 'apps/web') + path.sep)) return null;
  return [base + '.tsx', base + '.ts', path.join(base, 'index.tsx'), path.join(base, 'index.ts')].find(candidate => fs.existsSync(candidate)) || null;
}
function sourceCalls(file, visited = new Set()) {
  if (visited.has(file)) return [];
  visited.add(file);
  if (cache.has(file)) return cache.get(file);
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const calls = [];
  const imports = [];
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const dependency = resolveImport(file, node.moduleSpecifier.text);
      if (dependency && /^apps\/web\/(app|components)\//.test(relative(dependency))) imports.push(dependency);
    }
    if (ts.isCallExpression(node)) {
      const verb = ts.isIdentifier(node.expression) ? node.expression.text
        : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : '';
      let endpoint = node.arguments[0] && template(node.arguments[0]);
      if (methods[verb] && endpoint?.includes('/api/')) {
        endpoint = endpoint.slice(endpoint.indexOf('/api/')).split('?')[0].replace(/\/$/, '');
        let method = methods[verb];
        if (verb === 'fetch' && node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1])) {
          const property = node.arguments[1].properties.find(item => ts.isPropertyAssignment(item) && item.name.getText(source) === 'method');
          method = property && template(property.initializer)?.toUpperCase() || 'GET';
        }
        calls.push({ method, endpoint, source: `${relative(file)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}` });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const dependency of imports) calls.push(...sourceCalls(dependency, visited));
  const unique = [...new Map(calls.map(call => [JSON.stringify(call), call])).values()];
  cache.set(file, unique);
  return unique;
}
const matching = (left, right) => {
  const a = normal(left).split('/'), b = normal(right).split('/');
  return a.length === b.length && a.every((part, index) => part.startsWith(':') || b[index].startsWith(':') || part === b[index]);
};
const result = {
  generated_at: new Date().toISOString(), evidence: relative(directory), excluded: ['Analytics'],
  operational_accounting_tax_reports_included: true, navigation,
  limitations: [
    'Los controles visibles no se marcan como ejecutados. La evidencia de API relacionada no acepta la acción UI.',
    'Las llamadas se extraen de literales y plantillas en páginas y componentes locales; wrappers de lib/hooks, endpoints calculados y menús/modales cerrados requieren inspección funcional.',
    'Las pantallas con registro usan los actores indicados por el ensayo; no se atribuyen al primer ADMIN.',
    'La disponibilidad depende del estado del registro, rol y configuración. Los contratos API sin vínculo a una página no se declaran ofrecidos por esta matriz.',
  ],
  routes: routes.filter(route => !route.route.startsWith('/dashboard/analytics')).map(route => {
    const staticProof = survey.routes.find(row => normal(row.route) === normal(route.route));
    const recordProof = records.findings.filter(row => normal('/dashboard/' + row.template) === normal(route.route));
    const controls = staticProof?.controls || recordProof.flatMap(row => row.controls || []);
    const calls = sourceCalls(path.join(root, route.source)).map(call => ({ ...call,
      contracts: api.operations.filter(operation => operation.method === call.method && matching(operation.endpoint, call.endpoint))
        .map(({ method, endpoint, result, verified_cases, pending_checks, defects }) => ({ method, endpoint, result, verified_cases, pending_checks, defects })),
    }));
    return { module: route.module, route: route.route, source: route.source,
      in_navigation: navigation.links.some(link => normal(link.href) === normal(route.route)),
      browser_evidence: staticProof ? { actor: survey.actor, status: staticProof.status, errors: staticProof.errors, expectedRestriction: staticProof.expectedRestriction, recovery: staticProof.recovery }
        : recordProof.map(row => ({ actor: `fixture tenant ${row.tenant}`, status: row.status, errors: row.errors })),
      result: staticProof?.expectedRestriction ? 'restricted_by_actual_permissions' : controls.length ? 'visible_controls_pending_functional_execution' : 'pending_browser_evidence',
      controls, declared_api_calls: calls,
      pending: ['ejecución de cada control y variante ofrecida', 'permisos y aislamiento de cada acción', 'persistencia y recuperación de errores', 'impresión/exportación/importación donde se ofrezca'],
    };
  }),
};
const output = path.join(root, 'artifacts/peru-ui-operation-matrix-20261002.json');
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ routes: result.routes.length, navigation_links: navigation.links.length,
  visible_controls: result.routes.reduce((total, route) => total + route.controls.length, 0), output: relative(output), full_acceptance: false }));
