'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard, DollarSign, Plus, RefreshCw } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import CuentaBancariaCard from '@/components/finanzas/CuentaBancariaCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface CuentaBancaria {
  id: string
  nombre: string
  banco: string
  numero_cuenta: string
  tipo_cuenta: string
  moneda: string
  saldo: number
  permite_sobregiro: boolean
  activa: boolean
  created_at: string
  updated_at: string
}

interface SaldosConsolidados {
  por_moneda: Array<{
    moneda: string
    saldo_total: number
    saldo_activas: number
    cantidad_cuentas: number
    cantidad_activas: number
  }>
  por_cuenta: Array<{
    id: string
    nombre: string
    banco: string
    numero_cuenta: string
    tipo_cuenta: string
    moneda: string
    saldo: number
    activa: boolean
  }>
  total_cuentas: number
  total_cuentas_activas: number
}

const labelClass = 'text-xs font-semibold uppercase tracking-[0.12em] text-primary/80'

const toNumber = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const normalizeCuenta = (raw: any): CuentaBancaria => ({
  id: raw?.id || '',
  nombre: raw?.nombre || 'Cuenta bancaria',
  banco: raw?.banco || 'Banco',
  numero_cuenta: raw?.numero_cuenta || raw?.numeroCuenta || 'N/A',
  tipo_cuenta: raw?.tipo_cuenta || 'CORRIENTE',
  moneda: raw?.moneda || 'PEN',
  saldo: toNumber(raw?.saldo ?? raw?.saldo_actual),
  permite_sobregiro: Boolean(raw?.permite_sobregiro),
  activa: raw?.activa ?? raw?.estado !== 'INACTIVA',
  created_at: raw?.created_at || '',
  updated_at: raw?.updated_at || '',
})

const normalizeSaldos = (raw: any): SaldosConsolidados => ({
  por_moneda: Array.isArray(raw?.por_moneda) ? raw.por_moneda : [],
  por_cuenta: Array.isArray(raw?.por_cuenta) ? raw.por_cuenta : [],
  total_cuentas: toNumber(raw?.total_cuentas),
  total_cuentas_activas: toNumber(raw?.total_cuentas_activas),
})

