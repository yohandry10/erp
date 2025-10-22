'use client'

import { useEffect, useMemo, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/components/ui/use-toast'
import { CheckCircle2, AlertCircle, RefreshCw, XCircle } from 'lucide-react'

interface ClienteResumen {
  razon_social?: string
  documento_numero?: string
}

interface ResumenCredito {
  limite?: number
  pendiente?: number
  tieneVencidos?: boolean
  permiteMorosidad?: boolean
}

interface PedidoPendiente {
  id: string
  numero: string
  cliente?: ClienteResumen | null
  total: number
  created_at?: string
  estado_credito?: string
  motivo_requiere_aprobacion?: string | null
  motivos: string[]
  resumen_credito?: ResumenCredito | null
}

const ESTADO_CREDITO_COLOR: Record<string, { bg: string; text: string }> = {
  BLOQUEADO: { bg: 'rgba(239, 68, 68, 0.12)', text: '#dc2626' },
  REVISION: { bg: 'rgba(234, 179, 8, 0.15)', text: '#b45309' },
  APROBADO: { bg: 'rgba(34, 197, 94, 0.12)', text: '#15803d' },
  APROBADO_MANUAL: { bg: 'rgba(34, 197, 94, 0.12)', text: '#15803d' },
  OK: { bg: 'rgba(34, 197, 94, 0.12)', text: '#15803d' },
  SIN_EVALUAR: { bg: 'rgba(148, 163, 184, 0.12)', text: '#475569' },
}

function formatCurrency(value?: number) {
  if (value == null) return 'S/ 0.00'
  return `S/ ${value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function AprobacionesPage() {
  const { get, post } = useApi()
  const [loading, setLoading] = useState(true)
  const [decidingId, setDecidingId] = useState<string | null>(null)
  const [data, setData] = useState<PedidoPendiente[]>([])

  const totalPendiente = useMemo(
    () => data.reduce((sum, pedido) => sum + (pedido.total || 0), 0),
    [data],
  )

  const loadPendientes = async () => {
    try {
      setLoading(true)
      const response = await get('/ventas/pedidos/aprobaciones/pendientes')

      if (response?.success) {
        setData(response.data || [])
      } else if (Array.isArray(response)) {
        setData(response as PedidoPendiente[])
      } else {
        setData([])
      }
    } catch (error) {
      console.error('Error al cargar aprobaciones pendientes:', error)
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los pedidos pendientes de aprobación',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPendientes()
  }, [])

  const handleDecision = async (pedido: PedidoPendiente, decision: 'APROBADO' | 'RECHAZADO') => {
    const observaciones = window.prompt(
      `Ingresa una observación para ${decision === 'APROBADO' ? 'aprobar' : 'rechazar'} el pedido ${pedido.numero} (opcional):`,
    )

    try {
      setDecidingId(pedido.id)
      const response = await post(`/ventas/pedidos/${pedido.id}/aprobaciones/decision`, {
        decision,
        motivos: pedido.motivos,
        observaciones: observaciones || undefined,
      })

      if (response?.success) {
        toast({
          title: decision === 'APROBADO' ? 'Pedido aprobado' : 'Pedido rechazado',
          description: `El pedido ${pedido.numero} fue ${decision === 'APROBADO' ? 'aprobado' : 'rechazado'} correctamente`,
        })
        loadPendientes()
      } else {
        throw new Error(response?.message || 'Operación no completada')
      }
    } catch (error) {
      console.error('Error registrando decisión:', error)
      toast({
        title: 'Error',
        description: 'No pudimos registrar la decisión de aprobación',
        variant: 'destructive',
      })
    } finally {
      setDecidingId(null)
    }
  }

  const renderEstadoCredito = (estado?: string) => {
    if (!estado) {
      estado = 'SIN_EVALUAR'
    }

    const style = ESTADO_CREDITO_COLOR[estado] || ESTADO_CREDITO_COLOR.SIN_EVALUAR
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0.25rem 0.75rem',
          borderRadius: '9999px',
          backgroundColor: style.bg,
          color: style.text,
          fontSize: '0.75rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {estado}
      </span>
    )
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="dashboard-title">Bandeja de Aprobaciones</h1>
          <p className="dashboard-subtitle">
            Gestiona pedidos que requieren autorización por crédito, descuentos o límites configurados
          </p>
        </div>
        <Button variant="outline" onClick={loadPendientes} disabled={loading}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualizar
        </Button>
      </div>

      <div style={{ display: 'grid', gap: '1.5rem' }}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-semibold">Resumen</CardTitle>
            <Badge variant="secondary">{data.length} pendientes</Badge>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-slate-500">Pedidos en espera</p>
              <p className="text-2xl font-semibold text-slate-900">{data.length}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Monto comprometido</p>
              <p className="text-2xl font-semibold text-slate-900">{formatCurrency(totalPendiente)}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Última actualización</p>
              <p className="text-2xl font-semibold text-slate-900">
                {new Date().toLocaleString('es-PE')}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200">
          {loading ? (
            <div className="p-12 text-center text-slate-500">Cargando pedidos pendientes...</div>
          ) : data.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-500" />
              No hay pedidos pendientes de aprobación
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.map((pedido) => (
                <div key={pedido.id} className="p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-lg font-semibold text-slate-900">{pedido.numero}</h3>
                      {renderEstadoCredito(pedido.estado_credito)}
                      <Badge variant="outline">{formatCurrency(pedido.total)}</Badge>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      {pedido.cliente?.razon_social || 'Cliente no asignado'} · {pedido.cliente?.documento_numero || '—'}
                    </p>

                    {pedido.motivos.length > 0 && (
                      <div className="mt-3 flex flex-col gap-1">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Motivos</span>
                        <ul className="text-sm text-slate-700 list-disc list-inside space-y-1">
                          {pedido.motivos.map((motivo) => (
                            <li key={motivo}>{motivo}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {pedido.resumen_credito && (
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
                        <Badge variant="secondary">
                          Límite: {formatCurrency(pedido.resumen_credito.limite)}
                        </Badge>
                        <Badge variant="secondary">
                          Pendiente: {formatCurrency(pedido.resumen_credito.pendiente)}
                        </Badge>
                        <Badge variant={pedido.resumen_credito.tieneVencidos ? 'destructive' : 'outline'}>
                          {pedido.resumen_credito.tieneVencidos ? 'Con morosidad' : 'Sin morosidad'}
                        </Badge>
                        <Badge variant="outline">
                          {pedido.resumen_credito.permiteMorosidad ? 'Permite mora' : 'No permite mora'}
                        </Badge>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                    <Button
                      variant="default"
                      className="bg-emerald-600 hover:bg-emerald-700"
                      disabled={decidingId === pedido.id}
                      onClick={() => handleDecision(pedido, 'APROBADO')}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Aprobar
                    </Button>
                    <Button
                      variant="outline"
                      className="border-red-200 text-red-600 hover:bg-red-50"
                      disabled={decidingId === pedido.id}
                      onClick={() => handleDecision(pedido, 'RECHAZADO')}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Rechazar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
