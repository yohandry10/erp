'use client'

import { useEffect, useMemo, useState } from 'react'
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useApi } from '@/hooks/use-api'
import { useToast } from '@/components/ui/use-toast'

type SupervisorPinRow = {
  id: string
  nombre: string
  pin_registrado: boolean
  pin_version: number | null
  estado_pin: 'SIN_PIN' | 'ACTIVO' | 'BLOQUEADO'
  bloqueado_hasta: string | null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SupervisorPinDialog({ open, onOpenChange }: Props) {
  const api = useApi({ throwOnError: true, showErrorToast: false })
  const { toast } = useToast()
  const [supervisores, setSupervisores] = useState<SupervisorPinRow[]>([])
  const [supervisorId, setSupervisorId] = useState('')
  const [pin, setPin] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState('')
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const seleccionado = useMemo(
    () => supervisores.find((supervisor) => supervisor.id === supervisorId),
    [supervisores, supervisorId],
  )

  const cargar = async () => {
    setCargando(true)
    setError(null)
    try {
      const response = await api.get('/cajas/supervisores-gestion-pin')
      const rows = response?.data ?? response
      const lista = Array.isArray(rows) ? rows as SupervisorPinRow[] : []
      setSupervisores(lista)
      setSupervisorId((actual) => (
        lista.some((supervisor) => supervisor.id === actual)
          ? actual
          : lista[0]?.id || ''
      ))
    } catch {
      setError('No se pudo cargar el directorio de supervisores. Reintente.')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    if (open) {
      setPin('')
      setConfirmacion('')
      setIdempotencyKey('')
      void cargar()
    }
    // `api` cambia con el estado interno del hook; sólo la apertura dispara la carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const guardar = async () => {
    setError(null)
    if (!supervisorId) {
      setError('Seleccione un supervisor.')
      return
    }
    if (!/^\d{6}$/.test(pin)) {
      setError('El PIN debe tener exactamente seis dígitos.')
      return
    }
    if (pin !== confirmacion) {
      setError('La confirmación no coincide con el PIN.')
      return
    }

    setGuardando(true)
    try {
      const operationKey = idempotencyKey || crypto.randomUUID()
      if (!idempotencyKey) setIdempotencyKey(operationKey)
      await api.put(
        `/cajas/supervisores/${encodeURIComponent(supervisorId)}/pin`,
        { pin },
        { headers: { 'Idempotency-Key': operationKey } },
      )
      toast({
        title: seleccionado?.pin_registrado ? 'PIN rotado' : 'PIN registrado',
        description: `La credencial de ${seleccionado?.nombre || 'supervisor'} quedó activa.`,
      })
      setPin('')
      setConfirmacion('')
      setIdempotencyKey('')
      await cargar()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ''
      setError(message || 'No se pudo registrar el PIN. Verifique la política e intente otra vez.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> PIN de supervisores
          </DialogTitle>
          <DialogDescription>
            Registre o rote una credencial de seis dígitos. El sistema guarda sólo un hash y nunca vuelve a mostrar el PIN.
          </DialogDescription>
        </DialogHeader>

        {cargando ? (
          <div className="flex min-h-36 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando supervisores…
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="supervisor-pin-usuario">Supervisor</Label>
              <select
                id="supervisor-pin-usuario"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={supervisorId}
                onChange={(event) => {
                  setSupervisorId(event.target.value)
                  setIdempotencyKey('')
                }}
                disabled={guardando || supervisores.length === 0}
              >
                {supervisores.length === 0 && <option value="">No hay usuarios con rol supervisor</option>}
                {supervisores.map((supervisor) => (
                  <option key={supervisor.id} value={supervisor.id}>
                    {supervisor.nombre} · {supervisor.pin_registrado ? `PIN v${supervisor.pin_version}` : 'sin PIN'}
                  </option>
                ))}
              </select>
              {seleccionado?.estado_pin === 'BLOQUEADO' && (
                <p className="text-xs text-amber-600">
                  Credencial bloqueada hasta {new Date(seleccionado.bloqueado_hasta || '').toLocaleString('es-PE')}. Rotarla crea una versión nueva.
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="supervisor-pin-nuevo">PIN nuevo</Label>
                <Input
                  id="supervisor-pin-nuevo"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={6}
                  value={pin}
                  onChange={(event) => {
                    setPin(event.target.value.replace(/\D/g, '').slice(0, 6))
                    setIdempotencyKey('')
                  }}
                  disabled={guardando || !supervisorId}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supervisor-pin-confirmar">Confirmar PIN</Label>
                <Input
                  id="supervisor-pin-confirmar"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={6}
                  value={confirmacion}
                  onChange={(event) => {
                    setConfirmacion(event.target.value.replace(/\D/g, '').slice(0, 6))
                    setIdempotencyKey('')
                  }}
                  disabled={guardando || !supervisorId}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              No use seis dígitos iguales ni secuencias ascendentes o descendentes.
            </p>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
            Cerrar
          </Button>
          <Button type="button" onClick={guardar} disabled={cargando || guardando || !supervisorId}>
            {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
            {seleccionado?.pin_registrado ? 'Rotar PIN' : 'Registrar PIN'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
