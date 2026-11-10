import { BadRequestException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CpeXmlBuilder } from './cpe-xml.builder';
import { paisDelTenant, rangoDelDiaDelTenant } from '../../shared/utils/fecha-tenant.util';
import { fechaDeDocumentoEnPais, rangoDelDiaEnPais, zonaHorariaDePais } from '../../shared/utils/fecha-peru.util';
import { isFiscalDemoRepresentation } from './historical-cpe-country.util';
import Decimal from 'decimal.js';

/** Consultas y exportaciones CPE; no participa en emisión ni anulación. */
export class CpeReportingService {
  private readonly xmlBuilder = new CpeXmlBuilder();

  constructor(private readonly supabaseService: SupabaseService) {}

  private isHistoricalImport(row: any): boolean {
    const origin = row?.metadata;
    return row?.estado === 'MIGRADO' && row.activo === false
      && origin?.origen === 'migracion_historica'
      && typeof origin.external_id === 'string' && origin.external_id.trim().length > 0
      && typeof origin.run_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(origin.run_id)
      && origin.no_sunat === true && origin.no_evento_factura === true && origin.solo_lectura === true
      && row.idempotency_key === `migracion_historica:${origin.external_id}`;
  }

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
        throw new ServiceUnavailableException('Cliente de Supabase no configurado');
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
        if (paisTenant === 'PE') {
          // Una medianoche UTC representa una fecha civil; el resto son instantes
          // y se presentan en Lima. El filtro debe respetar ambas formas legadas.
          query = query.or(`fecha_emision.gte.${filters.fechaDesde}T05:00:00Z,fecha_emision.eq.${filters.fechaDesde}T00:00:00Z`);
        } else query = query.gte(dateColumn, `${filters.fechaDesde}T00:00:00`);
      }

      if (filters.fechaHasta) {
        if (paisTenant === 'PE') {
          const next = new Date(`${filters.fechaHasta}T00:00:00Z`);
          next.setUTCDate(next.getUTCDate() + 1);
          const nextDay = next.toISOString().slice(0, 10);
          query = query.lt(dateColumn, `${nextDay}T05:00:00Z`).neq(dateColumn, `${nextDay}T00:00:00Z`);
        } else query = query.lte(dateColumn, `${filters.fechaHasta}T23:59:59`);
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
      if (!Array.isArray(cpeData) || !Number.isSafeInteger(count) || count < 0
        || cpeData.length !== Math.min(pageSize, Math.max(0, count - from))
        || new Set(cpeData.map(row => row.id)).size !== cpeData.length) {
        throw new ServiceUnavailableException('El listado de comprobantes está incompleto; reintente');
      }

      console.log(`📊 Datos CPE encontrados:`, cpeData?.length || 0);

      const documentoIds = paisTenant === 'PE'
        ? cpeData.filter(c => ['01','03'].includes(c.tipo_documento) && c.documento_id).map(c => c.documento_id)
        : [];
      const cuentasPorDocumento = new Map<string, { id: string; saldo: number; numero_documento: string }>();
      if (documentoIds.length) {
        const cuentas = await client.from('cuentas_por_cobrar').select('id,documento_id,saldo,numero_documento', { count: 'exact' })
          .eq('tenant_id', tenantId).in('documento_id', documentoIds);
        if (cuentas.error || !Array.isArray(cuentas.data) || cuentas.count !== cuentas.data.length
          || new Set(cuentas.data.map(row => row.documento_id)).size !== cuentas.data.length
          || cuentas.data.some(row => !row.id || !row.numero_documento || row.saldo == null || !Number.isFinite(Number(row.saldo)) || Number(row.saldo) < 0)) {
          throw new ServiceUnavailableException('No se pudo consultar el estado completo de cobro de los comprobantes; reintente');
        }
        for (const cuenta of cuentas.data) cuentasPorDocumento.set(cuenta.documento_id, { ...cuenta, saldo: Number(cuenta.saldo) });
      }

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
      const comprobantesFormateados = cpeData.map(cpe => {
        const isHistoricalImport = this.isHistoricalImport(cpe);
        if (!cpe.id || !cpe.tipo_documento || cpe.serie == null || !/^\d+$/.test(String(cpe.numero)) || Number(cpe.numero) <= 0
          || cpe.total_venta == null || !Number.isFinite(Number(cpe.total_venta)) || Number(cpe.total_venta) < 0
          || !/^[A-Z]{3}$/.test(cpe.moneda || '') || !(['BORRADOR','FIRMADO','ENVIADO','ACEPTADO','ERROR','RECHAZADO','ANULADO'].includes(cpe.estado) || isHistoricalImport)
          || !fechaLocal(cpe.fecha_emision ?? cpe.created_at) || !cpe.created_at) {
          throw new ServiceUnavailableException('El comprobante consultado está incompleto; reintente');
        }
        const isDemoRepresentation = !isHistoricalImport && isFiscalDemoRepresentation(cpe, paisTenant);
        return {
          id: cpe.id,
          tipoDocumento: cpe.tipo_documento,
          tipoComprobante: this.getTipoComprobanteText(cpe.tipo_documento),
          serie: cpe.serie,
          numero: cpe.numero,
          fechaEmision: fechaLocal(cpe.fecha_emision ?? cpe.created_at),
          cliente: cpe.razon_social_receptor || 'Cliente General',
          clienteRuc: cpe.documento_receptor || '',
          total: Number(cpe.total_venta),
          moneda: cpe.moneda,
          // FIRMADO es el estado técnico que exige el writer atómico legado. En
          // una demo local el artefacto no tiene XMLDSig/XAdES, por lo que la
          // presentación debe decir explícitamente que sólo es una muestra local.
          estado: cpe.estado,
          estadoSunat: isHistoricalImport ? 'NO_VERIFICADO' : isDemoRepresentation
            ? 'NO_TRANSMITIDO'
            : (cpe.estado_sunat || cpe.sunat_status || cpe.estado),
          isDemoRepresentation,
          isHistoricalImport,
          cxcId: cuentasPorDocumento.get(cpe.documento_id)?.id ?? null,
          numeroDocumentoCxc: cuentasPorDocumento.get(cpe.documento_id)?.numero_documento ?? null,
          saldoPorCobrar: cuentasPorDocumento.get(cpe.documento_id)?.saldo ?? null,
          requiereVincularCobro: paisTenant === 'PE' && Boolean(cpe.metadata?.pe_direct_request_fingerprint)
            && ['01','03'].includes(cpe.tipo_documento) && cpe.estado !== 'ANULADO'
            && !cuentasPorDocumento.has(cpe.documento_id),
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
          total: count,
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
    const ids = new Set<string>();
    do {
      const response = await this.getComprobantesFromDatabase({ ...filters, page, pageSize: 200 }, tenantId);
      if (page > 1 && response.meta.total !== total || response.data.some(row => ids.has(row.id))) throw new ServiceUnavailableException('La exportación cambió durante la consulta; reintente');
      total = response.meta.total;
      response.data.forEach(row => ids.add(row.id));
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
      // El mes también es el del contribuyente: con el servidor en UTC, el mes
      // empezaba a las 19:00 del último día del mes anterior en Lima.
      const pais = await paisDelTenant(client, tenantId);
      const hoyLocal = new Date().toLocaleDateString('en-CA', { timeZone: zonaHorariaDePais(pais) });
      const inicioMes = rangoDelDiaEnPais(pais, new Date(`${hoyLocal.slice(0, 7)}-01T12:00:00Z`)).desde;

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
      if (errorHoy || !Number.isSafeInteger(cpeHoy) || cpeHoy < 0) throw errorHoy || new Error('Conteo diario incompleto');

      // CPE del mes
      let queryMes = client
        .from('cpe')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', inicioMes);

      if (tenantId) {
        queryMes = queryMes.eq('tenant_id', tenantId);
      }

      const { count: cpeMes, error: errorMes } = await queryMes;
      if (errorMes || !Number.isSafeInteger(cpeMes) || cpeMes < 0) throw errorMes || new Error('Conteo mensual incompleto');

      // Monto facturado del mes
      let montoFacturado = new Decimal(0);
      const idsMonto = new Set<string>();
      for (let offset = 0; offset < cpeMes || offset === 0; offset += 200) {
        let queryMonto = client.from('cpe').select('id,total_venta,tipo_documento,estado', { count: 'exact' })
          .gte('created_at', inicioMes).order('id', { ascending: true }).range(offset, offset + 199);
        if (tenantId) queryMonto = queryMonto.eq('tenant_id', tenantId);
        const { data: montoData, error: errorMonto, count: montoCount } = await queryMonto;
        if (errorMonto || !Array.isArray(montoData) || montoCount !== cpeMes || montoData.length !== Math.min(200, cpeMes - offset)) throw errorMonto || new Error('Montos mensuales incompletos');
        for (const cpe of montoData) {
          if (!cpe.id || idsMonto.has(cpe.id) || cpe.total_venta == null) throw new Error('Monto mensual incompleto');
          const amount = new Decimal(cpe.total_venta);
          if (!amount.isFinite() || amount.isNegative()) throw new Error('Monto mensual inválido');
          idsMonto.add(cpe.id);
          // Un rechazado o anulado no factura; una nota de crédito reduce lo
          // facturado (antes se sumaba como si fuera una venta más).
          const estado = String(cpe.estado || '').toUpperCase();
          if (estado === 'RECHAZADO' || estado === 'ANULADO') continue;
          const tipo = this.normalizeTipoDocumentoSunat(cpe.tipo_documento, false) || String(cpe.tipo_documento || '');
          montoFacturado = ['07', '91'].includes(tipo) ? montoFacturado.minus(amount) : montoFacturado.plus(amount);
        }
      }

      // CPE rechazados
      let queryRechazados = client
        .from('cpe')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'RECHAZADO');

      if (tenantId) {
        queryRechazados = queryRechazados.eq('tenant_id', tenantId);
      }

      const { count: rechazados, error: errorRechazados } = await queryRechazados;
      if (errorRechazados || !Number.isSafeInteger(rechazados) || rechazados < 0) throw errorRechazados || new Error('Conteo de rechazos incompleto');

      const stats = {
        cpeEmitidosHoy: cpeHoy,
        cpeDelMes: cpeMes,
        montoFacturado: montoFacturado.toDecimalPlaces(2).toNumber(),
        rechazados
      };
      if (!Number.isFinite(stats.montoFacturado)) throw new Error('El monto mensual excede el rango de representación');

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
