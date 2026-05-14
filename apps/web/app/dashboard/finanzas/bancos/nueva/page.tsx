'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { ArrowLeft, Save, Building2, CreditCard, DollarSign, Hash, FileText } from 'lucide-react'

const TIPOS_CUENTA = [
  { value: 'CORRIENTE', label: 'Cuenta Corriente' },
  { value: 'AHORROS', label: 'Cuenta de Ahorros' },
  { value: 'DETRACCION', label: 'Cuenta de Detracción' },
  { value: 'PLAZO_FIJO', label: 'Plazo Fijo' },
]

const MONEDAS = [
  { value: 'PEN', label: 'Soles (PEN)' },
  { value: 'USD', label: 'Dólares (USD)' },
  { value: 'EUR', label: 'Euros (EUR)' },
]

export default function NuevaCuentaBancariaPage() {
  const router = useRouter()
  const { post } = useApi()
  
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Form fields
  const [nombre, setNombre] = useState('')
  const [banco, setBanco] = useState('')
  const [numeroCuenta, setNumeroCuenta] = useState('')
  const [tipoCuenta, setTipoCuenta] = useState('CORRIENTE')
  const [moneda, setMoneda] = useState('PEN')
  const [saldo, setSaldo] = useState('0.00')
  const [permiteSobregiro, setPermiteSobregiro] = useState(false)
  const [activa, setActiva] = useState(true)

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
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <button
            onClick={() => router.push('/dashboard/finanzas/bancos')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2"
          >
            <ArrowLeft size={20} />
            Volver
          </button>
          <h1 className="dashboard-title">Nueva Cuenta Bancaria</h1>
          <p className="dashboard-subtitle">Registra una nueva cuenta bancaria de la empresa</p>
        </div>
      </div>

      {/* Form */}
      <div className="activity-section">
        <div className="activity-card">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            {/* Información Básica */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Building2 size={20} className="text-blue-600" />
                Información Básica
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Nombre */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
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
                    placeholder="Ej: Cuenta Operaciones BCP"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    aria-invalid={Boolean(fieldErrors.nombre)}
                    aria-describedby={fieldErrors.nombre ? 'cuenta-nombre-error' : undefined}
                  />
                  {fieldErrors.nombre && (
                    <p id="cuenta-nombre-error" className="text-xs text-red-600 mt-1">
                      {fieldErrors.nombre}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Nombre descriptivo para identificar la cuenta
                  </p>
                </div>

                {/* Banco */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
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
                    placeholder="Ej: Banco de Crédito del Perú"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    aria-invalid={Boolean(fieldErrors.banco)}
                    aria-describedby={fieldErrors.banco ? 'cuenta-banco-error' : undefined}
                  />
                  {fieldErrors.banco && (
                    <p id="cuenta-banco-error" className="text-xs text-red-600 mt-1">
                      {fieldErrors.banco}
                    </p>
                  )}
                </div>

                {/* Número de Cuenta */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
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
                    placeholder="Ej: 191-1234567-0-89"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    aria-invalid={Boolean(fieldErrors.numeroCuenta)}
                    aria-describedby={fieldErrors.numeroCuenta ? 'cuenta-numero-error' : undefined}
                  />
                  {fieldErrors.numeroCuenta && (
                    <p id="cuenta-numero-error" className="text-xs text-red-600 mt-1">
                      {fieldErrors.numeroCuenta}
                    </p>
                  )}
                </div>

                {/* Tipo de Cuenta */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <CreditCard className="inline h-4 w-4 mr-1" />
                    Tipo de Cuenta *
                  </label>
                  <select
                    value={tipoCuenta}
                    onChange={(e) => setTipoCuenta(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    {TIPOS_CUENTA.map((tipo) => (
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
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <DollarSign size={20} className="text-green-600" />
                Configuración Financiera
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Moneda */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <DollarSign className="inline h-4 w-4 mr-1" />
                    Moneda *
                  </label>
                  <select
                    value={moneda}
                    onChange={(e) => setMoneda(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    {MONEDAS.map((mon) => (
                      <option key={mon.value} value={mon.value}>
                        {mon.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Saldo Inicial */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <DollarSign className="inline h-4 w-4 mr-1" />
                    Saldo Inicial
                  </label>
                  <input
                    type="text"
                    value={saldo}
                    onChange={(e) => handleSaldoChange(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    aria-invalid={Boolean(fieldErrors.saldo)}
                    aria-describedby={fieldErrors.saldo ? 'cuenta-saldo-error' : undefined}
                  />
                  {fieldErrors.saldo && (
                    <p id="cuenta-saldo-error" className="text-xs text-red-600 mt-1">
                      {fieldErrors.saldo}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Saldo actual de la cuenta bancaria
                  </p>
                </div>
              </div>
            </div>

            {/* Opciones */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Opciones
              </h3>
              
              <div className="space-y-3">
                {/* Permite Sobregiro */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permiteSobregiro}
                    onChange={(e) => setPermiteSobregiro(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700">
                      Permite Sobregiro
                    </span>
                    <p className="text-xs text-gray-500">
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
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700">
                      Cuenta Activa
                    </span>
                    <p className="text-xs text-gray-500">
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
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
