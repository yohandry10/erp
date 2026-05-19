'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { Building2, ArrowLeft, Save, AlertCircle } from 'lucide-react'

interface CentroCosto {
  id: string
  tenant_id: string
  codigo: string
  nombre: string
  descripcion?: string
  activo: boolean
  created_at: string
  updated_at: string
}

export default function EditarCentroCostoPage() {
  const router = useRouter()
  const params = useParams()
  const { get, put } = useApi()
  const centroId = params.id as string | undefined
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [centro, setCentro] = useState<CentroCosto | null>(null)
  
  const [formData, setFormData] = useState({
    codigo: '',
    nombre: '',
    descripcion: '',
    activo: true
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const loadCentroCosto = useCallback(async () => {
    if (!centroId) return

    try {
      setLoading(true)
      setError(null)

      const response = await get(`/api/contabilidad/centros-costo/${centroId}`)

      if (response?.success && response.data) {
        setCentro(response.data)
        setFormData({
          codigo: response.data.codigo,
          nombre: response.data.nombre,
          descripcion: response.data.descripcion || '',
          activo: response.data.activo
        })
      } else {
        setError('No se pudo cargar el centro de costo')
      }
    } catch (err: any) {
      console.error('Error loading centro de costo:', err)
      setError(err.message || 'Error al cargar el centro de costo')
    } finally {
      setLoading(false)
    }
  }, [centroId, get])

  useEffect(() => {
    loadCentroCosto()
  }, [loadCentroCosto])

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
      setSaving(true)
      setError(null)

      const response = await put(`/api/contabilidad/centros-costo/${centroId}`, {
        codigo: formData.codigo.trim(),
        nombre: formData.nombre.trim(),
        descripcion: formData.descripcion.trim() || undefined,
        activo: formData.activo
      })

      if (response?.success) {
        router.push('/dashboard/contabilidad/centros-costo')
      } else {
        setError(response?.message || 'Error al actualizar el centro de costo')
      }
    } catch (err: any) {
      console.error('Error updating centro de costo:', err)
      setError(err.message || 'Error al actualizar el centro de costo')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando centro de costo...</p>
        </div>
      </div>
    )
  }

  if (error && !centro) {
    return (
      <div className="dashboard-container">
        <div className="p-8 bg-[var(--red-50)] rounded-2 flex items-center gap-3">
          <AlertCircle size={24} className="text-[var(--red-600)]" />
          <div>
            <p className="text-4 font-semibold text-[var(--red-700)] m-0">
              Error al cargar el centro de costo
            </p>
            <p className="text-[0.875rem] text-[var(--red-600)] mt-1">
              {error}
            </p>
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
          <div className="flex items-center gap-4 mb-2">
            <button
              onClick={() => router.push('/dashboard/contabilidad/centros-costo')} className="w-12 h-12 rounded-3 bg-[var(--primary-100)] flex items-center justify-center text-[var(--primary-600)] border-0 cursor-pointer"
            >
              <ArrowLeft size={24} />
            </button>
            <div className="w-12 h-12 rounded-3 bg-[var(--primary-100)] flex items-center justify-center text-[var(--primary-600)]">
              <Building2 size={24} />
            </div>
            <h1 className="dashboard-title">Editar Centro de Costo</h1>
          </div>
          <p className="dashboard-subtitle">
            Modifique la información del centro de costo
          </p>
        </div>
      </div>

      {/* Formulario */}
      <div className="activity-card">
        <form onSubmit={handleSubmit}>
          {error && (
            <div className="p-4 bg-[var(--red-50)] rounded-2 mb-6 flex items-center gap-3">
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
                placeholder="Ej: CC-001" className="w-[100%] p-3 rounded-2 text-[0.875rem]"
                disabled={saving}
              />
              {errors.codigo && (
                <p className="text-3 text-[var(--red-600)] mt-1">
                  {errors.codigo}
                </p>
              )}
              <p className="text-3 text-[var(--primary-500)] mt-1">
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
                placeholder="Ej: Administración" className="w-[100%] p-3 rounded-2 text-[0.875rem]"
                disabled={saving}
              />
              {errors.nombre && (
                <p className="text-3 text-[var(--red-600)] mt-1">
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
                rows={4} className="w-[100%] p-3 border rounded-2 text-[0.875rem]"
                disabled={saving}
              />
            </div>

            {/* Estado */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.activo}
                  onChange={(e) => setFormData({ ...formData, activo: e.target.checked })} className="w-[18px] h-[18px] cursor-pointer"
                  disabled={saving}
                />
                <span className="text-[0.875rem] font-semibold text-[var(--primary-700)]">
                  Centro de costo activo
                </span>
              </label>
              <p className="text-3 text-[var(--primary-500)] mt-1 ml-[1.625rem]">
                Los centros de costo inactivos no se pueden asignar a nuevos asientos
              </p>
            </div>
          </div>

          {/* Botones */}
          <div className="flex gap-4 justify-end mt-8 pt-6 border-t">
            <button
              type="button"
              onClick={() => router.push('/dashboard/contabilidad/centros-costo')} className="py-3 px-6 bg-white text-[var(--primary-700)] border rounded-2 text-[0.875rem] font-semibold cursor-pointer"
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="primary-btn py-3 px-6"
              disabled={saving}
            >
              {saving ? (
                <>
                  <div className="loading-spinner w-4 h-4"></div>
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
  )
}
