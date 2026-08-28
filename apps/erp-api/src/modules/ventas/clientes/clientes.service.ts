import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { CreateClienteDto, UpdateClienteDto, ValidarRucDto } from './dto';
import { Cliente } from './entities/cliente.entity';
import { validarDocumentoIdentidad, validarRucPeru } from '../../../shared/utils/documento-identidad-peru.util';
import { validateArgentinaTaxId } from '../../fiscal/arca-fiscal.service';
import { validateColombiaNit } from '../../paises/initial-country';
import { PadronRucService } from '../../contabilidad/services/padron-ruc.service';

function validarDocumentoCliente(tipo: string, numero: string) {
  if (tipo === 'CUIT') {
    return {
      valido: validateArgentinaTaxId(numero),
      error: 'El CUIT debe tener 11 dígitos y un dígito verificador válido',
    };
  }
  if (tipo === 'NIT') {
    const digits = numero.replace(/\D/g, '');
    const nitConDv = digits.length >= 10
      ? `${digits.slice(0, -1)}-${digits.slice(-1)}`
      : numero;
    return {
      valido: validateColombiaNit(nitConDv),
      error: 'El NIT debe incluir una base válida y su dígito de verificación',
    };
  }
  if (tipo === 'CC' || tipo === 'TI') {
    return /^[0-9]{6,10}$/.test(numero)
      ? { valido: true }
      : { valido: false, error: `La ${tipo} debe tener entre 6 y 10 dígitos` };
  }
  return validarDocumentoIdentidad(tipo, numero);
}

/**
 * ClientesService
 * Servicio para gestionar clientes del módulo de ventas
 * Requirements: 1.1, 1.5, 1.7, 1.8, 19.3
 */
