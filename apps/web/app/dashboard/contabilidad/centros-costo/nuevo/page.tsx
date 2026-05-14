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
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
            <button
              aria-label="Volver a centros de costo"
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
            <h1 className="dashboard-title">Nuevo Centro de Costo</h1>
          </div>
          <p className="dashboard-subtitle">
            Complete la información para crear un nuevo centro de costo
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
                disabled={loading}
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
                disabled={loading}
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
                disabled={loading}
              />
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
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="primary-btn"
              style={{ padding: '0.75rem 1.5rem' }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="loading-spinner" style={{ width: '16px', height: '16px' }}></div>
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
