'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { customAuth, Session, User } from '@/lib/auth-service'
import { clearPermissionCache } from '@/hooks/use-permission'

const PUBLIC_PATHS = new Set(['/login', '/demo', '/'])

function isPublicPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  // next.config.js usa trailingSlash: true, así que el pathname puede llegar como
  // "/login/" en vez de "/login". Normalizamos quitando la barra final.
  const normalized = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname
  return PUBLIC_PATHS.has(normalized)
}

interface AuthContextType {
  session: Session | null
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)
const AUTH_SESSION_STORAGE_KEY = 'erp.auth.session.snapshot'
const LEGACY_SENSITIVE_STORAGE_KEYS = ['token', 'demo_credentials'] as const

function readStoredSession(): Session | null {
  if (typeof window === 'undefined') return null

  try {
    const raw =
      window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY) ||
      window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Session
    if (!parsed?.user?.id || !parsed.user.email) return null
    const sanitized = { ...parsed, access_token: undefined }
    if (parsed.access_token) {
      const json = JSON.stringify(sanitized)
      window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, json)
      window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, json)
    }
    return sanitized
  } catch {
    return null
  }
}

function storeSessionSnapshot(session: Session | null) {
  if (typeof window === 'undefined') return

  try {
    if (session?.user?.id) {
      // This snapshot is only for optimistic UI hydration. The HttpOnly cookie and
      // /auth/profile remain the source of truth for authorization.
      const sanitized = {
        ...session,
        // Nunca persistir JWT en Web Storage. Web autentica con cookie HttpOnly y
        // Tauri conserva el token mediante DPAPI en desktop-secure-session.ts.
        access_token: undefined,
        user: {
          ...session.user,
          roles: Array.isArray(session.user.roles) ? session.user.roles : [],
          is_super_admin: session.user.is_super_admin === true,
        },
      }
      const json = JSON.stringify(sanitized)
      window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, json)
      window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, json)
    } else {
      window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
      window.sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
    }
  } catch {
    // La persistencia es una optimización de UX; la cookie HttpOnly sigue siendo la fuente de verdad.
  }
}

function clearLegacySensitiveStorage() {
  if (typeof window === 'undefined') return
  try {
    for (const key of LEGACY_SENSITIVE_STORAGE_KEYS) {
      window.localStorage.removeItem(key)
      window.sessionStorage.removeItem(key)
    }
  } catch {
    // La limpieza best-effort no debe impedir el arranque de la aplicación.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [session, setSession] = useState<Session | null>(() => readStoredSession())
  const [user, setUser] = useState<User | null>(() => readStoredSession()?.user ?? null)
  // El snapshot solo sirve para pintar la identidad de forma optimista. Hasta que
  // /auth/profile confirme la cookie actual no puede considerarse autoritativo:
  // el usuario puede haber cambiado de cuenta/tenant en otra pestaña.
  const [loading, setLoading] = useState(true)

  const loadSession = async () => {
    // En rutas públicas (/login, /demo, /) el middleware ya garantiza que no hay
    // sesión válida: si la hubiera, habría redirigido a /dashboard antes de
    // renderizar. Saltamos el fetch a /auth/profile para evitar el 401 esperado
    // en consola.
    if (isPublicPath(pathname)) {
      setSession(null)
      setUser(null)
      storeSessionSnapshot(null)
      setLoading(false)
      return
    }

    try {
      const { data, error } = await customAuth.getSession()

      if (error) {
        setSession(null)
        setUser(null)
        storeSessionSnapshot(null)
      } else if (data?.session) {
        setSession(data.session)
        setUser(data.session.user)
        storeSessionSnapshot(data.session)
        clearPermissionCache(data.session.user.id)
      } else {
        setSession(null)
        setUser(null)
        storeSessionSnapshot(null)
      }
    } catch (error) {
      console.error('[AuthContext] Error cargando sesión:', error)
      setSession(null)
      setUser(null)
      storeSessionSnapshot(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    clearLegacySensitiveStorage()
    loadSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signIn = async (email: string, password: string) => {
    const { data, error } = await customAuth.signInWithPassword({ email, password })

    if (error) {
      throw error
    }

    if (!data?.session) {
      throw new Error('No se recibió sesión del servidor')
    }

    setSession(data.session)
    setUser(data.user)
    storeSessionSnapshot(data.session)
    clearPermissionCache(data.user.id)
  }

  const signOut = async () => {
    const previousUserId = user?.id
    await customAuth.signOut()
    setSession(null)
    setUser(null)
    storeSessionSnapshot(null)
    clearPermissionCache(previousUserId)
  }

  const refreshSession = async () => {
    await loadSession()
  }

  const value = {
    session,
    user,
    loading,
    signIn,
    signOut,
    refreshSession,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return context
}
