# Admin Dashboard Components

This directory contains the frontend components for the Admin de Empresa (Tenant Administrator) dashboard, implementing task 18 of the multi-level admin system specification.

## Components Overview

### 1. AdminDashboard Page (`/app/admin/dashboard/page.tsx`)
The main dashboard page for tenant administrators.

**Features:**
- Route protection (redirects non-admins and super-admins)
- Displays tenant statistics (total users, active users, inactive users, roles)
- Integrates the UserList component for user management
- Responsive layout with statistics cards

**Requirements Addressed:** 9.3

### 2. UserList Component (`UserList.tsx`)
Comprehensive user management interface with table view.

**Features:**
- Display users in table format with columns: User, Contact, Position, Roles, Status, Actions
- Search functionality (by name, email, position, department)
- Status filtering (All, Active, Inactive, Suspended)
- Actions: View, Edit, Activate, Deactivate, Reset Password
- Role management and permission viewing
- Automatic tenant filtering (users only see their tenant's users)

**Requirements Addressed:** 9.3, 9.5

### 3. UserForm Component (`UserForm.tsx`)
Form for creating and editing users with role assignment.

**Features:**
- Fields: nombre, apellido, email, telefono, cargo, departamento
- Multi-select role assignment with visual badges
- Form validation using react-hook-form
- Email field disabled for existing users (cannot be changed)
- Automatic temporary password generation for new users
- Role selection with descriptions

**Requirements Addressed:** 9.3, 9.4

### 4. RoleAssignment Component (`RoleAssignment.tsx`)
Dedicated interface for managing user roles.

**Features:**
- Display current roles with descriptions
- Multi-select interface for available roles
- Add/Remove role actions
- Visual feedback with badges
- Scrollable list for many roles
- Real-time role updates

**Requirements Addressed:** 9.4

### 5. PermissionViewer Component (`PermissionViewer.tsx`)
Read-only view of user's aggregated permissions.

**Features:**
- Display all permissions from user's roles
- Group permissions by module
- Color-coded action badges (create, read, update, delete, etc.)
- Accordion interface for organized viewing
- Permission summary statistics
- Detailed permission information (module, action, resource, description)

**Requirements Addressed:** 9.4

## UI Components Created

The following shadcn/ui components were created to support the admin dashboard:

- `checkbox.tsx` - Checkbox input component
- `scroll-area.tsx` - Scrollable area with custom scrollbar
- `accordion.tsx` - Collapsible accordion component
- `alert-dialog.tsx` - Confirmation dialog component
- `dropdown-menu.tsx` - Dropdown menu with actions

## Usage

### Accessing the Admin Dashboard

```typescript
// Navigate to /admin/dashboard
// The page automatically:
// - Redirects unauthenticated users to /login
// - Redirects super-admins to /super-admin/dashboard
// - Shows tenant-specific data for regular admins
```

### Using Components Individually

```typescript
import { UserList, UserForm, RoleAssignment, PermissionViewer } from '@/components/admin'

// UserList - Full user management interface
<UserList />

// UserForm - Create or edit user
<UserForm 
  user={existingUser} // Optional, omit for create mode
  onSuccess={() => console.log('User saved')}
  onCancel={() => console.log('Cancelled')}
/>

// RoleAssignment - Manage user roles
<RoleAssignment
  userId="user-id"
  currentRoles={[{ id: 'role-1', nombre: 'Admin' }]}
  onSuccess={() => console.log('Roles updated')}
  onCancel={() => console.log('Cancelled')}
/>

// PermissionViewer - View user permissions
<PermissionViewer userId="user-id" />
```

## API Endpoints Used

The components interact with the following backend endpoints:

- `GET /users` - Fetch all users for tenant
- `GET /users/:id` - Fetch single user details
- `POST /users` - Create new user
- `PUT /users/:id` - Update user
- `POST /users/:id/activate` - Activate user
- `POST /users/:id/deactivate` - Deactivate user
- `POST /users/:id/reset-password` - Reset user password
- `GET /users/:id/roles` - Get user roles
- `POST /users/:id/roles` - Assign roles to user
- `DELETE /users/:id/roles/:roleId` - Remove role from user
- `GET /users/:id/permissions` - Get user permissions
- `GET /roles` - Fetch all roles for tenant

## Tenant Isolation

All components automatically filter data by the authenticated user's tenant_id through:

1. JWT token containing tenant_id
2. TenantContext providing tenant information
3. Backend middleware enforcing tenant isolation
4. Row Level Security (RLS) at database level

## Security Features

- Route protection at page level
- Tenant isolation enforced by backend
- Role-based access control
- Audit logging of all actions
- Password reset with secure tokens
- Account lockout after failed attempts

## Styling

Components use Tailwind CSS with the following design system:

- Consistent spacing and typography
- Responsive layouts (mobile-first)
- Accessible color contrast
- Loading states and animations
- Error handling with toast notifications

## Future Enhancements

Potential improvements for future iterations:

- Bulk user operations (import/export)
- Advanced filtering and sorting
- User activity timeline
- Permission templates
- Custom role creation from UI
- User groups/teams
- Email notification preferences
