'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download, Edit, FileText, Plus, RefreshCw, Send, XCircle, type LucideIcon } from 'lucide-react'
import { useApiCall } from '@/hooks/use-api'
import { useCountryContext } from '@/hooks/use-country-context'
import DocumentoModal from '@/components/modals/DocumentoModal'
import { apiSucceeded, unwrapApiArray, unwrapApiData, unwrapApiObject } from '@/lib/api-contract'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'

interface Documento {
  id: string
  tipo_documento: string
  serie: string
  numero: string
  fecha_emision: string
  receptor_numero_doc: string
  receptor_razon_social: string
  total: number
  moneda: string
  estado: 'BORRADOR' | 'EMITIDO' | 'ENVIADO_SUNAT' | 'ACEPTADO' | 'RECHAZADO' | 'ANULADO'
  estado_sunat?: string
  observaciones?: string
}

interface DocumentoStats {
  totalDocumentos: number
  facturas: number
  boletas: number
  notasCredito: number
  contratos: number
  pendientesEnvio: number
}

type StatCard = {
  label: string
  value: number
  description: string
  icon: LucideIcon
}

const emptyStats: DocumentoStats = {
  totalDocumentos: 0,
  facturas: 0,
  boletas: 0,
  notasCredito: 0,
  contratos: 0,
  pendientesEnvio: 0,
}

const inputClass =
  'w-full rounded-xl border border-cyan-400/20 bg-slate-950/75 px-3 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10'

const labelClass = 'text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200/70'

const estadoClasses: Record<string, string> = {
  BORRADOR: 'border-slate-400/30 bg-slate-400/10 text-slate-200',
  EMITIDO: 'border-blue-300/30 bg-blue-300/10 text-blue-100',
  ENVIADO_SUNAT: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100',
  ACEPTADO: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100',
  RECHAZADO: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  ANULADO: 'border-slate-300/30 bg-slate-300/10 text-slate-100',
}

