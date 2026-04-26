/**
 * Permission and Role type definitions
 * Exported separately to avoid circular dependency issues
 */

export interface Permission {
  id: string;
  tenant_id: string;
  modulo: string;
  accion: string;
  recurso: string;
  descripcion: string;
  activo: boolean;
  created_at: Date;
}

export interface Role {
  id: string;
  tenant_id: string;
  nombre: string;
  descripcion: string;
  permisos: any;
  is_system_role: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface RolePermission {
  role_id: string;
  permiso_id: string;
  concedido: boolean;
}
