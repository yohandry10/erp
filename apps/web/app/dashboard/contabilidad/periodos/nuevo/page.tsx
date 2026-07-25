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
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <button
            onClick={() => router.back()} className="inline-flex items-center gap-2 py-2 px-4 bg-muted text-foreground/85 border-0 rounded-lg cursor-pointer text-[0.875rem] font-semibold mb-4 transition"
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
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Crear Período Contable</h1>
          <p className="mt-2 text-base text-muted-foreground">
            Crea un nuevo período contable para registrar operaciones
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-card rounded-xl shadow p-8 max-w-[600px]">
        {error && (
          <div className="p-4 bg-[#fee2e2] border rounded-lg mb-6 flex items-start gap-3">
            <AlertCircle size={20} className="text-destructive shrink-0 mt-0.5" />
            <p className="m-0 text-destructive text-[0.875rem]">
              {error}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Año */}
          <div className="mb-6">
            <label
              htmlFor="anio" className="block mb-2 text-[0.875rem] font-semibold text-foreground/85"
            >
              Año <span className="text-destructive">*</span>
            </label>
            <select
              id="anio"
              value={formData.anio}
              onChange={(e) => setFormData({ ...formData, anio: parseInt(e.target.value) })}
              required
              disabled={loading} className="w-[100%] p-3 border rounded-lg text-[0.875rem] text-foreground transition"
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
              htmlFor="mes" className="block mb-2 text-[0.875rem] font-semibold text-foreground/85"
            >
              Mes <span className="text-destructive">*</span>
            </label>
            <select
              id="mes"
              value={formData.mes}
              onChange={(e) => setFormData({ ...formData, mes: parseInt(e.target.value) })}
              required
              disabled={loading} className="w-[100%] p-3 border rounded-lg text-[0.875rem] text-foreground transition"
            >
              {meses.map((mes, index) => (
                <option key={index + 1} value={index + 1}>
                  {mes}
                </option>
              ))}
            </select>
          </div>

          {/* Info Box */}
          <div className="p-4 bg-muted border rounded-lg mb-8">
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
              disabled={loading} className="py-3 px-6 bg-muted text-foreground/85 border rounded-lg text-[0.875rem] font-semibold transition"
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
              disabled={loading} className="flex items-center gap-2 py-3 px-6 text-white border-0 rounded-lg text-[0.875rem] font-semibold transition"
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
