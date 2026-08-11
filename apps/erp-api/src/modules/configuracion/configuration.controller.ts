import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ConfigurationService } from './configuration.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { User } from '../auth/user.interface';
import {
  SaveWizardStepDto,
  UpdateGREThresholdsDto,
  ValidateWizardCertificateDto,
} from './configuration.types';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { ConfigService } from '@nestjs/config';
import { encryptText } from '../../shared/utils/secure-config.utils';
import { DianFiscalService } from '../fiscal/dian-fiscal.service';
import { CacheInvalidationService } from '../../shared/cache/cache-invalidation.service';
import {
  INITIAL_ACTIVE_COUNTRY_CODE,
  INITIAL_ACTIVE_COUNTRY_ID,
  INITIAL_ACTIVE_COUNTRY_MESSAGE,
  isInitialActiveCountryCode,
  isInitialActiveCountryId,
} from '../paises/initial-country';

@ApiTags('configuration')
@Controller('configuration')
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission('configuracion.read')
@ApiBearerAuth()
export class ConfigurationController {
  private readonly logger = new Logger(ConfigurationController.name);

  constructor(
    private readonly configurationService: ConfigurationService,
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
    private readonly dianFiscalService: DianFiscalService,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  @Post('colombia/dian/test')
  @RequirePermission('configuracion.write')
  @ApiOperation({ summary: 'Verificar readiness y transporte oficial DIAN del tenant colombiano' })
  async testColombiaDian(@CurrentTenant() tenantId?: string) {
    if (!tenantId) {
      throw new HttpException(
        { success: false, message: 'Tenant requerido' },
        HttpStatus.FORBIDDEN,
      );
    }
    return { success: true, data: await this.dianFiscalService.probarConfiguracion(tenantId) };
  }

  private assertInitialActiveCountry(paisId?: number | null, paisCodigo?: string | null): void {
    if (paisId !== undefined && paisId !== null && !isInitialActiveCountryId(paisId)) {
      throw new HttpException(
        { success: false, message: INITIAL_ACTIVE_COUNTRY_MESSAGE },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (paisCodigo && !isInitialActiveCountryCode(paisCodigo)) {
      throw new HttpException(
        { success: false, message: INITIAL_ACTIVE_COUNTRY_MESSAGE },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * GET /api/configuration/status
   * Get configuration status for the current tenant
   */
  @Get('status')
  @ApiOperation({ summary: 'Get configuration status' })
  @ApiResponse({ status: 200, description: 'Configuration status retrieved successfully' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getConfigurationStatus(
    @CurrentUser() user?: User,
    @CurrentTenant() tenantId?: string,
  ) {
    try {
      // REMOVED: Super admins MUST also complete configuration for their tenant
      // Each tenant needs its own configuration regardless of user role

      if (!tenantId) {
        throw new HttpException(
          {
            success: false,
            message: 'Tenant requerido para consultar configuración',
          },
          HttpStatus.FORBIDDEN,
        );
      }

      this.logger.log(`Getting configuration status for tenant: ${tenantId}`);

      const status = await this.configurationService.getConfigurationStatus(tenantId);

      return {
        success: true,
        data: status,
      };
    } catch (error) {
      this.logger.error('Error getting configuration status:', error);
      throw new HttpException(
        {
          success: false,
          message: 'Error al obtener el estado de configuración',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /api/configuration/wizard/validate-certificate
   * Validate certificate payload before saving wizard progress
   */
  @Post('wizard/validate-certificate')
  @RequirePermission('configuracion.write')
  @ApiOperation({ summary: 'Validate wizard certificate payload' })
  @ApiResponse({ status: 200, description: 'Certificate validated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid certificate payload' })
  async validateWizardCertificate(
    @CurrentUser() user: User | undefined,
    @Body() payload: ValidateWizardCertificateDto,
    @CurrentTenant() tenantId?: string,
  ) {
    try {
      if (!tenantId) {
        throw new HttpException(
          {
            success: false,
            message: 'Tenant requerido para validar certificado',
          },
          HttpStatus.FORBIDDEN,
        );
      }

      const result = await this.configurationService.validateCertificatePayload(tenantId, payload);

      return {
        success: true,
        data: {
          subject: result.subject,
          issuer: result.issuer,
          serialNumber: result.serialNumber,
          validFrom: result.validFrom.toISOString(),
          validTo: result.validTo.toISOString(),
          daysUntilExpiration: result.daysUntilExpiration,
          rucEmisor: result.rucEmisor,
          rucsEnCertificado: result.rucsEnCertificado,
          perteneceAlEmisor: result.perteneceAlEmisor,
          motivoTitularidad: result.motivoTitularidad,
        },
      };
    } catch (error) {
      this.logger.error('Error validating wizard certificate:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          message: error instanceof Error ? error.message : 'Certificado inválido',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * GET /api/configuration/wizard/progress
   * Get wizard progress for the current tenant
   */
  @Get('wizard/progress')
  @ApiOperation({ summary: 'Get wizard progress' })
  @ApiResponse({ status: 200, description: 'Wizard progress retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Wizard progress not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getWizardProgress(
    @CurrentUser() user?: User,
    @CurrentTenant() tenantId?: string,
  ) {
    try {
      if (!tenantId) {
        throw new HttpException(
          {
            success: false,
            message: 'Tenant requerido para consultar progreso',
          },
          HttpStatus.FORBIDDEN,
        );
      }
      this.logger.log(`Getting wizard progress for tenant: ${tenantId}`);

      const progress = await this.configurationService.getWizardProgress(tenantId);

      if (!progress) {
        return {
          success: true,
          data: null,
          message: 'No se encontró progreso del wizard',
        };
      }

      const completionPercentage = this.configurationService.calculateWizardCompletionPercentage(
        progress.pasosCompletados,
      );

      return {
        success: true,
        data: {
          ...progress,
          completionPercentage,
        },
      };
    } catch (error) {
      this.logger.error('Error getting wizard progress:', error);
      throw new HttpException(
        {
          success: false,
          message: 'Error al obtener el progreso del wizard',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /api/configuration/wizard/step
   * Save wizard step progress
   */
  @Post('wizard/step')
  @RequirePermission('configuracion.write')
  @ApiOperation({ summary: 'Save wizard step progress' })
  @ApiResponse({ status: 200, description: 'Wizard step saved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async saveWizardStep(
    @CurrentUser() user: User | undefined,
    @Body() stepData: SaveWizardStepDto,
    @CurrentTenant() tenantId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    try {
      if (!tenantId) {
        throw new HttpException(
          {
            success: false,
            message: 'Tenant requerido para guardar progreso',
          },
          HttpStatus.FORBIDDEN,
        );
      }
      this.logger.log(`Saving wizard step for tenant: ${tenantId}, step: ${stepData.pasoActual}`);

      if (!stepData.pasoActual || stepData.pasoActual < 1) {
        throw new HttpException(
          {
            success: false,
            message: 'El número de paso es requerido y debe ser mayor a 0',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const progress = await this.configurationService.saveWizardStep(
        tenantId,
        stepData,
        user?.id,
        idempotencyKey,
      );

      const completionPercentage = this.configurationService.calculateWizardCompletionPercentage(
        progress.pasosCompletados,
      );

      return {
        success: true,
        message: 'Progreso del wizard guardado exitosamente',
        data: {
          ...progress,
          completionPercentage,
        },
      };
    } catch (error) {
      this.logger.error('Error saving wizard step:', error);
      
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          message: 'Error al guardar el progreso del wizard',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /api/configuration/wizard/reset
   * Reset wizard configuration to start over
   */
  @Post('wizard/reset')
  @RequirePermission('configuracion.write')
  @ApiOperation({ summary: 'Reset wizard configuration' })
  @ApiResponse({ status: 200, description: 'Wizard reset successfully' })
  async resetWizard(
    @CurrentUser() user: User | undefined,
    @CurrentTenant() tenantId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    try {
      if (!tenantId) {
        throw new HttpException(
          {
            success: false,
            message: 'Tenant requerido para reiniciar configuración',
          },
          HttpStatus.FORBIDDEN,
        );
      }

      await this.configurationService.resetWizard(tenantId, user?.id, idempotencyKey);

      return {
        success: true,
        message: 'Configuración reiniciada correctamente',
      };
    } catch (error) {
      this.logger.error('Error resetting wizard configuration:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          message: 'Error al reiniciar la configuración',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /api/configuration/complete
   * Mark configuration wizard as completed
   */
  @Post('complete')
  @RequirePermission('configuracion.write')
  @ApiOperation({ summary: 'Complete configuration wizard' })
  @ApiResponse({ status: 200, description: 'Configuration completed successfully' })
  @ApiResponse({ status: 400, description: 'Configuration is incomplete' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async completeConfiguration(
    @CurrentUser() user: User | undefined,
    @Body() body: { configuration: any },
    @CurrentTenant() tenantId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    try {
      if (!tenantId) {
        throw new HttpException(
          {
            success: false,
            message: 'Tenant requerido para completar configuración',
          },
          HttpStatus.FORBIDDEN,
        );
      }
      this.logger.log(`Completing configuration for tenant: ${tenantId}`);
      // Una sola frontera SQL guarda empresa y marca el wizard completo.
      await this.configurationService.completeWizard(
        tenantId,
        body.configuration,
        user?.id,
        idempotencyKey,
      );

      return {
        success: true,
        message: 'Configuración completada exitosamente',
        data: {
          completedAt: new Date(),
        },
      };
    } catch (error) {
      this.logger.error('Error completing configuration:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          message: 'Error al completar la configuración',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PUT /api/configuration/gre-thresholds
   * Update GRE automatic creation thresholds
   */
  @Put('gre-thresholds')
  @RequirePermission('configuracion.write')
  @ApiOperation({ summary: 'Update GRE thresholds' })
  @ApiResponse({ status: 200, description: 'GRE thresholds updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid threshold values' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async updateGREThresholds(
    @CurrentUser() user: User | undefined,
    @Body() thresholds: UpdateGREThresholdsDto,
    @CurrentTenant() tenantId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    try {
      if (!tenantId) {
        throw new HttpException(
          {
            success: false,
            message: 'Tenant requerido para actualizar umbrales',
          },
          HttpStatus.FORBIDDEN,
        );
      }
      this.logger.log(`Updating GRE thresholds for tenant: ${tenantId}`);

      // Validate threshold value
      if (thresholds.umbralGREAutomatico < 0) {
        throw new HttpException(
          {
            success: false,
            message: 'El umbral de GRE automático no puede ser negativo',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      await this.configurationService.updateGREThresholds(
        tenantId,
        thresholds,
        user?.id,
        idempotencyKey,
      );

      return {
        success: true,
        message: 'Umbrales de GRE actualizados exitosamente',
        data: thresholds,
      };
    } catch (error) {
      this.logger.error('Error updating GRE thresholds:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          message: 'Error al actualizar los umbrales de GRE',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /api/configuration/gre-thresholds
   * Get GRE automatic creation thresholds
   */
  @Get('gre-thresholds')
  @RequirePermission('pos.read')
  @ApiOperation({ summary: 'Get GRE thresholds' })
  @ApiResponse({ status: 200, description: 'GRE thresholds retrieved successfully' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getGREThresholds(
    @CurrentUser() user?: User,
    @CurrentTenant() tenantId?: string,
  ) {
    try {
      if (!tenantId) {
        throw new HttpException(
          {
            success: false,
            message: 'Tenant requerido para obtener umbrales',
          },
          HttpStatus.FORBIDDEN,
        );
      }
      this.logger.log(`Getting GRE thresholds for tenant: ${tenantId}`);

      const thresholds = await this.configurationService.getGREThresholds(tenantId);

      return {
        success: true,
        data: thresholds,
      };
    } catch (error) {
      this.logger.error('Error getting GRE thresholds:', error);
      throw new HttpException(
        {
          success: false,
          message: 'Error al obtener los umbrales de GRE',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================
  // ENDPOINTS DE EMPRESA (migrados de /configuracion)
  // ============================================

  /**
   * GET /api/configuration/empresa
   * Get company data for the current tenant
   */
  @Get('empresa')
  @ApiOperation({ summary: 'Get company data' })
  @ApiResponse({ status: 200, description: 'Company data retrieved successfully' })
  async getEmpresaData(@CurrentTenant() tenantId?: string) {
    try {
      if (!tenantId) {
        throw new HttpException(
          { success: false, message: 'Tenant requerido' },
          HttpStatus.FORBIDDEN,
        );
      }

      const { data, error } = await this.supabaseService
        .getClient()
        .from('empresa_config')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) {
        this.logger.error('Error getting empresa config:', error);
        throw error;
      }

      if (!data) {
        return {
          success: false,
          message: 'No se encontró configuración de empresa',
          data: null,
        };
      }

      let paisId = data.pais_id ?? null;
      if (!paisId && data.pais) {
        const { data: paisData } = await this.supabaseService
          .getClient()
          .from('paises')
          .select('id')
          .eq('codigo_iso', data.pais.toUpperCase())
          .maybeSingle();

        paisId = paisData?.id ?? null;
      }

      return {
        success: true,
        data: {
          id: data.id,
          ruc: data.ruc,
          razonSocial: data.razon_social,
          nombreComercial: data.nombre_comercial,
          direccion: data.direccion_fiscal,
          pais: data.pais,
          pais_id: paisId,
          ubigeo: data.ubigeo,
          departamento: data.departamento,
          provincia: data.provincia,
          distrito: data.distrito,
          telefono: data.telefono,
          email: data.email,
          sitioWeb: data.sitio_web,
          representanteLegal: data.representante_legal,
          dniRepresentante: data.dni_representante,
          regimen: data.regimen_tributario,
          actividadEconomica: data.actividad_economica,
          igvPorcentaje: data.igv_porcentaje,
          retencionRentaPorcentaje: data.retencion_renta_porcentaje,
          monedaDefecto: data.moneda_defecto,
          logoUrl: data.logo_url,
          tipo_empresa: data.tipo_empresa,
          isDemo: data.is_demo === true,
          certificateConfigured: Boolean(data.certificado_pfx),
          usar_flujo_logistica: data.usar_flujo_logistica,
          gre_obligatorio: data.gre_obligatorio,
          gre_automatico_habilitado: data.gre_automatico_habilitado,
          umbral_gre_automatico: data.umbral_gre_automatico,
          // Series de comprobantes
          serieFactura: data.serie_factura,
          serieBoleta: data.serie_boleta,
          serieNotaCredito: data.serie_nota_credito,
          // La tabla histórica no posee una columna dedicada para ND. El
          // emisor sí usa la serie canónica por país; exponerla aquí evita
          // mostrar una configuración incompleta que no existe en runtime.
          serieNotaDebito: data.serie_nota_debito
            || (data.pais === 'CO' ? 'ND' : data.pais === 'AR' ? '00001' : 'FD01'),
          // GRE usa T001 como serie canónica peruana cuando la tabla histórica
          // no dispone de una columna dedicada para configurarla.
          serieGuiaRemision: data.serie_guia_remision
            || (data.pais === 'PE' ? 'T001' : null),
          certificateExpiresAt: data.certificado_expira_en,
          // OSE
          oseActivo: data.ose_activo,
          oseUrl: data.ose_url,
          oseStatusUrl: data.ose_status_url,
          oseAuthTipo: data.ose_auth_tipo,
          oseApiKey: data.ose_api_key,
          oseApiHeader: data.ose_api_header,
          oseBearerToken: data.ose_bearer_token,
          emisionCpeModo: data.emision_cpe_modo,
          sunatEnvironment: data.sunat_environment,
          sunatUsernameConfigured: !!data.sunat_username,
          sunatGreTransport: data.sunat_gre_transport,
          sunatGreClientConfigured: !!data.sunat_gre_client_id && !!data.sunat_gre_client_secret,
          sireActivo: data.sire_activo === true,
          // ARCA / Argentina
          arcaActivo: data.arca_activo,
          arcaEnvironment: data.arca_environment,
          arcaWsaaUrl: data.arca_wsaa_url,
          arcaWsfeUrl: data.arca_wsfe_url,
          arcaCuitRepresentada: data.arca_cuit_representada,
          arcaPuntoVenta: data.arca_punto_venta,
          arcaCondicionIva: data.arca_condicion_iva,
          ingresosBrutos: data.ingresos_brutos,
          fechaInicioActividades: data.fecha_inicio_actividades,
          provinciaFiscal: data.provincia_fiscal,
          dianActivo: data.dian_activo,
          dianUrl: data.dian_url,
          dianUsuario: data.dian_usuario,
          dianPassword: null,
          dianSoftwareId: data.dian_software_id,
          dianSoftwarePin: data.dian_software_pin ? 'CONFIGURADO' : null,
          dianTestSetId: data.dian_test_set_id,
          dianEnvironment: data.dian_environment,
          dianRegimenFiscal: data.dian_regimen_fiscal,
          dianTipoContribuyente: data.dian_tipo_contribuyente,
          dianResolucionNumero: data.dian_resolucion_numero,
          dianResolucionPrefijo: data.dian_resolucion_prefijo,
          dianResolucionDesde: data.dian_resolucion_desde,
          dianResolucionHasta: data.dian_resolucion_hasta,
          dianResolucionFechaInicio: data.dian_resolucion_fecha_inicio,
          dianResolucionFechaFin: data.dian_resolucion_fecha_fin,
        },
      };
    } catch (error) {
      this.logger.error('Error getting empresa data:', error);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PUT /api/configuration/empresa
   * Update company data for the current tenant
   */
  @Put('empresa')
  @RequirePermission('configuracion.write')
  @ApiOperation({ summary: 'Update company data' })
  @ApiResponse({ status: 200, description: 'Company data updated successfully' })
  async updateEmpresaData(
    @Body() datosEmpresa: any,
    @CurrentTenant() tenantId?: string,
    @CurrentUser() user?: User,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    try {
      if (!tenantId) {
        throw new HttpException(
          { success: false, message: 'Tenant requerido' },
          HttpStatus.FORBIDDEN,
        );
      }

      this.logger.log(`Updating empresa data for tenant: ${tenantId}`);
      const updateData: any = {};
      let resolvedPaisId: number | null = null;
      let resolvedPaisCodigo: string | null = null;

      if (typeof datosEmpresa.pais === 'string' && datosEmpresa.pais.trim()) {
        resolvedPaisCodigo = datosEmpresa.pais.trim().toUpperCase();
        this.assertInitialActiveCountry(null, resolvedPaisCodigo);
      }

      if (datosEmpresa.pais_id !== undefined) {
        const parsedPaisId = Number(datosEmpresa.pais_id);
        if (!parsedPaisId || Number.isNaN(parsedPaisId)) {
          throw new HttpException(
            { success: false, message: 'pais_id es requerido y debe ser válido' },
            HttpStatus.BAD_REQUEST,
          );
        }
        this.assertInitialActiveCountry(parsedPaisId, null);
        resolvedPaisId = parsedPaisId;
      }

      if (!resolvedPaisId && resolvedPaisCodigo) {
        const { data: paisData, error: paisError } = await this.supabaseService
          .getClient()
          .from('paises')
          .select('id')
          .eq('codigo_iso', resolvedPaisCodigo)
          .maybeSingle();

        if (paisError || !paisData?.id) {
          throw new HttpException(
            { success: false, message: `País no válido: ${resolvedPaisCodigo}` },
            HttpStatus.BAD_REQUEST,
          );
        }

        resolvedPaisId = paisData.id;
      }

      if (resolvedPaisId && !resolvedPaisCodigo) {
        const { data: paisData, error: paisError } = await this.supabaseService
          .getClient()
          .from('paises')
          .select('codigo_iso')
          .eq('id', resolvedPaisId)
          .maybeSingle();

        if (paisError || !paisData?.codigo_iso) {
          throw new HttpException(
            { success: false, message: 'pais_id no corresponde a un país válido' },
            HttpStatus.BAD_REQUEST,
          );
        }

        resolvedPaisCodigo = paisData.codigo_iso.toUpperCase();
        this.assertInitialActiveCountry(resolvedPaisId, resolvedPaisCodigo);
      }

      if (!resolvedPaisId) {
        const { data: currentEmpresa } = await this.supabaseService
          .getClient()
          .from('empresa_config')
          .select('pais_id')
          .eq('tenant_id', tenantId)
          .maybeSingle();

        if (!currentEmpresa?.pais_id) {
          resolvedPaisId = INITIAL_ACTIVE_COUNTRY_ID;
          resolvedPaisCodigo = INITIAL_ACTIVE_COUNTRY_CODE;
        } else {
          this.assertInitialActiveCountry(Number(currentEmpresa.pais_id), null);
        }
      }

      const dianPayloadFields = [
        'dianActivo',
        'dianUrl',
        'dianUsuario',
        'dianPassword',
        'dianSoftwareId',
        'dianSoftwarePin',
        'dianTestSetId',
        'dianEnvironment',
        'dianRegimenFiscal',
        'dianTipoContribuyente',
        'dianResolucionNumero',
        'dianResolucionPrefijo',
        'dianResolucionDesde',
        'dianResolucionHasta',
        'dianResolucionFechaInicio',
        'dianResolucionFechaFin',
        'dian_activo',
        'dian_regimen_fiscal',
        'dian_tipo_contribuyente',
      ];
      if (resolvedPaisCodigo !== 'CO' && dianPayloadFields.some((field) => {
        const value = datosEmpresa[field];
        return value !== undefined && value !== null && value !== '' && value !== false;
      })) {
        throw new HttpException(
          { success: false, message: INITIAL_ACTIVE_COUNTRY_MESSAGE },
          HttpStatus.BAD_REQUEST,
        );
      }

      if (resolvedPaisCodigo === 'AR') {
        updateData.moneda_defecto = 'ARS';
        updateData.emision_cpe_modo = 'ARCA_WSFE';
      } else if (resolvedPaisCodigo === 'CO') {
        updateData.moneda_defecto = 'COP';
        updateData.emision_cpe_modo = 'DIAN_DIRECTO';
      } else if (resolvedPaisCodigo === 'PE') {
        updateData.moneda_defecto = 'PEN';
      }

      // Mapear campos camelCase a snake_case
      if (datosEmpresa.ruc) updateData.ruc = datosEmpresa.ruc;
      if (datosEmpresa.razonSocial) updateData.razon_social = datosEmpresa.razonSocial;
      if (datosEmpresa.nombreComercial) updateData.nombre_comercial = datosEmpresa.nombreComercial;
      if (datosEmpresa.direccion) updateData.direccion_fiscal = datosEmpresa.direccion;
      if (resolvedPaisCodigo) updateData.pais = resolvedPaisCodigo;
      if (resolvedPaisId) updateData.pais_id = resolvedPaisId;
      if (datosEmpresa.ubigeo) updateData.ubigeo = datosEmpresa.ubigeo;
      if (datosEmpresa.departamento) updateData.departamento = datosEmpresa.departamento;
      if (datosEmpresa.provincia) updateData.provincia = datosEmpresa.provincia;
      if (datosEmpresa.distrito) updateData.distrito = datosEmpresa.distrito;
      if (datosEmpresa.telefono) updateData.telefono = datosEmpresa.telefono;
      if (datosEmpresa.email) updateData.email = datosEmpresa.email;
      if (datosEmpresa.sitioWeb) updateData.sitio_web = datosEmpresa.sitioWeb;
      if (datosEmpresa.representanteLegal) updateData.representante_legal = datosEmpresa.representanteLegal;
      if (datosEmpresa.dniRepresentante) updateData.dni_representante = datosEmpresa.dniRepresentante;
      if (datosEmpresa.regimen) updateData.regimen_tributario = datosEmpresa.regimen;
      if (resolvedPaisCodigo === 'AR') {
        if (datosEmpresa.arca_activo !== undefined) updateData.arca_activo = datosEmpresa.arca_activo === true;
        if (datosEmpresa.arca_environment) updateData.arca_environment = datosEmpresa.arca_environment;
        if (datosEmpresa.arca_wsaa_url) updateData.arca_wsaa_url = datosEmpresa.arca_wsaa_url;
        if (datosEmpresa.arca_wsfe_url) updateData.arca_wsfe_url = datosEmpresa.arca_wsfe_url;
        if (datosEmpresa.arca_cuit_representada) {
          updateData.arca_cuit_representada = datosEmpresa.arca_cuit_representada;
        }
        if (datosEmpresa.arca_punto_venta !== undefined) {
          updateData.arca_punto_venta = Number(datosEmpresa.arca_punto_venta);
        }
        if (datosEmpresa.arca_condicion_iva) updateData.arca_condicion_iva = datosEmpresa.arca_condicion_iva;
        if (datosEmpresa.ingresos_brutos) updateData.ingresos_brutos = datosEmpresa.ingresos_brutos;
        if (datosEmpresa.fecha_inicio_actividades) {
          updateData.fecha_inicio_actividades = datosEmpresa.fecha_inicio_actividades;
        }
        if (datosEmpresa.provincia_fiscal) updateData.provincia_fiscal = datosEmpresa.provincia_fiscal;
      }
      if (datosEmpresa.actividadEconomica) updateData.actividad_economica = datosEmpresa.actividadEconomica;
      if (datosEmpresa.igvPorcentaje !== undefined) updateData.igv_porcentaje = datosEmpresa.igvPorcentaje;
      if (datosEmpresa.logoUrl) updateData.logo_url = datosEmpresa.logoUrl;
      if (datosEmpresa.tipo_empresa) updateData.tipo_empresa = datosEmpresa.tipo_empresa;
      if (datosEmpresa.usar_flujo_logistica !== undefined) updateData.usar_flujo_logistica = datosEmpresa.usar_flujo_logistica;
      if (datosEmpresa.gre_obligatorio !== undefined) updateData.gre_obligatorio = datosEmpresa.gre_obligatorio;
      if (datosEmpresa.gre_automatico_habilitado !== undefined) updateData.gre_automatico_habilitado = datosEmpresa.gre_automatico_habilitado;
      if (datosEmpresa.umbral_gre_automatico !== undefined) updateData.umbral_gre_automatico = datosEmpresa.umbral_gre_automatico;
      if (datosEmpresa.emisionCpeModo) updateData.emision_cpe_modo = datosEmpresa.emisionCpeModo;
      if (datosEmpresa.oseUrl !== undefined) updateData.ose_url = datosEmpresa.oseUrl;
      if (datosEmpresa.oseStatusUrl !== undefined) updateData.ose_status_url = datosEmpresa.oseStatusUrl;
      if (datosEmpresa.oseUsername !== undefined) updateData.ose_username = datosEmpresa.oseUsername;
      if (datosEmpresa.osePassword !== undefined) updateData.ose_password = datosEmpresa.osePassword;
      if (datosEmpresa.oseApiKey !== undefined) updateData.ose_api_key = datosEmpresa.oseApiKey;
      if (datosEmpresa.oseApiHeader !== undefined) updateData.ose_api_header = datosEmpresa.oseApiHeader;
      if (datosEmpresa.oseBearerToken !== undefined) updateData.ose_bearer_token = datosEmpresa.oseBearerToken;
      if (datosEmpresa.oseAuthTipo !== undefined) updateData.ose_auth_tipo = datosEmpresa.oseAuthTipo;
      if (datosEmpresa.oseActivo !== undefined) updateData.ose_activo = datosEmpresa.oseActivo;
      if (datosEmpresa.dianActivo !== undefined) updateData.dian_activo = datosEmpresa.dianActivo;
      if (datosEmpresa.dianUrl !== undefined) updateData.dian_url = datosEmpresa.dianUrl;
      if (datosEmpresa.dianUsuario !== undefined) updateData.dian_usuario = datosEmpresa.dianUsuario;
      if (datosEmpresa.dianPassword !== undefined && datosEmpresa.dianPassword !== 'CONFIGURADO') {
        updateData.dian_password = datosEmpresa.dianPassword
          ? encryptText(this.configService, datosEmpresa.dianPassword)
          : null;
      }
      if (datosEmpresa.dianSoftwareId !== undefined) updateData.dian_software_id = datosEmpresa.dianSoftwareId;
      if (datosEmpresa.dianSoftwarePin !== undefined && datosEmpresa.dianSoftwarePin !== 'CONFIGURADO') {
        updateData.dian_software_pin = datosEmpresa.dianSoftwarePin
          ? encryptText(this.configService, datosEmpresa.dianSoftwarePin)
          : null;
      }
      if (datosEmpresa.dianTestSetId !== undefined) updateData.dian_test_set_id = datosEmpresa.dianTestSetId;
      if (datosEmpresa.dianEnvironment !== undefined) updateData.dian_environment = datosEmpresa.dianEnvironment;
      if (datosEmpresa.dianRegimenFiscal !== undefined) updateData.dian_regimen_fiscal = datosEmpresa.dianRegimenFiscal;
      if (datosEmpresa.dianTipoContribuyente !== undefined) updateData.dian_tipo_contribuyente = datosEmpresa.dianTipoContribuyente;
      if (datosEmpresa.dian_regimen_fiscal !== undefined) updateData.dian_regimen_fiscal = datosEmpresa.dian_regimen_fiscal;
      if (datosEmpresa.dian_tipo_contribuyente !== undefined) updateData.dian_tipo_contribuyente = datosEmpresa.dian_tipo_contribuyente;
      if (datosEmpresa.dianResolucionNumero !== undefined) updateData.dian_resolucion_numero = datosEmpresa.dianResolucionNumero;
      if (datosEmpresa.dianResolucionPrefijo !== undefined) updateData.dian_resolucion_prefijo = datosEmpresa.dianResolucionPrefijo;
      if (datosEmpresa.dianResolucionDesde !== undefined) updateData.dian_resolucion_desde = datosEmpresa.dianResolucionDesde;
      if (datosEmpresa.dianResolucionHasta !== undefined) updateData.dian_resolucion_hasta = datosEmpresa.dianResolucionHasta;
      if (datosEmpresa.dianResolucionFechaInicio !== undefined) updateData.dian_resolucion_fecha_inicio = datosEmpresa.dianResolucionFechaInicio;
      if (datosEmpresa.dianResolucionFechaFin !== undefined) updateData.dian_resolucion_fecha_fin = datosEmpresa.dianResolucionFechaFin;

      const data = await this.configurationService.updateEmpresaPatchAtomic(
        tenantId,
        updateData,
        user?.id,
        idempotencyKey,
        'EMPRESA',
      );

      // El contexto de país/empresa se cachea para el bootstrap del dashboard.
      // Sin invalidarlo, cambios como usar_flujo_logistica podían tardar hasta
      // un minuto en reflejarse y dejaban UI y backend en estados distintos.
      await this.cacheInvalidation.invalidateAllTenantCache(tenantId);

      return {
        success: true,
        message: 'Datos de empresa actualizados exitosamente',
        data,
      };
    } catch (error) {
      this.logger.error('Error updating empresa data:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
