import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CpeXmlBuilder } from './cpe-xml.builder';
import { paisDelTenant, rangoDelDiaDelTenant } from '../../shared/utils/fecha-tenant.util';
import { fechaDeDocumentoEnPais, zonaHorariaDePais } from '../../shared/utils/fecha-peru.util';

/** Consultas y exportaciones CPE; no participa en emisión ni anulación. */
export class CpeReportingService {
  private readonly xmlBuilder = new CpeXmlBuilder();

  constructor(private readonly supabaseService: SupabaseService) {}

async getComprobantesFromDatabase(filters: any = {}, tenantId?: string) {
    try {
      console.log('📄 Consultando tabla CPE en Supabase...', filters, 'tenantId:', tenantId);

      const client = this.supabaseService.getClient();
      if (!client) {
        console.error('❌ Cliente de Supabase no disponible');
        return {
          success: false,
          message: 'Cliente de Supabase no configurado',
          data: []
        };
      }

      // Paginación y rango
      const page = Number(filters.page || 1);
      const pageSize = Math.min(Number(filters.pageSize || 50), 200);
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      // Construir query base
      let query = client
        .from('cpe')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      // Filtrar por tenant_id si se proporciona
      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      // Aplicar filtros si existen
      if (filters.tipoComprobante) {
        query = query.eq('tipo_documento', filters.tipoComprobante);
      }

      if (filters.estado) {
        query = query.eq('estado', filters.estado);
      }

      if (filters.serie) {
        query = query.eq('serie', filters.serie);
      }

      if (filters.moneda) {
        query = query.eq('moneda', filters.moneda);
      }

      if (filters.fechaDesde) {
        query = query.gte('created_at', `${filters.fechaDesde}T00:00:00`);
      }

      if (filters.fechaHasta) {
        query = query.lte('created_at', `${filters.fechaHasta}T23:59:59`);
      }

      if (filters.cliente) {
        query = query.ilike('razon_social_receptor', `%${filters.cliente}%`);
      }

      const { data: cpeData, error, count } = await query;

      if (error) {
        console.error('❌ Error consultando CPE:', error);
        console.error('📊 Detalles completos del error:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }

      console.log(`📊 Datos CPE encontrados:`, cpeData?.length || 0);

      // La fecha del comprobante se presenta en la zona del contribuyente. Con
      // `toISOString()` se mostraba en UTC: a las 20:15 de Lima un comprobante
      // emitido en ese momento aparecía fechado al día siguiente, es decir con
      // fecha futura y en el periodo tributario equivocado. Se comprobó en
      // producción el 2026-08-19: la factura demo salía como 2026-08-20.
      //
      // Pero convertir la zona de una **fecha pura** la retrasa un día, que es
      // como se guarda `fecha_emision`: el listado mostraba 2026-08-27 para una
      // boleta cuyo XML declaraba 2026-08-28. `fechaDeDocumentoEnPais` sólo
      // convierte lo que lleva hora.
      const zonaTenant = zonaHorariaDePais(await paisDelTenant(client, tenantId));
      const fechaLocal = (valor: unknown): string =>
        fechaDeDocumentoEnPais(valor, zonaTenant);

      // Transformar datos al formato esperado por el frontend
      const comprobantesFormateados = (cpeData || []).map(cpe => ({
        id: cpe.id,
        tipoDocumento: cpe.tipo_documento,
        tipoComprobante: this.getTipoComprobanteText(cpe.tipo_documento),
        serie: cpe.serie,
        numero: cpe.numero,
        fechaEmision: fechaLocal(cpe.fecha_emision ?? cpe.created_at),
        cliente: cpe.razon_social_receptor || 'Cliente General',
        clienteRuc: cpe.documento_receptor || '',
        total: parseFloat(cpe.total_venta || 0),
        moneda: cpe.moneda || 'PEN',
        estado: cpe.estado || 'BORRADOR',
        estadoSunat: cpe.estado,
        observaciones: cpe.error_message || '',
        fechaCreacion: cpe.created_at
      }));

      console.log(`✅ Se formatearon ${comprobantesFormateados.length} comprobantes`);

      return {
        success: true,
        data: comprobantesFormateados,
        message: `Se encontraron ${comprobantesFormateados.length} comprobantes`,
        meta: {
          total: count ?? comprobantesFormateados.length,
          page,
          pageSize,
        }
      };

    } catch (error) {
      console.error('❌ Error general en getComprobantesFromDatabase:', error);
      return {
        success: false,
        data: [],
        message: `Error consultando comprobantes: ${error.message}`,
        error: error.message
      };
    }
  }

async exportComprobantesCsv(filters: any = {}, tenantId?: string) {
    const response = await this.getComprobantesFromDatabase(
      { ...filters, page: 1, pageSize: 5000 },
      tenantId,
    );
    if (!response.success) {
      return { success: false, content: '', filename: '', message: response.message };
    }

    const headers = [
      'tipoComprobante',
      'serie',
      'numero',
      'fechaEmision',
      'cliente',
      'clienteRuc',
      'moneda',
      'total',
      'estado',
      'estadoSunat',
    ];

    const rows = (response.data || []).map((c: any) => [
      c.tipoComprobante,
      c.serie,
      c.numero,
      c.fechaEmision,
      c.cliente,
      c.clienteRuc,
      c.moneda,
      c.total,
      c.estado,
      c.estadoSunat,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const filename = `comprobantes_${new Date().toISOString().slice(0, 10)}.csv`;

    return { success: true, content: csvContent, filename };
  }

private getTipoComprobanteText(tipo: string): string {
    switch (this.normalizeTipoDocumentoSunat(tipo, false) || tipo) {
      case '01':
        return 'Factura';
      case '03':
        return 'Boleta';
      case '07':
        return 'Nota Crédito';
      case '08':
        return 'Nota Débito';
      case 'TICKET':
        return 'Ticket';
      default:
        return tipo || 'Desconocido';
    }
  }

async getStatsFromDatabase(tenantId?: string) {
    try {
      console.log('📊 Calculando estadísticas CPE desde BD para tenant:', tenantId);

      const client = this.supabaseService.getClient();
      if (!client) {
        throw new Error('Cliente de Supabase no disponible');
      }

      // «Hoy» es el día del contribuyente, no el de UTC: con el servidor en UTC la
      // ventana empezaba a las 19:00 de la víspera en Lima y en Bogotá.
      const { desde: inicioDia, hasta: finDia } = await rangoDelDiaDelTenant(client, tenantId);
      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

      // CPE emitidos hoy
      let queryHoy = client
        .from('cpe')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', inicioDia)
        .lt('created_at', finDia);

      if (tenantId) {
        queryHoy = queryHoy.eq('tenant_id', tenantId);
      }

      const { count: cpeHoy } = await queryHoy;

      // CPE del mes
      let queryMes = client
        .from('cpe')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', inicioMes);

      if (tenantId) {
        queryMes = queryMes.eq('tenant_id', tenantId);
      }

      const { count: cpeMes } = await queryMes;

      // Monto facturado del mes
      let queryMonto = client
        .from('cpe')
        .select('total_venta')
        .gte('created_at', inicioMes);

      if (tenantId) {
        queryMonto = queryMonto.eq('tenant_id', tenantId);
      }

      const { data: montoData } = await queryMonto;

      const montoFacturado = (montoData || []).reduce((sum, cpe) => 
        sum + parseFloat(cpe.total_venta || 0), 0
      );

      // CPE rechazados
      let queryRechazados = client
        .from('cpe')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'RECHAZADO');

      if (tenantId) {
        queryRechazados = queryRechazados.eq('tenant_id', tenantId);
      }

      const { count: rechazados } = await queryRechazados;

      const stats = {
        cpeEmitidosHoy: cpeHoy || 0,
        cpeDelMes: cpeMes || 0,
        montoFacturado: Math.round(montoFacturado * 100) / 100,
        rechazados: rechazados || 0
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
          cpeEmitidosHoy: 0,
          cpeDelMes: 0,
          montoFacturado: 0,
          rechazados: 0
        },
        error: error.message
      };
    }
  }

  private normalizeTipoDocumentoSunat(
    tipo: string | null | undefined,
    throwOnUnknown = true,
  ): string {
    return this.xmlBuilder.normalizeTipoDocumentoSunat(tipo, throwOnUnknown);
  }
}
