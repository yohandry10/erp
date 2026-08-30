export type DianTransportEnvironment = 'habilitacion' | 'produccion';

export const DIAN_OFFICIAL_ENDPOINTS: Record<DianTransportEnvironment, string> = {
  habilitacion: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
  produccion: 'https://vpfe.dian.gov.co/WcfDianCustomerServices.svc',
};

export function normalizeDianTransportEnvironment(value: unknown): DianTransportEnvironment {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'HABILITACION' || normalized === 'HOMOLOGACION') return 'habilitacion';
  if (normalized === 'PRODUCCION') return 'produccion';
  throw new Error('Ambiente DIAN inválido: use HOMOLOGACION o PRODUCCION');
}

export function resolveOfficialDianEndpoint(config: {
  environment: DianTransportEnvironment;
  url?: unknown;
}): string {
  const expected = DIAN_OFFICIAL_ENDPOINTS[config.environment];
  const requested = String(config.url ?? '').trim();
  if (!requested) return expected;
  if (requested !== expected) {
    throw new Error(
      `Endpoint DIAN no permitido para ${config.environment}; debe usarse el servicio oficial exacto`,
    );
  }
  return expected;
}
