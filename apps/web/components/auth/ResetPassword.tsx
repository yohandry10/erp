'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { Lock, Loader2, ArrowLeft, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

/**
 * Componente para resetear contraseña con token
 * H1: Flujo de Password Reset en Frontend
 */
export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  useEffect(() => {
    // Obtener token de la URL o de los search params
    const tokenFromUrl = searchParams.get('token')
    if (tokenFromUrl) {
      setToken(tokenFromUrl)
    } else {
      // Si no hay token, redirigir a solicitar reset
      toast({
        variant: 'destructive',
        title: 'Token inválido',
        description: 'No se encontró token de reset. Por favor solicita un nuevo reset.',
      })
      router.push('/reset-password')
    }
  }, [searchParams, router, toast])

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 8) {
      return 'La contraseña debe tener al menos 8 caracteres'
    }
    if (!/[A-Z]/.test(pwd)) {
      return 'La contraseña debe contener al menos una letra mayúscula'
    }
    if (!/[a-z]/.test(pwd)) {
      return 'La contraseña debe contener al menos una letra minúscula'
    }
    if (!/[0-9]/.test(pwd)) {
      return 'La contraseña debe contener al menos un número'
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) {
      return 'La contraseña debe contener al menos un carácter especial'
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!token) {
      toast({
        variant: 'destructive',
        title: 'Token requerido',
        description: 'No se encontró token de reset. Por favor solicita un nuevo reset.',
      })
      return
    }

    // Validar contraseña
    const passwordError = validatePassword(password)
    if (passwordError) {
      toast({
        variant: 'destructive',
        title: 'Contraseña inválida',
        description: passwordError,
      })
      return
    }

    // Validar que las contraseñas coincidan
    if (password !== confirmPassword) {
      toast({
        variant: 'destructive',
        title: 'Contraseñas no coinciden',
        description: 'Las contraseñas ingresadas no coinciden',
      })
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          newPassword: password,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Error al resetear contraseña' }))
        throw new Error(errorData.message || 'Error al resetear contraseña')
      }

      // Éxito
      setSuccess(true)
      toast({
        title: 'Contraseña restablecida',
        description: 'Tu contraseña ha sido restablecida exitosamente. Ahora puedes iniciar sesión.',
      })

      // Redirigir al login después de 2 segundos
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    } catch (error) {
      console.error('Error resetting password:', error)
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Error al resetear contraseña. El token puede haber expirado.',
      })
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            </div>
            <CardTitle className="text-2xl">Contraseña restablecida</CardTitle>
            <CardDescription>
              Tu contraseña ha sido restablecida exitosamente. Redirigiendo al inicio de sesión...
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col gap-2">
            <Button asChild className="w-full">
              <Link href="/login">
                Continuar al inicio de sesión
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  if (!token) {
    return null // Evitar renderizar hasta que se obtenga el token
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Nueva contraseña</CardTitle>
          <CardDescription>
            Ingresa tu nueva contraseña. Debe tener al menos 8 caracteres e incluir mayúsculas, minúsculas, números y caracteres especiales.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nueva Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="pl-10 pr-10"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="pl-10 pr-10"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Restablecer contraseña
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button variant="ghost" asChild className="w-full">
            <Link href="/login">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver al inicio de sesión
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