export default function BancosPage() {
  const router = useRouter()
  const { get } = useApi()

  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([])
  const [saldosConsolidados, setSaldosConsolidados] = useState<SaldosConsolidados | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingSaldos, setLoadingSaldos] = useState(true)

  const loadCuentas = useCallback(async () => {
    try {
      setLoading(true)
      const response = await get('/api/finanzas/bancos/cuentas')
      if (response?.success) setCuentas((Array.isArray(response.data) ? response.data : []).map(normalizeCuenta))
    } catch (error) {
      console.error('Error loading cuentas bancarias:', error)
      alert('Error: No se pudieron cargar las cuentas bancarias')
    } finally {
      setLoading(false)
    }
  }, [get])

  const loadSaldosConsolidados = useCallback(async () => {
    try {
      setLoadingSaldos(true)
      const response = await get('/api/finanzas/bancos/saldos')
      if (response?.success) setSaldosConsolidados(normalizeSaldos(response.data))
    } catch (error) {
      console.error('Error loading saldos consolidados:', error)
    } finally {
      setLoadingSaldos(false)
    }
  }, [get])

  useEffect(() => {
    loadCuentas()
    loadSaldosConsolidados()
  }, [loadCuentas, loadSaldosConsolidados])

  const formatCurrency = (amount: number, moneda: string = 'PEN') => {
    const currency = moneda === 'USD' ? 'USD' : moneda === 'EUR' ? 'EUR' : 'PEN'
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency,
    }).format(toNumber(amount))
  }

  const cuentasActivas = cuentas.filter((cuenta) => cuenta.activa)
  const cuentasInactivas = cuentas.filter((cuenta) => !cuenta.activa)

  const refresh = () => {
    loadCuentas()
    loadSaldosConsolidados()
  }

  return (
    <div className="min-h-screen bg-background px-4 py-5 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <section className="rounded-3xl border border-cyan-400/20 bg-card/80 p-5 shadow-2xl shadow-blue-950/30">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-primary">
                ERP Treasury Bank
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground">Cuentas Bancarias</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Saldos, cuentas activas y trazabilidad bancaria para tesoreria.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={refresh} variant="outline" className="gap-2 border-cyan-400/20 bg-muted/30 text-primary hover:bg-muted/50 hover:text-foreground">
                <RefreshCw className="h-4 w-4" />
                Actualizar
              </Button>
              <Button type="button" onClick={() => router.push('/dashboard/finanzas/bancos/nueva')} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">
                <Plus className="h-4 w-4" />
                Nueva cuenta
              </Button>
            </div>
          </div>
        </section>

        {!loadingSaldos && saldosConsolidados && (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div>
                  <div className={labelClass}>Total cuentas</div>
                  <div className="mt-3 text-2xl font-bold text-foreground">{saldosConsolidados.total_cuentas}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{saldosConsolidados.total_cuentas_activas} activas</div>
                </div>
                <span className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-primary">
                  <CreditCard className="h-5 w-5" />
                </span>
              </CardContent>
            </Card>

            {saldosConsolidados.por_moneda.map((consolidado) => (
              <Card key={consolidado.moneda} className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <div>
                    <div className={labelClass}>Saldo {consolidado.moneda}</div>
                    <div className="mt-3 text-xl font-bold text-primary">{formatCurrency(consolidado.saldo_activas, consolidado.moneda)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{consolidado.cantidad_activas} cuentas activas</div>
                  </div>
                  <span className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-primary">
                    <DollarSign className="h-5 w-5" />
                  </span>
                </CardContent>
              </Card>
            ))}
          </section>
        )}

        <section className="rounded-3xl border border-cyan-400/20 bg-card/65 p-5 shadow-xl shadow-blue-950/20">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-foreground">Cuentas activas</h2>
              <p className="text-sm text-muted-foreground">{cuentasActivas.length} cuentas disponibles</p>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-muted-foreground">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              <p>Cargando cuentas bancarias...</p>
            </div>
          ) : cuentasActivas.length === 0 ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-400/20 bg-card/45 p-8 text-center">
              <CreditCard className="mb-3 h-12 w-12 text-cyan-200/50" />
              <h3 className="text-lg font-bold text-foreground">No hay cuentas bancarias activas</h3>
              <p className="mt-2 text-sm text-muted-foreground">Crea una nueva cuenta bancaria para comenzar.</p>
              <Button type="button" onClick={() => router.push('/dashboard/finanzas/bancos/nueva')} className="mt-4 gap-2 bg-blue-600 text-white hover:bg-blue-500">
                <Plus className="h-4 w-4" />
                Nueva cuenta bancaria
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {cuentasActivas.map((cuenta) => (
                <CuentaBancariaCard
                  key={cuenta.id}
                  cuenta={cuenta}
                  onView={() => router.push(`/dashboard/finanzas/bancos/${cuenta.id}`)}
                  onEdit={() => router.push(`/dashboard/finanzas/bancos/${cuenta.id}/editar`)}
                />
              ))}
            </div>
          )}
        </section>

        {cuentasInactivas.length > 0 && (
          <section className="rounded-3xl border border-cyan-400/20 bg-card/50 p-5 shadow-xl shadow-blue-950/20">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground">Cuentas inactivas</h2>
                <p className="text-sm text-muted-foreground">{cuentasInactivas.length} cuentas archivadas</p>
              </div>
            </div>
            <div className="grid gap-4 opacity-75 md:grid-cols-2 2xl:grid-cols-3">
              {cuentasInactivas.map((cuenta) => (
                <CuentaBancariaCard
                  key={cuenta.id}
                  cuenta={cuenta}
                  onView={() => router.push(`/dashboard/finanzas/bancos/${cuenta.id}`)}
                  onEdit={() => router.push(`/dashboard/finanzas/bancos/${cuenta.id}/editar`)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
