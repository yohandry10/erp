'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import GreModal from '@/components/modals/GreModal'
import { useApi } from '@/hooks/use-api'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

type PedidoDetalle = {
  descripcion?: string
  cantidad?: number
}

type PedidoOrigen = {
  id: string
  numero: string
  tenant_id?: string
  tenantId?: string
  detalle?: PedidoDetalle[]
  cliente?: {
    razon_social?: string
    nombre_comercial?: string
    direccion?: string | null
    documento_tipo?: string | null
    tipo_documento?: string | null
    documento_numero?: string | null
    numero_documento?: string | null
    ruc?: string | null
  } | null
  clientes?: {
    razon_social?: string
    nombre_comercial?: string
    direccion?: string | null
    documento_tipo?: string | null
    tipo_documento?: string | null
    documento_numero?: string | null
    numero_documento?: string | null
    ruc?: string | null
  } | null
}

function NuevaGreContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pedidoId = searchParams.get('pedido_id')
  const despacho = searchParams.get('despacho')
  const { get } = useApi()
  const [pedido, setPedido] = useState<PedidoOrigen | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadPedido = useCallback(async () => {
    if (!pedidoId) {
      setError('Seleccione un pedido origen para generar la GRE.')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const response = await get(`/ventas/pedidos/${pedidoId}`)
      if (!response?.success || !response.data) {
        throw new Error(response?.message || 'No se pudo cargar el pedido origen.')
      }
      setPedido(response.data)
    } catch (err: any) {
      setError(err?.message || 'No se pudo cargar el pedido origen.')
    } finally {
      setLoading(false)
    }
  }, [get, pedidoId])

  useEffect(() => {
    loadPedido()
  }, [loadPedido])

  const cliente = pedido?.cliente ?? pedido?.clientes ?? null
  const clienteDocumentoTipo = cliente?.documento_tipo || cliente?.tipo_documento || 'RUC'
  const clienteDocumentoNumero = cliente?.documento_numero || cliente?.numero_documento || cliente?.ruc || ''

  const pedidoContext = useMemo(() => {
    if (!pedido) return undefined
    return {
      id: pedido.id,
      numero: pedido.numero,
      clienteNombre: cliente?.razon_social || cliente?.nombre_comercial || 'Cliente sin nombre',
      clienteDireccion: cliente?.direccion || '',
      tenantId: pedido.tenant_id || pedido.tenantId || '',
    }
  }, [cliente, pedido])

  const handleSuccess = (data?: any) => {
    const greId = data?.id ? `?created=${encodeURIComponent(data.id)}` : ''
    router.push(`/dashboard/gre${greId}`)
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="inline-flex items-center gap-3 rounded-xl border border-cyan-300/20 bg-card/70 px-4 py-3 text-sm font-semibold text-primary">
          <Loader2 className="h-5 w-5 animate-spin" />
          Cargando pedido origen...
        </div>
      </div>
    )
  }

  if (error || !pedido || !pedidoContext) {
    return (
      <div className="grid gap-4 p-6">
        <div className="rounded-xl border border-cyan-300/20 bg-card/80 p-4 font-semibold text-primary">
          {error || 'No se pudo preparar la GRE.'}
        </div>
        <Button
          onClick={() => router.push('/dashboard/gre')}
          className="w-fit gap-2 bg-cyan-400 text-foreground hover:bg-cyan-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a GRE
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-5 p-6">
      <div className="rounded-2xl border border-cyan-300/20 bg-card/80 p-5 text-primary shadow-xl shadow-blue-950/20">
        <h1 className="text-2xl font-black tracking-tight text-white">
          Nueva Guía de Remisión Electrónica
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pedido origen {pedido.numero}. Los ítems y cantidades se tomarán del pedido para generar el detalle real de la GRE.
        </p>
        {pedido.detalle?.length ? (
          <ul className="mt-3 grid gap-1 text-sm text-muted-foreground">
            {pedido.detalle.map((item, index) => (
              <li key={`${item.descripcion || 'item'}-${index}`} className="rounded-lg border border-cyan-300/10 bg-cyan-400/5 px-3 py-2">
                {item.descripcion || 'Producto'} x {Number(item.cantidad || 0)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <GreModal
        isOpen
        onClose={() => router.push('/dashboard/gre')}
        onSuccess={handleSuccess}
        pedidoContext={pedidoContext}
        additionalPayload={{
          ...(despacho ? { despachosAsociados: [despacho] } : {}),
          datosAdicionales: {
            origen: 'UI_PEDIDO',
            pedidoNumero: pedido.numero,
            destinatarioDocumentoTipo: clienteDocumentoTipo === 'RUC' ? '6' : clienteDocumentoTipo,
            destinatarioDocumento: clienteDocumentoNumero,
            ...(despacho ? { despacho } : {}),
          },
        }}
      />
    </div>
  )
}

export default function NuevaGrePage() {
  return (
    <Suspense fallback={null}>
      <NuevaGreContent />
    </Suspense>
  )
}
