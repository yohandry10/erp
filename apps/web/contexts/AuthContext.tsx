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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const loadSession = async () => {
    try {
      const { data, error } = await customAuth.getSession()

      if (error) {
        setSession(null)
        setUser(null)
      } else if (data?.session) {
        setSession(data.session)
        setUser(data.session.user)
        clearPermissionCache(data.session.user.id)
      } else {
        setSession(null)
        setUser(null)
      }
    } catch (error) {
      console.error('[AuthContext] Error cargando sesión:', error)
      setSession(null)
      setUser(null)
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
    clearPermissionCache(data.user.id)
  }

  const signOut = async () => {
    const previousUserId = user?.id
    await customAuth.signOut()
    setSession(null)
    setUser(null)
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
