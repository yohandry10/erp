'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, BarChart3, CheckCircle, Clock, DollarSign, Download, Eye, FileText, List, Plus, RefreshCw, XCircle, type LucideIcon } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { getDaysUntilDue, getVencimientoText, parseDateLocal } from '@/lib/date-utils'
import AgingCxpChart from '@/components/finanzas/AgingCxpChart'
import VencimientosAlert from '@/components/finanzas/VencimientosAlert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useLocalizedMoney } from '@/hooks/use-localized-money'

interface CuentaPorPagar {
  id: string
  numero_documento: string
  proveedor_id: string
  fecha_emision: string
  fecha_vencimiento: string
  estado: string
  total: number
  saldo: number
  moneda: string
  tipo_documento: string
  observaciones?: string
  proveedores?: {
    razon_social: string
    ruc: string
  }
}

type EstadoCxp = 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'VENCIDA' | 'ANULADA'

const ESTADOS_CONFIG: Record<EstadoCxp, { label: string; className: string; icon: LucideIcon }> = {
  PENDIENTE: { label: 'Pendiente', className: 'border-amber-300/25 bg-amber-300/10 text-amber-400 dark:text-amber-200', icon: Clock },
  PARCIAL: { label: 'Parcial', className: 'border-blue-300/25 bg-blue-300/10 text-primary dark:text-blue-200', icon: AlertCircle },
  PAGADA: { label: 'Pagada', className: 'border-cyan-300/25 bg-cyan-300/10 text-primary', icon: CheckCircle },
  VENCIDA: { label: 'Vencida', className: 'border-border/25 bg-slate-300/10 text-foreground', icon: XCircle },
  ANULADA: { label: 'Anulada', className: 'border-border/25 bg-slate-300/10 text-foreground', icon: XCircle },
}

const inputClass =
  'w-full rounded-xl border border-cyan-400/20 bg-card/75 px-3 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10'

const labelClass = 'text-xs font-semibold uppercase tracking-[0.12em] text-primary/80'

