import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { SupabaseService } from '../../shared/supabase/supabase.service';

@ApiTags('help')
@Controller('help')
export class HelpController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get('search')
  @ApiOperation({ summary: 'Buscar articulos de ayuda para el tenant actual' })
  async search(
    @CurrentTenant() tenantId: string,
    @Query('q') query?: string,
    @Query('rol') rol?: string,
    @Query('categoria') categoria?: string,
  ) {
    if (!query?.trim()) {
      throw new BadRequestException('Query parameter "q" is required');
    }

    const { data, error } = await this.supabase.getClient().rpc('buscar_ayuda', {
      p_query: query.trim(),
      p_rol: rol || null,
      p_categoria: categoria || null,
      p_tenant_id: tenantId,
      p_limite: 5,
    });

    if (error) {
      throw new BadRequestException(error.message || 'Error searching help');
    }

    const resultado = data && data.length > 0 ? data[0] : null;
    const relacionados = data && data.length > 1 ? data.slice(1) : [];

    return {
      encontrado: !!resultado,
      resultado,
      relacionados,
    };
  }

  @Get('sugerencias')
  @ApiOperation({ summary: 'Obtener sugerencias de ayuda para el tenant actual' })
  async suggestions(
    @Query('rol') rol?: string,
    @Query('categoria') categoria?: string,
    @Query('limite') limite?: string,
  ) {
    const parsedLimit = Number.parseInt(limite || '5', 10);
    const safeLimit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 20)
      : 5;

    const { data, error } = await this.supabase.getClient().rpc('obtener_sugerencias_ayuda', {
      p_rol: rol || null,
      p_categoria: categoria || null,
      p_limite: safeLimit,
    });

    if (error) {
      throw new BadRequestException(error.message || 'Error fetching suggestions');
    }

    return {
      sugerencias: data || [],
    };
  }
}
