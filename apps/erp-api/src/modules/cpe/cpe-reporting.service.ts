import { BadRequestException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CpeXmlBuilder } from './cpe-xml.builder';
import { paisDelTenant, rangoDelDiaDelTenant } from '../../shared/utils/fecha-tenant.util';
import { fechaDeDocumentoEnPais, zonaHorariaDePais } from '../../shared/utils/fecha-peru.util';
import { isFiscalDemoRepresentation } from './historical-cpe-country.util';

/** Consultas y exportaciones CPE; no participa en emisión ni anulación. */
export class CpeReportingService {
  private readonly xmlBuilder = new CpeXmlBuilder();

  constructor(private readonly supabaseService: SupabaseService) {}

async getComprobantesFromDatabase(filters: any = {}, tenantId?: string) {
    const page = filters.page == null || filters.page === '' ? 1 : Number(filters.page);
    const pageSize = filters.pageSize == null || filters.pageSize === '' ? 50 : Number(filters.pageSize);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 200) {
      throw new BadRequestException('page debe ser un entero positivo y pageSize debe estar entre 1 y 200');
    }
    for (const key of ['fechaDesde','fechaHasta']) {
      const value = filters[key];
      if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value)) {
        throw new BadRequestException(key + ' debe ser una fecha válida YYYY-MM-DD');
      }
    }
    if (filters.fechaDesde && filters.fechaHasta && filters.fechaDesde > filters.fechaHasta) throw new BadRequestException('El rango de fechas está invertido');
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
      const paisTenant = await paisDelTenant(client, tenantId);
      const dateColumn = paisTenant === 'PE' ? 'fecha_emision' : 'created_at';

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      // Construir query base
      let query = client
        .from('cpe')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
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
        query = query.gte(dateColumn, `${filters.fechaDesde}T00:00:00${paisTenant === 'PE' ? '+00:00' : ''}`);
      }

      if (filters.fechaHasta) {
        query = query.lte(dateColumn, `${filters.fechaHasta}T23:59:59${paisTenant === 'PE' ? '.999999+00:00' : ''}`);
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
      const zonaTenant = zonaHorariaDePais(paisTenant);
      const fechaLocal = (valor: unknown): string =>
        fechaDeDocumentoEnPais(valor, zonaTenant);

      // Transformar datos al formato esperado por el frontend
      const comprobantesFormateados = (cpeData || []).map(cpe => {
        const isDemoRepresentation = isFiscalDemoRepresentation(cpe, paisTenant);
        return {
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
          // FIRMADO es el estado técnico que exige el writer atómico legado. En
          // una demo local el artefacto no tiene XMLDSig/XAdES, por lo que la
          // presentación debe decir explícitamente que sólo es una muestra local.
          estado: cpe.estado || 'BORRADOR',
          estadoSunat: isDemoRepresentation
            ? 'NO_TRANSMITIDO'
            : (cpe.estado_sunat || cpe.sunat_status || cpe.estado),
          isDemoRepresentation,
          observaciones: cpe.error_message || '',
          fechaCreacion: cpe.created_at
        };
      });

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
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('No se pudieron consultar los comprobantes; reintente');
    }
  }

async exportComprobantesCsv(filters: any = {}, tenantId?: string) {
    const data: any[] = [];
    let page = 1;
    let total = 0;
    do {
      const response = await this.getComprobantesFromDatabase({ ...filters, page, pageSize: 200 }, tenantId);
      total = response.meta.total;
      data.push(...response.data);
      if (!response.data.length && data.length < total) throw new ServiceUnavailableException('La exportación cambió durante la consulta; reintente');
      page += 1;
    } while (data.length < total);

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

    const rows = data.map((c: any) => [
      c.tipoComprobante,
      c.serie,
      c.numero,
      c.fechaEmision,
      c.cliente,
      c.clienteRuc,
      c.moneda,
      c.total,
      c.isDemoRepresentation ? 'MUESTRA_LOCAL' : c.estado,
      c.estadoSunat,
    ]);

    const cell = (value: unknown) => {
      let text = String(value ?? '');
      const firstVisible = [...text].find(character => character.charCodeAt(0) > 32);
      if (typeof value === 'string' && firstVisible && '=+@-'.includes(firstVisible)) text = "'" + text;
      return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g,'""') + '"' : text;
    };
    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell).join(','))].join('\r\n');
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
      case '91':
        return 'Nota Crédito DIAN';
      case '92':
        return 'Nota Débito DIAN';
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

      const { count: cpeHoy, error: errorHoy } = await queryHoy;
      if (errorHoy) throw errorHoy;

      // CPE del mes
      let queryMes = client
        .from('cpe')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', inicioMes);

      if (tenantId) {
        queryMes = queryMes.eq('tenant_id', tenantId);
      }

      const { count: cpeMes, error: errorMes } = await queryMes;
      if (errorMes) throw errorMes;

      // Monto facturado del mes
      let queryMonto = client
        .from('cpe')
        .select('total_venta')
        .gte('created_at', inicioMes);

      if (tenantId) {
        queryMonto = queryMonto.eq('tenant_id', tenantId);
      }

      const { data: montoData, error: errorMonto } = await queryMonto;
      if (errorMonto) throw errorMonto;

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

      const { count: rechazados, error: errorRechazados } = await queryRechazados;
      if (errorRechazados) throw errorRechazados;

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
      throw new ServiceUnavailableException('No se pudieron consultar las estadísticas CPE; reintente');
    }
  }

  private normalizeTipoDocumentoSunat(
    tipo: string | null | undefined,
    throwOnUnknown = true,
  ): string {
    return this.xmlBuilder.normalizeTipoDocumentoSunat(tipo, throwOnUnknown);
  }
}
