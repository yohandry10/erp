import {
  getActiveCountryByCode,
  type ActiveCountryCode,
} from '../paises/initial-country';

function resolveExplicitCountry(value: unknown, source: string): ActiveCountryCode | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const profile = getActiveCountryByCode(raw);
  if (!profile) {
    throw new Error(`País fiscal no soportado en ${source}: ${raw}`);
  }
  return profile.codigo;
}

/**
 * El país de una representación fiscal pertenece al comprobante, no a la
 * configuración actual del tenant. El snapshot 525 manda; `cpe.pais` sólo
 * cubre filas legadas y el país actual es el último respaldo posible.
 */
export function resolveHistoricalCpeCountry(
  cpe: Record<string, any>,
  currentTenantCountry?: unknown,
): ActiveCountryCode {
  const snapshot = cpe?.issuer_snapshot && typeof cpe.issuer_snapshot === 'object'
    ? resolveExplicitCountry(cpe.issuer_snapshot.country_code, 'issuer_snapshot.country_code')
    : null;
  const persisted = resolveExplicitCountry(cpe?.pais, 'cpe.pais');
  const current = resolveExplicitCountry(currentTenantCountry, 'empresa_config.pais');

  if (snapshot && persisted && snapshot !== persisted) {
    throw new Error(
      `Procedencia fiscal contradictoria: snapshot ${snapshot} no coincide con cpe.pais ${persisted}`,
    );
  }

  const resolved = snapshot || persisted || current;
  if (!resolved) {
    throw new Error('No se puede determinar el país fiscal histórico del CPE');
  }
  return resolved;
}
