import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ProveedoresRepository } from '../repositories/proveedores.repository';
import { CreateProveedorDto } from '../dto/create-proveedor.dto';
import { UpdateProveedorDto } from '../dto/update-proveedor.dto';

@Injectable()
export class ProveedoresService {
  constructor(private readonly proveedoresRepository: ProveedoresRepository) {}

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

    return await this.proveedoresRepository.create(createDto, tenantId, userId);
  }

  async update(id: string, updateDto: UpdateProveedorDto, tenantId: string) {
    // Verificar que el proveedor existe
    await this.findById(id, tenantId);

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

    return await this.proveedoresRepository.update(id, updateDto, tenantId);
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

    // Validar longitud según país
    // Perú: 11 dígitos, Colombia: 9 dígitos
    if (cleanRuc.length !== 11 && cleanRuc.length !== 9) {
      throw new BadRequestException('El RUC debe tener 11 dígitos (Perú) o 9 dígitos (Colombia)');
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
