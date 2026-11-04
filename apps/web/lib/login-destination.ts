/** Keep post-login navigation within the authenticated workspace for this role. */
export function loginDestination(requested: string | null, isSuperAdmin: boolean): string {
  const workspace = isSuperAdmin ? '/superadmin' : '/dashboard'
  const fallback = isSuperAdmin ? '/superadmin/dashboard/' : '/dashboard/'
  if (!requested || !requested.startsWith('/') || requested.startsWith('//')
    || /[\\\u0000-\u0020\u007f]/.test(requested)) return fallback

  try {
    const destination = new URL(requested, 'https://erp.invalid')
    if (destination.origin !== 'https://erp.invalid'
      || !(destination.pathname === workspace || destination.pathname.startsWith(`${workspace}/`))) return fallback
    return destination.pathname + destination.search + destination.hash
  } catch {
    return fallback
  }
}
