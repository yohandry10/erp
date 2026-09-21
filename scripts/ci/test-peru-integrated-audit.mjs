import assert from 'node:assert/strict';

export async function testAudit({ request, sql, uuid, results, tenantId, setToken, primaryToken }) {
  setToken(primaryToken);
  await request('audit-logs', undefined, 403);
  const auditor = await request('auth/login', { email: 'peru-integrated-auditor-1@example.test', password: 'Local-Peru-2026-Only!' });
  setToken(auditor.access_token);
  const actorsResponse = await request('audit-logs/actors');
  const actors = Array.isArray(actorsResponse) ? actorsResponse : actorsResponse.data;
  assert.ok(actors.some(actor => actor.email === 'peru-integrated-1@example.test'));
  assert.ok(actors.every(actor => Object.keys(actor).sort().join(',') === 'email,id,nombre'));
  assert.ok(actors.every(actor => !actor.email.endsWith('-2@example.test')));
  results.push({ scenario: 'auditor sin administración de usuarios consulta sólo identidades de su empresa', passed: true });
  const read = async path => {
    const response = await request(path);
    const payload = response.pagination ? response : response.data;
    assert.ok(payload?.pagination, 'La auditoría debe declarar su paginación');
    return payload;
  };
  const logs = await read('audit-logs?limit=10');
  assert.ok(logs.data.length > 0);
  assert.deepEqual(logs.fuentes_fallidas, []);
  assert.ok(logs.data.every(row => row.tenant_id === tenantId));
  results.push({ scenario: 'auditoría unificada real sin fuentes omitidas y aislada por empresa', passed: true });

  const trace = await read('audit-logs?table_name=recepciones&operation=UPDATE&limit=100');
  const receipt = trace.data.find(row => row.metadata?.source === 'backend_audit_542');
  assert.ok(receipt?.record_id && receipt?.user_id, 'El cierre debe registrar actor y recurso en auditoría complementaria');
  const historyResponse = await request(`audit-logs/resource/recepciones/${receipt.record_id}`);
  const history = Array.isArray(historyResponse) ? historyResponse : historyResponse.data;
  assert.ok(history.some(row => row.id === receipt.id), 'El historial debe encontrar el record_id sin depender del JSON');
  assert.equal(sql(`SELECT count(*) FROM audit_log WHERE id=${uuid(receipt.id)} AND tenant_id=${uuid(tenantId)};`), '1');
  results.push({ scenario: 'recepción cerrada conserva actor, resultado y recurso consultable', passed: true });

  const first = await read('audit-logs?limit=2&page=1');
  const next = await read('audit-logs?limit=2&page=2');
  assert.equal(first.pagination.total, next.pagination.total);
  assert.equal(first.data.length, 2);
  assert.equal(next.data.length, 2);
  assert.ok(next.data.every(row => !first.data.some(previous => previous.id === row.id)));
  await request('audit-logs?limit=1000', undefined, 400);
  await request('audit-logs/integrations?page=NaN', undefined, 400);
  await request('audit-logs/integrations?status=INVALID', undefined, 400);
  const integrations = await read(`audit-logs/integrations?correlacion_id=${receipt.record_id}&limit=100&page=1`);
  assert.ok(integrations.data.some(row => row.operacion === 'RECEPCIONES.CERRAR' && row.status === 'SUCCESS'
    && row.metadata?.source === 'backend_audit_542'), 'El cierre debe dejar una integración canónica consultable por el auditor');
  assert.ok(integrations.data.every(row => row.tenant_id === tenantId));
  results.push({ scenario: 'paginación de auditoría e integraciones y rechazo de filtros inválidos', passed: true });

  const other = await request('auth/login', { email: 'peru-integrated-auditor-2@example.test', password: 'Local-Peru-2026-Only!' });
  setToken(other.access_token);
  const otherActorsResponse = await request('audit-logs/actors');
  const otherActors = Array.isArray(otherActorsResponse) ? otherActorsResponse : otherActorsResponse.data;
  assert.ok(otherActors.every(actor => !actors.some(previous => previous.id === actor.id)));
  const invisibleResponse = await request(`audit-logs/resource/recepciones/${receipt.record_id}`);
  assert.deepEqual(Array.isArray(invisibleResponse) ? invisibleResponse : invisibleResponse.data, []);
  const foreignActor = await read(`audit-logs?user_id=${receipt.user_id}`);
  assert.deepEqual(foreignActor.data, []);
  assert.equal(foreignActor.pagination.total, 0);
  assert.deepEqual(foreignActor.fuentes_fallidas, []);
  setToken(undefined);
  await request('audit-logs', undefined, 401);
  const restricted = await request('auth/login', { email: 'peru-integrated-restricted-1@example.test', password: 'Local-Peru-2026-Only!' });
  setToken(restricted.access_token);
  await request('audit-logs', undefined, 403);
  await request(`audit-logs/resource/recepciones/${receipt.record_id}`, undefined, 403);
  await request('audit-logs/integrations', undefined, 403);
  await request('audit-logs/actors', undefined, 403);
  setToken(primaryToken);
  results.push({ scenario: 'auditoría rechaza acceso anónimo y sin permiso; no expone recursos ni actores de otra empresa', passed: true });
}
