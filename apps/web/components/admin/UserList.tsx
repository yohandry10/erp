'use client'

import { useEffect, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { UserForm } from './UserForm'
import { RoleAssignment } from './RoleAssignment'
import { PermissionViewer } from './PermissionViewer'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { 
  Plus, 
  Search, 
  Eye, 
  Edit, 
  CheckCircle, 
  XCircle,
  User,
  Mail,
  Briefcase,
  Shield,
  KeyRound,
  MoreVertical
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface UserData {
  id: string
  nombre: string
  apellido?: string
  email: string
  telefono?: string
  cargo?: string
  departamento?: string
  estado: 'ACTIVO' | 'INACTIVO' | 'SUSPENDIDO'
  roles?: Array<{ id: string; nombre: string }>
  created_at?: string
  fecha_ultimo_acceso?: string
}

export function UserList() {
  const { get, post } = useApi({ showSuccessToast: true })
  const [users, setUsers] = useState<UserData[]>([])
  const [filteredUsers, setFilteredUsers] = useState<UserData[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showViewDialog, setShowViewDialog] = useState(false)
  const [showRoleDialog, setShowRoleDialog] = useState(false)
  const [showPermissionDialog, setShowPermissionDialog] = useState(false)
  const [showResetPasswordDialog, setShowResetPasswordDialog] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null)

  // Fetch users
  const fetchUsers = async () => {
    setLoading(true)
    try {
      const response = await get('/users')
      const usersData = response?.data || response || []
      setUsers(usersData)
      setFilteredUsers(usersData)
    } catch (error) {
      console.error('Error fetching users:', error)
      setUsers([])
      setFilteredUsers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  // Filter users based on search and status
  useEffect(() => {
    let filtered = users

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (user) =>
          user.nombre.toLowerCase().includes(query) ||
          user.apellido?.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query) ||
          user.cargo?.toLowerCase().includes(query) ||
          user.departamento?.toLowerCase().includes(query)
      )
    }

    // Apply status filter
    if (statusFilter !== 'ALL') {
      filtered = filtered.filter((user) => user.estado === statusFilter)
    }

    setFilteredUsers(filtered)
  }, [searchQuery, statusFilter, users])

  // Handle user activation
  const handleActivate = async (userId: string) => {
    try {
      await post(`/users/${userId}/activate`)
      await fetchUsers()
    } catch (error) {
      console.error('Error activating user:', error)
    }
  }

  // Handle user deactivation
  const handleDeactivate = async (userId: string) => {
    try {
      await post(`/users/${userId}/deactivate`)
      await fetchUsers()
    } catch (error) {
      console.error('Error deactivating user:', error)
    }
  }

  // Handle password reset
  const handleResetPassword = async () => {
    if (!selectedUser) return
    
    try {
      await post(`/users/${selectedUser.id}/reset-password`)
      setShowResetPasswordDialog(false)
      setSelectedUser(null)
    } catch (error) {
      console.error('Error resetting password:', error)
    }
  }

  // Handle view user
  const handleView = (user: UserData) => {
    setSelectedUser(user)
    setShowViewDialog(true)
  }

  // Handle edit user
  const handleEdit = (user: UserData) => {
    setSelectedUser(user)
    setShowEditDialog(true)
  }

  // Handle manage roles
  const handleManageRoles = (user: UserData) => {
    setSelectedUser(user)
    setShowRoleDialog(true)
  }

  // Handle view permissions
  const handleViewPermissions = (user: UserData) => {
    setSelectedUser(user)
    setShowPermissionDialog(true)
  }

  // Handle successful form submission
  const handleFormSuccess = () => {
    setShowCreateDialog(false)
    setShowEditDialog(false)
    setShowRoleDialog(false)
    setSelectedUser(null)
    fetchUsers()
  }

  // Get badge variant based on status
  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case 'ACTIVO':
        return <Badge className="bg-green-500 hover:bg-green-600">Active</Badge>
      case 'INACTIVO':
        return <Badge variant="secondary">Inactive</Badge>
      case 'SUSPENDIDO':
        return <Badge variant="destructive">Suspended</Badge>
      default:
        return <Badge variant="outline">{estado}</Badge>
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters and Actions */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, position..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="ACTIVO">Active</SelectItem>
            <SelectItem value="INACTIVO">Inactive</SelectItem>
            <SelectItem value="SUSPENDIDO">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      {/* User Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">User</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Contact</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Position</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Roles</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    {searchQuery || statusFilter !== 'ALL'
                      ? 'No users found matching your filters'
                      : 'No users yet. Add your first user to get started.'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">
                            {user.nombre} {user.apellido || ''}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {user.departamento || 'No department'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div>{user.email}</div>
                          {user.telefono && (
                            <div className="text-xs text-muted-foreground">
                              {user.telefono}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                        {user.cargo || 'N/A'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {user.roles && user.roles.length > 0 ? (
                          user.roles.slice(0, 2).map((role) => (
                            <Badge key={role.id} variant="outline" className="text-xs">
                              {role.nombre}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">No roles</span>
                        )}
                        {user.roles && user.roles.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{user.roles.length - 2}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(user.estado)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleView(user)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(user)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleManageRoles(user)}>
                              <Shield className="h-4 w-4 mr-2" />
                              Manage Roles
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleViewPermissions(user)}>
                              <KeyRound className="h-4 w-4 mr-2" />
                              View Permissions
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => {
                                setSelectedUser(user)
                                setShowResetPasswordDialog(true)
                              }}
                            >
                              <KeyRound className="h-4 w-4 mr-2" />
                              Reset Password
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {user.estado === 'ACTIVO' ? (
                              <DropdownMenuItem 
                                onClick={() => handleDeactivate(user.id)}
                                className="text-destructive"
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Deactivate
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem 
                                onClick={() => handleActivate(user.id)}
                                className="text-green-600"
                              >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Activate
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              Create a new user account for your organization
            </DialogDescription>
          </DialogHeader>
          <UserForm onSuccess={handleFormSuccess} onCancel={() => setShowCreateDialog(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information
            </DialogDescription>
          </DialogHeader>
          <UserForm
            user={selectedUser}
            onSuccess={handleFormSuccess}
            onCancel={() => {
              setShowEditDialog(false)
              setSelectedUser(null)
            }}
          />
        </DialogContent>
      </Dialog>

      {/* View User Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>
              View detailed information about this user
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Name</label>
                  <p className="text-sm mt-1">
                    {selectedUser.nombre} {selectedUser.apellido || ''}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Email</label>
                  <p className="text-sm mt-1">{selectedUser.email}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Phone</label>
                  <p className="text-sm mt-1">{selectedUser.telefono || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Position</label>
                  <p className="text-sm mt-1">{selectedUser.cargo || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Department</label>
                  <p className="text-sm mt-1">{selectedUser.departamento || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  <div className="mt-1">{getStatusBadge(selectedUser.estado)}</div>
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium text-muted-foreground">Roles</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {selectedUser.roles && selectedUser.roles.length > 0 ? (
                      selectedUser.roles.map((role) => (
                        <Badge key={role.id} variant="outline">
                          {role.nombre}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">No roles assigned</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowViewDialog(false)}>
                  Close
                </Button>
                <Button
                  onClick={() => {
                    setShowViewDialog(false)
                    handleEdit(selectedUser)
                  }}
                >
                  Edit User
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Manage Roles Dialog */}
      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage User Roles</DialogTitle>
            <DialogDescription>
              Assign or remove roles for {selectedUser?.nombre}
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <RoleAssignment
              userId={selectedUser.id}
              currentRoles={selectedUser.roles || []}
              onSuccess={handleFormSuccess}
              onCancel={() => {
                setShowRoleDialog(false)
                setSelectedUser(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* View Permissions Dialog */}
      <Dialog open={showPermissionDialog} onOpenChange={setShowPermissionDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>User Permissions</DialogTitle>
            <DialogDescription>
              View all permissions for {selectedUser?.nombre}
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <PermissionViewer userId={selectedUser.id} />
          )}
        </DialogContent>
      </Dialog>

      {/* Reset Password Confirmation Dialog */}
      <AlertDialog open={showResetPasswordDialog} onOpenChange={setShowResetPasswordDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Password</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reset the password for {selectedUser?.nombre}? 
              A password reset email will be sent to {selectedUser?.email}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedUser(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleResetPassword}>
              Reset Password
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
