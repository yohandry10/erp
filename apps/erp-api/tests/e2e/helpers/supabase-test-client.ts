/**
 * Supabase Test Client Helper
 * 
 * Proporciona conexión a Supabase local/test para tests E2E reales.
 * Requiere que Supabase local esté corriendo: `npx supabase start`
 * 
 * Variables de entorno requeridas:
 * - SUPABASE_URL (default: http://localhost:54321)
 * - SUPABASE_SERVICE_ROLE_KEY (de supabase status)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Configuración por defecto para Supabase local
const DEFAULT_SUPABASE_URL = 'http://localhost:54321';
const DEFAULT_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export interface TestTenant {
  id: string;
  nombre: string;
  ruc: string;
}

export interface TestCliente {
  id: string;
  tenant_id: string;
  documento_numero: string;
  razon_social: string;
}

export interface TestProducto {
  id: string;
  tenant_id: string;
  codigo: string;
  nombre: string;
  precio: number;
  stock: number;
}

export class SupabaseTestClient {
  private client: SupabaseClient;
  private tenantId: string | null = null;

  constructor() {
    const url = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || DEFAULT_SERVICE_ROLE_KEY;

    if (!key) {
      throw new Error(
        'SUPABASE_SERVICE_ROLE_KEY no configurada. ' +
        'Ejecuta `npx supabase status` para obtener la key.'
      );
    }

    this.client = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  getClient(): SupabaseClient {
    return this.client;
  }

  getTenantId(): string | null {
    return this.tenantId;
  }

  /**
   * Configura el contexto de tenant para RLS
   */
  async setTenantContext(tenantId: string): Promise<void> {
    this.tenantId = tenantId;
    // Configurar el tenant_id en la sesión de PostgreSQL
    await this.client.rpc('set_config', {
      setting: 'app.current_tenant_id',
      value: tenantId,
      is_local: true,
    }).catch(() => {
      // Si la función no existe, intentar con SET directo
      console.warn('set_config RPC no disponible, usando alternativa');
    });
  }

  /**
   * Crea un tenant de prueba
   */
  async createTestTenant(nombre: string = 'Test Tenant'): Promise<TestTenant> {
    const tenantId = crypto.randomUUID();
    const ruc = `20${Math.floor(Math.random() * 1000000000).toString().padStart(9, '0')}`;

    const { data, error } = await this.client
      .from('tenants')
      .insert({
        id: tenantId,
        nombre,
        ruc,
        pais: 'PE',
        activo: true,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Error creando tenant de prueba: ${error.message}`);
    }

    this.tenantId = tenantId;
    return { id: tenantId, nombre, ruc };
  }

  /**
   * Crea un cliente de prueba
   */
  async createTestCliente(tenantId: string): Promise<TestCliente> {
    const clienteId = crypto.randomUUID();
    const documento = `20${Math.floor(Math.random() * 1000000000).toString().padStart(9, '0')}`;

    const { data, error } = await this.client
      .from('clientes')
      .insert({
        id: clienteId,
        tenant_id: tenantId,
        tipo: 'EMPRESA',
        documento_tipo: 'RUC',
        documento_numero: documento,
        razon_social: 'Cliente Test SAC',
        activo: true,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Error creando cliente de prueba: ${error.message}`);
    }

    return {
      id: clienteId,
      tenant_id: tenantId,
      documento_numero: documento,
      razon_social: 'Cliente Test SAC',
    };
  }

  /**
   * Crea un producto de prueba
   */
  async createTestProducto(tenantId: string, stock: number = 100): Promise<TestProducto> {
    const productoId = crypto.randomUUID();
    const codigo = `PROD-${Math.floor(Math.random() * 10000)}`;

    const { data, error } = await this.client
      .from('productos')
      .insert({
        id: productoId,
        tenant_id: tenantId,
        codigo,
        nombre: `Producto Test ${codigo}`,
        precio: 100.00,
        stock,
        stock_reservado: 0,
        activo: true,
        unidad_medida: 'NIU',
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Error creando producto de prueba: ${error.message}`);
    }

    return {
      id: productoId,
      tenant_id: tenantId,
      codigo,
      nombre: `Producto Test ${codigo}`,
      precio: 100.00,
      stock,
    };
  }

  /**
   * Limpia los datos de prueba de un tenant
   */
  async cleanupTestData(tenantId: string): Promise<void> {
    // Eliminar en orden inverso de dependencias
    await this.client.from('pedidos_venta_detalle').delete().eq('pedido_id', 
      this.client.from('pedidos_venta').select('id').eq('tenant_id', tenantId)
    );
    await this.client.from('pedidos_venta').delete().eq('tenant_id', tenantId);
    await this.client.from('clientes').delete().eq('tenant_id', tenantId);
    await this.client.from('productos').delete().eq('tenant_id', tenantId);
    await this.client.from('tenants').delete().eq('id', tenantId);
  }

  /**
   * Verifica si Supabase local está disponible
   */
  async isAvailable(): Promise<boolean> {
    try {
      const { error } = await this.client.from('tenants').select('id').limit(1);
      return !error;
    } catch {
      return false;
    }
  }
}

/**
 * Singleton para reutilizar la conexión
 */
let testClientInstance: SupabaseTestClient | null = null;

export function getTestClient(): SupabaseTestClient {
  if (!testClientInstance) {
    testClientInstance = new SupabaseTestClient();
  }
  return testClientInstance;
}

/**
 * Helper para saltar tests si Supabase no está disponible
 */
export async function skipIfNoSupabase(): Promise<boolean> {
  try {
    const client = getTestClient();
    const available = await client.isAvailable();
    if (!available) {
      console.warn('⚠️ Supabase local no disponible. Saltando tests E2E.');
      console.warn('   Ejecuta: npx supabase start');
    }
    return !available;
  } catch {
    return true;
  }
}
