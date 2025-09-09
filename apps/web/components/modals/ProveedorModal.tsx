'use client'

import { useState, useEffect } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

interface Proveedor {
  id?: number | string
  ruc?: string
  razon_social?: string
  nombre?: string
  nombre_comercial?: string
  direccion?: string
  telefono?: string
  email?: string
  contacto?: string
  condiciones_pago?: string
}

interface ProveedorModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  proveedor?: Proveedor
}

/** Todos los campos del formulario son string para simplificar el tipado */
type FormData = {
  ruc: string
  razon_social: string
  nombre_comercial: string
  direccion: string
  telefono: string
  email: string
  contacto: string
  condiciones_pago: string
}

/** Errores: clave = campo del formulario, valor = mensaje o undefined (sin error) */
type FormErrors = Partial<Record<keyof FormData, string | undefined>>

const INITIAL_FORM: FormData = {
  ruc: '',
  razon_social: '',
  nombre_comercial: '',
  direccion: '',
  telefono: '',
  email: '',
  contacto: '',
  condiciones_pago: 'CONTADO',
}

export default function ProveedorModal({
  isOpen,
  onClose,
  onSuccess,
  proveedor,
}: ProveedorModalProps) {
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM)
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})

  // Cargar datos del proveedor si se está editando
  useEffect(() => {
    if (!isOpen) return

    if (proveedor) {
      setFormData({
        ruc: proveedor.ruc ?? '',
        razon_social: proveedor.razon_social ?? proveedor.nombre ?? '',
        nombre_comercial: proveedor.nombre_comercial ?? '',
        direccion: proveedor.direccion ?? '',
        telefono: proveedor.telefono ?? '',
        email: proveedor.email ?? '',
        contacto: proveedor.contacto ?? '',
        condiciones_pago: proveedor.condiciones_pago ?? 'CONTADO',
      })
    } else {
      resetForm()
    }
    setErrors({})
  }, [isOpen, proveedor])

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.ruc.trim()) {
      newErrors.ruc = 'RUC es obligatorio'
    } else if (!/^\d{11}$/.test(formData.ruc)) {
      newErrors.ruc = 'RUC debe tener 11 dígitos'
    }

    if (!formData.razon_social.trim()) {
      newErrors.razon_social = 'Razón Social es obligatoria'
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email no válido'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    setIsLoading(true)
    try {
      const url = proveedor
        ? `${API_URL}/api/compras/proveedores/${proveedor.id}`
        : `${API_URL}/api/compras/proveedores`

      const method = proveedor ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const result = await response.json()

      if (result?.success) {
        onSuccess()
        onClose()
        resetForm()
      } else {
        alert('Error: ' + (result?.error || 'Error al procesar el proveedor'))
      }
    } catch (error) {
      console.error('Error submitting proveedor:', error)
      alert('Error al procesar el proveedor')
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setFormData(INITIAL_FORM)
    setErrors({})
  }

  /** Update helper tipado: evita errores con prev en setState */
  const handleInputChange = <K extends keyof FormData>(field: K, value: string) => {
    // Actualiza el valor del campo
    setFormData(prev => ({ ...prev, [field]: value } as FormData))
    // Limpia el error del campo si lo hubiera
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '8px',
          padding: '2rem',
          width: '90%',
          maxWidth: '600px',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>
            {proveedor ? 'Editar Proveedor' : 'Nuevo Proveedor'}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280',
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Información fiscal */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>
              Información Fiscal
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '1rem',
              }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '0.5rem',
                  }}
                >
                  RUC *
                </label>
                <input
                  type="text"
                  value={formData.ruc}
                  onChange={(e) => handleInputChange('ruc', e.target.value)}
                  maxLength={11}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: `1px solid ${errors.ruc ? '#ef4444' : '#d1d5db'}`,
                    borderRadius: '0.375rem',
                    backgroundColor: 'white',
                  }}
                  placeholder="Ingrese RUC (11 dígitos)"
                />
                {errors.ruc && (
                  <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.ruc}</p>
                )}
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '0.5rem',
                  }}
                >
                  Razón Social *
                </label>
                <input
                  type="text"
                  value={formData.razon_social}
                  onChange={(e) => handleInputChange('razon_social', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: `1px solid ${errors.razon_social ? '#ef4444' : '#d1d5db'}`,
                    borderRadius: '0.375rem',
                    backgroundColor: 'white',
                  }}
                  placeholder="Razón social completa"
                />
                {errors.razon_social && (
                  <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.razon_social}</p>
                )}
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '0.5rem',
                  }}
                >
                  Nombre Comercial
                </label>
                <input
                  type="text"
                  value={formData.nombre_comercial}
                  onChange={(e) => handleInputChange('nombre_comercial', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    backgroundColor: 'white',
                  }}
                  placeholder="Nombre comercial (opcional)"
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '0.5rem',
                  }}
                >
                  Condiciones de Pago
                </label>
                <select
                  value={formData.condiciones_pago}
                  onChange={(e) => handleInputChange('condiciones_pago', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    backgroundColor: 'white',
                  }}
                >
                  <option value="CONTADO">Contado</option>
                  <option value="CREDITO_15">Crédito 15 días</option>
                  <option value="CREDITO_30">Crédito 30 días</option>
                  <option value="CREDITO_45">Crédito 45 días</option>
                  <option value="CREDITO_60">Crédito 60 días</option>
                </select>
              </div>
            </div>
          </div>

          {/* Información de contacto */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>
              Información de Contacto
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '1rem',
              }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '0.5rem',
                  }}
                >
                  Teléfono
                </label>
                <input
                  type="text"
                  value={formData.telefono}
                  onChange={(e) => handleInputChange('telefono', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    backgroundColor: 'white',
                  }}
                  placeholder="Teléfono principal"
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '0.5rem',
                  }}
                >
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: `1px solid ${errors.email ? '#ef4444' : '#d1d5db'}`,
                    borderRadius: '0.375rem',
                    backgroundColor: 'white',
                  }}
                  placeholder="email@ejemplo.com"
                />
                {errors.email && (
                  <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.email}</p>
                )}
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '0.5rem',
                  }}
                >
                  Persona de Contacto
                </label>
                <input
                  type="text"
                  value={formData.contacto}
                  onChange={(e) => handleInputChange('contacto', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    backgroundColor: 'white',
                  }}
                  placeholder="Nombre del contacto"
                />
              </div>
            </div>
          </div>

          {/* Dirección */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#374151',
                marginBottom: '0.5rem',
              }}
            >
              Dirección
            </label>
            <textarea
              value={formData.direccion}
              onChange={(e) => handleInputChange('direccion', e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                backgroundColor: 'white',
                resize: 'vertical',
              }}
              placeholder="Dirección completa del proveedor"
            />
          </div>

          {/* Botones */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '1rem',
              paddingTop: '1rem',
              borderTop: '1px solid #e5e7eb',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                backgroundColor: 'white',
                color: '#374151',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              style={{
                padding: '0.5rem 1rem',
                border: 'none',
                borderRadius: '0.375rem',
                backgroundColor: isLoading ? '#9ca3af' : '#3b82f6',
                color: 'white',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontWeight: 500,
              }}
            >
              {isLoading ? 'Guardando...' : proveedor ? 'Actualizar' : 'Crear Proveedor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
