'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { Building2, Loader2 } from 'lucide-react'

const loginStyles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%)',
    padding: '2rem',
  },
  card: {
    width: '100%',
    maxWidth: '28rem',
  },
  logoContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '2rem',
    gap: '0.75rem',
  },
  title: {
    fontSize: '2rem',
    textAlign: 'center' as const,
    fontWeight: '800',
    background: 'var(--gradient-primary)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    margin: '0',
  },
  description: {
    textAlign: 'center' as const,
    color: 'var(--primary-600)',
    marginBottom: '0',
  },
  content: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1.5rem',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
  },
  footer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1.5rem',
  },
  button: {
    width: '100%',
  },
  divider: {
    position: 'relative' as const,
  },
  dividerLine: {
    position: 'absolute' as const,
    inset: '0',
    display: 'flex',
    alignItems: 'center',
  },
  dividerSpan: {
    width: '100%',
    borderTop: '1px solid rgba(203, 213, 225, 0.5)',
  },
  dividerText: {
    position: 'relative' as const,
    display: 'flex',
    justifyContent: 'center',
    fontSize: '0.75rem',
    textTransform: 'uppercase' as const,
  },
  dividerTextSpan: {
    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
    padding: '0 1rem',
    color: 'var(--primary-600)',
    fontWeight: '600',
  },
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClientComponentClient()
  const { toast } = useToast()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        toast({
          variant: "destructive",
          title: "Error de autenticación",
          description: error.message,
        })
      } else {
        toast({
          title: "Bienvenido",
          description: "Has iniciado sesión correctamente",
        })
        router.push('/dashboard')
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Ocurrió un error inesperado",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDemoLogin = async () => {
    setLoading(true)
    // Simulación de login demo
    setTimeout(() => {
      toast({
        title: "Modo Demo",
        description: "Accediendo al sistema en modo demostración",
      })
      router.push('/dashboard')
      setLoading(false)
    }, 1000)
  }

  return (
    <div style={loginStyles.container}>
      <Card style={loginStyles.card}>
        <CardHeader>
          <div style={loginStyles.logoContainer}>
            <Building2 style={{ height: '2rem', width: '2rem', color: 'var(--blue-600)' }} />
          </div>
          <CardTitle style={loginStyles.title}>ERP Suite</CardTitle>
          <CardDescription style={loginStyles.description}>
            Ingresa tus credenciales para acceder al sistema
          </CardDescription>
        </CardHeader>

        <CardContent style={loginStyles.content}>
          <form onSubmit={handleLogin}>
            <div style={loginStyles.formGroup}>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div style={loginStyles.formGroup}>
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </form>
        </CardContent>

        <CardFooter style={loginStyles.footer}>
          <Button
            onClick={handleLogin}
            disabled={loading}
            style={loginStyles.button}
          >
            {loading && <Loader2 style={{ marginRight: '0.5rem', height: '1rem', width: '1rem', animation: 'spin 1s linear infinite' }} />}
            Iniciar Sesión
          </Button>

          <div style={loginStyles.divider}>
            <div style={loginStyles.dividerLine}>
              <span style={loginStyles.dividerSpan} />
            </div>
            <div style={loginStyles.dividerText}>
              <span style={loginStyles.dividerTextSpan}>
                O continúa con
              </span>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={handleDemoLogin}
            disabled={loading}
            style={loginStyles.button}
          >
            {loading && <Loader2 style={{ marginRight: '0.5rem', height: '1rem', width: '1rem', animation: 'spin 1s linear infinite' }} />}
            Acceso Demo
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
} 