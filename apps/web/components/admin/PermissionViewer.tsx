'use client'

import { useEffect, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { KeyRound, CheckCircle, Layers } from 'lucide-react'

interface Permission {
  id: string
  modulo: string
  accion: string
  recurso: string
  descripcion?: string
}

interface PermissionViewerProps {
  userId: string
}

interface GroupedPermissions {
  [modulo: string]: Permission[]
}

export function PermissionViewer({ userId }: PermissionViewerProps) {
  const { get } = useApi()
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch user permissions
  useEffect(() => {
    const fetchPermissions = async () => {
      setLoading(true)
      try {
        const response = await get(`/users/${userId}/permissions`)
        const permissionsData = response?.data || response || []
        setPermissions(permissionsData)
      } catch (error) {
        console.error('Error fetching permissions:', error)
        setPermissions([])
      } finally {
        setLoading(false)
      }
    }

    fetchPermissions()
  }, [userId, get])

  // Group permissions by module
  const groupedPermissions: GroupedPermissions = permissions.reduce((acc, permission) => {
    const modulo = permission.modulo || 'Other'
    if (!acc[modulo]) {
      acc[modulo] = []
    }
    acc[modulo].push(permission)
    return acc
  }, {} as GroupedPermissions)

  // Get action badge color
  const getActionBadge = (accion: string) => {
    const actionColors: { [key: string]: string } = {
      create: 'bg-green-500 hover:bg-green-600',
      read: 'bg-blue-500 hover:bg-blue-600',
      update: 'bg-yellow-500 hover:bg-yellow-600',
      delete: 'bg-red-500 hover:bg-red-600',
      export: 'bg-purple-500 hover:bg-purple-600',
      import: 'bg-indigo-500 hover:bg-indigo-600',
    }

    const colorClass = actionColors[accion.toLowerCase()] || 'bg-gray-500 hover:bg-gray-600'
    
    return (
      <Badge className={`${colorClass} text-white text-xs`}>
        {accion}
      </Badge>
    )
  }

  // Format module name
  const formatModuleName = (modulo: string) => {
    return modulo
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (permissions.length === 0) {
    return (
      <div className="text-center py-8">
        <KeyRound className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">
          No permissions assigned to this user
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Assign roles to grant permissions
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <div>
            <p className="font-semibold">Total Permissions</p>
            <p className="text-sm text-muted-foreground">
              {permissions.length} permission{permissions.length !== 1 ? 's' : ''} across {Object.keys(groupedPermissions).length} module{Object.keys(groupedPermissions).length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="text-lg px-4 py-2">
          {permissions.length}
        </Badge>
      </div>

      {/* Permissions by Module */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Permissions by Module</h3>
        </div>

        <ScrollArea className="h-[400px] border rounded-lg">
          <Accordion type="multiple" className="w-full">
            {Object.entries(groupedPermissions)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([modulo, modulePermissions]) => (
                <AccordionItem key={modulo} value={modulo}>
                  <AccordionTrigger className="px-4 hover:bg-muted/50">
                    <div className="flex items-center justify-between w-full pr-4">
                      <span className="font-medium">{formatModuleName(modulo)}</span>
                      <Badge variant="outline" className="ml-2">
                        {modulePermissions.length}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <div className="space-y-3 pt-2">
                      {modulePermissions
                        .sort((a, b) => a.recurso.localeCompare(b.recurso))
                        .map((permission) => (
                          <div
                            key={permission.id}
                            className="flex items-start gap-3 p-3 border rounded-lg bg-background"
                          >
                            <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {getActionBadge(permission.accion)}
                                <span className="font-medium text-sm">
                                  {permission.recurso}
                                </span>
                              </div>
                              {permission.descripcion && (
                                <p className="text-sm text-muted-foreground mt-1">
                                  {permission.descripcion}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                                <span>Module: {modulo}</span>
                                <span>•</span>
                                <span>Action: {permission.accion}</span>
                                <span>•</span>
                                <span>Resource: {permission.recurso}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
          </Accordion>
        </ScrollArea>
      </div>

      {/* Info Note */}
      <div className="text-sm text-muted-foreground border-l-4 border-primary pl-4 py-2">
        <p className="font-medium">Note:</p>
        <p>
          These permissions are aggregated from all roles assigned to this user. 
          To modify permissions, update the user's roles or the permissions assigned to those roles.
        </p>
      </div>
    </div>
  )
}
