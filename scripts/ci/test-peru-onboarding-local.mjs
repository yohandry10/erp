import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

export async function testPeruOnboarding({ request, sql, uuid, results, setToken, primaryToken }) {
  assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB, '1');
  assert.equal(sql('SELECT current_database();'), 'erp_e2e');
  const actor = sql("SELECT id FROM usuarios_sistema WHERE email='peru-integrated-restricted-1@example.test';");
  sql(`UPDATE usuarios_sistema SET is_super_admin=true WHERE id=${uuid(actor)};`);
  try {
    const admin = await request('auth/login', { email: 'peru-integrated-restricted-1@example.test', password: 'Local-Peru-2026-Only!' });
    setToken(admin.access_token);
    const email = `primer-cliente-${randomUUID()}@example.test`;
    const accountPassword = 'Cliente-Local-2026-Only!';
    const company = { ruc: '20100047218', razon_social: 'Primer cliente PE local', direccion: 'Av. Local 123',
      pais_id: 1, pais: 'PE', email, admin_email: email, admin_nombre: 'Cliente', admin_apellido: 'Local', admin_password: accountPassword };
    const creationHeaders = { 'idempotency-key': randomUUID() };
    const created = await request('tenants', company, 201, creationHeaders);
    assert.equal(created.success, true);
    const replay = await request('tenants', company, 201, creationHeaders);
    assert.equal(replay.idempotent, true);
    const tenantId = created.data.tenant.tenant_id;
    assert.equal(replay.data.tenant.tenant_id, tenantId);
    assert.equal(sql(`SELECT count(*) FROM empresa_config WHERE tenant_id=${uuid(tenantId)} AND NOT is_demo;`), '1');
    assert.equal(sql(`SELECT count(DISTINCT codigo) FROM plan_cuentas WHERE tenant_id=${uuid(tenantId)} AND codigo IN ('63','4699','122');`), '3');
    assert.equal(sql(`SELECT count(DISTINCT codigo) FROM conceptos_planilla WHERE tenant_id=${uuid(tenantId)} AND codigo IN ('006','007','008');`), '3');
    const client = await request('auth/login', { email, password: accountPassword });
    assert.equal(client.user.tenant_id, tenantId);
    assert.equal(client.user.is_super_admin, false);
    setToken(client.access_token);
    results.push({ scenario: 'alta no demo y primer administrador por API, reintento sin duplicados y login del cliente', passed: true });

    const certificateBase64 = readFileSync(process.env.DEMO_PFX_PATH).toString('base64');
    const certificatePassword = '12345678910';
    const ruc = '20123456786'; // Identidad del certificado desechable de este ensayo.
    await request('configuration/wizard/validate-certificate', { certificateBase64, certificatePassword: 'incorrecta', ruc }, 400);
    await request('configuration/wizard/validate-certificate', { certificateBase64, certificatePassword, ruc: company.ruc }, 400);
    const validation = await request('configuration/wizard/validate-certificate', { certificateBase64, certificatePassword, ruc });
    assert.equal(validation.data.perteneceAlEmisor, true);
    assert.equal(sql(`SELECT ruc FROM empresa_config WHERE tenant_id=${uuid(tenantId)};`), company.ruc);
    results.push({ scenario: 'PFX del cliente valida el RUC en edición; contraseña incorrecta y otro titular se rechazan sin escribir', passed: true });

    const configuration = { ruc, pais: 'PE', pais_id: 1, razonSocial: company.razon_social, direccion: company.direccion,
      ubigeo: '150101', tipo_empresa: 'MICRO', regimen_tributario: 'GENERAL', serie_factura: 'F001', serie_boleta: 'B001',
      serie_guia_remision: 'T001', certificateBase64, certificatePassword, sunat_environment: 'homologacion',
      sunat_username: 'USUARIO_LOCAL', sunat_password: 'Clave-SOL-local-only' };
    await request('configuration/wizard/step', { pasoActual: 3, configuracionTemporal: configuration }, 201, { 'idempotency-key': randomUUID() });
    const progress = JSON.stringify((await request('configuration/wizard/progress')).data);
    for (const secret of [certificateBase64, certificatePassword, configuration.sunat_password]) assert.equal(progress.includes(secret), false);
    const completionHeaders = { 'idempotency-key': randomUUID() };
    assert.equal((await request('configuration/complete', { configuration }, 201, completionHeaders)).success, true);
    assert.equal((await request('configuration/complete', { configuration }, 201, completionHeaders)).success, true);
    const saved = (await request('configuration/empresa')).data;
    assert.equal(saved.ruc, ruc);
    assert.equal(saved.certificateConfigured, true);
    assert.equal(saved.sunatUsernameConfigured, true);
    const publicData = JSON.stringify(saved);
    for (const secret of [certificateBase64, certificatePassword, configuration.sunat_password]) assert.equal(publicData.includes(secret), false);
    assert.equal(sql(`SELECT completado FROM wizard_progress WHERE tenant_id=${uuid(tenantId)};`), 't');
    assert.equal(sql(`SELECT count(*) FROM outbox_events WHERE tenant_id=${uuid(tenantId)} AND event_type='configuracion.wizard.completado';`), '1');
    results.push({ scenario: 'cliente completa configuración y recarga certificado y credenciales cifrados, sin filtrarlos ni duplicar el cierre', passed: true });
  } finally {
    sql(`UPDATE usuarios_sistema SET is_super_admin=false WHERE id=${uuid(actor)};`);
    setToken(primaryToken);
  }
}
