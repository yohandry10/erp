'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { Building2, Loader2, Globe, Lock, Mail } from 'lucide-react'
import {
  ACTIVE_COUNTRIES,
  INITIAL_ACTIVE_COUNTRY,
  INITIAL_ACTIVE_COUNTRY_ID,
  getActiveCountryById,
} from '@/lib/initial-country'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedCountryId, setSelectedCountryId] = useState(INITIAL_ACTIVE_COUNTRY_ID)
  const router = useRouter()
  const { toast } = useToast()
  const { signIn, session, loading: authLoading } = useAuth()

  useEffect(() => {
    if (!authLoading && session) {
      router.replace('/dashboard')
    }
  }, [authLoading, session, router])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('selectedCountry')
      const browserLooksArgentinian =
        navigator.language.toLowerCase() === 'es-ar' ||
        Intl.DateTimeFormat().resolvedOptions().timeZone.startsWith('America/Argentina')
      const browserLooksColombian =
        navigator.language.toLowerCase() === 'es-co' ||
        Intl.DateTimeFormat().resolvedOptions().timeZone === 'America/Bogota'
      const detected = getActiveCountryById(stored)
        ?? (browserLooksArgentinian ? ACTIVE_COUNTRIES.find((country) => country.codigo_iso === 'AR') : null)
        ?? (browserLooksColombian ? ACTIVE_COUNTRIES.find((country) => country.codigo_iso === 'CO') : null)
        ?? INITIAL_ACTIVE_COUNTRY
      setSelectedCountryId(String(detected.id))
      window.localStorage.setItem('selectedCountry', String(detected.id))
    }
  }, [])
  const selectedCountry = getActiveCountryById(selectedCountryId) ?? INITIAL_ACTIVE_COUNTRY

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault()

    setLoading(true)

    try {
      // ✅ SOLUCIÓN: Usar signIn del contexto (maneja la sesión automáticamente)
      await signIn(email, password)

      console.log('✅ [LoginPage] Login exitoso')

      // Persistir país seleccionado en localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('selectedCountry', selectedCountryId)
      }

      toast({
        title: 'Bienvenido',
        description: `Has iniciado sesión correctamente - ${selectedCountry.nombre}`,
      })

      console.log('🚀 [LoginPage] Redirigiendo a dashboard...')
      router.push('/dashboard')
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.info('[LoginPage] Login rechazado:', error instanceof Error ? error.message : error)
      }
      toast({
        variant: 'destructive',
        title: 'Error de autenticación',
        description: error instanceof Error ? error.message : 'Ocurrió un error inesperado',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDemoLogin = () => {
    setLoading(true)

    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedCountry', selectedCountryId)
    }

    // /demo crea un tenant demo (POST /api/demo/create), autentica con signIn() y
    // setea la cookie HttpOnly. Sin esto el middleware rebota a /login al intentar
    // entrar al dashboard porque no hay access_token.
    router.push(`/demo?country=${selectedCountry.codigo_iso}`)
  }

  return (
    <div className="theme-light-scope relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 px-4 py-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-blue-400/15 blur-3xl" />
        <div className="absolute -right-32 top-1/4 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 h-96 w-96 rounded-full bg-amber-300/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <Card className="relative overflow-hidden border-border/80 bg-white/95 shadow-2xl shadow-slate-900/15 backdrop-blur-xl before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-gradient-to-r before:from-blue-700 before:via-blue-500 before:to-cyan-400">
          <CardHeader className="px-6 pb-6 pt-10 text-center sm:px-10 sm:pt-12">
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-800 via-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-900/25">
                <Building2 className="h-8 w-8" aria-hidden="true" />
              </div>
              <div className="text-center">
                <CardTitle className="bg-gradient-to-r from-blue-900 via-blue-700 to-cyan-600 bg-clip-text text-4xl font-black tracking-tight text-transparent">
                  ERP Suite
                </CardTitle>
                <CardDescription className="mt-2 font-medium text-foreground/80">
                  Sistema Empresarial Integrado
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="px-6 pb-6 sm:px-10">
            <form onSubmit={handleLogin} className="space-y-5">
              {/* Selector de País */}
              <div className="space-y-2">
                <Label htmlFor="country" className="flex items-center gap-2 font-semibold text-foreground/85">
                  <Globe className="h-4 w-4" aria-hidden="true" />
                  País operativo
                </Label>
                <select
                  id="country"
                  value={selectedCountryId}
                  onChange={(event) => {
                    const value = event.target.value
                    setSelectedCountryId(value)
                    localStorage.setItem('selectedCountry', value)
                  }}
                  className="h-12 w-full rounded-md border border-border bg-card px-4 text-foreground/85"
                >
                  {ACTIVE_COUNTRIES.map((country) => (
                    <option key={country.codigo_iso} value={country.id}>
                      {country.nombre} ({country.nombre_fiscal}) · {country.moneda_codigo}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2 font-semibold text-foreground/85">
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  Correo Electrónico
                </Label>
                <Input
                  id="email"
                  type="text"
                  inputMode="email"
                  placeholder="tu@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                  className="h-12 border-border bg-card px-4 text-base text-foreground focus-visible:border-blue-500 focus-visible:ring-blue-500/20"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="flex items-center gap-2 font-semibold text-foreground/85">
                  <Lock className="h-4 w-4" aria-hidden="true" />
                  Contraseña
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-12 border-border bg-card px-4 text-base text-foreground focus-visible:border-blue-500 focus-visible:ring-blue-500/20"
                />
              </div>

              <button type="submit" className="hidden" aria-hidden="true" />
            </form>
          </CardContent>

          <CardFooter className="flex flex-col gap-5 px-6 pb-10 sm:px-10">
            <Button
              type="submit"
              onClick={handleLogin}
              disabled={loading}
              className="h-12 w-full bg-gradient-to-r from-blue-800 via-blue-600 to-cyan-500 text-base text-white shadow-lg shadow-blue-900/20 hover:from-blue-900 hover:via-blue-700 hover:to-cyan-600"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Iniciar Sesión
            </Button>

            <div className="flex w-full items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-muted" />
              <span className="text-sm font-medium text-muted-foreground">O continúa con</span>
              <span className="h-px flex-1 bg-muted" />
            </div>

            <Button
              variant="outline"
              onClick={handleDemoLogin}
              disabled={loading}
              className="h-12 w-full border-2 border-border bg-card text-base text-foreground/85 hover:border-border hover:bg-muted/30 hover:text-foreground"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Acceso Demo
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
