import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Inventario del contrato declarado. No convierte presencia de código en aceptación.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requireRoot = createRequire(path.join(root, 'package.json'));
const ts = requireRoot('typescript');
const files = execFileSync('rg', ['--files', 'apps/erp-api/src', '-g', '*controller.ts'], { cwd: root, encoding: 'utf8' })
  .trim().split(/\r?\n/).map(file => file.replaceAll('\\', '/')).sort();
const navigation = JSON.parse(readFileSync(path.join(root, 'artifacts/peru-route-inventory-20260923.json'), 'utf8'));
const operations = [];
const strings = node => !node ? [''] : ts.isStringLiteralLike(node) ? [node.text]
  : ts.isArrayLiteralExpression(node) ? node.elements.flatMap(strings) : [`UNRESOLVED:${node.getText()}`];
const decorators = node => (ts.canHaveDecorators(node) ? ts.getDecorators(node) || [] : []).map(decorator => {
  const expression = decorator.expression;
  return ts.isCallExpression(expression)
    ? { name: expression.expression.getText(), args: expression.arguments }
    : { name: expression.getText(), args: [] };
});
for (const file of files) {
  const source = ts.createSourceFile(file, readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true);
  for (const controller of source.statements.filter(ts.isClassDeclaration)) {
    const classDecorators = decorators(controller);
    const prefix = classDecorators.find(decorator => decorator.name === 'Controller');
    if (!prefix) continue;
    for (const method of controller.members.filter(ts.isMethodDeclaration)) {
      const methodDecorators = decorators(method);
      const verb = methodDecorators.find(decorator => ['Get', 'Post', 'Put', 'Patch', 'Delete', 'Head', 'Options', 'All'].includes(decorator.name));
      if (!verb) continue;
      for (const base of strings(prefix.args[0])) for (const suffix of strings(verb.args[0])) {
        if (base === 'analytics' || base.startsWith('analytics/')) continue;
        const endpoint = '/api/' + [base, suffix].filter(Boolean).join('/').replace(/^\/+|\/+$/g, '');
        const domain = base.split('/')[0] || 'infraestructura';
        const uiDomain = ['configuration', 'configuration-fiscal', 'configuracion-fiscal'].includes(domain) ? 'configuracion'
          : ['users', 'usuarios', 'usuarios-sistema', 'roles', 'permissions', 'sucursales', 'tenants', 'security'].includes(domain) ? 'administracion'
          : ['cpe', 'gre', 'sire'].includes(domain) ? domain : domain;
        const declarationDecorators = [...classDecorators, ...methodDecorators];
        const apiOperation = methodDecorators.find(decorator => decorator.name === 'ApiOperation');
        const summary = apiOperation?.args[0] && ts.isObjectLiteralExpression(apiOperation.args[0])
          ? apiOperation.args[0].properties.find(property => ts.isPropertyAssignment(property) && property.name.getText() === 'summary')?.initializer
          : undefined;
        operations.push({ module: domain, operation: method.name.getText(), method: verb.name.toUpperCase(), endpoint,
          summary: summary && ts.isStringLiteralLike(summary) ? summary.text : null,
          source: file, line: source.getLineAndCharacterOfPosition(method.getStart(source)).line + 1,
          access_declarations: declarationDecorators.filter(decorator => /Permission|Role|Guard|Public|Country|Admin/.test(decorator.name))
            .map(decorator => `${decorator.name}(${decorator.args.map(arg => arg.getText(source)).join(', ')})`),
          ui_domain: uiDomain,
          has_navigation_domain: navigation.some(route => route.module === uiDomain),
          functional_result: 'pending_operation_evidence',
          remaining_checks: ['persistencia y resultado funcional', 'permisos', 'aislamiento', 'validaciones', 'recuperación de errores'],
        });
      }
    }
  }
}
const artifact = { generated_at: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  excluded: ['Analytics'], operational_accounting_tax_reports_included: true,
  limitations: ['Contratos declarados; las rutas sin enlace visible pueden ser soporte, worker o administración.',
    'Las restricciones de país dentro de servicios deben contrastarse al ejecutar; el inventario no acredita una operación.',
    'La vinculación de navegación por dominio no implica que cada endpoint tenga control visible.'],
  operation_count: operations.length, operations };
