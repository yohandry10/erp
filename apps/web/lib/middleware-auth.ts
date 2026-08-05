import { decodeJwt } from 'jose'

/**
 * Fallback de disponibilidad para el shell de Next.
 *
 * No sustituye la autenticación del API: únicamente evita expulsar al usuario
 * cuando Render está reiniciando, saturado o responde 429/5xx. Todos los datos
 * y mutaciones siguen protegidos por JwtAuthGuard + validateSession en Nest.
 */
export function hasPlausibleUnexpiredJwt(token: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  try {
    const payload = decodeJwt(token)
    if (!payload.sub) return false
    if (!payload.tenant_id && payload.is_super_admin !== true) return false
    if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds) return false
    return true
  } catch {
    return false
  }
}
