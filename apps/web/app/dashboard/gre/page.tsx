'use client'

import { useState, useCallback, useEffect } from 'react'
import { Download, Eye, FileText, Plus, RefreshCw, ShieldCheck, Truck } from 'lucide-react'

import GreModal from '@/components/modals/GreModal'
import GreViewModal from '@/components/modals/GreViewModal'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useApiCall } from '@/hooks/use-api'
import { apiSucceeded, unwrapApiArray, unwrapApiObject } from '@/lib/api-contract'

interface GreDocument {
  id: string
  numero: string
  destinatario: string
  direccionDestino: string
  fechaTraslado: string
  fechaCreacion: string
  modalidad: 'TRANSPORTE_PUBLICO' | 'TRANSPORTE_PRIVADO'
  motivo: string
  pesoTotal: number
  estado: 'PENDIENTE' | 'EMITIDO' | 'ACEPTADO' | 'RECHAZADO' | 'ANULADO'
  observaciones?: string
  transportista?: string
  placaVehiculo?: string
  licenciaConducir?: string
}

interface GreStats {
  greEmitidas: number
  totalGre: number
  enTransito: number
  completados: number
}

const inputClass =
  'rounded-xl border border-cyan-400/20 bg-slate-950/75 px-3 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10'

const labelClass = 'text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200/70'

const getStatusClass = (estado: string) => {
  switch (estado) {
    case 'ACEPTADO':
      return 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100'
    case 'EMITIDO':
      return 'border-blue-300/30 bg-blue-300/10 text-blue-100'
    case 'PENDIENTE':
      return 'border-sky-300/30 bg-sky-300/10 text-sky-100'
    case 'RECHAZADO':
    case 'ANULADO':
      return 'border-slate-300/30 bg-slate-300/10 text-slate-100'
    default:
      return 'border-slate-400/30 bg-slate-400/10 text-slate-200'
  }
}

