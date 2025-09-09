"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseService = void 0;
const common_1 = require("@nestjs/common");
const supabase_js_1 = require("@supabase/supabase-js");
let SupabaseService = class SupabaseService {
    constructor() {
        this.supabase = null;
        this.mockDatabase = new Map();
        this.useMock = false;
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
            this.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
            this.useMock = false;
            console.log('✅ Cliente Supabase inicializado correctamente');
        }
        catch (error) {
            console.error('❌ Error inicializando Supabase, cambiando a modo mock:', error);
            this.useMock = true;
            this.initMockDatabase();
        }
    }
    initMockDatabase() {
        console.log('🔧 Inicializando base de datos mock LIMPIA...');
        this.mockDatabase.set('productos', []);
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
    getClient() {
        if (this.useMock) {
            throw new Error('Cliente Supabase no disponible en modo mock');
        }
        if (!this.supabase) {
            throw new Error('Cliente Supabase no inicializado');
        }
        return this.supabase;
    }
    async mockSelect(table, options = {}) {
        const data = this.mockDatabase.get(table) || [];
        console.log(`📋 Mock SELECT from ${table}:`, data.length, 'registros');
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
    async mockInsert(table, insertData) {
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
    query(table) {
        if (this.useMock) {
            return {
                select: (columns = '*') => this.mockQueryBuilder(table, 'select', { columns }),
                insert: (data) => this.mockQueryBuilder(table, 'insert', { data }),
                update: (data) => this.mockQueryBuilder(table, 'update', { data }),
                delete: () => this.mockQueryBuilder(table, 'delete', {}),
                eq: (field, value) => this.mockQueryBuilder(table, 'eq', { field, value }),
                order: (field, options) => this.mockQueryBuilder(table, 'order', { field, options }),
                limit: (count) => this.mockQueryBuilder(table, 'limit', { count })
            };
        }
        return this.supabase.from(table);
    }
    mockQueryBuilder(table, operation, params) {
        return {
            select: (columns = '*') => this.mockQueryBuilder(table, 'select', { ...params, columns }),
            eq: (field, value) => this.mockQueryBuilder(table, 'eq', { ...params, field, value }),
            order: (field, options) => this.mockQueryBuilder(table, 'order', { ...params, field, options }),
            limit: (count) => this.mockQueryBuilder(table, 'limit', { ...params, count }),
            single: () => this.mockExecuteQuery(table, operation, { ...params, single: true }),
            then: (callback) => this.mockExecuteQuery(table, operation, params).then(callback)
        };
    }
    async mockExecuteQuery(table, operation, params) {
        switch (operation) {
            case 'select':
                return this.mockSelect(table, params);
            case 'insert':
                return this.mockInsert(table, params.data);
            default:
                return { data: [], error: null };
        }
    }
    async select(table, columns = '*') {
        if (this.useMock) {
            return this.mockSelect(table);
        }
        return this.supabase.from(table).select(columns);
    }
    async insert(table, data) {
        if (this.useMock) {
            return this.mockInsert(table, data);
        }
        return this.supabase.from(table).insert(data);
    }
    async update(table, data, filters) {
        if (this.useMock) {
            console.log(`🔄 Mock UPDATE ${table}:`, data, 'filters:', filters);
            return { data, error: null };
        }
        return this.supabase.from(table).update(data).match(filters);
    }
    async delete(table, filters) {
        if (this.useMock) {
            console.log(`🗑️ Mock DELETE from ${table}:`, filters);
            return { data: null, error: null };
        }
        return this.supabase.from(table).delete().match(filters);
    }
    isMockMode() {
        return this.useMock;
    }
};
exports.SupabaseService = SupabaseService;
exports.SupabaseService = SupabaseService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], SupabaseService);
//# sourceMappingURL=supabase.service.js.map