'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, ArrowLeft, Save, AlertCircle } from 'lucide-react'

export default function NuevoPeriodoPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    anio: new Date().getFullYear(),
    mes: new Date().getMonth() + 1
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/contabilidad/periodos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Error al crear el período')
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
            onClick={() => router.back()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              background: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '600',
              marginBottom: '1rem',
              transition: 'all 0.2s'
            }}
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
      <div style={{
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        padding: '2rem',
        maxWidth: '600px'
      }}>
        {error && (
          <div style={{
            padding: '1rem',
            background: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem'
          }}>
            <AlertCircle size={20} style={{ color: '#dc2626', flexShrink: 0, marginTop: '0.125rem' }} />
            <p style={{ margin: 0, color: '#991b1b', fontSize: '0.875rem' }}>
              {error}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Año */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="anio"
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: '600',
                color: '#374151'
              }}
            >
              Año <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <select
              id="anio"
              value={formData.anio}
              onChange={(e) => setFormData({ ...formData, anio: parseInt(e.target.value) })}
              required
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '0.875rem',
                color: '#1f2937',
                background: loading ? '#f9fafb' : 'white',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          {/* Mes */}
          <div style={{ marginBottom: '2rem' }}>
            <label
              htmlFor="mes"
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: '600',
                color: '#374151'
              }}
            >
              Mes <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <select
              id="mes"
              value={formData.mes}
              onChange={(e) => setFormData({ ...formData, mes: parseInt(e.target.value) })}
              required
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '0.875rem',
                color: '#1f2937',
                background: loading ? '#f9fafb' : 'white',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {meses.map((mes, index) => (
                <option key={index + 1} value={index + 1}>
                  {mes}
                </option>
              ))}
            </select>
          </div>

          {/* Info Box */}
          <div style={{
            padding: '1rem',
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '8px',
            marginBottom: '2rem'
          }}>
            <p style={{
              margin: 0,
              fontSize: '0.875rem',
              color: '#1e40af',
              lineHeight: '1.5'
            }}>
              <strong>Nota:</strong> El período se creará en estado <strong>ABIERTO</strong>, 
              permitiendo el registro de asientos contables. Podrás cerrarlo más tarde desde 
              la lista de períodos.
            </p>
          </div>

          {/* Actions */}
          <div style={{
            display: 'flex',
            gap: '1rem',
            justifyContent: 'flex-end'
          }}>
            <button
              type="button"
              onClick={() => router.back()}
              disabled={loading}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#f3f4f6',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '600',
                transition: 'all 0.2s',
                opacity: loading ? 0.5 : 1
              }}
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
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                background: loading ? '#9ca3af' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '600',
                transition: 'all 0.2s',
                boxShadow: loading ? 'none' : '0 1px 3px rgba(0,0,0,0.1)'
              }}
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
                  <div style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid white',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 0.6s linear infinite'
                  }} />
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

      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
