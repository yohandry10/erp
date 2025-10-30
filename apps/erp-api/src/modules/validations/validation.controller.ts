import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { ValidationService } from './validation.service';
import {
  ValidateCertificateDto,
  ValidateRucDto,
  ValidateDocumentDto,
  CertificateValidationResult,
  RucValidationResult,
  DocumentValidationResult,
  ValidationStatusResponse,
} from './validation.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@ApiTags('validations')
@Controller('validations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard) // HARDENING: validaciones requieren permisos.
export class ValidationController {
  constructor(private readonly validationService: ValidationService) {}

  @Post('certificate')
  @RequirePermission('validations.run') // HARDENING: ejecutar validaciones.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate certificate for tenant' })
  @ApiResponse({
    status: 200,
    description: 'Certificate validation result',
  })
  async validateCertificate(
    @Body() dto: ValidateCertificateDto,
    @CurrentTenant() tenantId: string,
  ): Promise<CertificateValidationResult> {
    // HARDENING: ignoramos tenantId enviado por el cliente.
    return this.validationService.validateCertificate(tenantId);
  }

  @Post('ruc')
  @RequirePermission('validations.run') // HARDENING: ejecutar validaciones.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate RUC configuration for tenant' })
  @ApiResponse({
    status: 200,
    description: 'RUC validation result',
  })
  async validateRuc(
    @Body() dto: ValidateRucDto,
    @CurrentTenant() tenantId: string,
  ): Promise<RucValidationResult> {
    return this.validationService.validateRucConfiguration(tenantId);
  }

  @Post('document')
  @RequirePermission('validations.run') // HARDENING: ejecutar validaciones.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate document before emission' })
  @ApiResponse({
    status: 200,
    description: 'Document validation result',
  })
  async validateDocument(
    @Body() dto: ValidateDocumentDto,
  ): Promise<DocumentValidationResult> {
    return this.validationService.validateDocumentBeforeEmission(dto);
  }

  @Get('status')
  @RequirePermission('validations.run') // HARDENING: consultar estado de validaciones.
  @ApiOperation({ summary: 'Get overall validation status for tenant' })
  @ApiResponse({
    status: 200,
    description: 'Overall validation status',
  })
  async getValidationStatus(
    @CurrentTenant() tenantId: string,
  ): Promise<ValidationStatusResponse> {
    return this.validationService.getValidationStatus(tenantId);
  }
}
