'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { ArrowLeft, Save, Building2, CreditCard, DollarSign, Hash, FileText, AlertCircle } from 'lucide-react'

const TIPOS_CUENTA = [
  { value: 'CORRIENTE', label: 'Cuenta Corriente' },
  { value: 'AHORROS', label: 'Cuenta de Ahorros' },
  { value: 'DETRACCION', label: 'Cuenta de Detracción' },
  { value: 'PLAZO_FIJO', label: 'Plazo Fijo' },
]

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
}

export default function EditarCuentaBancariaPage() {
  const router = useRouter()
  const params = useParams()
  const { get, put } = useApi()
  
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cuenta, setCuenta] = useState<CuentaBancaria | null>(null)

  // Form fields
  const [nombre, setNombre] = useState('')
  const [banco, setBanco] = useState('')
  const [numeroCuenta, setNumeroCuenta] = useState('')
  const [tipoCuenta, setTipoCuenta] = useState('CORRIENTE')
  const [permiteSobregiro, setPermiteSobregiro] = useState(false)
  const [activa, setActiva] = useState(true)

  const loadCuenta = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await get(`/api/finanzas/bancos/cuentas/${params.id}`)
      
      if (response?.success && response.data) {
        const data = response.data
        setCuenta(data)
        
        // Populate form fields
        setNombre(data.nombre || '')
        setBanco(data.banco || '')
        setNumeroCuenta(data.numero_cuenta || '')
        setTipoCuenta(data.tipo_cuenta || 'CORRIENTE')
        setPermiteSobregiro(data.permite_sobregiro || false)
        setActiva(data.activa !== undefined ? data.activa : true)
      } else {
        throw new Error('Cuenta bancaria no encontrada')
      }
    } catch (err: any) {
      console.error('Error loading cuenta bancaria:', err)
      setError(err.message || 'Error al cargar la cuenta bancaria')
    } finally {
      setLoading(false)
    }
  }, [params.id, get])

  useEffect(() => {
    if (params.id) {
      loadCuenta()
    }
  }, [params.id, loadCuenta])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validations
    if (!nombre.trim()) {
      setError('El nombre de la cuenta es requerido')
      return
    }

    if (!banco.trim()) {
      setError('El nombre del banco es requerido')
      return
    }

    if (!numeroCuenta.trim()) {
      setError('El número de cuenta es requerido')
      return
    }

    setSubmitting(true)

    try {
      const payload = {
        nombre: nombre.trim(),
        banco: banco.trim(),
        numero_cuenta: numeroCuenta.trim(),
        tipo_cuenta: tipoCuenta,
        permite_sobregiro: permiteSobregiro,
        activa,
      }

      const response = await put(`/api/finanzas/bancos/cuentas/${params.id}`, payload)

      if (response?.success) {
        router.push('/dashboard/finanzas/bancos')
      } else {
        throw new Error(response?.message || 'Error al actualizar la cuenta bancaria')
      }
    } catch (err: any) {
      console.error('Error updating cuenta bancaria:', err)
      setError(err.message || 'Error al actualizar la cuenta bancaria')
    } finally {
      setSubmitting(false)
    }
  }

  const formatCurrency = (amount: number, moneda: string = 'PEN') => {
    const currency = moneda === 'USD' ? 'USD' : moneda === 'EUR' ? 'EUR' : 'PEN'
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: currency,
    }).format(amount)
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando cuenta bancaria...</p>
        </div>
      </div>
    )
  }

  if (error && !cuenta) {
    return (
      <div className="dashboard-container">
        <div className="activity-section">
          <div className="activity-card">
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
            <button
              onClick={() => router.back()}
              className="mt-4 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Volver
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2"
          >
            <ArrowLeft size={20} />
            Volver
          </button>
          <h1 className="dashboard-title">Editar Cuenta Bancaria</h1>
          <p className="dashboard-subtitle">Actualiza la información de la cuenta bancaria</p>
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

          {/* Info Alert */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-blue-900 mb-1">
                  Información de la Cuenta
                </h4>
                <div className="text-sm text-blue-800 space-y-1">
                  <p><strong>Moneda:</strong> {cuenta?.moneda}</p>
                  <p><strong>Saldo Actual:</strong> {formatCurrency(cuenta?.saldo || 0, cuenta?.moneda)}</p>
                  <p className="text-xs text-blue-700 mt-2">
                    Nota: El saldo no se puede modificar directamente. Se actualiza automáticamente mediante movimientos bancarios.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
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
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej: Cuenta Operaciones BCP"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
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
                    onChange={(e) => setBanco(e.target.value)}
                    placeholder="Ej: Banco de Crédito del Perú"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
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
                    onChange={(e) => setNumeroCuenta(e.target.value)}
                    placeholder="Ej: 191-1234567-0-89"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
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
                onClick={() => router.back()}
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
                    Guardar Cambios
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

