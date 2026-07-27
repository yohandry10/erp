'use client'

import { useState, useEffect } from 'react'
import { useToast } from "@/components/ui/use-toast"
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pencil, UserRound } from 'lucide-react'

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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !loading && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[540px]">
        <DialogHeader className="pr-8">
          <DialogTitle className="flex items-center gap-2 text-xl">
            {isEdit ? <Pencil className="h-5 w-5 text-primary" /> : <UserRound className="h-5 w-5 text-primary" />}
            {isEdit ? 'Editar usuario' : 'Nuevo usuario'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Modifica la información y el acceso operativo del usuario.'
              : 'Crea un usuario y asigna el rol que define sus permisos en el ERP.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="usuario-nombre">Nombre completo <span className="text-destructive">*</span></Label>
            <Input
              id="usuario-nombre"
              value={formData.nombre}
              onChange={(e) => handleInputChange('nombre', e.target.value)}
              placeholder="Ej. Juan Carlos García"
              aria-invalid={!!errors.nombre}
              aria-describedby={errors.nombre ? 'usuario-nombre-error' : undefined}
            />
            {errors.nombre && <p id="usuario-nombre-error" className="text-xs text-destructive">{errors.nombre}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="usuario-email">Email <span className="text-destructive">*</span></Label>
              <Input
                id="usuario-email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="usuario@empresa.com"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'usuario-email-error' : undefined}
              />
              {errors.email && <p id="usuario-email-error" className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="usuario-telefono">Teléfono</Label>
              <Input
                id="usuario-telefono"
                inputMode="tel"
                value={formData.telefono}
                onChange={(e) => handleInputChange('telefono', e.target.value)}
                placeholder="987654321"
              />
            </div>
          </div>

          {!isEdit && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="usuario-password">Contraseña <span className="text-destructive">*</span></Label>
                <Input
                  id="usuario-password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'usuario-password-error' : 'usuario-password-help'}
                />
                {errors.password
                  ? <p id="usuario-password-error" className="text-xs text-destructive">{errors.password}</p>
                  : <p id="usuario-password-help" className="text-xs text-muted-foreground">Mayúscula, minúscula y número.</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="usuario-confirmacion">Confirmar contraseña <span className="text-destructive">*</span></Label>
                <Input
                  id="usuario-confirmacion"
                  type="password"
                  value={formData.confirmarPassword}
                  onChange={(e) => handleInputChange('confirmarPassword', e.target.value)}
                  placeholder="Repite la contraseña"
                  aria-invalid={!!errors.confirmarPassword}
                  aria-describedby={errors.confirmarPassword ? 'usuario-confirmacion-error' : undefined}
                />
                {errors.confirmarPassword && <p id="usuario-confirmacion-error" className="text-xs text-destructive">{errors.confirmarPassword}</p>}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="usuario-rol">Rol <span className="text-destructive">*</span></Label>
            <Select value={formData.rol_id} onValueChange={(value) => handleInputChange('rol_id', value)}>
              <SelectTrigger id="usuario-rol" aria-invalid={!!errors.rol_id} aria-describedby={errors.rol_id ? 'usuario-rol-error' : undefined}>
                <SelectValue placeholder="Seleccionar rol" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((rol) => (
                  <SelectItem key={rol.id} value={rol.id}>{rol.nombre} — {rol.descripcion}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.rol_id && <p id="usuario-rol-error" className="text-xs text-destructive">{errors.rol_id}</p>}
          </div>

          {isEdit && (
            <div className="space-y-2">
              <Label htmlFor="usuario-estado">Estado</Label>
              <Select value={formData.estado} onValueChange={(value) => handleInputChange('estado', value)}>
                <SelectTrigger id="usuario-estado"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVO">Activo</SelectItem>
                  <SelectItem value="INACTIVO">Inactivo</SelectItem>
                  <SelectItem value="SUSPENDIDO">Suspendido</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter className="border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button type="submit" disabled={loading} className="min-w-32">
              {loading ? 'Guardando…' : (isEdit ? 'Actualizar usuario' : 'Crear usuario')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
