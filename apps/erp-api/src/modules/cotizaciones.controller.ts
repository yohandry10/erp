import { Controller, Get, Post, Put, Delete, Body, Query, Param, Req, UseGuards, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SupabaseService } from '../shared/supabase/supabase.service';
import { Request } from 'express';

@ApiTags('cotizaciones')
@Controller('cotizaciones')
export class CotizacionesController {
  constructor(private readonly supabaseService: SupabaseService) {}
  
  @Get('stats')
  @ApiOperation({ summary: 'Obtener estadísticas de cotizaciones' })
  @ApiResponse({ status: 200, description: 'Estadísticas obtenidas exitosamente' })
  async getStats(@Req() req: Request) {
    try {
      console.log('📊 Calculando estadísticas de cotizaciones');
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';

      // Contar cotizaciones del mes actual
      const ahora = new Date();
      
      const { count: cotizacionesDelMes } = await this.supabaseService
        .getClient()
        .from('cotizaciones')
        .select('*', { count: 'exact', head: true });

      // Contar total de cotizaciones
      const { count: totalCotizaciones } = await this.supabaseService
        .getClient()
        .from('cotizaciones')
        .select('*', { count: 'exact', head: true });

      // Contar cotizaciones pendientes y próximas a vencer
      const hoy = new Date().toISOString().split('T')[0];
      const proximosTresDias = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const { count: porVencer } = await this.supabaseService
        .getClient()
        .from('cotizaciones')
        .select('*', { count: 'exact', head: true })
        .in('estado', ['PENDIENTE', 'ENVIADA'])
        .gte('fecha_vencimiento', hoy)
        .lte('fecha_vencimiento', proximosTresDias);

      // Calcular valor total cotizado
      const { data: cotizacionesTodas } = await this.supabaseService
        .getClient()
        .from('cotizaciones')
        .select('total');

      const valorCotizado = cotizacionesTodas?.reduce((sum, cot) => sum + (Number(cot.total) || 0), 0) || 0;

      // Calcular tasa de conversión
      const { count: aceptadas } = await this.supabaseService
        .getClient()
        .from('cotizaciones')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'ACEPTADA');

      const tasaConversion = totalCotizaciones > 0 ? Math.round((aceptadas / totalCotizaciones) * 100) : 0;

      const stats = {
        cotizacionesDelMes: cotizacionesDelMes || 0,
        valorCotizado: valorCotizado,
        tasaConversion: tasaConversion,
        porVencer: porVencer || 0
      };

      console.log('✅ Estadísticas calculadas:', stats);

    return {
      success: true,
        data: stats
      };
    } catch (error) {
      console.error('❌ Error calculando estadísticas:', error);
      return {
        success: false,
      data: {
        cotizacionesDelMes: 0,
          valorCotizado: 0,
          tasaConversion: 0,
          porVencer: 0
        },
        error: error.message
      };
    }
  }

  @Get('lista')
  @ApiOperation({ summary: 'Listar cotizaciones' })
  @ApiResponse({ status: 200, description: 'Cotizaciones listadas exitosamente' })
  async getCotizaciones(@Query() filters: any, @Req() req: Request) {
    try {
      console.log('📄 Consultando cotizaciones con filtros:', filters);
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';

      let query = this.supabaseService
        .getClient()
        .from('cotizaciones')
        .select('*')
        .order('created_at', { ascending: false });

      // Aplicar filtros
      if (filters.estado) {
        query = query.eq('estado', filters.estado);
      }
      if (filters.vendedor) {
        query = query.eq('vendedor', filters.vendedor);
      }
      if (filters.fecha_desde) {
        query = query.gte('fecha_cotizacion', filters.fecha_desde);
      }
      if (filters.fecha_hasta) {
        query = query.lte('fecha_cotizacion', filters.fecha_hasta);
      }

      const { data, error } = await query;

      if (error) {
        throw new BadRequestException('Error consultando cotizaciones: ' + error.message);
      }

      console.log(`📊 Se encontraron ${data?.length || 0} cotizaciones`);

      return {
        success: true,
        data: data || []
      };
    } catch (error) {
      console.error('❌ Error consultando cotizaciones:', error);
      return {
        success: false,
        data: [],
        error: error.message
      };
    }
  }

  @Get('clientes-top')
  @ApiOperation({ summary: 'Obtener clientes principales por cotizaciones' })
  @ApiResponse({ status: 200, description: 'Clientes principales obtenidos exitosamente' })
  async getClientesTop(@Req() req: Request) {
    // Temporalmente devolver array vacío para debug
    return {
      success: true,
      data: []
    };
    
    /*
    try {
      console.log('👥 Consultando clientes principales');
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';

      // Obtener estadísticas por cliente
      const { data, error } = await this.supabaseService
        .getClient()
        .from('cotizaciones')
        .select(`
          cliente_id,
          total,
          estado,
          fecha_cotizacion,
                     clientes:cliente_id (
             nombres,
             apellidos,
             razon_social,
             numero_documento
           )
        `)
        .eq('tenant_id', tenantId)
        .not('cliente_id', 'is', null);

      if (error) {
        throw new BadRequestException('Error consultando clientes: ' + error.message);
      }

      // Agrupar por cliente y calcular estadísticas
      const clientesMap = new Map();
      
      data?.forEach(cot => {
        const clienteId = cot.cliente_id;
        if (!clienteId || !cot.clientes) return;

                 if (!clientesMap.has(clienteId)) {
           const cliente = Array.isArray(cot.clientes) ? cot.clientes[0] : cot.clientes;
           const nombreCompleto = cliente?.razon_social || 
                                 `${cliente?.nombres || ''} ${cliente?.apellidos || ''}`.trim();
           
           clientesMap.set(clienteId, {
             id: clienteId,
             nombre: nombreCompleto,
             ruc: cliente?.numero_documento,
             cotizaciones: 0,
             totalCotizado: 0,
             aceptadas: 0,
             ultimaCotizacion: cot.fecha_cotizacion
           });
         }

        const cliente = clientesMap.get(clienteId);
        cliente.cotizaciones++;
        cliente.totalCotizado += Number(cot.total) || 0;
        if (cot.estado === 'ACEPTADA') {
          cliente.aceptadas++;
        }
        if (new Date(cot.fecha_cotizacion) > new Date(cliente.ultimaCotizacion)) {
          cliente.ultimaCotizacion = cot.fecha_cotizacion;
        }
      });

      // Convertir a array y calcular conversión
      const clientesTop = Array.from(clientesMap.values())
        .map(cliente => ({
          ...cliente,
          conversion: cliente.cotizaciones > 0 ? Math.round((cliente.aceptadas / cliente.cotizaciones) * 100) : 0
        }))
        .sort((a, b) => b.totalCotizado - a.totalCotizado)
        .slice(0, 10);

      console.log(`📊 Se encontraron ${clientesTop.length} clientes principales`);

      return {
        success: true,
        data: clientesTop
      };
    } catch (error) {
      console.error('❌ Error consultando clientes principales:', error);
      return {
        success: false,
        data: [],
        error: error.message
      };
    }
    */
  }

  @Post('crear')
  @ApiOperation({ summary: 'Crear nueva cotización' })
  @ApiResponse({ status: 201, description: 'Cotización creada exitosamente' })
  async createCotizacion(@Body() cotizacionData: any, @Req() req: Request) {
    try {
      console.log('📝 Creando nueva cotización');
      console.log('📋 Datos recibidos:', JSON.stringify(cotizacionData, null, 2));
      
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';
      const userId = user?.id;

      // Validar datos requeridos
      if (!cotizacionData.cliente_id || !cotizacionData.items || !cotizacionData.total) {
        throw new BadRequestException('Datos requeridos: cliente_id, items, total');
      }

      // Validar que cliente_id sea un UUID válido
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(cotizacionData.cliente_id)) {
        console.error('❌ cliente_id no es un UUID válido:', cotizacionData.cliente_id);
        throw new BadRequestException(`cliente_id debe ser un UUID válido. Recibido: ${cotizacionData.cliente_id}`);
      }

      console.log('✅ cliente_id es un UUID válido:', cotizacionData.cliente_id);

      // Generar número de cotización
      const ahora = new Date();
      const año = ahora.getFullYear();
      const mes = String(ahora.getMonth() + 1).padStart(2, '0');
      
      const { count } = await this.supabaseService
        .getClient()
        .from('cotizaciones')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .like('numero', `COT-${año}-${mes}-%`);

      const siguienteNumero = String((count || 0) + 1).padStart(3, '0');
      const numero = `COT-${año}-${mes}-${siguienteNumero}`;

      // Crear cotización
      const { data, error } = await this.supabaseService
        .getClient()
        .from('cotizaciones')
        .insert({
          tenant_id: tenantId,
          numero,
          cliente_id: cotizacionData.cliente_id,
          fecha_cotizacion: cotizacionData.fecha_cotizacion || ahora.toISOString().split('T')[0],
          fecha_vencimiento: cotizacionData.fecha_vencimiento,
          vendedor: cotizacionData.vendedor,
          moneda: cotizacionData.moneda || 'PEN',
          subtotal: cotizacionData.subtotal,
          igv: cotizacionData.igv,
          total: cotizacionData.total,
          estado: 'BORRADOR',
          probabilidad: cotizacionData.probabilidad || 50,
          items: cotizacionData.items,
          observaciones: cotizacionData.observaciones,
          created_at: ahora.toISOString(),
          updated_at: ahora.toISOString()
        })
        .select()
        .single();

      if (error) {
        throw new BadRequestException('Error creando cotización: ' + error.message);
      }

      console.log('✅ Cotización creada exitosamente:', numero);

    return {
      success: true,
        data: data,
        message: 'Cotización creada exitosamente'
      };
    } catch (error) {
      console.error('❌ Error creando cotización:', error);
      return {
        success: false,
      data: null,
        error: error.message
      };
    }
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar cotización' })
  @ApiResponse({ status: 200, description: 'Cotización actualizada exitosamente' })
  async actualizarCotizacion(@Param('id') id: string, @Body() cotizacionData: any, @Req() req: Request) {
    try {
      console.log('📝 Actualizando cotización:', id);
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';

      const { data, error } = await this.supabaseService
        .getClient()
        .from('cotizaciones')
        .update({
          ...cotizacionData,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) {
        throw new BadRequestException('Error actualizando cotización: ' + error.message);
      }

      return {
        success: true,
        data: data,
        message: 'Cotización actualizada exitosamente'
    };
    } catch (error) {
      console.error('❌ Error actualizando cotización:', error);
      return {
        success: false,
        data: null,
        error: error.message
      };
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener cotización por ID' })
  @ApiResponse({ status: 200, description: 'Cotización obtenida exitosamente' })
  async getCotizacion(@Param('id') id: string, @Req() req: Request) {
    try {
      console.log('📄 Obteniendo cotización:', id);
      const user = req.user as any;
      const tenantId = user?.tenant_id || '550e8400-e29b-41d4-a716-446655440000';

      const { data, error } = await this.supabaseService
        .getClient()
        .from('cotizaciones')
        .select(`
          *,
                     clientes:cliente_id (
             nombres,
             apellidos,
             razon_social,
             numero_documento,
             email,
             telefono,
             direccion
           )
        `)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (error) {
        throw new BadRequestException('Error obteniendo cotización: ' + error.message);
      }

      return {
        success: true,
        data: data
      };
    } catch (error) {
      console.error('❌ Error obteniendo cotización:', error);
      return {
        success: false,
        data: null,
        error: error.message
      };
    }
  }
}