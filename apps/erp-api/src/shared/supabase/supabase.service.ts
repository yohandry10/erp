import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PostgrestQueryBuilder } from '@supabase/postgrest-js';

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient | null = null;
  private mockDatabase: Map<string, any[]> = new Map();
  private useMock: boolean = false;

  constructor() {
    // Intentar primero variables del backend, luego las del frontend
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    console.log('🔍 Verificando configuración de Supabase...');
    console.log('- URL disponible:', !!supabaseUrl);
    console.log('- KEY disponible:', !!supabaseKey);
    
    if (!supabaseUrl || !supabaseKey) {
      console.log('⚠️ Variables de Supabase no configuradas, usando modo mock');
      this.useMock = true;
      this.initMockDatabase();
      return;
    }
    
    try {
      this.supabase = createClient(supabaseUrl, supabaseKey);
      this.useMock = false;
      console.log('✅ Cliente Supabase inicializado correctamente');
    } catch (error) {
      console.error('❌ Error inicializando Supabase, cambiando a modo mock:', error);
      this.useMock = true;
      this.initMockDatabase();
    }
  }

  private initMockDatabase() {
    console.log('🔧 Inicializando base de datos mock...');
    
    // Productos mock con estructura correcta
    this.mockDatabase.set('productos', [
      { 
        identificación: 1,
        código: 'PROD001', 
        nombre: 'Laptop Dell Inspiron 15', 
        precio: 2500.00,
        existencias: 10,
        categorías: 'Tecnología',
        activo: true,
        código_barras: 'PROD001',
        precio_mayorista: 2200.00,
        precio_especial: 2300.00,
        stock_minimo: 5,
        impuesto: 18.0,
        'URL de la imagen': null,
        creado_en: new Date().toISOString()
      },
      { 
        identificación: 2,
        código: 'PROD002', 
        nombre: 'Mouse Logitech MX Master', 
        precio: 150.00,
        existencias: 25,
        categorías: 'Tecnología',
        activo: true,
        código_barras: 'PROD002',
        precio_mayorista: 120.00,
        precio_especial: 140.00,
        stock_minimo: 10,
        impuesto: 18.0,
        'URL de la imagen': null,
        creado_en: new Date().toISOString()
      },
      { 
        identificación: 3,
        código: 'PROD003', 
        nombre: 'Teclado Mecánico RGB', 
        precio: 200.00,
        existencias: 15,
        categorías: 'Tecnología',
        activo: true,
        código_barras: 'PROD003',
        precio_mayorista: 160.00,
        precio_especial: 180.00,
        stock_minimo: 8,
        impuesto: 18.0,
        'URL de la imagen': null,
        creado_en: new Date().toISOString()
      }
    ]);

    // Movimientos de stock mock
    this.mockDatabase.set('movimientos_stock', [
      {
        id: 1,
        producto_id: 1,
        tipo_movimiento: 'ENTRADA',
        cantidad: 5,
        stock_anterior: 5,
        stock_nuevo: 10,
        motivo: 'Compra inicial',
        usuario_id: 1,
        created_at: new Date().toISOString()
      }
    ]);

    // Otras tablas mock
    this.mockDatabase.set('ventas_pos', []);
    this.mockDatabase.set('detalle_ventas_pos', []);
    this.mockDatabase.set('CPE', []);
    this.mockDatabase.set('métodos_pago', [
      { id: 1, codigo: 'EFECTIVO', nombre: 'Efectivo', tipo: 'EFECTIVO', requiere_referencia: false },
      { id: 2, codigo: 'VISA', nombre: 'Tarjeta Visa', tipo: 'TARJETA', requiere_referencia: true }
    ]);
    this.mockDatabase.set('clientes', [
      { id: 1, tipo_documento: 'DNI', numero_documento: '12345678', nombres: 'Juan Carlos', apellidos: 'Pérez López' }
    ]);

    console.log('✅ Base de datos mock inicializada con datos de ejemplo');
  }

  getClient(): SupabaseClient {
    if (this.useMock) {
      throw new Error('Cliente Supabase no disponible en modo mock');
    }
    if (!this.supabase) {
      throw new Error('Cliente Supabase no inicializado');
    }
    return this.supabase;
  }

  // MÉTODOS MOCK PARA DESARROLLO SIN SUPABASE
  async mockSelect(table: string, options: any = {}) {
    const data = this.mockDatabase.get(table) || [];
    console.log(`📋 Mock SELECT from ${table}:`, data.length, 'registros');
    
    // Simular filtros básicos
    let filteredData = [...data];
    if (options.eq) {
      const [field, value] = options.eq;
      filteredData = filteredData.filter(item => item[field] === value);
    }
    
    return {
      data: filteredData,
      error: null,
      status: 200,
      statusText: 'OK',
      count: filteredData.length
    };
  }

  async mockInsert(table: string, insertData: any) {
    const data = this.mockDatabase.get(table) || [];
    const newRecord = {
      identificación: data.length + 1,
      ...insertData,
      creado_en: new Date().toISOString()
    };
    data.push(newRecord);
    this.mockDatabase.set(table, data);
    
    console.log(`✅ Mock INSERT into ${table}:`, newRecord.identificación);
    return {
      data: newRecord,
      error: null,
      status: 201,
      statusText: 'Created'
    };
  }

  // Métodos útiles para el ERP
  query(table: string): any {
    if (this.useMock) {
      // Retornar un objeto que simule la API de Supabase
      return {
        select: (columns = '*') => this.mockQueryBuilder(table, 'select', { columns }),
        insert: (data: any) => this.mockQueryBuilder(table, 'insert', { data }),
        update: (data: any) => this.mockQueryBuilder(table, 'update', { data }),
        delete: () => this.mockQueryBuilder(table, 'delete', {}),
        eq: (field: string, value: any) => this.mockQueryBuilder(table, 'eq', { field, value }),
        order: (field: string, options: any) => this.mockQueryBuilder(table, 'order', { field, options }),
        limit: (count: number) => this.mockQueryBuilder(table, 'limit', { count })
      };
    }
    return this.supabase!.from(table);
  }

  private mockQueryBuilder(table: string, operation: string, params: any): any {
    return {
      select: (columns = '*') => this.mockQueryBuilder(table, 'select', { ...params, columns }),
      eq: (field: string, value: any) => this.mockQueryBuilder(table, 'eq', { ...params, field, value }),
      order: (field: string, options: any) => this.mockQueryBuilder(table, 'order', { ...params, field, options }),
      limit: (count: number) => this.mockQueryBuilder(table, 'limit', { ...params, count }),
      single: () => this.mockExecuteQuery(table, operation, { ...params, single: true }),
      then: (callback: (value: any) => any) => this.mockExecuteQuery(table, operation, params).then(callback)
    };
  }

  private async mockExecuteQuery(table: string, operation: string, params: any): Promise<any> {
    switch (operation) {
      case 'select':
        return this.mockSelect(table, params);
      case 'insert':
        return this.mockInsert(table, params.data);
      default:
        return { data: [], error: null };
    }
  }

  async select(table: string, columns = '*') {
    if (this.useMock) {
      return this.mockSelect(table);
    }
    return this.supabase!.from(table).select(columns);
  }

  async insert(table: string, data: any) {
    if (this.useMock) {
      return this.mockInsert(table, data);
    }
    return this.supabase!.from(table).insert(data);
  }

  async update(table: string, data: any, filters: any) {
    if (this.useMock) {
      console.log(`🔄 Mock UPDATE ${table}:`, data, 'filters:', filters);
      return { data, error: null };
    }
    return this.supabase!.from(table).update(data).match(filters);
  }

  async delete(table: string, filters: any) {
    if (this.useMock) {
      console.log(`🗑️ Mock DELETE from ${table}:`, filters);
      return { data: null, error: null };
    }
    return this.supabase!.from(table).delete().match(filters);
  }

  // MÉTODO HELPER PARA VERIFICAR SI ESTÁ EN MODO MOCK
  isMockMode(): boolean {
    return this.useMock;
  }
} 