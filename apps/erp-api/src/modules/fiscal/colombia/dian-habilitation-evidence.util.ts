import { createHash } from 'crypto';

export interface DianPortalApprovalConfig {
  is_demo?: boolean | null;
  pais?: string | null;
  ruc?: string | null;
  dian_software_id?: string | null;
  dian_test_set_id?: string | null;
  dian_habilitacion_estado?: string | null;
  dian_habilitacion_at?: string | Date | null;
  dian_habilitacion_evidencia?: Record<string, unknown> | null;
}

/**
 * Una respuesta ACCEPTED de un documento del TestSet no prueba que DIAN haya
 * cambiado el software a Habilitado. Sólo se acepta la constancia explícita
 * registrada desde el portal y ligada a la identidad fiscal vigente.
 */
export function hasCurrentDianPortalApproval(
  config: DianPortalApprovalConfig | null | undefined,
): boolean {
  if (!config) return false;
  const evidence = config.dian_habilitacion_evidencia;
  const testSetId = String(config.dian_test_set_id ?? '').trim();
  const enabledAt = Date.parse(String(config.dian_habilitacion_at ?? ''));
  if (
    config.is_demo === true
    || String(config.pais ?? '').trim().toUpperCase() !== 'CO'
    || String(config.dian_habilitacion_estado ?? '').trim().toUpperCase() !== 'HABILITADO'
    || !evidence
    || typeof evidence !== 'object'
    || Array.isArray(evidence)
    || !Number.isFinite(enabledAt)
    || !testSetId
  ) {
    return false;
  }

  const testSetHash = createHash('sha256').update(testSetId).digest('hex');
  return evidence.source === 'DIAN_PORTAL_HABILITACION'
    && evidence.portal_status === 'HABILITADO'
    && String(evidence.nit ?? '').trim() === String(config.ruc ?? '').trim()
    && String(evidence.software_id ?? '').trim()
      === String(config.dian_software_id ?? '').trim()
    && String(evidence.test_set_id_sha256 ?? '').toLowerCase() === testSetHash
    && String(evidence.reference ?? '').trim().length >= 8
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(String(evidence.confirmed_by ?? ''));
}
