'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Download, FileText, RefreshCw, Send, ShieldCheck } from 'lucide-react'

import SireReportModal from '@/components/modals/SireReportModal'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useApiCall } from '@/hooks/use-api'
import { useCountryContext } from '@/hooks/use-country-context'
import { apiSucceeded, unwrapApiArray, unwrapApiData, unwrapApiObject } from '@/lib/api-contract'
import { parseDateLocal } from '@/lib/date-utils'

const getCurrentPeriod = () => new Date().toISOString().slice(0, 7)

interface SireReport {
  id: string
  tipoReporte: string
  periodo: string
  fechaGeneracion: string
  estado: 'GENERANDO' | 'GENERADO' | 'PENDIENTE' | 'ENVIADO' | 'ERROR'
  registros: number
  archivo?: string
  observaciones?: string
  tipo_display?: string
  filename?: string
  created_at?: string
  total_registros?: number
  sunat_ticket?: string
  sunat_estado?: string
  sunat_codigo_estado?: string
  sunat_ultima_consulta?: string
}

interface SireStats {
  reportesDelMes: number
  registrosTotales: number
  enviadosASunat: number
  pendientes: number
}

interface SireFilters {
  periodo: string
  tipoReporte: string
  estado: string
}

interface SireOperation {
  id: string
  accion: string
  estado: string
  ticket?: string
  codigo_estado_sunat?: string
  descripcion_estado_sunat?: string
  error_code?: string
  error_message?: string
  solicitado_at: string
  completado_at?: string
}

const inputClass =
  'rounded-xl border border-cyan-400/20 bg-card/75 px-3 py-3 text-sm text-foreground outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10'

const labelClass = 'text-xs font-semibold uppercase tracking-[0.12em] text-primary/80'

const getStatusClass = (estado: string) => {
  switch (estado) {
    case 'GENERADO':
      return 'border-cyan-300/30 bg-cyan-300/10 text-primary'
    case 'ENVIADO':
      return 'border-blue-300/30 bg-blue-300/10 text-primary dark:text-blue-200'
    case 'PENDIENTE':
      return 'border-amber-300/30 bg-amber-300/10 text-amber-700 dark:text-amber-200'
    case 'GENERANDO':
      return 'border-sky-300/30 bg-sky-300/10 text-primary dark:text-sky-200'
    case 'ERROR':
      return 'border-border/30 bg-slate-300/10 text-foreground'
    default:
      return 'border-border/30 bg-slate-400/10 text-foreground/90'
  }
}

