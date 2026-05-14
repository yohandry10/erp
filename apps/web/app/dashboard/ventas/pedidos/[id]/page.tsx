'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { useEmpresaConfig } from '@/hooks/use-empresa-config'
import { PedidoVenta, EstadoPedido } from '@/types/ventas'
import { toast } from '@/components/ui/use-toast'
import GenerarFacturaButton from '@/components/ventas/GenerarFacturaButton'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const ESTADO_COLORS: Record<EstadoPedido, { bg: string; text: string }> = {
  [EstadoPedido.PENDIENTE]: { bg: '#fef3c7', text: '#92400e' },
  [EstadoPedido.PENDIENTE_APROBACION]: { bg: '#fed7aa', text: '#9a3412' },
  [EstadoPedido.CONFIRMADO]: { bg: '#dbeafe', text: '#1e40af' },
  [EstadoPedido.EN_PREPARACION]: { bg: '#e9d5ff', text: '#6b21a8' },
  [EstadoPedido.LISTO_DESPACHO]: { bg: '#c7d2fe', text: '#4338ca' },
  [EstadoPedido.DESPACHO_PARCIAL]: { bg: '#fde68a', text: '#78350f' },
  [EstadoPedido.LISTO_FACTURAR]: { bg: '#d1fae5', text: '#065f46' },
  [EstadoPedido.FACTURADO]: { bg: '#ccfbf1', text: '#115e59' },
  [EstadoPedido.COMPLETADO]: { bg: '#f3f4f6', text: '#374151' },
  [EstadoPedido.COMPLETADO_CON_GRE]: { bg: '#d1fae5', text: '#047857' },
  [EstadoPedido.CANCELADO]: { bg: '#fee2e2', text: '#991b1b' }
}

