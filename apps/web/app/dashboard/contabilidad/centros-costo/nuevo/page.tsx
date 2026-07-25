'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { Building2, ArrowLeft, Save, AlertCircle } from 'lucide-react'

export default function NuevoCentroCostoPage() {
  const router = useRouter()
  const { post } = useApi()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    codigo: '',
    nombre: '',
    descripcion: ''
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.codigo.trim()) {
      newErrors.codigo = 'El código es requerido'
    }

    if (!formData.nombre.trim()) {
      newErrors.nombre = 'El nombre es requerido'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    try {
      setLoading(true)
      setError(null)

      const response = await post('/api/contabilidad/centros-costo', {
        codigo: formData.codigo.trim(),
        nombre: formData.nombre.trim(),
        descripcion: formData.descripcion.trim() || undefined
      })

      if (response?.success) {
        router.push('/dashboard/contabilidad/centros-costo')
      } else {
        setError(response?.message || 'Error al crear el centro de costo')
      }
    } catch (err: any) {
      console.error('Error creating centro de costo:', err)
      setError(err.message || 'Error al crear el centro de costo')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <button
              aria-label="Volver a centros de costo"
              onClick={() => router.push('/dashboard/contabilidad/centros-costo')} className="w-12 h-12 rounded-xl bg-[var(--primary-100)] flex items-center justify-center text-[var(--primary-600)] border-0 cursor-pointer"
            >
              <ArrowLeft size={24} />
            </button>
            <div className="w-12 h-12 rounded-xl bg-[var(--primary-100)] flex items-center justify-center text-[var(--primary-600)]">
              <Building2 size={24} />
            </div>
            <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Nuevo Centro de Costo</h1>
          </div>
          <p className="mt-2 text-base text-muted-foreground">
            Complete la información para crear un nuevo centro de costo
          </p>
        </div>
      </div>

      {/* Formulario */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
        <form onSubmit={handleSubmit}>
          {error && (
            <div className="p-4 bg-[var(--red-50)] rounded-lg mb-6 flex items-center gap-3">
              <AlertCircle size={20} className="text-[var(--red-600)]" />
              <p className="text-[0.875rem] text-[var(--red-700)] m-0">
                {error}
              </p>
            </div>
          )}

          <div className="grid gap-6">
            {/* Código */}
            <div>
              <label className="block text-[0.875rem] font-semibold mb-2 text-[var(--primary-700)]">
                Código <span className="text-[var(--red-600)]">*</span>
              </label>
              <input
                type="text"
                value={formData.codigo}
                onChange={(e) => {
                  setFormData({ ...formData, codigo: e.target.value })
                  if (errors.codigo) {
                    setErrors({ ...errors, codigo: '' })
                  }
                }}
                placeholder="Ej: CC-001" className="w-[100%] p-3 rounded-lg text-[0.875rem]"
                disabled={loading}
              />
              {errors.codigo && (
                <p className="text-xs text-[var(--red-600)] mt-1">
                  {errors.codigo}
                </p>
              )}
              <p className="text-xs text-[var(--primary-500)] mt-1">
                Código único para identificar el centro de costo
              </p>
            </div>

            {/* Nombre */}
            <div>
              <label className="block text-[0.875rem] font-semibold mb-2 text-[var(--primary-700)]">
                Nombre <span className="text-[var(--red-600)]">*</span>
              </label>
              <input
                type="text"
                value={formData.nombre}
                onChange={(e) => {
                  setFormData({ ...formData, nombre: e.target.value })
                  if (errors.nombre) {
                    setErrors({ ...errors, nombre: '' })
                  }
                }}
                placeholder="Ej: Administración" className="w-[100%] p-3 rounded-lg text-[0.875rem]"
                disabled={loading}
              />
              {errors.nombre && (
                <p className="text-xs text-[var(--red-600)] mt-1">
                  {errors.nombre}
                </p>
              )}
            </div>

            {/* Descripción */}
            <div>
              <label className="block text-[0.875rem] font-semibold mb-2 text-[var(--primary-700)]">
                Descripción
              </label>
              <textarea
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                placeholder="Descripción del centro de costo (opcional)"
                rows={4} className="w-[100%] p-3 border rounded-lg text-[0.875rem]"
                disabled={loading}
              />
            </div>
          </div>

          {/* Botones */}
          <div className="flex gap-4 justify-end mt-8 pt-6 border-t">
            <button
              type="button"
              onClick={() => router.push('/dashboard/contabilidad/centros-costo')} className="py-3 px-6 bg-card text-[var(--primary-700)] border rounded-lg text-[0.875rem] font-semibold cursor-pointer"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="primary-btn py-3 px-6"
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary w-4 h-4"></div>
                  Guardando...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Crear Centro de Costo
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
