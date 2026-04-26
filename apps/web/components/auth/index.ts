/**
 * Permission-based access control components
 * 
 * @module components/auth
 */

export {
  ProtectedComponent,
  withPermission,
  PermissionSwitch,
} from './ProtectedComponent'

export { default as RequestPasswordReset } from './RequestPasswordReset'
export { default as ResetPassword } from './ResetPassword'