'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fetchApi } from '@/lib/api-fetch'

const REGLA = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,72}$/
const AYUDA = 'Mínimo 8 caracteres, con mayúscula, minúscula, número y uno de estos símbolos: @ $ ! % * ? &.'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** La contraseña cambió y el servidor cerró todas las sesiones. */
  onChanged: () => void
}

export default function CambiarContrasenaModal({ open, onOpenChange, onChanged }: Props) {
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cerrar = (abierto: boolean) => {
    if (guardando) return
    if (!abierto) {
      setActual('')
      setNueva('')
      setConfirmacion('')
      setError('')
    }
    onOpenChange(abierto)
  }

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (!REGLA.test(nueva)) return setError(AYUDA)
    if (nueva !== confirmacion) return setError('Las dos contraseñas no coinciden.')
    setGuardando(true)
    try {
      const respuesta = await fetchApi('/api/auth/password/change', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: actual, newPassword: nueva }),
      })
      if (respuesta.ok) return onChanged()
      const cuerpo = await respuesta.json().catch(() => ({}))
      const mensaje = Array.isArray(cuerpo?.message) ? cuerpo.message[0] : cuerpo?.message
      if (respuesta.status === 429) setError('Demasiados intentos seguidos. Espera un minuto y vuelve a intentarlo.')
      else if (respuesta.status === 400 && typeof mensaje === 'string') setError(mensaje)
      else setError('No se pudo cambiar la contraseña. Tu contraseña actual sigue vigente.')
    } catch {
      setError('No se pudo cambiar la contraseña. Tu contraseña actual sigue vigente.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-w-[calc(100vw-2rem)] border-border bg-card text-card-foreground sm:max-w-md">
        <form onSubmit={enviar} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Cambiar contraseña</DialogTitle>
            <DialogDescription>Al guardarla se cierran todas tus sesiones y tendrás que entrar de nuevo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="contrasena-actual">Contraseña actual</Label>
            <Input id="contrasena-actual" type="password" autoComplete="current-password" required value={actual} onChange={(e) => setActual(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contrasena-nueva">Contraseña nueva</Label>
            <Input id="contrasena-nueva" type="password" autoComplete="new-password" required aria-describedby="contrasena-ayuda" value={nueva} onChange={(e) => setNueva(e.target.value)} />
            <p id="contrasena-ayuda" className="text-sm text-muted-foreground">{AYUDA}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contrasena-confirmacion">Repite la contraseña nueva</Label>
            <Input id="contrasena-confirmacion" type="password" autoComplete="new-password" required value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} />
          </div>
          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={guardando} onClick={() => cerrar(false)}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>{guardando ? 'Guardando...' : 'Cambiar contraseña'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
