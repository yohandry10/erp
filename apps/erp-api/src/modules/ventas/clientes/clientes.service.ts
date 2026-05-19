import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { AuditService } from '../../audit/audit.service';
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
  constructor(
    private readonly supabase: SupabaseService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Crear un nuevo cliente
   * Valida duplicados por RUC/DNI
   * Requirements: 1.2, 1.5, 15.7
   */
  async create(createClienteDto: CreateClienteDto, tenantId: string, userId?: string): Promise<Cliente> {
    const client = this.supabase.getClient();
    const documentoTexto = String(createClienteDto.documento_numero || '').trim();
    const documentoNumero = this.toSafeIntegerDocument(documentoTexto);

    if (!/^\d+$/.test(documentoTexto)) {
      throw new BadRequestException('El número de documento debe ser numérico');
    }

    // Validar duplicados por documento textual. RUC de 11 dígitos excede integer, por eso no se filtra solo por numero_documento.
    const { data: existingCliente } = await client
      .from('clientes')
      .select('id, numero_documento, codigo, ruc')
      .eq('tenant_id', tenantId)
      .or(`codigo.eq.${documentoTexto},ruc.eq.${documentoTexto}`)
      .maybeSingle();

    if (existingCliente) {
      throw new ConflictException(
        `Ya existe un cliente con el ${createClienteDto.documento_tipo} ${createClienteDto.documento_numero}`
      );
    }

    // Crear cliente usando solo columnas reales del esquema runtime.
    const insertData = {
      tenant_id: tenantId,
      tipo: createClienteDto.tipo, // PERSONA o EMPRESA
      tipo_documento: createClienteDto.documento_tipo,
      documento_tipo: createClienteDto.documento_tipo,
      documento_numero: documentoNumero,
      numero_documento: documentoNumero,
      razon_social: createClienteDto.razon_social,
      nombre: createClienteDto.razon_social,
      codigo: documentoTexto,
      direccion: createClienteDto.direccion || null,
      email: createClienteDto.email || null,
      ruc: createClienteDto.documento_tipo === 'RUC' ? documentoTexto : null,
      activo: true,
    };
    
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
    if (userId) {
      await this.auditService.registrarCambio(
        'clientes',
        'INSERT',
        userId,
        { new: data },
        tenantId,
        data.id,
        { accion: 'CREAR_CLIENTE' },
      ).catch((error) => console.warn('⚠️ No se pudo registrar auditoría de creación de cliente:', error));
    }
    return data;
  }

  private toSafeIntegerDocument(documento: string): number | null {
    if (!/^\d+$/.test(documento)) return null;
    const parsed = Number(documento);
    return Number.isSafeInteger(parsed) && parsed <= 2147483647 ? parsed : null;
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
      const rawSearch = filters.search.trim();
      const searchTerm = `%${rawSearch.replace(/[%_,]/g, '')}%`;
      const numericSearch = this.toSafeIntegerDocument(rawSearch);
      const textFilters = [
        `razon_social.ilike.${searchTerm}`,
        `nombre.ilike.${searchTerm}`,
        `codigo.ilike.${searchTerm}`,
        `ruc.ilike.${searchTerm}`,
      ];

      if (numericSearch !== null) {
        query = query.or([
          `numero_documento.eq.${numericSearch}`,
          `documento_numero.eq.${numericSearch}`,
          ...textFilters,
        ].join(','));
      } else {
        query = query.or(textFilters.join(','));
      }
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
  async update(id: string, updateClienteDto: UpdateClienteDto, tenantId: string, userId?: string): Promise<Cliente> {
    const client = this.supabase.getClient();

    // Verificar que el cliente existe
    const previousCliente = await this.findOne(id, tenantId);

    const updateData: Record<string, any> = {};

    if (updateClienteDto.tipo !== undefined) updateData.tipo = updateClienteDto.tipo;
    if (updateClienteDto.documento_tipo !== undefined) {
      updateData.tipo_documento = updateClienteDto.documento_tipo;
      updateData.documento_tipo = updateClienteDto.documento_tipo;
    }
    if (updateClienteDto.documento_numero !== undefined) {
      const documentoTexto = String(updateClienteDto.documento_numero || '').trim();
      if (!/^\d+$/.test(documentoTexto)) {
        throw new BadRequestException('El número de documento debe ser numérico');
      }
      const documentoNumero = this.toSafeIntegerDocument(documentoTexto);
      updateData.documento_numero = documentoNumero;
      updateData.numero_documento = documentoNumero;
      updateData.codigo = documentoTexto;
      const tipoDocumento = updateClienteDto.documento_tipo || previousCliente.documento_tipo || (previousCliente as any).tipo_documento;
      updateData.ruc = tipoDocumento === 'RUC' ? documentoTexto : null;
    }
    if (updateClienteDto.razon_social !== undefined) {
      updateData.razon_social = updateClienteDto.razon_social;
      updateData.nombre = updateClienteDto.razon_social;
    }
    if (updateClienteDto.direccion !== undefined) updateData.direccion = updateClienteDto.direccion || null;
    if (updateClienteDto.email !== undefined) updateData.email = updateClienteDto.email || null;

    // Si se está actualizando el documento, validar duplicados usando el documento textual canónico.
    if (updateClienteDto.documento_numero) {
      const documentoTexto = String(updateClienteDto.documento_numero).trim();
      const { data: existingCliente } = await client
        .from('clientes')
        .select('id, numero_documento, codigo, ruc')
        .eq('tenant_id', tenantId)
        .or(`codigo.eq.${documentoTexto},ruc.eq.${documentoTexto}`)
        .neq('id', id)
        .maybeSingle();

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
        ...updateData,
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
    if (userId) {
      await this.auditService.registrarCambio(
        'clientes',
        'UPDATE',
        userId,
        { old: previousCliente as any, new: data },
        tenantId,
        id,
        { accion: 'EDITAR_CLIENTE' },
      ).catch((error) => console.warn('⚠️ No se pudo registrar auditoría de edición de cliente:', error));
    }
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
      
      // Validación de formato
      if (!/^[0-9]{11}$/.test(ruc)) {
        throw new BadRequestException('El RUC debe tener exactamente 11 dígitos');
      }

      // Validar prefijo (10=persona natural, 15=no domiciliado, 17=no domiciliado, 20=empresa)
      const prefijo = ruc.substring(0, 2);
      if (!['10', '15', '17', '20'].includes(prefijo)) {
        throw new BadRequestException(`Prefijo de RUC inválido: ${prefijo}. Debe iniciar con 10, 15, 17 o 20`);
      }

      // Validar dígito verificador (módulo 11 SUNAT)
      const factores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
      const digitos = ruc.split('').map(Number);
      const suma = factores.reduce((acc, factor, i) => acc + factor * digitos[i], 0);
      const resto = 11 - (suma % 11);
      const digitoVerificador = resto === 10 ? 0 : resto === 11 ? 1 : resto;
      if (digitoVerificador !== digitos[10]) {
        throw new BadRequestException('RUC inválido: dígito verificador no coincide');
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
