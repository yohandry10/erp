'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCxcAdjustmentOperation } from '@/hooks/use-cxc-adjustment-operation'
import { cxcAdjustmentPayload } from '@/lib/finanzas/cxc-adjustment-operation'
import type { CxcAdjustmentAccount } from '@/lib/finanzas/cxc-adjustment-contract'
import { parseDateLocal } from '@/lib/date-utils'
import { fiscalDateForCountry } from '@/lib/fiscal-date'

interface ReprogramarModalProps { isOpen: boolean; cuenta: CxcAdjustmentAccount | null; onClose: () => void; onSuccess: () => void }
export function ReprogramarModal({ isOpen, cuenta, onClose, onSuccess }: ReprogramarModalProps) {
  const operation = useCxcAdjustmentOperation('reprogramar', cuenta, isOpen, onClose, onSuccess)
  const [nuevaFecha, setNuevaFecha] = useState(''), [motivo, setMotivo] = useState(''), [comentarios, setComentarios] = useState('')
  useEffect(() => {
    const p = operation.pending ? cxcAdjustmentPayload(operation.pending) : null
    setNuevaFecha(p?.nueva_fecha_vencimiento || cuenta?.fecha_vencimiento || fiscalDateForCountry(operation.country))
    setMotivo(p ? p.motivo || '' : 'Reprogramación de vencimiento solicitada'); setComentarios(p?.comentarios || '')
  }, [isOpen, cuenta, operation.pending, operation.ready, operation.country])
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!operation.ready) return
    if (!operation.pending && (!/^\d{4}-\d{2}-\d{2}$/.test(nuevaFecha) || !Number.isFinite(Date.parse(nuevaFecha)) || new Date(nuevaFecha + 'T00:00:00Z').toISOString().slice(0, 10) !== nuevaFecha)) { operation.setError('Selecciona una fecha de vencimiento válida.'); return }
    await operation.send({ nueva_fecha_vencimiento: nuevaFecha, ...(motivo.trim() ? { motivo: motivo.trim() } : {}), ...(comentarios.trim() ? { comentarios: comentarios.trim() } : {}) })
  }
  return <Dialog open={isOpen} onOpenChange={open => open ? undefined : operation.close()}>
    <DialogContent className="max-w-lg"><DialogHeader>
      <DialogTitle>{operation.pending ? 'Confirmar reprogramación pendiente' : 'Reprogramar vencimiento'}</DialogTitle>
      <DialogDescription>{operation.pending ? 'Se conserva la solicitud original. Reintenta su confirmación sin cambiar la cuenta, la fecha ni la clave.' : 'Define una nueva fecha de vencimiento para la cuenta seleccionada.'}</DialogDescription>
    </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4"><fieldset disabled={operation.frozen || !operation.ready} className="grid grid-cols-1 gap-4">
        <div><Label htmlFor="reprogramar_fecha">Nueva fecha de vencimiento</Label><Input id="reprogramar_fecha" type="date" value={nuevaFecha} onChange={e => setNuevaFecha(e.target.value)} min={operation.account?.fecha_vencimiento || undefined} required />
          {operation.account?.fecha_vencimiento && <p className="mt-1 text-xs text-muted-foreground">Fecha actual al preparar: {parseDateLocal(operation.account.fecha_vencimiento).toLocaleDateString('es-PE')}</p>}
        </div>
        <div><Label htmlFor="reprogramar_motivo">Motivo</Label><Input id="reprogramar_motivo" value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={2000} /></div>
        <div><Label htmlFor="reprogramar_comentarios">Comentarios</Label><Textarea id="reprogramar_comentarios" rows={3} value={comentarios} onChange={e => setComentarios(e.target.value)} maxLength={2000} /></div>
      </fieldset>
        {operation.error && <p role="alert" data-testid="cxc-reschedule-error" className="text-sm text-destructive">{operation.error}</p>}
        <DialogFooter className="gap-2"><Button type="button" variant="outline" disabled={operation.saving} onClick={operation.close}>Cerrar</Button>
          <Button type="submit" disabled={operation.saving || !operation.ready}>{operation.saving ? 'Guardando...' : operation.pending ? 'Reintentar misma reprogramación' : 'Reprogramar'}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}