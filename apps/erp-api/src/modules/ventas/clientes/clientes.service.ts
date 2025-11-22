import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { CreateClienteDto, UpdateClienteDto, ValidarRucDto } from './dto';
import { Cliente } from './entities/cliente.entity';
import axios from 'axios';

/**
 * ClientesService
 * Servicio para gestionar clientes del módulo de ventas
 * Requirements: 1.1, 1.5, 1.7, 1.8, 19.3
 */
@Injectable()
export class ClientesService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Crear un nuevo cliente
   * Valida duplicados por RUC/DNI
   * Requirements: 1.2, 1.5, 15.7
   */
  async create(createClienteDto: CreateClienteDto, tenantId: string, userId?: string): Promise<Cliente> {
    const client = this.supabase.getClient();

    // Validar duplicados por numero_documento
    const { data: existingCliente } = await client
      .from('clientes')
      .select('id, numero_documento')
      .eq('tenant_id', tenantId)
      .eq('numero_documento', createClienteDto.documento_numero)
      .maybeSingle();

    if (existingCliente) {
      throw new ConflictException(
        `Ya existe un cliente con el ${createClienteDto.documento_tipo} ${createClienteDto.documento_numero}`
      );
    }

    // Crear cliente
    // Mapear tipo_documento a 1 carácter para la columna tipo_documento (varchar 1)
    const tipoDocumentoMap: Record<string, string> = {
      'DNI': 'D',
      'RUC': 'R',
      'CE': 'C',
      'PASAPORTE': 'P'
    };
    const tipoDocumentoCorto = tipoDocumentoMap[createClienteDto.documento_tipo] || 'D';
    
    console.log('🔍 [DEBUG] createClienteDto.tipo:', createClienteDto.tipo);
    console.log('🔍 [DEBUG] documento_tipo:', createClienteDto.documento_tipo, '→ tipo_documento:', tipoDocumentoCorto);
    
    const insertData = {
      tenant_id: tenantId,
      tipo: createClienteDto.tipo, // PERSONA o EMPRESA
      tipo_documento: tipoDocumentoCorto, // D, R, C, P (columna varchar 1 - NOT NULL)
      documento_tipo: createClienteDto.documento_tipo, // DNI, RUC, CE, PASAPORTE (columna varchar 11)
      numero_documento: createClienteDto.documento_numero,
      razon_social: createClienteDto.razon_social,
      nombre_comercial: createClienteDto.nombre_comercial || null,
      direccion: createClienteDto.direccion || null,
      email: createClienteDto.email || null,
      telefono: createClienteDto.telefono || null,
      contacto: createClienteDto.nombre_comercial || null,
      activo: true,
    };
    
    console.log('🔍 [DEBUG] Datos a insertar:', JSON.stringify(insertData, null, 2));
    
    const { data, error} = await client
      .from('clientes')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Error creating cliente:', error);
      throw new BadRequestException('Error al crear el cliente');
    }

    console.log('✅ [ClientesService] Cliente creado:', data.id);
    return data;
  }

  /**
   * Listar todos los clientes con filtros y búsqueda
   * Requirements: 1.1, 1.7, 24.1, 24.2
   */
  async findAll(
    tenantId: string,
    filters?: {
      search?: string;
      tipo?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<{ data: Cliente[]; pagination: any }> {
    const client = this.supabase.getClient();

    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const offset = (page - 1) * limit;

    let query = client
      .from('clientes')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId);

    // Filtro por tipo
    if (filters?.tipo) {
      query = query.eq('tipo', filters.tipo);
    }

    // Búsqueda por RUC, DNI, razón social o nombre comercial
    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      query = query.or(
        `numero_documento.ilike.${searchTerm},razon_social.ilike.${searchTerm},nombre_comercial.ilike.${searchTerm}`
      );
    }

    // Ordenar y paginar
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('❌ [ClientesService] Error fetching clientes:', error);
      throw new BadRequestException('Error al obtener clientes');
    }

    console.log(`✅ [ClientesService] Clientes encontrados: ${data?.length || 0} de ${count || 0} total`);
    if (data && data.length > 0) {
      console.log(`📋 [ClientesService] Primeros clientes:`, data.slice(0, 3).map(c => ({
        id: c.id,
        razon_social: c.razon_social,
        documento: `${c.documento_tipo}-${c.numero_documento}`
      })));
    }

    return {
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Obtener un cliente por ID con relaciones
   * Requirements: 1.6, 24.3
   */
  async findOne(id: string, tenantId: string): Promise<Cliente> {
    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('clientes')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !data) {
      console.error('Error fetching cliente:', error);
      throw new NotFoundException('Cliente no encontrado');
    }

    return data;
  }

  /**
   * Actualizar un cliente
   * Requirements: 1.8
   */
  async update(id: string, updateClienteDto: UpdateClienteDto, tenantId: string): Promise<Cliente> {
    const client = this.supabase.getClient();

    // Verificar que el cliente existe
    await this.findOne(id, tenantId);

    // Si se está actualizando el documento, validar duplicados
    if (updateClienteDto.documento_numero) {
      const { data: existingCliente } = await client
        .from('clientes')
        .select('id, numero_documento')
        .eq('tenant_id', tenantId)
        .eq('numero_documento', updateClienteDto.documento_numero)
        .neq('id', id)
        .single();

      if (existingCliente) {
        throw new ConflictException(
          `Ya existe otro cliente con el documento ${updateClienteDto.documento_numero}`
        );
      }
    }

    // Actualizar cliente
    const { data, error } = await client
      .from('clientes')
      .update({
        ...updateClienteDto,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      console.error('Error updating cliente:', error);
      throw new BadRequestException('Error al actualizar el cliente');
    }

    console.log('✅ [ClientesService] Cliente actualizado:', id);
    return data;
  }

  /**
   * Eliminar un cliente
   * Verifica dependencias antes de eliminar
   * Requirements: 1.8
   */
  async delete(id: string, tenantId: string): Promise<void> {
    const client = this.supabase.getClient();

    // Verificar que el cliente existe
    await this.findOne(id, tenantId);

    // Verificar dependencias en cotizaciones
    const { data: cotizaciones } = await client
      .from('cotizaciones')
      .select('id')
      .eq('cliente_id', id)
      .limit(1);

    if (cotizaciones && cotizaciones.length > 0) {
      throw new BadRequestException(
        'No se puede eliminar el cliente porque tiene cotizaciones asociadas'
      );
    }

    // Verificar dependencias en pedidos
    const { data: pedidos } = await client
      .from('pedidos_venta')
      .select('id')
      .eq('cliente_id', id)
      .limit(1);

    if (pedidos && pedidos.length > 0) {
      throw new BadRequestException(
        'No se puede eliminar el cliente porque tiene pedidos asociados'
      );
    }

    // Eliminar cliente
    const { error } = await client
      .from('clientes')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('Error deleting cliente:', error);
      throw new BadRequestException('Error al eliminar el cliente');
    }

    console.log('✅ [ClientesService] Cliente eliminado:', id);
  }

  /**
   * Validar RUC con API de SUNAT
   * Requirements: 1.4, 19.3
   */
  async validarRUC(validarRucDto: ValidarRucDto): Promise<any> {
    try {
      // Nota: Esta es una implementación de ejemplo
      // En producción, deberías usar una API real de SUNAT o un servicio de terceros
      // Por ejemplo: https://api.apis.net.pe/v1/ruc?numero={ruc}
      
      const ruc = validarRucDto.ruc;
      
      // Validación básica del formato
      if (!/^[0-9]{11}$/.test(ruc)) {
        throw new BadRequestException('El RUC debe tener exactamente 11 dígitos');
      }

      // Aquí iría la integración real con SUNAT
      // Por ahora retornamos una respuesta de ejemplo
      console.log('🔍 [ClientesService] Validando RUC:', ruc);
      
      // Simulación de respuesta (en producción, hacer llamada real a API)
      return {
        ruc,
        razon_social: 'EMPRESA DE EJEMPLO S.A.C.',
        estado: 'ACTIVO',
        condicion: 'HABIDO',
        direccion: 'AV. EJEMPLO 123, LIMA',
        validado: true,
        mensaje: 'RUC válido (simulado)',
      };
    } catch (error) {
      console.error('Error validating RUC:', error);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new BadRequestException('Error al validar el RUC con SUNAT');
    }
  }
}
