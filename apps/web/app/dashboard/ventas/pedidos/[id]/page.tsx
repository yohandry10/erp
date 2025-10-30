'use client'

import { useState, useEffect, type CSSProperties } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { useEmpresaConfig } from '@/hooks/use-empresa-config'
import { PedidoVenta, EstadoPedido } from '@/types/ventas'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, FileText, Loader2, CheckCircle2, XCircle, ClipboardList, Truck, AlertCircle } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { 
  ConfirmarPedidoButton,
  CancelarPedidoButton,
  GenerarFacturaButton,
  StockWarning,
  FlujoPedidoTimeline
} from '@/components/ventas'
import GreModal from '@/components/modals/GreModal'

const ESTADO_COLORS: Record<EstadoPedido, string> = {
  [EstadoPedido.PENDIENTE]: 'bg-yellow-100 text-yellow-800',
  [EstadoPedido.PENDIENTE_APROBACION]: 'bg-orange-100 text-orange-800',
  [EstadoPedido.CONFIRMADO]: 'bg-blue-100 text-blue-800',
  [EstadoPedido.EN_PREPARACION]: 'bg-purple-100 text-purple-800',
  [EstadoPedido.LISTO_DESPACHO]: 'bg-indigo-100 text-indigo-800',
  [EstadoPedido.DESPACHO_PARCIAL]: 'bg-amber-100 text-amber-800',
  [EstadoPedido.LISTO_FACTURAR]: 'bg-green-100 text-green-800',
  [EstadoPedido.FACTURADO]: 'bg-teal-100 text-teal-800',
  [EstadoPedido.COMPLETADO]: 'bg-gray-100 text-gray-800',
  [EstadoPedido.COMPLETADO_CON_GRE]: 'bg-emerald-100 text-emerald-800',
  [EstadoPedido.CANCELADO]: 'bg-red-100 text-red-800'
}

const ESTADO_LABELS: Record<EstadoPedido, string> = {
  [EstadoPedido.PENDIENTE]: 'Pendiente',
  [EstadoPedido.PENDIENTE_APROBACION]: 'Pendiente de aprobación',
  [EstadoPedido.CONFIRMADO]: 'Confirmado',
  [EstadoPedido.EN_PREPARACION]: 'En Preparación',
  [EstadoPedido.LISTO_DESPACHO]: 'Listo Despacho',
  [EstadoPedido.DESPACHO_PARCIAL]: 'Despacho parcial',
  [EstadoPedido.LISTO_FACTURAR]: 'Listo Facturar',
  [EstadoPedido.FACTURADO]: 'Facturado',
  [EstadoPedido.COMPLETADO]: 'Completado',
  [EstadoPedido.COMPLETADO_CON_GRE]: 'Completado con GRE',
  [EstadoPedido.CANCELADO]: 'Cancelado'
}

interface HistorialAprobacion {
  id: string
  decision: 'APROBADO' | 'RECHAZADO'
  motivos: string[]
  aprobado_por?: string | null
  aprobado_en: string
  created_at: string
  aprobador?: {
    nombres?: string | null
    apellidos?: string | null
    email?: string | null
  } | null
}

interface EventoLogistico {
  id: string
  tipo: string
  datos?: Record<string, any> | null
  registrado_en: string
  registrado_por?: string | null
}

interface BackorderPendiente {
  id: string
  detalle_id: string
  producto_id: string
  descripcion?: string | null
  cantidad_comprometida: number
  cantidad_pendiente: number
  prioridad: number
  proxima_fecha_compromiso: string | null
  notas?: string | null
  ultimo_compromiso_en?: string | null
}

