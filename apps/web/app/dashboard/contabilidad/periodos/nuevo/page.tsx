'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, ArrowLeft, Save, AlertCircle } from 'lucide-react'
import { useApi } from '@/hooks/use-api'

export default function NuevoPeriodoPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    anio: new Date().getFullYear(),
    mes: new Date().getMonth() + 1
  })
  const { apiCall } = useApi<any>({ retries: 2, timeoutMs: 12000, showErrorToast: false })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await apiCall('/contabilidad/periodos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (response?.success === false) {
        throw new Error(response.message || 'Error al crear el período')
      }

      router.push('/dashboard/contabilidad/periodos')
    } catch (err: any) {
      console.error('Error creating período:', err)
      setError(err.message || 'Error al crear el período contable')
    } finally {
      setLoading(false)
    }
  }

  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ]

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i)

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <button
            onClick={() => router.back()} className="inline-flex items-center gap-2 py-2 px-4 bg-[#f3f4f6] text-gray-700 border-0 rounded-2 cursor-pointer text-[0.875rem] font-semibold mb-4 transition"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#e5e7eb'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#f3f4f6'
            }}
          >
            <ArrowLeft size={16} />
            Volver
          </button>
          <h1 className="dashboard-title">Crear Período Contable</h1>
          <p className="dashboard-subtitle">
            Crea un nuevo período contable para registrar operaciones
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-3 shadow p-8 max-w-[600px]">
        {error && (
          <div className="p-4 bg-[#fee2e2] border rounded-2 mb-6 flex items-start gap-3">
            <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" />
            <p className="m-0 text-red-800 text-[0.875rem]">
              {error}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Año */}
          <div className="mb-6">
            <label
              htmlFor="anio" className="block mb-2 text-[0.875rem] font-semibold text-gray-700"
            >
              Año <span className="text-red-600">*</span>
            </label>
            <select
              id="anio"
              value={formData.anio}
              onChange={(e) => setFormData({ ...formData, anio: parseInt(e.target.value) })}
              required
              disabled={loading} className="w-[100%] p-3 border rounded-2 text-[0.875rem] text-gray-800 transition"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          {/* Mes */}
          <div className="mb-8">
            <label
              htmlFor="mes" className="block mb-2 text-[0.875rem] font-semibold text-gray-700"
            >
              Mes <span className="text-red-600">*</span>
            </label>
            <select
              id="mes"
              value={formData.mes}
              onChange={(e) => setFormData({ ...formData, mes: parseInt(e.target.value) })}
              required
              disabled={loading} className="w-[100%] p-3 border rounded-2 text-[0.875rem] text-gray-800 transition"
            >
              {meses.map((mes, index) => (
                <option key={index + 1} value={index + 1}>
                  {mes}
                </option>
              ))}
            </select>
          </div>

          {/* Info Box */}
          <div className="p-4 bg-[#eff6ff] border rounded-2 mb-8">
            <p className="m-0 text-[0.875rem] text-[#1e40af] leading-6">
              <strong>Nota:</strong> El período se creará en estado <strong>ABIERTO</strong>, 
              permitiendo el registro de asientos contables. Podrás cerrarlo más tarde desde 
              la lista de períodos.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-4 justify-end">
            <button
              type="button"
              onClick={() => router.back()}
              disabled={loading} className="py-3 px-6 bg-[#f3f4f6] text-gray-700 border rounded-2 text-[0.875rem] font-semibold transition"
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = '#e5e7eb'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f3f4f6'
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading} className="flex items-center gap-2 py-3 px-6 text-white border-0 rounded-2 text-[0.875rem] font-semibold transition"
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = '#2563eb'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(59, 130, 246, 0.4)'
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = '#3b82f6'
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'
                }
              }}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 rounded-full" />
                  Creando...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Crear Período
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
