import { createHash } from 'crypto';
import { hasCurrentDianPortalApproval } from './dian-habilitation-evidence.util';

const testSetId = 'test-set-actual-525';
const base = {
  is_demo: false,
  pais: 'CO',
  ruc: '9015250002',
  dian_software_id: 'software-525',
  dian_test_set_id: testSetId,
  dian_habilitacion_estado: 'HABILITADO',
  dian_habilitacion_at: '2026-08-29T12:00:00.000Z',
  dian_habilitacion_evidencia: {
    source: 'DIAN_PORTAL_HABILITACION',
    portal_status: 'HABILITADO',
    nit: '9015250002',
    software_id: 'software-525',
    test_set_id_sha256: createHash('sha256').update(testSetId).digest('hex'),
    reference: 'DIAN portal / software habilitado / 2026-08-29',
    confirmed_by: '11111111-1111-4111-8111-111111111111',
  },
};

describe('hasCurrentDianPortalApproval', () => {
  it('acepta sólo la constancia de portal ligada a la identidad vigente', () => {
    expect(hasCurrentDianPortalApproval(base)).toBe(true);
  });

  it.each([
    ['demo', { is_demo: true }],
    ['otro NIT', { ruc: '9015259999' }],
    ['otro software', { dian_software_id: 'software-nuevo' }],
    ['otro TestSet', { dian_test_set_id: 'test-set-nuevo' }],
    ['sin estado', { dian_habilitacion_estado: null }],
    ['sin fecha', { dian_habilitacion_at: null }],
  ])('rechaza evidencia obsoleta o inválida: %s', (_label, patch) => {
    expect(hasCurrentDianPortalApproval({ ...base, ...patch })).toBe(false);
  });

  it('no confunde una aceptación de documento con habilitación del software', () => {
    expect(hasCurrentDianPortalApproval({
      ...base,
      dian_habilitacion_evidencia: {
        source: 'DIAN_GET_STATUS_ZIP',
        portal_status: 'ACCEPTED',
      },
    })).toBe(false);
  });
});