export default function PedidoDetallePage() {
  const router = useRouter()
  const params = useParams()
  const { get, post } = useApi()
  const { config, loading: configLoading } = useEmpresaConfig()
  
  const pedidoId = params.id as string
  
  const [pedido, setPedido] = useState<PedidoVenta | null>(null)
  const [loading, setLoading] = useState(true)
  const [historialAprobaciones, setHistorialAprobaciones] = useState<HistorialAprobacion[]>([])
  const [cargandoHistorial, setCargandoHistorial] = useState(true)
  const [registrandoDecision, setRegistrandoDecision] = useState(false)
  const [eventosLogistica, setEventosLogistica] = useState<EventoLogistico[]>([])
  const [cargandoEventos, setCargandoEventos] = useState(true)
  const [backorders, setBackorders] = useState<BackorderPendiente[]>([])
  const [cargandoBackorders, setCargandoBackorders] = useState(false)
  const [reprogramandoBackorder, setReprogramandoBackorder] = useState<string | null>(null)
  const [backorderDrafts, setBackorderDrafts] = useState<Record<string, { fecha: string; prioridad: number; nota: string }>>({})
  const [gres, setGres] = useState<any[]>([])
  const [cargandoGres, setCargandoGres] = useState(true)
  const [greModalOpen, setGreModalOpen] = useState(false)

  const sectionCardStyle: CSSProperties = {
    backgroundColor: '#ffffff',
    border: '1px solid rgba(226, 232, 240, 1)',
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '24px'
  }

  const sectionHeaderStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    marginBottom: '16px'
  }

  const infoLabelStyle: CSSProperties = {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#4b5563',
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
  }

  const inputBaseStyle: CSSProperties = {
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    padding: '8px',
    fontSize: '0.9rem',
    width: '100%',
    backgroundColor: '#ffffff'
  }

  const primaryButtonStyle: CSSProperties = {
    backgroundColor: '#2563eb',
    color: '#ffffff',
    borderRadius: '8px',
    padding: '10px 16px',
    border: 'none',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer'
  }

  const mutedButtonStyle: CSSProperties = {
    backgroundColor: '#f3f4f6',
    color: '#374151',
    borderRadius: '8px',
    padding: '8px 14px',
    border: '1px solid #e5e7eb',
    fontSize: '0.85rem',
    fontWeight: 500,
    cursor: 'pointer'
  }

  const getGreBadgeColors = (estado: string) => {
    switch ((estado ?? '').toUpperCase()) {
      case 'ACEPTADO':
        return { backgroundColor: '#dcfce7', color: '#166534' }
      case 'EMITIDO':
        return { backgroundColor: '#e0f2fe', color: '#1d4ed8' }
      case 'PENDIENTE':
        return { backgroundColor: '#f3f4f6', color: '#374151' }
      case 'RECHAZADO':
        return { backgroundColor: '#fee2e2', color: '#b91c1c' }
      case 'ANULADO':
        return { backgroundColor: '#fde68a', color: '#92400e' }
      default:
        return { backgroundColor: '#e5e7eb', color: '#374151' }
    }
  }

  const getGreEstadoLabel = (estado: string) => {
    switch ((estado ?? '').toUpperCase()) {
      case 'ACEPTADO':
        return 'Aceptado'
      case 'EMITIDO':
        return 'Emitido'
      case 'PENDIENTE':
        return 'Pendiente'
      case 'RECHAZADO':
        return 'Rechazado'
      case 'ANULADO':
        return 'Anulado'
      default:
        return estado || 'Sin estado'
    }
  }

  useEffect(() => {
    loadPedido()
    loadBackorders()
    loadGreAsociadas()
  }, [pedidoId])

  const loadPedido = async () => {
    try {
      setLoading(true)
      const response = await get(`/ventas/pedidos/${pedidoId}`)
      if (response?.success) {
        setPedido(response.data)
      }
    } catch (error) {
      console.error('Error loading pedido:', error)
      toast({
        title: 'Error',
        description: 'No se pudo cargar el pedido',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const loadBackorders = async () => {
    try {
      setCargandoBackorders(true)
      const response = await get(`/inventario/logistica/${pedidoId}/backorders`)
      let registros: BackorderPendiente[] = []

      if (response?.success) {
        registros = response.data || []
      } else if (Array.isArray(response)) {
        registros = response as BackorderPendiente[]
      }

      setBackorders(registros)

      const drafts: Record<string, { fecha: string; prioridad: number; nota: string }> = {}
      registros.forEach((item) => {
        drafts[item.detalle_id] = {
          fecha: item.proxima_fecha_compromiso ? item.proxima_fecha_compromiso.slice(0, 10) : '',
          prioridad: item.prioridad ?? 3,
          nota: ''
        }
      })
      setBackorderDrafts(drafts)
    } catch (error) {
      console.error('Error cargando backorders:', error)
      setBackorders([])
      setBackorderDrafts({})
    } finally {
      setCargandoBackorders(false)
    }
  }

  const loadGreAsociadas = async () => {
    try {
      setCargandoGres(true)
      const response = await get(`/ventas/pedidos/${pedidoId}/gres`)
      if (response?.success) {
        setGres(response.data || [])
      } else if (Array.isArray(response)) {
        setGres(response as any[])
      } else {
        setGres([])
      }
    } catch (error) {
      console.error('Error cargando GRE del pedido:', error)
      setGres([])
    } finally {
      setCargandoGres(false)
    }
  }

  const handleGreRegistrada = () => {
    setGreModalOpen(false)
    loadGreAsociadas()
    loadPedido()
  }

  const updateBackorderDraft = (
    detalleId: string,
    field: 'fecha' | 'prioridad' | 'nota',
    value: string | number,
  ) => {
    setBackorderDrafts((prev) => {
      const base = prev[detalleId] ?? { fecha: '', prioridad: 3, nota: '' }
      return {
        ...prev,
        [detalleId]: {
          fecha: field === 'fecha' ? (value as string) : base.fecha,
          prioridad: field === 'prioridad' ? Number(value) : base.prioridad,
          nota: field === 'nota' ? (value as string) : base.nota,
        },
      }
    })
  }

  const handleReprogramarBackorder = async (detalleId: string) => {
    const borrador = backorderDrafts[detalleId]
    if (!borrador || !borrador.fecha) {
      toast({
        title: 'Fecha requerida',
        description: 'Debes indicar la nueva fecha comprometida antes de reprogramar.',
        variant: 'destructive',
      })
      return
    }

    try {
      setReprogramandoBackorder(detalleId)
      const response = await post(`/inventario/logistica/${pedidoId}/backorders/${detalleId}/reprogramar`, {
        proxima_fecha_compromiso: borrador.fecha,
        prioridad: borrador.prioridad,
        nota: borrador.nota?.trim() || undefined,
      })

      if (response?.success) {
        toast({
          title: 'Backorder actualizado',
          description: 'Se registró la nueva fecha comprometida.',
        })
        await loadBackorders()
      } else {
        throw new Error(response?.message || 'No se pudo reprogramar el backorder')
      }
    } catch (error) {
      console.error('Error reprogramando backorder:', error)
      toast({
        title: 'Error',
        description: 'No se pudo reprogramar el backorder',
        variant: 'destructive',
      })
    } finally {
      setReprogramandoBackorder(null)
    }
  }
  
  const loadHistorialAprobaciones = async () => {
    try {
      setCargandoHistorial(true)
      const response = await get(`/ventas/pedidos/${pedidoId}/aprobaciones`)
      if (response?.success) {
        setHistorialAprobaciones(response.data || [])
      } else if (Array.isArray(response)) {
        setHistorialAprobaciones(response as HistorialAprobacion[])
      } else {
        setHistorialAprobaciones([])
      }
    } catch (error) {
      console.error('Error cargando historial de aprobaciones:', error)
      setHistorialAprobaciones([])
    } finally {
      setCargandoHistorial(false)
    }
  }

  const loadEventosLogistica = async () => {
    try {
      setCargandoEventos(true)
      const response = await get(`/inventario/logistica/${pedidoId}/eventos`)
      if (response?.success) {
        setEventosLogistica(response.data || [])
      } else if (Array.isArray(response)) {
        setEventosLogistica(response as EventoLogistico[])
      } else {
        setEventosLogistica([])
      }
    } catch (error) {
      console.error('Error cargando eventos logísticos:', error)
      setEventosLogistica([])
    } finally {
      setCargandoEventos(false)
    }
  }

  const handleBack = () => {
    router.push('/dashboard/ventas/pedidos')
  }

  const handleRefresh = () => {
    loadPedido()
  }

  const formatFechaHora = (fecha: string) => {
    try {
      return format(new Date(fecha), 'dd/MM/yyyy HH:mm', { locale: es })
    } catch {
      return fecha
    }
  }

  const formatFecha = (fecha: string) => {
    try {
      return format(new Date(fecha), "dd 'de' MMMM 'de' yyyy", { locale: es })
    } catch {
      return fecha
    }
  }

  const formatUnidades = (valor: number) => {
    return new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(valor)
  }


  const formatMonto = (monto: number) => {
    return `S/ ${monto.toFixed(2)}`
  }

  const handleDecision = async (decision: 'APROBADO' | 'RECHAZADO') => {
    if (!pedido) return

    const observacion = window.prompt(
      `Ingresa una observación para ${decision === 'APROBADO' ? 'aprobar' : 'rechazar'} el pedido ${pedido.numero} (opcional):`
    )

    const motivos = pedido.motivo_requiere_aprobacion
      ? pedido.motivo_requiere_aprobacion.split(';').map((motivo) => motivo.trim()).filter(Boolean)
      : []

    try {
      setRegistrandoDecision(true)
      const response = await post(`/ventas/pedidos/${pedidoId}/aprobaciones/decision`, {
        decision,
        motivos,
        observaciones: observacion || undefined,
      })

      if (response?.success) {
        toast({
          title: decision === 'APROBADO' ? 'Pedido aprobado' : 'Pedido rechazado',
          description: `Se registró la decisión para el pedido ${pedido.numero}`,
        })
        await loadPedido()
        await loadHistorialAprobaciones()
      } else {
        throw new Error(response?.message || 'No se pudo registrar la decisión')
      }
    } catch (error) {
      console.error('Error registrando decisión de aprobación:', error)
      toast({
        title: 'Error',
        description: 'No se pudo registrar la decisión, inténtalo nuevamente',
        variant: 'destructive',
      })
    } finally {
      setRegistrandoDecision(false)
    }
  }

  if (loading || configLoading) {
    return (
      <div className="dashboard-container">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </div>
    )
  }

  if (!pedido) {
    return (
      <div className="dashboard-container">
        <div className="text-center py-12">
          <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Pedido no encontrado
          </h3>
          <Button onClick={handleBack} variant="outline">
            Volver a Pedidos
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={handleBack}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver a Pedidos
        </Button>
        
        <div className="flex justify-between items-start">
          <div>
            <h1 className="dashboard-title">Pedido {pedido.numero}</h1>
            <p className="dashboard-subtitle">
              Creado el {formatFecha(pedido.created_at)}
            </p>
          </div>
          <Badge className={ESTADO_COLORS[pedido.estado]}>
            {ESTADO_LABELS[pedido.estado]}
          </Badge>
        </div>
      </div>

      {/* Timeline */}
      <div className="mb-6">
        <FlujoPedidoTimeline
          estadoActual={pedido.estado}
          usarFlujoLogistica={config?.usar_flujo_logistica || false}
        />
      </div>

      {/* Action Buttons - Dynamic based on state and config */}
      <div className="mb-6 flex gap-4">
        {/* Flujo Simple */}
        {!config?.usar_flujo_logistica && pedido.estado === EstadoPedido.PENDIENTE && (
          <ConfirmarPedidoButton
            pedidoId={pedido.id}
            onSuccess={handleRefresh}
          />
        )}

        {!config?.usar_flujo_logistica && pedido.estado === EstadoPedido.CONFIRMADO && (
          <>
            <GenerarFacturaButton
              pedidoId={pedido.id}
              onSuccess={handleRefresh}
              config={{
                usar_flujo_logistica: config?.usar_flujo_logistica || false,
                gre_automatico_habilitado: config?.gre_automatico_habilitado !== false,
                gre_obligatorio: config?.gre_obligatorio || false
              }}
            />
            <CancelarPedidoButton
              pedidoId={pedido.id}
              onSuccess={handleRefresh}
            />
          </>
        )}

        {/* Flujo Completo */}
        {config?.usar_flujo_logistica && pedido.estado === EstadoPedido.CONFIRMADO && (
          <>
            <Button
              variant="outline"
              onClick={() => router.push('/dashboard/inventario/logistica/ordenes-pendientes')}
            >
              Ver en Inventario
            </Button>
            <CancelarPedidoButton
              pedidoId={pedido.id}
              onSuccess={handleRefresh}
            />
          </>
        )}

        {/* Common for both flows */}
        {pedido.estado === EstadoPedido.LISTO_FACTURAR && (
          <GenerarFacturaButton
            pedidoId={pedido.id}
            onSuccess={handleRefresh}
            config={{
              usar_flujo_logistica: config?.usar_flujo_logistica || false,
              gre_automatico_habilitado: config?.gre_automatico_habilitado !== false,
              gre_obligatorio: config?.gre_obligatorio || false
            }}
          />
        )}

        {/* Cancel button for other states */}
        {[EstadoPedido.PENDIENTE, EstadoPedido.EN_PREPARACION, EstadoPedido.LISTO_DESPACHO].includes(pedido.estado) && (
          <CancelarPedidoButton
            pedidoId={pedido.id}
            onSuccess={handleRefresh}
          />
        )}
      </div>

      {/* Status Messages */}
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Aprobaciones y control de crédito</h2>
              <p className="text-sm text-gray-500">
                {pedido.motivo_requiere_aprobacion
                  ? 'El pedido requiere autorización antes de continuar con el flujo.'
                  : 'No hay restricciones de aprobación pendientes para este pedido.'}
              </p>
            </div>
            {renderEstadoCreditoBadge(pedido.estado_credito)}
          </div>
          {pedido.motivo_requiere_aprobacion && (
            <div className="mt-4 bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-orange-800">
                <AlertCircle className="w-4 h-4" />
                Motivos registrados
              </div>
              <p className="text-sm text-orange-700 mt-2 whitespace-pre-line">
                {pedido.motivo_requiere_aprobacion}
              </p>
            </div>
          )}
          {pedido.estado === EstadoPedido.PENDIENTE_APROBACION && (
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                onClick={() => handleDecision('APROBADO')}
                disabled={registrandoDecision}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Aprobar pedido
              </Button>
              <Button
                variant="outline"
                onClick={() => handleDecision('RECHAZADO')}
                disabled={registrandoDecision}
                className="border-red-200 text-red-600 hover:bg-red-50"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Rechazar pedido
              </Button>
            </div>
          )}
          <div className="mt-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <ClipboardList className="w-4 h-4" />
              Historial de decisiones
            </div>
            {cargandoHistorial ? (
              <p className="text-sm text-gray-500 mt-2">Cargando historial...</p>
            ) : historialAprobaciones.length === 0 ? (
              <p className="text-sm text-gray-500 mt-2">
                No se han registrado decisiones para este pedido.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {historialAprobaciones.map((item) => (
                  <div
                    key={item.id}
                    className="border border-slate-100 rounded-lg p-3 flex items-start justify-between gap-4"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {item.decision === 'APROBADO' ? 'Aprobado' : 'Rechazado'}
                      </p>
                      {item.motivos.length > 0 && (
                        <ul className="text-xs text-slate-600 list-disc list-inside mt-1">
                          {item.motivos.map((motivo) => (
                            <li key={motivo}>{motivo}</li>
                          ))}
                        </ul>
                      )}
                      {item.aprobador && (
                        <p className="text-xs text-slate-500 mt-1">
                          Por {[item.aprobador?.nombres, item.aprobador?.apellidos].filter(Boolean).join(' ') || '—'}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">
                      {formatFechaHora(item.aprobado_en)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      {config?.usar_flujo_logistica && pedido.estado === EstadoPedido.CONFIRMADO && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            ℹ️ Esperando preparación en almacén
          </p>
        </div>
      )}

      {!config?.usar_flujo_logistica && pedido.estado === EstadoPedido.CONFIRMADO && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-800">
            ✓ Stock: RESERVADO
          </p>
        </div>
      )}

      {/* Backorders */}
      <div style={sectionCardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#111827' }}>Backorders y reprogramaciones</h3>
            <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '0.9rem' }}>
              Gestiona los compromisos de entrega pendientes y prioriza según la urgencia del cliente.
            </p>
          </div>
          <span style={{ fontSize: '0.9rem', color: '#6b7280' }}>
            {backorders.length} pendiente{backorders.length === 1 ? '' : 's'} · {formatUnidades(backorders.reduce((acc, item) => acc + item.cantidad_pendiente, 0))} uds
          </span>
        </div>
        {cargandoBackorders ? (
          <div style={{ padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#64748b' }}>
            <Loader2 style={{ width: 20, height: 20, color: '#2563eb', animation: 'spin 1s linear infinite' }} />
            <span>Cargando backorders...</span>
          </div>
        ) : backorders.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: 0 }}>No hay backorders registrados para este pedido.</p>
        ) : (
          <div>
            {backorders.map((item) => {
              const borrador = backorderDrafts[item.detalle_id] ?? {
                fecha: item.proxima_fecha_compromiso ? item.proxima_fecha_compromiso.slice(0, 10) : '',
                prioridad: item.prioridad ?? 3,
                nota: ''
              }

              return (
                <div key={item.id} style={{ borderTop: '1px solid #e2e8f0', padding: '16px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ minWidth: '200px' }}>
                      <div style={{ fontWeight: 600, color: '#1f2937' }}>{item.descripcion || item.producto_id}</div>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Detalle {item.detalle_id}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Pendiente</div>
                      <div style={{ fontWeight: 600, color: '#b45309' }}>{formatUnidades(item.cantidad_pendiente)} uds</div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                    <div>
                      <label style={infoLabelStyle}>Prioridad</label>
                      <select
                        value={borrador.prioridad}
                        onChange={(e) => updateBackorderDraft(item.detalle_id, 'prioridad', Number(e.target.value))}
                        style={inputBaseStyle}
                      >
                        {[1, 2, 3, 4, 5].map((nivel) => (
                          <option key={nivel} value={nivel}>
                            P{nivel}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={infoLabelStyle}>Próxima fecha</label>
                      <input
                        type="date"
                        value={borrador.fecha}
                        onChange={(e) => updateBackorderDraft(item.detalle_id, 'fecha', e.target.value)}
                        style={inputBaseStyle}
                      />
                      {item.ultimo_compromiso_en && (
                        <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                          Última actualización: {formatFechaHora(item.ultimo_compromiso_en)}
                        </p>
                      )}
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={infoLabelStyle}>Nota interna</label>
                      <textarea
                        rows={2}
                        value={borrador.nota}
                        onChange={(e) => updateBackorderDraft(item.detalle_id, 'nota', e.target.value)}
                        style={{ ...(inputBaseStyle), resize: 'vertical' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => handleReprogramarBackorder(item.detalle_id)}
                      disabled={reprogramandoBackorder === item.detalle_id}
                      style={{
                        ...primaryButtonStyle,
                        opacity: reprogramandoBackorder === item.detalle_id ? 0.7 : 1,
                        cursor: reprogramandoBackorder === item.detalle_id ? 'wait' : 'pointer'
                      }}
                    >
                      {reprogramandoBackorder === item.detalle_id ? 'Actualizando...' : 'Actualizar reprogramación'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={sectionCardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#111827' }}>Guías de Remisión asociadas</h3>
            <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '0.9rem' }}>
              Gestiona múltiples GRE para los despachos parciales registrados.
            </p>
          </div>
          <button
            onClick={() => setGreModalOpen(true)}
            style={{
              ...primaryButtonStyle,
              opacity: pedido ? 1 : 0.5,
              cursor: pedido ? 'pointer' : 'not-allowed'
            }}
            disabled={!pedido}
          >
            + Registrar GRE
          </button>
        </div>

        {cargandoGres ? (
          <div style={{ padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#64748b' }}>
            <Loader2 style={{ width: 20, height: 20, color: '#2563eb', animation: 'spin 1s linear infinite' }} />
            <span>Cargando guías asociadas...</span>
          </div>
        ) : gres.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: 0 }}>Aún no se han registrado GRE para este pedido.</p>
        ) : (
          <div>
            {gres.map((registro) => {
              const gre = registro.gre
              const badgeColors = getGreBadgeColors(gre?.estado || registro.estado)

              return (
                <div key={registro.id} style={{ borderTop: '1px solid #e2e8f0', padding: '16px 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ minWidth: '200px' }}>
                    <div style={{ fontWeight: 600, color: '#1f2937' }}>{gre?.numero || 'GRE removida'}</div>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{new Date(registro.creado_en).toLocaleString('es-PE')}</div>
                    {gre?.destinatario && (
                      <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{gre.destinatario}</div>
                    )}
                  </div>
                  <div>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        borderRadius: '9999px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        backgroundColor: badgeColors.backgroundColor,
                        color: badgeColors.color
                      }}
                    >
                      {getGreEstadoLabel(gre?.estado || registro.estado)}
                    </span>
                  </div>
                  <div>
                    <button
                      onClick={() => gre?.id && router.push(`/dashboard/gre?gre=${gre.id}`)}
                      style={{
                        ...mutedButtonStyle,
                        opacity: gre?.id ? 1 : 0.5,
                        cursor: gre?.id ? 'pointer' : 'not-allowed'
                      }}
                      disabled={!gre?.id}
                    >
                      Ver detalle
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Cliente Info */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Información del Cliente</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-gray-600">Razón Social</label>
            <p className="font-medium">{pedido.cliente?.razon_social || 'N/A'}</p>
          </div>
          <div>
            <label className="text-sm text-gray-600">Documento</label>
            <p className="font-medium">
              {pedido.cliente?.documento_tipo} {pedido.cliente?.documento_numero}
            </p>
          </div>
          {pedido.cliente?.direccion && (
            <div className="md:col-span-2">
              <label className="text-sm text-gray-600">Dirección</label>
              <p className="font-medium">{pedido.cliente.direccion}</p>
            </div>
          )}
        </div>
      </div>

      {/* Productos */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Productos</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Descripción
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Cantidad
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Precio Unit.
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pedido.detalle.map((item) => (
                <tr key={item.id}>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {item.descripcion}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 text-right">
                    {item.cantidad}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 text-right">
                    {formatMonto(item.precio_unitario)}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 text-right">
                    {formatMonto(item.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totales */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Totales</h3>
        <div className="space-y-2 max-w-md ml-auto">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Subtotal:</span>
            <span className="font-medium">{formatMonto(pedido.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">IGV (18%):</span>
            <span className="font-medium">{formatMonto(pedido.igv)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold border-t pt-2">
            <span>Total:</span>
            <span>{formatMonto(pedido.total)}</span>
          </div>
          {pedido.estado_credito && (
            <div className="flex justify-between items-center pt-2 border-t text-sm">
              <span className="text-gray-600">Estado crédito:</span>
              <Badge variant="outline" className="uppercase tracking-wide">
                {pedido.estado_credito}
              </Badge>
            </div>
          )}
        </div>
      </div>

      {/* Notas */}
      {pedido.notas && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Notas</h3>
          <p className="text-gray-700 whitespace-pre-wrap">{pedido.notas}</p>
        </div>
      )}

      <GreModal
        isOpen={greModalOpen}
        onClose={() => setGreModalOpen(false)}
        onSuccess={handleGreRegistrada}
        pedidoContext={
          pedido
            ? {
                id: pedido.id,
                numero: pedido.numero,
                clienteNombre:
                  pedido.cliente?.razon_social ||
                  pedido.cliente?.nombre_comercial ||
                  [pedido.cliente?.nombres, pedido.cliente?.apellidos].filter(Boolean).join(' ').trim() ||
                  'Cliente',
                clienteDireccion: pedido.cliente?.direccion ?? null
              }
            : undefined
        }
      />

      <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  )
}

















