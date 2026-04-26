'use client'

import { useState, useEffect } from 'react'
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

  useEffect(() => {
    loadCentroCosto()
  }, [params.id])

  const loadCentroCosto = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await get(`/api/contabilidad/centros-costo/${params.id}`)

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
  }

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

      const response = await put(`/api/contabilidad/centros-costo/${params.id}`, {
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
        <div style={{ 
          padding: '2rem', 
          background: 'var(--red-50)', 
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <AlertCircle size={24} style={{ color: 'var(--red-600)' }} />
          <div>
            <p style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--red-700)', margin: 0 }}>
              Error al cargar el centro de costo
            </p>
            <p style={{ fontSize: '0.875rem', color: 'var(--red-600)', marginTop: '0.25rem' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
            <button
              onClick={() => router.push('/dashboard/contabilidad/centros-costo')}
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'var(--primary-100)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary-600)',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <ArrowLeft size={24} />
            </button>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'var(--primary-100)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary-600)'
            }}>
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
            <div style={{ 
              padding: '1rem', 
              background: 'var(--red-50)', 
              borderRadius: '8px',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              <AlertCircle size={20} style={{ color: 'var(--red-600)' }} />
              <p style={{ fontSize: '0.875rem', color: 'var(--red-700)', margin: 0 }}>
                {error}
              </p>
            </div>
          )}

          <div style={{ display: 'grid', gap: '1.5rem' }}>
            {/* Código */}
            <div>
              <label style={{ 
                display: 'block', 
                fontSize: '0.875rem', 
                fontWeight: '600', 
                marginBottom: '0.5rem',
                color: 'var(--primary-700)'
              }}>
                Código <span style={{ color: 'var(--red-600)' }}>*</span>
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
                placeholder="Ej: CC-001"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: `1px solid ${errors.codigo ? 'var(--red-500)' : 'var(--primary-300)'}`,
                  borderRadius: '8px',
                  fontSize: '0.875rem'
                }}
                disabled={saving}
              />
              {errors.codigo && (
                <p style={{ fontSize: '0.75rem', color: 'var(--red-600)', marginTop: '0.25rem' }}>
                  {errors.codigo}
                </p>
              )}
              <p style={{ fontSize: '0.75rem', color: 'var(--primary-500)', marginTop: '0.25rem' }}>
                Código único para identificar el centro de costo
              </p>
            </div>

            {/* Nombre */}
            <div>
              <label style={{ 
                display: 'block', 
                fontSize: '0.875rem', 
                fontWeight: '600', 
                marginBottom: '0.5rem',
                color: 'var(--primary-700)'
              }}>
                Nombre <span style={{ color: 'var(--red-600)' }}>*</span>
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
                placeholder="Ej: Administración"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: `1px solid ${errors.nombre ? 'var(--red-500)' : 'var(--primary-300)'}`,
                  borderRadius: '8px',
                  fontSize: '0.875rem'
                }}
                disabled={saving}
              />
              {errors.nombre && (
                <p style={{ fontSize: '0.75rem', color: 'var(--red-600)', marginTop: '0.25rem' }}>
                  {errors.nombre}
                </p>
              )}
            </div>

            {/* Descripción */}
            <div>
              <label style={{ 
                display: 'block', 
                fontSize: '0.875rem', 
                fontWeight: '600', 
                marginBottom: '0.5rem',
                color: 'var(--primary-700)'
              }}>
                Descripción
              </label>
              <textarea
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                placeholder="Descripción del centro de costo (opcional)"
                rows={4}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid var(--primary-300)',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  resize: 'vertical'
                }}
                disabled={saving}
              />
            </div>

            {/* Estado */}
            <div>
              <label style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={formData.activo}
                  onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                  style={{
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer'
                  }}
                  disabled={saving}
                />
                <span style={{ 
                  fontSize: '0.875rem', 
                  fontWeight: '600',
                  color: 'var(--primary-700)'
                }}>
                  Centro de costo activo
                </span>
              </label>
              <p style={{ fontSize: '0.75rem', color: 'var(--primary-500)', marginTop: '0.25rem', marginLeft: '1.625rem' }}>
                Los centros de costo inactivos no se pueden asignar a nuevos asientos
              </p>
            </div>
          </div>

          {/* Botones */}
          <div style={{ 
            display: 'flex', 
            gap: '1rem', 
            justifyContent: 'flex-end',
            marginTop: '2rem',
            paddingTop: '1.5rem',
            borderTop: '1px solid var(--primary-200)'
          }}>
            <button
              type="button"
              onClick={() => router.push('/dashboard/contabilidad/centros-costo')}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'white',
                color: 'var(--primary-700)',
                border: '1px solid var(--primary-300)',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="primary-btn"
              style={{ padding: '0.75rem 1.5rem' }}
              disabled={saving}
            >
              {saving ? (
                <>
                  <div className="loading-spinner" style={{ width: '16px', height: '16px' }}></div>
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
