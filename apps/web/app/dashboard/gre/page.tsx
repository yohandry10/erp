'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { parseDateLocal } from '@/lib/date-utils'
import { Download, Eye, FileText, Plus, RefreshCw, ShieldCheck, Truck } from 'lucide-react'

import GreModal from '@/components/modals/GreModal'
import GreViewModal from '@/components/modals/GreViewModal'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCountryContext } from '@/hooks/use-country-context'
import { useAuth } from '@/contexts/AuthContext'
import { useGreRead } from '@/hooks/use-gre-read'
import { GreDocument, greList, greStats } from '@/lib/gre-read-contract'
import { liveGreFile, saveGreFile } from '@/lib/gre-download'

const inputClass =
  'rounded-xl border border-cyan-400/20 bg-card/75 px-3 py-3 text-sm text-foreground outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10'

const labelClass = 'text-xs font-semibold uppercase tracking-[0.12em] text-primary/80'

const getStatusClass = (estado: string) => {
  switch (estado) {
    case 'ACEPTADO':
      return 'border-cyan-300/30 bg-cyan-300/10 text-primary'
    case 'EMITIDO':
      return 'border-blue-300/30 bg-blue-300/10 text-primary dark:text-blue-200'
    case 'PENDIENTE':
      return 'border-sky-300/30 bg-sky-300/10 text-primary dark:text-sky-200'
    case 'RECHAZADO':
    case 'ANULADO':
      return 'border-border/30 bg-slate-300/10 text-foreground'
    default:
      return 'border-border/30 bg-slate-400/10 text-foreground/90'
  }
}

