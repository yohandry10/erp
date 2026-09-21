import assert from 'node:assert/strict';

export async function testAuthContext({ request, sql, uuid, results, setToken, primaryToken }) {
  const actorId = sql("SELECT id FROM usuarios_sistema WHERE email='peru-integrated-restricted-1@example.test';");
  const targetId = sql("SELECT tenant_id FROM usuarios_sistema WHERE email='peru-integrated-2@example.test';");
  // Escenario administrativo exclusivamente en erp_e2e, restaurado al terminar.
  sql(`UPDATE usuarios_sistema SET is_super_admin=true WHERE id=${uuid(actorId)};`);
  try {
    const login = await request('auth/login', { email: 'peru-integrated-restricted-1@example.test', password: 'Local-Peru-2026-Only!' });
    setToken(login.access_token);
    const pending = await request('demo/conversiones-pendientes');
    assert.equal(pending.success,true);
    assert.deepEqual(pending.data,[]);
    await request('auth/switch-tenant', { targetTenantId: 'invalid' }, 400);
    const switched = await request('auth/switch-tenant', { targetTenantId: targetId });
    assert.ok(switched.access_token);
    setToken(switched.access_token);
    const profile = await request('auth/profile');
    assert.equal(profile.tenant_id, targetId);
    assert.equal(profile.id, actorId);
    const validated = await request('auth/validate', { token: switched.access_token });
    assert.equal(validated.payload.tenant_id, targetId);
    const refreshed = await request('auth/refresh', {});
    setToken(refreshed.access_token);
    assert.equal((await request('auth/profile')).tenant_id, targetId);
    assert.equal(sql(`SELECT count(*) FROM audit_log WHERE user_id=${uuid(actorId)} AND tenant_id=${uuid(targetId)} AND metadata->>'source'='auth_switch_543';`), '1');
    results.push({ scenario: 'cambio de empresa crea sesión válida, preserva destino al validar/renovar y audita una vez', passed: true });
    sql(`UPDATE usuarios_sistema SET is_super_admin=false WHERE id=${uuid(actorId)};`);
    await request('auth/profile', undefined, 401);
    setToken(primaryToken);
    await request('demo/conversiones-pendientes', undefined, 403);
    results.push({ scenario: 'revocar privilegio de superadministrador invalida inmediatamente el contexto cruzado', passed: true });
  } finally {
    sql(`UPDATE usuarios_sistema SET is_super_admin=false WHERE id=${uuid(actorId)};`);
    setToken(primaryToken);
  }
}
