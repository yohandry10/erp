'use client'

import { useState, useCallback, useEffect } from 'react'
import { Download, FileText, RefreshCw, Send, ShieldCheck } from 'lucide-react'

import SireReportModal from '@/components/modals/SireReportModal'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useApiCall } from '@/hooks/use-api'
import { useCountryContext } from '@/hooks/use-country-context'
import { apiSucceeded, unwrapApiArray, unwrapApiData, unwrapApiObject } from '@/lib/api-contract'

const getCurrentPeriod = () => new Date().toISOString().slice(0, 7)

interface SireReport {
  id: string
  tipoReporte: string
  periodo: string
  fechaGeneracion: string
  estado: 'GENERANDO' | 'GENERADO' | 'ENVIADO' | 'ERROR'
  registros: number
  archivo?: string
  observaciones?: string
  tipo_display?: string
  filename?: string
  created_at?: string
  total_registros?: number
}

interface SireStats {
  reportesDelMes: number
  registrosTotales: number
  enviadosASunat: number
  pendientes: number
}

const inputClass =
  'rounded-xl border border-cyan-400/20 bg-slate-950/75 px-3 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10'

const labelClass = 'text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200/70'

const getStatusClass = (estado: string) => {
  switch (estado) {
    case 'GENERADO':
      return 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100'
    case 'ENVIADO':
      return 'border-blue-300/30 bg-blue-300/10 text-blue-100'
    case 'GENERANDO':
      return 'border-sky-300/30 bg-sky-300/10 text-sky-100'
    case 'ERROR':
      return 'border-slate-300/30 bg-slate-300/10 text-slate-100'
    default:
      return 'border-slate-400/30 bg-slate-400/10 text-slate-200'
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
  const [filters, setFilters] = useState({
    periodo: getCurrentPeriod(),
    tipoReporte: '',
    estado: ''
  })

  const { get, post, loading } = useApiCall<SireReport[]>()
  const { get: getStats } = useApiCall<SireStats>()

  const loadReports = useCallback(async () => {
    const queryParams = new URLSearchParams()
    if (filters.periodo) queryParams.append('periodo', filters.periodo)
    if (filters.tipoReporte) queryParams.append('tipoReporte', filters.tipoReporte)
    if (filters.estado) queryParams.append('estado', filters.estado)

    const response = await get(`/api/sire/reportes?${queryParams}`)
    const reports = unwrapApiArray<SireReport>(response)
    if (apiSucceeded(response)) {
      console.log('SIRE Reports recibidos:', reports)
      setReports(reports)
    } else {
      console.log('No hay reportes SIRE o respuesta incorrecta:', response)
      setReports([])
    }
  }, [get, filters])

  const loadStats = useCallback(async () => {
    const response = await getStats('/api/sire/stats')
    if (apiSucceeded(response)) {
      const stats = unwrapApiObject<SireStats>(response, {
        reportesDelMes: 0,
        registrosTotales: 0,
        enviadosASunat: 0,
        pendientes: 0
      })
      console.log('SIRE Stats recibidas:', stats)
      setStats(stats)
    } else {
      console.log('No hay estadisticas SIRE o respuesta incorrecta:', response)
      setStats({
        reportesDelMes: 0,
        registrosTotales: 0,
        enviadosASunat: 0,
        pendientes: 0
      })
    }
  }, [getStats])

  const loadData = useCallback(async () => {
    await Promise.all([
      loadReports(),
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
        console.log('Auto-recargando por reportes en estado GENERANDO...')
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
    setActiveSunatSendId(reportId)
    try {
      const response = await post(`/api/sire/reportes/${reportId}/enviar-sunat`)
      if (apiSucceeded(response)) {
        await loadReports()
        await loadStats()
      }
    } finally {
      setActiveSunatSendId(null)
    }
  }

  const getStatusText = (estado: string) => {
    switch (estado) {
      case 'GENERADO':
        return 'Generado'
      case 'ENVIADO':
        return 'Enviado'
      case 'GENERANDO':
        return 'Generando'
      case 'ERROR':
        return 'Error'
      default:
        return estado
    }
  }

  const handleReportGenerated = () => {
    loadData()
  }

  if (!country.loading && !isPeru) {
    return (
      <div className="min-h-screen bg-slate-950 p-5 text-slate-100">
        <Card className="mx-auto max-w-[1600px] border-cyan-400/20 bg-slate-950/70 text-slate-100 shadow-2xl shadow-blue-950/30">
          <CardContent className="p-6">
            <h1 className="text-3xl font-black text-white">SIRE</h1>
            <p className="mt-2 text-sm text-slate-300">
              El modulo SIRE aplica a Peru. Para {country.paisNombre} este modulo no esta disponible.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading && reports.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 p-5 text-slate-100">
        <div className="mx-auto flex min-h-[420px] max-w-[1600px] flex-col items-center justify-center gap-3 rounded-3xl border border-cyan-400/20 bg-slate-950/75 shadow-2xl shadow-blue-950/30">
          <RefreshCw className="h-8 w-8 animate-spin text-cyan-200" />
          <p className="text-sm text-slate-300">Cargando reportes SIRE...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <section className="rounded-3xl border border-cyan-400/20 bg-slate-950/80 p-5 shadow-2xl shadow-blue-950/30">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-cyan-100">
                ERP Fiscal Center
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white">SIRE - Sistema de Registros Electronicos</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">Reportes tributarios SUNAT con datos reales del tenant.</p>
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
            ['Enviados a SUNAT', stats?.enviadosASunat || 0, 'Reportes enviados'],
            ['Pendientes', stats?.pendientes || 0, 'Por enviar'],
          ].map(([label, value, description]) => (
            <Card key={label} className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div>
                  <div className={labelClass}>{label}</div>
                  <div className="mt-3 text-3xl font-black text-white">{value}</div>
                  <div className="mt-1 text-xs text-cyan-100/55">{description}</div>
                </div>
                <span className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-cyan-100">
                  <ShieldCheck className="h-5 w-5" />
                </span>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
            <CardTitle className="text-base text-white">Filtros SIRE</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 lg:grid-cols-[160px_220px_180px_auto] lg:items-end">
            <input
              type="month"
              value={filters.periodo}
              onChange={(event) => setFilters(prev => ({ ...prev, periodo: event.target.value }))}
              className={inputClass}
            />
            <select
              value={filters.tipoReporte}
              onChange={(event) => setFilters(prev => ({ ...prev, tipoReporte: event.target.value }))}
              className={inputClass}
            >
              <option value="">Todos los tipos</option>
              <option value="REGISTRO_VENTAS">Registro de Ventas</option>
              <option value="REGISTRO_COMPRAS">Registro de Compras</option>
              <option value="LIBROS_ELECTRONICOS">Libros Electronicos</option>
              <option value="RETENCIONES">Retenciones</option>
            </select>
            <select
              value={filters.estado}
              onChange={(event) => setFilters(prev => ({ ...prev, estado: event.target.value }))}
              className={inputClass}
            >
              <option value="">Todos los estados</option>
              <option value="GENERANDO">Generando</option>
              <option value="GENERADO">Generado</option>
              <option value="ENVIADO">Enviado</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="ERROR">Error</option>
            </select>
            <Button type="button" onClick={loadData} variant="outline" className="gap-2 border-cyan-400/20 bg-cyan-400/10 text-cyan-50 hover:bg-cyan-400/15 hover:text-white">
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </Button>
          </CardContent>
        </Card>

        <Card className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
            <CardTitle className="text-base text-white">Reportes SIRE</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {reports.length === 0 && !loading ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
                <FileText className="mb-3 h-12 w-12 text-cyan-200/50" />
                <h3 className="text-lg font-bold text-white">No hay reportes SIRE</h3>
                <p className="mt-2 text-sm text-slate-400">Comienza generando tu primer reporte para SUNAT.</p>
                <Button type="button" onClick={() => setIsModalOpen(true)} className="mt-4 gap-2 bg-blue-600 text-white hover:bg-blue-500">
                  <FileText className="h-4 w-4" />
                  Generar primer reporte
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="!m-0 w-full min-w-full table-fixed border-collapse !bg-slate-950/80 text-sm !shadow-none">
                  <thead className="!bg-slate-900/90 text-xs uppercase tracking-[0.12em] text-cyan-200/70">
                    <tr>
                      <th className="w-[10%] !border-cyan-400/10 !bg-slate-900/90 px-4 py-3 text-left text-cyan-200/70">Periodo</th>
                      <th className="w-[34%] !border-cyan-400/10 !bg-slate-900/90 px-4 py-3 text-left text-cyan-200/70">Reporte</th>
                      <th className="w-[14%] !border-cyan-400/10 !bg-slate-900/90 px-4 py-3 text-left text-cyan-200/70">Generacion</th>
                      <th className="w-[10%] !border-cyan-400/10 !bg-slate-900/90 px-4 py-3 text-right text-cyan-200/70">Registros</th>
                      <th className="w-[12%] !border-cyan-400/10 !bg-slate-900/90 px-4 py-3 text-center text-cyan-200/70">Estado</th>
                      <th className="w-[20%] !border-cyan-400/10 !bg-slate-900/90 px-4 py-3 text-right text-cyan-200/70">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-400/10">
                    {reports.map((report) => (
                      <tr className="!bg-slate-950/50 text-slate-200 transition hover:!bg-slate-900/80" key={report.id}>
                        <td className="!border-cyan-400/10 !bg-transparent px-4 py-3 font-mono font-semibold text-white">{report.periodo}</td>
                        <td className="!border-cyan-400/10 !bg-transparent px-4 py-3">
                          <div className="space-y-1">
                            <div className="truncate font-semibold text-slate-100">{report.tipo_display || report.tipoReporte || 'N/A'}</div>
                            {report.filename ? (
                              <div className="max-w-md truncate text-xs text-cyan-100/55">{report.filename}</div>
                            ) : null}
                          </div>
                        </td>
                        <td className="!border-cyan-400/10 !bg-transparent px-4 py-3 text-slate-300">
                          {report.created_at ? new Date(report.created_at).toLocaleDateString('es-PE') : 'N/A'}
                        </td>
                        <td className="!border-cyan-400/10 !bg-transparent px-4 py-3 text-right font-bold text-cyan-50">
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
                                  className="gap-1 border-cyan-400/20 bg-cyan-400/10 px-2 text-cyan-50 hover:bg-cyan-400/15 hover:text-white"
                                >
                                  <Download className="h-4 w-4" />
                                  {activeDownloadId === report.id ? 'Descargando...' : 'Descargar'}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => sendToSunat(report.id)}
                                  disabled={activeSunatSendId === report.id}
                                  className="gap-1 bg-cyan-600 text-white hover:bg-cyan-500"
                                >
                                  <Send className="h-4 w-4" />
                                  {activeSunatSendId === report.id ? 'Enviando...' : 'Enviar'}
                                </Button>
                              </>
                            ) : null}
                            {report.estado === 'ENVIADO' ? (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => downloadReport(report.id, report.filename || 'reporte.txt')}
                                disabled={activeDownloadId === report.id}
                                variant="outline"
                              className="gap-1 border-cyan-400/20 bg-cyan-400/10 text-cyan-50 hover:bg-cyan-400/15 hover:text-white"
                              >
                                <Download className="h-4 w-4" />
                                {activeDownloadId === report.id ? 'Descargando...' : 'Descargar'}
                              </Button>
                            ) : null}
                            {report.estado === 'GENERANDO' ? (
                              <span className="inline-flex rounded-full border border-sky-300/30 bg-sky-300/10 px-3 py-1 text-xs font-semibold text-sky-100">
                                Procesando...
                              </span>
                            ) : null}
                            {report.estado === 'ERROR' ? (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => setIsModalOpen(true)}
                                variant="outline"
                                className="border-slate-400/20 bg-slate-400/10 text-slate-100 hover:bg-slate-400/15 hover:text-white"
                              >
                                Reintentar
                              </Button>
                            ) : null}
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
      </div>

      <SireReportModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleReportGenerated}
      />
    </div>
  )
}
