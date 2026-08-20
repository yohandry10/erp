'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle,
  DollarSign,
  Edit,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react'

import PresupuestoEjecucionIndicator from '@/components/contabilidad/PresupuestoEjecucionIndicator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useApi } from '@/hooks/use-api'
import { cn } from '@/lib/utils'
import { useCountryContext } from '@/hooks/use-country-context'

interface Presupuesto {
  id: string
  tenant_id: string
  centro_costo_id: string
  cuenta_id: string
  periodo_contable_id: string
  monto_presupuestado: number
  monto_ejecutado: number
  monto_comprometido: number
  monto_disponible: number
  porcentaje_ejecutado: number
  estado: 'ACTIVO' | 'BLOQUEADO' | 'CERRADO'
  notas?: string
  created_at: string
  updated_at: string
  centro_costo?: { codigo: string; nombre: string }
  cuenta?: { codigo: string; nombre: string }
  periodo?: { anio: number; mes: number }
}

interface CentroCosto {
  id: string
  codigo: string
  nombre: string
}

interface Periodo {
  id: string
  anio: number
  mes: number
}

const fieldClass =
  'border-cyan-400/20 bg-card/60 text-foreground shadow-inner shadow-cyan-950/20 placeholder:text-muted-foreground focus-visible:ring-cyan-400/40 group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground'

const selectContentClass =
  'border-cyan-400/20 bg-background text-foreground group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground'

const toNumber = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function BudgetStatusBadge({ estado }: { estado: string }) {
  const status = {
    ACTIVO: { icon: CheckCircle, label: 'Activo', className: 'border-cyan-400/30 bg-cyan-400/10 text-primary' },
    BLOQUEADO: { icon: AlertTriangle, label: 'Bloqueado', className: 'border-amber-300/35 bg-amber-300/10 text-amber-400 dark:text-amber-200' },
    CERRADO: { icon: XCircle, label: 'Cerrado', className: 'border-border/30 bg-slate-400/10 text-foreground/90' },
  }[estado] ?? { icon: CheckCircle, label: 'Activo', className: 'border-cyan-400/30 bg-cyan-400/10 text-primary' }

  const Icon = status.icon

  return (
    <Badge variant="outline" className={cn('gap-1.5 whitespace-nowrap', status.className)}>
      <Icon className="h-3 w-3" />
      {status.label}
    </Badge>
  )
}

