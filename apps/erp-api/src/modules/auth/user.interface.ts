export interface User {
  id: string;
  email: string;
  tenant_id?: string;
  is_super_admin?: boolean;
  roles?: string[];
  // Agrega más campos según tu modelo real
} 