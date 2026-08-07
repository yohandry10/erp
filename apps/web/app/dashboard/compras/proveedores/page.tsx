'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { Proveedor } from '@/types/compras'
import toast from 'react-hot-toast'
import { useLocalizedMoney } from '@/hooks/use-localized-money'
import {
  Search,
  Plus,
  Download,
  Upload,
  Edit,
  Trash2,
  Eye,
  Building2,
  RefreshCw,
  Filter
} from 'lucide-react'

export default function ProveedoresPage() {
  const router = useRouter()
  const { get, del } = useApi()
  const { formatCurrency: formatLocalizedCurrency, taxIdLabel } = useLocalizedMoney()

  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [activoFilter, setActivoFilter] = useState<string>('')
  const [condicionesPagoFilter, setCondicionesPagoFilter] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalProveedores, setTotalProveedores] = useState(0)
  const loadRequestIdRef = useRef(0)
  const itemsPerPage = 10

  const loadProveedores = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current
    try {
      setLoading(true)
      const params = new URLSearchParams()

      if (searchTerm) params.append('search', searchTerm)
      if (activoFilter !== '') params.append('activo', activoFilter)
      if (condicionesPagoFilter) params.append('condiciones_pago', condicionesPagoFilter)

      // Calculate offset for pagination
      const offset = (currentPage - 1) * itemsPerPage
      params.append('limit', itemsPerPage.toString())
      params.append('offset', offset.toString())

      const response = await get(`/api/compras/proveedores?${params.toString()}`)

      if (requestId !== loadRequestIdRef.current) {
        return
      }

      if (response?.success) {
        const data = response.data || []
        setProveedores(data)
        setTotalProveedores(response.count || data.length)
        setTotalPages(Math.ceil((response.count || data.length) / itemsPerPage))
      }
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) {
        return
      }
      console.error('Error loading proveedores:', error)
      toast.error('Error: No se pudieron cargar los proveedores')
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false)
      }
    }
  }, [searchTerm, activoFilter, condicionesPagoFilter, currentPage, get])

  useEffect(() => {
    loadProveedores()
  }, [loadProveedores])

  const handleSearch = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  const handleActivoFilterChange = (value: string) => {
    setActivoFilter(value)
    setCurrentPage(1)
  }

  const handleCondicionesPagoFilterChange = (value: string) => {
    setCondicionesPagoFilter(value)
    setCurrentPage(1)
  }

  const handleDelete = async (id: string, razonSocial: string) => {
    if (!confirm(`¿Está seguro de desactivar el proveedor "${razonSocial}"?`)) {
      return
    }

    try {
      await del(`/api/compras/proveedores/${id}`)
      toast.success('✅ Proveedor desactivado correctamente')
      loadProveedores()
    } catch (error: any) {
      toast.error(`❌ Error: ${error.message || 'No se pudo desactivar el proveedor'}`)
    }
  }

  const handleExport = () => {
    toast('📥 Funcionalidad de exportación próximamente')
  }

  const handleImport = () => {
    toast('📤 Funcionalidad de importación próximamente')
  }

  const formatCurrency = (amount: number | undefined) => {
    if (!amount) return '-'
    return formatLocalizedCurrency(amount)
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Proveedores</h1>
          <p className="mt-2 text-base text-muted-foreground">Gestiona tu red de proveedores estratégicos</p>
        </div>
        <button
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          onClick={() => router.push('/dashboard/compras/proveedores/nuevo')}
        >
          <Plus size={20} />
          Nuevo Proveedor
        </button>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5 grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] mb-8">
        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>TOTAL PROVEEDORES</h3>
            <Building2 className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary text-blue-500" />
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none">{totalProveedores}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Proveedores registrados</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>ACTIVOS</h3>
            <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary text-2xl">✅</span>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none">
            {proveedores.filter(p => p.activo).length}
          </div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Proveedores activos</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>INACTIVOS</h3>
            <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary text-2xl">⏸️</span>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none">
            {proveedores.filter(p => !p.activo).length}
          </div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Proveedores inactivos</div>
        </div>
      </div>

      {/* Filters */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
        <div className="flex gap-4 mb-6 flex-wrap">
          <div className="flex-[1] min-w-[300px] relative">
            <Search
              size={20} className="absolute left-4 top-[50%] -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              placeholder={`Buscar por ${taxIdLabel}, razón social o nombre comercial...`}
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)} className="w-[100%] pt-3 pr-4 pb-3 pl-12 rounded-lg border text-[0.875rem]"
            />
          </div>

          <select
            value={activoFilter}
            onChange={(e) => handleActivoFilterChange(e.target.value)} className="py-3 px-4 rounded-lg border text-[0.875rem] bg-card min-w-[150px]"
          >
            <option value="">Todos los estados</option>
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
          </select>

          <select
            value={condicionesPagoFilter}
            onChange={(e) => handleCondicionesPagoFilterChange(e.target.value)} className="py-3 px-4 rounded-lg border text-[0.875rem] bg-card min-w-[180px]"
          >
            <option value="">Todas las condiciones</option>
            <option value="CONTADO">Contado</option>
            <option value="CREDITO_7">Crédito 7 días</option>
            <option value="CREDITO_15">Crédito 15 días</option>
            <option value="CREDITO_30">Crédito 30 días</option>
            <option value="CREDITO_45">Crédito 45 días</option>
            <option value="CREDITO_60">Crédito 60 días</option>
            <option value="CREDITO_90">Crédito 90 días</option>
          </select>

          <button
            onClick={handleImport} className="py-3 px-4 rounded-lg border bg-card cursor-pointer flex items-center gap-2 text-[0.875rem] font-medium"
          >
            <Upload size={16} />
            Importar
          </button>

          <button
            onClick={handleExport} className="py-3 px-4 rounded-lg border bg-card cursor-pointer flex items-center gap-2 text-[0.875rem] font-medium"
          >
            <Download size={16} />
            Exportar
          </button>

          <button
            onClick={loadProveedores}
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
              <p>Cargando proveedores...</p>
            </div>
          ) : proveedores.length === 0 ? (
            <div className="text-center p-12 text-muted-foreground">
              <Building2 size={48} className="text-muted-foreground" />
              <h3 className="text-[1.125rem] font-semibold mb-2">
                No hay proveedores
              </h3>
              <p className="mb-6">
                {searchTerm || activoFilter || condicionesPagoFilter
                  ? 'No se encontraron proveedores con los filtros aplicados'
                  : 'Comienza agregando tu primer proveedor'}
              </p>
              {!searchTerm && !activoFilter && !condicionesPagoFilter && (
                <button
                  onClick={() => router.push('/dashboard/compras/proveedores/nuevo')}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                >
                  <Plus size={16} />
                  Crear Primer Proveedor
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-auto">
                <table className="w-[100%]">
                  <thead>
                    <tr>
                      <th className="text-left p-4 font-semibold text-xs text-muted-foreground">
                        {taxIdLabel}
                      </th>
                      <th className="text-left p-4 font-semibold text-xs text-muted-foreground">
                        Razón Social
                      </th>
                      <th className="text-left p-4 font-semibold text-xs text-muted-foreground">
                        Contacto
                      </th>
                      <th className="text-left p-4 font-semibold text-xs text-muted-foreground">
                        Condiciones
                      </th>
                      <th className="text-right p-4 font-semibold text-xs text-muted-foreground">
                        Límite Crédito
                      </th>
                      <th className="text-center p-4 font-semibold text-xs text-muted-foreground">
                        Estado
                      </th>
                      <th className="text-right p-4 font-semibold text-xs text-muted-foreground">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {proveedores.map((proveedor) => (
                      <tr key={proveedor.id} className="border-b">
                        <td className="p-4">
                          <div className="text-[0.875rem] font-semibold">
                            {proveedor.ruc}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="text-[0.875rem] font-semibold text-foreground">
                            {proveedor.razon_social}
                          </div>
                          {proveedor.nombre_comercial && (
                            <div className="text-xs text-muted-foreground">
                              {proveedor.nombre_comercial}
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="text-[0.875rem] text-foreground/85">
                            {proveedor.contacto || '-'}
                          </div>
                          {proveedor.email && (
                            <div className="text-xs text-muted-foreground">
                              {proveedor.email}
                            </div>
                          )}
                          {proveedor.telefono && (
                            <div className="text-xs text-muted-foreground">
                              📞 {proveedor.telefono}
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-[0.875rem] text-muted-foreground">
                          {proveedor.condiciones_pago ? (
                            <span className="py-1 px-3 rounded-full text-xs font-medium">
                              {proveedor.condiciones_pago.replace('CREDITO_', 'Crédito ')}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="p-4 text-right text-[0.875rem] font-semibold text-foreground/85">
                          {formatCurrency(proveedor.limite_credito)}
                        </td>
                        <td className="p-4 text-center">
                          <span className="py-1 px-3 rounded-full text-xs font-medium">
                            {proveedor.activo ? 'ACTIVO' : 'INACTIVO'}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => router.push(`/dashboard/compras/proveedores/${proveedor.id}`)} className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-transparent text-muted-foreground transition-colors cursor-pointer hover:bg-muted hover:text-foreground"
                              title="Ver detalle"
                            >
                              <Eye size={16} />
                            </button>
                            <button
                              onClick={() => router.push(`/dashboard/compras/proveedores/${proveedor.id}/editar`)} className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-transparent text-muted-foreground transition-colors cursor-pointer hover:bg-muted hover:text-foreground"
                              title="Editar"
                            >
                              <Edit size={16} />
                            </button>
                            {proveedor.activo && (
                              <button
                                onClick={() => handleDelete(proveedor.id, proveedor.razon_social)} className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-transparent text-muted-foreground transition-colors cursor-pointer hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                                title="Desactivar"
                              >
                                <Trash2 size={16} />
                              </button>
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
                    <strong>{Math.min(currentPage * itemsPerPage, totalProveedores)}</strong> de{' '}
                    <strong>{totalProveedores}</strong> proveedores
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1} className="py-2 px-4 rounded-[6px] border text-[0.875rem]"
                    >
                      Anterior
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum
                      if (totalPages <= 5) {
                        pageNum = i + 1
                      } else if (currentPage <= 3) {
                        pageNum = i + 1
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = currentPage - 2 + i
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)} className="py-2 px-4 rounded-[6px] border cursor-pointer text-[0.875rem] min-w-10"
                        >
                          {pageNum}
                        </button>
                      )
                    })}
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
    </div>
  )
}
