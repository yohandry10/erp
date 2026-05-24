import { Controller, Get, HttpException, HttpStatus, Logger, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { ConfigurationService } from './configuration.service';
import { CacheService } from '../../shared/cache/cache.service';

// Cache "dashboard bootstrap": ambos endpoints son llamados al cargar /dashboard
// y consumen ~2.6s contra Supabase remoto (3-5 queries c/u). Cachear con TTL
// corto reduce a <10ms en hits y mantiene fresco para cambios del wizard.
// Falla seguro a memoria si Redis no está disponible (ver CacheService).
const COUNTRY_TTL_SECONDS = 60;  // pais cambia sólo al editar empresa
const STATUS_TTL_SECONDS = 30;   // cambia al completar pasos del wizard

@ApiTags('configuration-context')
@Controller('configuration/context')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ConfigurationContextController {
  private readonly logger = new Logger(ConfigurationContextController.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configurationService: ConfigurationService,
    private readonly cacheService: CacheService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Get safe configuration status for authenticated dashboard bootstrap' })
  @ApiResponse({ status: 200, description: 'Configuration status retrieved successfully' })
  async getSafeConfigurationStatus(@CurrentTenant() tenantId?: string) {
    try {
      if (!tenantId) {
        throw new HttpException(
          { success: false, message: 'Tenant requerido' },
          HttpStatus.FORBIDDEN,
        );
      }

      const cacheKey = `config:status:${tenantId}`;
      const cached = await this.cacheService.get<any>(cacheKey);
      if (cached) {
        return { success: true, data: cached, cached: true };
      }

      const status = await this.configurationService.getConfigurationStatus(tenantId);
      await this.cacheService.set(cacheKey, status, STATUS_TTL_SECONDS);

      return {
        success: true,
        data: status,
      };
    } catch (error) {
      this.logger.error('Error getting safe configuration status:', error);
      throw new HttpException(
        {
          success: false,
          message: error instanceof Error ? error.message : 'Error obteniendo estado de configuración',
        },
        error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('country')
  @ApiOperation({ summary: 'Get safe country/company context for authenticated dashboard bootstrap' })
  @ApiResponse({ status: 200, description: 'Country context retrieved successfully' })
  async getCountryContext(@CurrentTenant() tenantId?: string) {
    try {
      if (!tenantId) {
        throw new HttpException(
          { success: false, message: 'Tenant requerido' },
          HttpStatus.FORBIDDEN,
        );
      }

      const cacheKey = `config:country:${tenantId}`;
      const cached = await this.cacheService.get<{ requiresSetup: boolean; data: any }>(cacheKey);
      if (cached) {
        return { success: true, ...cached, cached: true };
      }

      const { data, error } = await this.supabaseService
        .getClient()
        .from('empresa_config')
        .select([
          'id',
          'tenant_id',
          'pais',
          'pais_id',
          'razon_social',
          'nombre_comercial',
          'moneda_defecto',
          'configuracion_completa',
          'tipo_empresa',
          'usar_flujo_logistica',
          'gre_obligatorio',
          'gre_automatico_habilitado',
          'umbral_gre_automatico',
        ].join(','))
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) {
        this.logger.error('Error getting safe country context:', error);
        throw error;
      }

      if (!data) {
        const empty = { data: null, requiresSetup: true };
        await this.cacheService.set(cacheKey, empty, COUNTRY_TTL_SECONDS);
        return { success: true, ...empty };
      }

      const empresaConfig = data as any;
      let paisId = empresaConfig.pais_id ?? null;
      const paisCodigo = typeof empresaConfig.pais === 'string' ? empresaConfig.pais.toUpperCase() : null;

      if (!paisId && paisCodigo) {
        const { data: paisData, error: paisError } = await this.supabaseService
          .getClient()
          .from('paises')
          .select('id')
          .eq('codigo_iso', paisCodigo)
          .maybeSingle();

        if (paisError) {
          this.logger.warn(`No se pudo resolver pais_id para ${paisCodigo}: ${paisError.message}`);
        }

        paisId = paisData?.id ?? null;
      }

      const requiresSetup = !paisId || !paisCodigo;

      const payload = {
        requiresSetup,
        data: {
          id: empresaConfig.id,
          tenantId: empresaConfig.tenant_id,
          pais: paisCodigo,
          pais_id: paisId,
          razonSocial: empresaConfig.razon_social,
          nombreComercial: empresaConfig.nombre_comercial,
          monedaDefecto: empresaConfig.moneda_defecto,
          configuracionCompleta: empresaConfig.configuracion_completa === true,
          tipo_empresa: empresaConfig.tipo_empresa,
          usar_flujo_logistica: empresaConfig.usar_flujo_logistica,
          gre_obligatorio: empresaConfig.gre_obligatorio,
          gre_automatico_habilitado: empresaConfig.gre_automatico_habilitado,
          umbral_gre_automatico: empresaConfig.umbral_gre_automatico,
        },
      };
      await this.cacheService.set(cacheKey, payload, COUNTRY_TTL_SECONDS);
      return { success: true, ...payload };
    } catch (error) {
      this.logger.error('Error getting country context:', error);
      throw new HttpException(
        {
          success: false,
          message: error instanceof Error ? error.message : 'Error obteniendo contexto de país',
        },
        error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
