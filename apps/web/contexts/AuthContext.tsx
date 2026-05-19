'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { customAuth, Session, User } from '@/lib/auth-service'
import { clearPermissionCache } from '@/hooks/use-permission'

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

function readStoredSession(): Session | null {
  if (typeof window === 'undefined') return null

  try {
    const raw =
      window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY) ||
      window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Session
    if (!parsed?.user?.id || !parsed.user.email) return null

    return parsed
  } catch {
    return null
  }
}

function storeSessionSnapshot(session: Session | null) {
  if (typeof window === 'undefined') return

  try {
    if (session?.user?.id) {
      window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session))
      window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session))
    } else {
      window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
      window.sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
    }
  } catch {
    // La persistencia es una optimización de UX; la cookie HttpOnly sigue siendo la fuente de verdad.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readStoredSession())
  const [user, setUser] = useState<User | null>(() => readStoredSession()?.user ?? null)
  const [loading, setLoading] = useState(() => !readStoredSession())

  const loadSession = async () => {
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
    loadSession()
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
