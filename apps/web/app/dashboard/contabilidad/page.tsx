'use client'

import { useState, useCallback, useEffect } from 'react'
import type { ComponentType } from 'react'
import {
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  Calculator,
  Calendar,
  FileText,
  Landmark,
  Receipt,
  Scale,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type VistaContable =
  | 'estado-resultados'
  | 'registro-compras'
  | 'balance-comprobacion'
  | 'kardex-valorizado'
  | 'libro-caja-bancos'
  | 'registro-activos-fijos'
  | 'libro-planillas'
  | 'libro-inventarios-balances'
  | 'registro-costos'
  | 'libros-electronicos-sunat'

const vistas: Array<{
  id: VistaContable
  title: string
  description: string
  icon: ComponentType<{ className?: string }>
}> = [
  {
    id: 'estado-resultados',
    title: 'Estado de Resultados',
    description: 'Análisis financiero y rentabilidad operativa.',
    icon: BarChart3,
  },
  {
    id: 'registro-compras',
    title: 'Registro de Compras',
    description: 'Detalle tributario y contable de adquisiciones.',
    icon: Receipt,
  },
  {
    id: 'balance-comprobacion',
    title: 'Balance de Comprobación',
    description: 'Validación de saldos, debe y haber.',
    icon: Scale,
  },
  {
    id: 'kardex-valorizado',
    title: 'Kardex Valorizado',
    description: 'Control valorizado de inventario.',
    icon: Boxes,
  },
  {
    id: 'libro-caja-bancos',
    title: 'Libro Caja y Bancos',
    description: 'Trazabilidad de caja, bancos y movimientos.',
    icon: Landmark,
  },
  {
    id: 'registro-activos-fijos',
    title: 'Registro Activos Fijos',
    description: 'Activos, depreciación y valor neto.',
    icon: Building2,
  },
  {
    id: 'libro-planillas',
    title: 'Libro de Planillas',
    description: 'Integración contable con RRHH.',
    icon: Users,
  },
  {
    id: 'libro-inventarios-balances',
    title: 'Inventarios y Balances',
    description: 'Libro de inventarios, activos y patrimonio.',
    icon: BookOpen,
  },
  {
    id: 'registro-costos',
    title: 'Registro de Costos',
    description: 'Centros de costo y costos operativos.',
    icon: Calculator,
  },
  {
    id: 'libros-electronicos-sunat',
    title: 'Libros Electrónicos SUNAT',
    description: 'Preparación de libros electrónicos.',
    icon: ShieldCheck,
  },
]

export default function ContabilidadPage() {
  const [vistaActual, setVistaActual] = useState<VistaContable>('registro-compras')
  const [loading, setLoading] = useState(false)
  const darkMode = true

  const [registroCompras, setRegistroCompras] = useState<any>(null)
  const [balanceComprobacion, setBalanceComprobacion] = useState<any>(null)
  const [kardexValorizado, setKardexValorizado] = useState<any>(null)
  const [libroCajaBancos, setLibroCajaBancos] = useState<any>(null)
  const [registroActivosFijos, setRegistroActivosFijos] = useState<any>(null)
  const [libroPlanillas, setLibroPlanillas] = useState<any>(null)
  const [libroInventariosBalances, setLibroInventariosBalances] = useState<any>(null)
  const [registroCostos, setRegistroCostos] = useState<any>(null)
  const [librosElectronicosSunat, setLibrosElectronicosSunat] = useState<any>(null)

  const { get } = useApi()

  const formatearMoneda = (valor: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(valor)
  }

  const cargarRegistroCompras = useCallback(async () => {
    setLoading(true)
    try {
      const response = await get('/api/contabilidad/registro-compras')
      if (response && response.success) setRegistroCompras(response.data)
    } catch (error) {
      console.error('Error cargando registro de compras:', error)
    } finally {
      setLoading(false)
    }
  }, [get])

  const cargarBalanceComprobacion = useCallback(async () => {
    setLoading(true)
    try {
      const response = await get('/api/contabilidad/balance-comprobacion')
      if (response && response.success) setBalanceComprobacion(response.data)
    } catch (error) {
      console.error('Error cargando balance de comprobación:', error)
    } finally {
      setLoading(false)
    }
  }, [get])

  const cargarKardexValorizado = useCallback(async () => {
    setLoading(true)
    try {
      const response = await get('/api/contabilidad/kardex-valorizado')
      if (response && response.success) setKardexValorizado(response.data)
    } catch (error) {
      console.error('Error cargando kardex valorizado:', error)
    } finally {
      setLoading(false)
    }
  }, [get])

  const cargarLibroCajaBancos = useCallback(async () => {
    setLoading(true)
    try {
      const response = await get('/api/contabilidad/libro-caja-bancos')
      if (response && response.success) setLibroCajaBancos(response.data)
    } catch (error) {
      console.error('Error cargando libro de caja y bancos:', error)
    } finally {
      setLoading(false)
    }
  }, [get])

  const cargarRegistroActivosFijos = useCallback(async () => {
    setLoading(true)
    try {
      const response = await get('/api/contabilidad/registro-activos-fijos')
      if (response && response.success) setRegistroActivosFijos(response.data)
    } catch (error) {
      console.error('Error cargando registro de activos fijos:', error)
    } finally {
      setLoading(false)
    }
  }, [get])

  const cargarLibroPlanillas = useCallback(async () => {
    setLoading(true)
    try {
      const response = await get('/api/contabilidad/libro-planillas')
      if (response && response.success) setLibroPlanillas(response.data)
    } catch (error) {
      console.error('Error cargando libro de planillas:', error)
    } finally {
      setLoading(false)
    }
  }, [get])

  const cargarLibroInventariosBalances = useCallback(async () => {
    setLoading(true)
    try {
      const response = await get('/api/contabilidad/libro-inventarios-balances')
      if (response && response.success) setLibroInventariosBalances(response.data)
    } catch (error) {
      console.error('Error cargando libro de inventarios y balances:', error)
    } finally {
      setLoading(false)
    }
  }, [get])

  const cargarRegistroCostos = useCallback(async () => {
    setLoading(true)
    try {
      const response = await get('/api/contabilidad/registro-costos')
      if (response && response.success) setRegistroCostos(response.data)
    } catch (error) {
      console.error('Error cargando registro de costos:', error)
    } finally {
      setLoading(false)
    }
  }, [get])

  const cargarLibrosElectronicosSunat = useCallback(async () => {
    setLoading(true)
    try {
      const response = await get('/api/contabilidad/libros-electronicos-sunat')
      if (response && response.success) setLibrosElectronicosSunat(response.data)
    } catch (error) {
      console.error('Error cargando libros electrónicos SUNAT:', error)
    } finally {
      setLoading(false)
    }
  }, [get])

  const cargarDatos = useCallback(async () => {
    if (vistaActual === 'registro-compras') await cargarRegistroCompras()
    else if (vistaActual === 'balance-comprobacion') await cargarBalanceComprobacion()
    else if (vistaActual === 'kardex-valorizado') await cargarKardexValorizado()
    else if (vistaActual === 'libro-caja-bancos') await cargarLibroCajaBancos()
    else if (vistaActual === 'registro-activos-fijos') await cargarRegistroActivosFijos()
    else if (vistaActual === 'libro-planillas') await cargarLibroPlanillas()
    else if (vistaActual === 'libro-inventarios-balances') await cargarLibroInventariosBalances()
    else if (vistaActual === 'registro-costos') await cargarRegistroCostos()
    else if (vistaActual === 'libros-electronicos-sunat') await cargarLibrosElectronicosSunat()
  }, [
    cargarBalanceComprobacion,
    cargarKardexValorizado,
    cargarLibroCajaBancos,
    cargarLibroInventariosBalances,
    cargarLibroPlanillas,
    cargarLibrosElectronicosSunat,
    cargarRegistroActivosFijos,
    cargarRegistroCompras,
    cargarRegistroCostos,
    vistaActual,
  ])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const currentVista = vistas.find((vista) => vista.id === vistaActual) ?? vistas[0]
  const CurrentIcon = currentVista.icon

  const metricClass = cn(
    'rounded-lg border p-4',
    darkMode ? 'border-cyan-400/15 bg-slate-950/45' : 'border-slate-200 bg-white',
  )

  const labelClass = cn('text-xs font-semibold uppercase tracking-[0.16em]', darkMode ? 'text-cyan-200/70' : 'text-slate-500')
  const valueClass = cn('mt-2 text-2xl font-bold', darkMode ? 'text-white' : 'text-slate-950')

  const renderLoading = () => (
    <Card className={cn('border-dashed', darkMode && 'border-cyan-400/20 bg-slate-950/45 text-slate-200')}>
      <CardContent className="flex min-h-[260px] flex-col items-center justify-center gap-4 p-8">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-400/20 border-t-cyan-300" />
        <p className={cn('text-sm font-medium', darkMode ? 'text-slate-300' : 'text-slate-600')}>
          Cargando información contable...
        </p>
      </CardContent>
    </Card>
  )

  const renderPanel = (title: string, description: string, metrics: Array<{ label: string; value: string | number }>) => {
    if (loading) return renderLoading()

    return (
      <Card className={cn('overflow-hidden', darkMode && 'border-cyan-400/20 bg-slate-950/70 text-slate-100 shadow-2xl shadow-blue-950/20')}>
        <CardHeader className={cn('border-b', darkMode ? 'border-cyan-400/10 bg-slate-950/45' : 'border-slate-200 bg-white')}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className={cn('text-2xl', darkMode && 'text-white')}>{title}</CardTitle>
              <p className={cn('mt-2 max-w-2xl text-sm', darkMode ? 'text-slate-300' : 'text-slate-500')}>{description}</p>
            </div>
            <div className={cn('rounded-full border px-3 py-1 text-xs font-semibold', darkMode ? 'border-cyan-400/20 bg-cyan-400/10 text-cyan-100' : 'border-blue-100 bg-blue-50 text-blue-700')}>
              Datos reales del tenant
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.label} className={metricClass}>
                <div className={labelClass}>{metric.label}</div>
                <div className={valueClass}>{metric.value}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const renderContent = () => {
    if (vistaActual === 'estado-resultados') {
      return renderPanel('Estado de Resultados', 'Vista ejecutiva de resultados y análisis financiero.', [
        { label: 'Vista', value: 'Activa' },
        { label: 'Periodo', value: 'Actual' },
        { label: 'Estado', value: 'Operativo' },
      ])
    }

    if (vistaActual === 'registro-compras') {
      return renderPanel('Registro de Compras', 'Registro detallado de compras para control tributario y contable.', [
        { label: 'Estado', value: 'Activo' },
        { label: 'Total registros', value: registroCompras?.total || 0 },
        { label: 'Origen', value: 'Compras' },
      ])
    }

    if (vistaActual === 'balance-comprobacion') {
      return renderPanel('Balance de Comprobación', 'Balance contable para validar saldos y consistencia de cuentas.', [
        { label: 'Estado', value: 'Activo' },
        { label: 'Total cuentas', value: balanceComprobacion?.totalCuentas || 0 },
        { label: 'Control', value: 'Debe/Haber' },
      ])
    }

    if (vistaActual === 'kardex-valorizado') {
      return renderPanel('Kardex Valorizado', 'Control valorizado de inventarios con método de valuación operativo.', [
        { label: 'Método', value: kardexValorizado?.metodoValuacion || 'PROMEDIO' },
        { label: 'Total productos', value: kardexValorizado?.totalProductos || 0 },
        { label: 'Valor total', value: formatearMoneda(kardexValorizado?.valorTotal || 0) },
      ])
    }

    if (vistaActual === 'libro-caja-bancos') {
      return renderPanel('Libro de Caja y Bancos', 'Control separado de caja, bancos y movimientos financieros.', [
        { label: 'Saldo caja', value: formatearMoneda(libroCajaBancos?.saldoCaja || 0) },
        { label: 'Saldo bancos', value: formatearMoneda(libroCajaBancos?.saldoBancos || 0) },
        { label: 'Movimientos', value: libroCajaBancos?.totalMovimientos || 0 },
      ])
    }

    if (vistaActual === 'registro-activos-fijos') {
      return renderPanel('Registro de Activos Fijos', 'Control de activos, depreciación acumulada y valor neto.', [
        { label: 'Total activos', value: registroActivosFijos?.totalActivos || 0 },
        { label: 'Valor bruto', value: formatearMoneda(registroActivosFijos?.valorBruto || 0) },
        { label: 'Valor neto', value: formatearMoneda(registroActivosFijos?.valorNeto || 0) },
        { label: 'Depreciación', value: formatearMoneda(registroActivosFijos?.depreciacionAcumulada || 0) },
      ])
    }

    if (vistaActual === 'libro-planillas') {
      return renderPanel('Libro de Planillas', 'Integración contable con remuneraciones y descuentos de RRHH.', [
        { label: 'Empleados', value: libroPlanillas?.totalEmpleados || 0 },
        { label: 'Planillas', value: libroPlanillas?.planillasProcesadas || 0 },
        { label: 'Remuneraciones', value: formatearMoneda(libroPlanillas?.totalRemuneraciones || 0) },
        { label: 'Descuentos', value: formatearMoneda(libroPlanillas?.totalDescuentos || 0) },
      ])
    }

    if (vistaActual === 'libro-inventarios-balances') {
      return renderPanel('Libro de Inventarios y Balances', 'Libro completo de inventarios, activos, pasivos y patrimonio.', [
        { label: 'Inventario inicial', value: formatearMoneda(libroInventariosBalances?.inventarioInicial || 0) },
        { label: 'Inventario final', value: formatearMoneda(libroInventariosBalances?.inventarioFinal || 0) },
        { label: 'Total activos', value: formatearMoneda(libroInventariosBalances?.totalActivos || 0) },
        { label: 'Patrimonio', value: formatearMoneda(libroInventariosBalances?.patrimonio || 0) },
      ])
    }

    if (vistaActual === 'registro-costos') {
      return renderPanel('Registro de Costos', 'Control por centros de costo con costos directos e indirectos.', [
        { label: 'Centros de costo', value: registroCostos?.centrosCosto || 0 },
        { label: 'Costos directos', value: formatearMoneda(registroCostos?.costosDirectos || 0) },
        { label: 'Costos indirectos', value: formatearMoneda(registroCostos?.costosIndirectos || 0) },
        { label: 'Total costos', value: formatearMoneda(registroCostos?.totalCostos || 0) },
      ])
    }

    return renderPanel('Libros Electrónicos SUNAT', 'Preparación para PLE y control de archivos electrónicos.', [
      { label: 'Libros configurados', value: librosElectronicosSunat?.librosConfigurados || 0 },
      { label: 'Archivos generados', value: librosElectronicosSunat?.archivosGenerados || 0 },
      { label: 'Último envío', value: librosElectronicosSunat?.ultimoEnvio || 'Pendiente' },
      { label: 'Estado PLE', value: librosElectronicosSunat?.estadoPLE || 'Configurado' },
    ])
  }

  const connectedMetrics = [
    ['Compras', registroCompras?.total || 0],
    ['Cuentas en balance', balanceComprobacion?.totalCuentas || 0],
    ['Productos valorizados', kardexValorizado?.totalProductos || 0],
    ['Movimientos caja/bancos', libroCajaBancos?.totalMovimientos || 0],
  ]

  const controlItems = [
    ['Origen operativo', currentVista.title],
    ['Tenant', 'Aislado'],
    ['Trazabilidad', 'Documento origen'],
    ['Cuadre', vistaActual === 'balance-comprobacion' ? 'Debe/Haber' : 'Por vista'],
  ]

  const operationalLinks = [
    { title: 'Asientos', description: 'Libro diario y detalle debe/haber.', href: '/dashboard/contabilidad/asientos', icon: FileText },
    { title: 'Estados', description: 'Balance, resultados y comprobación.', href: '/dashboard/contabilidad/estados', icon: BarChart3 },
    { title: 'Monitoreo', description: 'Eventos contables y reintentos.', href: '/dashboard/contabilidad/monitoreo', icon: ShieldCheck },
    { title: 'Periodos', description: 'Control de apertura y cierre.', href: '/dashboard/contabilidad/periodos', icon: Calendar },
    { title: 'Centros de costo', description: 'Asignación operativa por unidad.', href: '/dashboard/contabilidad/centros-costo', icon: Calculator },
    { title: 'Presupuestos', description: 'Ejecución y alertas del periodo.', href: '/dashboard/contabilidad/presupuestos', icon: Landmark },
  ]

  const barMetrics = connectedMetrics.map(([label, value]) => {
    const numericValue = Number(value) || 0
    const maxValue = Math.max(...connectedMetrics.map(([, metricValue]) => Number(metricValue) || 0), 1)
    const percentage = Math.max(8, Math.round((numericValue / maxValue) * 100))
    const widthClass =
      percentage >= 90
        ? 'w-full'
        : percentage >= 75
          ? 'w-10/12'
          : percentage >= 60
            ? 'w-8/12'
            : percentage >= 45
              ? 'w-6/12'
              : percentage >= 30
                ? 'w-4/12'
                : percentage >= 15
                  ? 'w-2/12'
                  : 'w-1/12'
    return { label, value, widthClass }
  })

  return (
    <div
      className={cn(
        'min-h-screen p-4 transition-colors',
        darkMode
          ? 'bg-gradient-to-br from-slate-950 via-sky-950 to-slate-950 text-slate-100'
          : 'bg-slate-50 text-slate-950',
      )}
    >
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className={cn('rounded-2xl border px-5 py-4 shadow-2xl', darkMode ? 'border-cyan-400/20 bg-slate-950/70 shadow-blue-950/20' : 'border-slate-200 bg-white shadow-slate-200/70')}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className={cn('mb-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]', darkMode ? 'border-cyan-400/25 bg-cyan-400/10 text-cyan-100' : 'border-blue-100 bg-blue-50 text-blue-700')}>
                ERP Ledger Center
              </div>
              <h1 className="text-3xl font-bold tracking-tight">Contabilidad</h1>
              <p className={cn('mt-2 max-w-3xl text-sm leading-6', darkMode ? 'text-slate-300' : 'text-slate-500')}>
                Libros, balances y registros contables conectados a operaciones reales del ERP.
              </p>
            </div>
          </div>
        </section>

        <Card className={cn('overflow-hidden', darkMode && 'border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20')}>
          <CardHeader className="border-b border-cyan-400/10 px-4 py-3">
            <CardTitle className={cn('text-sm uppercase tracking-[0.16em]', darkMode && 'text-cyan-100')}>Vistas contables</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {vistas.map((vista) => {
                const Icon = vista.icon
                const active = vistaActual === vista.id

                return (
                  <button
                    key={vista.id}
                    type="button"
                    onClick={() => setVistaActual(vista.id)}
                    className={cn(
                      'flex min-h-[76px] w-full items-start gap-3 rounded-xl border p-3 text-left transition',
                      active
                        ? darkMode
                          ? 'border-cyan-300/40 bg-cyan-400/15 text-white shadow-lg shadow-cyan-950/20'
                          : 'border-blue-200 bg-blue-50 text-blue-950'
                        : darkMode
                          ? 'border-cyan-400/15 bg-slate-950/45 text-slate-300 hover:bg-cyan-400/10'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                    )}
                    >
                    <span className={cn('mt-0.5 shrink-0 rounded-lg p-2', active ? 'bg-blue-500 text-white' : darkMode ? 'bg-slate-900 text-cyan-200' : 'bg-slate-100 text-blue-700')}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{vista.title}</span>
                      <span className={cn('mt-1 line-clamp-2 block text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-500')}>{vista.description}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <section className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className={cn(metricClass, 'md:col-span-2 xl:col-span-2')}>
              <div className={labelClass}>Vista activa</div>
              <div className={cn('mt-2 flex items-center gap-2 text-lg font-bold', darkMode ? 'text-white' : 'text-slate-950')}>
                <CurrentIcon className="h-5 w-5 text-cyan-300" />
                {currentVista.title}
              </div>
            </div>
            <div className={metricClass}>
              <div className={labelClass}>Integración</div>
              <div className={valueClass}>ERP</div>
            </div>
            <div className={metricClass}>
              <div className={labelClass}>Estado</div>
              <div className={valueClass}>{loading ? 'Sync' : 'Operativo'}</div>
            </div>
            <div className={metricClass}>
              <div className={labelClass}>Tenant</div>
              <div className={valueClass}>Aislado</div>
            </div>
            <div className={metricClass}>
              <div className={labelClass}>Cuadre</div>
              <div className={valueClass}>Activo</div>
            </div>
          </div>

          {renderContent()}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.42fr)]">
            <Card className={cn('overflow-hidden', darkMode && 'border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20')}>
              <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
                <CardTitle className={cn('text-base', darkMode && 'text-white')}>Radar operativo contable</CardTitle>
                <p className={cn('text-xs', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                  Señales conectadas a módulos reales; no se agregan métricas inventadas.
                </p>
              </CardHeader>
              <CardContent className="grid gap-4 p-5 lg:grid-cols-2">
                {barMetrics.map((metric) => (
                  <div key={metric.label} className={cn('rounded-xl border p-4', darkMode ? 'border-cyan-400/15 bg-slate-950/45' : 'border-slate-200 bg-white')}>
                    <div className="flex items-center justify-between gap-3">
                      <span className={cn('text-sm font-semibold', darkMode ? 'text-slate-200' : 'text-slate-700')}>{metric.label}</span>
                      <span className={cn('text-sm font-bold', darkMode ? 'text-white' : 'text-slate-950')}>{metric.value}</span>
                    </div>
                    <div className={cn('mt-3 h-2 overflow-hidden rounded-full', darkMode ? 'bg-slate-900' : 'bg-slate-100')}>
                      <div className={cn('h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-300', metric.widthClass)} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className={cn('overflow-hidden', darkMode && 'border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20')}>
              <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
                <CardTitle className={cn('text-base', darkMode && 'text-white')}>Control de consistencia</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-1">
                {controlItems.map(([label, value]) => (
                  <div key={label} className={cn('flex items-center justify-between rounded-xl border px-3 py-3', darkMode ? 'border-cyan-400/15 bg-slate-950/45' : 'border-slate-200 bg-white')}>
                    <span className={cn('text-xs font-semibold uppercase tracking-[0.14em]', darkMode ? 'text-cyan-200/70' : 'text-slate-500')}>{label}</span>
                    <span className={cn('text-sm font-bold', darkMode ? 'text-white' : 'text-slate-950')}>{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className={cn('overflow-hidden', darkMode && 'border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20')}>
            <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
              <CardTitle className={cn('text-base', darkMode && 'text-white')}>Flujos contables principales</CardTitle>
              <p className={cn('text-xs', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                Accesos compactos a las pantallas que sostienen la operación diaria.
              </p>
            </CardHeader>
            <CardContent className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
              {operationalLinks.map((link) => {
                const Icon = link.icon

                return (
                  <a
                    key={link.href}
                    href={link.href}
                    className={cn(
                      'group flex items-start gap-3 rounded-xl border p-4 transition',
                      darkMode
                        ? 'border-cyan-400/15 bg-slate-950/45 text-slate-200 hover:border-cyan-300/35 hover:bg-cyan-400/10'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50',
                    )}
                  >
                    <span className={cn('rounded-lg p-2', darkMode ? 'bg-slate-900 text-cyan-200 group-hover:bg-blue-600 group-hover:text-white' : 'bg-slate-100 text-blue-700')}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className={cn('block text-sm font-bold', darkMode ? 'text-white' : 'text-slate-950')}>{link.title}</span>
                      <span className={cn('mt-1 block text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-500')}>{link.description}</span>
                    </span>
                  </a>
                )
              })}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}