@Injectable()
export class ClientesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly padronRuc: PadronRucService,
  ) {}

  /**
   * Crear un nuevo cliente
   * Valida duplicados por RUC/DNI
   * Requirements: 1.2, 1.5, 15.7
   */
  async create(createClienteDto: CreateClienteDto, tenantId: string, userId?: string): Promise<Cliente> {
    const client = this.supabase.getClient();
    const documentoTexto = String(createClienteDto.documento_numero || '').trim();

    if (!userId) {
      throw new BadRequestException('Se requiere un usuario autenticado para crear el cliente');
    }

    // El documento del cliente termina en el comprobante: un RUC con dígito
    // verificador incorrecto o un DNI de once dígitos se aceptaban en el alta y
    // hacían que SUNAT rechazara la factura emitida a ese cliente.
    const validacionDocumento = validarDocumentoCliente(
      createClienteDto.documento_tipo,
      documentoTexto,
    );
    if (!validacionDocumento.valido) {
      throw new BadRequestException(validacionDocumento.error);
    }

    const { data, error } = await client.rpc('crear_cliente_maestro_tx', {
      p_tenant_id: tenantId,
      p_actor_id: userId,
      p_cliente: createClienteDto,
    });
    if (error) {
      this.throwMasterError(error, 'cliente');
    }
    return this.conDocumentoTextual(data as Record<string, any>) as Cliente;
  }

  /**
   * El documento textual del cliente vive en las columnas `codigo`/`ruc`: un
   * RUC de once dígitos desborda el integer de `documento_numero`, así que esa
   * columna queda en null para toda empresa y las pantallas que la leen muestran
   * el documento vacío. Al leer se devuelve el valor real.
   */
  private conDocumentoTextual<T extends Record<string, any>>(fila: T): T {
    if (!fila) return fila;
    const documento = fila.ruc ?? fila.codigo ?? fila.numero_documento ?? fila.documento_numero;
    return documento == null || documento === ''
      ? fila
      : { ...fila, documento_numero: String(documento) };
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
        `nombre_comercial.ilike.${searchTerm}`,
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
      data: (data || []).map((fila) => this.conDocumentoTextual(fila)),
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

    return this.conDocumentoTextual(data);
  }

  /**
   * Actualizar un cliente
   * Requirements: 1.8
   */
  async update(id: string, updateClienteDto: UpdateClienteDto, tenantId: string, userId?: string): Promise<Cliente> {
    const client = this.supabase.getClient();
    const previousCliente = await this.findOne(id, tenantId);
    if (!userId) {
      throw new BadRequestException('Se requiere un usuario autenticado para editar el cliente');
    }
    const documentoTexto = String(
      updateClienteDto.documento_numero ?? previousCliente.documento_numero ?? '',
    ).trim();
    const tipoDocumento = updateClienteDto.documento_tipo
      ?? previousCliente.documento_tipo
      ?? (previousCliente as any).tipo_documento;
    const validacionDocumento = validarDocumentoCliente(tipoDocumento, documentoTexto);
    if (!validacionDocumento.valido) {
      throw new BadRequestException(validacionDocumento.error);
    }
    const { data, error } = await client.rpc('actualizar_cliente_maestro_tx', {
      p_cliente_id: id,
      p_tenant_id: tenantId,
      p_actor_id: userId,
      p_cambios: updateClienteDto,
    });
    if (error) {
      this.throwMasterError(error, 'cliente');
    }
    return this.conDocumentoTextual(data as Record<string, any>) as Cliente;
  }

  /**
   * Eliminar un cliente
   * Verifica dependencias antes de eliminar
   * Requirements: 1.8
   */
  async delete(id: string, tenantId: string, userId?: string): Promise<void> {
    const client = this.supabase.getClient();
    if (!userId) {
      throw new BadRequestException('Se requiere un usuario autenticado para desactivar el cliente');
    }
    const { error } = await client.rpc('desactivar_cliente_maestro_tx', {
      p_cliente_id: id,
      p_tenant_id: tenantId,
      p_actor_id: userId,
    });
    if (error) {
      this.throwMasterError(error, 'cliente');
    }
  }

  private throwMasterError(error: any, entity: 'cliente'): never {
    const message = String(error?.message || '');
    if (error?.code === '23505' || message.includes('IDENTITY_CONFLICT')) {
      throw new ConflictException('Ya existe otro cliente con esa identidad');
    }
    if (error?.code === 'P0002' || message.includes('NOT_FOUND')) {
      throw new NotFoundException('Cliente no encontrado');
    }
    throw new BadRequestException(`No se pudo guardar el ${entity}`);
  }

  /**
   * Validar localmente formato y dígito verificador del RUC
   * Requirements: 1.4, 19.3
   */
  async validarRUC(validarRucDto: ValidarRucDto): Promise<any> {
    try {
      const ruc = validarRucDto.ruc;

      // Misma regla que aplica el alta de clientes, en un solo sitio.
      const validacion = validarRucPeru(ruc);
      if (!validacion.valido) {
        throw new BadRequestException(validacion.error);
      }

      // El dígito verificador solo descarta un número mal tecleado. Lo que decide
      // si conviene facturar a alguien es el padrón: si está de baja o no habido.
      const enElPadron = await this.padronRuc.consultar(ruc);

      if (!enElPadron) {
        // `null` es «no se pudo comprobar», nunca «no existe»: la fuente puede
        // estar caída. Se dice tal cual en vez de dar por bueno el contribuyente.
        return {
          ruc,
          validado_formato: true,
          consulta_sunat: false,
          fuente: 'VALIDACION_LOCAL',
          mensaje: 'RUC válido por formato y dígito verificador; no se pudo consultar el padrón SUNAT',
        };
      }

      return {
        ruc,
        validado_formato: true,
        consulta_sunat: true,
        fuente: enElPadron.fuente,
        razon_social: enElPadron.razonSocial,
        direccion: enElPadron.direccion,
        estado: enElPadron.estado,
        condicion: enElPadron.condicion,
        consultado_en: enElPadron.consultadoEn,
        mensaje: `${enElPadron.razonSocial ?? 'Contribuyente'} — ${enElPadron.estado ?? 'estado desconocido'}, ${enElPadron.condicion ?? 'condición desconocida'}`,
      };
    } catch (error) {
      console.error('Error validating RUC:', error);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException('Error al validar el RUC');
    }
  }
}
