'use client'

import { useState, useCallback, useEffect } from 'react'
import { parseDateLocal } from '@/lib/date-utils'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useApi } from '@/hooks/use-api'
import { useEmpresaConfig } from '@/hooks/use-empresa-config'
import { usePermission } from '@/hooks/use-permission'
import { PedidoVenta } from '@/types/ventas'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Package, RefreshCw, ShieldAlert } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { PreparacionPedidoModal } from '@/components/ventas/PreparacionPedidoModal'
import { LogisticsDisabledState } from '../LogisticsDisabledState'

export default function OrdenesPendientesPage() {
  const router = useRouter()
  const { get } = useApi()
  const { loading: configLoading, isFlujologistica } = useEmpresaConfig()
  const {
    hasPermission: canViewLogistics,
    loading: permissionLoading,
  } = usePermission('inventario', 'ver', 'logistica')

  const [ordenes, setOrdenes] = useState<PedidoVenta[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPedido, setSelectedPedido] = useState<PedidoVenta | null>(null)
  const [showPreparacionModal, setShowPreparacionModal] = useState(false)

  const loadOrdenes = useCallback(async () => {
    if (!isFlujologistica || permissionLoading || !canViewLogistics) return

    try {
      setLoading(true)
      const response = await get('/inventario/logistica/ordenes-pendientes')
      if (response?.success) {
        setOrdenes(response.data || [])
      } else if (Array.isArray(response)) {
        setOrdenes(response)
      }
    } catch (error) {
      console.error('Error loading ordenes:', error)
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las órdenes pendientes',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }, [canViewLogistics, get, isFlujologistica, permissionLoading])

  useEffect(() => {
    loadOrdenes()
  }, [loadOrdenes])

  const handlePreparar = async (pedido: PedidoVenta) => {
    setSelectedPedido(pedido)
    setShowPreparacionModal(true)
  }

  const formatFecha = (fecha: string) => {
    try {
      return format(parseDateLocal(fecha), 'dd/MM/yyyy', { locale: es })
    } catch {
      return fecha
    }
  }

  if (configLoading || permissionLoading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="flex min-h-48 items-center justify-center">
          <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
          <p>Validando acceso a Logística...</p>
        </div>
      </div>
    )
  }

  if (!canViewLogistics) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6">
        <div className="rounded-2xl border border-border bg-card/95 p-12 text-center text-card-foreground shadow-md">
          <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-60" />
          <h1 className="mb-2 text-2xl font-bold">Acceso denegado</h1>
          <p className="text-muted-foreground">
            El rol actual no puede preparar ni despachar pedidos. El equipo de Logística continuará este flujo.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link href="/dashboard/ventas/pedidos/">Volver a Pedidos</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (!isFlujologistica) {
    return (
      <LogisticsDisabledState
        icon={Package}
        title="Activa logística para preparar pedidos"
        description="Esta pantalla organiza los pedidos confirmados antes del despacho. Activa el flujo logístico para que almacén pueda preparar productos, marcar pedidos listos y entregar una trazabilidad clara."
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Órdenes Pendientes de Preparación</h1>
          <p className="mt-2 text-base text-muted-foreground">Gestiona los pedidos confirmados listos para preparar</p>
        </div>
        <Button onClick={loadOrdenes} variant="outline">
          <RefreshCw />
          Actualizar
        </Button>
      </div>

      <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
        {loading ? (
          <div className="flex min-h-48 items-center justify-center">
            <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
            <p>Cargando órdenes...</p>
          </div>
        ) : ordenes.length === 0 ? (
          <div className="px-4 py-10 text-center text-muted-foreground">
            <Package />
            <h3>No hay órdenes pendientes</h3>
            <p>Todas las órdenes han sido procesadas</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>N° Pedido</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Cantidad de Ítems</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {ordenes.map((orden) => (
                <tr key={orden.id}>
                  <td>
                    <div>
                      <strong>{orden.numero}</strong>
                      <Badge className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-400 dark:text-emerald-300">Confirmado</Badge>
                    </div>
                  </td>
                  <td>
                    <div>
                      <div>{orden.cliente?.razon_social || 'N/A'}</div>
                      <small>{orden.cliente?.documento_numero || ''}</small>
                    </div>
                  </td>
                  <td>{formatFecha((orden as any).fecha_pedido ?? (orden as any).fecha)}</td>
                  <td>{orden.detalle?.length || 0}</td>
                  <td>
                    <Button
                      onClick={() => handlePreparar(orden)}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                      size="sm"
                    >
                      <Package />
                      Preparar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && ordenes.length > 0 && (
        <div className="mt-2 text-[0.8125rem] text-muted-foreground">
          {ordenes.length} {ordenes.length === 1 ? 'orden pendiente' : 'órdenes pendientes'}
        </div>
      )}

      {showPreparacionModal && selectedPedido && (
        <PreparacionPedidoModal
          pedido={selectedPedido}
          onClose={() => {
            setShowPreparacionModal(false)
            setSelectedPedido(null)
          }}
          onSuccess={loadOrdenes}
        />
      )}
    </div>
  )
}
