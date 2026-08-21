import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ProveedoresRepository } from '../repositories/proveedores.repository';
import { CreateProveedorDto } from '../dto/create-proveedor.dto';
import { UpdateProveedorDto } from '../dto/update-proveedor.dto';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { validarCuilArgentina } from '../../rrhh/planillas-argentina.util';
import {  ACTIVE_COUNTRY_MESSAGE,  ActiveCountryCode,  getActiveCountryByCode,  validateColombiaNit,} from '../../paises/initial-country';

@Injectable()
export class ProveedoresService {
  constructor(
    private readonly proveedoresRepository: ProveedoresRepository,
    private readonly supabaseService: SupabaseService,
  ) {}

  async findAll(tenantId: string, filters?: { 
    activo?: boolean; 
    search?: string;
    estado?: string;
    condiciones_pago?: string;
    ruc?: string;
    limit?: number;
    offset?: number;
  }) {
    return await this.proveedoresRepository.findAll(tenantId, filters);
  }

  async findById(id: string, tenantId: string) {
    const proveedor = await this.proveedoresRepository.findById(id, tenantId);
    if (!proveedor) {
      throw new NotFoundException(`Proveedor con ID ${id} no encontrado`);
    }
    return proveedor;
  }

  async findByRuc(ruc: string, tenantId: string) {
    return await this.proveedoresRepository.findByRuc(ruc, tenantId);
  }

  async create(createDto: CreateProveedorDto, tenantId: string, userId?: string) {
    if (!userId) {
      throw new BadRequestException('Se requiere un usuario autenticado para crear el proveedor');
    }
    const identidad = await this.validateTaxIdentity(createDto.ruc, tenantId);

    // Validar email
    if (!this.isValidEmail(createDto.email)) {
      throw new BadRequestException('El email proporcionado no es válido');
    }

    // Validar límite de crédito
    if (createDto.limite_credito !== undefined && createDto.limite_credito < 0) {
      throw new BadRequestException('El límite de crédito no puede ser negativo');
    }

    const payload = {
      ...createDto,
      ruc: identidad.ruc,
      documento_tipo: identidad.documentoTipo,
    };
    const { data, error } = await this.supabaseService.getClient().rpc(
      'crear_proveedor_maestro_tx',
      {
        p_tenant_id: tenantId,
        p_actor_id: userId,
        p_proveedor: payload,
      },
    );
    if (error) {
      this.throwMasterError(error);
    }
    return data;
  }

  async update(id: string, updateDto: UpdateProveedorDto, tenantId: string, userId?: string) {
    if (!userId) {
      throw new BadRequestException('Se requiere un usuario autenticado para editar el proveedor');
    }

    // Si se está actualizando el RUC, validarlo
    const cambios: Record<string, any> = { ...updateDto };
    if (updateDto.ruc) {
      const identidad = await this.validateTaxIdentity(updateDto.ruc, tenantId);
      cambios.ruc = identidad.ruc;
      cambios.documento_tipo = identidad.documentoTipo;
    }

    // Validar email si se proporciona
    if (updateDto.email !== undefined && !this.isValidEmail(updateDto.email)) {
      throw new BadRequestException('El email proporcionado no es válido');
    }

    // Validar límite de crédito
    if (updateDto.limite_credito !== undefined && updateDto.limite_credito < 0) {
      throw new BadRequestException('El límite de crédito no puede ser negativo');
    }

    const { data, error } = await this.supabaseService.getClient().rpc(
      'actualizar_proveedor_maestro_tx',
      {
        p_proveedor_id: id,
        p_tenant_id: tenantId,
        p_actor_id: userId,
        p_cambios: cambios,
      },
    );
    if (error) {
      this.throwMasterError(error);
    }
    return data;
  }

  async softDelete(id: string, tenantId: string, userId?: string) {
    if (!userId) {
      throw new BadRequestException('Se requiere un usuario autenticado para desactivar el proveedor');
    }
    const { data, error } = await this.supabaseService.getClient().rpc(
      'desactivar_proveedor_maestro_tx',
      {
        p_proveedor_id: id,
        p_tenant_id: tenantId,
        p_actor_id: userId,
      },
    );
    if (error) {
      this.throwMasterError(error);
    }
    return data;
  }

  // Métodos de validación privados
  private async getCountryCode(tenantId: string): Promise<ActiveCountryCode> {
    const { data } = await this.supabaseService
      .getClient()
      .from('empresa_config')
      .select('pais')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    // Este país decide si el documento del proveedor se valida como RUC, CUIT o
    // NIT. Suponer Perú comprobaba un CUIT con el algoritmo equivocado.
    const perfil = getActiveCountryByCode((data as any)?.pais);
    if (!perfil) {
      throw new BadRequestException(
        `No se puede validar el documento del proveedor: la empresa no declara un país soportado. ${ACTIVE_COUNTRY_MESSAGE}`,
      );
    }
    return perfil.codigo;
  }

  private async validateTaxIdentity(
    ruc: string,
    tenantId: string,
  ): Promise<{ ruc: string; documentoTipo: 'RUC' | 'CUIT' | 'NIT' }> {
    const pais = await this.getCountryCode(tenantId);
    const rawTaxId = String(ruc || '').trim().replace(/\s+/g, '');

    if (pais === 'CO') {
      const normalizedNit = /^\d{10}$/.test(rawTaxId)
        ? `${rawTaxId.slice(0, 9)}-${rawTaxId.slice(9)}`
        : rawTaxId;
      if (!validateColombiaNit(normalizedNit) || !/^\d{9,10}-\d$/.test(normalizedNit)) {
        throw new BadRequestException('NIT inválido: incluya la base y un dígito de verificación válido');
      }
      return { ruc: normalizedNit, documentoTipo: 'NIT' };
    }

    if (!/^\d{11}$/.test(rawTaxId)) {
      throw new BadRequestException(`El ${pais === 'AR' ? 'CUIT' : 'RUC'} debe tener 11 dígitos`);
    }

    if (pais === 'AR') {
      if (!validarCuilArgentina(rawTaxId)) {
        throw new BadRequestException('CUIT inválido: el dígito verificador no coincide');
      }
      return { ruc: rawTaxId, documentoTipo: 'CUIT' };
    }

    // Validar dígito verificador para RUC peruano (módulo 11 SUNAT)
    const prefijo = rawTaxId.substring(0, 2);
    if (!['10', '15', '17', '20'].includes(prefijo)) {
      throw new BadRequestException(`Prefijo de RUC inválido: ${prefijo}. Debe iniciar con 10, 15, 17 o 20`);
    }
    const factores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const digitos = rawTaxId.split('').map(Number);
    const suma = factores.reduce((acc, factor, i) => acc + factor * digitos[i], 0);
    const resto = 11 - (suma % 11);
    const digitoVerificador = resto === 10 ? 0 : resto === 11 ? 1 : resto;
    if (digitoVerificador !== digitos[10]) {
      throw new BadRequestException('RUC inválido: dígito verificador no coincide');
    }
    return { ruc: rawTaxId, documentoTipo: 'RUC' };
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private throwMasterError(error: any): never {
    const message = String(error?.message || '');
    if (error?.code === '23505' || message.includes('IDENTITY_CONFLICT')) {
      throw new ConflictException('Ya existe otro proveedor con esa identidad fiscal');
    }
    if (error?.code === 'P0002' || message.includes('NOT_FOUND')) {
      throw new NotFoundException('Proveedor no encontrado');
    }
    throw new BadRequestException('No se pudo guardar el proveedor');
  }
}
