'use client'

import { useEffect, useMemo, useState } from 'react'
import { parseDateLocal } from '@/lib/date-utils'
import { Download, Filter, FileText, RefreshCcw } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { fetchApi } from '@/lib/api-fetch'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useCountryContext } from '@/hooks/use-country-context'

interface Documento {
  id: string
  fecha_emision?: string
  tipo_documento?: string
  serie?: string
  correlativo?: string
  numero_documento?: string
  receptor_nombre?: string
  receptor_numero_doc?: string
  estado?: string
  total?: number
}

export default function DescargasPage() {
  const { get } = useApi()
  const country = useCountryContext()
  const formatMoney = (value: number) =>
    new Intl.NumberFormat(country.locale || 'es-PE', {
      style: 'currency',
      currency: country.moneda || 'PEN',
    }).format(value)
  const [filtros, setFiltros] = useState({
    fecha_desde: format(new Date(new Date().setMonth(new Date().getMonth() - 1)), 'yyyy-MM-dd'),
    fecha_hasta: format(new Date(), 'yyyy-MM-dd'),
    tipo_documento: '',
    serie: ''
  })
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [loading, setLoading] = useState(false)
  const [descargandoId, setDescargandoId] = useState<string | null>(null)

  const cargar = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      Object.entries(filtros).forEach(([k, v]) => {
        if (v) params.set(k, v)
      })
      const resp = await get(`/documentos/lista?${params.toString()}`)
      setDocumentos(resp?.data?.data || resp?.data || [])
    } catch (e) {
      console.error('Error cargando documentos', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFiltro = (key: string, value: string) => {
    setFiltros(prev => ({ ...prev, [key]: value }))
  }

  const descargar = async (id: string, tipo: 'pdf' | 'xml') => {
    setDescargandoId(`${id}-${tipo}`)
    try {
      const response = await fetchApi(`/api/documentos/${id}/descargar-${tipo}`)
      if (!response.ok) {
        const message = await response.text().catch(() => '')
        throw new Error(message || `No se pudo descargar ${tipo.toUpperCase()}`)
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `documento-${id}.${tipo}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error descargando documento', error)
      alert(error instanceof Error ? error.message : 'No se pudo descargar el documento')
    } finally {
      setDescargandoId(null)
    }
  }

  const formatos = useMemo(
    () => [
      { value: '', label: 'Todos' },
      { value: '01', label: 'Factura' },
      {
        value: '03',
        label: country.paisCodigo === 'AR'
          ? 'Factura B'
          : country.paisCodigo === 'CO'
            ? 'Documento equivalente'
            : 'Boleta',
      },
      { value: '07', label: 'Nota de Crédito' },
      { value: '08', label: 'Nota de Débito' }
    ],
    [country.paisCodigo]
  )

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Mis Descargas CPE</h1>
          <p className="mt-2 text-base text-muted-foreground">Descarga tus XML/PDF históricos por rango de fechas y serie.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50" onClick={cargar}>
            <RefreshCcw size={18} /> Recargar
          </button>
        </div>
      </div>

      <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="m-0 text-lg font-bold text-foreground">
            <Filter className="mr-2 h-[18px] w-[18px]" /> Filtros
          </h2>
        </div>
        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
            <div>
              <label htmlFor="descargas-fecha-desde" className="text-sm font-medium text-foreground/85">Fecha desde</label>
              <input id="descargas-fecha-desde"
                type="date"
                value={filtros.fecha_desde}
                onChange={(e) => handleFiltro('fecha_desde', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="descargas-fecha-hasta" className="text-sm font-medium text-foreground/85">Fecha hasta</label>
              <input id="descargas-fecha-hasta"
                type="date"
                value={filtros.fecha_hasta}
                onChange={(e) => handleFiltro('fecha_hasta', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="descargas-tipo" className="text-sm font-medium text-foreground/85">Tipo</label>
              <select id="descargas-tipo"
                className="input"
                value={filtros.tipo_documento}
                onChange={(e) => handleFiltro('tipo_documento', e.target.value)}
              >
                {formatos.map(f => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="descargas-serie" className="text-sm font-medium text-foreground/85">Serie</label>
              <input id="descargas-serie"
                type="text"
                value={filtros.serie}
                placeholder={country.paisCodigo === 'AR' ? 'Ej.: 00001' : country.paisCodigo === 'CO' ? 'Ej.: FE' : 'Ej.: F001'}
                onChange={(e) => handleFiltro('serie', e.target.value)}
                className="input"
              />
            </div>
            <div className="flex items-end">
              <button
                className="primary-btn"
                onClick={cargar}
                disabled={loading}
                title={loading ? 'Cargando descargas; espere para volver a buscar' : 'Buscar documentos con los filtros actuales'}
              >
                <Download className="mr-1.5 h-4 w-4" /> Buscar
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="m-0 text-lg font-bold text-foreground">
            <FileText className="mr-2 h-[18px] w-[18px]" /> Resultados
          </h2>
        </div>
        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
          <div className="overflow-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-foreground/80">Fecha</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-foreground/80">Documento</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-foreground/80">Cliente</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-foreground/80">Total</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-foreground/80">Estado</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-foreground/80">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-card">
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-4 text-center text-sm text-muted-foreground">Cargando...</td>
                  </tr>
                )}
                {!loading && documentos.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-4 text-center text-sm text-muted-foreground">Sin resultados</td>
                  </tr>
                )}
                {!loading && documentos.map(doc => (
                  <tr key={doc.id}>
                    <td className="px-4 py-2 text-sm text-foreground/85">
                      {doc.fecha_emision ? format(parseDateLocal(doc.fecha_emision), 'dd MMM yyyy', { locale: es }) : '-'}
                    </td>
                    <td className="px-4 py-2 text-sm text-foreground/85">
                      <div className="font-semibold">{doc.tipo_documento || '-'}</div>
                      <div className="text-xs text-muted-foreground">{doc.serie}{doc.correlativo ? `-${doc.correlativo}` : ''}</div>
                    </td>
                    <td className="px-4 py-2 text-sm text-foreground/85">
                      <div className="font-medium">{doc.receptor_nombre || 'Sin nombre'}</div>
                      <div className="text-xs text-muted-foreground">{doc.receptor_numero_doc || ''}</div>
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-foreground/85">
                      {formatMoney(Number(doc.total || 0))}
                    </td>
                    <td className="px-4 py-2 text-sm text-foreground/85">{doc.estado || '-'}</td>
                    <td className="px-4 py-2 text-sm text-foreground/85">
                      <div className="flex gap-2">
                        <button
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-semibold leading-5 text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                          onClick={() => descargar(doc.id, 'pdf')}
                          disabled={descargandoId === `${doc.id}-pdf`}
                        >
                          PDF
                        </button>
                        <button
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-semibold leading-5 text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                          onClick={() => descargar(doc.id, 'xml')}
                          disabled={descargandoId === `${doc.id}-xml`}
                        >
                          XML
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
