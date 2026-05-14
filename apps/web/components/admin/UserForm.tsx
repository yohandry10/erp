'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { X } from 'lucide-react'

interface UserFormData {
  nombre: string
  apellido?: string
  email: string
  telefono?: string
  cargo?: string
  departamento?: string
  roles: string[]
}

interface UserFormProps {
  user?: {
    id: string
    nombre: string
    apellido?: string
    email: string
    telefono?: string
    cargo?: string
    departamento?: string
    roles?: Array<{ id: string; nombre: string }>
  } | null
  onSuccess: () => void
  onCancel: () => void
}

interface Role {
  id: string
  nombre: string
  descripcion?: string
}

export function UserForm({ user, onSuccess, onCancel }: UserFormProps) {
  const { get, post, put } = useApi({ showSuccessToast: true })
  const [loading, setLoading] = useState(false)
  const [roles, setRoles] = useState<Role[]>([])
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [loadingRoles, setLoadingRoles] = useState(true)

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<UserFormData>({
    defaultValues: {
      nombre: user?.nombre || '',
      apellido: user?.apellido || '',
      email: user?.email || '',
      telefono: user?.telefono || '',
      cargo: user?.cargo || '',
      departamento: user?.departamento || '',
      roles: user?.roles?.map(r => r.id) || [],
    },
  })

  // Fetch available roles
  useEffect(() => {
    const fetchRoles = async () => {
      setLoadingRoles(true)
      try {
        const response = await get('/roles')
        const rolesData = response?.data || response || []
        setRoles(rolesData)
      } catch (error) {
        console.error('Error fetching roles:', error)
        setRoles([])
      } finally {
        setLoadingRoles(false)
      }
    }

    fetchRoles()
  }, [get])

  // Initialize selected roles
  useEffect(() => {
    if (user?.roles) {
      setSelectedRoles(user.roles.map(r => r.id))
    }
  }, [user])

  // Handle role selection
  const handleRoleSelect = (roleId: string) => {
    if (!selectedRoles.includes(roleId)) {
      const newRoles = [...selectedRoles, roleId]
      setSelectedRoles(newRoles)
      setValue('roles', newRoles)
    }
  }

  // Handle role removal
  const handleRoleRemove = (roleId: string) => {
    const newRoles = selectedRoles.filter(id => id !== roleId)
    setSelectedRoles(newRoles)
    setValue('roles', newRoles)
  }

  // Get role name by ID
  const getRoleName = (roleId: string) => {
    const role = roles.find(r => r.id === roleId)
    return role?.nombre || roleId
  }

  // Handle form submission
  const onSubmit = async (data: UserFormData) => {
    setLoading(true)
    try {
      const payload = {
        ...data,
        roles: selectedRoles,
      }

      if (user) {
        // Update existing user
        await put(`/users/${user.id}`, payload)
      } else {
        // Create new user
        await post('/users', payload)
      }

      onSuccess()
    } catch (error) {
      console.error('Error saving user:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Name Fields */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="nombre">
            First Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="nombre"
            {...register('nombre', {
              required: 'First name is required',
              minLength: { value: 2, message: 'First name must be at least 2 characters' }
            })}
            placeholder="John"
            disabled={loading}
          />
          {errors.nombre && (
            <p className="text-sm text-destructive">{errors.nombre.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="apellido">Last Name</Label>
          <Input
            id="apellido"
            {...register('apellido')}
            placeholder="Doe"
            disabled={loading}
          />
        </div>
      </div>

      {/* Email */}
      <div className="space-y-2">
        <Label htmlFor="email">
          Email <span className="text-destructive">*</span>
        </Label>
        <Input
          id="email"
          type="email"
          {...register('email', {
            required: 'Email is required',
            pattern: {
              value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
              message: 'Invalid email address'
            }
          })}
          placeholder="john.doe@company.com"
          disabled={loading || !!user} // Disable email editing for existing users
        />
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        )}
        {user && (
          <p className="text-xs text-muted-foreground">
            Email cannot be changed for existing users
          </p>
        )}
      </div>

      {/* Phone */}
      <div className="space-y-2">
        <Label htmlFor="telefono">Phone</Label>
        <Input
          id="telefono"
          type="tel"
          {...register('telefono')}
          placeholder="+1 (555) 123-4567"
          disabled={loading}
        />
      </div>

      {/* Position and Department */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cargo">Position</Label>
          <Input
            id="cargo"
            {...register('cargo')}
            placeholder="Sales Manager"
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="departamento">Department</Label>
          <Input
            id="departamento"
            {...register('departamento')}
            placeholder="Sales"
            disabled={loading}
          />
        </div>
      </div>

      {/* Role Selection */}
      <div className="space-y-2">
        <Label>
          Roles <span className="text-destructive">*</span>
        </Label>
        <Select
          onValueChange={handleRoleSelect}
          disabled={loading || loadingRoles}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select roles to assign..." />
          </SelectTrigger>
          <SelectContent>
            {loadingRoles ? (
              <div className="p-2 text-sm text-muted-foreground">Loading roles...</div>
            ) : roles.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground">No roles available</div>
            ) : (
              roles
                .filter(role => !selectedRoles.includes(role.id))
                .map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    <div>
                      <div className="font-medium">{role.nombre}</div>
                      {role.descripcion && (
                        <div className="text-xs text-muted-foreground">
                          {role.descripcion}
                        </div>
                      )}
                    </div>
                  </SelectItem>
                ))
            )}
          </SelectContent>
        </Select>

        {/* Selected Roles */}
        {selectedRoles.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {selectedRoles.map((roleId) => (
              <Badge key={roleId} variant="secondary" className="pr-1">
                {getRoleName(roleId)}
                <button
                  type="button"
                  onClick={() => handleRoleRemove(roleId)}
                  className="ml-2 hover:bg-muted rounded-full p-0.5"
                  disabled={loading}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {selectedRoles.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No roles assigned. Select at least one role.
          </p>
        )}
        {errors.roles && (
          <p className="text-sm text-destructive">{errors.roles.message}</p>
        )}
      </div>

      {/* Form Actions */}
      <div className="flex justify-end gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading || selectedRoles.length === 0}>
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              {user ? 'Updating...' : 'Creating...'}
            </>
          ) : (
            user ? 'Update User' : 'Create User'
          )}
        </Button>
      </div>

      {/* Info Message */}
      {!user && (
        <p className="text-sm text-muted-foreground">
          A temporary password will be generated and sent to the user&apos;s email address.
        </p>
      )}
    </form>
  )
}
