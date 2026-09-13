'use client'

import { useState, useRef } from 'react'
import { PedidoVenta, PedidoDetalle } from '@/types/ventas'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useApi } from '@/hooks/use-api'
import { toast } from '@/components/ui/use-toast'
import { CheckCircle, Info, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

interface PreparacionPedidoModalProps {
  pedido: PedidoVenta
  onClose: () => void
  onSuccess: () => void
}

export function PreparacionPedidoModal({ pedido, onClose, onSuccess }: PreparacionPedidoModalProps) {
  const { post } = useApi()
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({})
  const intent = useRef<{ payload: string; preparar: string; listo: string } | null>(null)
  const [loading, setLoading] = useState(false)

  const handleToggleItem = (itemId: string) => {
    setCheckedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }))
  }

  const handleMarcarListo = async () => {
    try {
      setLoading(true)
      const preparedItems = pedido.detalle
        ?.filter(item => checkedItems[item.id])
        .map(item => item.id) ?? []

      const payload = JSON.stringify(preparedItems)
      if (!intent.current || intent.current.payload !== payload) {
        intent.current = { payload, preparar: crypto.randomUUID(), listo: crypto.randomUUID() }
      }
      if (pedido.estado !== 'EN_PREPARACION') {
        await post(`/inventario/logistica/${pedido.id}/preparar`, {
          idempotency_key: intent.current.preparar, items_preparados: preparedItems,
        })
      }
      const response = await post(`/inventario/logistica/${pedido.id}/marcar-listo`, {
        idempotency_key: intent.current.listo, items_preparados: preparedItems,
      })

      if (response?.success) {
        toast({
          title: 'Éxito',
          description: 'Pedido listo para despacho',
        })
        onSuccess()
        onClose()
      } else {
        throw new Error('Error al marcar pedido como listo')
      }
    } catch (error) {
      console.error('Error marking pedido as ready:', error)
      toast({
        title: 'Error',
        description: 'No se pudo marcar el pedido como listo',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const allItemsChecked = Boolean(pedido.detalle?.length) && pedido.detalle!.every(item => checkedItems[item.id])
  const someItemsChecked = pedido.detalle?.some(item => checkedItems[item.id]) || false

  const totalItems = pedido.detalle?.length || 0
  const preparedCount = pedido.detalle?.filter(item => checkedItems[item.id]).length || 0
  const clienteNombre = pedido.cliente?.razon_social || 'Cliente sin datos'

  return (
    <Dialog open onOpenChange={open => { if (!open && !loading) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preparar Pedido {pedido.numero}</DialogTitle>
          <DialogDescription>Cliente: {clienteNombre}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          <div className="flex gap-3 rounded-lg border border-border bg-muted p-4 text-sm">
            <Info className="mt-0.5 size-5 shrink-0" />
            <p>Marca cada producto cuando esté preparado. Cuando todos estén listos, continúa a despacho.</p>
          </div>
          {(pedido.detalle || []).map((item: PedidoDetalle) => (
            <div key={item.id} className="flex items-center gap-3 rounded-lg border border-border p-4">
              <Checkbox id={`item-${item.id}`} checked={checkedItems[item.id] || false}
                disabled={loading} onCheckedChange={() => handleToggleItem(item.id)} />
              <label htmlFor={`item-${item.id}`} className="flex flex-1 cursor-pointer items-center justify-between gap-3">
                <div><p className="font-medium">{item.descripcion}</p>
                  <p className="text-sm text-muted-foreground">Cantidad: <strong>{item.cantidad}</strong></p></div>
                {checkedItems[item.id] && <CheckCircle className="size-5 text-emerald-600" />}
              </label>
            </div>
          ))}
          {someItemsChecked && <p className="text-sm text-muted-foreground">{preparedCount} de {totalItems} ítems preparados</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={handleMarcarListo} disabled={!allItemsChecked || loading}>
            {loading ? <><Loader2 className="mr-2 size-4 animate-spin" />Procesando...</>
              : <><CheckCircle className="mr-2 size-4" />Marcar como Listo</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
