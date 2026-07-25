'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, CheckCircle2, FileText, PackageCheck, Plus, RefreshCw, ShoppingCart, Truck, type LucideIcon } from 'lucide-react'
import OrdenCompraModal from '../../../components/modals/OrdenCompraModal'
import ProveedorModal from '../../../components/modals/ProveedorModal'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/use-toast'
import { useApi } from '@/hooks/use-api'
import { apiSucceeded, unwrapApiArray, unwrapApiObject } from '@/lib/api-contract'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type AnyRecord = Record<string, any>

type StatCard = {
  label: string
  value: string | number
  icon: LucideIcon
}

const inputClass =
  'w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10'

const labelClass = 'text-xs font-semibold uppercase tracking-[0.12em] text-primary/80'

export default function ComprasPage() {
  const { toast } = useToast()
  const { get, delete: del, post } = useApi()
  const router = useRouter()

  const [ordenes, setOrdenes] = useState<any[]>([])
  const [stats, setStats] = useState({
    comprasDelMes: 0,
    totalCompras: 0,
    montoTotalMes: 0,
    ordenesActivas: 0,
    proveedoresActivos: 0,
    ordenesVencidas: 0,
  })
  const [proveedores, setProveedores] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isProveedorModalOpen, setIsProveedorModalOpen] = useState(false)
  const [selectedOrden, setSelectedOrden] = useState<AnyRecord | null>(null)
  const [selectedProveedor, setSelectedProveedor] = useState<AnyRecord | null>(null)
  const [filters, setFilters] = useState({ estado: '', proveedor_id: '' })
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void | Promise<void>
    variant?: 'default' | 'danger' | 'warning'
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'default',
  })

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadOrdenes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  const loadData = async () => {
    try {
      setIsLoading(true)
      await Promise.all([loadStats(), loadOrdenes(), loadProveedores()])
    } catch (error) {
      console.error('Error loading data:', error)
      toast({ title: 'Error', description: 'Error al cargar los datos', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const data = await get(`/compras/stats?_t=${Date.now()}`)
      const nextStats = unwrapApiObject(data, stats)
      if (apiSucceeded(data)) {
        setStats(nextStats)
      } else {
        toast({ title: 'Error', description: 'Error al cargar estadísticas de compras', variant: 'destructive' })
      }
    } catch (error) {
      console.error('Error loading stats:', error)
      toast({ title: 'Error de conexión', description: 'No se pudo conectar con el servidor', variant: 'destructive' })
    }
  }

  const loadOrdenes = async () => {
    try {
      const queryParams = new URLSearchParams()
      if (filters.estado) queryParams.append('estado', filters.estado)
      if (filters.proveedor_id) queryParams.append('proveedor_id', filters.proveedor_id)

      const data = await get(`/compras/ordenes?${queryParams.toString()}`)
      if (apiSucceeded(data)) setOrdenes(unwrapApiArray(data))
    } catch (error) {
      console.error('Error loading ordenes:', error)
    }
  }

  const loadProveedores = async () => {
    try {
      const data = await get('/compras/proveedores')
      if (apiSucceeded(data)) setProveedores(unwrapApiArray(data))
    } catch (error) {
      console.error('Error loading proveedores:', error)
    }
  }

  const handleEditOrden = (orden: AnyRecord) => {
    setSelectedOrden(orden)
    setIsModalOpen(true)
  }

  const handleDeleteOrden = async (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Eliminar Orden de Compra',
      message: '¿Está seguro que desea eliminar esta orden de compra?\n\nEsta acción no se puede deshacer.',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const data = await del(`/compras/ordenes/${id}`)
          if (data?.success) {
            toast({ title: 'Éxito', description: 'Orden eliminada correctamente' })
            loadOrdenes()
            loadStats()
          } else {
            throw new Error(data?.message || 'Error al eliminar')
          }
        } catch (error) {
          console.error('Error deleting orden:', error)
          toast({
            title: 'Error',
            description: error instanceof Error ? error.message : 'Error al eliminar la orden',
            variant: 'destructive',
          })
        }
      },
    })
  }

  // Aprueba la orden (PENDIENTE → APROBADA) contra el endpoint real del backend.
  // El backend aplica segregación de funciones: el creador NO puede aprobar su
  // propia orden, por eso el error se muestra explícito en vez de fallar en silencio.
  const handleAprobar = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Aprobar Orden de Compra',
      message: '¿Aprobar esta orden?\n\nPor control interno, quien la creó no puede aprobarla: debe hacerlo otro usuario autorizado. Una vez aprobada podrás recepcionar la mercancía.',
      variant: 'warning',
      onConfirm: async () => {
        try {
          const result = await post(`/compras/ordenes/${id}/aprobar`, {})
          if (apiSucceeded(result)) {
            toast({ title: 'Orden aprobada', description: 'La orden quedó lista para recepcionar mercancía.' })
            await Promise.all([loadOrdenes(), loadStats()])
          } else {
            toast({ title: 'No se pudo aprobar', description: result?.message || 'Error al aprobar la orden', variant: 'destructive' })
          }
        } catch (error) {
          toast({ title: 'No se pudo aprobar', description: error instanceof Error ? error.message : 'Error al aprobar la orden', variant: 'destructive' })
        }
      },
    })
  }

  // La recepción es un flujo propio (wizard) que llama a los endpoints reales
  // POST /compras/recepciones/ordenes/:id y .../cerrar (postea stock, CxP y asiento).
  const handleRecepcionar = (orden: AnyRecord) => {
    router.push(`/dashboard/compras/recepciones/nueva?orden_id=${orden.id}`)
  }

  const handleModalSuccess = async (ordenData?: AnyRecord) => {
    await Promise.all([loadOrdenes(), loadStats()])
    setSelectedOrden(null)
    toast({
      title: ordenData?.estado === 'ENTREGADO' ? 'Orden entregada' : 'Éxito',
      description: ordenData?.estado === 'ENTREGADO' ? 'La orden fue entregada y el inventario se actualizará.' : 'Orden guardada correctamente.',
    })
  }

  const handleProveedorModalSuccess = async () => {
    await loadProveedores()
    await loadStats()
    toast({ title: 'Proveedor creado', description: 'El proveedor se ha agregado correctamente' })
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(amount)

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('es-PE')
  }

  const statusBadge = (estado: string) => (
    <span className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase text-primary">
      {estado || 'Sin estado'}
    </span>
  )

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
        <Card className="mx-auto max-w-[1500px] border-cyan-400/20 bg-card/70 text-foreground">
          <CardContent className="flex min-h-[180px] items-center justify-center gap-3 p-6">
            <RefreshCw className="h-7 w-7 animate-spin text-primary" />
            <span className="text-sm font-medium text-muted-foreground">Cargando compras...</span>
          </CardContent>
        </Card>
      </div>
    )
  }

  const statCards: StatCard[] = [
    { label: 'Compras del mes', value: formatCurrency(stats.montoTotalMes), icon: ShoppingCart },
    { label: 'Ordenes activas', value: stats.ordenesActivas, icon: FileText },
    { label: 'Proveedores', value: stats.proveedoresActivos, icon: Building2 },
    { label: 'Vencidas', value: stats.ordenesVencidas, icon: Truck },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-2xl border border-cyan-400/20 bg-card/70 px-5 py-4 shadow-2xl shadow-blue-950/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-primary">
                <ShoppingCart className="h-6 w-6" />
              </span>
              <div>
                <div className="mb-2 inline-flex rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  ERP Purchasing Center
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Gestión de Compras</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Órdenes, proveedores y seguimiento operativo conectados a inventario, CxP y contabilidad.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={async () => {
                  await loadData()
                  toast({ title: 'Datos actualizados', description: 'Compras sincronizadas correctamente' })
                }}
                variant="outline"
                className="gap-2 border-cyan-400/20 bg-white/10 text-primary hover:bg-white/15 hover:text-foreground"
              >
                <RefreshCw className="h-4 w-4" />
                Actualizar
              </Button>
              <Button type="button" onClick={() => setIsModalOpen(true)} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">
                <Plus className="h-4 w-4" />
                Nueva orden
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map(({ label, value, icon: Icon }) => (
            <Card key={label} className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div>
                  <div className={labelClass}>{label}</div>
                  <div className="mt-3 text-2xl font-bold text-foreground">{value}</div>
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
            <CardTitle className="text-base text-foreground">Filtros operativos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-end">
            <label className="space-y-2">
              <span className={labelClass}>Estado</span>
              <select className={inputClass} value={filters.estado} onChange={(e) => setFilters({ ...filters, estado: e.target.value })}>
                <option value="">Todos los estados</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="ENTREGADO">Entregado</option>
                <option value="FACTURADO">Facturado</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className={labelClass}>Proveedor</span>
              <select className={inputClass} value={filters.proveedor_id} onChange={(e) => setFilters({ ...filters, proveedor_id: e.target.value })}>
                <option value="">Todos los proveedores</option>
                {proveedores.map((proveedor: AnyRecord) => (
                  <option key={proveedor.id} value={proveedor.id}>
                    {proveedor.razon_social || proveedor.nombre_comercial || proveedor.nombre || 'Sin nombre'}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFilters({ estado: '', proveedor_id: '' })}
              className="border-cyan-400/20 bg-white/5 text-primary hover:bg-white/10 hover:text-foreground"
            >
              Limpiar
            </Button>
          </CardContent>
        </Card>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="overflow-hidden border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
            <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
              <CardTitle className="text-base text-foreground">Órdenes de compra</CardTitle>
              <p className="text-xs text-muted-foreground">Mostrando {ordenes.length} órdenes con los filtros actuales.</p>
            </CardHeader>
            <CardContent className="p-0">
              {ordenes.length === 0 ? (
                <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 p-8 text-center">
                  <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4">
                    <FileText className="h-10 w-10 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Listo para gestionar compras</h3>
                    <p className="mt-2 text-sm text-muted-foreground">Crea una orden de compra para iniciar el flujo operativo.</p>
                  </div>
                  <Button type="button" onClick={() => setIsModalOpen(true)} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">
                    <Plus className="h-4 w-4" />
                    Nueva orden
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] border-collapse">
                    <thead className="bg-cyan-400/10">
                      <tr className="border-b border-cyan-400/15 text-left text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                        <th className="px-4 py-3">Orden</th>
                        <th className="px-4 py-3">Proveedor</th>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Entrega</th>
                        <th className="px-4 py-3 text-right">Items</th>
                        <th className="px-4 py-3 text-right">Total</th>
                        <th className="px-4 py-3 text-center">Estado</th>
                        <th className="px-4 py-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordenes.map((orden: AnyRecord) => {
                        const itemsCount = Array.isArray(orden.items) ? orden.items.length : 0
                        // La lista de órdenes no trae el join del proveedor; se resuelve
                        // contra la lista de proveedores ya cargada para no mostrar "N/A".
                        const prov = orden.proveedores || proveedores.find((p: AnyRecord) => p.id === orden.proveedor_id) || {}
                        return (
                          <tr key={orden.id} className="border-b border-cyan-400/10 text-sm text-foreground/90 transition hover:bg-cyan-400/10">
                            <td className="px-4 py-3 font-mono font-semibold text-foreground">{orden.numero}</td>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-foreground">{prov.razon_social || prov.nombre || 'N/A'}</div>
                              <div className="mt-1 text-xs text-muted-foreground">RUC: {prov.ruc || 'N/A'}</div>
                            </td>
                            <td className="px-4 py-3">{formatDate(orden.fecha_orden)}</td>
                            <td className="px-4 py-3">{formatDate(orden.fecha_entrega)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-foreground">{itemsCount}</td>
                            <td className="px-4 py-3 text-right font-semibold text-foreground">{formatCurrency(parseFloat(orden.total) || 0)}</td>
                            <td className="px-4 py-3 text-center">{statusBadge(orden.estado)}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap justify-end gap-2">
                                <Button type="button" size="sm" variant="outline" onClick={() => handleEditOrden(orden)} className="border-cyan-400/20 bg-white/5 text-primary hover:bg-white/10 hover:text-foreground">
                                  Ver
                                </Button>
                                {['PENDIENTE', 'BORRADOR', 'APROBACION'].includes(orden.estado) && (
                                  <Button type="button" size="sm" onClick={() => handleAprobar(orden.id)} className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500">
                                    <CheckCircle2 className="h-4 w-4" />
                                    Aprobar
                                  </Button>
                                )}
                                {['APROBADA', 'PARCIAL'].includes(orden.estado) && (
                                  <Button type="button" size="sm" onClick={() => handleRecepcionar(orden)} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">
                                    <PackageCheck className="h-4 w-4" />
                                    Recepcionar
                                  </Button>
                                )}
                                <Button type="button" size="sm" variant="outline" onClick={() => handleDeleteOrden(orden.id)} className="border-cyan-400/20 bg-white/5 text-primary hover:bg-white/10 hover:text-foreground">
                                  Eliminar
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="h-fit overflow-hidden border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
            <CardHeader className="flex-row items-center justify-between border-b border-cyan-400/10 px-5 py-4">
              <div>
                <CardTitle className="text-base text-foreground">Proveedores principales</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Red activa para compras.</p>
              </div>
              <Button type="button" size="sm" onClick={() => setIsProveedorModalOpen(true)} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">
                <Plus className="h-4 w-4" />
                Agregar
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {proveedores.length === 0 ? (
                <div className="rounded-xl border border-cyan-400/15 bg-white/[0.03] p-4 text-sm text-muted-foreground">
                  Agrega proveedores para operar compras.
                </div>
              ) : (
                proveedores.slice(0, 6).map((proveedor: AnyRecord) => (
                  <button
                    key={proveedor.id}
                    type="button"
                    onClick={() => {
                      setSelectedProveedor(proveedor)
                      setIsProveedorModalOpen(true)
                    }}
                    className="w-full rounded-xl border border-cyan-400/15 bg-white/[0.03] p-4 text-left transition hover:bg-cyan-400/10"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-foreground">{proveedor.razon_social || proveedor.nombre_comercial || proveedor.nombre || 'Sin nombre'}</div>
                        <div className="mt-1 text-xs text-muted-foreground">RUC: {proveedor.ruc || 'N/A'}</div>
                      </div>
                      {statusBadge('Activo')}
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">{proveedor.contacto || proveedor.email || proveedor.telefono || 'Sin contacto'}</div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </section>

        <OrdenCompraModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setSelectedOrden(null) }} onSuccess={handleModalSuccess} orden={selectedOrden || undefined} />
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
          onConfirm={confirmDialog.onConfirm}
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant={confirmDialog.variant}
        />
        <ProveedorModal
          isOpen={isProveedorModalOpen}
          onClose={() => { setIsProveedorModalOpen(false); setSelectedProveedor(null) }}
          onSuccess={handleProveedorModalSuccess}
          proveedor={selectedProveedor || undefined}
        />
      </div>
    </div>
  )
}
