'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download, Edit, FileText, Plus, RefreshCw, Send, XCircle, type LucideIcon } from 'lucide-react'
import { useApiCall } from '@/hooks/use-api'
import { useCountryContext } from '@/hooks/use-country-context'
import { parseDateLocal } from '@/lib/date-utils'
import DocumentoModal from '@/components/modals/DocumentoModal'
import { apiSucceeded, unwrapApiArray, unwrapApiData, unwrapApiObject } from '@/lib/api-contract'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
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
  'w-full rounded-xl border border-cyan-400/20 bg-card/75 px-3 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10'

const labelClass = 'text-xs font-semibold uppercase tracking-[0.12em] text-primary/80'

const estadoClasses: Record<string, string> = {
  BORRADOR: 'border-border/30 bg-slate-400/10 text-foreground/90',
  EMITIDO: 'border-blue-300/30 bg-blue-300/10 text-primary dark:text-blue-200',
  ENVIADO_SUNAT: 'border-cyan-300/30 bg-cyan-300/10 text-primary',
  ACEPTADO: 'border-cyan-300/30 bg-cyan-300/10 text-primary',
  RECHAZADO: 'border-amber-300/30 bg-amber-300/10 text-amber-400 dark:text-amber-200',
  ANULADO: 'border-border/30 bg-slate-300/10 text-foreground',
}