export default function CuentasPorPagarPage() {
  const { currency, locale, formatCurrency: formatLocalizedCurrency, taxIdLabel } = useLocalizedMoney()
  const router = useRouter()
  const { get } = useApi()

  const [cuentas, setCuentas] = useState<CuentaPorPagar[]>([])
  const [proveedores, setProveedores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'list' | 'aging'>('list')
  const [estadoFilter, setEstadoFilter] = useState<string>('')
  const [proveedorFilter, setProveedorFilter] = useState<string>('')
  const [vencimientoDesde, setVencimientoDesde] = useState<string>('')
  const [vencimientoHasta, setVencimientoHasta] = useState<string>('')

  const loadCuentas = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()

      if (estadoFilter) params.append('estado', estadoFilter)
      if (proveedorFilter) params.append('proveedor_id', proveedorFilter)
      if (vencimientoDesde) params.append('vencimiento_desde', vencimientoDesde)
      if (vencimientoHasta) params.append('vencimiento_hasta', vencimientoHasta)

      const queryString = params.toString()
      const response = await get(`/api/finanzas/cxp${queryString ? `?${queryString}` : ''}`)
      // El API expone el join como `proveedor` (singular); se normaliza al shape que usa la tabla.
      if (response?.success) {
        setCuentas((response.data || []).map((cuenta: any) => ({
          ...cuenta,
          proveedores: cuenta.proveedores || cuenta.proveedor,
        })))
      }
    } catch (error) {
      console.error('Error loading cuentas por pagar:', error)
      alert('Error: No se pudieron cargar las cuentas por pagar')
    } finally {
      setLoading(false)
    }
  }, [estadoFilter, proveedorFilter, vencimientoDesde, vencimientoHasta, get])

  const loadProveedores = useCallback(async () => {
    try {
      const response = await get('/api/compras/proveedores?activo=true')
      if (response?.success) setProveedores(response.data || [])
    } catch (error) {
      console.error('Error loading proveedores:', error)
    }
  }, [get])

  useEffect(() => {
    loadProveedores()
  }, [loadProveedores])

  useEffect(() => {
    loadCuentas()
  }, [loadCuentas])

  const handleClearFilters = () => {
    setEstadoFilter('')
    setProveedorFilter('')
    setVencimientoDesde('')
    setVencimientoHasta('')
  }

  const handleExport = () => alert('Funcionalidad de exportacion proximamente')

  const formatCurrency = (amount: number | undefined, moneda: string = currency) => {
    if (!amount) return '-'
    return formatLocalizedCurrency(amount, moneda)
  }

  const formatDate = (dateString: string) => {
    return parseDateLocal(dateString).toLocaleDateString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  const isFilterActive = estadoFilter || proveedorFilter || vencimientoDesde || vencimientoHasta

  const getEstadoBadge = (estado: string) => {
    const config = ESTADOS_CONFIG[estado as EstadoCxp]
    if (!config) return null
    const Icon = config.icon

    return (
      <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${config.className}`}>
        <Icon className="h-3.5 w-3.5" />
        {config.label}
      </span>
    )
  }

  const totalPendiente = cuentas
    .filter((cuenta) => cuenta.estado === 'PENDIENTE' || cuenta.estado === 'PARCIAL' || cuenta.estado === 'VENCIDA')
    .reduce((sum, cuenta) => sum + cuenta.saldo, 0)

  const totalVencido = cuentas.filter((cuenta) => cuenta.estado === 'VENCIDA').reduce((sum, cuenta) => sum + cuenta.saldo, 0)

  const statCards = [
    { label: 'Total', value: cuentas.length, description: 'Cuentas', icon: FileText },
    { label: 'Pendientes', value: cuentas.filter((cuenta) => cuenta.estado === 'PENDIENTE').length, description: 'Por pagar', icon: Clock },
    { label: 'Vencidas', value: cuentas.filter((cuenta) => cuenta.estado === 'VENCIDA').length, description: formatCurrency(totalVencido), icon: XCircle },
    { label: 'Saldo total', value: formatCurrency(totalPendiente), description: 'Por pagar', icon: DollarSign },
  ]

  return (
    <div className="min-h-screen bg-background px-4 py-5 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <section className="rounded-3xl border border-cyan-400/20 bg-card/80 p-5 shadow-2xl shadow-blue-950/30">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-primary">
                ERP Payables
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground">Cuentas por Pagar</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">CxP de proveedores con vencimientos, aging y pagos pendientes.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="flex rounded-2xl border border-cyan-400/20 bg-card/70 p-1">
                <Button type="button" onClick={() => setViewMode('list')} className={`gap-2 rounded-xl ${viewMode === 'list' ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground'}`}>
                  <List className="h-4 w-4" />
                  Lista
                </Button>
                <Button type="button" onClick={() => setViewMode('aging')} className={`gap-2 rounded-xl ${viewMode === 'aging' ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground'}`}>
                  <BarChart3 className="h-4 w-4" />
                  Aging
                </Button>
              </div>
              <Button type="button" onClick={loadCuentas} variant="outline" className="gap-2 border-cyan-400/20 bg-muted/30 text-primary hover:bg-muted/50 hover:text-foreground">
                <RefreshCw className="h-4 w-4" />
                Actualizar
              </Button>
              <Button type="button" onClick={() => router.push('/dashboard/compras/recepciones')} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">
                <Plus className="h-4 w-4" />
                Ir a recepciones
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map(({ label, value, description, icon: Icon }) => (
            <Card key={label} className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div>
                  <div className={labelClass}>{label}</div>
                  <div className="mt-3 text-2xl font-bold text-foreground">{value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{description}</div>
                </div>
                <span className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
              </CardContent>
            </Card>
          ))}
        </section>

        <VencimientosAlert diasAdelante={7} proveedorId={proveedorFilter || undefined} onCuentaClick={(cuentaId) => router.push(`/dashboard/finanzas/cxp/${cuentaId}`)} />

        <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
          <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3 xl:items-end">
            <label className="space-y-2">
              <span className={labelClass}>Estado</span>
              <select className={inputClass} value={estadoFilter} onChange={(event) => setEstadoFilter(event.target.value)}>
                <option value="">Todos los estados</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="PARCIAL">Parcial</option>
                <option value="PAGADA">Pagada</option>
                <option value="VENCIDA">Vencida</option>
                <option value="ANULADA">Anulada</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className={labelClass}>Proveedor</span>
              <select className={inputClass} value={proveedorFilter} onChange={(event) => setProveedorFilter(event.target.value)}>
                <option value="">Todos los proveedores</option>
                {proveedores.map((proveedor) => (
                  <option key={proveedor.id} value={proveedor.id}>
                    {proveedor.razon_social}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className={labelClass}>Desde</span>
              <input className={inputClass} type="date" value={vencimientoDesde} onChange={(event) => setVencimientoDesde(event.target.value)} />
            </label>
            <label className="space-y-2">
              <span className={labelClass}>Hasta</span>
              <input className={inputClass} type="date" value={vencimientoHasta} onChange={(event) => setVencimientoHasta(event.target.value)} />
            </label>
            {isFilterActive && (
              <Button type="button" onClick={handleClearFilters} variant="outline" className="gap-2 border-cyan-400/20 bg-muted/30 text-primary hover:bg-muted/50 hover:text-foreground">
                <XCircle className="h-4 w-4" />
                Limpiar
              </Button>
            )}
            <Button type="button" onClick={handleExport} variant="outline" className="gap-2 border-cyan-400/20 bg-muted/30 text-primary hover:bg-muted/50 hover:text-foreground">
              <Download className="h-4 w-4" />
              Exportar
            </Button>
          </CardContent>
        </Card>

        {viewMode === 'aging' ? (
          <div className="rounded-3xl border border-cyan-400/20 bg-card/65 p-4 shadow-xl shadow-blue-950/20">
            <AgingCxpChart proveedorId={proveedorFilter || undefined} />
          </div>
        ) : (
          <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
            <CardContent className="p-0">
              {loading ? (
                <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-muted-foreground">
                  <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                  <p>Cargando cuentas por pagar...</p>
                </div>
              ) : cuentas.length === 0 ? (
                <div className="flex min-h-[340px] flex-col items-center justify-center p-8 text-center">
                  <FileText className="mb-3 h-12 w-12 text-cyan-200/50" />
                  <h3 className="text-lg font-bold text-foreground">No hay cuentas por pagar</h3>
                  <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                    {isFilterActive ? 'No se encontraron cuentas con los filtros aplicados.' : 'Las CxP se crean automaticamente desde recepciones.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1040px] border-collapse text-sm">
                    <thead className="bg-card/80 text-xs uppercase tracking-[0.12em] text-primary/80">
                      <tr>
                        <th className="px-4 py-3 text-left">Documento</th>
                        <th className="px-4 py-3 text-left">Proveedor</th>
                        <th className="px-4 py-3 text-left">Emision</th>
                        <th className="px-4 py-3 text-left">Vencimiento</th>
                        <th className="px-4 py-3 text-right">Total</th>
                        <th className="px-4 py-3 text-right">Saldo</th>
                        <th className="px-4 py-3 text-center">Estado</th>
                        <th className="px-4 py-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cyan-400/10">
                      {cuentas.map((cuenta) => {
                        const daysUntilDue = getDaysUntilDue(cuenta.fecha_vencimiento)
                        const isOverdue = daysUntilDue < 0
                        const isDueSoon = daysUntilDue >= 0 && daysUntilDue <= 7

                        return (
                          <tr key={cuenta.id} className="bg-card/35 text-foreground/90 transition hover:bg-card/70">
                            <td className="px-4 py-3">
                              <div className="font-mono font-semibold text-foreground">{cuenta.numero_documento}</div>
                              <div className="text-xs text-muted-foreground">{cuenta.tipo_documento}</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-foreground">{cuenta.proveedores?.razon_social || 'N/A'}</div>
                              {cuenta.proveedores?.ruc && <div className="text-xs text-muted-foreground">{taxIdLabel}: {cuenta.proveedores.ruc}</div>}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{formatDate(cuenta.fecha_emision)}</td>
                            <td className="px-4 py-3">
                              <div className="text-muted-foreground">{formatDate(cuenta.fecha_vencimiento)}</div>
                              {(isOverdue || isDueSoon) && cuenta.estado !== 'PAGADA' && cuenta.estado !== 'ANULADA' && (
                                <div className="text-xs font-semibold text-amber-400 dark:text-amber-200">
                                  {getVencimientoText(cuenta.fecha_vencimiento)}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-primary">{formatCurrency(cuenta.total, cuenta.moneda)}</td>
                            <td className="px-4 py-3 text-right font-bold text-primary">{formatCurrency(cuenta.saldo, cuenta.moneda)}</td>
                            <td className="px-4 py-3 text-center">{getEstadoBadge(cuenta.estado)}</td>
                            <td className="px-4 py-3 text-right">
                              <Button type="button" size="sm" onClick={() => router.push(`/dashboard/finanzas/cxp/${cuenta.id}`)} className="h-9 gap-1 bg-blue-600 px-3 text-xs text-white hover:bg-blue-500">
                                <Eye className="h-3.5 w-3.5" />
                                Ver
                              </Button>
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
        )}
      </div>
    </div>
  )
}
