'use client'

import { useEffect, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Shield, Plus, Trash2 } from 'lucide-react'

interface Role {
  id: string
  nombre: string
  descripcion?: string
}

interface RoleAssignmentProps {
  userId: string
  currentRoles: Array<{ id: string; nombre: string }>
  onSuccess: () => void
  onCancel: () => void
}

export function RoleAssignment({ userId, currentRoles, onSuccess, onCancel }: RoleAssignmentProps) {
  const { get, post, delete: del } = useApi({ showSuccessToast: true })
  const [roles, setRoles] = useState<Role[]>([])
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set())
  const [assignedRoles, setAssignedRoles] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [loadingRoles, setLoadingRoles] = useState(true)

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

  // Initialize assigned roles
  useEffect(() => {
    const assigned = new Set(currentRoles.map(r => r.id))
    setAssignedRoles(assigned)
  }, [currentRoles])

  // Handle role selection toggle
  const handleRoleToggle = (roleId: string) => {
    const newSelected = new Set(selectedRoles)
    if (newSelected.has(roleId)) {
      newSelected.delete(roleId)
    } else {
      newSelected.add(roleId)
    }
    setSelectedRoles(newSelected)
  }

  // Handle assign selected roles
  const handleAssignRoles = async () => {
    if (selectedRoles.size === 0) return

    setLoading(true)
    try {
      const roleIds = Array.from(selectedRoles)
      await post(`/users/${userId}/roles`, { roleIds })
      
      // Update assigned roles
      const newAssigned = new Set([...assignedRoles, ...selectedRoles])
      setAssignedRoles(newAssigned)
      setSelectedRoles(new Set())
      
      onSuccess()
    } catch (error) {
      console.error('Error assigning roles:', error)
    } finally {
      setLoading(false)
    }
  }

  // Handle remove role
  const handleRemoveRole = async (roleId: string) => {
    setLoading(true)
    try {
      await del(`/users/${userId}/roles/${roleId}`)
      
      // Update assigned roles
      const newAssigned = new Set(assignedRoles)
      newAssigned.delete(roleId)
      setAssignedRoles(newAssigned)
      
      onSuccess()
    } catch (error) {
      console.error('Error removing role:', error)
    } finally {
      setLoading(false)
    }
  }

  // Get role details by ID
  const getRoleDetails = (roleId: string) => {
    return roles.find(r => r.id === roleId)
  }

  // Get available roles (not yet assigned)
  const availableRoles = roles.filter(role => !assignedRoles.has(role.id))

  if (loadingRoles) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Current Roles */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Current Roles</h3>
        </div>
        
        {assignedRoles.size === 0 ? (
          <div className="text-sm text-muted-foreground border rounded-lg p-4 text-center">
            No roles assigned yet
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from(assignedRoles).map((roleId) => {
              const role = getRoleDetails(roleId)
              if (!role) return null
              
              return (
                <div
                  key={roleId}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{role.nombre}</Badge>
                    </div>
                    {role.descripcion && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {role.descripcion}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveRole(roleId)}
                    disabled={loading}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Available Roles to Assign */}
      {availableRoles.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">Available Roles</h3>
            </div>
            {selectedRoles.size > 0 && (
              <Button
                size="sm"
                onClick={handleAssignRoles}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Assigning...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Assign Selected ({selectedRoles.size})
                  </>
                )}
              </Button>
            )}
          </div>

          <ScrollArea className="h-[300px] border rounded-lg p-2">
            <div className="space-y-2">
              {availableRoles.map((role) => (
                <div
                  key={role.id}
                  className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                  onClick={() => handleRoleToggle(role.id)}
                >
                  <Checkbox
                    checked={selectedRoles.has(role.id)}
                    onCheckedChange={() => handleRoleToggle(role.id)}
                    disabled={loading}
                  />
                  <div className="flex-1">
                    <div className="font-medium">{role.nombre}</div>
                    {role.descripcion && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {role.descripcion}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <p className="text-sm text-muted-foreground">
            Select one or more roles to assign to this user
          </p>
        </div>
      )}

      {availableRoles.length === 0 && assignedRoles.size > 0 && (
        <div className="text-sm text-muted-foreground border rounded-lg p-4 text-center">
          All available roles have been assigned
        </div>
      )}

      {/* Form Actions */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={loading}
        >
          Close
        </Button>
      </div>
    </div>
  )
}