const output = path.join(root, 'artifacts/peru-api-operation-inventory-20260930.json');
writeFileSync(output, JSON.stringify(artifact, null, 2) + '\n');
console.log(`${operations.length} contratos API declarados fuera de Analytics; evidencia: ${path.relative(root, output)}`);
if (process.argv[2]) {
  const evidenceDirectory = path.resolve(root, process.argv[2]);
  if (!evidenceDirectory.startsWith(path.join(root, 'artifacts', 'peru-integrated-'))) throw new Error('La evidencia debe provenir de un ensayo integrado local');
  const run = JSON.parse(readFileSync(path.join(evidenceDirectory, 'run.json'), 'utf8'));
  const http = JSON.parse(readFileSync(path.join(evidenceDirectory, 'http.json'), 'utf8'));
  const httpPhaseOnly = process.argv.includes('--http-phase-only');
  if ((!httpPhaseOnly && run.success !== true) || run.remoteWrites !== false || http.success !== true || !Array.isArray(http.request_traces)) {
    throw new Error('Se requiere ensayo local terminado con trazas HTTP, sin escrituras remotas');
  }
  const additionalEvidence = [];
  for(let argument=3;argument<process.argv.length;argument++) {
    if(process.argv[argument]!=='--phase-evidence')continue;
    const phaseDirectory=path.resolve(root,process.argv[++argument]||'');
    if(!phaseDirectory.startsWith(path.join(root,'artifacts')+path.sep))throw new Error('Fase adicional debe estar en artifacts');
    const phaseRun=JSON.parse(readFileSync(path.join(phaseDirectory,'run.json'),'utf8'));
    if(phaseRun.success!==true||phaseRun.remoteWrites!==false)throw new Error('Fase adicional debe estar aprobada sin escritura remota');
    const names={'company_logo_real_storage_subset':'company-logo.json','monthly_period_diagnostic_subset':'monthly-period.json'};
    const filename=names[phaseRun.scope];if(!filename)throw new Error('Alcance adicional no reconocido');
    const phase=JSON.parse(readFileSync(path.join(phaseDirectory,filename),'utf8'));
    if(phase.success!==true||phase.remoteWrites!==false)throw new Error('Prueba de fase incompleta');
    const evidence=path.relative(root,phaseDirectory).replaceAll('\\','/');
    const offset=http.results.length;http.results.push(...phase.scenarios);
    http.request_traces.push(...phase.requests.map(request=>({method:request.method,pathname:new URL('/api/'+request.endpoint.replace(/^\/?api\//,''), 'http://127.0.0.1').pathname,status:request.status,scenario_index_hint:offset,evidence_file:evidence+'/'+filename})));
    additionalEvidence.push({evidence,scope:phaseRun.scope,global_success:true,ui_included:phaseRun.withBrowser===true});
  }
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const routePattern = endpoint => new RegExp('^' + endpoint.split('/').map(part => part.startsWith(':') ? '[^/]+' : escape(part)).join('/') + '/?$');
  const requestMatches = new Map(operations.map(operation => [operation, []]));
  const acceptancePath = 'artifacts/peru-operation-acceptance-cases-20260930.json';
  const acceptance = JSON.parse(readFileSync(path.join(root, acceptancePath), 'utf8'));
  const defectPath = 'artifacts/peru-functional-defects-20260930.json';
  const defects = JSON.parse(readFileSync(path.join(root, defectPath), 'utf8')).defects;
  for (const testCase of acceptance.cases) for (const declared of testCase.operations) {
    if (!operations.some(operation => operation.method === declared.method && operation.endpoint === declared.endpoint)) {
      throw new Error(`Caso ${testCase.id}: operación inexistente ${declared.method} ${declared.endpoint}`);
    }
  }
  const verifiedCases = acceptance.cases.filter(testCase => testCase.required_scenario_prefixes.every(prefix =>
    http.results.some(result => result.passed === true && result.scenario.startsWith(prefix))));
  const casesFor = operation => verifiedCases.filter(testCase => testCase.operations.some(declared =>
    declared.method === operation.method && declared.endpoint === operation.endpoint));
  for (const [index, request] of http.request_traces.entries()) {
    const candidates = operations.filter(operation => (operation.method === request.method || operation.method === 'ALL') && routePattern(operation.endpoint).test(request.pathname));
    // Una ruta literal tiene precedencia sobre :id, como en el router de Nest.
    candidates.sort((left, right) => (left.endpoint.match(/:/g)?.length || 0) - (right.endpoint.match(/:/g)?.length || 0));
    if (candidates[0]) requestMatches.get(candidates[0]).push({ trace_index: index, status: request.status });
  }
  const matrix = { generated_at: new Date().toISOString(), inventory: path.relative(root, output).replaceAll('\\', '/'),
    evidence: path.relative(root, evidenceDirectory).replaceAll('\\', '/'),
    additional_evidence: additionalEvidence,
    evidence_scope: run.scope ?? 'full',
    evidence_global_success: run.success,
    evidence_phase: httpPhaseOnly ? 'HTTP aprobado; el resultado global se conserva por separado' : 'ensayo global aprobado',
    evidence_kind: 'HTTP contra Nest/PostgREST/PostgreSQL efímeros; no contiene cuerpos, tokens ni credenciales',
    acceptance_rule: 'HTTP observado no acredita aceptación funcional. verified_cases sólo recoge contratos cuyo escenario funcional pasó; conserva pendientes explícitos y no acepta toda la operación.',
    acceptance_cases: acceptancePath,
    defect_register: defectPath,
    excluded: ['Analytics'], operational_accounting_tax_reports_included: true,
    operations: operations.map(operation => ({ module: operation.module, operation: operation.operation,
      method: operation.method, endpoint: operation.endpoint, source: `${operation.source}:${operation.line}`,
      existing_evidence: requestMatches.get(operation),
      defects: defects.filter(defect => defect.operations.some(declared =>
        declared.method === operation.method && declared.endpoint === operation.endpoint))
        .map(({ id, status, proof, correction, pending }) => ({ id, status, proof, correction, pending })),
      verified_cases: casesFor(operation).map(({ id, source, verified_checks }) => ({ id, source, verified_checks })),
      result: casesFor(operation).length ? 'functional_cases_verified_with_remaining_checks'
        : requestMatches.get(operation).length ? 'http_contract_observed_not_full_acceptance' : 'pending_functional_execution',
      pending_checks: casesFor(operation).length ? [...new Set(casesFor(operation).flatMap(testCase => testCase.pending_checks))] : operation.remaining_checks,
    })),
  };
  const matrixOutput = path.join(root, 'artifacts/peru-api-operation-matrix-20260930.json');
  writeFileSync(matrixOutput, JSON.stringify(matrix, null, 2) + '\n');
  console.log(`${matrix.operations.filter(operation => operation.existing_evidence.length).length} contratos observados por HTTP; aceptación completa aún exige comprobaciones por operación`);
}
