'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle, Clock, DollarSign, Download, Eye, FileText, History, RefreshCw, XCircle } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { ProtectedComponent } from '@/components/auth/ProtectedComponent'
import { CobroModal, HistorialDrawer, NotaCreditoModal, ReprogramarModal } from '@/components/finanzas'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type EstadoCxc = 'PENDIENTE' | 'PARCIAL' | 'CANCELADO' | 'VENCIDO'

type CuentaPorCobrar = {
  id: string
  serie: string | null
  numero: string | null
  cliente_id: string
  fecha_emision: string | null
  fecha_vencimiento: string | null
  estado: string | null
  total: number
  saldo: number
  moneda: string
  tipo_documento: string | null
  observaciones?: string | null
  clientes?: {
    razon_social: string
    documento_numero: string | null
  }
}

type ClienteLigero = {
  id: string
  razon_social?: string | null
  nombre_comercial?: string | null
}

const ESTADO_META: Record<EstadoCxc, { label: string; className: string; icon: typeof Clock }> = {
  PENDIENTE: {
    label: 'Pendiente',
    className: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
    icon: Clock,
  },
  PARCIAL: {
    label: 'Parcial',
    className: 'border-blue-300/25 bg-blue-300/10 text-blue-100',
    icon: AlertCircle,
  },
  CANCELADO: {
    label: 'Cancelado',
    className: 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100',
    icon: CheckCircle,
  },
  VENCIDO: {
    label: 'Vencido',
    className: 'border-slate-300/25 bg-slate-300/10 text-slate-100',
    icon: XCircle,
  },
}

const normalizeEstadoCxc = (estado: string | null | undefined): EstadoCxc | null => {
  const normalized = String(estado ?? '').trim().toUpperCase()
  return normalized in ESTADO_META ? (normalized as EstadoCxc) : null
}

const initialFilters = {
  estado: '' as '' | EstadoCxc,
  clienteId: '',
  vencimientoDesde: '',
  vencimientoHasta: '',
  search: '',
}

const inputClass =
  'w-full rounded-xl border border-cyan-400/20 bg-slate-950/75 px-3 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10'

const labelClass = 'text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200/70'

