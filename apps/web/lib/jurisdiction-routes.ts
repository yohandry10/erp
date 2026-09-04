export type JurisdictionCountryCode = 'PE' | 'AR' | 'CO' | string;

const PERU_ONLY_ROUTES: Array<{ prefix: string; redirect: string }> = [
  { prefix: '/dashboard/gre', redirect: '/dashboard' },
  { prefix: '/dashboard/sire', redirect: '/dashboard' },
  { prefix: '/dashboard/rrhh/planilla-electronica', redirect: '/dashboard/rrhh' },
  { prefix: '/dashboard/contabilidad/impuestos', redirect: '/dashboard/contabilidad' },
];

const matchesRoutePrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * Impide abrir por URL directa una superficie legal de otro país. El menú no
 * basta: una ruta precargada, un marcador o un enlace antiguo también debe
 * fallar cerrado antes de renderizar SUNAT dentro de un tenant AR/CO.
 */
export function jurisdictionRedirectFor(
  pathname: string | null | undefined,
  countryCode: JurisdictionCountryCode,
): string | null {
  if (!pathname || countryCode === 'PE') return null;
  return PERU_ONLY_ROUTES.find(({ prefix }) => matchesRoutePrefix(pathname, prefix))?.redirect ?? null;
}