export default function GREPage() {
  const [documents, setDocuments] = useState<GreDocument[]>([])
  const [stats, setStats] = useState<GreStats | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('')
  const [filters, setFilters] = useState({
    modalidad: '',
    estado: '',
    fechaDesde: '',
    fechaHasta: ''
  })

  const { get, loading } = useApiCall<GreDocument[]>({ timeoutMs: 6000, retries: 1 })
  const { get: getStats } = useApiCall<GreStats>({ timeoutMs: 6000, retries: 1 })

  const loadDocuments = useCallback(async () => {
    const queryParams = new URLSearchParams()
    if (filters.modalidad) queryParams.append('modalidad', filters.modalidad)
    if (filters.estado) queryParams.append('estado', filters.estado)
    if (filters.fechaDesde) queryParams.append('fechaDesde', filters.fechaDesde)
    if (filters.fechaHasta) queryParams.append('fechaHasta', filters.fechaHasta)

    const response = await get(`/api/gre/guias?${queryParams}`)
    const documents = unwrapApiArray<GreDocument>(response)
    if (apiSucceeded(response)) {
      console.log('GRE Data recibida:', documents)
      setDocuments(documents)
    } else {
      console.log('No hay datos de GRE o respuesta incorrecta:', response)
      setDocuments([])
    }
  }, [get, filters])

  const loadStats = useCallback(async () => {
    const response = await getStats('/api/gre/stats')
    if (apiSucceeded(response)) {
      const stats = unwrapApiObject<GreStats>(response, {
        greEmitidas: 0,
        totalGre: 0,
        enTransito: 0,
        completados: 0
      })
      console.log('GRE Stats recibidas:', stats)
      setStats(stats)
    } else {
      console.log('No hay estadisticas de GRE o respuesta incorrecta:', response)
      setStats({
        greEmitidas: 0,
        totalGre: 0,
        enTransito: 0,
        completados: 0
      })
    }
  }, [getStats])

  const loadData = useCallback(async () => {
    await Promise.all([
      loadDocuments(),
      loadStats()
    ])
  }, [loadDocuments, loadStats])

  useEffect(() => {
    loadData()
  }, [loadData])

  const generateReport = async () => {
    const data = await get('/api/gre/reporte')
    if (data) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `reporte-gre-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    }
  }

  const getStatusText = (estado: string) => {
    switch (estado) {
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
        return estado
    }
  }

  const getModalidadText = (modalidad: string) => {
    return modalidad === 'TRANSPORTE_PUBLICO' ? 'Transporte Publico' : 'Transporte Privado'
  }

  const handleGreCreated = () => {
    loadData()
  }

  const viewDocument = (documentId: string) => {
    console.log(`Abriendo vista de GRE: ${documentId}`)
    setSelectedDocumentId(documentId)
    setIsViewModalOpen(true)
  }

  if (loading && documents.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 p-5 text-slate-100">
        <div className="mx-auto flex min-h-[420px] max-w-[1600px] flex-col items-center justify-center gap-3 rounded-3xl border border-cyan-400/20 bg-slate-950/75 shadow-2xl shadow-blue-950/30">
          <RefreshCw className="h-8 w-8 animate-spin text-cyan-200" />
          <p className="text-sm text-slate-300">Cargando guias de remision...</p>
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
                ERP Logistics Center
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Guias de Remision Electronica</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">Gestion de transporte, trazabilidad GRE y documentos logisticos.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={generateReport} variant="outline" className="gap-2 border-cyan-400/20 bg-cyan-400/10 text-cyan-50 hover:bg-cyan-400/15 hover:text-white">
                <Download className="h-4 w-4" />
                Generar reporte
              </Button>
              <Button type="button" onClick={() => setIsModalOpen(true)} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">
                <Plus className="h-4 w-4" />
                Nueva GRE
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['GRE emitidas hoy', stats?.greEmitidas || 0, 'Guias hoy'],
            ['Total GRE', stats?.totalGre || 0, 'Guias del mes'],
            ['En transito', stats?.enTransito || 0, 'Transportes activos'],
            ['Completados', stats?.completados || 0, 'Entregas exitosas'],
          ].map(([label, value, description]) => (
            <Card key={label} className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div>
                  <div className={labelClass}>{label}</div>
                  <div className="mt-3 text-3xl font-black text-white">{value}</div>
                  <div className="mt-1 text-xs text-cyan-100/55">{description}</div>
                </div>
                <span className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-cyan-100">
                  <Truck className="h-5 w-5" />
                </span>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
            <CardTitle className="text-base text-white">Filtros GRE</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 lg:grid-cols-[220px_180px_160px_160px_auto] lg:items-end">
            <select
              value={filters.modalidad}
              onChange={(event) => setFilters(prev => ({ ...prev, modalidad: event.target.value }))}
              className={inputClass}
            >
              <option value="">Todas las modalidades</option>
              <option value="TRANSPORTE_PUBLICO">Transporte Publico</option>
              <option value="TRANSPORTE_PRIVADO">Transporte Privado</option>
            </select>
            <select
              value={filters.estado}
              onChange={(event) => setFilters(prev => ({ ...prev, estado: event.target.value }))}
              className={inputClass}
            >
              <option value="">Todos los estados</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="EN_TRANSITO">En Transito</option>
              <option value="COMPLETADO">Completado</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
            <input
              type="date"
              value={filters.fechaDesde}
              onChange={(event) => setFilters(prev => ({ ...prev, fechaDesde: event.target.value }))}
              className={inputClass}
            />
            <input
              type="date"
              value={filters.fechaHasta}
              onChange={(event) => setFilters(prev => ({ ...prev, fechaHasta: event.target.value }))}
              className={inputClass}
            />
            <Button type="button" onClick={loadData} variant="outline" className="gap-2 border-cyan-400/20 bg-cyan-400/10 text-cyan-50 hover:bg-cyan-400/15 hover:text-white">
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </Button>
          </CardContent>
        </Card>

        <Card className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
            <CardTitle className="text-base text-white">Lista de guias de remision</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {Array.isArray(documents) && documents.length === 0 && !loading ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
                <Truck className="mb-3 h-12 w-12 text-cyan-200/50" />
                <h3 className="text-lg font-bold text-white">No hay guias de remision</h3>
                <p className="mt-2 text-sm text-slate-400">Comienza creando tu primera guia electronica.</p>
                <Button type="button" onClick={() => setIsModalOpen(true)} className="mt-4 gap-2 bg-blue-600 text-white hover:bg-blue-500">
                  <Plus className="h-4 w-4" />
                  Crear primera GRE
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="!m-0 w-full min-w-full table-fixed border-collapse !bg-slate-950/80 text-sm !shadow-none">
                  <thead className="!bg-slate-900/90 text-xs uppercase tracking-[0.12em] text-cyan-200/70">
                    <tr>
                      <th className="w-[12%] !border-cyan-400/10 !bg-slate-900/90 px-4 py-3 text-left text-cyan-200/70">Serie</th>
                      <th className="w-[28%] !border-cyan-400/10 !bg-slate-900/90 px-4 py-3 text-left text-cyan-200/70">Destinatario</th>
                      <th className="w-[12%] !border-cyan-400/10 !bg-slate-900/90 px-4 py-3 text-left text-cyan-200/70">Traslado</th>
                      <th className="w-[18%] !border-cyan-400/10 !bg-slate-900/90 px-4 py-3 text-left text-cyan-200/70">Modalidad</th>
                      <th className="w-[10%] !border-cyan-400/10 !bg-slate-900/90 px-4 py-3 text-right text-cyan-200/70">Peso</th>
                      <th className="w-[10%] !border-cyan-400/10 !bg-slate-900/90 px-4 py-3 text-center text-cyan-200/70">Estado</th>
                      <th className="w-[10%] !border-cyan-400/10 !bg-slate-900/90 px-4 py-3 text-right text-cyan-200/70">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-400/10">
                    {Array.isArray(documents) && documents.map((doc) => (
                      <tr className="!bg-slate-950/50 text-slate-200 transition hover:!bg-slate-900/80" key={doc.id}>
                        <td className="break-words !border-cyan-400/10 !bg-transparent px-4 py-3 font-mono font-semibold text-white">{doc.numero}</td>
                        <td className="!border-cyan-400/10 !bg-transparent px-4 py-3">
                          <div className="space-y-1">
                            <div className="truncate font-semibold text-slate-100">{doc.destinatario}</div>
                            <div className="max-w-sm truncate text-xs text-cyan-100/55">{doc.direccionDestino}</div>
                          </div>
                        </td>
                        <td className="!border-cyan-400/10 !bg-transparent px-4 py-3 text-slate-300">{new Date(doc.fechaTraslado).toLocaleDateString('es-PE')}</td>
                        <td className="!border-cyan-400/10 !bg-transparent px-4 py-3">
                          <div className="space-y-1">
                            <div className="truncate text-slate-100">{getModalidadText(doc.modalidad)}</div>
                            {doc.transportista ? <div className="text-xs text-cyan-100/55">{doc.transportista}</div> : null}
                            {doc.placaVehiculo ? <div className="text-xs text-cyan-100/55">Placa: {doc.placaVehiculo}</div> : null}
                          </div>
                        </td>
                        <td className="!border-cyan-400/10 !bg-transparent px-4 py-3 text-right font-bold text-cyan-50">{doc.pesoTotal} Kg</td>
                        <td className="!border-cyan-400/10 !bg-transparent px-4 py-3 text-center">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClass(doc.estado)}`}>
                            {getStatusText(doc.estado)}
                          </span>
                        </td>
                        <td className="!border-cyan-400/10 !bg-transparent px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => viewDocument(doc.id)}
                              variant="outline"
                              className="gap-1 border-cyan-400/20 bg-cyan-400/10 px-2 text-cyan-50 hover:bg-cyan-400/15 hover:text-white"
                            >
                              <Eye className="h-4 w-4" />
                              Ver
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              disabled
                              title="Representacion PDF GRE no disponible en este entorno"
                              aria-label="PDF GRE no disponible"
                              variant="outline"
                              className="gap-1 border-slate-400/20 bg-slate-400/10 px-2 text-slate-300"
                            >
                              <FileText className="h-4 w-4" />
                              PDF
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
      </div>

      <GreModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleGreCreated}
      />

      <GreViewModal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        documentId={selectedDocumentId}
      />
    </div>
  )
}
