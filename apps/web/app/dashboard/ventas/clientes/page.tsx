'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { Cliente, TipoCliente } from '@/types/ventas'
import {
  Search,
  Plus,
  Download,
  Upload,
  Edit,
  Trash2,
  Eye,
  Users,
  RefreshCw
} from 'lucide-react'

export default function ClientesPage() {
  const router = useRouter()
  const { get, del } = useApi()

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [tipoFilter, setTipoFilter] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalClientes, setTotalClientes] = useState(0)
  const itemsPerPage = 10

  const getDocumentoCliente = (cliente: Cliente) =>
    String(cliente.ruc || cliente.codigo || cliente.documento_numero || cliente.numero_documento || '-')

  const loadClientes = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (searchTerm) params.append('search', searchTerm)
      if (tipoFilter) params.append('tipo', tipoFilter)
      params.append('page', currentPage.toString())
      params.append('limit', itemsPerPage.toString())

      const response = await get(`/api/ventas/clientes?${params.toString()}`)

      // El backend devuelve { data: [], pagination: { total, page, limit, totalPages } }
      if (response?.data) {
        setClientes(response.data || [])
        setTotalClientes(response.pagination?.total || 0)
        setTotalPages(response.pagination?.totalPages || 1)
      }
    } catch (error) {
      console.error('Error loading clientes:', error)
      alert('Error: No se pudieron cargar los clientes')
    } finally {
      setLoading(false)
    }
  }, [searchTerm, tipoFilter, currentPage, get])

  useEffect(() => {
    loadClientes()
  }, [loadClientes])

  const handleSearch = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  const handleFilterChange = (value: string) => {
    setTipoFilter(value)
    setCurrentPage(1)
  }

  const handleDelete = async (id: string, razonSocial: string) => {
    if (!confirm(`¿Está seguro de eliminar el cliente "${razonSocial}"?`)) {
      return
    }

    try {
      await del(`/api/ventas/clientes/${id}`)
      alert('✅ Cliente eliminado correctamente')
      loadClientes()
    } catch (error: any) {
      alert(`❌ Error: ${error.message || 'No se pudo eliminar el cliente'}`)
    }
  }

  const handleExport = () => {
    alert('📥 Funcionalidad de exportación próximamente')
  }

  const handleImport = () => {
    alert('📤 Funcionalidad de importación próximamente')
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Clientes</h1>
          <p className="mt-2 text-base text-muted-foreground">Gestiona tu base de datos de clientes</p>
        </div>
        <button
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          onClick={() => router.push('/dashboard/ventas/clientes/nuevo')}
        >
          <Plus size={20} />
          Nuevo Cliente
        </button>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5  mb-8">
        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>TOTAL CLIENTES</h3>
            <span className="inline-flex size-11 items-center justify-center rounded-xl bg-blue-500/15 text-blue-500">
              <Users />
            </span>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none">{totalClientes}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Clientes registrados</div>
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
              placeholder="Buscar por RUC, DNI, nombre o razón social..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)} className="w-[100%] pt-3 pr-4 pb-3 pl-12 rounded-lg border text-[0.875rem]"
            />
          </div>

          <select
            value={tipoFilter}
            onChange={(e) => handleFilterChange(e.target.value)} className="py-3 px-4 rounded-lg border text-[0.875rem] bg-card"
          >
            <option value="">Todos los tipos</option>
            <option value={TipoCliente.PERSONA}>Persona</option>
            <option value={TipoCliente.EMPRESA}>Empresa</option>
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
            onClick={loadClientes}
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
              <p>Cargando clientes...</p>
            </div>
          ) : clientes.length === 0 ? (
            <div className="text-center p-12 text-muted-foreground">
              <Users size={48} className="text-muted-foreground" />
              <h3 className="text-[1.125rem] font-semibold mb-2">
                No hay clientes
              </h3>
              <p className="mb-6">
                {searchTerm || tipoFilter
                  ? 'No se encontraron clientes con los filtros aplicados'
                  : 'Usa el botón "Nuevo Cliente" en la parte superior para agregar tu primer cliente'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-auto">
                <table className="w-[100%]">
                  <thead>
                    <tr>
                      <th className="text-left p-4 font-semibold text-xs text-muted-foreground">
                        RUC/DNI
                      </th>
                      <th className="text-left p-4 font-semibold text-xs text-muted-foreground">
                        Nombre / Razón Social
                      </th>
                      <th className="text-left p-4 font-semibold text-xs text-muted-foreground">
                        Tipo
                      </th>
                      <th className="text-left p-4 font-semibold text-xs text-muted-foreground">
                        Email
                      </th>
                      <th className="text-left p-4 font-semibold text-xs text-muted-foreground">
                        Teléfono
                      </th>
                      <th className="text-right p-4 font-semibold text-xs text-muted-foreground">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientes.map((cliente) => (
                      <tr key={cliente.id} className="border-b">
                        <td className="p-4">
                          <div className="text-[0.875rem] font-semibold">
                            {getDocumentoCliente(cliente)}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="text-[0.875rem] font-semibold text-foreground">
                            {cliente.razon_social}
                          </div>
                          {cliente.nombre_comercial && (
                            <div className="text-xs text-muted-foreground">
                              {cliente.nombre_comercial}
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          <span className="py-1 px-3 rounded-full text-xs font-medium">
                            {cliente.tipo}
                          </span>
                        </td>
                        <td className="p-4 text-[0.875rem] text-muted-foreground">
                          {cliente.email || '-'}
                        </td>
                        <td className="p-4 text-[0.875rem] text-muted-foreground">
                          {cliente.telefono || '-'}
                        </td>
                        <td className="p-4">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => router.push(`/dashboard/ventas/clientes/${cliente.id}`)}
                              className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-transparent text-muted-foreground transition-colors cursor-pointer hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              title="Ver detalle"
                              aria-label="Ver detalle"
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              onClick={() => router.push(`/dashboard/ventas/clientes/${cliente.id}/editar`)}
                              className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-transparent text-muted-foreground transition-colors cursor-pointer hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              title="Editar"
                              aria-label="Editar"
                            >
                              <Edit size={15} />
                            </button>
                            <button
                              onClick={() => handleDelete(cliente.id, cliente.razon_social)}
                              className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-transparent text-muted-foreground transition-colors cursor-pointer hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
                              title="Eliminar"
                              aria-label="Eliminar"
                            >
                              <Trash2 size={15} />
                            </button>
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
                    <strong>{Math.min(currentPage * itemsPerPage, totalClientes)}</strong> de{' '}
                    <strong>{totalClientes}</strong> clientes
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