export default function DocumentosPage() {
  const country = useCountryContext()
  const { toast } = useToast()
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [stats, setStats] = useState<DocumentoStats | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedDocumento, setSelectedDocumento] = useState<Documento | null>(null)
  const [filters, setFilters] = useState({
    tipo_documento: '',
    estado: '',
    fecha_desde: '',
    fecha_hasta: '',
    receptor_numero_doc: '',
    serie: '',
  })

  const {
    get: getDocumentos,
    post: postDocumentoAction,
    loading: documentosLoading,
  } = useApiCall<Documento[]>()
  const { get: getStats } = useApiCall<DocumentoStats>()

  const loadDocumentos = useCallback(async () => {
    try {
      const queryParams = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => {
        if (value) queryParams.append(key, value)
      })

      const response = await getDocumentos(`/api/documentos/lista?${queryParams}`)
      const documentos = unwrapApiArray<Documento>(response)
      setDocumentos(apiSucceeded(response) ? documentos : [])
    } catch (error) {
      console.error('Error al cargar documentos:', error)
      setDocumentos([])
    }
  }, [filters, getDocumentos])

  const loadStats = useCallback(async () => {
    try {
      const response = await getStats('/api/documentos/stats')
      setStats(apiSucceeded(response) ? unwrapApiObject<DocumentoStats>(response, emptyStats) : emptyStats)
    } catch (error) {
      console.error('Error al cargar estadisticas:', error)
      setStats(emptyStats)
    }
  }, [getStats])

  const loadData = useCallback(async () => {
    await Promise.all([loadDocumentos(), loadStats()])
  }, [loadDocumentos, loadStats])

  useEffect(() => {
    loadData()
  }, [loadData])

  const showSuccessToast = (message: string) => toast({ title: 'Operacion completada', description: message })
  const showErrorToast = (message: string) => toast({ title: 'No se pudo completar', description: message, variant: 'destructive' })

  const enviarFiscal = async (documentoId: string) => {
    const response = await postDocumentoAction(`/api/documentos/${documentoId}/enviar-sunat`)
    if (apiSucceeded(response)) {
      loadDocumentos()
      showSuccessToast(`Documento enviado a ${country.servicioFiscal} correctamente`)
    } else {
      showErrorToast(response?.message || `Error al enviar documento a ${country.servicioFiscal}`)
    }
  }

  const generarXML = async (documentoId: string) => {
    const response = await postDocumentoAction(`/api/documentos/${documentoId}/generar-xml`)
    if (apiSucceeded(response)) {
      loadDocumentos()
      showSuccessToast('XML generado correctamente')
    } else {
      showErrorToast(response?.message || 'Error al generar XML')
    }
  }

  const descargarPDF = async (documentoId: string, filename: string) => {
    const response = await getDocumentos(`/api/documentos/${documentoId}/descargar-pdf`)
    const pdf = unwrapApiData<string | Blob | null>(response, null)
    if (apiSucceeded(response) && pdf) {
      const blob = new Blob([pdf], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      showSuccessToast('PDF descargado correctamente')
    }
  }

  const descargarXML = async (documentoId: string, filename: string) => {
    const response = await getDocumentos(`/api/documentos/${documentoId}/descargar-xml`)
    const xml = unwrapApiData<string | Blob | null>(response, null)
    if (apiSucceeded(response) && xml) {
      const blob = new Blob([xml], { type: 'application/xml' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      showSuccessToast('XML descargado correctamente')
    }
  }

  const anularDocumento = async (documentoId: string, motivo: string) => {
    const response = await postDocumentoAction(`/api/documentos/${documentoId}/anular`, { motivo })
    if (apiSucceeded(response)) {
      loadDocumentos()
      showSuccessToast('Documento anulado correctamente')
    } else {
      showErrorToast(response?.message || 'Error al anular documento')
    }
  }

  const getEstadoText = (estado: string) => {
    const estados: Record<string, string> = {
      BORRADOR: 'Borrador',
      EMITIDO: 'Emitido',
      ENVIADO_SUNAT: `Enviado ${country.servicioFiscal}`,
      ACEPTADO: 'Aceptado',
      RECHAZADO: 'Rechazado',
      ANULADO: 'Anulado',
    }
    return estados[estado] || estado
  }

  const getTipoDocumentoDisplay = (tipo: string) => {
    const tipos: Record<string, string> = {
      FACTURA: 'Factura',
      BOLETA: 'Boleta',
      NOTA_CREDITO: 'Nota de Credito',
      NOTA_DEBITO: 'Nota de Debito',
      CONTRATO: 'Contrato',
      GUIA_REMISION: 'Guia de Remision',
    }
    return tipos[tipo] || tipo
  }

  const handleDocumentoCreated = () => {
    loadData()
    setIsModalOpen(false)
    setSelectedDocumento(null)
  }

  const clearFilters = () =>
    setFilters({
      tipo_documento: '',
      estado: '',
      fecha_desde: '',
      fecha_hasta: '',
      receptor_numero_doc: '',
      serie: '',
    })

  const statCards: StatCard[] = [
    { label: 'Total documentos', value: stats?.totalDocumentos || 0, description: 'Registrados', icon: FileText },
    { label: 'Facturas', value: stats?.facturas || 0, description: 'Emitidas', icon: FileText },
    { label: 'Boletas', value: stats?.boletas || 0, description: 'Emitidas', icon: FileText },
    { label: 'Notas credito', value: stats?.notasCredito || 0, description: 'Notas emitidas', icon: FileText },
    { label: 'Contratos', value: stats?.contratos || 0, description: 'Registrados', icon: FileText },
    { label: 'Pendientes envio', value: stats?.pendientesEnvio || 0, description: `Por enviar a ${country.servicioFiscal}`, icon: Send },
  ]

  if (documentosLoading && documentos.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 p-5 text-slate-100">
        <div className="mx-auto flex min-h-[420px] w-full max-w-[1600px] flex-col items-center justify-center gap-3 rounded-3xl border border-cyan-400/20 bg-slate-950/75 shadow-2xl shadow-blue-950/30">
          <RefreshCw className="h-8 w-8 animate-spin text-cyan-200" />
          <p className="text-sm text-slate-300">Cargando documentos...</p>
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
                ERP Document Center
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Gestion Documental y Facturacion Electronica</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">
                Facturas, boletas, notas y contratos con validacion {country.servicioFiscal}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={loadData} variant="outline" className="gap-2 border-cyan-400/20 bg-cyan-400/10 text-cyan-50 hover:bg-cyan-400/15 hover:text-white">
                <RefreshCw className="h-4 w-4" />
                Actualizar
              </Button>
              <Button type="button" onClick={() => setIsModalOpen(true)} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">
                <Plus className="h-4 w-4" />
                Crear documento
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {statCards.map(({ label, value, description, icon: Icon }) => (
            <Card key={label} className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
              <CardContent className="flex h-full items-start justify-between gap-3 p-4">
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
            <CardTitle className="text-base text-white">Filtros de busqueda</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-[180px_180px_1fr_150px_150px_150px_auto] xl:items-end">
            <label className="space-y-2">
              <span className={labelClass}>Tipo</span>
              <select className={inputClass} value={filters.tipo_documento} onChange={(event) => setFilters((prev) => ({ ...prev, tipo_documento: event.target.value }))}>
                <option value="">Todos los tipos</option>
                <option value="FACTURA">Facturas</option>
                <option value="BOLETA">Boletas</option>
                <option value="NOTA_CREDITO">Notas de Credito</option>
                <option value="NOTA_DEBITO">Notas de Debito</option>
                <option value="CONTRATO">Contratos</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className={labelClass}>Estado</span>
              <select className={inputClass} value={filters.estado} onChange={(event) => setFilters((prev) => ({ ...prev, estado: event.target.value }))}>
                <option value="">Todos</option>
                <option value="BORRADOR">Borrador</option>
                <option value="EMITIDO">Emitido</option>
                <option value="ENVIADO_SUNAT">Enviado {country.servicioFiscal}</option>
                <option value="ACEPTADO">Aceptado</option>
                <option value="RECHAZADO">Rechazado</option>
                <option value="ANULADO">Anulado</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className={labelClass}>RUC/DNI cliente</span>
              <input className={inputClass} type="text" value={filters.receptor_numero_doc} onChange={(event) => setFilters((prev) => ({ ...prev, receptor_numero_doc: event.target.value }))} placeholder="Buscar por documento" />
            </label>
            <label className="space-y-2">
              <span className={labelClass}>Serie</span>
              <input className={inputClass} type="text" value={filters.serie} onChange={(event) => setFilters((prev) => ({ ...prev, serie: event.target.value }))} placeholder="F001" />
            </label>
            <label className="space-y-2">
              <span className={labelClass}>Desde</span>
              <input className={inputClass} type="date" value={filters.fecha_desde} onChange={(event) => setFilters((prev) => ({ ...prev, fecha_desde: event.target.value }))} />
            </label>
            <label className="space-y-2">
              <span className={labelClass}>Hasta</span>
              <input className={inputClass} type="date" value={filters.fecha_hasta} onChange={(event) => setFilters((prev) => ({ ...prev, fecha_hasta: event.target.value }))} />
            </label>
            <Button type="button" onClick={clearFilters} variant="outline" className="gap-2 border-cyan-400/20 bg-cyan-400/10 text-cyan-50 hover:bg-cyan-400/15 hover:text-white">
              <XCircle className="h-4 w-4" />
              Limpiar
            </Button>
          </CardContent>
        </Card>

        <Card className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
          <CardHeader className="flex flex-col gap-3 border-b border-cyan-400/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-base text-white">Lista de documentos</CardTitle>
              <p className="mt-1 text-sm text-slate-400">{documentos.length} registros cargados</p>
            </div>
            <Button type="button" onClick={() => setIsModalOpen(true)} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">
              <Plus className="h-4 w-4" />
              Nuevo documento
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {documentos.length === 0 && !documentosLoading ? (
              <div className="flex min-h-[340px] flex-col items-center justify-center p-8 text-center">
                <FileText className="mb-3 h-12 w-12 text-cyan-200/50" />
                <h3 className="text-lg font-bold text-white">No hay documentos registrados</h3>
                <p className="mt-2 text-sm text-slate-400">Comienza creando tu primer documento.</p>
                <Button type="button" onClick={() => setIsModalOpen(true)} className="mt-4 gap-2 bg-blue-600 text-white hover:bg-blue-500">
                  <Plus className="h-4 w-4" />
                  Crear primer documento
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] border-collapse text-sm">
                  <thead className="bg-slate-950/80 text-xs uppercase tracking-[0.12em] text-cyan-200/70">
                    <tr>
                      <th className="px-4 py-3 text-left">Tipo</th>
                      <th className="px-4 py-3 text-left">Numero</th>
                      <th className="px-4 py-3 text-left">Fecha</th>
                      <th className="px-4 py-3 text-left">Cliente</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-400/10">
                    {documentos.map((documento) => (
                      <tr key={documento.id} className="bg-slate-950/35 text-slate-200 transition hover:bg-slate-900/70">
                        <td className="px-4 py-3 font-semibold text-slate-100">{getTipoDocumentoDisplay(documento.tipo_documento)}</td>
                        <td className="px-4 py-3 font-mono font-semibold text-white">{documento.serie}-{documento.numero}</td>
                        <td className="px-4 py-3 text-slate-300">{new Date(documento.fecha_emision).toLocaleDateString('es-PE')}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-100">{documento.receptor_razon_social}</div>
                          <div className="text-xs text-cyan-100/55">{documento.receptor_numero_doc}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-cyan-50">{documento.moneda} {documento.total.toFixed(2)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${estadoClasses[documento.estado] || estadoClasses.BORRADOR}`}>
                            {getEstadoText(documento.estado)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            {documento.estado === 'BORRADOR' && (
                              <>
                                <Button type="button" size="sm" onClick={() => generarXML(documento.id)} className="gap-1 bg-blue-600 text-white hover:bg-blue-500">
                                  <FileText className="h-4 w-4" />
                                  XML
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedDocumento(documento)
                                    setIsModalOpen(true)
                                  }}
                                  variant="outline"
                                  className="gap-1 border-cyan-400/20 bg-cyan-400/10 text-cyan-50 hover:bg-cyan-400/15 hover:text-white"
                                >
                                  <Edit className="h-4 w-4" />
                                  Editar
                                </Button>
                              </>
                            )}
                            {documento.estado === 'EMITIDO' && (
                              <Button type="button" size="sm" onClick={() => enviarFiscal(documento.id)} className="gap-1 bg-cyan-600 text-white hover:bg-cyan-500">
                                <Send className="h-4 w-4" />
                                Enviar
                              </Button>
                            )}
                            {['ENVIADO_SUNAT', 'ACEPTADO'].includes(documento.estado) && (
                              <>
                                <Button type="button" size="sm" onClick={() => descargarPDF(documento.id, `${documento.serie}-${documento.numero}.pdf`)} variant="outline" className="gap-1 border-cyan-400/20 bg-cyan-400/10 text-cyan-50 hover:bg-cyan-400/15 hover:text-white">
                                  <Download className="h-4 w-4" />
                                  PDF
                                </Button>
                                <Button type="button" size="sm" onClick={() => descargarXML(documento.id, `${documento.serie}-${documento.numero}.xml`)} variant="outline" className="gap-1 border-cyan-400/20 bg-cyan-400/10 text-cyan-50 hover:bg-cyan-400/15 hover:text-white">
                                  <Download className="h-4 w-4" />
                                  XML
                                </Button>
                              </>
                            )}
                            {!['ANULADO'].includes(documento.estado) && (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                  const motivo = prompt('Ingrese el motivo de anulacion:')
                                  if (motivo) anularDocumento(documento.id, motivo)
                                }}
                                variant="outline"
                                className="gap-1 border-slate-300/20 bg-slate-400/10 text-slate-100 hover:bg-slate-400/15 hover:text-white"
                              >
                                <XCircle className="h-4 w-4" />
                                Anular
                              </Button>
                            )}
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

      <DocumentoModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setSelectedDocumento(null)
        }}
        onSuccess={handleDocumentoCreated}
        documento={selectedDocumento}
      />
    </div>
  )
}
