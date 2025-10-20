import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
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
import { Request } from 'express';

@ApiTags('validations')
@Controller('validations')
@ApiBearerAuth()
export class ValidationController {
  constructor(private readonly validationService: ValidationService) {}

  @Post('certificate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate certificate for tenant' })
  @ApiResponse({
    status: 200,
    description: 'Certificate validation result',
  })
  async validateCertificate(
    @Body() dto: ValidateCertificateDto,
    @Req() req: Request,
  ): Promise<CertificateValidationResult> {
    const user = req.user as any;
    const tenantId = dto.tenantId || user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
    return this.validationService.validateCertificate(tenantId);
  }

  @Post('ruc')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate RUC configuration for tenant' })
  @ApiResponse({
    status: 200,
    description: 'RUC validation result',
  })
  async validateRuc(
    @Body() dto: ValidateRucDto,
    @Req() req: Request,
  ): Promise<RucValidationResult> {
    const user = req.user as any;
    const tenantId = dto.tenantId || user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
    return this.validationService.validateRucConfiguration(tenantId);
  }

  @Post('document')
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
  @ApiOperation({ summary: 'Get overall validation status for tenant' })
  @ApiResponse({
    status: 200,
    description: 'Overall validation status',
  })
  async getValidationStatus(@Req() req: Request): Promise<ValidationStatusResponse> {
    const user = req.user as any;
    const tenantId = user?.tenant_id;
    return this.validationService.getValidationStatus(tenantId);
  }
}
