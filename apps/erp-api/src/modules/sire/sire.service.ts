import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { EventBusService } from '../../shared/events/event-bus.service';
import { TenantContextService } from '../../shared/tenant/tenant-context.service';

@Injectable()
export class SireService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly eventBus: EventBusService,
    private readonly tenantContext: TenantContextService,
  ) {
    console.log('📊 [SIRE] ¡Servicio SIRE inicializado!');
    this.initializeEventListeners();
    console.log('📊 [SIRE] ¡Constructor SIRE completado!');
  }

  private initializeEventListeners() {
    console.log('📊 [SIRE] Inicializando listeners de eventos...');
    
    this.eventBus.onComprobanteCreadoEvent(async (event) => {
      console.log('📊 [SIRE] ¡EVENTO RECIBIDO! Procesando comprobante para registro SIRE...');
      console.log('📊 [SIRE] Datos del evento:', JSON.stringify(event.data, null, 2));
      try {
        await this.procesarComprobanteParaSire(event.data);
      } catch (error) {
        console.error('❌ [SIRE] Error procesando evento de comprobante:', error);
      }
    });

    console.log('✅ [SIRE] Event listeners configurados correctamente');
  }

  async procesarComprobanteParaSire(comprobante: any): Promise<void> {
    try {
      // ✅ MULTI-TENANT: Obtener tenant del comprobante
      const tenantId = this.ensureTenant(comprobante.tenant_id || comprobante.tenantId);
      console.log(`📊 [SIRE] ¡NUEVO COMPROBANTE DETECTADO! Registrando ${comprobante.serie}-${comprobante.numero} en SIRE para tenant: ${tenantId}`);
      console.log(`📊 [SIRE] Datos del comprobante:`, JSON.stringify(comprobante, null, 2));
      
      const periodo = this.getPeriodoFromComprobante(comprobante);
      
      // 1. Buscar si ya existe un reporte SIRE para este período
      let reporteSire = await this.buscarOCrearReportePeriodo(periodo, comprobante.tipoDocumento, tenantId);

      // 2. Crear registro detalle (idempotente). Solo si se inserta, incrementamos el contador.
      const inserted = await this.crearRegistroDetalleComprobante(reporteSire.id, comprobante, tenantId);
      if (!inserted) {
        console.log(
          `♻️ [SIRE] Comprobante ya registrado en sire_registros_detalle (tenant=${tenantId}, cpe=${comprobante.cpeId}), omitiendo duplicado.`,
        );
        return;
      }

      // 3. Actualizar contador de registros en el reporte (solo para insert real)
      await this.actualizarContadorRegistros(reporteSire.id, tenantId);
      
      console.log(`✅ [SIRE] Comprobante ${comprobante.serie}-${comprobante.numero} registrado exitosamente en reporte ${reporteSire.id} para período ${periodo}`);
      console.log(`📈 [SIRE] Total de registros en el reporte: ${reporteSire.total_registros + 1}`);
    } catch (error) {
      console.error('❌ [SIRE] Error procesando comprobante:', error);
      throw error; // Re-lanzar para que se pueda manejar en niveles superiores
    }
  }

  private async buscarOCrearReportePeriodo(periodo: string, tipoDocumento?: string, tenantId?: string): Promise<any> {
    try {
      // ✅ MULTI-TENANT: Usar tenant_id
      const currentTenantId = this.ensureTenant(tenantId);
      const tipoSire = this.getTipoSirePorDocumento(tipoDocumento);
      
      // Buscar reporte existente para el período
      const { data: reporteExistente } = await this.supabaseService.getClient()
        .from('sire_files')
        .select('*')
        .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
        .eq('periodo', periodo)
        .eq('tipo', tipoSire)
        .single();

      if (reporteExistente) {
        console.log(`📊 [SIRE] Usando reporte existente: ${reporteExistente.id}`);
        return reporteExistente;
      }

      // Crear nuevo reporte si no existe
      console.log(`📊 [SIRE] Creando nuevo reporte para período ${periodo}`);
      const { data: nuevoReporte, error } = await this.supabaseService.getClient()
        .from('sire_files')
        .insert({
          tenant_id: currentTenantId, // ✅ Usar tenant actual
          periodo: periodo,
          tipo: tipoSire,
          filename: `SIRE_${tipoSire}_${periodo}.txt`,
          file_path: `/sire/${periodo}/${tipoSire}.txt`,
          file_size: 0,
          total_registros: 0,
          estado: 'GENERANDO',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      
      console.log(`✅ [SIRE] Nuevo reporte creado: ${nuevoReporte.id}`);
      return nuevoReporte;
    } catch (error) {
      console.error('❌ [SIRE] Error gestionando reporte del período:', error);
      throw error;
    }
  }

  private async actualizarContadorRegistros(reporteId: string, tenantId?: string): Promise<void> {
    try {
      // ✅ MULTI-TENANT: Usar tenant_id
      const currentTenantId = this.ensureTenant(tenantId);
      console.log(`📊 [SIRE] Recalculando contador para reporte ${reporteId}...`);

      // Obtener el reporte completo para regenerar su contenido
      const { data: reporte, error: selectError } = await this.supabaseService.getClient()
        .from('sire_files')
        .select('*')
        .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
        .eq('id', reporteId)
        .single();

      if (selectError) {
        console.error('❌ [SIRE] Error obteniendo reporte actual:', selectError);
        throw selectError;
      }

      // Derivar el total desde el contenido real (fuente de verdad, igual que la descarga)
      // en vez de un incremento no atómico que se desalinea del archivo generado.
      const contenido = await this.generarContenidoSire(reporte, currentTenantId);
      const nuevoTotal = contenido.split('\n').slice(1).filter((line) => line.trim().length > 0).length;
      const fileSize = Buffer.byteLength(contenido, 'utf8');
      console.log(`📊 [SIRE] Contador recalculado desde contenido: ${nuevoTotal} registros`);

      // Actualizar con el total real y el tamaño del archivo
      const { error: updateError } = await this.supabaseService.getClient()
        .from('sire_files')
        .update({
          total_registros: nuevoTotal,
          file_size: fileSize,
          estado: 'GENERADO',
          updated_at: new Date().toISOString()
        })
        .eq('id', reporteId);

      if (updateError) {
        console.error('❌ [SIRE] Error actualizando contador:', updateError);
        throw updateError;
      }

      console.log(`✅ [SIRE] Contador actualizado exitosamente para reporte ${reporteId}: ${nuevoTotal} registros`);
    } catch (error) {
      console.error('❌ [SIRE] Error crítico actualizando contador:', error);
      throw error;
    }
  }

  private async actualizarRegistrosPendientes(periodo: string, tipoDocumento: string): Promise<void> {
    // En una implementación real, aquí se incrementarían los contadores
    // de registros pendientes por período y tipo de documento
    console.log(`📊 [SIRE] Registro pendiente: ${tipoDocumento} para período ${periodo}`);
  }

  private async crearRegistroDetalleComprobante(
    reporteId: string,
    comprobante: any,
    tenantId?: string,
  ): Promise<boolean> {
    try {
      console.log(`📊 [SIRE] Creando registro detalle para comprobante ${comprobante.serie}-${comprobante.numero}`);
      
      // En una implementación completa, aquí se crearía un registro detallado
      // del comprobante en una tabla de detalles SIRE
      const registroDetalle = {
        reporte_id: reporteId,
        tenant_id: tenantId || comprobante.tenant_id || comprobante.tenantId || null,
        cpe_id: comprobante.cpeId,
        tipo_documento: comprobante.tipoDocumento,
        serie: comprobante.serie,
        numero: comprobante.numero,
        cliente_id: comprobante.clienteId,
        total: comprobante.total,
        fecha_registro: new Date().toISOString(),
        es_credito: comprobante.esCredito || false,
        venta_id: comprobante.ventaId
      };
      
      console.log(`📊 [SIRE] Registro detalle creado:`, registroDetalle);

      // Insertar si existe tabla sire_registros_detalle
      try {
        // HARDENING: dedupe por (tenant_id, cpe_id) para reintentos/eventos duplicados.
        const { data: existing, error: existingError } = await this.supabaseService
          .getClient()
          .from('sire_registros_detalle')
          .select('id')
          .eq('tenant_id', registroDetalle.tenant_id)
          .eq('cpe_id', registroDetalle.cpe_id)
          .maybeSingle();

        if (!existingError && existing) {
          return false;
        }

        await this.supabaseService.getClient()
          .from('sire_registros_detalle')
          .insert(registroDetalle);
        console.log(`✅ [SIRE] Registro detalle guardado para comprobante ${comprobante.serie}-${comprobante.numero}`);
      } catch (err: any) {
        console.warn('⚠️ [SIRE] No se pudo insertar en sire_registros_detalle (puede no existir):', err?.message || err);
      }
      return true;
    } catch (error) {
      console.error('❌ [SIRE] Error creando registro detalle:', error);
      throw error;
    }
  }

  async getStats(tenantId?: string) {
    try {
      const currentTenantId = this.ensureTenant(tenantId);
      console.log('📊 Calculando estadísticas SIRE para tenant:', currentTenantId);
      
      // Get current month's statistics
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
      
      // Count reports from this month
      let queryMes = this.supabaseService
        .getClient()
        .from('sire_files')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', `${currentMonth}-01`)
        .lt('created_at', `${this.getNextMonth(currentMonth)}-01`);

      queryMes = queryMes.eq('tenant_id', currentTenantId);

      const { count: reportesDelMes, error: reportesMesError } = await queryMes;
      if (reportesMesError) {
        throw new BadRequestException('Error consultando reportes SIRE del mes: ' + reportesMesError.message);
      }

      // Count total records processed
      let queryRegistros = this.supabaseService
        .getClient()
        .from('sire_files')
        .select('total_registros')
        .eq('tenant_id', currentTenantId);

      const { data: reportes, error: registrosError } = await queryRegistros;
      if (registrosError) {
        throw new BadRequestException('Error consultando registros SIRE: ' + registrosError.message);
      }
      const registrosTotales = reportes?.reduce((sum, reporte) => sum + (reporte.total_registros || 0), 0) || 0;

      // Count detail records if table exists
      let totalDetalles = 0;
      try {
        const { count: countDetalle, error: detalleError } = await this.supabaseService
          .getClient()
          .from('sire_registros_detalle')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', currentTenantId);
        if (detalleError) {
          throw detalleError;
        }
        totalDetalles = countDetalle || 0;
      } catch (err: any) {
        console.warn('⚠️ [SIRE] No se pudo contar sire_registros_detalle (puede no existir):', err?.message || err);
      }

      // Count reports sent to SUNAT (estado ENVIADO)
      let queryEnviados = this.supabaseService
        .getClient()
        .from('sire_files')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'ENVIADO');

      queryEnviados = queryEnviados.eq('tenant_id', currentTenantId);

      const { count: enviadosASunat, error: enviadosError } = await queryEnviados;
      if (enviadosError) {
        throw new BadRequestException('Error consultando reportes SIRE enviados: ' + enviadosError.message);
      }

      // Count pending reports
      let queryPendientes = this.supabaseService
        .getClient()
        .from('sire_files')
        .select('*', { count: 'exact', head: true })
        .in('estado', ['GENERADO', 'GENERANDO', 'PENDIENTE']);

      queryPendientes = queryPendientes.eq('tenant_id', currentTenantId);

      const { count: pendientes, error: pendientesError } = await queryPendientes;
      if (pendientesError) {
        throw new BadRequestException('Error consultando reportes SIRE pendientes: ' + pendientesError.message);
      }

      const stats = {
        reportesDelMes: reportesDelMes || 0,
        registrosTotales,
        totalDetalles,
        enviadosASunat: enviadosASunat || 0,
        pendientes: pendientes || 0,
      };

      console.log('✅ Estadísticas SIRE calculadas:', stats);

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      console.error('❌ Error getting SIRE stats:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Error obteniendo estadísticas SIRE');
    }
  }

  async getReportes(filters: any, tenantId?: string) {
    const currentTenantId = this.ensureTenant(tenantId);
    try {
      console.log('📄 Consultando reportes SIRE para tenant:', currentTenantId, 'filters:', filters);
      
      let query = this.supabaseService
        .getClient()
        .from('sire_files')
        .select('*')
        .order('created_at', { ascending: false });

      // Filter by tenant
      query = query.eq('tenant_id', currentTenantId);

      // Apply filters
      if (filters.periodo) {
        const periodoCorto = filters.periodo.substring(0, 10);
        query = query.eq('periodo', periodoCorto);
      }
      if (filters.tipoReporte) {
        // Map long values to shorter ones that fit the database constraints
        const tipoReporteMap = {
          'REGISTRO_VENTAS': 'REG_VEN',
          'REGISTRO_COMPRAS': 'REG_COM', 
          'LIBRO_DIARIO': 'LIB_DIA',
          'LIBRO_MAYOR': 'LIB_MAY',
          'RETENCIONES': 'RETENC',
          'PERCEPCIONES': 'PERCEP'
        };
        const tipoCorto = tipoReporteMap[filters.tipoReporte] || filters.tipoReporte.substring(0, 10);
        query = query.eq('tipo', tipoCorto);
      }
      if (filters.estado) {
        query = query.eq('estado', String(filters.estado).toUpperCase());
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Error fetching SIRE reports:', error);
        throw new BadRequestException('Error fetching SIRE reports: ' + error.message);
      }

      console.log(`📊 Se encontraron ${data?.length || 0} reportes SIRE`);

      // Transform data back to full names for frontend display
      const dataTransformada = (data || []).map(reporte => ({
        ...reporte,
        tipo_display: this.getTipoReporteFullName(reporte.tipo),
        periodo_display: reporte.periodo
      }));

      return {
        success: true,
        data: dataTransformada,
      };
    } catch (error) {
      console.error('❌ Error getting SIRE reports:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Error obteniendo reportes SIRE');
    }
  }

  private getTipoReporteFullName(tipoCorto: string): string {
    const tipoMap = {
      'REG_VEN': 'Registro de Ventas',
      'REG_COM': 'Registro de Compras',
      'LIB_DIA': 'Libro Diario',
      'LIB_MAY': 'Libro Mayor',
      'RETENC': 'Retenciones',
      'PERCEP': 'Percepciones'
    };
    return tipoMap[tipoCorto] || tipoCorto;
  }

  async generarReporte(reportData: any, tenantId?: string) {
    const currentTenantId = this.ensureTenant(tenantId);
    try {
      console.log('🔄 Generando reporte SIRE:', reportData, 'para tenant:', currentTenantId);

      // Validate required fields based on real table structure
      if (!reportData.tipoReporte || !reportData.periodo) {
        throw new BadRequestException('Tipo de reporte y período son requeridos');
      }

      const tipoCorto = this.mapTipoReporte(reportData.tipoReporte);
      const periodoCorto = this.normalizePeriodo(reportData.periodo);
      
      const nuevoReporte = {
        tenant_id: currentTenantId,
        periodo: periodoCorto,
        tipo: tipoCorto,
        filename: `SIRE_${tipoCorto}_${periodoCorto}.txt`,
        file_path: `/sire/${periodoCorto}/${tipoCorto}.txt`,
        file_size: 0,
        estado: 'GENERANDO',
        total_registros: 0,
        metadata: {
          incluirAnulados: Boolean(reportData.incluirAnulados),
          formato: reportData.formato || 'TXT',
        },
      };

      console.log('💾 Insertando nuevo reporte SIRE (valores ajustados):', nuevoReporte);

      const { data, error } = await this.supabaseService.insert('sire_files', nuevoReporte);

      if (error) {
        if ((error as any).code === '23505') {
          const { data: reporteExistente, error: existenteError } = await this.supabaseService
            .getClient()
            .from('sire_files')
            .select('*')
            .eq('tenant_id', currentTenantId)
            .eq('tipo', tipoCorto)
            .eq('periodo', periodoCorto)
            .single();

          if (!existenteError && reporteExistente) {
            if (reporteExistente.estado !== 'ENVIADO') {
              await this.simularGeneracionReporte(reporteExistente.id, currentTenantId);
            }
            return {
              success: true,
              data: reporteExistente,
              message: 'Reporte SIRE existente reutilizado',
            };
          }
        }
        console.error('❌ Error creating SIRE report:', error);
        throw new BadRequestException('Error creating SIRE report: ' + error.message);
      }

      console.log('📊 Datos devueltos por insert:', data);

      let reporteCreado = data ? (Array.isArray(data) ? data[0] : data) : null;
      
      // Si no se devolvió data, consultar el reporte recién creado
      if (!reporteCreado) {
        console.log('⚠️ Insert no devolvió datos, consultando último reporte creado...');
        
        const { data: ultimoReporte, error: queryError } = await this.supabaseService
          .getClient()
          .from('sire_files')
          .select('*')
          .eq('tenant_id', currentTenantId)
          .eq('tipo', tipoCorto)
          .eq('periodo', periodoCorto)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (queryError || !ultimoReporte) {
          console.error('❌ Error consultando reporte creado:', queryError);
          throw new BadRequestException('Error verificando reporte creado');
        }

        reporteCreado = ultimoReporte;
      }

      console.log('✅ Reporte SIRE creado exitosamente:', reporteCreado);

      // Validate that we have a valid report with ID before setting timeout
      if (reporteCreado && reporteCreado.id) {
        await this.simularGeneracionReporte(reporteCreado.id, currentTenantId);
      } else {
        console.error('❌ No se pudo obtener ID del reporte creado');
      }

      return {
        success: true,
        data: reporteCreado,
        message: 'Reporte SIRE iniciado correctamente',
      };
    } catch (error) {
      console.error('❌ Error generating SIRE report:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Error al generar el reporte SIRE');
    }
  }

  async downloadReporte(id: string, tenantId?: string) {
    const currentTenantId = this.ensureTenant(tenantId);
    try {
      console.log('📥 Descargando reporte SIRE:', id, 'para tenant:', currentTenantId);
      
      let query = this.supabaseService
        .getClient()
        .from('sire_files')
        .select('*')
        .eq('id', id);

      query = query.eq('tenant_id', currentTenantId);

      const { data: reporte, error } = await query.single();

      if (error || !reporte) {
        throw new NotFoundException('Reporte SIRE no encontrado');
      }

      if (reporte.estado !== 'GENERADO' && reporte.estado !== 'ENVIADO') {
        throw new BadRequestException('El reporte aún no está disponible para descarga');
      }

      // Build real content from CPE/compras por tenant
      const contenidoReporte = await this.generarContenidoSire(reporte, currentTenantId);

      return {
        success: true,
        data: contenidoReporte,
        message: 'Reporte descargado correctamente',
      };
    } catch (error) {
      console.error('❌ Error downloading SIRE report:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Error al descargar el reporte');
    }
  }

  async enviarSunat(id: string, tenantId?: string) {
    const currentTenantId = this.ensureTenant(tenantId);
    try {
      console.log('📡 Enviando reporte SIRE a SUNAT:', id, 'para tenant:', currentTenantId);
      
      let query = this.supabaseService
        .getClient()
        .from('sire_files')
        .select('*')
        .eq('id', id);

      query = query.eq('tenant_id', currentTenantId);

      const { data: reporte, error } = await query.single();

      if (error || !reporte) {
        throw new NotFoundException('Reporte SIRE no encontrado');
      }

      if (reporte.estado !== 'GENERADO') {
        throw new BadRequestException('El reporte debe estar generado para poder enviarse');
      }

      // Update status to ENVIADO
      const { error: updateError } = await this.supabaseService.update(
        'sire_files',
        {
          estado: 'ENVIADO',
          updated_at: new Date().toISOString(),
        },
        { id, tenant_id: currentTenantId }
      );

      if (updateError) {
        throw new BadRequestException('Error updating report status: ' + updateError.message);
      }

      console.log('✅ Reporte SIRE enviado a SUNAT exitosamente');

      return {
        success: true,
        message: 'Reporte enviado a SUNAT correctamente',
      };
    } catch (error) {
      console.error('❌ Error sending SIRE report to SUNAT:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Error al enviar el reporte a SUNAT');
    }
  }

  findAll() {
    return {
      success: true,
      message: 'SIRE module is operational',
      data: [],
    };
  }

  private async simularGeneracionReporte(reporteId: string, tenantId?: string) {
    try {
      console.log('🔄 Generando contenido real para reporte:', reporteId);
      
      if (!reporteId) {
        console.error('❌ ID de reporte inválido:', reporteId);
        return;
      }

      const { data: reporte } = await this.supabaseService
        .getClient()
        .from('sire_files')
        .select('*')
        .eq('id', reporteId)
        .maybeSingle();

      if (!reporte) {
        throw new Error('Reporte no encontrado');
      }

      const contenido = await this.generarContenidoSire(reporte, tenantId || reporte.tenant_id);
      const totalRegistros = contenido.split('\n').slice(1).filter((line) => line.trim().length > 0).length;
      const nombreArchivo = `SIRE_${reporte.tipo}_${reporte.periodo}.txt`;
      const fileSize = Buffer.byteLength(contenido, 'utf8');

      console.log('📊 Actualizando reporte a GENERADO:', { reporteId, totalRegistros, nombreArchivo });

      const { data, error } = await this.supabaseService
        .getClient()
        .from('sire_files')
        .update({
          estado: 'GENERADO',
          total_registros: totalRegistros,
          filename: nombreArchivo,
          file_size: fileSize,
          updated_at: new Date().toISOString(),
        })
        .eq('id', reporteId)
        .select();

      if (error) {
        console.error('❌ Error updating SIRE report status:', error);
        throw error;
      }

      console.log('✅ Reporte SIRE actualizado a GENERADO exitosamente:', data);
    } catch (error) {
      console.error('❌ Error generando reporte SIRE:', error);
      
      if (reporteId) {
        try {
          await this.supabaseService
            .getClient()
            .from('sire_files')
            .update({
              estado: 'ERROR',
              updated_at: new Date().toISOString(),
            })
            .eq('id', reporteId);
          console.log('📊 Estado actualizado a ERROR para reporte:', reporteId);
        } catch (updateError) {
          console.error('❌ Error actualizando estado a ERROR:', updateError);
        }
      }
    }
  }

  async generarContenidoSire(reporte: any, tenantId: string): Promise<string> {
    // Layout simplificado: REG_VEN y REG_COM con columnas SUNAT
    const periodo = reporte.periodo;
    const tipo = reporte.tipo;
    const { start, end } = this.getPeriodoDateRange(periodo);
    const incluirAnulados = Boolean(reporte.metadata?.incluirAnulados);

    const client = this.supabaseService.getClient();

    if (tipo === 'REG_VEN') {
      let query = client
        .from('cpe')
        .select('fecha_emision, tipo_documento, serie, numero, documento_receptor, razon_social_receptor, total_venta, total_igv, moneda, estado')
        .eq('tenant_id', tenantId)
        .gte('fecha_emision', start)
        .lt('fecha_emision', end);

      if (!incluirAnulados) {
        query = query.not('estado', 'in', '("ANULADO","ANULADA","CANCELADO","CANCELADA")');
      }

      const { data: ventas, error } = await query;
      if (error) {
        throw new BadRequestException('Error generando registro de ventas SIRE: ' + error.message);
      }

      const header = 'PERIODO|FECHA_EMISION|TIPO_DOCUMENTO|SERIE|NUMERO|DOC_CLIENTE|CLIENTE|VALOR_FACTURADO|IGV|TOTAL|MONEDA';
      const rows = (ventas || []).map(v =>
        [
          periodo,
          (v.fecha_emision || '').toString().slice(0, 10),
          v.tipo_documento || '',
          v.serie || '',
          (v.numero || '').toString().padStart(8, '0'),
          v.documento_receptor || '',
          (v.razon_social_receptor || '').replace(/\|/g, ' '),
          Number(v.total_venta || 0) - Number(v.total_igv || 0),
          Number(v.total_igv || 0),
          Number(v.total_venta || 0),
          v.moneda || 'PEN',
        ].join('|')
      );
      return [header, ...rows].join('\n');
    }

    if (tipo === 'REG_COM') {
      let query = client
        .from('cuentas_por_pagar')
        .select('fecha_emision, numero_documento, proveedor_id, subtotal, igv, total, moneda, estado')
        .eq('tenant_id', tenantId)
        .gte('fecha_emision', start)
        .lt('fecha_emision', end);

      if (!incluirAnulados) {
        query = query.not('estado', 'in', '("ANULADO","ANULADA","CANCELADO","CANCELADA")');
      }

      const { data: compras, error } = await query;
      if (error) {
        throw new BadRequestException('Error generando registro de compras SIRE: ' + error.message);
      }

      const header = 'PERIODO|FECHA_EMISION|NUMERO|PROVEEDOR|VALOR_ADQUISICIONES|IGV|TOTAL|MONEDA';
      const rows = (compras || []).map(c =>
        [
          periodo,
          (c.fecha_emision || '').toString().slice(0, 10),
          c.numero_documento || '',
          c.proveedor_id || '',
          Number(c.subtotal || 0),
          Number(c.igv || 0),
          Number(c.total || 0),
          c.moneda || 'PEN',
        ].join('|')
      );
      return [header, ...rows].join('\n');
    }

    throw new BadRequestException(`Tipo de reporte SIRE no soportado para generación: ${tipo}`);
  }
 
  private getNextMonth(currentMonth: string): string {
    const [year, month] = currentMonth.split('-').map(Number);
    const nextDate = new Date(year, month, 1); // month is 0-indexed in Date constructor
    return nextDate.toISOString().slice(0, 7);
  }

  private getPeriodoFromComprobante(comprobante: any): string {
    const fecha = comprobante.fechaEmision || comprobante.fecha_emision || comprobante.fecha || comprobante.created_at;
    if (!fecha) {
      return new Date().toISOString().slice(0, 7);
    }
    const parsed = new Date(fecha);
    if (Number.isNaN(parsed.getTime())) {
      return new Date().toISOString().slice(0, 7);
    }
    return parsed.toISOString().slice(0, 7);
  }

  private mapTipoReporte(tipoReporte: string): string {
    const tipoReporteMap = {
      REGISTRO_VENTAS: 'REG_VEN',
      REGISTRO_COMPRAS: 'REG_COM',
      LIBRO_DIARIO: 'LIB_DIA',
      LIBRO_MAYOR: 'LIB_MAY',
      RETENCIONES: 'RETENC',
      PERCEPCIONES: 'PERCEP',
    };

    return tipoReporteMap[tipoReporte] || String(tipoReporte).substring(0, 10);
  }

  private getTipoSirePorDocumento(tipoDocumento?: string): string {
    const tipo = String(tipoDocumento || '').toUpperCase();
    return ['REG_COM', 'COMPRA', 'COMPRAS'].includes(tipo) ? 'REG_COM' : 'REG_VEN';
  }

  private normalizePeriodo(periodo: string): string {
    const value = String(periodo || '').substring(0, 10);
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(value)) {
      throw new BadRequestException('Período SIRE inválido. Use YYYY-MM.');
    }
    return value.slice(0, 7);
  }

  private getPeriodoDateRange(periodo: string): { start: string; end: string } {
    const periodoNormalizado = this.normalizePeriodo(periodo);
    const [year, month] = periodoNormalizado.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  }

  private generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private ensureTenant(tenantId?: string): string {
    const resolvedTenant = tenantId ?? this.tenantContext.getTenantId();
    if (!resolvedTenant) {
      throw new BadRequestException('[SIRE] Tenant requerido para esta operación');
    }
    return resolvedTenant;
  }
}