function AlertBadge({ porcentaje }: { porcentaje: number }) {
  if (porcentaje >= 100) {
    return (
      <Badge variant="outline" className="gap-1.5 border-amber-300/35 bg-amber-300/10 text-amber-400 dark:text-amber-200">
        <AlertCircle className="h-3 w-3" />
        Sobregiro
      </Badge>
    )
  }

  if (porcentaje >= 90) {
    return (
      <Badge variant="outline" className="gap-1.5 border-sky-300/35 bg-sky-300/10 text-primary dark:text-sky-200">
        <AlertTriangle className="h-3 w-3" />
        Advertencia
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="gap-1.5 border-cyan-300/35 bg-cyan-300/10 text-primary">
      <CheckCircle className="h-3 w-3" />
      Normal
    </Badge>
  )
}

export default function PresupuestosListaPage() {
  const router = useRouter()
  const { get, del } = useApi()
  const country = useCountryContext()

  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([])
  const [centrosCosto, setCentrosCosto] = useState<CentroCosto[]>([])
  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [centroCostoFilter, setCentroCostoFilter] = useState('TODOS')
  const [periodoFilter, setPeriodoFilter] = useState('TODOS')
  const [estadoFilter, setEstadoFilter] = useState('TODOS')
  const [alertaFilter, setAlertaFilter] = useState('TODOS')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [presupuestosRes, centrosRes, periodosRes] = await Promise.all([
        get('/api/contabilidad/presupuestos'),
        get('/api/contabilidad/centros-costo'),
        get('/api/contabilidad/periodos'),
      ])

      if (presupuestosRes?.success && Array.isArray(presupuestosRes.data)) {
        setPresupuestos(presupuestosRes.data)
      }

      if (centrosRes?.success && Array.isArray(centrosRes.data)) {
        setCentrosCosto(centrosRes.data)
      }

      if (periodosRes?.success && Array.isArray(periodosRes.data)) {
        setPeriodos(periodosRes.data)
      }
    } catch (err: any) {
      console.error('Error loading data:', err)
      setError(err.message || 'Error al cargar los datos')
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este presupuesto?')) return

    try {
      const response = await del(`/api/contabilidad/presupuestos/${id}`)

      if (response?.success) {
        setPresupuestos((prev) => prev.filter((p) => p.id !== id))
      }
    } catch (err: any) {
      console.error('Error deleting presupuesto:', err)
      alert(err.message || 'Error al eliminar el presupuesto')
    }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(country.locale || 'es-PE', {
      style: 'currency',
      currency: country.moneda || 'PEN',
    }).format(toNumber(amount))

  const formatPeriodo = (periodo?: { anio: number; mes: number }) => {
    if (!periodo) return '-'
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    return `${meses[periodo.mes - 1]} ${periodo.anio}`
  }

  const filteredPresupuestos = presupuestos.filter((presupuesto) => {
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      const matchesSearch =
        presupuesto.centro_costo?.nombre?.toLowerCase().includes(search) ||
        presupuesto.centro_costo?.codigo?.toLowerCase().includes(search) ||
        presupuesto.cuenta?.nombre?.toLowerCase().includes(search) ||
        presupuesto.cuenta?.codigo?.toLowerCase().includes(search) ||
        (presupuesto.notas && presupuesto.notas.toLowerCase().includes(search))

      if (!matchesSearch) return false
    }

    if (centroCostoFilter !== 'TODOS' && presupuesto.centro_costo_id !== centroCostoFilter) return false
    if (periodoFilter !== 'TODOS' && presupuesto.periodo_contable_id !== periodoFilter) return false
    if (estadoFilter !== 'TODOS' && presupuesto.estado !== estadoFilter) return false

    if (alertaFilter !== 'TODOS') {
      const porcentaje = toNumber(presupuesto.porcentaje_ejecutado)
      if (alertaFilter === 'SOBREGIRO' && porcentaje < 100) return false
      if (alertaFilter === 'ADVERTENCIA' && (porcentaje < 90 || porcentaje >= 100)) return false
      if (alertaFilter === 'NORMAL' && porcentaje >= 90) return false
    }

    return true
  })

  const stats = {
    total: presupuestos.length,
    activos: presupuestos.filter((p) => p.estado === 'ACTIVO').length,
    sobregiros: presupuestos.filter((p) => toNumber(p.porcentaje_ejecutado) >= 100).length,
    advertencias: presupuestos.filter((p) => toNumber(p.porcentaje_ejecutado) >= 90 && toNumber(p.porcentaje_ejecutado) < 100).length,
    totalPresupuestado: presupuestos.reduce((sum, p) => sum + toNumber(p.monto_presupuestado), 0),
    totalEjecutado: presupuestos.reduce((sum, p) => sum + toNumber(p.monto_ejecutado), 0),
  }

  const hasFilters =
    searchTerm ||
    centroCostoFilter !== 'TODOS' ||
    periodoFilter !== 'TODOS' ||
    estadoFilter !== 'TODOS' ||
    alertaFilter !== 'TODOS'

  if (loading) {
    return (
      <div className="min-h-full bg-background p-6 text-foreground">
        <Card className="border-cyan-400/20 bg-card/70">
          <CardContent className="flex min-h-80 flex-col items-center justify-center gap-4">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Cargando presupuestos...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.20),transparent_34%),linear-gradient(135deg,#020617_0%,#061a2f_58%,#020617_100%)] p-4 text-foreground group-data-[erp-theme=light]/dashboard:bg-muted/30 group-data-[erp-theme=light]/dashboard:text-foreground lg:p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <Card className="border-cyan-400/20 bg-card/75 shadow-2xl shadow-cyan-950/20 group-data-[erp-theme=light]/dashboard:bg-card">
          <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-cyan-400/30 bg-cyan-400/10 text-primary">
                <DollarSign className="h-6 w-6" />
              </div>
              <div>
                <Badge variant="outline" className="mb-2 border-cyan-400/30 bg-cyan-400/10 text-primary">
                  ERP Budget Control
                </Badge>
                <h1 className="text-2xl font-semibold tracking-normal text-foreground group-data-[erp-theme=light]/dashboard:text-foreground lg:text-3xl">
                  Gestión de Presupuestos
                </h1>
                <p className="mt-1 text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">
                  Presupuestos por centro de costo, cuenta contable y periodo operativo.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="border-cyan-400/30 bg-card/50 text-primary hover:bg-cyan-400/10" onClick={loadData}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Actualizar
              </Button>
              <Button className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-cyan-950/30 hover:from-blue-500 hover:to-cyan-400" onClick={() => router.push('/dashboard/contabilidad/presupuestos/nuevo')}>
                <Plus className="mr-2 h-4 w-4" />
                Nuevo Presupuesto
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <StatCard label="Total presupuestos" value={stats.total.toString()} />
          <StatCard label="Activos" value={stats.activos.toString()} />
          <StatCard label="Sobregiros" value={stats.sobregiros.toString()} />
          <StatCard label="Advertencias" value={stats.advertencias.toString()} />
          <StatCard label="Presupuestado" value={formatCurrency(stats.totalPresupuestado)} compact />
          <StatCard label="Ejecutado" value={formatCurrency(stats.totalEjecutado)} compact />
        </div>

        <Card className="border-cyan-400/20 bg-card/70 group-data-[erp-theme=light]/dashboard:bg-card">
          <CardHeader className="border-b border-cyan-400/10 p-4">
            <CardTitle className="flex items-center gap-2 text-base text-foreground group-data-[erp-theme=light]/dashboard:text-foreground">
              <Filter className="h-4 w-4 text-primary" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Buscar</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-300/70" />
                  <Input aria-label="Buscar"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Centro, cuenta o notas..."
                    className={cn(fieldClass, 'pl-9')}
                  />
                </div>
              </div>

              <FilterSelect label="Centro de costo" value={centroCostoFilter} onChange={setCentroCostoFilter}>
                <SelectItem value="TODOS">Todos</SelectItem>
                {centrosCosto.map((centro) => (
                  <SelectItem key={centro.id} value={centro.id}>
                    {centro.codigo} - {centro.nombre}
                  </SelectItem>
                ))}
              </FilterSelect>

              <FilterSelect label="Periodo" value={periodoFilter} onChange={setPeriodoFilter}>
                <SelectItem value="TODOS">Todos</SelectItem>
                {periodos.map((periodo) => (
                  <SelectItem key={periodo.id} value={periodo.id}>
                    {formatPeriodo(periodo)}
                  </SelectItem>
                ))}
              </FilterSelect>

              <FilterSelect label="Estado" value={estadoFilter} onChange={setEstadoFilter}>
                <SelectItem value="TODOS">Todos</SelectItem>
                <SelectItem value="ACTIVO">Activo</SelectItem>
                <SelectItem value="BLOQUEADO">Bloqueado</SelectItem>
                <SelectItem value="CERRADO">Cerrado</SelectItem>
              </FilterSelect>

              <FilterSelect label="Alerta" value={alertaFilter} onChange={setAlertaFilter}>
                <SelectItem value="TODOS">Todos</SelectItem>
                <SelectItem value="NORMAL">Normal</SelectItem>
                <SelectItem value="ADVERTENCIA">Advertencia (&gt;=90%)</SelectItem>
                <SelectItem value="SOBREGIRO">Sobregiro (&gt;=100%)</SelectItem>
              </FilterSelect>
            </div>

            {hasFilters && (
              <div className="mt-4 flex justify-end">
                <Button
                  variant="outline"
                  className="border-cyan-400/30 bg-card/50 text-primary hover:bg-cyan-400/10"
                  onClick={() => {
                    setSearchTerm('')
                    setCentroCostoFilter('TODOS')
                    setPeriodoFilter('TODOS')
                    setEstadoFilter('TODOS')
                    setAlertaFilter('TODOS')
                  }}
                >
                  Limpiar filtros
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-cyan-400/20 bg-card/70 group-data-[erp-theme=light]/dashboard:bg-card">
          <CardContent className="p-0">
            {error && (
              <div className="p-4">
                <Alert className="border-amber-300/30 bg-amber-300/10 text-amber-400 dark:text-amber-200">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              </div>
            )}

            {filteredPresupuestos.length === 0 ? (
              <div className="flex min-h-80 flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-primary">
                  <DollarSign className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground group-data-[erp-theme=light]/dashboard:text-foreground">No hay presupuestos</h2>
                  <p className="mt-1 text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">
                    {presupuestos.length === 0
                      ? 'Aún no se han creado presupuestos.'
                      : 'No se encontraron presupuestos con los filtros aplicados.'}
                  </p>
                </div>
                {presupuestos.length === 0 && (
                  <Button className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white" onClick={() => router.push('/dashboard/contabilidad/presupuestos/nuevo')}>
                    <Plus className="mr-2 h-4 w-4" />
                    Crear primer presupuesto
                  </Button>
                )}
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="border-cyan-400/10 hover:bg-transparent">
                      <TableHead>Centro de costo</TableHead>
                      <TableHead>Cuenta</TableHead>
                      <TableHead className="text-center">Periodo</TableHead>
                      <TableHead className="text-right">Presupuestado</TableHead>
                      <TableHead className="text-right">Ejecutado</TableHead>
                      <TableHead className="text-right">Disponible</TableHead>
                      <TableHead className="text-center">% Ejecución</TableHead>
                      <TableHead className="text-center">Alerta</TableHead>
                      <TableHead className="text-center">Estado</TableHead>
                      <TableHead className="text-center">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPresupuestos.map((presupuesto) => (
                      <TableRow
                        key={presupuesto.id}
                        className="cursor-pointer border-cyan-400/10 hover:bg-cyan-400/5"
                        onClick={() => router.push(`/dashboard/contabilidad/presupuestos/${presupuesto.id}`)}
                      >
                        <TableCell>
                          <div className="font-semibold text-foreground group-data-[erp-theme=light]/dashboard:text-foreground">
                            {presupuesto.centro_costo?.nombre || '-'}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">{presupuesto.centro_costo?.codigo || '-'}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-foreground group-data-[erp-theme=light]/dashboard:text-foreground">
                            {presupuesto.cuenta?.nombre || '-'}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">{presupuesto.cuenta?.codigo || '-'}</div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="gap-1.5 border-cyan-400/25 bg-cyan-400/10 text-primary">
                            <Calendar className="h-3 w-3" />
                            {formatPeriodo(presupuesto.periodo)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-foreground group-data-[erp-theme=light]/dashboard:text-foreground">
                          {formatCurrency(presupuesto.monto_presupuestado)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-primary">
                          {formatCurrency(presupuesto.monto_ejecutado)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-semibold',
                            presupuesto.monto_disponible < 0 ? 'text-amber-400 dark:text-amber-200' : 'text-primary',
                          )}
                        >
                          {formatCurrency(presupuesto.monto_disponible)}
                        </TableCell>
                        <TableCell className="text-center">
                          <PresupuestoEjecucionIndicator
                            porcentajeEjecutado={presupuesto.porcentaje_ejecutado}
                            size="md"
                            showLabel={false}
                            showPercentage={true}
                            showProgressBar={true}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <AlertBadge porcentaje={presupuesto.porcentaje_ejecutado} />
                        </TableCell>
                        <TableCell className="text-center">
                          <BudgetStatusBadge estado={presupuesto.estado} />
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 border-cyan-400/25 bg-cyan-400/10 text-primary hover:bg-cyan-400/20"
                              onClick={(event) => {
                                event.stopPropagation()
                                router.push(`/dashboard/contabilidad/presupuestos/${presupuesto.id}`)
                              }}
                              title="Editar"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 border-amber-300/25 bg-amber-300/10 text-amber-400 dark:text-amber-200 hover:bg-amber-300/20"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleDelete(presupuesto.id)
                              }}
                              title="Eliminar"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="border-t border-cyan-400/10 px-4 py-3 text-sm text-muted-foreground">
                  Mostrando {filteredPresupuestos.length} de {presupuestos.length} presupuestos
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <Card className="border-cyan-400/20 bg-card/70 group-data-[erp-theme=light]/dashboard:bg-card">
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase text-cyan-200/75 group-data-[erp-theme=light]/dashboard:text-muted-foreground">{label}</p>
        <p className={cn('mt-2 font-semibold text-foreground group-data-[erp-theme=light]/dashboard:text-foreground', compact ? 'text-lg' : 'text-2xl')}>
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={fieldClass} aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className={selectContentClass}>{children}</SelectContent>
      </Select>
    </div>
  )
}
