'use client'

import { useState, useEffect } from 'react'
import { useToast } from "@/components/ui/use-toast"

interface UsuarioModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  usuario?: any
  roles: any[]
}

export default function UsuarioModal({ isOpen, onClose, onSuccess, usuario, roles }: UsuarioModalProps) {
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    telefono: '',
    cargo: '',
    departamento: '',
    rol_id: '',
    estado: 'ACTIVO'
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<any>({})
  const { toast } = useToast()

  const isEdit = !!usuario

  useEffect(() => {
    if (usuario) {
      setFormData({
        nombre: usuario.nombre || '',
        email: usuario.email || '',
        telefono: usuario.telefono || '',
        cargo: usuario.cargo || '',
        departamento: usuario.departamento || '',
        rol_id: usuario.user_roles?.[0]?.roles?.id || '',
        estado: usuario.estado || 'ACTIVO'
      })
    } else {
      setFormData({
        nombre: '',
        email: '',
        telefono: '',
        cargo: '',
        departamento: '',
        rol_id: '',
        estado: 'ACTIVO'
      })
    }
    setErrors({})
  }, [usuario, isOpen])

  const validateForm = () => {
    const newErrors: any = {}

    if (!formData.nombre.trim()) {
      newErrors.nombre = 'El nombre es requerido'
    }

    if (!formData.email.trim()) {
      newErrors.email = 'El email es requerido'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email inválido'
    }

    if (!formData.rol_id) {
      newErrors.rol_id = 'El rol es requerido'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    setLoading(true)

    try {
      const url = isEdit 
        ? `http://localhost:3001/api/usuarios-sistema/${usuario.id}`
        : 'http://localhost:3001/api/usuarios-sistema/crear'
      
      const method = isEdit ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "✅ Éxito",
          description: data.message || `Usuario ${isEdit ? 'actualizado' : 'creado'} exitosamente`,
        })
        
        onSuccess()
        onClose()
      } else {
        throw new Error(data.error || 'Error en la operación')
      }

    } catch (error: any) {
      console.error('❌ Error:', error)
      toast({
        variant: "destructive",
        title: "❌ Error",
        description: error.message || `Error ${isEdit ? 'actualizando' : 'creando'} usuario`,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
    
    // Limpiar error del campo cuando el usuario empiece a escribir
    if (errors[field]) {
      setErrors((prev: any) => ({
        ...prev,
        [field]: undefined
      }))
    }
  }

  const getRoleColor = (rol: string) => {
    switch (rol) {
      case 'ADMIN': return '#8b5cf6'
      case 'CONTADOR': return '#3b82f6'
      case 'VENDEDOR': return '#10b981'
      case 'ALMACENERO': return '#f59e0b'
      default: return '#6b7280'
    }
  }

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }} onClick={onClose}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '24px',
        width: '100%',
        maxWidth: '500px',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
      }} onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div style={{ marginBottom: '24px', position: 'relative' }}>
          <h2 style={{ 
            fontSize: '24px', 
            fontWeight: '600', 
            marginBottom: '8px',
            color: '#1f2937',
            paddingRight: '40px'
          }}>
            {isEdit ? '✏️ Editar Usuario' : '👤 Nuevo Usuario'}
          </h2>
          <p style={{ 
            color: '#6b7280', 
            fontSize: '14px' 
          }}>
            {isEdit 
              ? 'Modifica la información del usuario del sistema.'
              : 'Crea un nuevo usuario del sistema con sus permisos y rol correspondiente.'
            }
          </p>
          
          {/* Botón X de cerrar */}
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '0',
              right: '0',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: '#ef4444',
              border: 'none',
              color: 'white',
              fontSize: '18px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s ease',
              transform: 'rotate(0deg)',
              zIndex: 1
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#dc2626';
              e.currentTarget.style.transform = 'rotate(90deg) scale(1.1)';
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#ef4444';
              e.currentTarget.style.transform = 'rotate(0deg) scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Nombre */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'block', 
              fontSize: '14px', 
              fontWeight: '500', 
              color: '#374151',
              marginBottom: '6px'
            }}>
              Nombre Completo <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              value={formData.nombre}
              onChange={(e) => handleInputChange('nombre', e.target.value)}
              placeholder="Ej: Juan Carlos García"
              style={{
                width: '100%',
                padding: '12px',
                border: errors.nombre ? '2px solid #ef4444' : '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
            />
            {errors.nombre && (
              <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
                {errors.nombre}
              </p>
            )}
          </div>

          {/* Email */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'block', 
              fontSize: '14px', 
              fontWeight: '500', 
              color: '#374151',
              marginBottom: '6px'
            }}>
              Email <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="Ej: juan.garcia@empresa.com"
              style={{
                width: '100%',
                padding: '12px',
                border: errors.email ? '2px solid #ef4444' : '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
            />
            {errors.email && (
              <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
                {errors.email}
              </p>
            )}
          </div>

          {/* Teléfono */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'block', 
              fontSize: '14px', 
              fontWeight: '500', 
              color: '#374151',
              marginBottom: '6px'
            }}>
              Teléfono
            </label>
            <input
              type="text"
              value={formData.telefono}
              onChange={(e) => handleInputChange('telefono', e.target.value)}
              placeholder="Ej: 987654321"
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
            />
          </div>

          {/* Cargo */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'block', 
              fontSize: '14px', 
              fontWeight: '500', 
              color: '#374151',
              marginBottom: '6px'
            }}>
              Cargo
            </label>
            <input
              type="text"
              value={formData.cargo}
              onChange={(e) => handleInputChange('cargo', e.target.value)}
              placeholder="Ej: Contador General"
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
            />
          </div>

          {/* Departamento */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'block', 
              fontSize: '14px', 
              fontWeight: '500', 
              color: '#374151',
              marginBottom: '6px'
            }}>
              Departamento
            </label>
            <input
              type="text"
              value={formData.departamento}
              onChange={(e) => handleInputChange('departamento', e.target.value)}
              placeholder="Ej: Contabilidad"
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
            />
          </div>

          {/* Rol */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'block', 
              fontSize: '14px', 
              fontWeight: '500', 
              color: '#374151',
              marginBottom: '6px'
            }}>
              Rol <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              value={formData.rol_id}
              onChange={(e) => handleInputChange('rol_id', e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                border: errors.rol_id ? '2px solid #ef4444' : '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                backgroundColor: 'white',
                cursor: 'pointer'
              }}
            >
              <option value="">Seleccionar rol</option>
              {roles.map((rol) => (
                <option key={rol.id} value={rol.id}>
                  {rol.nombre} - {rol.descripcion}
                </option>
              ))}
            </select>
            {errors.rol_id && (
              <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
                {errors.rol_id}
              </p>
            )}
          </div>

          {/* Estado - Solo en edición */}
          {isEdit && (
            <div style={{ marginBottom: '20px' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '14px', 
                fontWeight: '500', 
                color: '#374151',
                marginBottom: '6px'
              }}>
                Estado
              </label>
              <select
                value={formData.estado}
                onChange={(e) => handleInputChange('estado', e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                  backgroundColor: 'white',
                  cursor: 'pointer'
                }}
              >
                <option value="ACTIVO">Activo</option>
                <option value="INACTIVO">Inactivo</option>
                <option value="SUSPENDIDO">Suspendido</option>
              </select>
            </div>
          )}

          {/* Botones */}
          <div style={{ 
            display: 'flex', 
            gap: '12px', 
            justifyContent: 'flex-end',
            paddingTop: '16px',
            borderTop: '1px solid #e5e7eb'
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '12px 24px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                backgroundColor: 'white',
                color: '#374151',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '12px 24px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: loading ? '#9ca3af' : '#3b82f6',
                color: 'white',
                fontSize: '14px',
                fontWeight: '500',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                minWidth: '120px'
              }}
            >
              {loading ? 'Guardando...' : (isEdit ? 'Actualizar' : 'Crear Usuario')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
} 