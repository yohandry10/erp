'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCxcAdjustmentOperation } from '@/hooks/use-cxc-adjustment-operation'
import { useToast } from '@/components/ui/use-toast'
import { fiscalDateForCountry } from '@/lib/fiscal-date'
import { cxcAdjustmentPayload } from '@/lib/finanzas/cxc-adjustment-operation'
import type { CxcAdjustmentAccount } from '@/lib/finanzas/cxc-adjustment-contract'

type Account = CxcAdjustmentAccount & { serie?: string | null; numero?: string | null }
interface NotaCreditoModalProps { isOpen: boolean; cuenta: Account | null; onClose: () => void; onSuccess: () => void }
const reasonsPE = [['10', 'Otros conceptos'], ['04', 'Descuento global'], ['05', 'Descuento por ítem'], ['08', 'Bonificación'], ['09', 'Disminución de valor'], ['11', 'Ajuste de operaciones de exportación'], ['12', 'Ajuste del IVAP'], ['13', 'Ajustes de cuotas o fechas']]
const reasonsCO = [['1', 'Devolución parcial'], ['2', 'Anulación'], ['3', 'Descuento global'], ['4', 'Ajuste de precio'], ['5', 'Otros']]
export function NotaCreditoModal({ isOpen, cuenta, onClose, onSuccess }: NotaCreditoModalProps) {
  const operation = useCxcAdjustmentOperation('notas-credito', cuenta, isOpen, onClose, onSuccess), { toast } = useToast()
  const isColombia = operation.country === 'CO'
  const [monto, setMonto] = useState(''), [motivo, setMotivo] = useState(''), [codigoMotivo, setCodigoMotivo] = useState('10')
  useEffect(() => {
    const p = operation.pending ? cxcAdjustmentPayload(operation.pending) : null
    setMonto(String(p?.monto ?? cuenta?.saldo ?? '')); setMotivo(p?.motivo || 'Ajuste por nota de crédito'); setCodigoMotivo(p?.codigo_motivo || (isColombia ? '1' : '10'))
  }, [isOpen, cuenta, operation.pending, operation.ready, isColombia])
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!cuenta || !operation.ready) return
    if (!operation.pending) {
      if (!['PE', 'CO'].includes(operation.country)) { operation.setError('Este flujo requiere una jurisdicción fiscal compatible.'); return }
      if (!cuenta.documento_id) { operation.setError('La cuenta requiere un documento fiscal origen verificable antes de crear la nota.'); return }
      if (!/^\d+(?:\.\d{1,2})?$/.test(monto) || Number(monto) <= 0 || Math.round(Number(monto) * 100) > Math.round(cuenta.saldo * 100)) { operation.setError('El importe debe ser mayor a cero y no superar el saldo pendiente.'); return }
      if (motivo.trim().length < 3 || motivo.trim().length > 500) { operation.setError('El motivo debe tener entre 3 y 500 caracteres.'); return }
    }
    if (await operation.send({ monto: Number(monto), codigo_motivo: codigoMotivo, motivo: motivo.trim(), documento_id: cuenta.documento_id, fecha_emision: fiscalDateForCountry(operation.country) })) {
      toast({ title: 'Nota de crédito creada', description: 'El documento está pendiente de firma y aceptación fiscal. El saldo de la CxC todavía no se reduce.' })
    }
  }
  return <Dialog open={isOpen} onOpenChange={open => open ? undefined : operation.close()}>
    <DialogContent className="max-w-lg"><DialogHeader>
      <DialogTitle>{operation.pending ? 'Confirmar nota de crédito pendiente' : isColombia ? 'Emitir nota crédito DIAN 91' : 'Crear nota de crédito'}</DialogTitle>
      <DialogDescription>{operation.pending ? 'Se conserva la solicitud original. Reintenta su confirmación sin cambiar el documento ni la clave.' : 'Crea un documento fiscal referenciado. La cuenta sólo se ajusta después de la aceptación fiscal; fecha, serie y número se asignan en el servidor.'}</DialogDescription>
    </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4"><fieldset disabled={operation.frozen || !operation.ready} className="grid grid-cols-1 gap-4">
        <div><Label htmlFor="nc-monto">Monto</Label><Input id="nc-monto" type="number" min="0.01" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} required /></div>
        <div><Label htmlFor="nc-codigo-motivo">Código del motivo</Label><select id="nc-codigo-motivo" value={codigoMotivo} onChange={e => setCodigoMotivo(e.target.value)} className="w-full rounded-md border bg-background p-2">
          {(isColombia ? reasonsCO : reasonsPE).map(([value, label]) => <option key={value} value={value}>{value} - {label}</option>)}
        </select></div>
        <div><Label htmlFor="nc-motivo">Motivo</Label><Textarea id="nc-motivo" value={motivo} onChange={e => setMotivo(e.target.value)} minLength={3} maxLength={500} required /></div>
      </fieldset>
        {operation.error && <p role="alert" data-testid="cxc-note-error" className="text-sm text-destructive">{operation.error}</p>}
        <DialogFooter className="gap-2"><Button type="button" variant="outline" disabled={operation.saving} onClick={operation.close}>Cerrar</Button>
          <Button type="submit" disabled={operation.saving || !operation.ready}>{operation.saving ? 'Procesando...' : operation.pending ? 'Reintentar misma nota' : isColombia ? 'Crear nota DIAN 91' : 'Crear nota de crédito'}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}