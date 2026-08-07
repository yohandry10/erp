import { Injectable, ConflictException, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { ProveedoresRepository } from '../repositories/proveedores.repository';
import { CreateProveedorDto } from '../dto/create-proveedor.dto';
import { UpdateProveedorDto } from '../dto/update-proveedor.dto';
import { AuditService } from '../../audit/audit.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { validarCuilArgentina } from '../../rrhh/planillas-argentina.util';
import { validateColombiaNit } from '../../paises/initial-country';

@Injectable()
export class ProveedoresService {
  constructor(
    private readonly proveedoresRepository: ProveedoresRepository,
    private readonly auditService: AuditService,
    @Optional() private readonly supabaseService?: SupabaseService,
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
    createDto.ruc = await this.validateTaxId(createDto.ruc, tenantId);
    const taxIdLabel = await this.getTaxIdLabel(tenantId);

    // Verificar si ya existe un proveedor con el mismo RUC
    const existingProveedor = await this.proveedoresRepository.findByRuc(createDto.ruc, tenantId);
    if (existingProveedor) {
      throw new ConflictException(`Ya existe un proveedor con ${taxIdLabel} ${createDto.ruc}`);
    }

    // Validar email
    if (!this.isValidEmail(createDto.email)) {
      throw new BadRequestException('El email proporcionado no es válido');
    }

    // Validar límite de crédito
    if (createDto.limite_credito !== undefined && createDto.limite_credito < 0) {
      throw new BadRequestException('El límite de crédito no puede ser negativo');
    }

    const proveedor = await this.proveedoresRepository.create(createDto, tenantId, userId);
    if (userId) {
      await this.auditService.registrarCambio(
        'proveedores',
        'INSERT',
        userId,
        { new: proveedor },
        tenantId,
        proveedor.id,
        { accion: 'CREAR_PROVEEDOR' },
      ).catch((error) => console.warn('⚠️ No se pudo registrar auditoría de creación de proveedor:', error));
    }
    return proveedor;
  }

  async update(id: string, updateDto: UpdateProveedorDto, tenantId: string, userId?: string) {
    // Verificar que el proveedor existe
    const previousProveedor = await this.findById(id, tenantId);

    // Si se está actualizando el RUC, validarlo
    if (updateDto.ruc) {
      updateDto.ruc = await this.validateTaxId(updateDto.ruc, tenantId);
      const taxIdLabel = await this.getTaxIdLabel(tenantId);

      // Verificar que no exista otro proveedor con el mismo RUC
      const existingProveedor = await this.proveedoresRepository.findByRuc(updateDto.ruc, tenantId);
      if (existingProveedor && existingProveedor.id !== id) {
        throw new ConflictException(`Ya existe otro proveedor con ${taxIdLabel} ${updateDto.ruc}`);
      }
    }

    // Validar email si se proporciona
    if (updateDto.email && !this.isValidEmail(updateDto.email)) {
      throw new BadRequestException('El email proporcionado no es válido');
    }

    // Validar límite de crédito
    if (updateDto.limite_credito !== undefined && updateDto.limite_credito < 0) {
      throw new BadRequestException('El límite de crédito no puede ser negativo');
    }

    const proveedor = await this.proveedoresRepository.update(id, updateDto, tenantId);
    if (userId) {
      await this.auditService.registrarCambio(
        'proveedores',
        'UPDATE',
        userId,
        { old: previousProveedor, new: proveedor },
        tenantId,
        id,
        { accion: 'EDITAR_PROVEEDOR' },
      ).catch((error) => console.warn('⚠️ No se pudo registrar auditoría de edición de proveedor:', error));
    }
    return proveedor;
  }

  async softDelete(id: string, tenantId: string) {
    // Verificar que el proveedor existe
    await this.findById(id, tenantId);

    return await this.proveedoresRepository.softDelete(id, tenantId);
  }

  // Métodos de validación privados
  private async getCountryCode(tenantId: string): Promise<'PE' | 'AR' | 'CO'> {
    let pais = 'PE';
    if (this.supabaseService) {
      const { data } = await this.supabaseService
        .getClient()
        .from('empresa_config')
        .select('pais')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      pais = String(data?.pais || 'PE').toUpperCase();
    }
    return pais === 'AR' || pais === 'CO' ? pais : 'PE';
  }

  private async getTaxIdLabel(tenantId: string): Promise<'RUC' | 'CUIT' | 'NIT'> {
    const pais = await this.getCountryCode(tenantId);
    return pais === 'AR' ? 'CUIT' : pais === 'CO' ? 'NIT' : 'RUC';
  }

  private async validateTaxId(ruc: string, tenantId: string): Promise<string> {
    const pais = await this.getCountryCode(tenantId);
    const rawTaxId = String(ruc || '').trim().replace(/\s+/g, '');

    if (pais === 'CO') {
      const normalizedNit = /^\d{10}$/.test(rawTaxId)
        ? `${rawTaxId.slice(0, 9)}-${rawTaxId.slice(9)}`
        : rawTaxId;
      if (!validateColombiaNit(normalizedNit) || !/^\d{9,10}-\d$/.test(normalizedNit)) {
        throw new BadRequestException('NIT inválido: incluya la base y un dígito de verificación válido');
      }
      return normalizedNit;
    }

    if (!/^\d{11}$/.test(rawTaxId)) {
      throw new BadRequestException(`El ${pais === 'AR' ? 'CUIT' : 'RUC'} debe tener 11 dígitos`);
    }

    if (pais === 'AR') {
      if (!validarCuilArgentina(rawTaxId)) {
        throw new BadRequestException('CUIT inválido: el dígito verificador no coincide');
      }
      return rawTaxId;
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
    return rawTaxId;
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