export default function SIREPage() {
  const country = useCountryContext()
  const isPeru = (country.paisCodigo || 'PE').toUpperCase() === 'PE'

  const [reports, setReports] = useState<SireReport[]>([])
  const [stats, setStats] = useState<SireStats | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [activeDownloadId, setActiveDownloadId] = useState<string | null>(null)
  const [activeSunatSendId, setActiveSunatSendId] = useState<string | null>(null)
  const [pendingAcceptanceId, setPendingAcceptanceId] = useState<string | null>(null)
  const sendKeysRef = useRef<Record<string, string>>({})
  const queryKeysRef = useRef<Record<string, string>>({})
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const [operations, setOperations] = useState<SireOperation[]>([])
  const [filters, setFiltersState] = useState<SireFilters>({
    periodo: getCurrentPeriod(),
    tipoReporte: '',
    estado: ''
  })
  const filtersRef = useRef<SireFilters>(filters)
  const periodoInputRef = useRef<HTMLInputElement>(null)
  const reportRequestSeq = useRef(0)

  const { get, post, loading } = useApiCall<SireReport[]>()
  const { get: getStats } = useApiCall<SireStats>()
  const { get: getOperations } = useApiCall<SireOperation[]>()

  const updateFilters = useCallback((patch: Partial<SireFilters>) => {
    setFiltersState(prev => {
      const next = { ...prev, ...patch }
      filtersRef.current = next
      return next
    })
  }, [])

  const loadReports = useCallback(async (overrideFilters?: SireFilters) => {
    const baseFilters = overrideFilters ?? filtersRef.current
    const visiblePeriodo = periodoInputRef.current?.value
    const effectiveFilters = {
      ...baseFilters,
      periodo: visiblePeriodo || baseFilters.periodo,
    }
    const requestSeq = ++reportRequestSeq.current
    const queryParams = new URLSearchParams()
    if (effectiveFilters.periodo) queryParams.append('periodo', effectiveFilters.periodo)
    if (effectiveFilters.tipoReporte) queryParams.append('tipoReporte', effectiveFilters.tipoReporte)
    if (effectiveFilters.estado) queryParams.append('estado', effectiveFilters.estado)

    const response = await get(`/api/sire/reportes?${queryParams}`)
    const reports = unwrapApiArray<SireReport>(response)
    if (requestSeq !== reportRequestSeq.current) {
      return
    }
    const currentVisiblePeriodo = periodoInputRef.current?.value
    if (currentVisiblePeriodo && currentVisiblePeriodo !== effectiveFilters.periodo) {
      return
    }

    if (apiSucceeded(response)) {
      setReports(reports)
    } else {
      setReports([])
    }
  }, [get])

  const loadStats = useCallback(async () => {
    const response = await getStats('/api/sire/stats')
    if (apiSucceeded(response)) {
      const stats = unwrapApiObject<SireStats>(response, {
        reportesDelMes: 0,
        registrosTotales: 0,
        enviadosASunat: 0,
        pendientes: 0
      })
      setStats(stats)
    } else {
      setStats({
        reportesDelMes: 0,
        registrosTotales: 0,
        enviadosASunat: 0,
        pendientes: 0
      })
    }
  }, [getStats])

  const loadData = useCallback(async (overrideFilters?: SireFilters) => {
    await Promise.all([
      loadReports(overrideFilters),
      loadStats()
    ])
  }, [loadReports, loadStats])

  useEffect(() => {
    if (!country.loading && isPeru) {
      loadData()
    }
  }, [country.loading, isPeru, loadData])

  useEffect(() => {
    if (!isPeru) {
      return
    }
    const hasGeneratingReports = reports.some(report => report.estado === 'GENERANDO')

    if (hasGeneratingReports) {
      const interval = setInterval(() => {
        loadData()
      }, 2000)

      return () => clearInterval(interval)
    }
  }, [isPeru, loadData, reports])

  const downloadReport = async (reportId: string, filename: string) => {
    if (activeDownloadId) return
    setActiveDownloadId(reportId)
    try {
      const response = await get(`/api/sire/reportes/${reportId}/download`)
      const content = unwrapApiData<string | Blob | null>(response, null)
      if (apiSucceeded(response) && content) {
        const blob = new Blob([content], { type: 'text/plain' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } finally {
      setActiveDownloadId(null)
    }
  }

  const sendToSunat = async (reportId: string) => {
    if (activeSunatSendId) return
    setPendingAcceptanceId(null)
    setActiveSunatSendId(reportId)
    try {
      const key = sendKeysRef.current[reportId]
        ?? `sire-accept:${reportId}:${crypto.randomUUID()}`
      sendKeysRef.current[reportId] = key
      const response = await post(
        `/api/sire/reportes/${reportId}/enviar-sunat`,
        {},
        { headers: { 'Idempotency-Key': key } },
      )
      if (apiSucceeded(response)) {
        delete sendKeysRef.current[reportId]
        await loadReports(filtersRef.current)
        await loadStats()
      }
    } finally {
      setActiveSunatSendId(null)
    }
  }

  const querySunatTicket = async (reportId: string) => {
    if (activeSunatSendId) return
    setActiveSunatSendId(reportId)
    try {
      const key = queryKeysRef.current[reportId]
        ?? `sire-query:${reportId}:${crypto.randomUUID()}`
      queryKeysRef.current[reportId] = key
      const response = await post(
        `/api/sire/reportes/${reportId}/consultar-ticket`,
        {},
        { headers: { 'Idempotency-Key': key } },
      )
      if (apiSucceeded(response)) {
        delete queryKeysRef.current[reportId]
        await loadReports(filtersRef.current)
        await loadStats()
      }
    } finally {
      setActiveSunatSendId(null)
    }
  }

  const viewOperations = async (reportId: string) => {
    const response = await getOperations(`/api/sire/reportes/${reportId}/operaciones`)
    setSelectedReportId(reportId)
    setOperations(apiSucceeded(response) ? unwrapApiArray<SireOperation>(response) : [])
  }

  const getStatusText = (estado: string) => {
    switch (estado) {
      case 'GENERADO':
        return 'Generado'
      case 'ENVIADO':
        return 'Propuesta aceptada'
      case 'PENDIENTE':
        return 'Ticket pendiente'
      case 'GENERANDO':
        return 'Generando'
      case 'ERROR':
        return 'Error'
      default:
        return estado
    }
  }

  const handleReportGenerated = () => {
    loadData(filtersRef.current)
  }

  const handleRefresh = useCallback(() => {
    const nextFilters = {
      ...filtersRef.current,
      periodo: periodoInputRef.current?.value || filtersRef.current.periodo
    }
    filtersRef.current = nextFilters
    setFiltersState(nextFilters)
    loadData(nextFilters)
  }, [loadData])

  if (!country.loading && !isPeru) {
    return (
      <div className="min-h-screen bg-background p-5 text-foreground">
        <Card className="mx-auto max-w-[1600px] border-cyan-400/20 bg-card/70 text-foreground shadow-2xl shadow-blue-950/30">
          <CardContent className="p-6">
            <h1 className="text-3xl font-black text-foreground">SIRE</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              El modulo SIRE aplica a Peru. Para {country.paisNombre} este modulo no esta disponible.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background px-4 py-5 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <section className="rounded-3xl border border-cyan-400/20 bg-card/80 p-5 shadow-2xl shadow-blue-950/30">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-primary">
                ERP Fiscal Center
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground">SIRE - Sistema de Registros Electrónicos</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Compara los datos del ERP con RVIE/RCE, acepta la propuesta oficial y conserva el ticket SUNAT. La generación final del libro se realiza en SOL.</p>
            </div>
            <Button type="button" onClick={() => setIsModalOpen(true)} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">
              <FileText className="h-4 w-4" />
              Generar reporte
            </Button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Reportes del mes', stats?.reportesDelMes || 0, 'Reportes generados'],
            ['Registros totales', stats?.registrosTotales?.toLocaleString() || '0', 'Transacciones procesadas'],
            ['Aceptados por SUNAT', stats?.enviadosASunat || 0, 'Tickets en estado Terminado'],
            ['Pendientes', stats?.pendientes || 0, 'Por aceptar o consultar'],
          ].map(([label, value, description]) => (
            <Card key={label} className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div>
                  <div className={labelClass}>{label}</div>
                  <div className="mt-3 text-3xl font-black text-foreground">{value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{description}</div>
                </div>
                <span className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </span>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
            <CardTitle className="text-base text-foreground">Filtros SIRE</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 lg:grid-cols-[160px_220px_180px_auto] lg:items-end">
            <input
              ref={periodoInputRef}
              aria-label="Periodo tributario"
              type="month"
              defaultValue={filters.periodo}
              onChange={(event) => {
                const { value } = event.currentTarget
                updateFilters({ periodo: value })
              }}
              onInput={(event) => {
                const { value } = event.currentTarget
                updateFilters({ periodo: value })
              }}
              className={inputClass}
            />
            <select aria-label="Tipo reporte"
              value={filters.tipoReporte}
              onChange={(event) => {
                const { value } = event.currentTarget
                updateFilters({ tipoReporte: value })
              }}
              className={inputClass}
            >
              <option value="">Todos los tipos</option>
              <option value="REGISTRO_VENTAS">Registro de Ventas</option>
              <option value="REGISTRO_COMPRAS">Registro de Compras</option>
            </select>
            <select aria-label="Estado"
              value={filters.estado}
              onChange={(event) => {
                const { value } = event.currentTarget
                updateFilters({ estado: value })
              }}
              className={inputClass}
            >
              <option value="">Todos los estados</option>
              <option value="GENERANDO">Generando</option>
              <option value="GENERADO">Generado</option>
              <option value="ENVIADO">Enviado</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="ERROR">Error</option>
            </select>
            <Button type="button" onClick={handleRefresh} variant="outline" className="gap-2 border-cyan-400/20 bg-cyan-400/10 text-primary hover:bg-cyan-400/15 hover:text-foreground">
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </Button>
          </CardContent>
        </Card>

        <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
            <CardTitle className="text-base text-foreground">Reportes SIRE</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {reports.length === 0 && !loading ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
                <FileText className="mb-3 h-12 w-12 text-cyan-200/50" />
                <h3 className="text-lg font-bold text-foreground">No hay reportes SIRE</h3>
                <p className="mt-2 text-sm text-muted-foreground">Comienza generando tu primer reporte para SUNAT.</p>
                <Button type="button" onClick={() => setIsModalOpen(true)} className="mt-4 gap-2 bg-blue-600 text-white hover:bg-blue-500">
                  <FileText className="h-4 w-4" />
                  Generar primer reporte
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="!m-0 w-full min-w-full table-fixed border-collapse !bg-card/80 text-sm !shadow-none">
                  <thead className="!bg-card/90 text-xs uppercase tracking-[0.12em] text-primary/80">
                    <tr>
                      <th className="w-[10%] !border-cyan-400/10 !bg-card/90 px-4 py-3 text-left text-primary/80">Periodo</th>
                      <th className="w-[34%] !border-cyan-400/10 !bg-card/90 px-4 py-3 text-left text-primary/80">Reporte</th>
                      <th className="w-[14%] !border-cyan-400/10 !bg-card/90 px-4 py-3 text-left text-primary/80">Generacion</th>
                      <th className="w-[10%] !border-cyan-400/10 !bg-card/90 px-4 py-3 text-right text-primary/80">Registros</th>
                      <th className="w-[12%] !border-cyan-400/10 !bg-card/90 px-4 py-3 text-center text-primary/80">Estado</th>
                      <th className="w-[20%] !border-cyan-400/10 !bg-card/90 px-4 py-3 text-right text-primary/80">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-400/10">
                    {reports.map((report) => (
                      <tr className="!bg-card/50 text-foreground/90 transition hover:!bg-card/80" key={report.id}>
                        <td className="!border-cyan-400/10 !bg-transparent px-4 py-3 font-mono font-semibold text-foreground">{report.periodo}</td>
                        <td className="!border-cyan-400/10 !bg-transparent px-4 py-3">
                          <div className="space-y-1">
                            <div className="truncate font-semibold text-foreground">{report.tipo_display || report.tipoReporte || 'N/A'}</div>
                            {report.filename ? (
                              <div className="max-w-md truncate text-xs text-muted-foreground">{report.filename}</div>
                            ) : null}
                            {report.sunat_ticket ? (
                              <div className="font-mono text-xs text-primary">Ticket {report.sunat_ticket}</div>
                            ) : null}
                            {report.sunat_estado ? (
                              <div className="text-xs text-muted-foreground">SUNAT: {report.sunat_estado}</div>
                            ) : null}
                          </div>
                        </td>
                        <td className="!border-cyan-400/10 !bg-transparent px-4 py-3 text-muted-foreground">
                          {report.created_at ? parseDateLocal(report.created_at).toLocaleDateString('es-PE') : 'N/A'}
                        </td>
                        <td className="!border-cyan-400/10 !bg-transparent px-4 py-3 text-right font-bold text-primary">
                          {(report.total_registros || 0).toLocaleString()}
                        </td>
                        <td className="!border-cyan-400/10 !bg-transparent px-4 py-3 text-center">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClass(report.estado)}`}>
                            {getStatusText(report.estado)}
                          </span>
                        </td>
                        <td className="!border-cyan-400/10 !bg-transparent px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {report.estado === 'GENERADO' ? (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => downloadReport(report.id, report.filename || 'reporte.txt')}
                                  disabled={activeDownloadId === report.id}
                                  variant="outline"
                                  className="gap-1 border-cyan-400/20 bg-cyan-400/10 px-2 text-primary hover:bg-cyan-400/15 hover:text-foreground"
                                >
                                  <Download className="h-4 w-4" />
                                  {activeDownloadId === report.id ? 'Descargando...' : 'Descargar'}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => setPendingAcceptanceId(report.id)}
                                  disabled={activeSunatSendId === report.id}
                                  className="gap-1 bg-cyan-600 text-white hover:bg-cyan-500"
                                >
                                  <Send className="h-4 w-4" />
                                  {activeSunatSendId === report.id ? 'Solicitando...' : 'Aceptar propuesta'}
                                </Button>
                              </>
                            ) : null}
                            {report.estado === 'PENDIENTE' ? (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => querySunatTicket(report.id)}
                                disabled={activeSunatSendId === report.id}
                                className="gap-1 bg-amber-600 text-white hover:bg-amber-500"
                              >
                                <RefreshCw className="h-4 w-4" />
                                {activeSunatSendId === report.id ? 'Consultando...' : 'Consultar ticket'}
                              </Button>
                            ) : null}
                            {report.estado === 'ENVIADO' ? (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => downloadReport(report.id, report.filename || 'reporte.txt')}
                                disabled={activeDownloadId === report.id}
                                variant="outline"
                              className="gap-1 border-cyan-400/20 bg-cyan-400/10 text-primary hover:bg-cyan-400/15 hover:text-foreground"
                              >
                                <Download className="h-4 w-4" />
                                {activeDownloadId === report.id ? 'Descargando...' : 'Descargar'}
                              </Button>
                            ) : null}
                            {report.estado === 'GENERANDO' ? (
                              <span className="inline-flex rounded-full border border-sky-300/30 bg-sky-300/10 px-3 py-1 text-xs font-semibold text-primary dark:text-sky-200">
                                Procesando...
                              </span>
                            ) : null}
                            {report.estado === 'ERROR' ? (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => setIsModalOpen(true)}
                                variant="outline"
                                className="border-border/20 bg-slate-400/10 text-foreground hover:bg-slate-400/15 hover:text-foreground"
                              >
                                Reintentar
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => viewOperations(report.id)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              Bitácora
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {selectedReportId ? (
          <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
            <CardHeader className="flex-row items-center justify-between border-b border-cyan-400/10 px-5 py-4">
              <CardTitle className="text-base text-foreground">Bitácora SUNAT del reporte</CardTitle>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedReportId(null)}>Cerrar</Button>
            </CardHeader>
            <CardContent className="p-4">
              {operations.length ? (
                <div className="space-y-2">
                  {operations.map((operation) => (
                    <div key={operation.id} className="rounded-xl border border-cyan-400/10 bg-card/60 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-foreground">{operation.accion.replaceAll('_', ' ')}</span>
                        <span className="rounded-full border border-cyan-400/20 px-2 py-0.5 text-xs">{operation.estado}</span>
                      </div>
                      <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                        <span>{new Date(operation.solicitado_at).toLocaleString('es-PE')}</span>
                        <span>{operation.ticket ? `Ticket ${operation.ticket}` : 'Sin ticket'}</span>
                        {operation.descripcion_estado_sunat ? <span>SUNAT: {operation.descripcion_estado_sunat}</span> : null}
                        {operation.error_message ? <span className="text-red-500">{operation.error_code}: {operation.error_message}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Todavía no hay operaciones SUNAT para este reporte.</p>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <SireReportModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleReportGenerated}
      />

      {pendingAcceptanceId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sire-accept-title"
        >
          <div className="w-full max-w-lg rounded-2xl border border-cyan-400/25 bg-card p-6 text-foreground shadow-2xl shadow-cyan-950/40">
            <h2 id="sire-accept-title" className="text-xl font-semibold">Aceptar propuesta SIRE</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Esta acción enviará la aceptación de la propuesta oficial RVIE/RCE a SUNAT. La generación final del libro seguirá realizándose en SOL.
            </p>
            <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-800 dark:text-amber-100">
              {(() => {
                const report = reports.find(item => item.id === pendingAcceptanceId)
                return report
                  ? `${report.tipo_display || report.tipoReporte} · período ${report.periodo}`
                  : 'Reporte seleccionado'
              })()}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setPendingAcceptanceId(null)}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => sendToSunat(pendingAcceptanceId)}>
                Confirmar aceptación
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
