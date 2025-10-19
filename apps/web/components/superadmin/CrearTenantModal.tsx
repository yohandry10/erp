'use client'

import { useState } from 'react'
import { useApiCall } from '@/hooks/use-api'

interface CrearTenantModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function CrearTenantModal({ isOpen, onClose, onSuccess }: CrearTenantModalProps) {
  const [formData, setFormData] = useState({
    ruc: '',
    razon_social: '',
    nombre_comercial: '',
    direccion: '',
    email: '',
    telefono: '',
    tipo_empresa: 'MICRO',
    usar_flujo_logistica: false,
    gre_obligatorio: false,
    gre_automatico_habilitado: false,
    umbral_gre_automatico: 700
  })

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const api = useApiCall()

  const handleTipoEmpresaChange = (tipo: string) => {
    // Precargar configuración según tipo de empresa
    const usarFlujoLogistica = tipo === 'MEDIANA' || tipo === 'GRANDE'
    
    setFormData(prev => ({
      ...prev,
      tipo_empresa: tipo,
      usar_flujo_logistica: usarFlujoLogistica
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    
    try {
      console.log('🏢 Creando tenant:', formData)
      const result = await api.post('/api/superadmin/tenants', formData)
      
      console.log('✅ Respuesta del servidor:', result)
      
      if (result && result.success) {
        console.log('✅ Tenant creado exitosamente:', result.data)
        
        // Mostrar toast de éxito
        if (typeof window !== 'undefined') {
          const successToast = document.createElement('div')
          successToast.innerHTML = `
            <div style="
              position: fixed;
              top: 20px;
              right: 20px;
              background: #10b981;
              color: white;
              padding: 1rem 1.5rem;
              border-radius: 8px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
              z-index: 9999;
              font-weight: 600;
              animation: slideIn 0.3s ease-out;
            ">
              ✅ ${result.message || 'Empresa creada exitosamente'}
            </div>
            <style>
              @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
              }
            </style>
          `
          document.body.appendChild(successToast)
          setTimeout(() => {
            document.body.removeChild(successToast)
          }, 3000)
        }
        
        onSuccess()
        onClose()
        // Reset form
        setFormData({
          ruc: '',
          razon_social: '',
          nombre_comercial: '',
          direccion: '',
          email: '',
          telefono: '',
          tipo_empresa: 'MICRO',
          usar_flujo_logistica: false,
          gre_obligatorio: false,
          gre_automatico_habilitado: false,
          umbral_gre_automatico: 700
        })
      } else {
        console.log('❌ Error en la respuesta:', result)
        setError(result?.message || 'Error al crear la empresa')
      }
    } catch (err: any) {
      console.error('❌ Error al crear tenant:', err)
      setError(err.message || 'Error al crear la empresa')
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked
      setFormData(prev => ({
        ...prev,
        [name]: checked
      }))
    } else if (name === 'tipo_empresa') {
      handleTipoEmpresaChange(value)
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }))
    }
  }

  if (!isOpen) return null

