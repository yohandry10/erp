import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  HttpException,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConfigurationService } from './configuration.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../auth/user.interface';
import {
  SaveWizardStepDto,
  UpdateGREThresholdsDto,
} from './configuration.types';

@ApiTags('configuration')
@Controller('configuration')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ConfigurationController {
  private readonly logger = new Logger(ConfigurationController.name);

  constructor(private readonly configurationService: ConfigurationService) {}

  /**
   * GET /api/configuration/status
   * Get configuration status for the current tenant
   */
  @Get('status')
  @ApiOperation({ summary: 'Get configuration status' })
  @ApiResponse({ status: 200, description: 'Configuration status retrieved successfully' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getConfigurationStatus(@CurrentUser() user?: User) {
    try {
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
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
   * GET /api/configuration/wizard/progress
   * Get wizard progress for the current tenant
   */
  @Get('wizard/progress')
  @ApiOperation({ summary: 'Get wizard progress' })
  @ApiResponse({ status: 200, description: 'Wizard progress retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Wizard progress not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getWizardProgress(@CurrentUser() user?: User) {
    try {
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
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
  @ApiOperation({ summary: 'Save wizard step progress' })
  @ApiResponse({ status: 200, description: 'Wizard step saved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async saveWizardStep(
    @CurrentUser() user: User | undefined,
    @Body() stepData: SaveWizardStepDto,
  ) {
    try {
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
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

      const progress = await this.configurationService.saveWizardStep(tenantId, stepData);

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
   * POST /api/configuration/complete
   * Mark configuration wizard as completed
   */
  @Post('complete')
  @ApiOperation({ summary: 'Complete configuration wizard' })
  @ApiResponse({ status: 200, description: 'Configuration completed successfully' })
  @ApiResponse({ status: 400, description: 'Configuration is incomplete' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async completeConfiguration(
    @CurrentUser() user: User | undefined,
    @Body() body: { configuration: any },
  ) {
    try {
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
      this.logger.log(`Completing configuration for tenant: ${tenantId}`);
      this.logger.log(`Configuration data received:`, body.configuration);

      // Save the final configuration to wizard_progress before completing
      if (body.configuration) {
        await this.configurationService.saveWizardStep(tenantId, {
          pasoActual: 5, // Final step
          configuracionTemporal: body.configuration,
        });
      }

      // Complete wizard (this will save to empresa_config and certificados_digitales)
      await this.configurationService.completeWizard(tenantId);

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
  @ApiOperation({ summary: 'Update GRE thresholds' })
  @ApiResponse({ status: 200, description: 'GRE thresholds updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid threshold values' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async updateGREThresholds(
    @CurrentUser() user: User | undefined,
    @Body() thresholds: UpdateGREThresholdsDto,
  ) {
    try {
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
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

      await this.configurationService.updateGREThresholds(tenantId, thresholds);

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
  @ApiOperation({ summary: 'Get GRE thresholds' })
  @ApiResponse({ status: 200, description: 'GRE thresholds retrieved successfully' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getGREThresholds(@CurrentUser() user?: User) {
    try {
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
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
}