export default function PedidoDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { get, post } = useApi()
  const { config: empresaConfig, loading: empresaConfigLoading } = useEmpresaConfig()

  const [pedido, setPedido] = useState<PedidoVenta | null>(null)
  const [loading, setLoading] = useState(true)

  const pedidoId = params.id as string

  const loadPedido = useCallback(async () => {
    try {
      setLoading(true)
      console.debug('[PedidoDetailPage] Cargando pedido...', { pedidoId })
      const response = await get(`/ventas/pedidos/${pedidoId}`)

      console.debug('[PedidoDetailPage] Respuesta detalle pedido', response)
      if (response?.success && response.data) {
        setPedido(response.data)
        console.debug('[PedidoDetailPage] Estado pedido actualizado', {
          estado: response.data?.estado,
          factura_id: response.data?.factura_id,
        })
      } else {
        toast({
          title: 'Error',
          description: 'No se pudo cargar el pedido',
          variant: 'destructive'
        })
        router.push('/dashboard/ventas/pedidos')
      }
    } catch (error) {
      console.error('Error loading pedido:', error)
      toast({
        title: 'Error',
        description: 'No se pudo cargar el pedido',
        variant: 'destructive'
      })
      router.push('/dashboard/ventas/pedidos')
    } finally {
      setLoading(false)
    }
  }, [get, pedidoId, router])

  useEffect(() => {
    loadPedido()
  }, [loadPedido])

  const handleFacturaGenerada = (result: { facturaId: string | null; sugerioGre: boolean }) => {
    setPedido((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        estado: EstadoPedido.FACTURADO,
        factura_id: result.facturaId ?? prev.factura_id ?? null,
      }
    })

    console.debug('[PedidoDetailPage] Factura generada (optimista)', {
      pedidoId,
      facturaId: result.facturaId,
      sugerioGre: result.sugerioGre,
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd/MM/yyyy', { locale: es })
    } catch {
      return dateString
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem 0' }}>
          <div style={{ textAlign: 'center' }}>
            <Loader2 style={{ width: '3rem', height: '3rem', color: 'var(--primary-400)', margin: '0 auto 1rem', animation: 'spin 1s linear infinite' }} />
            <p style={{ color: 'var(--primary-600)' }}>Cargando pedido...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!pedido) {
    return null
  }

  const clienteInfo = (pedido as any).cliente ?? (pedido as any).clientes ?? null

  const facturaButtonConfig = {
    usar_flujo_logistica: empresaConfig?.usar_flujo_logistica ?? false,
    gre_obligatorio: empresaConfig?.gre_obligatorio ?? false,
    gre_automatico_habilitado: empresaConfig?.gre_automatico_habilitado ?? true,
  }

  const usaFlujoLogistica = facturaButtonConfig.usar_flujo_logistica
  const estadoPedido = pedido.estado
  const puedeGenerarFactura =
    estadoPedido === EstadoPedido.LISTO_FACTURAR ||
    (!usaFlujoLogistica && estadoPedido === EstadoPedido.CONFIRMADO)

  const requierePasosLogisticaPrevios =
    usaFlujoLogistica &&
    estadoPedido !== EstadoPedido.LISTO_FACTURAR &&
    estadoPedido !== EstadoPedido.FACTURADO &&
    estadoPedido !== EstadoPedido.COMPLETADO &&
    estadoPedido !== EstadoPedido.COMPLETADO_CON_GRE

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => router.back()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.5rem',
              color: 'var(--primary-700)',
              background: 'rgba(255, 255, 255, 0.8)',
              border: '1px solid var(--primary-200)',
              borderRadius: 'var(--border-radius)',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--primary-50)'
              e.currentTarget.style.borderColor = 'var(--primary-300)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)'
              e.currentTarget.style.borderColor = 'var(--primary-200)'
            }}
          >
            <ArrowLeft style={{ width: '1.125rem', height: '1.125rem' }} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <h1 style={{ fontSize: '2rem', fontWeight: '900', color: 'var(--primary-900)', margin: 0 }}>
                Pedido {pedido.numero}
              </h1>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.5rem 1rem',
                borderRadius: '9999px',
                fontSize: '0.875rem',
                fontWeight: '600',
                background: ESTADO_COLORS[pedido.estado].bg,
                color: ESTADO_COLORS[pedido.estado].text
              }}>
                {pedido.estado}
              </span>
            </div>
            <p style={{ fontSize: '1rem', color: 'var(--primary-600)', margin: 0 }}>
              Creado el {formatDate(pedido.created_at)}
            </p>
          </div>
        </div>
      </div>

      {/* Botones de Acción */}
      {pedido.estado === EstadoPedido.PENDIENTE && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={async () => {
              try {
                const response = await post(`/ventas/pedidos/${pedidoId}/confirmar`, { forzar_confirmacion: false })
                if (!response?.success) {
                  const warningText = response?.warnings?.length
                    ? response.warnings.map((w: any) => `${w.descripcion || 'Producto'}: solicitado ${w.solicitado}, disponible ${w.disponible}`).join(' | ')
                    : 'No se pudo confirmar el pedido'
                  throw new Error(warningText)
                }
                toast({
                  title: 'Pedido confirmado',
                  description: 'El pedido ha sido confirmado exitosamente'
                })
                await loadPedido()
              } catch (error: any) {
                const warnings = error?.data?.warnings
                const warningText = warnings?.length
                  ? warnings.map((w: any) => `${w.descripcion || 'Producto'}: solicitado ${w.solicitado}, disponible ${w.disponible}${w.reservado != null ? `, reservado ${w.reservado}` : ''}`).join(' | ')
                  : null
                toast({
                  title: 'Error',
                  description: warningText || error?.message || 'No se pudo confirmar el pedido',
                  variant: 'destructive'
                })
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: 'white',
              background: 'var(--gradient-primary)',
              border: 'none',
              borderRadius: 'var(--border-radius)',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: 'var(--shadow-md)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = 'var(--shadow-lg)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'var(--shadow-md)'
            }}
          >
            Confirmar Pedido
          </button>
        </div>
      )}

      {/* Guía breve del flujo logístico */}
      {!empresaConfigLoading && (
        <div
          style={{
            border: '1px solid var(--primary-100)',
            background: 'rgba(59,130,246,0.05)',
            borderRadius: 'var(--border-radius)',
            padding: '1rem 1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
            color: 'var(--primary-700)',
          }}
        >
          <strong style={{ color: 'var(--primary-800)' }}>¿Qué sigue?</strong>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.95rem' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.6rem', background: 'white', borderRadius: '999px', border: '1px solid var(--primary-100)' }}>
              1) Confirmar pedido
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.6rem', background: 'white', borderRadius: '999px', border: '1px solid var(--primary-100)' }}>
              2) Preparar en Logística
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.6rem', background: 'white', borderRadius: '999px', border: '1px solid var(--primary-100)' }}>
              3) Despachar (si aplica)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.6rem', background: 'white', borderRadius: '999px', border: '1px solid var(--primary-100)' }}>
              4) Facturar
            </span>
          </div>
          <span style={{ fontSize: '0.9rem' }}>
            Usa el botón “Ir a Logística” para preparar y despachar. Luego regresa aquí para facturar cuando el pedido esté listo.
          </span>
        </div>
      )}

      {!empresaConfigLoading && puedeGenerarFactura && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <GenerarFacturaButton
            pedidoId={pedidoId}
            onSuccess={loadPedido}
            config={facturaButtonConfig}
            onGenerated={handleFacturaGenerada}
          />
        </div>
      )}

      {requierePasosLogisticaPrevios && (
        <div
          style={{
            border: '1px dashed var(--primary-200)',
            borderRadius: 'var(--border-radius)',
            padding: '1rem',
            background: 'var(--primary-50)',
            color: 'var(--primary-700)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            flexWrap: 'wrap'
          }}
        >
          <div>
            <strong>Flujo logístico activo</strong>
            <p style={{ margin: '0.25rem 0 0 0', color: 'var(--primary-600)' }}>
              Completa la preparación y despacho en Inventario → Logística para avanzar el pedido a
              LISTO_FACTURAR y habilitar la emisión de la factura.
            </p>
          </div>
          <button
            onClick={() => {
              const target =
                pedido.estado === EstadoPedido.EN_PREPARACION
                  ? '/dashboard/inventario/logistica/listo-despacho'
                  : '/dashboard/inventario/logistica/ordenes-pendientes'
              router.push(target)
            }}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--border-radius)',
              border: 'none',
              background: 'var(--primary-600)',
              color: 'white',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {pedido.estado === EstadoPedido.EN_PREPARACION ? 'Ir a Despachos' : 'Ir a Logística'}
          </button>
        </div>
      )}

      {/* Cliente Info */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
        backdropFilter: 'blur(20px) saturate(180%)',
        borderRadius: 'var(--border-radius-lg)',
        padding: '1.5rem',
        boxShadow: 'var(--shadow-md)',
        border: '1px solid rgba(255, 255, 255, 0.3)'
      }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'var(--primary-900)', marginBottom: '1rem' }}>
          Información del Cliente
        </h3>
        {clienteInfo ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            <div>
              <p style={{ fontSize: '0.875rem', color: 'var(--primary-600)', marginBottom: '0.25rem' }}>Razón Social</p>
              <p style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--primary-900)', margin: 0 }}>
                {clienteInfo.razon_social || clienteInfo.nombre_comercial || 'N/D'}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '0.875rem', color: 'var(--primary-600)', marginBottom: '0.25rem' }}>Documento</p>
              <p style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--primary-900)', margin: 0 }}>
                {clienteInfo.documento_tipo || 'N/A'}: {clienteInfo.numero_documento || clienteInfo.documento_numero || 'N/A'}
              </p>
            </div>
          </div>
        ) : (
          <p style={{ color: 'var(--primary-500)' }}>Cliente no disponible</p>
        )}
      </div>

      {/* Productos */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
        backdropFilter: 'blur(20px) saturate(180%)',
        borderRadius: 'var(--border-radius-lg)',
        padding: '1.5rem',
        boxShadow: 'var(--shadow-md)',
        border: '1px solid rgba(255, 255, 255, 0.3)'
      }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'var(--primary-900)', marginBottom: '1rem' }}>
          Productos
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--primary-50)', borderBottom: '2px solid var(--primary-200)' }}>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: 'var(--primary-700)', textTransform: 'uppercase' }}>
                  Descripción
                </th>
                <th style={{ padding: '1rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: 'var(--primary-700)', textTransform: 'uppercase' }}>
                  Cantidad
                </th>
                <th style={{ padding: '1rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: 'var(--primary-700)', textTransform: 'uppercase' }}>
                  Precio Unit.
                </th>
                <th style={{ padding: '1rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: 'var(--primary-700)', textTransform: 'uppercase' }}>
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody>
              {pedido.detalle?.map((item, index) => (
                <tr key={index} style={{ borderBottom: '1px solid var(--primary-100)' }}>
                  <td style={{ padding: '1rem', fontSize: '0.875rem', color: 'var(--primary-900)' }}>
                    {item.descripcion}
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem', textAlign: 'right', color: 'var(--primary-900)' }}>
                    {item.cantidad}
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem', textAlign: 'right', color: 'var(--primary-900)' }}>
                    {formatCurrency(item.precio_unitario)}
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem', textAlign: 'right', fontWeight: '600', color: 'var(--primary-900)' }}>
                    {formatCurrency(item.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totales */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
        backdropFilter: 'blur(20px) saturate(180%)',
        borderRadius: 'var(--border-radius-lg)',
        padding: '1.5rem',
        boxShadow: 'var(--shadow-md)',
        border: '1px solid rgba(255, 255, 255, 0.3)'
      }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'var(--primary-900)', marginBottom: '1rem' }}>
          Totales
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '28rem', marginLeft: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
            <span style={{ color: 'var(--primary-600)' }}>Subtotal:</span>
            <span style={{ fontWeight: '500', color: 'var(--primary-900)' }}>{formatCurrency(pedido.subtotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
            <span style={{ color: 'var(--primary-600)' }}>IGV (18%):</span>
            <span style={{ fontWeight: '500', color: 'var(--primary-900)' }}>{formatCurrency(pedido.igv)}</span>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '1.125rem',
            fontWeight: '700',
            borderTop: '2px solid var(--primary-200)',
            paddingTop: '0.5rem',
            marginTop: '0.5rem',
            color: 'var(--primary-900)'
          }}>
            <span>Total:</span>
            <span>{formatCurrency(pedido.total)}</span>
          </div>
        </div>
      </div>

      {/* Observaciones */}
      {pedido.observaciones && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
          backdropFilter: 'blur(20px) saturate(180%)',
          borderRadius: 'var(--border-radius-lg)',
          padding: '1.5rem',
          boxShadow: 'var(--shadow-md)',
          border: '1px solid rgba(255, 255, 255, 0.3)'
        }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'var(--primary-900)', marginBottom: '1rem' }}>
            Observaciones
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--primary-700)', margin: 0, whiteSpace: 'pre-wrap' }}>
            {pedido.observaciones}
          </p>
        </div>
      )}
    </div>
  )
}