export default function GREPage() {
  const country = useCountryContext()
  const isPeru = (country.paisCodigo || 'PE').toUpperCase() === 'PE'
  const [mounted, setMounted] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('')
  const [filters, setFilters] = useState({
    modalidad: '',
    estado: '',
    fechaDesde: '',
    fechaHasta: ''
  })

  const { session } = useAuth()
  const scope = `${session?.user?.tenant_id || ''}:${session?.user?.id || ''}:${JSON.stringify(filters)}`
  const scopeRef = useRef(scope); scopeRef.current = scope
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  useEffect(() => { setDownloadError(null); setDownloading(false); setIsViewModalOpen(false); setIsModalOpen(false); setSelectedDocumentId('') }, [scope])
  const queryParams = new URLSearchParams()
  if (filters.modalidad) queryParams.append('modalidad', filters.modalidad)
  if (filters.estado) queryParams.append('estado', filters.estado)
  if (filters.fechaDesde) queryParams.append('desde', filters.fechaDesde)
  if (filters.fechaHasta) queryParams.append('hasta', filters.fechaHasta)
  const enabled = mounted && !country.loading && isPeru
  const documentsRead = useGreRead(`/api/gre/guias?${queryParams}`, greList, enabled)
  const statsRead = useGreRead('/api/gre/stats', greStats, enabled)
  const documents = documentsRead.data || []; const stats = statsRead.data
  const loading = documentsRead.loading

  useEffect(() => setMounted(true), [])

  const loadData = useCallback(async () => {
    await Promise.all([documentsRead.reload(), statsRead.reload()])
  }, [documentsRead.reload, statsRead.reload])

  const generateReport = async () => {
    if (downloading || loading || documentsRead.error) return
    const current = scope; setDownloadError(null); setDownloading(true)
    try {
      const blob = await liveGreFile('/api/gre/reporte', 'csv')
      if (current === scopeRef.current) saveGreFile(blob, `reporte-gre-${new Date().toISOString().split('T')[0]}.csv`)
    } catch (error) { if (current === scopeRef.current) setDownloadError(error instanceof Error ? error.message : 'No se pudo descargar el reporte GRE.') }
    finally { if (current === scopeRef.current) setDownloading(false) }
  }

  const downloadPdf = async (document: GreDocument) => {
    if (downloading || loading || documentsRead.error) return
    const current = scope; setDownloadError(null); setDownloading(true)
    try {
      const blob = await liveGreFile(`/api/gre/guias/${document.id}/pdf/`, 'pdf')
      if (current === scopeRef.current) saveGreFile(blob, `GRE-${document.numero}.pdf`)
    } catch (error) {
      if (current === scopeRef.current) setDownloadError(error instanceof Error ? error.message : 'No se pudo descargar la guía.')
    } finally { if (current === scopeRef.current) setDownloading(false) }
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

  if (!mounted || country.loading) {
    return (
      <div className="min-h-screen bg-background p-5 text-foreground">
        <div className="mx-auto flex min-h-[420px] max-w-[1600px] flex-col items-center justify-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Cargando guías de remisión...</p>
        </div>
      </div>
    )
  }

  if (!isPeru) {
    return (
      <div className="min-h-screen bg-background p-5 text-foreground">
        <div className="mx-auto flex min-h-[420px] max-w-4xl flex-col items-center justify-center gap-4 rounded-3xl border border-border bg-card p-8 text-center shadow-xl">
          <ShieldCheck className="size-12 text-primary" />
          <h1 className="text-2xl font-bold">Módulo exclusivo de Perú</h1>
          <p className="max-w-2xl text-muted-foreground">
            Las Guías de Remisión Electrónica (GRE) corresponden a SUNAT Perú. Para {country.paisNombre},
            el ERP mantiene logística, despachos y remisiones comerciales sin exponer formatos fiscales peruanos.
          </p>
        </div>
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
                ERP Logistics Center
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground">Guías de Remisión Electrónica</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Gestion de transporte, trazabilidad GRE y documentos logisticos.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={downloading || loading || !!documentsRead.error} onClick={generateReport} title="Reporte de todas las guías, independiente de los filtros del listado" variant="outline" className="gap-2 border-cyan-400/20 bg-cyan-400/10 text-primary hover:bg-cyan-400/15 hover:text-foreground">
                <Download className="h-4 w-4" />
                Descargar reporte CSV
              </Button>
              <Button type="button" disabled={loading || !!documentsRead.error} onClick={() => setIsModalOpen(true)} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">
                <Plus className="h-4 w-4" />
                Nueva GRE
              </Button>
            </div>
          </div>
        </section>

        {downloadError && <div role="alert" className="rounded-xl border border-destructive p-4 text-destructive">{downloadError}</div>}
        {statsRead.error && <div role="alert" className="rounded-xl border border-destructive p-4 text-destructive">{statsRead.error} <Button variant="outline" onClick={statsRead.reload}>Reintentar indicadores</Button></div>}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['GRE emitidas hoy', stats?.greEmitidas ?? '—', 'Guías creadas hoy'],
            ['Total GRE', stats?.totalGre ?? '—', 'Todas las guías'],
            ['En transito', stats?.enTransito ?? '—', 'Firmadas o enviadas'],
            ['Completados', stats?.completados ?? '—', 'Aceptación fiscal confirmada'],
          ].map(([label, value, description]) => (
            <Card key={label} className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div>
                  <div className={labelClass}>{label}</div>
                  <div className="mt-3 text-3xl font-black text-foreground">{value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{description}</div>
                </div>
                <span className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-primary">
                  <Truck className="h-5 w-5" />
                </span>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
            <CardTitle className="text-base text-foreground">Filtros GRE</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 lg:items-end">
            <select aria-label="Modalidad"
              value={filters.modalidad}
              onChange={(event) => setFilters(prev => ({ ...prev, modalidad: event.target.value }))}
              className={inputClass}
            >
              <option value="">Todas las modalidades</option>
              <option value="TRANSPORTE_PUBLICO">Transporte Publico</option>
              <option value="TRANSPORTE_PRIVADO">Transporte Privado</option>
            </select>
            <select aria-label="Estado"
              value={filters.estado}
              onChange={(event) => setFilters(prev => ({ ...prev, estado: event.target.value }))}
              className={inputClass}
            >
              <option value="">Todos los estados</option>
              <option value="BORRADOR">Borrador</option>
              <option value="FIRMADO">Firmado</option>
              <option value="ENVIADO">Enviado</option>
              <option value="ACEPTADO">Aceptado</option>
              <option value="RECHAZADO">Rechazado</option>
              <option value="ERROR">Error técnico</option>
              <option value="ANULADO">Anulado</option>
            </select>
            <input aria-label="Fecha desde"
              type="date"
              value={filters.fechaDesde}
              onChange={(event) => setFilters(prev => ({ ...prev, fechaDesde: event.target.value }))}
              className={inputClass}
            />
            <input aria-label="Fecha hasta"
              type="date"
              value={filters.fechaHasta}
              onChange={(event) => setFilters(prev => ({ ...prev, fechaHasta: event.target.value }))}
              className={inputClass}
            />
            <Button type="button" onClick={loadData} variant="outline" className="gap-2 border-cyan-400/20 bg-cyan-400/10 text-primary hover:bg-cyan-400/15 hover:text-foreground">
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </Button>
          </CardContent>
        </Card>

        <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
            <CardTitle className="text-base text-foreground">Lista de guías de remisión</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {documentsRead.error ? <div role="alert" className="p-8 text-destructive">{documentsRead.error} <Button variant="outline" onClick={documentsRead.reload}>Reintentar guías</Button></div>
            : loading ? <p className="p-8 text-muted-foreground">Consultando guías actuales…</p>
            : documents.length === 0 ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
                <Truck className="mb-3 h-12 w-12 text-cyan-200/50" />
                <h3 className="text-lg font-bold text-foreground">{Object.values(filters).some(Boolean) ? 'Sin guías para estos filtros' : 'No hay guías de remisión'}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{Object.values(filters).some(Boolean) ? 'Modifica los filtros para consultar otras guías.' : 'Comienza creando tu primera guía electrónica.'}</p>
                <Button type="button" onClick={() => setIsModalOpen(true)} className="mt-4 gap-2 bg-blue-600 text-white hover:bg-blue-500">
                  <Plus className="h-4 w-4" />
                  {Object.values(filters).some(Boolean) ? 'Nueva GRE' : 'Crear primera GRE'}
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="!m-0 w-full min-w-full table-fixed border-collapse !bg-card/80 text-sm !shadow-none">
                  <thead className="!bg-card/90 text-xs uppercase tracking-[0.12em] text-primary/80">
                    <tr>
                      <th className="w-[12%] !border-cyan-400/10 !bg-card/90 px-4 py-3 text-left text-primary/80">Serie</th>
                      <th className="w-[28%] !border-cyan-400/10 !bg-card/90 px-4 py-3 text-left text-primary/80">Destinatario</th>
                      <th className="w-[12%] !border-cyan-400/10 !bg-card/90 px-4 py-3 text-left text-primary/80">Traslado</th>
                      <th className="w-[18%] !border-cyan-400/10 !bg-card/90 px-4 py-3 text-left text-primary/80">Modalidad</th>
                      <th className="w-[10%] !border-cyan-400/10 !bg-card/90 px-4 py-3 text-right text-primary/80">Peso</th>
                      <th className="w-[10%] !border-cyan-400/10 !bg-card/90 px-4 py-3 text-center text-primary/80">Estado</th>
                      <th className="w-[10%] !border-cyan-400/10 !bg-card/90 px-4 py-3 text-right text-primary/80">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-400/10">
                    {Array.isArray(documents) && documents.map((doc) => (
                      <tr className="!bg-card/50 text-foreground/90 transition hover:!bg-card/80" key={doc.id}>
                        <td className="break-words !border-cyan-400/10 !bg-transparent px-4 py-3 font-mono font-semibold text-foreground">{doc.numero}</td>
                        <td className="!border-cyan-400/10 !bg-transparent px-4 py-3">
                          <div className="space-y-1">
                            <div className="truncate font-semibold text-foreground">{doc.destinatario}</div>
                            <div className="max-w-sm truncate text-xs text-muted-foreground">{doc.direccionDestino}</div>
                          </div>
                        </td>
                        <td className="!border-cyan-400/10 !bg-transparent px-4 py-3 text-muted-foreground">{parseDateLocal(doc.fechaTraslado).toLocaleDateString('es-PE')}</td>
                        <td className="!border-cyan-400/10 !bg-transparent px-4 py-3">
                          <div className="space-y-1">
                            <div className="truncate text-foreground">{getModalidadText(doc.modalidad)}</div>
                            {doc.transportista ? <div className="text-xs text-muted-foreground">{doc.transportista}</div> : null}
                            {doc.placaVehiculo ? <div className="text-xs text-muted-foreground">Placa: {doc.placaVehiculo}</div> : null}
                          </div>
                        </td>
                        <td className="!border-cyan-400/10 !bg-transparent px-4 py-3 text-right font-bold text-primary">{doc.pesoTotal} Kg</td>
                        <td className="!border-cyan-400/10 !bg-transparent px-4 py-3 text-center">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClass(doc.estado)}`}>
                            {getStatusText(doc.estado)}
                          </span>
                        </td>
                        <td className="!border-cyan-400/10 !bg-transparent px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Button
                              type="button"
                              disabled={downloading}
                              size="sm"
                              onClick={() => viewDocument(doc.id)}
                              variant="outline"
                              className="gap-1 border-cyan-400/20 bg-cyan-400/10 px-2 text-primary hover:bg-cyan-400/15 hover:text-foreground"
                            >
                              <Eye className="h-4 w-4" />
                              Ver
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => downloadPdf(doc)}
                              disabled={downloading}
                              title="Descargar PDF GRE"
                              aria-label="Descargar PDF GRE"
                              variant="outline"
                              className="gap-1 border-border/20 bg-slate-400/10 px-2 text-muted-foreground"
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
