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
    console.log('🔧 Inicializando base de datos mock LIMPIA...');
    
    // PRODUCTOS LIMPIOS - SIN HARDCODEOS
    this.mockDatabase.set('productos', []);

    // TODAS LAS TABLAS LIMPIAS - SIN HARDCODEOS DE MIERDA
    this.mockDatabase.set('movimientos_stock', []);
    this.mockDatabase.set('ventas_pos', []);
    this.mockDatabase.set('detalle_ventas_pos', []);
    this.mockDatabase.set('cpe', []);
    this.mockDatabase.set('métodos_pago', []);
    this.mockDatabase.set('clientes', []);
    this.mockDatabase.set('cajas', []);
    this.mockDatabase.set('cuentas_bancarias', []);
    this.mockDatabase.set('gastos', []);
    this.mockDatabase.set('egresos', []);
    this.mockDatabase.set('cuentas_por_cobrar', []);
    this.mockDatabase.set('cuentas_por_pagar', []);

    console.log('✅ Base de datos mock LIMPIA inicializada SIN DATOS HARDCODEADOS');
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