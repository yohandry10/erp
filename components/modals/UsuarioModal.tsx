'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
        rol_id: usuario.roles_usuario?.[0]?.roles?.id || '',
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

      console.log('📤 Enviando datos:', formData)

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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? '✏️ Editar Usuario' : '👤 Nuevo Usuario'}
          </DialogTitle>
          <DialogDescription>
            {isEdit 
              ? 'Modifica la información del usuario del sistema.'
              : 'Crea un nuevo usuario del sistema con sus permisos y rol correspondiente.'
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre */}
          <div className="space-y-2">
            <Label htmlFor="nombre">
              Nombre Completo <span className="text-red-500">*</span>
            </Label>
            <Input
              id="nombre"
              value={formData.nombre}
              onChange={(e) => handleInputChange('nombre', e.target.value)}
              placeholder="Ej: Juan Carlos García"
              className={errors.nombre ? 'border-red-500' : ''}
            />
            {errors.nombre && (
              <p className="text-sm text-red-500">{errors.nombre}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">
              Email <span className="text-red-500">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="Ej: juan.garcia@empresa.com"
              className={errors.email ? 'border-red-500' : ''}
            />
            {errors.email && (
              <p className="text-sm text-red-500">{errors.email}</p>
            )}
          </div>

          {/* Teléfono */}
          <div className="space-y-2">
            <Label htmlFor="telefono">Teléfono</Label>
            <Input
              id="telefono"
              value={formData.telefono}
              onChange={(e) => handleInputChange('telefono', e.target.value)}
              placeholder="Ej: 987654321"
            />
          </div>

          {/* Cargo */}
          <div className="space-y-2">
            <Label htmlFor="cargo">Cargo</Label>
            <Input
              id="cargo"
              value={formData.cargo}
              onChange={(e) => handleInputChange('cargo', e.target.value)}
              placeholder="Ej: Contador General"
            />
          </div>

          {/* Departamento */}
          <div className="space-y-2">
            <Label htmlFor="departamento">Departamento</Label>
            <Input
              id="departamento"
              value={formData.departamento}
              onChange={(e) => handleInputChange('departamento', e.target.value)}
              placeholder="Ej: Contabilidad"
            />
          </div>

          {/* Rol */}
          <div className="space-y-2">
            <Label htmlFor="rol">
              Rol <span className="text-red-500">*</span>
            </Label>
            <Select 
              value={formData.rol_id} 
              onValueChange={(value) => handleInputChange('rol_id', value)}
            >
              <SelectTrigger className={errors.rol_id ? 'border-red-500' : ''}>
                <SelectValue placeholder="Seleccionar rol" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((rol) => (
                  <SelectItem key={rol.id} value={rol.id}>
                    <div className="flex items-center gap-2">
                      <span 
                        className="w-3 h-3 rounded-full"
                        style={{ 
                          backgroundColor: rol.nombre === 'ADMIN' ? '#8b5cf6' :
                                         rol.nombre === 'CONTADOR' ? '#3b82f6' :
                                         rol.nombre === 'VENDEDOR' ? '#10b981' :
                                         rol.nombre === 'ALMACENERO' ? '#f59e0b' : '#6b7280'
                        }}
                      />
                      <span className="font-medium">{rol.nombre}</span>
                      <span className="text-sm text-gray-500">- {rol.descripcion}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.rol_id && (
              <p className="text-sm text-red-500">{errors.rol_id}</p>
            )}
          </div>

          {/* Estado */}
          <div className="space-y-2">
            <Label htmlFor="estado">Estado</Label>
            <Select 
              value={formData.estado} 
              onValueChange={(value) => handleInputChange('estado', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVO">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-green-500"></span>
                    <span>Activo</span>
                  </div>
                </SelectItem>
                <SelectItem value="INACTIVO">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500"></span>
                    <span>Inactivo</span>
                  </div>
                </SelectItem>
                <SelectItem value="SUSPENDIDO">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                    <span>Suspendido</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>{isEdit ? 'Actualizando...' : 'Creando...'}</span>
                </div>
              ) : (
                <span>{isEdit ? 'Actualizar Usuario' : 'Crear Usuario'}</span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
} 