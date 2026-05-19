'use client'

import { useState } from 'react'
import { PedidoVenta, PedidoDetalle } from '@/types/ventas'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useApi } from '@/hooks/use-api'
import { toast } from '@/components/ui/use-toast'
import { X, Package, CheckCircle, Info, ArrowRight } from 'lucide-react'

interface PreparacionPedidoModalProps {
  pedido: PedidoVenta
  onClose: () => void
  onSuccess: () => void
}

export function PreparacionPedidoModal({ pedido, onClose, onSuccess }: PreparacionPedidoModalProps) {
  const { post } = useApi()
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({})
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
        .map(item => ({ item_id: item.id, cantidad: item.cantidad })) ?? []

      // Si el pedido aún no fue movido a EN_PREPARACION, inicializarlo primero.
      await post(`/inventario/logistica/${pedido.id}/preparar`, {
        items_preparados: preparedItems,
      }).catch((error: any) => {
        const msg = error?.message || ''
        if (!msg.includes('en estado EN_PREPARACION')) {
          throw error
        }
      })

      const response = await post(`/inventario/logistica/${pedido.id}/marcar-listo`, {
        items_preparados: preparedItems,
      })

      if (response?.success) {
        toast({
          title: 'Éxito',
          description: 'Pedido marcado como listo para preparación',
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

  const allItemsChecked = pedido.detalle?.every(item => checkedItems[item.id]) || false
  const someItemsChecked = pedido.detalle?.some(item => checkedItems[item.id]) || false

  const styles = {
    overlay: {
      position: 'fixed' as const,
      inset: 0,
      background: 'rgba(6, 15, 33, 0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem',
    },
    modal: {
      background: 'linear-gradient(135deg, rgba(255,255,255,0.97), rgba(242,246,255,0.98))',
      borderRadius: '24px',
      width: '100%',
      maxWidth: '900px',
      maxHeight: '90vh',
      display: 'flex',
      flexDirection: 'column' as const,
      boxShadow: '0 30px 80px rgba(14, 30, 84, 0.25)',
      border: '1px solid rgba(255,255,255,0.4)',
    },
    header: {
      padding: '1.75rem 2rem',
      borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1rem',
    },
    iconBubble: {
      width: '48px',
      height: '48px',
      borderRadius: '16px',
      background: 'rgba(59,130,246,0.12)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#1D4ED8',
    },
    title: {
      margin: 0,
      fontSize: '1.35rem',
      fontWeight: 700,
      color: 'var(--primary-900)',
    },
    subTitle: {
      margin: 0,
      marginTop: '0.15rem',
      fontSize: '0.95rem',
      color: 'var(--primary-500)',
    },
    closeButton: {
      border: 'none',
      background: 'transparent',
      color: 'var(--primary-400)',
      cursor: 'pointer',
      padding: '0.25rem',
      transition: 'color 0.2s ease',
    },
    body: {
      padding: '1.75rem 2rem',
      overflowY: 'auto' as const,
      flex: 1,
    },
    helperText: {
      fontSize: '0.95rem',
      color: 'var(--primary-600)',
      marginBottom: '1.25rem',
      background: 'rgba(59,130,246,0.06)',
      border: '1px solid rgba(59,130,246,0.15)',
      padding: '0.9rem 1rem',
      borderRadius: '12px',
      display: 'flex',
      gap: '0.65rem',
      alignItems: 'flex-start',
      lineHeight: 1.5,
    },
    itemRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      padding: '1rem 1.25rem',
      borderRadius: '16px',
      border: '1px solid rgba(15,23,42,0.08)',
      background: 'rgba(255,255,255,0.9)',
      marginBottom: '0.8rem',
      boxShadow: '0 8px 30px rgba(15,23,42,0.06)',
    },
    itemLabel: {
      flex: 1,
      cursor: 'pointer',
    },
    itemTitle: {
      margin: 0,
      fontSize: '1rem',
      fontWeight: 600,
      color: 'var(--primary-900)',
    },
    itemDetail: {
      margin: '0.35rem 0 0',
      fontSize: '0.9rem',
      color: 'var(--primary-600)',
    },
    progressBox: {
      marginTop: '1rem',
      padding: '1rem 1.25rem',
      borderRadius: '14px',
      background: 'rgba(59,130,246,0.08)',
      border: '1px solid rgba(59,130,246,0.2)',
      color: '#1D4ED8',
      fontSize: '0.9rem',
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '0.75rem',
    },
    footer: {
      padding: '1.5rem 2rem',
      borderTop: '1px solid rgba(15,23,42,0.08)',
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '0.75rem',
      background: 'rgba(248,250,252,0.9)',
      borderBottomLeftRadius: '24px',
      borderBottomRightRadius: '24px',
    },
    cancelButton: {
      background: 'rgba(255,255,255,0.9)',
      border: '1px solid rgba(15,23,42,0.12)',
      color: 'var(--primary-700)',
      fontWeight: 600,
    },
    primaryButton: {
      background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
      color: '#fff',
      fontWeight: 600,
      border: 'none',
    },
  }

  const preparedCount = Object.values(checkedItems).filter(Boolean).length
  const totalItems = pedido.detalle?.length || 0
  const clienteNombre = pedido.cliente?.razon_social || 'Cliente sin datos'

  return (
    <div>
      <div>
        <div>
          <div className="flex items-center gap-4">
            <div>
              <Package className="w-[22px] h-[22px]" />
            </div>
            <div>
              <h2>Preparar Pedido {pedido.numero}</h2>
              <p>Cliente: {clienteNombre}</p>
            </div>
          </div>
          <button onClick={onClose}>
            <X className="w-6 h-6" />
          </button>
        </div>

        <div>
          <div>
            <Info className="w-[18px] h-[18px] mt-[2px]" />
            <div>
              <div className="font-semibold">Cómo avanzar este pedido</div>
              <div className="mt-1">
                1) Marca cada producto cuando lo tengas listo. 2) Cuando todos estén listos, pulsa “Marcar como Listo”.
                3) El siguiente paso será <strong>Despacho</strong> y luego la <strong>Facturación</strong>.
              </div>
            </div>
          </div>

          {(pedido.detalle || []).map((item: PedidoDetalle) => (
            <div key={item.id}>
              <Checkbox
                id={`item-${item.id}`}
                checked={checkedItems[item.id] || false}
                onCheckedChange={() => handleToggleItem(item.id)} className="mt-[0.15rem]"
              />
              <label htmlFor={`item-${item.id}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p>{item.descripcion}</p>
                    <p>
                      Cantidad: <strong>{item.cantidad}</strong>
                    </p>
                  </div>
                  {checkedItems[item.id] && <CheckCircle className="text-[#22C55E] w-5 h-5" />}
                </div>
              </label>
            </div>
          ))}

          {someItemsChecked && (
            <div>
              {preparedCount} de {totalItems} ítems preparados
            </div>
          )}
        </div>

        <div>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleMarcarListo}
            disabled={!allItemsChecked || loading}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 rounded-full mr-2"
                />
                Procesando...
              </>
            ) : (
              <>
                <CheckCircle className="w-[18px] h-[18px] mr-1.5" />
                Marcar como Listo
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
