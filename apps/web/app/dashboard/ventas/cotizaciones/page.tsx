'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { Cotizacion, EstadoCotizacion } from '@/types/ventas'
import {
  Search,
  Plus,
  FileText,
  Eye,
  Edit,
  Trash2,
  RefreshCw
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { parseDateLocal } from '@/lib/date-utils'
import { useLocalizedMoney } from '@/hooks/use-localized-money'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { toast } from '@/components/ui/use-toast'

const ESTADO_COLORS: Record<EstadoCotizacion, { bg: string, text: string }> = {
  [EstadoCotizacion.BORRADOR]: { bg: 'rgba(156, 163, 175, 0.1)', text: '#6b7280' },
  [EstadoCotizacion.ENVIADA]: { bg: 'rgba(59, 130, 246, 0.1)', text: '#2563eb' },
  [EstadoCotizacion.APROBADA]: { bg: 'rgba(16, 185, 129, 0.1)', text: '#059669' },
  [EstadoCotizacion.RECHAZADA]: { bg: 'rgba(239, 68, 68, 0.1)', text: '#dc2626' },
  [EstadoCotizacion.CONVERTIDA]: { bg: 'rgba(139, 92, 246, 0.1)', text: '#7c3aed' },
  [EstadoCotizacion.VENCIDA]: { bg: 'rgba(245, 158, 11, 0.1)', text: '#d97706' },
}

export default function CotizacionesPage() {
  const { formatCurrency } = useLocalizedMoney()
  const router = useRouter()
  const { get, delete: del } = useApi()

  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCotizaciones, setTotalCotizaciones] = useState(0)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; numero: string } | null>(null)
  const itemsPerPage = 10

  const loadCotizaciones = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (searchTerm) params.append('search', searchTerm)
      if (estadoFilter) params.append('estado', estadoFilter)
      params.append('page', currentPage.toString())
      params.append('limit', itemsPerPage.toString())

      const response = await get(`/api/ventas/cotizaciones?${params.toString()}`)

      if (response?.success) {
        setCotizaciones(response.data || [])
        setTotalCotizaciones(response.pagination?.total || 0)
        setTotalPages(Math.ceil((response.pagination?.total || 0) / itemsPerPage))
      }
    } catch (error) {
      console.error('Error loading cotizaciones:', error)
      toast({
        title: 'No se pudieron cargar las cotizaciones',
        description: 'Actualiza la bandeja o inténtalo nuevamente.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [searchTerm, estadoFilter, currentPage, get])

  useEffect(() => {
    loadCotizaciones()
  }, [loadCotizaciones])

  const handleSearch = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  const handleFilterChange = (value: string) => {
    setEstadoFilter(value)
    setCurrentPage(1)
  }

  const handleDelete = async () => {
    if (!pendingDelete) return

    try {
      await del(`/api/ventas/cotizaciones/${pendingDelete.id}`)
      toast({
        title: 'Cotización eliminada',
        description: `${pendingDelete.numero} fue eliminada correctamente.`,
      })
      setPendingDelete(null)
      await loadCotizaciones()
    } catch (error: any) {
      toast({
        title: 'No se pudo eliminar la cotización',
        description: error.message || 'Inténtalo nuevamente.',
        variant: 'destructive',
      })
    }
  }

  const formatDate = (dateString: string) => {
    try {
      return format(parseDateLocal(dateString), 'dd/MM/yyyy', { locale: es })
    } catch {
      return dateString
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Cotizaciones</h1>
          <p className="mt-2 text-base text-muted-foreground">Gestiona tus cotizaciones de venta</p>
        </div>
        <button
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          onClick={() => router.push('/dashboard/ventas/cotizaciones/nueva')}
        >
          <Plus size={20} />
          Nueva Cotización
        </button>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5  mb-8">
        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>TOTAL COTIZACIONES</h3>
            <span className="inline-flex size-11 items-center justify-center rounded-xl bg-blue-500/15 text-blue-500">
              <FileText />
            </span>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none">{totalCotizaciones}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Cotizaciones registradas</div>
        </div>
      </div>

      {/* Filters */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
        <div className="flex gap-4 mb-6 flex-wrap">
          <div className="flex-[1] min-w-[300px] relative">
            <Search
              size={20} className="absolute left-4 top-[50%] -translate-y-1/2 text-muted-foreground"
            />
            <input aria-label="Buscar"
              type="text"
              placeholder="Buscar por número, cliente..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)} className="w-[100%] pt-3 pr-4 pb-3 pl-12 rounded-lg border text-[0.875rem]"
            />
          </div>

          <select aria-label="Filtrar por estado"
            value={estadoFilter}
            onChange={(e) => handleFilterChange(e.target.value)} className="py-3 px-4 rounded-lg border text-[0.875rem] bg-card"
          >
            <option value="">Todos los estados</option>
            <option value={EstadoCotizacion.BORRADOR}>Borrador</option>
            <option value={EstadoCotizacion.ENVIADA}>Enviada</option>
            <option value={EstadoCotizacion.APROBADA}>Aprobada</option>
            <option value={EstadoCotizacion.RECHAZADA}>Rechazada</option>
            <option value={EstadoCotizacion.CONVERTIDA}>Convertida</option>
            <option value={EstadoCotizacion.VENCIDA}>Vencida</option>
          </select>

          <button
            onClick={loadCotizaciones}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 py-3 px-4"
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>

        {/* Table */}
        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
          {loading ? (
            <div className="flex min-h-48 items-center justify-center">
              <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
              <p>Cargando cotizaciones...</p>
            </div>
          ) : cotizaciones.length === 0 ? (
            <div className="text-center p-12 text-muted-foreground">
              <FileText size={48} className="text-muted-foreground" />
              <h3 className="text-[1.125rem] font-semibold mb-2">
                No hay cotizaciones
              </h3>
              <p className="mb-6">
                {searchTerm || estadoFilter
                  ? 'No se encontraron cotizaciones con los filtros aplicados'
                  : 'Usa el botón "Nueva Cotización" en la parte superior para crear tu primera cotización'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-auto">
                <table className="w-[100%]">
                  <thead>
                    <tr>
                      <th className="text-left p-4 font-semibold text-xs text-muted-foreground">
                        Número
                      </th>
                      <th className="text-left p-4 font-semibold text-xs text-muted-foreground">
                        Cliente
                      </th>
                      <th className="text-left p-4 font-semibold text-xs text-muted-foreground">
                        Fecha
                      </th>
                      <th className="text-left p-4 font-semibold text-xs text-muted-foreground">
                        Vencimiento
                      </th>
                      <th className="text-left p-4 font-semibold text-xs text-muted-foreground">
                        Estado
                      </th>
                      <th className="text-right p-4 font-semibold text-xs text-muted-foreground">
                        Total
                      </th>
                      <th className="text-right p-4 font-semibold text-xs text-muted-foreground">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {cotizaciones.map((cotizacion) => (
                      <tr key={cotizacion.id} className="border-b">
                        <td className="p-4">
                          <div className="text-[0.875rem] font-semibold">
                            {cotizacion.numero}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="text-[0.875rem] font-semibold text-foreground">
                            {cotizacion.cliente?.razon_social || 'Cliente no disponible'}
                          </div>
                          {cotizacion.cliente?.documento_numero && (
                            <div className="text-xs text-muted-foreground">
                              {cotizacion.cliente.documento_tipo}: {cotizacion.cliente.documento_numero}
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-[0.875rem] text-muted-foreground">
                          {formatDate(cotizacion.fecha)}
                        </td>
                        <td className="p-4 text-[0.875rem] text-muted-foreground">
                          {cotizacion.fecha_vencimiento ? formatDate(cotizacion.fecha_vencimiento) : '-'}
                        </td>
                        <td className="p-4">
                          <span className="py-1 px-3 rounded-full text-xs font-medium">
                            {cotizacion.estado}
                          </span>
                        </td>
                        <td className="p-4 text-right text-[0.875rem] font-semibold">
                          {formatCurrency(cotizacion.total)}
                        </td>
                        <td className="p-4">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => router.push(`/dashboard/ventas/cotizaciones/${cotizacion.id}`)} className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-transparent text-muted-foreground transition-colors cursor-pointer hover:bg-muted hover:text-foreground"
                              title="Ver detalle"
                            >
                              <Eye size={16} />
                            </button>
                            {cotizacion.estado === EstadoCotizacion.BORRADOR && (
                              <>
                                <button
                                  onClick={() => router.push(`/dashboard/ventas/cotizaciones/${cotizacion.id}`)} className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-transparent text-muted-foreground transition-colors cursor-pointer hover:bg-muted hover:text-foreground"
                                  title="Editar"
                                >
                                  <Edit size={16} />
                                </button>
                                <button
                                  onClick={() => setPendingDelete({ id: cotizacion.id, numero: cotizacion.numero })} className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-transparent text-muted-foreground transition-colors cursor-pointer hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                                  title="Eliminar"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="p-4 border-t flex justify-between items-center">
                  <div className="text-[0.875rem] text-foreground/85">
                    Mostrando <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> a{' '}
                    <strong>{Math.min(currentPage * itemsPerPage, totalCotizaciones)}</strong> de{' '}
                    <strong>{totalCotizaciones}</strong> cotizaciones
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1} className="py-2 px-4 rounded-[6px] border text-[0.875rem]"
                    >
                      Anterior
                    </button>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages} className="py-2 px-4 rounded-[6px] border text-[0.875rem]"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleDelete}
        title="Eliminar cotización"
        message={`La cotización ${pendingDelete?.numero ?? ''} se eliminará definitivamente. Esta acción sólo está disponible mientras permanece en borrador.`}
        confirmText="Eliminar cotización"
        variant="danger"
      />
    </div>
  )
}
