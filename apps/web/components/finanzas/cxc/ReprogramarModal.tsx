'use client'

'use client'

import { useEffect, useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { useApi } from '@/hooks/use-api'

interface CuentaPorCobrarResumen {
  id: string
  fecha_vencimiento?: string | null
}

interface ReprogramarModalProps {
  isOpen: boolean
  cuenta: CuentaPorCobrarResumen | null
  onClose: () => void
  onSuccess: () => void
}

const formatDate = (iso?: string | null) => {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('es-PE')
  } catch {
    return iso
  }
}

export function ReprogramarModal({ isOpen, cuenta, onClose, onSuccess }: ReprogramarModalProps) {
  const { post } = useApi({ showSuccessToast: true })
  const [nuevaFecha, setNuevaFecha] = useState(() => new Date().toISOString().split('T')[0])
  const [motivo, setMotivo] = useState('Reprogramación de vencimiento solicitada')
  const [comentarios, setComentarios] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !cuenta) {
      setError(null)
      return
    }

    setNuevaFecha(cuenta.fecha_vencimiento ?? new Date().toISOString().split('T')[0])
    setMotivo('Reprogramación de vencimiento solicitada')
    setComentarios('')
    setError(null)
  }, [isOpen, cuenta])

  const handleClose = () => {
    if (submitting) return
    onClose()
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!cuenta) return

    if (!nuevaFecha) {
      setError('Debes seleccionar una nueva fecha de vencimiento')
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      const payload = {
        nueva_fecha_vencimiento: nuevaFecha,
        motivo: motivo || undefined,
        comentarios: comentarios || undefined,
      }

      const response = await post(`/api/finanzas/cxc/${cuenta.id}/reprogramar`, payload)
      if (response) {
        onSuccess()
        onClose()
      }
    } catch (err: any) {
      console.error('Error reprogramando CxC', err)
      setError(err?.message ?? 'No se pudo reprogramar la cuenta por cobrar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? undefined : handleClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reprogramar vencimiento</DialogTitle>
          <DialogDescription>
            Define una nueva fecha de vencimiento para la cuenta seleccionada.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="reprogramar_fecha">Nueva fecha de vencimiento</Label>
              <Input
                id="reprogramar_fecha"
                type="date"
                value={nuevaFecha}
                onChange={(e) => setNuevaFecha(e.target.value)}
                min={cuenta?.fecha_vencimiento ?? new Date().toISOString().split('T')[0]}
                required
              />
              {cuenta?.fecha_vencimiento && (
                <p className="text-xs text-muted-foreground mt-1">
                  Fecha actual: {formatDate(cuenta.fecha_vencimiento)}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="reprogramar_motivo">Motivo</Label>
              <Input
                id="reprogramar_motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="reprogramar_comentarios">Comentarios</Label>
              <Textarea
                id="reprogramar_comentarios"
                rows={3}
                value={comentarios}
                onChange={(e) => setComentarios(e.target.value)}
                placeholder="Detalle el motivo o comentarios adicionales"
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Guardando...' : 'Reprogramar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
