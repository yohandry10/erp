import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ProveedoresRepository } from '../repositories/proveedores.repository';
import { CreateProveedorDto } from '../dto/create-proveedor.dto';
import { UpdateProveedorDto } from '../dto/update-proveedor.dto';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class ProveedoresService {
  constructor(
    private readonly proveedoresRepository: ProveedoresRepository,
    private readonly auditService: AuditService,
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
    // Validar RUC según país
    this.validateRuc(createDto.ruc);

    // Verificar si ya existe un proveedor con el mismo RUC
    const existingProveedor = await this.proveedoresRepository.findByRuc(createDto.ruc, tenantId);
    if (existingProveedor) {
      throw new ConflictException(`Ya existe un proveedor con RUC ${createDto.ruc}`);
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
      this.validateRuc(updateDto.ruc);

      // Verificar que no exista otro proveedor con el mismo RUC
      const existingProveedor = await this.proveedoresRepository.findByRuc(updateDto.ruc, tenantId);
      if (existingProveedor && existingProveedor.id !== id) {
        throw new ConflictException(`Ya existe otro proveedor con RUC ${updateDto.ruc}`);
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
  private validateRuc(ruc: string): void {
    const cleanRuc = ruc.trim();
    
    // Validar que solo contenga números
    if (!/^\d+$/.test(cleanRuc)) {
      throw new BadRequestException('El RUC debe contener solo números');
    }

    // Scope inicial: Peru/SUNAT. Otros paises quedan en roadmap.
    if (cleanRuc.length !== 11) {
      throw new BadRequestException('El RUC debe tener 11 dígitos');
    }

    // Validar dígito verificador para RUC peruano (módulo 11 SUNAT)
    const prefijo = cleanRuc.substring(0, 2);
    if (!['10', '15', '17', '20'].includes(prefijo)) {
      throw new BadRequestException(`Prefijo de RUC inválido: ${prefijo}. Debe iniciar con 10, 15, 17 o 20`);
    }
    const factores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const digitos = cleanRuc.split('').map(Number);
    const suma = factores.reduce((acc, factor, i) => acc + factor * digitos[i], 0);
    const resto = 11 - (suma % 11);
    const digitoVerificador = resto === 10 ? 0 : resto === 11 ? 1 : resto;
    if (digitoVerificador !== digitos[10]) {
      throw new BadRequestException('RUC inválido: dígito verificador no coincide');
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