export default function DocumentosPage() {
  const country = useCountryContext()
  const isArgentina = country.paisCodigo === 'AR'
  const isColombia = country.paisCodigo === 'CO'
  const { toast } = useToast()
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [stats, setStats] = useState<DocumentoStats | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedDocumento, setSelectedDocumento] = useState<Documento | null>(null)
  const [documentoAAnular, setDocumentoAAnular] = useState<Documento | null>(null)
  const [motivoAnulacion, setMotivoAnulacion] = useState('')
  const [anulando, setAnulando] = useState(false)
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
  const openNewDocumentFlow = () => {
    if (isArgentina) {
      window.location.assign('/dashboard/cpe/')
      return
    }
    setSelectedDocumento(null)
    setIsModalOpen(true)
  }

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

  const anularDocumento = async () => {
    if (!documentoAAnular || !motivoAnulacion.trim()) return

    setAnulando(true)
    try {
      const response = await postDocumentoAction(
        `/api/documentos/${documentoAAnular.id}/anular`,
        { motivo: motivoAnulacion.trim() },
      )
      if (apiSucceeded(response)) {
        setDocumentoAAnular(null)
        setMotivoAnulacion('')
        await loadData()
        showSuccessToast('Documento y operaciones relacionadas anulados correctamente')
      } else {
        showErrorToast(response?.message || response?.error || 'Error al anular documento')
      }
    } finally {
      setAnulando(false)
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
      FACTURA: isArgentina ? 'Factura A' : isColombia ? 'Factura electrónica' : 'Factura',
      BOLETA: isArgentina ? 'Factura B' : isColombia ? 'Documento equivalente' : 'Boleta',
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
    { label: isArgentina ? 'Facturas B' : isColombia ? 'Documentos equivalentes' : 'Boletas', value: stats?.boletas || 0, description: 'Emitidos', icon: FileText },
    { label: 'Notas credito', value: stats?.notasCredito || 0, description: 'Notas emitidas', icon: FileText },
    { label: 'Contratos', value: stats?.contratos || 0, description: 'Registrados', icon: FileText },
    { label: 'Pendientes envio', value: stats?.pendientesEnvio || 0, description: `Por enviar a ${country.servicioFiscal}`, icon: Send },
  ]

  if (documentosLoading && documentos.length === 0) {
    return (
      <div className="min-h-screen bg-background p-5 text-foreground">
        <div className="mx-auto flex min-h-[420px] w-full max-w-[1600px] flex-col items-center justify-center gap-3 rounded-3xl border border-cyan-400/20 bg-card/75 shadow-2xl shadow-blue-950/30">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Cargando documentos...</p>
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
                ERP Document Center
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground">Gestión Documental y Facturación Electrónica</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                {isArgentina
                  ? 'Repositorio de facturas A/B, notas, contratos y documentos emitidos mediante ARCA.'
                  : isColombia
                    ? 'Facturas electrónicas, documentos equivalentes, notas y contratos con validación DIAN.'
                    : `Facturas, boletas, notas y contratos con validación ${country.servicioFiscal}.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={loadData} variant="outline" className="gap-2 border-cyan-400/20 bg-cyan-400/10 text-primary hover:bg-cyan-400/15 hover:text-foreground">
                <RefreshCw className="h-4 w-4" />
                Actualizar
              </Button>
              <Button type="button" onClick={openNewDocumentFlow} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">
                <Plus className="h-4 w-4" />
                {isArgentina ? 'Emitir en ARCA' : isColombia ? 'Crear documento DIAN' : 'Crear documento'}
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {statCards.map(({ label, value, description, icon: Icon }) => (
            <Card key={label} className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
              <CardContent className="flex h-full items-start justify-between gap-3 p-4">
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

        <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
            <CardTitle className="text-base text-foreground">Filtros de búsqueda</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4 xl:items-end">
            <label className="space-y-2">
              <span className={labelClass}>Tipo</span>
              <select className={inputClass} value={filters.tipo_documento} onChange={(event) => setFilters((prev) => ({ ...prev, tipo_documento: event.target.value }))}>
                <option value="">Todos los tipos</option>
                <option value="FACTURA">Facturas</option>
                <option value="BOLETA">{isArgentina ? 'Facturas B' : isColombia ? 'Documentos equivalentes' : 'Boletas'}</option>
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
              <span className={labelClass}>
                {isArgentina ? 'CUIT/DNI cliente' : isColombia ? 'NIT/CC cliente' : 'RUC/DNI cliente'}
              </span>
              <input className={inputClass} type="text" value={filters.receptor_numero_doc} onChange={(event) => setFilters((prev) => ({ ...prev, receptor_numero_doc: event.target.value }))} placeholder="Buscar por documento" />
            </label>
            <label className="space-y-2">
              <span className={labelClass}>Serie</span>
              <input className={inputClass} type="text" value={filters.serie} onChange={(event) => setFilters((prev) => ({ ...prev, serie: event.target.value }))} placeholder={isArgentina ? '00001' : isColombia ? 'FE' : 'F001'} />
            </label>
            <label className="space-y-2">
              <span className={labelClass}>Desde</span>
              <input className={inputClass} type="date" value={filters.fecha_desde} onChange={(event) => setFilters((prev) => ({ ...prev, fecha_desde: event.target.value }))} />
            </label>
            <label className="space-y-2">
              <span className={labelClass}>Hasta</span>
              <input className={inputClass} type="date" value={filters.fecha_hasta} onChange={(event) => setFilters((prev) => ({ ...prev, fecha_hasta: event.target.value }))} />
            </label>
            <Button type="button" onClick={clearFilters} variant="outline" className="gap-2 border-cyan-400/20 bg-cyan-400/10 text-primary hover:bg-cyan-400/15 hover:text-foreground">
              <XCircle className="h-4 w-4" />
              Limpiar
            </Button>
          </CardContent>
        </Card>

        <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
          <CardHeader className="flex flex-col gap-3 border-b border-cyan-400/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-base text-foreground">Lista de documentos</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{documentos.length} registros cargados</p>
            </div>
            <Button type="button" onClick={openNewDocumentFlow} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">
              <Plus className="h-4 w-4" />
              {isArgentina ? 'Emitir en ARCA' : isColombia ? 'Nuevo documento DIAN' : 'Nuevo documento'}
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {documentos.length === 0 && !documentosLoading ? (
              <div className="flex min-h-[340px] flex-col items-center justify-center p-8 text-center">
                <FileText className="mb-3 h-12 w-12 text-cyan-200/50" />
                <h3 className="text-lg font-bold text-foreground">No hay documentos registrados</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {isArgentina
                    ? 'Los comprobantes fiscales se emiten desde el módulo ARCA y aparecen aquí como documentos.'
                    : isColombia
                      ? 'Comienza creando tu primer documento electrónico para DIAN.'
                      : 'Comienza creando tu primer documento.'}
                </p>
                <Button type="button" onClick={openNewDocumentFlow} className="mt-4 gap-2 bg-blue-600 text-white hover:bg-blue-500">
                  <Plus className="h-4 w-4" />
                  {isArgentina ? 'Ir a Comprobantes ARCA' : isColombia ? 'Crear documento DIAN' : 'Crear primer documento'}
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] border-collapse text-sm">
                  <thead className="bg-card/80 text-xs uppercase tracking-[0.12em] text-primary/80">
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
                      <tr key={documento.id} className="bg-card/35 text-foreground/90 transition hover:bg-card/70">
                        <td className="px-4 py-3 font-semibold text-foreground">{getTipoDocumentoDisplay(documento.tipo_documento)}</td>
                        <td className="px-4 py-3 font-mono font-semibold text-foreground">{documento.serie}-{documento.numero}</td>
                        <td className="px-4 py-3 text-muted-foreground">{parseDateLocal(documento.fecha_emision).toLocaleDateString(country.locale || 'es-PE')}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-foreground">{documento.receptor_razon_social}</div>
                          <div className="text-xs text-muted-foreground">{documento.receptor_numero_doc}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-primary">{documento.moneda} {documento.total.toFixed(2)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${estadoClasses[documento.estado] || estadoClasses.BORRADOR}`}>
                            {getEstadoText(documento.estado)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            {documento.estado === 'BORRADOR' && (
                              <>
                                {!isArgentina && (
                                  <Button type="button" size="sm" onClick={() => generarXML(documento.id)} className="gap-1 bg-blue-600 text-white hover:bg-blue-500">
                                    <FileText className="h-4 w-4" />
                                    XML
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedDocumento(documento)
                                    setIsModalOpen(true)
                                  }}
                                  variant="outline"
                                  className="gap-1 border-cyan-400/20 bg-cyan-400/10 text-primary hover:bg-cyan-400/15 hover:text-foreground"
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
                                <Button type="button" size="sm" onClick={() => descargarPDF(documento.id, `${documento.serie}-${documento.numero}.pdf`)} variant="outline" className="gap-1 border-cyan-400/20 bg-cyan-400/10 text-primary hover:bg-cyan-400/15 hover:text-foreground">
                                  <Download className="h-4 w-4" />
                                  PDF
                                </Button>
                                {!isArgentina && (
                                  <Button type="button" size="sm" onClick={() => descargarXML(documento.id, `${documento.serie}-${documento.numero}.xml`)} variant="outline" className="gap-1 border-cyan-400/20 bg-cyan-400/10 text-primary hover:bg-cyan-400/15 hover:text-foreground">
                                    <Download className="h-4 w-4" />
                                    XML
                                  </Button>
                                )}
                              </>
                            )}
                            {!['ANULADO'].includes(documento.estado) && (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                  setDocumentoAAnular(documento)
                                  setMotivoAnulacion('')
                                }}
                                variant="outline"
                                className="gap-1 border-border/20 bg-slate-400/10 text-foreground hover:bg-slate-400/15 hover:text-foreground"
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

      <Dialog
        open={Boolean(documentoAAnular)}
        onOpenChange={(open) => {
          if (!open && !anulando) {
            setDocumentoAAnular(null)
            setMotivoAnulacion('')
          }
        }}
      >
        <DialogContent className="border-border bg-card text-card-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Anular documento fiscal</DialogTitle>
            <DialogDescription>
              {documentoAAnular
                ? `Se generará la nota de crédito y se revertirán contabilidad, caja, inventario y cuentas relacionadas de ${documentoAAnular.serie}-${documentoAAnular.numero}.`
                : 'Se ejecutará la anulación fiscal integral.'}
            </DialogDescription>
          </DialogHeader>

          <label className="space-y-2">
            <span className={labelClass}>Motivo de anulación</span>
            <Textarea
              aria-label="Motivo de anulación"
              value={motivoAnulacion}
              onChange={(event) => setMotivoAnulacion(event.target.value)}
              placeholder="Ej. devolución total de la operación"
              disabled={anulando}
            />
          </label>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={anulando}
              onClick={() => {
                setDocumentoAAnular(null)
                setMotivoAnulacion('')
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={anulando || !motivoAnulacion.trim()}
              onClick={anularDocumento}
            >
              {anulando ? 'Anulando...' : 'Confirmar anulación'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
