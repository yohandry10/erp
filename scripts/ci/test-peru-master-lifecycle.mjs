import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Altas y bajas pasan por API; SQL sólo contrasta persistencia en erp_e2e.
export async function testPeruMasterLifecycle({ request, sql, uuid, results, tenantId, otherTenantToken, masterExternalIds }) {
  const suffix = randomUUID().slice(0, 8);
  const permissionIds = JSON.parse(sql(`SELECT jsonb_agg(id ORDER BY codigo) FROM permisos
    WHERE tenant_id=${uuid(tenantId)} AND activo AND codigo IN ('ventas.clientes.ver','compras.proveedores.ver');`));
  assert.equal(permissionIds.length, 2);
  const roleIntent = { idempotency_key: randomUUID(), nombre: `LECTURA_MAESTROS_${suffix}`, permission_ids: permissionIds };
  const role = await request('roles', roleIntent);
  assert.ok(role.id);
  assert.equal((await request('roles', roleIntent)).id, role.id);
  await request(`roles/${role.id}`, { descripcion: 'Lectura de maestros, sin escritura' }, 200, {}, 'PUT');
  const roleDetail = await request(`roles/${role.id}`);
  assert.equal(roleDetail.descripcion, 'Lectura de maestros, sin escritura');
  assert.equal(roleDetail.permissions.length, 2);
  await request(`roles/${role.id}`, undefined, 404, { authorization: `Bearer ${otherTenantToken}` });
  const readerEmail = `lector-maestros-${suffix}@example.test`;
  const userIntent = { idempotency_key: randomUUID(), nombre: 'Lector local', email: readerEmail,
    password: 'Lectura-Local-2026!', roles: [role.id] };
  const reader = await request('users', userIntent);
  assert.ok(reader.id);
  assert.equal((await request('users', userIntent)).id, reader.id);
  await request(`users/${reader.id}`, { cargo: 'Consulta de maestros' }, 200, {}, 'PUT');
  const readerDetail = await request(`users/${reader.id}`);
  assert.equal(readerDetail.cargo, 'Consulta de maestros');
  assert.equal('password_hash' in readerDetail, false);
  const readerSearch = await request(`users?search=${encodeURIComponent(readerEmail)}`);
  assert.equal(readerSearch.data.filter(user => user.id === reader.id).length, 1);
  const domainSearch = await request(`users?search=${encodeURIComponent('@example.test')}`);
  assert.ok(domainSearch.data.some(user => user.id === reader.id));
  assert.ok(domainSearch.data.every(user => user.tenant_id === tenantId));
  const injectedSearch = await request(`users?search=${encodeURIComponent(`"),tenant_id.neq.${tenantId}`)}`);
  assert.deepEqual(injectedSearch.data, []);
  await request(`users/${reader.id}`, undefined, 404, { authorization: `Bearer ${otherTenantToken}` });
  const readerLogin = await request('auth/login', { email: readerEmail, password: userIntent.password });
  assert.equal(readerLogin.user.tenant_id, tenantId);
  const readerHeaders = { authorization: `Bearer ${readerLogin.access_token}` };
  await request('roles', undefined, 403, readerHeaders);
  results.push({ scenario: 'primer ADMIN crea, reintenta, edita y busca usuario/rol de lectura; login real e identidades ajenas ocultas',
    passed: true, reader_email: readerEmail, user_id: reader.id, role_id: role.id });

  const number = String(Number.parseInt(suffix, 16) % 100_000_000).padStart(8, '0');
  const rucBase = `20${number}`;
  const factors = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const check = 11 - factors.reduce((sum, factor, index) => sum + factor * Number(rucBase[index]), 0) % 11;
  const ruc = `${rucBase}${check === 10 ? 0 : check === 11 ? 1 : check}`;
  for (const item of [
    { kind: 'clientes', endpoint: 'ventas/clientes', debtTable: 'cuentas_por_cobrar', foreignKey: 'cliente_id', deleteStatus: 204,
      existingDocument: '76543210', newDocument: number, identityField: 'documento_numero',
      payload: { tipo: 'PERSONA', documento_tipo: 'DNI', documento_numero: number, razon_social: `Alta cliente ${suffix}` } },
    { kind: 'proveedores', endpoint: 'compras/proveedores', debtTable: 'cuentas_por_pagar', foreignKey: 'proveedor_id', deleteStatus: 200,
      existingDocument: '20123456786', newDocument: ruc, identityField: 'ruc',
      payload: { ruc, razon_social: `Alta proveedor ${suffix}`, email: `proveedor-${suffix}@example.test` } },
  ]) {
    const existingId = sql(`SELECT id FROM ${item.kind} WHERE tenant_id=${uuid(tenantId)} AND external_id='${masterExternalIds[item.kind]}';`);
    uuid(existingId);
    await request(`${item.endpoint}/${existingId}`, undefined, 200, readerHeaders);
    await request(`${item.endpoint}/${existingId}`, { razon_social: 'ESCRITURA NO AUTORIZADA' }, 403, readerHeaders, 'PUT');
    await request(`${item.endpoint}/${existingId}`, undefined, 403, readerHeaders, 'DELETE');
    await request(item.endpoint, item.payload, 403, readerHeaders);
    await request(`${item.endpoint}/${existingId}`, undefined, 404, { authorization: `Bearer ${otherTenantToken}` }, 'DELETE');
    assert.equal(sql(`SELECT activo FROM ${item.kind} WHERE id=${uuid(existingId)};`), 't');
    results.push({ scenario: `${item.kind}: rol de lectura consulta pero no crea/edita/desactiva; baja ajena devuelve 404 sin mutación`, passed: true });
    const createdResponse = await request(item.endpoint, item.payload);
    const created = createdResponse.data ?? createdResponse;
    assert.ok(created.id);
    const repeatedResponse = await request(item.endpoint, item.payload);
    assert.equal((repeatedResponse.data ?? repeatedResponse).id, created.id);
    await request(item.endpoint, { ...item.payload, [item.identityField]: item.existingDocument, razon_social: 'IDENTIDAD DUPLICADA LOCAL' }, 409);
    await request(`${item.endpoint}/${created.id}`, { [item.identityField]: item.existingDocument }, 409, {}, 'PUT');
    assert.equal(sql(`SELECT documento_identidad FROM ${item.kind} WHERE id=${uuid(created.id)} AND tenant_id=${uuid(tenantId)};`), item.newDocument);
    assert.equal(sql(`SELECT count(*) FROM ${item.kind} WHERE tenant_id=${uuid(tenantId)} AND documento_identidad='${item.newDocument}';`), '1');
    results.push({ scenario: `${item.kind}: alta individual repetida conserva ID; alta/edición con identidad duplicada rechazan sin cambiar maestro`, passed: true });
    const debtBefore = sql(`SELECT jsonb_agg(to_jsonb(debt) ORDER BY debt.id)
      FROM ${item.debtTable} debt WHERE tenant_id=${uuid(tenantId)} AND ${item.foreignKey}=${uuid(existingId)};`);
    assert.notEqual(debtBefore, '');
    assert.notEqual(debtBefore, 'null');
    for (const id of [created.id, existingId]) {
      await request(`${item.endpoint}/${id}`, undefined, item.deleteStatus, {}, 'DELETE');
      await request(`${item.endpoint}/${id}`, undefined, item.deleteStatus, {}, 'DELETE');
      const inactiveResponse = await request(`${item.endpoint}/${id}`);
      const inactive = inactiveResponse.data ?? inactiveResponse;
      assert.equal(inactive.activo, false);
      assert.equal(inactive.estado, 'INACTIVO');
      assert.equal(sql(`SELECT count(*) FROM ${item.kind} WHERE id=${uuid(id)} AND tenant_id=${uuid(tenantId)};`), '1');
      assert.equal(sql(`SELECT count(*) FROM audit_log WHERE tenant_id=${uuid(tenantId)} AND record_id='${id}'
        AND metadata->>'accion'='${item.kind === 'clientes' ? 'DESACTIVAR_CLIENTE' : 'DESACTIVAR_PROVEEDOR'}';`), '1');
    }
    const debtAfter = sql(`SELECT jsonb_agg(to_jsonb(debt) ORDER BY debt.id)
      FROM ${item.debtTable} debt WHERE tenant_id=${uuid(tenantId)} AND ${item.foreignKey}=${uuid(existingId)};`);
    assert.equal(debtAfter, debtBefore);
    if (item.kind === 'proveedores') {
      const inactives = await request(`${item.endpoint}?activo=false&search=${encodeURIComponent(item.payload.razon_social)}`);
      assert.ok(inactives.data.some(row => row.id === created.id));
    }
    results.push({ scenario: `${item.kind}: baja lógica con/sin deuda y reintento conservan trazabilidad, un solo registro de auditoría y saldo intacto`, passed: true });
  }
  await request(`roles/${role.id}`, undefined, 400, {}, 'DELETE');
  assert.equal(sql(`SELECT activo FROM roles WHERE id=${uuid(role.id)};`), 't');
  await request(`users/${reader.id}`, undefined, 200, {}, 'DELETE');
  await request('auth/profile', undefined, 401, readerHeaders);
  await request(`roles/${role.id}`, undefined, 200, {}, 'DELETE');
  await request(`roles/${role.id}`, undefined, 404);
  assert.equal(sql(`SELECT activo FROM roles WHERE id=${uuid(role.id)};`), 'f');
  results.push({ scenario: 'rol único de usuario activo no puede desactivarse; baja de usuario revoca sesión y permite baja lógica del rol', passed: true });
}
