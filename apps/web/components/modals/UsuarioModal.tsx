'use client'

import { useState, useEffect } from 'react'
import { useToast } from "@/components/ui/use-toast"
import { useApi } from '@/hooks/use-api'

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
    password: '',
    confirmarPassword: '',
    rol_id: '',
    estado: 'ACTIVO'
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<any>({})
  const { toast } = useToast()
  const { post, put } = useApi()

  const isEdit = !!usuario

  useEffect(() => {
    if (usuario) {
      setFormData({
        nombre: usuario.nombre || '',
        email: usuario.email || '',
        telefono: usuario.telefono || '',
        password: '',
        confirmarPassword: '',
        rol_id: usuario.roles_usuario?.[0]?.roles?.id || usuario.user_roles?.[0]?.roles?.id || '',
        estado: usuario.estado || 'ACTIVO'
      })
    } else {
      setFormData({
        nombre: '',
        email: '',
        telefono: '',
        password: '',
        confirmarPassword: '',
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

    // Validar contraseña solo en creación
    if (!isEdit) {
      if (!formData.password) {
        newErrors.password = 'La contraseña es requerida'
      } else if (formData.password.length < 8) {
        newErrors.password = 'La contraseña debe tener al menos 8 caracteres'
      } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
        newErrors.password = 'Debe incluir mayúscula, minúscula y número'
      }

      if (formData.password !== formData.confirmarPassword) {
        newErrors.confirmarPassword = 'Las contraseñas no coinciden'
      }
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
      // Preparar datos (no enviar confirmarPassword)
      const dataToSend = {
        nombre: formData.nombre,
        email: formData.email,
        telefono: formData.telefono,
        rol_id: formData.rol_id,
        estado: formData.estado,
        ...(formData.password && !isEdit ? { password: formData.password } : {})
      }

      const data = isEdit 
        ? await put(`/usuarios-sistema/${usuario.id}`, dataToSend)
        : await post('/usuarios-sistema/crear', dataToSend)

      if (data?.success) {
        toast({
          title: "✅ Éxito",
          description: data.message || `Usuario ${isEdit ? 'actualizado' : 'creado'} exitosamente`,
        })
        
        onSuccess()
        onClose()
      } else {
        throw new Error(data?.error || 'Error en la operación')
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
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-[rgba(0,_0,_0,_0.6)] z-[10000] flex items-center justify-center p-5" onClick={onClose}>
      <div className="bg-white rounded-3 p-6 w-[100%] max-w-[500px] overflow-auto shadow" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="mb-6 relative">
          <h2 className="text-6 font-semibold mb-2 text-gray-800 pr-10">
            {isEdit ? '✏️ Editar Usuario' : '👤 Nuevo Usuario'}
          </h2>
          <p className="text-gray-500 text-3.5">
            {isEdit 
              ? 'Modifica la información del usuario del sistema.'
              : 'Crea un nuevo usuario del sistema con sus permisos y rol correspondiente.'
            }
          </p>
          
          {/* Botón X de cerrar */}
          <button
            type="button"
            aria-label="Cerrar modal de usuario"
            title="Cerrar modal de usuario"
            onClick={onClose} className="absolute top-0 right-0 w-8 h-8 rounded-full bg-red-500 border-0 text-white text-[18px] font-bold cursor-pointer flex items-center justify-center transition z-[1]"
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
          <div className="mb-5">
            <label className="block text-3.5 font-medium text-gray-700 mb-[6px]">
              Nombre Completo <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.nombre}
              onChange={(e) => handleInputChange('nombre', e.target.value)}
              placeholder="Ej: Juan Carlos García" className="w-[100%] p-3 rounded-2 text-3.5 transition"
            />
            {errors.nombre && (
              <p className="text-3 text-red-500 mt-[4px]">
                {errors.nombre}
              </p>
            )}
          </div>

          {/* Email */}
          <div className="mb-5">
            <label className="block text-3.5 font-medium text-gray-700 mb-[6px]">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="Ej: juan.garcia@empresa.com" className="w-[100%] p-3 rounded-2 text-3.5 transition"
            />
            {errors.email && (
              <p className="text-3 text-red-500 mt-[4px]">
                {errors.email}
              </p>
            )}
          </div>

          {/* Teléfono */}
          <div className="mb-5">
            <label className="block text-3.5 font-medium text-gray-700 mb-[6px]">
              Teléfono
            </label>
            <input
              type="text"
              value={formData.telefono}
              onChange={(e) => handleInputChange('telefono', e.target.value)}
              placeholder="Ej: 987654321" className="w-[100%] p-3 border rounded-2 text-3.5 transition"
            />
          </div>

          {/* Contraseña - Solo en creación */}
          {!isEdit && (
            <>
              <div className="mb-5">
                <label className="block text-3.5 font-medium text-gray-700 mb-[6px]">
                  Contraseña <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  placeholder="Mínimo 8 caracteres" className="w-[100%] p-3 rounded-2 text-3.5 transition"
                />
                {errors.password && (
                  <p className="text-3 text-red-500 mt-[4px]">
                    {errors.password}
                  </p>
                )}
                <p className="text-[11px] text-gray-500 mt-[4px]">
                  Debe incluir mayúscula, minúscula y número
                </p>
              </div>

              <div className="mb-5">
                <label className="block text-3.5 font-medium text-gray-700 mb-[6px]">
                  Confirmar Contraseña <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={formData.confirmarPassword}
                  onChange={(e) => handleInputChange('confirmarPassword', e.target.value)}
                  placeholder="Repite la contraseña" className="w-[100%] p-3 rounded-2 text-3.5 transition"
                />
                {errors.confirmarPassword && (
                  <p className="text-3 text-red-500 mt-[4px]">
                    {errors.confirmarPassword}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Rol */}
          <div className="mb-5">
            <label className="block text-3.5 font-medium text-gray-700 mb-[6px]">
              Rol <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.rol_id}
              onChange={(e) => handleInputChange('rol_id', e.target.value)} className="w-[100%] p-3 rounded-2 text-3.5 bg-white cursor-pointer"
            >
              <option value="">Seleccionar rol</option>
              {roles.map((rol) => (
                <option key={rol.id} value={rol.id}>
                  {rol.nombre} - {rol.descripcion}
                </option>
              ))}
            </select>
            {errors.rol_id && (
              <p className="text-3 text-red-500 mt-[4px]">
                {errors.rol_id}
              </p>
            )}
          </div>

          {/* Estado - Solo en edición */}
          {isEdit && (
            <div className="mb-5">
              <label className="block text-3.5 font-medium text-gray-700 mb-[6px]">
                Estado
              </label>
              <select
                value={formData.estado}
                onChange={(e) => handleInputChange('estado', e.target.value)} className="w-[100%] p-3 border rounded-2 text-3.5 bg-white cursor-pointer"
              >
                <option value="ACTIVO">Activo</option>
                <option value="INACTIVO">Inactivo</option>
                <option value="SUSPENDIDO">Suspendido</option>
              </select>
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-3 justify-end pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              disabled={loading} className="py-3 px-6 border rounded-2 bg-white text-gray-700 text-3.5 font-medium cursor-pointer transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading} className="py-3 px-6 border-0 rounded-2 text-white text-3.5 font-medium transition min-w-[120px]"
            >
              {loading ? 'Guardando...' : (isEdit ? 'Actualizar' : 'Crear Usuario')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
