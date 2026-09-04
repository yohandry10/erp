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
  const metadata = cpe?.metadata && typeof cpe.metadata === 'object'
    ? resolveExplicitCountry(cpe.metadata.pais, 'cpe.metadata.pais')
    : null;
  const current = resolveExplicitCountry(currentTenantCountry, 'empresa_config.pais');

  if (snapshot && persisted && snapshot !== persisted) {
    throw new Error(
      `Procedencia fiscal contradictoria: snapshot ${snapshot} no coincide con cpe.pais ${persisted}`,
    );
  }

  const canonicalPersisted = snapshot || persisted;
  if (canonicalPersisted && metadata && canonicalPersisted !== metadata) {
    throw new Error(
      `Procedencia fiscal contradictoria: CPE ${canonicalPersisted} no coincide con metadata ${metadata}`,
    );
  }

  const resolved = canonicalPersisted || metadata || current;
  if (!resolved) {
    throw new Error('No se puede determinar el país fiscal histórico del CPE');
  }
  return resolved;
}

/**
 * La modalidad también pertenece al comprobante ya persistido. Una conversión
 * posterior del tenant demo a real no puede reetiquetar sus muestras históricas
 * como documentos fiscales DIAN.
 */
export function isColombiaDemoRepresentation(
  cpe: Record<string, any>,
  currentTenantCountry?: unknown,
): boolean {
  return resolveHistoricalCpeCountry(cpe, currentTenantCountry) === 'CO'
    && cpe?.simulated_origin !== false;
}
