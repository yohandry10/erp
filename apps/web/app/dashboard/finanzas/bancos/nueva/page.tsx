'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { ArrowLeft, Save, Building2, CreditCard, DollarSign, Hash, FileText } from 'lucide-react'
import { useLocalizedMoney } from '@/hooks/use-localized-money'

export default function NuevaCuentaBancariaPage() {
  const router = useRouter()
  const { post } = useApi()
  const { country, currency } = useLocalizedMoney()
  const isArgentina = country.paisCodigo === 'AR'
  const isColombia = country.paisCodigo === 'CO'
  const isPeru = country.paisCodigo === 'PE'
  const tiposCuenta = [
    { value: 'CORRIENTE', label: 'Cuenta Corriente' },
    { value: 'AHORROS', label: isArgentina ? 'Caja de Ahorro' : 'Cuenta de Ahorros' },
    ...(isPeru ? [{ value: 'DETRACCION', label: 'Cuenta de Detracción' }] : []),
    { value: 'PLAZO_FIJO', label: 'Plazo Fijo' },
  ]
  const monedas = [
    {
      value: currency,
      label: isArgentina
        ? 'Pesos argentinos (ARS)'
        : isColombia
          ? 'Pesos colombianos (COP)'
          : 'Soles (PEN)',
    },
    { value: 'USD', label: 'Dólares (USD)' },
    { value: 'EUR', label: 'Euros (EUR)' },
  ]

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Form fields
  const [nombre, setNombre] = useState('')
  const [banco, setBanco] = useState('')
  const [numeroCuenta, setNumeroCuenta] = useState('')
  const [tipoCuenta, setTipoCuenta] = useState('CORRIENTE')
  const [moneda, setMoneda] = useState(currency)
  const [saldo, setSaldo] = useState('0.00')
  const [permiteSobregiro, setPermiteSobregiro] = useState(false)
  const [activa, setActiva] = useState(true)

  useEffect(() => {
    if (!country.loading && currency) setMoneda(currency)
  }, [country.loading, currency])

  const bankExamples = isColombia
    ? { account: 'Ej: Cuenta Operaciones Bancolombia', bank: 'Ej: Bancolombia', number: 'Ej: 12345678901' }
    : isArgentina
      ? { account: 'Ej: Cuenta Operaciones Nación', bank: 'Ej: Banco Nación', number: 'Ej: 0110599520000000000017' }
      : { account: 'Ej: Cuenta Operaciones BCP', bank: 'Ej: Banco de Crédito del Perú', number: 'Ej: 191-1234567-0-89' }

  const clearFieldError = (field: string) => {
    if (!fieldErrors[field]) return
    setFieldErrors((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const validateForm = () => {
    const nextErrors: Record<string, string> = {}

    if (!nombre.trim()) nextErrors.nombre = 'El nombre de la cuenta es requerido'
    if (!banco.trim()) nextErrors.banco = 'El nombre del banco es requerido'
    if (!numeroCuenta.trim()) nextErrors.numeroCuenta = 'El número de cuenta es requerido'

    const saldoNum = parseFloat(saldo)
    if (isNaN(saldoNum) || saldoNum < 0) {
      nextErrors.saldo = 'El saldo debe ser un número mayor o igual a 0'
    }

    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!validateForm()) {
      setError('Revise los campos marcados antes de crear la cuenta bancaria')
      return
    }

    setSubmitting(true)

    try {
      const saldoNum = parseFloat(saldo)
      const payload = {
        nombre: nombre.trim(),
        banco: banco.trim(),
        numero_cuenta: numeroCuenta.trim(),
        tipo_cuenta: tipoCuenta,
        moneda,
        saldo: saldoNum,
        permite_sobregiro: permiteSobregiro,
        activa,
      }

      const response = await post('/api/finanzas/bancos/cuentas', payload)

      if (response?.success) {
        router.push('/dashboard/finanzas/bancos')
      } else {
        throw new Error(response?.message || 'Error al crear la cuenta bancaria')
      }
    } catch (err: any) {
      console.error('Error creating cuenta bancaria:', err)
      setError(err.message || 'Error al crear la cuenta bancaria')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaldoChange = (value: string) => {
    // Allow only numbers and decimal point
    const regex = /^\d*\.?\d{0,2}$/
    if (regex.test(value) || value === '') {
      setSaldo(value)
      clearFieldError('saldo')
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <button
            onClick={() => router.push('/dashboard/finanzas/bancos')}
            className="flex items-center gap-2 text-foreground/80 hover:text-foreground mb-2"
          >
            <ArrowLeft size={20} />
            Volver
          </button>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Nueva Cuenta Bancaria</h1>
          <p className="mt-2 text-base text-muted-foreground">Registra una nueva cuenta bancaria de la empresa</p>
        </div>
      </div>

      {/* Form */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
          {error && (
            <div className="bg-destructive/10 border border-red-200 text-destructive px-4 py-3 rounded-lg text-sm mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            {/* Información Básica */}
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Building2 size={20} className="text-primary" />
                Información Básica
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Nombre */}
                <div>
                  <label className="block text-sm font-medium text-foreground/85 mb-2">
                    <FileText className="inline h-4 w-4 mr-1" />
                    Nombre de la Cuenta *
                  </label>
                  <input
                    type="text"
                    value={nombre}
                    onChange={(e) => {
                      setNombre(e.target.value)
                      clearFieldError('nombre')
                    }}
                    placeholder={bankExamples.account}
                    className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    aria-invalid={Boolean(fieldErrors.nombre)}
                    aria-describedby={fieldErrors.nombre ? 'cuenta-nombre-error' : undefined}
                  />
                  {fieldErrors.nombre && (
                    <p id="cuenta-nombre-error" className="text-xs text-destructive mt-1">
                      {fieldErrors.nombre}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Nombre descriptivo para identificar la cuenta
                  </p>
                </div>

                {/* Banco */}
                <div>
                  <label className="block text-sm font-medium text-foreground/85 mb-2">
                    <Building2 className="inline h-4 w-4 mr-1" />
                    Banco *
                  </label>
                  <input
                    type="text"
                    value={banco}
                    onChange={(e) => {
                      setBanco(e.target.value)
                      clearFieldError('banco')
                    }}
                    placeholder={bankExamples.bank}
                    className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    aria-invalid={Boolean(fieldErrors.banco)}
                    aria-describedby={fieldErrors.banco ? 'cuenta-banco-error' : undefined}
                  />
                  {fieldErrors.banco && (
                    <p id="cuenta-banco-error" className="text-xs text-destructive mt-1">
                      {fieldErrors.banco}
                    </p>
                  )}
                </div>

                {/* Número de Cuenta */}
                <div>
                  <label className="block text-sm font-medium text-foreground/85 mb-2">
                    <Hash className="inline h-4 w-4 mr-1" />
                    Número de Cuenta *
                  </label>
                  <input
                    type="text"
                    value={numeroCuenta}
                    onChange={(e) => {
                      setNumeroCuenta(e.target.value)
                      clearFieldError('numeroCuenta')
                    }}
                    placeholder={bankExamples.number}
                    className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    aria-invalid={Boolean(fieldErrors.numeroCuenta)}
                    aria-describedby={fieldErrors.numeroCuenta ? 'cuenta-numero-error' : undefined}
                  />
                  {fieldErrors.numeroCuenta && (
                    <p id="cuenta-numero-error" className="text-xs text-destructive mt-1">
                      {fieldErrors.numeroCuenta}
                    </p>
                  )}
                </div>

                {/* Tipo de Cuenta */}
                <div>
                  <label className="block text-sm font-medium text-foreground/85 mb-2">
                    <CreditCard className="inline h-4 w-4 mr-1" />
                    Tipo de Cuenta *
                  </label>
                  <select
                    value={tipoCuenta}
                    onChange={(e) => setTipoCuenta(e.target.value)}
                    className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    {tiposCuenta.map((tipo) => (
                      <option key={tipo.value} value={tipo.value}>
                        {tipo.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Configuración Financiera */}
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <DollarSign size={20} className="text-emerald-400" />
                Configuración Financiera
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Moneda */}
                <div>
                  <label className="block text-sm font-medium text-foreground/85 mb-2">
                    <DollarSign className="inline h-4 w-4 mr-1" />
                    Moneda *
                  </label>
                  <select
                    value={moneda}
                    onChange={(e) => setMoneda(e.target.value)}
                    className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    {monedas.map((mon) => (
                      <option key={mon.value} value={mon.value}>
                        {mon.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Saldo Inicial */}
                <div>
                  <label className="block text-sm font-medium text-foreground/85 mb-2">
                    <DollarSign className="inline h-4 w-4 mr-1" />
                    Saldo Inicial
                  </label>
                  <input
                    type="text"
                    value={saldo}
                    onChange={(e) => handleSaldoChange(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    aria-invalid={Boolean(fieldErrors.saldo)}
                    aria-describedby={fieldErrors.saldo ? 'cuenta-saldo-error' : undefined}
                  />
                  {fieldErrors.saldo && (
                    <p id="cuenta-saldo-error" className="text-xs text-destructive mt-1">
                      {fieldErrors.saldo}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Saldo actual de la cuenta bancaria
                  </p>
                </div>
              </div>
            </div>

            {/* Opciones */}
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">
                Opciones
              </h3>

              <div className="space-y-3">
                {/* Permite Sobregiro */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permiteSobregiro}
                    onChange={(e) => setPermiteSobregiro(e.target.checked)}
                    className="w-4 h-4 text-primary border-border rounded focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-foreground/85">
                      Permite Sobregiro
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Permite que el saldo de la cuenta sea negativo
                    </p>
                  </div>
                </label>

                {/* Activa */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activa}
                    onChange={(e) => setActiva(e.target.checked)}
                    className="w-4 h-4 text-primary border-border rounded focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-foreground/85">
                      Cuenta Activa
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Solo las cuentas activas pueden recibir movimientos
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-6 border-t">
              <button
                type="button"
                onClick={() => router.push('/dashboard/finanzas/bancos')}
                disabled={submitting}
                className="px-6 py-2 border border-border rounded-lg text-foreground/85 hover:bg-muted/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    Crear Cuenta
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
