'use client'

import { useEffect, useMemo, useState } from 'react'
import { Download, Filter, FileText, RefreshCcw } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

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
  const [filtros, setFiltros] = useState({
    fecha_desde: format(new Date(new Date().setMonth(new Date().getMonth() - 1)), 'yyyy-MM-dd'),
    fecha_hasta: format(new Date(), 'yyyy-MM-dd'),
    tipo_documento: '',
    serie: ''
  })
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [loading, setLoading] = useState(false)

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

  const descargar = (id: string, tipo: 'pdf' | 'xml') => {
    const url = `/api/documentos/${id}/descargar-${tipo}`
    window.open(url, '_blank')
  }

  const formatos = useMemo(
    () => [
      { value: '', label: 'Todos' },
      { value: '01', label: 'Factura' },
      { value: '03', label: 'Boleta' },
      { value: '07', label: 'Nota de Crédito' },
      { value: '08', label: 'Nota de Débito' }
    ],
    []
  )

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Mis Descargas CPE</h1>
          <p className="dashboard-subtitle">Descarga tus XML/PDF históricos por rango de fechas y serie.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="refresh-btn" onClick={cargar}>
            <RefreshCcw size={18} /> Recargar
          </button>
        </div>
      </div>

      <div className="activity-section">
        <div className="activity-header">
          <h2 className="activity-title">
            <Filter size={18} style={{ marginRight: 8 }} /> Filtros
          </h2>
        </div>
        <div className="activity-card">
          <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <div>
              <label className="text-sm font-medium text-slate-700">Fecha desde</label>
              <input
                type="date"
                value={filtros.fecha_desde}
                onChange={(e) => handleFiltro('fecha_desde', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Fecha hasta</label>
              <input
                type="date"
                value={filtros.fecha_hasta}
                onChange={(e) => handleFiltro('fecha_hasta', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Tipo</label>
              <select
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
              <label className="text-sm font-medium text-slate-700">Serie</label>
              <input
                type="text"
                value={filtros.serie}
                placeholder="Ejem: F001"
                onChange={(e) => handleFiltro('serie', e.target.value)}
                className="input"
              />
            </div>
            <div className="flex items-end">
              <button className="primary-btn" onClick={cargar} disabled={loading}>
                <Download size={16} style={{ marginRight: 6 }} /> Buscar
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="activity-section">
        <div className="activity-header">
          <h2 className="activity-title">
            <FileText size={18} style={{ marginRight: 8 }} /> Resultados
          </h2>
        </div>
        <div className="activity-card">
          <div className="overflow-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">Fecha</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">Documento</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">Cliente</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-600">Total</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">Estado</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-4 text-center text-sm text-slate-500">Cargando...</td>
                  </tr>
                )}
                {!loading && documentos.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-4 text-center text-sm text-slate-500">Sin resultados</td>
                  </tr>
                )}
                {!loading && documentos.map(doc => (
                  <tr key={doc.id}>
                    <td className="px-4 py-2 text-sm text-slate-700">
                      {doc.fecha_emision ? format(new Date(doc.fecha_emision), 'dd MMM yyyy', { locale: es }) : '-'}
                    </td>
                    <td className="px-4 py-2 text-sm text-slate-700">
                      <div className="font-semibold">{doc.tipo_documento || '-'}</div>
                      <div className="text-xs text-slate-500">{doc.serie}{doc.correlativo ? `-${doc.correlativo}` : ''}</div>
                    </td>
                    <td className="px-4 py-2 text-sm text-slate-700">
                      <div className="font-medium">{doc.receptor_nombre || 'Sin nombre'}</div>
                      <div className="text-xs text-slate-500">{doc.receptor_numero_doc || ''}</div>
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-slate-700">
                      S/ {Number(doc.total || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-sm text-slate-700">{doc.estado || '-'}</td>
                    <td className="px-4 py-2 text-sm text-slate-700">
                      <div className="flex gap-2">
                        <button className="btn btn-secondary" onClick={() => descargar(doc.id, 'pdf')}>
                          PDF
                        </button>
                        <button className="btn btn-secondary" onClick={() => descargar(doc.id, 'xml')}>
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
