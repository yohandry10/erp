'use client'

import { useEffect, useRef, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { isPurchaseQuantity, isPurchaseUnitPrice } from '@/lib/compras/quantity'
import { multiplicarMoneda } from '@/lib/format-utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Line {
  producto_id: string
  descripcion?: string
  cantidad: number
  precio_unitario: number
  productos?: { nombre?: string }
}
interface EditableLine { producto_id: string; descripcion: string; cantidad: string; precio_unitario: string }

export default function CompraEditarDetallesModal({ tipo, documento, open, onClose, onSuccess }: {
  tipo: 'cotizacion' | 'orden'
  documento: { id: string; numero: string; estado: string; detalles?: Line[] }
  open: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const { put } = useApi({ throwOnError: true, showErrorToast: false })
  const [lines, setLines] = useState<EditableLine[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  useEffect(() => {
    if (!open) return
    setError('')
    setLines((documento.detalles ?? []).map(line => ({
      producto_id: line.producto_id,
      descripcion: line.descripcion || line.productos?.nombre || 'Producto',
      cantidad: String(line.cantidad), precio_unitario: String(line.precio_unitario),
    })))
  }, [open, documento])

  const save = async () => {
    if (pending.current) return
    if (documento.estado !== 'BORRADOR' || !lines.length) {
      setError('Sólo se pueden editar productos de un borrador con líneas completas.')
      return
    }
    const detalles = lines.map(line => ({ ...line, cantidad: Number(line.cantidad), precio_unitario: Number(line.precio_unitario) }))
    if (detalles.some(line => !line.cantidad || !isPurchaseQuantity(line.cantidad))) {
      setError('La cantidad debe ser positiva y tener como máximo dos decimales.')
      return
    }
    if (lines.some(line => line.precio_unitario.trim() === '') || detalles.some(line => !isPurchaseUnitPrice(line.precio_unitario))) {
      setError('El precio debe ser no negativo y tener como máximo dos decimales.')
      return
    }
    pending.current = true
    setSaving(true)
    setError('')
    try {
      const response = await put(`/api/compras/${tipo === 'orden' ? 'ordenes' : 'cotizaciones'}/${documento.id}`, { detalles })
      if (!response?.success || response.data?.id !== documento.id) throw new Error('No se confirmó la edición de productos.')
      onClose()
      onSuccess()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo guardar la edición.')
    } finally {
      pending.current = false
      setSaving(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={next => !next && !saving && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Editar productos {documento.numero}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Revisa cantidades y precios. Los importes e impuestos se recalculan al guardar.</p>
        {lines.map((line, index) => (
          <div key={`${line.producto_id}-${index}`} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
            <p>{line.descripcion}</p>
            <label>Cantidad línea {index + 1}<input type="number" step="0.01" min="0.01" value={line.cantidad} disabled={saving} className="w-full rounded border px-2 py-1" onChange={event => setLines(current => current.map((value, i) => i === index ? { ...value, cantidad: event.target.value } : value))} /></label>
            <label>Precio línea {index + 1}<input type="number" step="0.01" min="0" value={line.precio_unitario} disabled={saving} className="w-full rounded border px-2 py-1" onChange={event => setLines(current => current.map((value, i) => i === index ? { ...value, precio_unitario: event.target.value } : value))} /></label>
            <p className="text-sm">Subtotal: {multiplicarMoneda(Number(line.cantidad) || 0, Number(line.precio_unitario) || 0).toFixed(2)}</p>
          </div>
        ))}
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button><Button disabled={saving || !lines.length} onClick={save}>{saving ? 'Guardando...' : 'Guardar productos'}</Button></div>
      </DialogContent>
    </Dialog>
  )
}