  console.log('🔵 CrearTenantModal RENDERIZADO - Modal está abierto')

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 999999
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        padding: '2rem',
        width: '90%',
        maxWidth: '800px',
        maxHeight: '90vh',
        overflow: 'auto',
        position: 'relative',
        zIndex: 1000000,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        opacity: 1
      } as React.CSSProperties}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#1f2937' }}>Nueva Empresa (Tenant)</h2>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
              Configura una nueva empresa en el sistema
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              color: '#6b7280',
              opacity: isLoading ? 0.5 : 1
            }}
          >
            ×
          </button>
        </div>

        {error && (
          <div style={{
            backgroundColor: '#fee2e2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            padding: '0.75rem',
            borderRadius: '6px',
            marginBottom: '1rem',
            fontSize: '0.9rem'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Información Básica */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
              Información Básica
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                  RUC *
                </label>
                <input
                  type="text"
                  name="ruc"
                  value={formData.ruc}
                  onChange={handleChange}
                  required
                  maxLength={11}
                  pattern="[0-9]{11}"
                  placeholder="20123456789"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                  Razón Social *
                </label>
                <input
                  type="text"
                  name="razon_social"
                  value={formData.razon_social}
                  onChange={handleChange}
                  required
                  placeholder="EMPRESA EJEMPLO S.A.C."
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                  Nombre Comercial
                </label>
                <input
                  type="text"
                  name="nombre_comercial"
                  value={formData.nombre_comercial}
                  onChange={handleChange}
                  placeholder="Nombre comercial (opcional)"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                  Dirección *
                </label>
                <input
                  type="text"
                  name="direccion"
                  value={formData.direccion}
                  onChange={handleChange}
                  required
                  placeholder="Av. Principal 123, Lima"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  placeholder="contacto@empresa.com"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                  Teléfono
                </label>
                <input
                  type="tel"
                  name="telefono"
                  value={formData.telefono}
                  onChange={handleChange}
                  placeholder="999999999"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Configuración de Ventas */}
          <div style={{ marginBottom: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
              Configuración de Ventas
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                  Tipo de Empresa *
                </label>
                <select
                  name="tipo_empresa"
                  value={formData.tipo_empresa}
                  onChange={handleChange}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}
                >
                  <option value="MICRO">Microempresa</option>
                  <option value="PEQUEÑA">Pequeña Empresa</option>
                  <option value="MEDIANA">Mediana Empresa</option>
                  <option value="GRANDE">Gran Empresa</option>
                </select>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  {formData.tipo_empresa === 'MICRO' || formData.tipo_empresa === 'PEQUEÑA' 
                    ? '💡 Flujo simplificado (sin logística)' 
                    : '💡 Flujo completo (con logística)'}
                </p>
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: '#f9fafb' }}>
                  <input
                    type="checkbox"
                    name="usar_flujo_logistica"
                    checked={formData.usar_flujo_logistica}
                    onChange={handleChange}
                    style={{ marginRight: '0.5rem', width: '18px', height: '18px' }}
                  />
                  <span style={{ fontWeight: '600', color: '#374151' }}>
                    Usar Flujo Logístico
                  </span>
                </label>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Incluye preparación y despacho en almacén
                </p>
              </div>
            </div>
          </div>

          {/* Configuración de GRE */}
          <div style={{ marginBottom: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
              Configuración de Guías de Remisión (GRE)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: '#f9fafb' }}>
                  <input
                    type="checkbox"
                    name="gre_obligatorio"
                    checked={formData.gre_obligatorio}
                    onChange={handleChange}
                    style={{ marginRight: '0.5rem', width: '18px', height: '18px' }}
                  />
                  <span style={{ fontWeight: '600', color: '#374151' }}>
                    GRE Obligatorio
                  </span>
                </label>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Exigir GRE para todas las ventas
                </p>
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: '#f9fafb' }}>
                  <input
                    type="checkbox"
                    name="gre_automatico_habilitado"
                    checked={formData.gre_automatico_habilitado}
                    onChange={handleChange}
                    style={{ marginRight: '0.5rem', width: '18px', height: '18px' }}
                  />
                  <span style={{ fontWeight: '600', color: '#374151' }}>
                    Sugerencia Automática de GRE
                  </span>
                </label>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Sugerir GRE según monto de venta
                </p>
              </div>

              {formData.gre_automatico_habilitado && (
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                    Umbral para Sugerencia (S/)
                  </label>
                  <input
                    type="number"
                    name="umbral_gre_automatico"
                    value={formData.umbral_gre_automatico}
                    onChange={handleChange}
                    min="0"
                    step="0.01"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.9rem'
                    }}
                  />
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    Sugerir GRE si el monto supera este valor
                  </p>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              style={{
                padding: '0.75rem 1.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                backgroundColor: 'white',
                color: '#374151',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                opacity: isLoading ? 0.5 : 1
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: isLoading ? '#9ca3af' : '#3b82f6',
                color: 'white',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontWeight: '600'
              }}
            >
              {isLoading ? 'Creando...' : 'Crear Empresa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