export default function CuentasPorCobrarPage() {
  const router = useRouter()
  const { get } = useApi()

  const [cuentas, setCuentas] = useState<CuentaPorCobrar[]>([])
  const [clientes, setClientes] = useState<ClienteLigero[]>([])
  const [filters, setFilters] = useState(initialFilters)
  const [loading, setLoading] = useState(true)
  const [selectedCuenta, setSelectedCuenta] = useState<CuentaPorCobrar | null>(null)
  const [showCobro, setShowCobro] = useState(false)
  const [showNotaCredito, setShowNotaCredito] = useState(false)
  const [showReprogramar, setShowReprogramar] = useState(false)
  const [showHistorial, setShowHistorial] = useState(false)
  const [detalleHistorial, setDetalleHistorial] = useState<any | null>(null)
  const [loadingHistorial, setLoadingHistorial] = useState(false)

  const fetchCuentas = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filters.estado) params.append('estado', filters.estado)
      if (filters.clienteId) params.append('cliente_id', filters.clienteId)
      if (filters.vencimientoDesde) params.append('desde', filters.vencimientoDesde)
      if (filters.vencimientoHasta) params.append('hasta', filters.vencimientoHasta)
      if (filters.search) params.append('search', filters.search.trim())

      const endpoint = params.toString() ? `/finanzas/cxc?${params.toString()}` : '/finanzas/cxc'
      const response = await get(endpoint)
      setCuentas(response?.success && Array.isArray(response.data) ? (response.data as CuentaPorCobrar[]) : [])
    } catch (error) {
      console.error('Error cargando cuentas por cobrar', error)
      setCuentas([])
    } finally {
      setLoading(false)
    }
  }, [filters, get])

  const fetchClientes = useCallback(async () => {
    try {
      const response = await get('/ventas/clientes?limit=1000')
      const data = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : []
      setClientes(data as ClienteLigero[])
    } catch (error) {
      console.error('Error cargando clientes', error)
      setClientes([])
    }
  }, [get])

  const fetchHistorial = useCallback(
    async (cxcId: string) => {
      try {
        setLoadingHistorial(true)
        const response = await get(`/finanzas/cxc/${cxcId}`)
        setDetalleHistorial(response?.success ? response.data ?? response : response ?? null)
      } catch (error) {
        console.error('Error cargando historial de CxC', error)
        setDetalleHistorial(null)
      } finally {
        setLoadingHistorial(false)
      }
    },
    [get],
  )

  useEffect(() => {
    fetchClientes()
  }, [fetchClientes])

  useEffect(() => {
    fetchCuentas()
  }, [fetchCuentas])

  const resetFilters = () => setFilters(initialFilters)

  const stats = useMemo(() => {
    const total = cuentas.length
    const pendientes = cuentas.filter((cuenta) => normalizeEstadoCxc(cuenta.estado) === 'PENDIENTE').length
    const vencidas = cuentas.filter((cuenta) => normalizeEstadoCxc(cuenta.estado) === 'VENCIDO').length
    const saldoPendiente = cuentas
      .filter((cuenta) => normalizeEstadoCxc(cuenta.estado) !== 'CANCELADO')
      .reduce((sum, cuenta) => sum + Number(cuenta.saldo ?? 0), 0)

    return { total, pendientes, vencidas, saldoPendiente }
  }, [cuentas])

  const isFiltersActive = useMemo(
    () => Boolean(filters.estado || filters.clienteId || filters.vencimientoDesde || filters.vencimientoHasta || filters.search),
    [filters],
  )

  const formatCurrency = (value: number | null | undefined, currency: string = 'PEN') => {
    if (value === null || value === undefined) return '-'
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(value)
  }

  const formatDate = (value: string | null | undefined) => {
    if (!value) return '-'
    const candidate = value.includes('T') ? value : `${value}T00:00:00Z`
    const parsed = new Date(candidate)
    return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString('es-PE')
  }

  const computeDiasAtraso = (value: string | null | undefined) => {
    if (!value) return 0
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return 0
    const today = new Date()
    const diff = Math.ceil((parsed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return diff < 0 ? Math.abs(diff) : 0
  }

  const renderEstadoBadge = (estado: string | null | undefined) => {
    const normalizedEstado = normalizeEstadoCxc(estado)
    const meta = normalizedEstado
      ? ESTADO_META[normalizedEstado]
      : {
          label: estado ? String(estado) : 'Sin estado',
          className: 'border-slate-300/25 bg-slate-300/10 text-slate-100',
          icon: AlertCircle,
        }
    const Icon = meta.icon
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${meta.className}`}>
        <Icon className="h-3.5 w-3.5" />
        {meta.label}
      </span>
    )
  }

  const openCobro = (cuenta: CuentaPorCobrar) => {
    setSelectedCuenta(cuenta)
    setShowCobro(true)
  }

  const openNotaCredito = (cuenta: CuentaPorCobrar) => {
    setSelectedCuenta(cuenta)
    setShowNotaCredito(true)
  }

  const openReprogramar = (cuenta: CuentaPorCobrar) => {
    setSelectedCuenta(cuenta)
    setShowReprogramar(true)
  }

  const openHistorial = async (cuenta: CuentaPorCobrar) => {
    setSelectedCuenta(cuenta)
    setShowHistorial(true)
    setDetalleHistorial(null)
    await fetchHistorial(cuenta.id)
  }

  const closeHistorial = () => {
    setShowHistorial(false)
    setDetalleHistorial(null)
    setSelectedCuenta(null)
  }

  const actionButtonClass = 'h-9 gap-1 border-cyan-400/20 bg-white/10 px-3 text-xs text-cyan-50 hover:bg-white/15 hover:text-white'

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <section className="rounded-3xl border border-cyan-400/20 bg-slate-950/80 p-5 shadow-2xl shadow-blue-950/30">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-cyan-100">
                ERP Receivables
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Cuentas por Cobrar</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">
                CxC generadas desde ventas con cobros, notas de credito, reprogramaciones e historial.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={fetchCuentas} variant="outline" className="gap-2 border-cyan-400/20 bg-white/10 text-cyan-50 hover:bg-white/15 hover:text-white">
                <RefreshCw className="h-4 w-4" />
                Actualizar
              </Button>
              <Button type="button" onClick={() => alert('Exportacion en desarrollo')} variant="outline" className="gap-2 border-cyan-400/20 bg-white/10 text-cyan-50 hover:bg-white/15 hover:text-white">
                <Download className="h-4 w-4" />
                Exportar
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Total', value: stats.total.toLocaleString('es-PE'), description: 'Cuentas registradas', icon: FileText },
            { label: 'Pendientes', value: stats.pendientes.toLocaleString('es-PE'), description: 'Por cobrar', icon: Clock },
            { label: 'Vencidas', value: stats.vencidas.toLocaleString('es-PE'), description: 'Atrasadas', icon: XCircle },
            { label: 'Saldo total', value: formatCurrency(stats.saldoPendiente), description: 'Pendiente por cobrar', icon: DollarSign },
          ].map(({ label, value, description, icon: Icon }) => (
            <Card key={label} className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div>
                  <div className={labelClass}>{label}</div>
                  <div className="mt-3 text-2xl font-bold text-white">{value}</div>
                  <div className="mt-1 text-xs text-cyan-100/55">{description}</div>
                </div>
                <span className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-cyan-100">
                  <Icon className="h-5 w-5" />
                </span>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
            <CardTitle className="text-base text-white">Filtros operativos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_180px_minmax(220px,1fr)_170px_170px_auto] xl:items-end">
            <label className="space-y-2">
              <span className={labelClass}>Buscar</span>
              <input className={inputClass} type="text" value={filters.search} onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))} placeholder="Serie, numero, cliente, moneda" />
            </label>
            <label className="space-y-2">
              <span className={labelClass}>Estado</span>
              <select className={inputClass} value={filters.estado} onChange={(event) => setFilters((prev) => ({ ...prev, estado: event.target.value as EstadoCxc | '' }))}>
                <option value="">Todos</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="PARCIAL">Parcial</option>
                <option value="VENCIDO">Vencido</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className={labelClass}>Cliente</span>
              <select className={inputClass} value={filters.clienteId} onChange={(event) => setFilters((prev) => ({ ...prev, clienteId: event.target.value }))}>
                <option value="">Todos</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.razon_social || cliente.nombre_comercial || 'Sin nombre'}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className={labelClass}>Desde</span>
              <input className={inputClass} type="date" value={filters.vencimientoDesde} onChange={(event) => setFilters((prev) => ({ ...prev, vencimientoDesde: event.target.value }))} />
            </label>
            <label className="space-y-2">
              <span className={labelClass}>Hasta</span>
              <input className={inputClass} type="date" value={filters.vencimientoHasta} onChange={(event) => setFilters((prev) => ({ ...prev, vencimientoHasta: event.target.value }))} />
            </label>
            {isFiltersActive && (
              <Button type="button" onClick={resetFilters} variant="outline" className="gap-2 border-cyan-400/20 bg-white/10 text-cyan-50 hover:bg-white/15 hover:text-white">
                <XCircle className="h-4 w-4" />
                Limpiar
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-slate-300">
                <RefreshCw className="h-8 w-8 animate-spin text-cyan-200" />
                <p>Cargando cuentas por cobrar...</p>
              </div>
            ) : cuentas.length === 0 ? (
              <div className="flex min-h-[340px] flex-col items-center justify-center p-8 text-center">
                <FileText className="mb-3 h-12 w-12 text-cyan-200/50" />
                <h3 className="text-lg font-bold text-white">{isFiltersActive ? 'Sin resultados con los filtros aplicados' : 'No hay cuentas por cobrar'}</h3>
                <p className="mt-2 max-w-xl text-sm text-slate-400">
                  Las CxC se generan automaticamente cuando emites comprobantes de ventas.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] border-collapse text-sm">
                  <thead className="bg-slate-950/80 text-xs uppercase tracking-[0.12em] text-cyan-200/70">
                    <tr>
                      <th className="px-4 py-3 text-left">Documento</th>
                      <th className="px-4 py-3 text-left">Cliente</th>
                      <th className="px-4 py-3 text-left">Emision</th>
                      <th className="px-4 py-3 text-left">Vencimiento</th>
                      <th className="px-4 py-3 text-center">Atraso</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Saldo</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-400/10">
                    {cuentas.map((cuenta) => {
                      const numeroCompleto = [cuenta.serie, cuenta.numero].filter(Boolean).join('-') || 'N/A'
                      const diasAtraso = computeDiasAtraso(cuenta.fecha_vencimiento)
                      const saldo = Number(cuenta.saldo ?? 0)
                      const estadoNormalizado = normalizeEstadoCxc(cuenta.estado)
                      const puedeGestionar = saldo > 0 && estadoNormalizado !== 'CANCELADO'
                      return (
                        <tr key={cuenta.id} className="bg-slate-950/35 text-slate-200 transition hover:bg-slate-900/70">
                          <td className="px-4 py-3">
                            <div className="font-mono font-semibold text-white">{numeroCompleto}</div>
                            <div className="text-xs text-cyan-100/55">{cuenta.tipo_documento ?? '-'}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-100">{cuenta.clientes?.razon_social ?? 'Cliente sin nombre'}</div>
                            <div className="text-xs text-cyan-100/55">{cuenta.clientes?.documento_numero ?? '-'}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-300">{formatDate(cuenta.fecha_emision)}</td>
                          <td className="px-4 py-3 text-slate-300">{formatDate(cuenta.fecha_vencimiento)}</td>
                          <td className="px-4 py-3 text-center font-bold text-slate-100">{diasAtraso}</td>
                          <td className="px-4 py-3 text-right font-bold text-cyan-50">{formatCurrency(cuenta.total, cuenta.moneda)}</td>
                          <td className="px-4 py-3 text-right font-bold text-cyan-50">{formatCurrency(saldo, cuenta.moneda)}</td>
                          <td className="px-4 py-3 text-center">{renderEstadoBadge(cuenta.estado)}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap justify-end gap-2">
                              <ProtectedComponent modulo="finanzas" recurso="cxc.cobros" accion="write" fallback={null}>
                                <Button type="button" size="sm" onClick={() => openCobro(cuenta)} disabled={!puedeGestionar} className="h-9 gap-1 bg-blue-600 px-3 text-xs text-white hover:bg-blue-500">
                                  <DollarSign className="h-3.5 w-3.5" />
                                  Cobro
                                </Button>
                              </ProtectedComponent>
                              <ProtectedComponent modulo="finanzas" recurso="cxc.cobros" accion="write" fallback={null}>
                                <Button type="button" size="sm" onClick={() => openNotaCredito(cuenta)} disabled={!puedeGestionar} variant="outline" className={actionButtonClass}>
                                  <FileText className="h-3.5 w-3.5" />
                                  Nota
                                </Button>
                              </ProtectedComponent>
                              <ProtectedComponent modulo="finanzas" recurso="cxc.cobros" accion="write" fallback={null}>
                                <Button type="button" size="sm" onClick={() => openReprogramar(cuenta)} disabled={estadoNormalizado === 'CANCELADO'} variant="outline" className={actionButtonClass}>
                                  <Clock className="h-3.5 w-3.5" />
                                  Reprogramar
                                </Button>
                              </ProtectedComponent>
                              <ProtectedComponent modulo="finanzas" recurso="cxc" accion="read" fallback={null}>
                                <Button type="button" size="sm" onClick={() => openHistorial(cuenta)} variant="outline" className={actionButtonClass}>
                                  {loadingHistorial && selectedCuenta?.id === cuenta.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5" />}
                                  Historial
                                </Button>
                              </ProtectedComponent>
                              <Button type="button" size="sm" onClick={() => router.push(`/dashboard/finanzas/cxc/${cuenta.id}`)} variant="outline" className={actionButtonClass}>
                                <Eye className="h-3.5 w-3.5" />
                                Detalle
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CobroModal
        isOpen={showCobro}
        cuenta={selectedCuenta}
        onClose={() => {
          setShowCobro(false)
          setSelectedCuenta(null)
        }}
        onSuccess={fetchCuentas}
      />
      <NotaCreditoModal
        isOpen={showNotaCredito}
        cuenta={selectedCuenta}
        onClose={() => {
          setShowNotaCredito(false)
          setSelectedCuenta(null)
        }}
        onSuccess={fetchCuentas}
      />
      <ReprogramarModal
        isOpen={showReprogramar}
        cuenta={selectedCuenta}
        onClose={() => {
          setShowReprogramar(false)
          setSelectedCuenta(null)
        }}
        onSuccess={fetchCuentas}
      />
      <HistorialDrawer isOpen={showHistorial} onClose={closeHistorial} detalle={loadingHistorial ? null : detalleHistorial} />
    </div>
  )
}
