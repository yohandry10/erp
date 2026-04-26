'use client'

import React, { useState } from 'react'

interface EmpleadoModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: any) => void
  departamentos: any[]
}

const EmpleadoModal: React.FC<EmpleadoModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  departamentos
}) => {
  const [formData, setFormData] = useState({
    nombres: '',
    apellidos: '',
    tipo_documento: 'DNI',
    numero_documento: '',
    fecha_nacimiento: '',
    direccion: '',
    telefono: '',
    email: '',
    puesto: '',
    id_departamento: '',
    fecha_ingreso: ''
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
    setFormData({
      nombres: '',
      apellidos: '',
      tipo_documento: 'DNI',
      numero_documento: '',
      fecha_nacimiento: '',
      direccion: '',
      telefono: '',
      email: '',
      puesto: '',
      id_departamento: '',
      fecha_ingreso: ''
    })
  }

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.8)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      zIndex: 1000
    }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
        backdropFilter: 'blur(20px) saturate(180%)',
        borderRadius: 'var(--border-radius-xl)',
        padding: '2.5rem',
        width: '100%',
        maxWidth: '700px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: 'var(--shadow-2xl)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        position: 'relative'
      }}>
        {/* Header del Modal */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
          paddingBottom: '1rem',
          borderBottom: '2px solid var(--primary-200)'
        }}>
          <h2 style={{
            fontSize: '2rem',
            fontWeight: '800',
            background: 'var(--gradient-primary)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            margin: 0
          }}>
            👤 Agregar Nuevo Empleado
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'var(--gradient-danger)',
              color: 'white',
              border: 'none',
              padding: '0.75rem',
              borderRadius: 'var(--border-radius)',
              cursor: 'pointer',
              fontSize: '1.2rem',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.1) rotate(90deg)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1) rotate(0deg)'
            }}
          >
            ✕
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '1.5rem',
            marginBottom: '2rem'
          }}>
            {/* Nombres */}
            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: 'var(--primary-700)'
              }}>
                Nombres *
              </label>
              <input
                type="text"
                value={formData.nombres}
                onChange={(e) => handleChange('nombres', e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  border: '2px solid var(--primary-200)',
                  borderRadius: 'var(--border-radius)',
                  fontSize: '1rem',
                  transition: 'all 0.3s ease',
                  backgroundColor: 'rgba(255, 255, 255, 0.8)'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--blue-500)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-200)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* Apellidos */}
            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: 'var(--primary-700)'
              }}>
                Apellidos *
              </label>
              <input
                type="text"
                value={formData.apellidos}
                onChange={(e) => handleChange('apellidos', e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  border: '2px solid var(--primary-200)',
                  borderRadius: 'var(--border-radius)',
                  fontSize: '1rem',
                  transition: 'all 0.3s ease',
                  backgroundColor: 'rgba(255, 255, 255, 0.8)'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--blue-500)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-200)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* Tipo de Documento */}
            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: 'var(--primary-700)'
              }}>
                Tipo de Documento
              </label>
              <select
                value={formData.tipo_documento}
                onChange={(e) => handleChange('tipo_documento', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  border: '2px solid var(--primary-200)',
                  borderRadius: 'var(--border-radius)',
                  fontSize: '1rem',
                  transition: 'all 0.3s ease',
                  backgroundColor: 'rgba(255, 255, 255, 0.8)'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--blue-500)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-200)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <option value="DNI">DNI</option>
                <option value="CE">Carnet de Extranjería</option>
                <option value="Pasaporte">Pasaporte</option>
              </select>
            </div>

            {/* Número de Documento */}
            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: 'var(--primary-700)'
              }}>
                Número de Documento *
              </label>
              <input
                type="text"
                value={formData.numero_documento}
                onChange={(e) => handleChange('numero_documento', e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  border: '2px solid var(--primary-200)',
                  borderRadius: 'var(--border-radius)',
                  fontSize: '1rem',
                  transition: 'all 0.3s ease',
                  backgroundColor: 'rgba(255, 255, 255, 0.8)'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--blue-500)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-200)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* Email */}
            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: 'var(--primary-700)'
              }}>
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  border: '2px solid var(--primary-200)',
                  borderRadius: 'var(--border-radius)',
                  fontSize: '1rem',
                  transition: 'all 0.3s ease',
                  backgroundColor: 'rgba(255, 255, 255, 0.8)'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--blue-500)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-200)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* Teléfono */}
            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: 'var(--primary-700)'
              }}>
                Teléfono
              </label>
              <input
                type="tel"
                value={formData.telefono}
                onChange={(e) => handleChange('telefono', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  border: '2px solid var(--primary-200)',
                  borderRadius: 'var(--border-radius)',
                  fontSize: '1rem',
                  transition: 'all 0.3s ease',
                  backgroundColor: 'rgba(255, 255, 255, 0.8)'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--blue-500)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-200)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* Puesto */}
            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: 'var(--primary-700)'
              }}>
                Puesto
              </label>
              <input
                type="text"
                value={formData.puesto}
                onChange={(e) => handleChange('puesto', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  border: '2px solid var(--primary-200)',
                  borderRadius: 'var(--border-radius)',
                  fontSize: '1rem',
                  transition: 'all 0.3s ease',
                  backgroundColor: 'rgba(255, 255, 255, 0.8)'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--blue-500)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-200)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* Departamento */}
            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: 'var(--primary-700)'
              }}>
                Departamento
              </label>
              <select
                value={formData.id_departamento}
                onChange={(e) => handleChange('id_departamento', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  border: '2px solid var(--primary-200)',
                  borderRadius: 'var(--border-radius)',
                  fontSize: '1rem',
                  transition: 'all 0.3s ease',
                  backgroundColor: 'rgba(255, 255, 255, 0.8)'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--blue-500)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-200)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <option value="">Seleccionar departamento</option>
                {departamentos.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Fecha de Nacimiento */}
            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: 'var(--primary-700)'
              }}>
                Fecha de Nacimiento
              </label>
              <input
                type="date"
                value={formData.fecha_nacimiento}
                onChange={(e) => handleChange('fecha_nacimiento', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  border: '2px solid var(--primary-200)',
                  borderRadius: 'var(--border-radius)',
                  fontSize: '1rem',
                  transition: 'all 0.3s ease',
                  backgroundColor: 'rgba(255, 255, 255, 0.8)'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--blue-500)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-200)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* Fecha de Ingreso */}
            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: 'var(--primary-700)'
              }}>
                Fecha de Ingreso
              </label>
              <input
                type="date"
                value={formData.fecha_ingreso}
                onChange={(e) => handleChange('fecha_ingreso', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  border: '2px solid var(--primary-200)',
                  borderRadius: 'var(--border-radius)',
                  fontSize: '1rem',
                  transition: 'all 0.3s ease',
                  backgroundColor: 'rgba(255, 255, 255, 0.8)'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--blue-500)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-200)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>
          </div>

          {/* Dirección (campo completo) */}
          <div style={{ marginBottom: '2rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: '600',
              color: 'var(--primary-700)'
            }}>
              Dirección
            </label>
            <input
              type="text"
              value={formData.direccion}
              onChange={(e) => handleChange('direccion', e.target.value)}
              placeholder="Dirección completa del empleado"
              style={{
                width: '100%',
                padding: '0.875rem',
                border: '2px solid var(--primary-200)',
                borderRadius: 'var(--border-radius)',
                fontSize: '1rem',
                transition: 'all 0.3s ease',
                backgroundColor: 'rgba(255, 255, 255, 0.8)'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--blue-500)'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--primary-200)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>

          {/* Botones */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '1rem',
            paddingTop: '1.5rem',
            borderTop: '2px solid var(--primary-200)'
          }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
            >
              💾 Guardar Empleado
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EmpleadoModal 