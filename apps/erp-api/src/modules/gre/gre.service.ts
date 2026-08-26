import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import {
  CreateGuiaRemisionDto,
  GreAutoConfigDto,
  GreListQueryDto,
  GuiaRemisionResponseDto,
} from './gre.types';
import { EventBusService } from '../../shared/events/event-bus.service';
import { OseService } from '../ose/ose.service';
import { ValidationService } from '../validations/validation.service';

import { fechaHoyDelTenant, paisDelTenant } from '../../shared/utils/fecha-tenant.util';
import { fechaHoyEnPais } from '../../shared/utils/fecha-peru.util';
import { assertExternalFiscalTransportAllowed } from '../../shared/utils/fiscal-transport-guard';
@Injectable()
export class GreService {
  private readonly logger = new Logger(GreService.name);
  private readonly sunatStatuses = {
    NOT_SENT: 'NOT_SENT',
    READY: 'READY',
    SENDING: 'SENDING',
    ACCEPTED: 'ACCEPTED',
    REJECTED: 'REJECTED',
    ERROR: 'ERROR',
  } as const;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly eventBus: EventBusService,
    private readonly oseService: OseService,
    private readonly validationService: ValidationService,
  ) {
    console.log('🚚 [GRE] ¡Servicio GRE inicializado con integración SUNAT!');
    this.initializeEventListeners();
    console.log('🚚 [GRE] ¡Constructor completado!');
  }

  private initializeEventListeners() {
    console.log('🚚 [GRE] Inicializando listeners de eventos...');

    // Listener for sale.completed event - main trigger for auto GRE
    this.eventBus.on('sale.completed', async (event) => {
      // Don't block sale completion - run async
      setImmediate(async () => {
        try {
          console.log('🚚 [GRE] Sale completed event received:', event.data?.saleId);

          const saleData = event.data;
          if (!saleData || !saleData.tenantId || !saleData.saleId) {
            console.warn('⚠️ [GRE] Invalid sale data in event, skipping auto GRE');
            return;
          }

          // Evaluate if auto GRE should be created
          const shouldCreate = await this.evaluateAutoGRECreation({
            tenantId: saleData.tenantId,
            saleId: saleData.saleId,
            total: saleData.total || 0,
            cpeId: saleData.cpeId,
          });

          if (shouldCreate) {
            console.log(`🚚 [GRE] Creating automatic GRE for sale ${saleData.saleId}`);

            const gre = await this.createAutoGREFromSale(saleData.saleId, {
              tenantId: saleData.tenantId,
              cpeId: saleData.cpeId,
              clienteId: saleData.clienteId,
              clienteNombre: saleData.clienteNombre,
              clienteDireccion: saleData.clienteDireccion,
              total: saleData.total,
              productos: saleData.productos,
            });

            console.log(`✅ [GRE] Automatic GRE created: ${gre.numero} for sale ${saleData.saleId}`);

            // Emit event for GRE creation
            this.eventBus.emit('gre.auto_created', {
              greId: gre.id,
              greNumero: gre.numero,
              saleId: saleData.saleId,
              tenantId: saleData.tenantId,
              timestamp: new Date().toISOString(),
            });
          } else {
            console.log(`🚚 [GRE] Sale ${saleData.saleId} does not meet auto GRE criteria`);
          }
        } catch (error) {
          console.error('❌ [GRE] Error in sale.completed listener:', error);

          // Emit error event for notification
          this.eventBus.emit('gre.creation_failed', {
            saleId: event.data?.saleId,
            tenantId: event.data?.tenantId,
            error: error.message,
            timestamp: new Date().toISOString(),
          });
        }
      });
    });

    // Legacy listener for backward compatibility
    this.eventBus.on('cpe.requiere_transporte', async (event) => {
      setImmediate(async () => {
        try {
          console.log('🚚 [GRE] CPE requires transport event received (legacy)');
          await this.evaluarCreacionAutomaticaGRE(event.data);
        } catch (error) {
          console.error('❌ [GRE] Error processing transport event:', error);
        }
      });
    });

    // Legacy listener for comprobante.creado
    this.eventBus.on('comprobante.creado', async (event) => {
      setImmediate(async () => {
        try {
          console.log('🚚 [GRE] Comprobante created event received (legacy)');

          if (event.data?.requiereTransporte) {
            await this.evaluarCreacionAutomaticaGRE({
              cpeId: event.data.cpeId,
              clienteId: event.data.clienteId,
              total: event.data.total,
              productos: []
            });
          }
        } catch (error) {
          console.error('❌ [GRE] Error processing comprobante.creado:', error);
        }
      });
    });

    console.log('✅ [GRE] Event listeners configured successfully');
    console.log('🚚 [GRE] Active listeners:', this.eventBus['eventEmitter'].eventNames());
  }

  async evaluarCreacionAutomaticaGRE(datos: any): Promise<void> {
    try {
      console.log(`🚚 [GRE] Evaluando creación automática para CPE:`, datos);

      const cpeId = datos.cpeId;
      const clienteId = datos.clienteId;
      const total = datos.total;
      let tenantId = datos.tenantId || datos.tenant_id; // Obtener tenantId de los datos

      if (!tenantId) {
        this.logger.warn('⚠️ [GRE] No se proporcionó tenantId en evaluarCreacionAutomaticaGRE, intentando obtenerlo del CPE...');
        // Intentar obtener tenantId del CPE si está disponible
        if (cpeId) {
          const { data: cpeData } = await this.supabaseService.getClient()
            .from('comprobantes_electronicos')
            .select('tenant_id')
            .eq('id', cpeId)
            .maybeSingle();

          if (cpeData?.tenant_id) {
            tenantId = cpeData.tenant_id;
            this.logger.log(`✅ [GRE] TenantId obtenido del CPE: ${tenantId}`);
          }
        }

        if (!tenantId) {
          this.logger.error('❌ [GRE] No se pudo obtener tenantId para crear GRE automática');
          throw new Error('No se pudo determinar el tenantId para crear la GRE');
        }
      }

      console.log(`🚚 [GRE] Datos del evento - CPE: ${cpeId}, Cliente: ${clienteId}, Total: S/ ${total}, Tenant: ${tenantId}`);

      // Buscar si el cliente tiene configuración de transporte automático
      const requiereGREAutomatica = await this.verificarConfiguracionClienteTransporte(clienteId, total, tenantId);

      if (requiereGREAutomatica) {
        console.log('🚚 [GRE] ✅ Cliente configurado para GRE automática, creando...');

        // Este camino nacía sin validar y componía el destinatario con el UUID del
        // cliente, además de inventar peso y fecha. Todo eso va en un documento que
        // recibe SUNAT, así que ahora pasa por la misma comprobación que el camino
        // nuevo y se niega a completar lo que no sabe.
        this.assertAutoGreSaleDataValida({
          clienteNombre: datos.clienteNombre,
          clienteDireccion: datos.clienteDireccion,
          pesoTotal: datos.pesoTotal,
          fechaTraslado: datos.fechaTraslado,
          modalidad: 'TRANSPORTE_PUBLICO',
          transportista: datos.transportista,
          transportistaDocumento: datos.transportistaDocumento,
        });

        const greAutomatica = await this.createGuia({
          destinatario: datos.clienteNombre,
          direccionDestino: datos.clienteDireccion,
          fechaTraslado: datos.fechaTraslado,
          modalidad: 'TRANSPORTE_PUBLICO',
          motivo: 'VENTA',
          pesoTotal: Number(datos.pesoTotal),
          observaciones: `GRE automática generada para CPE ${cpeId} - Total: S/ ${total}`,
          transportista: datos.transportista || undefined,
          placaVehiculo: datos.placaVehiculo || undefined,
          licenciaConducir: datos.licenciaConducir || undefined,
          cpeRelacionado: cpeId
        }, tenantId);

        console.log(`✅ [GRE] GRE automática creada exitosamente:`, {
          id: greAutomatica.id,
          numero: greAutomatica.numero,
          destinatario: greAutomatica.destinatario,
          pesoTotal: greAutomatica.pesoTotal
        });
      } else {
        console.log('🚚 [GRE] ⚠️ Cliente no requiere GRE automática, creación manual requerida');
      }
    } catch (error) {
      console.error('❌ [GRE] Error evaluando creación automática:', error);
      throw error;
    }
  }

  private async verificarConfiguracionClienteTransporte(clienteId: string, total: number, tenantId: string): Promise<boolean> {
    console.log(`🚚 [GRE] Verificando configuración GRE para cliente ${clienteId} con total S/ ${total}`);

    // Configuración por tenant: umbral y bandera
    const { umbralGREAutomatico, greAutomaticoHabilitado, greObligatorio } = await this.getGREThresholdConfig(tenantId);

    // Si no está habilitado y no es obligatorio, no crear.
    if (!greAutomaticoHabilitado && !greObligatorio) {
      console.log('⚠️ [GRE] GRE automática deshabilitada por configuración del tenant');
      return false;
    }

    // Si es obligatorio, siempre crea (validado en data).
    if (greObligatorio) {
      console.log('✅ [GRE] GRE obligatoria por configuración del tenant');
      return true;
    }

    // Caso automático: solo si supera umbral.
    const habilitar = total >= umbralGREAutomatico;
    console.log(`🔎 [GRE] Umbral ${umbralGREAutomatico}, total ${total}, crear=${habilitar}`);
    return habilitar;
  }

  async findAllGuias(
    tenantId: string,
    filters: GreListQueryDto = {},
  ): Promise<GuiaRemisionResponseDto[]> {
    const supabase = this.supabaseService.getClient();
    let query = supabase
      .from('gre_guias')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(filters.limit ?? 100);

    if (filters.estado) query = query.eq('estado', filters.estado);
    if (filters.modalidad) query = query.eq('modalidad', filters.modalidad);
    if (filters.desde) query = query.gte('fecha_traslado', filters.desde);
    if (filters.hasta) query = query.lte('fecha_traslado', filters.hasta);
    if (filters.buscar?.trim()) {
      const term = filters.buscar.trim().replace(/[%_,()]/g, '');
      if (term) {
        query = query.or(`numero.ilike.%${term}%,destinatario.ilike.%${term}%`);
      }
    }

    const { data, error } = await query;
    if (error) {
      throw new BadRequestException(`Error al consultar las GRE: ${error.message}`);
    }
    return (data || []).map((gre: any) => this.mapGreRecordToResponse(gre));
  }

  async findGuiaById(id: string, tenantId: string): Promise<GuiaRemisionResponseDto> {
    const supabase = this.supabaseService.getClient();

    const [{ data, error }, { data: details, error: detailsError }] = await Promise.all([
      supabase
        .from('gre_guias')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      supabase
        .from('gre_detalles')
        .select('producto_id,descripcion,cantidad,unidad_medida,peso')
        .eq('gre_id', id)
        .eq('tenant_id', tenantId)
        .eq('estado', 'ACTIVO')
        .order('created_at', { ascending: true }),
    ]);
    if (error) throw new BadRequestException(`Error al consultar la GRE: ${error.message}`);
    if (!data) throw new NotFoundException('Guía de remisión no encontrada');
    if (detailsError) throw new BadRequestException(`Error al consultar líneas GRE: ${detailsError.message}`);

    const response = this.mapGreRecordToResponse(data);
    response.items = (details || []).map((item: any) => ({
      productoId: item.producto_id || undefined,
      descripcion: item.descripcion,
      cantidad: Number(item.cantidad),
      unidadMedida: item.unidad_medida,
      peso: item.peso == null ? undefined : Number(item.peso),
    }));
    return response;
  }

  /**
   * Genera CSV GRE (SUNAT) con columnas estándar.
   */
  async generarCsvGre(tenantId: string, anio?: number, mes?: number): Promise<string> {
    const supabase = this.supabaseService.getClient();

    let query = supabase
      .from('gre_guias')
      .select('serie,numero,fecha_emision,fecha_traslado,destinatario,direccion_destino,modalidad,motivo,peso_total,estado,sunat_status,numero_sunat,anio,mes')
      .eq('tenant_id', tenantId);

    if (anio) query = query.eq('anio', anio);
    if (mes) query = query.eq('mes', mes);

    const { data, error } = await query;

    if (error) {
      this.logger.error('❌ Error consultando GREs para CSV:', error);
      throw new Error(`Error generando CSV GRE: ${error.message}`);
    }

    const headers = ['serie','numero','fecha_emision','fecha_traslado','destinatario',
      'direccion_destino','modalidad','motivo','peso_total','estado','sunat_status','numero_sunat'];

    const rows = (data || []).map((g: any) => [
      g.serie || '',
      g.numero || '',
      (g.fecha_emision || '').split('T')[0],
      (g.fecha_traslado || '').split('T')[0],
      g.destinatario || '',
      g.direccion_destino || '',
      g.modalidad || '',
      g.motivo || '',
      this.formatNumber(g.peso_total),
      g.estado || '',
      g.sunat_status || '',
      g.numero_sunat || '',
    ]);
    const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    return [headers, ...rows].map(row => row.map(escapeCsv).join(',')).join('\n');
  }

  private formatNumber(value: any): string {
    const num = Number(value || 0);
    return Number.isFinite(num) ? num.toFixed(2) : '0.00';
  }

  async createGuia(
    greData: CreateGuiaRemisionDto,
    tenantId: string,
    actorId?: string,
    headerIdempotencyKey?: string,
  ): Promise<GuiaRemisionResponseDto> {
    this.assertCreateGreDataValida(greData);
    const effectiveActor = actorId || await this.resolveGreActorId(greData, tenantId);
    const idempotencyKey = String(
      headerIdempotencyKey || greData.idempotencyKey || this.resolveGreIdempotencyKey(greData, tenantId),
    ).trim();
    if (!idempotencyKey || idempotencyKey.length > 200) {
      throw new BadRequestException('Idempotency-Key GRE requerido y de hasta 200 caracteres');
    }
    const eventId = randomUUID();
    const items = await this.resolveGreItems(greData, tenantId);
    const payload = {
      destinatario: greData.destinatario.trim(),
      direccion_destino: greData.direccionDestino.trim(),
      fecha_traslado: greData.fechaTraslado,
      modalidad: greData.modalidad,
      motivo: greData.motivo,
      peso_total: Number(greData.pesoTotal),
      observaciones: greData.observaciones?.trim() || null,
      transportista: greData.transportista?.trim() || null,
      placa_vehiculo: greData.placaVehiculo?.trim() || null,
      licencia_conducir: greData.licenciaConducir?.trim() || null,
      cpe_relacionado: greData.cpeRelacionado || null,
      pedido_id: greData.pedidoId || null,
      despacho_evento_id: greData.despachosAsociados?.[0] || null,
      es_automatica: greData.datosAdicionales?.origen === 'VENTA_AUTOMATICA',
      venta_id: typeof greData.datosAdicionales?.ventaId === 'string'
        ? greData.datosAdicionales.ventaId
        : null,
      motivo_creacion: greData.datosAdicionales?.origen === 'VENTA_AUTOMATICA'
        ? 'AUTO_THRESHOLD'
        : 'MANUAL',
      event_id: eventId,
      datos_adicionales: this.buildGreAdditionalData(greData) || {},
    };

    const { data, error } = await this.supabaseService.getClient().rpc('crear_gre_tx', {
      p_tenant_id: tenantId,
      p_actor_id: effectiveActor,
      p_payload: payload,
      p_items: items.map(item => ({
        producto_id: item.productoId || null,
        descripcion: item.descripcion.trim(),
        cantidad: Number(item.cantidad),
        unidad_medida: item.unidadMedida || 'NIU',
        peso: item.peso == null ? null : Number(item.peso),
      })),
      p_idempotency_key: idempotencyKey,
    });
    if (error || !data) {
      throw this.toGreException(error, 'No se pudo crear la GRE');
    }

    let record: any = data;
    if (!(data as any).idempotent && (data as any).estado === 'BORRADOR') {
      try {
        const signed = await this.firmarGuia(
          (data as any).id,
          tenantId,
          effectiveActor,
          `${idempotencyKey}:sign`,
        );
        const { data: signedRecord } = await this.supabaseService.getClient()
          .from('gre_guias')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('id', signed.id)
          .maybeSingle();
        record = signedRecord || data;
      } catch (signError) {
        this.logger.warn(
          `GRE ${(data as any).numero} creada en BORRADOR; firma pendiente: ${this.errorMessage(signError)}`,
        );
        const { data: pendingRecord } = await this.supabaseService.getClient()
          .from('gre_guias')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('id', (data as any).id)
          .maybeSingle();
        record = pendingRecord || data;
      }

      await this.eventBus.emitGuiaRemisionCreada({
        eventId: (data as any).event_id || eventId,
        tenantId,
        idempotencyKey,
        greId: (data as any).id,
        tipoDocumento: '09',
        serie: (data as any).serie,
        numero: Number((data as any).correlativo),
        numeroCompleto: (data as any).numero,
        transportistaId: (data as any).transportista || undefined,
        vehiculoId: (data as any).placa_vehiculo || undefined,
        ruta: (data as any).direccion_destino,
        peso: Number((data as any).peso_total),
        cpeRelacionado: (data as any).cpe_relacionado || undefined,
        ventaRelacionada: (data as any).venta_id || undefined,
        fechaTraslado: (data as any).fecha_traslado,
        destinatario: (data as any).destinatario,
        direccionDestino: (data as any).direccion_destino,
        sunatStatus: record.sunat_status || this.sunatStatuses.NOT_SENT,
        hashGre: record.hash_gre || undefined,
        notasSalida: greData.despachosAsociados || [],
      });
    }
    return this.mapGreRecordToResponse(record);
  }

  async firmarGuia(
    greId: string,
    tenantId: string,
    actorId: string,
    idempotencyKey: string,
  ): Promise<GuiaRemisionResponseDto> {
    try {
      const { data: greData, error } = await this.supabaseService.getClient()
        .from('gre_guias')
        .select('*')
        .eq('id', greId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) throw new BadRequestException(`No se pudo obtener la GRE: ${error.message}`);
      if (!greData) throw new NotFoundException('Guía de remisión no encontrada');

      const certificateValidation = await this.validationService.validateCertificate(tenantId);
      if (!certificateValidation.isValid) {
        throw new BadRequestException({
          code: 'GRE_SIGNATURE_CREDENTIALS_PENDING',
          message: 'La GRE quedó en borrador: configure un certificado digital válido del cliente',
          errors: certificateValidation.errors,
        });
      }
      const xmlPayload = await this.buildGreXmlPayload(greData);
      const xmlContent = this.generateGreXmlUbl(xmlPayload);
      const xmlSigned = await this.firmarXmlGre(xmlContent, tenantId);
      const hash = this.generarHashXml(xmlSigned);
      const { data, error: signatureError } = await this.supabaseService.getClient().rpc(
        'guardar_firma_gre_tx',
        {
          p_tenant_id: tenantId,
          p_actor_id: actorId,
          p_gre_id: greId,
          p_xml_ubl: xmlContent,
          p_xml_firmado: xmlSigned,
          p_hash: hash,
          p_idempotency_key: idempotencyKey,
        },
      );
      if (signatureError || !data) {
        throw this.toGreException(signatureError, 'No se pudo persistir la firma GRE');
      }
      return this.mapGreRecordToResponse(data);
    } catch (error) {
      const details = this.extractGreError(error);
      const { error: persistError } = await this.supabaseService.getClient().rpc(
        'registrar_fallo_firma_gre_tx',
        {
          p_tenant_id: tenantId,
          p_actor_id: actorId,
          p_gre_id: greId,
          p_error_code: details.code,
          p_error_message: details.message,
          p_idempotency_key: `${idempotencyKey}:failure`,
        },
      );
      if (persistError) {
        this.logger.error(`No se pudo persistir el fallo de firma GRE ${greId}: ${persistError.message}`);
      }
      throw error;
    }
  }

  private async resolveGreActorId(
    dto: CreateGuiaRemisionDto,
    tenantId: string,
  ): Promise<string> {
    const client = this.supabaseService.getClient();
    if (dto.cpeRelacionado) {
      const { data } = await client
        .from('cpe')
        .select('created_by')
        .eq('tenant_id', tenantId)
        .eq('id', dto.cpeRelacionado)
        .maybeSingle();
      if (data?.created_by) return data.created_by;
    }
    if (dto.pedidoId) {
      const { data } = await client
        .from('pedidos_venta')
        .select('created_by,confirmado_por,aprobado_por')
        .eq('tenant_id', tenantId)
        .eq('id', dto.pedidoId)
        .maybeSingle();
      const actor = data?.created_by || data?.confirmado_por || data?.aprobado_por;
      if (actor) return actor;
    }
    throw new BadRequestException(
      'La creación automática de GRE requiere un actor trazable en el CPE o pedido origen',
    );
  }

  private async resolveGreItems(dto: CreateGuiaRemisionDto, tenantId: string) {
    if (dto.items?.length) return dto.items;
    if (dto.pedidoId) return [];
    if (dto.cpeRelacionado) {
      const { data, error } = await this.supabaseService.getClient()
        .from('cpe')
        .select('items')
        .eq('tenant_id', tenantId)
        .eq('id', dto.cpeRelacionado)
        .maybeSingle();
      if (error) throw new BadRequestException(`No se pudieron leer los ítems del CPE: ${error.message}`);
      const items = Array.isArray(data?.items) ? data.items : [];
      const mapped = items.map((item: any) => ({
        productoId: item.producto_id || item.productoId || item.id || undefined,
        descripcion: String(item.descripcion || item.nombre || item.producto_nombre || '').trim(),
        cantidad: Number(item.cantidad || item.quantity || 0),
        unidadMedida: String(item.unidad_medida || item.unidad || 'NIU').toUpperCase(),
        peso: item.peso == null ? undefined : Number(item.peso),
      })).filter((item: any) => item.descripcion && item.cantidad > 0);
      if (mapped.length) return mapped;
    }
    throw new BadRequestException(
      'La GRE manual requiere al menos un ítem; un pedido válido puede aportar sus propias líneas',
    );
  }

  private toGreException(error: any, fallback: string): BadRequestException | NotFoundException {
    const message = String(error?.message || fallback);
    if (message.includes('GRE_NOT_FOUND')) return new NotFoundException('Guía de remisión no encontrada');
    const labels: Record<string, string> = {
      GRE_IDEMPOTENCY_COLLISION: 'La Idempotency-Key ya fue usada con otros datos GRE',
      GRE_ONLY_PERU: 'GRE sólo está disponible para empresas configuradas en Perú',
      GRE_ITEMS_REQUIRED: 'La GRE requiere al menos un ítem válido',
      GRE_ITEM_PRODUCT_TENANT_INVALID: 'Un producto de la GRE pertenece a otro tenant o no existe',
      FISCAL_ACTOR_INVALID: 'El actor no pertenece al tenant o está inactivo',
      GRE_NOT_READY_TO_SEND: 'La GRE debe estar firmada antes de enviarse',
      GRE_CANCEL_REQUIRES_FISCAL_FLOW: 'Una GRE ya transmitida requiere el flujo fiscal de baja, no anulación interna',
    };
    const code = Object.keys(labels).find(key => message.includes(key));
    return new BadRequestException({ code: code || 'GRE_OPERATION_FAILED', message: code ? labels[code] : message });
  }

  private extractGreError(error: any): { code: string; message: string } {
    const response = typeof error?.getResponse === 'function' ? error.getResponse() : null;
    const responseObject = response && typeof response === 'object' ? response as any : null;
    return {
      code: String(responseObject?.code || error?.code || 'GRE_SIGNATURE_ERROR').slice(0, 100),
      message: String(responseObject?.message || error?.message || 'No se pudo firmar la GRE').slice(0, 1000),
    };
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error || 'error desconocido');
  }

  private async buildGreXmlPayload(greData: any) {
    const tenantId = greData.tenant_id;
    const client = this.supabaseService.getClient();

    // Emisor desde empresa_config (requerido)
    const { data: empresa } = await client
      .from('empresa_config')
      .select('ruc, razon_social, nombre_comercial, direccion_fiscal, ubigeo, departamento, provincia, distrito')
      .eq('tenant_id', tenantId)
      .single();

    if (!empresa?.ruc || !empresa?.razon_social) {
      throw new BadRequestException('No se puede generar GRE: faltan datos de emisor (RUC/razón social) en empresa_config');
    }

    // Receptor: usar CPE relacionado si existe
    let receptor = {
      docTipo: (greData.datos_adicionales?.destinatarioDocumentoTipo || greData.datos_adicionales?.documentoTipoDestinatario || null) as string | null,
      docNumero: (greData.datos_adicionales?.destinatarioDocumento || greData.datos_adicionales?.documentoDestinatario || null) as string | null,
      razonSocial: greData.destinatario as string | null,
      direccion: greData.direccion_destino as string | null,
    };

    if (greData.cpe_relacionado) {
      const { data: cpe } = await client
        .from('cpe')
        .select('tipo_documento_receptor, documento_receptor, razon_social_receptor, direccion_receptor')
        .eq('id', greData.cpe_relacionado)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (cpe) {
        receptor = {
          docTipo: cpe.tipo_documento_receptor || receptor.docTipo,
          docNumero: cpe.documento_receptor || receptor.docNumero,
          razonSocial: cpe.razon_social_receptor || receptor.razonSocial,
          direccion: cpe.direccion_receptor || receptor.direccion,
        };
      }
    }

    if (!receptor.docNumero || !receptor.razonSocial || !receptor.direccion) {
      throw new BadRequestException('No se puede generar GRE: faltan datos del destinatario (documento, razón social o dirección)');
    }

    // Detalle: usar gre_detalles; si no hay, bloquear
    const { data: detalles } = await client
      .from('gre_detalles')
      .select('descripcion, cantidad, unidad_medida, peso')
      .eq('gre_id', greData.id)
      .eq('tenant_id', tenantId);

    if (!detalles || detalles.length === 0) {
      throw new BadRequestException('No se puede generar GRE: requiere al menos un ítem en gre_detalles');
    }

    return {
      emisor: {
        ruc: empresa.ruc,
        razonSocial: empresa.razon_social,
        nombreComercial: empresa.nombre_comercial || empresa.razon_social,
        direccion: empresa.direccion_fiscal,
        ubigeo: empresa.ubigeo || '',
        departamento: empresa.departamento || '',
        provincia: empresa.provincia || '',
        distrito: empresa.distrito || '',
      },
      receptor,
      gre: greData,
      detalles: detalles.map((d: any, idx: number) => ({
        id: idx + 1,
        descripcion: d.descripcion,
        cantidad: Number(d.cantidad || 0),
        unidad: d.unidad_medida || 'NIU',
        peso: d.peso ? Number(d.peso) : undefined,
      })),
    };
  }

  private assertCreateGreDataValida(dto: CreateGuiaRemisionDto): void {
    const requiredText: Array<[keyof CreateGuiaRemisionDto, string]> = [
      ['destinatario', 'destinatario'],
      ['direccionDestino', 'dirección de destino'],
      ['fechaTraslado', 'fecha de traslado'],
      ['modalidad', 'modalidad de transporte'],
      ['motivo', 'motivo de traslado'],
    ];

    for (const [field, label] of requiredText) {
      const value = dto[field];
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new BadRequestException(`No se puede generar GRE: falta ${label}`);
      }
    }

    if (!['TRANSPORTE_PUBLICO', 'TRANSPORTE_PRIVADO'].includes(dto.modalidad)) {
      throw new BadRequestException('No se puede generar GRE: modalidad de transporte inválida');
    }

    const fechaTraslado = new Date(dto.fechaTraslado);
    if (Number.isNaN(fechaTraslado.getTime())) {
      throw new BadRequestException('No se puede generar GRE: fecha de traslado inválida');
    }

    const pesoTotal = Number(dto.pesoTotal);
    if (!Number.isFinite(pesoTotal) || pesoTotal <= 0) {
      throw new BadRequestException('No se puede generar GRE: peso total debe ser mayor a cero');
    }

    // El alta interna no depende de habilitación legal ni de certificado. Los
    // datos UBL específicos se verifican al firmar; si faltan, la guía conserva
    // BORRADOR y el usuario puede completarlos/reintentar sin duplicarla.
  }

  /**
   * Generar XML UBL para Guía de Remisión Electrónica
   */
  private generateGreXmlUbl(payload: {
    emisor: {
      ruc: string;
      razonSocial: string;
      nombreComercial: string;
      direccion: string;
      ubigeo: string;
      departamento: string;
      provincia: string;
      distrito: string;
    };
    receptor: {
      docTipo: string | null;
      docNumero: string | null;
      razonSocial: string | null;
      direccion: string | null;
    };
    gre: any;
    detalles: Array<{ id: number; descripcion: string; cantidad: number; unidad: string; peso?: number }>;
  }): string {
    const greData = payload.gre;
    const now = new Date();
    const fechaEmision = this.formatGreDate(now);
    const horaEmision = this.formatGreTime(now);
    const trasladoFecha = this.formatGreDate(greData.fecha_traslado);
    const motivoCode = this.getMotivoCode(greData.motivo);
    const modalidadCode = this.getModalidadCode(greData.modalidad);
    const isPublicTransport = modalidadCode === '01';
    const isPrivateTransport = modalidadCode === '02';
    // `escapeXmlText` no escapa la comilla doble, asi que este valor no vale para un
    // atributo: un `"` se saldria de `schemeID="..."`. Se conserva para el texto y el
    // atributo usa `escapeXmlAttribute`, como ya hacen el conductor y la unidad.
    const receptorDocTipo = this.escapeXmlText(payload.receptor.docTipo || '1');
    const receptorDocNumero = this.escapeXmlText(payload.receptor.docNumero || '00000000');
    const receptorNombre = payload.receptor.razonSocial || 'DESTINATARIO';
    const receptorDireccion = payload.receptor.direccion || '';
    const emisorUbigeo = this.resolveGreUbigeo(payload.emisor.ubigeo);
    const destinoUbigeo = this.resolveGreUbigeo(
      greData.datos_adicionales?.destinoUbigeo ||
      greData.datos_adicionales?.ubigeoDestino ||
      greData.ubigeo_destino,
    );
    const transportistaDocumento = this.normalizeDigits(
      greData.transportista_documento ||
      greData.datos_adicionales?.transportistaDocumento ||
      greData.datos_adicionales?.transportistaRuc,
    );
    const transportistaNombre = greData.transportista || payload.emisor.razonSocial;
    if (isPublicTransport && !/^\d{11}$/.test(transportistaDocumento)) {
      throw new BadRequestException('No se puede generar GRE: transporte público requiere RUC válido del transportista en XML SUNAT');
    }

    const placaVehiculo = this.normalizeGrePlate(
      greData.placa_vehiculo ||
      greData.datos_adicionales?.placaVehiculo ||
      greData.datos_adicionales?.placa,
    );
    if (isPrivateTransport && !this.isValidGrePlate(placaVehiculo)) {
      throw new BadRequestException('No se puede generar GRE: placa del vehículo inválida para SUNAT');
    }

    const driver = isPrivateTransport ? this.resolveGreDriverData(greData) : null;
    const noteXml = this.buildGreNoteXml(greData.observaciones);
    const carrierXml = isPublicTransport ? `
      <cac:CarrierParty>
        <cac:PartyIdentification>
          <cbc:ID schemeID="6" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${this.escapeXmlText(transportistaDocumento)}</cbc:ID>
        </cac:PartyIdentification>
        <cac:PartyLegalEntity>
          <cbc:RegistrationName>${this.wrapCdata(transportistaNombre)}</cbc:RegistrationName>
        </cac:PartyLegalEntity>
      </cac:CarrierParty>` : '';
    const driverXml = driver ? `
      <cac:DriverPerson>
        <cbc:ID schemeID="${this.escapeXmlAttribute(driver.documentoTipo)}" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${this.escapeXmlText(driver.documentoNumero)}</cbc:ID>
        <cbc:FirstName>${this.wrapCdata(driver.nombres)}</cbc:FirstName>
        <cbc:FamilyName>${this.wrapCdata(driver.apellidos)}</cbc:FamilyName>
        <cbc:JobTitle>Principal</cbc:JobTitle>
        <cac:IdentityDocumentReference>
          <cbc:ID>${this.escapeXmlText(driver.licencia)}</cbc:ID>
        </cac:IdentityDocumentReference>
      </cac:DriverPerson>` : '';
    const transportHandlingUnitXml = placaVehiculo ? `
    <cac:TransportHandlingUnit>
      <cac:TransportEquipment>
        <cbc:ID>${this.escapeXmlText(placaVehiculo)}</cbc:ID>
      </cac:TransportEquipment>
    </cac:TransportHandlingUnit>` : '';

    const lines = payload.detalles
      .map(
        (item) => `
  <cac:DespatchLine>
    <cbc:ID>${item.id}</cbc:ID>
    <cbc:DeliveredQuantity unitCode="${this.escapeXmlAttribute(item.unidad || 'NIU')}" unitCodeListID="UN/ECE rec 20" unitCodeListAgencyName="United Nations Economic Commission for Europe">${this.formatGreNumber(item.cantidad)}</cbc:DeliveredQuantity>
    <cac:OrderLineReference>
      <cbc:LineID>${item.id}</cbc:LineID>
    </cac:OrderLineReference>
    <cac:Item>
      <cbc:Description>${this.wrapCdata(item.descripcion)}</cbc:Description>
    </cac:Item>
  </cac:DespatchLine>`
      )
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<DespatchAdvice xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"
                xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
                xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
                xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent></ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>${this.escapeXmlText(greData.numero)}</cbc:ID>
  <cbc:IssueDate>${fechaEmision}</cbc:IssueDate>
  <cbc:IssueTime>${horaEmision}</cbc:IssueTime>
  <cbc:DespatchAdviceTypeCode listAgencyName="PE:SUNAT" listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01">09</cbc:DespatchAdviceTypeCode>${noteXml}
  <cac:Signature>
    <cbc:ID>IDSignSP</cbc:ID>
    <cac:SignatoryParty>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${this.escapeXmlText(payload.emisor.ruc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${this.wrapCdata(payload.emisor.razonSocial)}</cbc:Name>
      </cac:PartyName>
    </cac:SignatoryParty>
    <cac:DigitalSignatureAttachment>
      <cac:ExternalReference>
        <cbc:URI>#SignatureSP</cbc:URI>
      </cac:ExternalReference>
    </cac:DigitalSignatureAttachment>
  </cac:Signature>
  <cac:DespatchSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${this.escapeXmlText(payload.emisor.ruc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${this.wrapCdata(payload.emisor.nombreComercial || payload.emisor.razonSocial)}</cbc:Name>
      </cac:PartyName>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${this.wrapCdata(payload.emisor.razonSocial)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:DespatchSupplierParty>
  <cac:DeliveryCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${this.escapeXmlAttribute(payload.receptor.docTipo || '1')}" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${receptorDocNumero}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${this.wrapCdata(receptorNombre)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:DeliveryCustomerParty>
  <cac:Shipment>
    <cbc:ID>SUNAT_Envio</cbc:ID>
    <cbc:HandlingCode listAgencyName="PE:SUNAT" listName="Motivo de traslado" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo20">${motivoCode}</cbc:HandlingCode>
    <cbc:GrossWeightMeasure unitCode="KGM">${this.formatGreWeight(greData.peso_total)}</cbc:GrossWeightMeasure>
    <cac:ShipmentStage>
      <cbc:TransportModeCode listAgencyName="PE:SUNAT" listName="Modalidad de traslado" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo18">${modalidadCode}</cbc:TransportModeCode>
      <cac:TransitPeriod>
        <cbc:StartDate>${trasladoFecha}</cbc:StartDate>
      </cac:TransitPeriod>${carrierXml}${driverXml}
    </cac:ShipmentStage>
${transportHandlingUnitXml}
    <cac:Delivery>
      <cac:DeliveryAddress>
        <cbc:ID schemeAgencyName="PE:INEI">${destinoUbigeo}</cbc:ID>
        <cac:AddressLine>
          <cbc:Line>${this.wrapCdata(receptorDireccion)}</cbc:Line>
        </cac:AddressLine>
        <cac:Country>
          <cbc:IdentificationCode listAgencyName="United Nations Economic Commission for Europe" listID="ISO 3166-1">PE</cbc:IdentificationCode>
        </cac:Country>
      </cac:DeliveryAddress>
      <cac:Despatch>
        <cac:DespatchAddress>
          <cbc:ID schemeAgencyName="PE:INEI">${emisorUbigeo}</cbc:ID>
          <cac:AddressLine>
            <cbc:Line>${this.wrapCdata(payload.emisor.direccion)}</cbc:Line>
          </cac:AddressLine>
          <cac:Country>
            <cbc:IdentificationCode listAgencyName="United Nations Economic Commission for Europe" listID="ISO 3166-1">PE</cbc:IdentificationCode>
          </cac:Country>
        </cac:DespatchAddress>
      </cac:Despatch>
    </cac:Delivery>
  </cac:Shipment>
${lines}
</DespatchAdvice>`;
  }

  private formatGreDate(value: any): string {
    const raw = String(value ?? '').trim();
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(raw);

    if (dateMatch) {
      const [, year, month, day] = dateMatch;
      if (!this.isValidCalendarDate(Number(year), Number(month), Number(day))) {
        throw new BadRequestException('No se puede generar GRE: fecha inválida para XML SUNAT');
      }
      return `${year}-${month}-${day}`;
    }

    const parsed = value instanceof Date ? value : new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('No se puede generar GRE: fecha de traslado inválida para XML SUNAT');
    }

    return [
      parsed.getFullYear(),
      String(parsed.getMonth() + 1).padStart(2, '0'),
      String(parsed.getDate()).padStart(2, '0'),
    ].join('-');
  }

  private formatGreTime(value: Date): string {
    return [
      String(value.getHours()).padStart(2, '0'),
      String(value.getMinutes()).padStart(2, '0'),
      String(value.getSeconds()).padStart(2, '0'),
    ].join(':');
  }

  private isValidCalendarDate(year: number, month: number, day: number): boolean {
    const candidate = new Date(Date.UTC(year, month - 1, day));
    return candidate.getUTCFullYear() === year
      && candidate.getUTCMonth() === month - 1
      && candidate.getUTCDate() === day;
  }

  private resolveGreDriverData(greData: any): {
    documentoTipo: string;
    documentoNumero: string;
    nombres: string;
    apellidos: string;
    licencia: string;
  } {
    const extras = greData.datos_adicionales || {};
    const documentoTipo = String(extras.conductorDocumentoTipo || greData.conductor_documento_tipo || '1').trim();
    const documentoNumero = this.normalizeDigits(extras.conductorDocumentoNumero || greData.conductor_documento_numero);
    const nombres = String(extras.conductorNombres || greData.conductor_nombres || '').trim();
    const apellidos = String(extras.conductorApellidos || greData.conductor_apellidos || '').trim();
    const licencia = String(greData.licencia_conducir || extras.licenciaConducir || '').trim().toUpperCase();

    if (!documentoTipo || documentoTipo === '6' || !documentoNumero || !nombres || !apellidos || !licencia) {
      throw new BadRequestException('No se puede generar GRE: faltan datos SUNAT del conductor principal');
    }

    if (licencia.length > 10) {
      throw new BadRequestException('No se puede generar GRE: licencia de conducir excede 10 caracteres');
    }

    return { documentoTipo, documentoNumero, nombres, apellidos, licencia };
  }

  private normalizeDigits(value: any): string {
    return String(value ?? '').replace(/\D/g, '');
  }

  private normalizeGrePlate(value: any): string {
    return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  private isValidGrePlate(value: string): boolean {
    return /^[A-Z0-9]{6,8}$/.test(value) && !/^0+$/.test(value);
  }

  private buildGreNoteXml(value: any): string {
    const note = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!note) {
      return '';
    }

    if (note.length > 250) {
      throw new BadRequestException('No se puede generar GRE: observaciones SUNAT no deben superar 250 caracteres');
    }

    return `\n  <cbc:Note>${this.escapeXmlText(note)}</cbc:Note>`;
  }

  private resolveGreUbigeo(value: any, required = true): string {
    const ubigeo = String(value ?? '').replace(/\D/g, '');
    if (/^\d{6}$/.test(ubigeo)) {
      return ubigeo;
    }

    if (required) {
      throw new BadRequestException('No se puede generar GRE: falta ubigeo válido para SUNAT');
    }

    return '000000';
  }

  private formatGreNumber(value: any): string {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00';
  }

  private formatGreWeight(value: any): string {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toFixed(3) : '0.000';
  }

  private escapeXmlText(value: any): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private escapeXmlAttribute(value: any): string {
    return this.escapeXmlText(value)
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private wrapCdata(value: any): string {
    return `<![CDATA[${String(value ?? '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
  }

  /**
   * Obtener código SUNAT para motivo de traslado
   */
  private getMotivoCode(motivo: string): string {
    const motivoCodes = {
      'VENTA': '01',
      'COMPRA': '02',
      'TRASLADO_ENTRE_ESTABLECIMIENTOS': '04',
      'CONSIGNACION': '04',
      'DEVOLUCION': '05',
      'TRANSFORMACION': '06',
      'DEMOSTRACION': '07',
      'OTROS': '13'
    };
    return motivoCodes[motivo] || '13';
  }

  /**
   * Obtener código SUNAT para modalidad de transporte
   */
  private getModalidadCode(modalidad: string): string {
    const modalidadCodes = {
      'TRANSPORTE_PUBLICO': '01',
      'TRANSPORTE_PRIVADO': '02'
    };
    return modalidadCodes[modalidad] || '01';
  }

  /**
   * Firmar XML usando el servicio OSE (sin enviar)
   */
  private async firmarXmlGre(xmlContent: string, tenantId: string): Promise<string> {
    try {
      console.log('🔐 [GRE] Firmando XML con certificado...');

      // Usar el XmlSigner del OSE service para firmar realmente
      const xmlSigned = await this.oseService.signXmlOnly(xmlContent, { tenantId });

      console.log('✅ [GRE] XML firmado exitosamente');
      return xmlSigned;
    } catch (error) {
      console.error('❌ Error firmando XML GRE:', error);

      throw new BadRequestException(`No se pudo firmar la GRE: ${error.message}`);
    }
  }

  /**
   * Generar hash del XML
   */
  private generarHashXml(xmlContent: string): string {
    // Generar un hash simple del XML (en producción usar crypto)
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(xmlContent).digest('hex').substring(0, 32);
  }

  /**
   * 🔴 CRÍTICO FIX: Determina si un error de SUNAT es técnico (reintentable) o de validación (no reintentable)
   */
  private isTechnicalError(codigoRespuesta: string, descripcionRespuesta: string): boolean {
    // Códigos de error técnicos de SUNAT que se pueden reintentar
    const technicalErrorCodes = ['99', '98', '97']; // Errores técnicos genéricos

    // Si el código indica error técnico
    const normalizedCode = String(codigoRespuesta || '').trim();
    if (
      technicalErrorCodes.includes(normalizedCode) ||
      /^5\d{2}$/.test(normalizedCode)
    ) {
      return true;
    }

    // Si el mensaje indica error técnico de red/conexión
    const errorMessage = descripcionRespuesta?.toLowerCase() || '';
    const technicalKeywords = [
      'timeout',
      'connection',
      'network',
      'técnico',
      'servicio no disponible',
      'temporalmente',
      'unavailable',
      'http 5',
    ];

    return technicalKeywords.some(keyword => errorMessage.includes(keyword));
  }

  /**
   * Reintentar envío de GRE (método público para SunatRetryService)
   */
  async retryProcesarEnvioSunat(
    greId: string,
    tenantId?: string,
    options?: { idempotencyKey?: string },
  ): Promise<any> {
    if (!tenantId) {
      throw new BadRequestException('Tenant requerido para reintentar la GRE');
    }
    const { data: gre, error } = await this.supabaseService.getClient()
      .from('gre_guias')
      .select('retry_count')
      .eq('id', greId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error || !gre) {
      throw new NotFoundException('Guía de remisión no encontrada');
    }
    const base = String(options?.idempotencyKey || `gre.send:${tenantId}:${greId}`)
      .trim()
      .slice(0, 160);
    const attemptKey = `${base}:attempt:${Number(gre.retry_count || 0) + 1}`;
    return this.procesarEnvioSunat(greId, tenantId, null, attemptKey, 'WORKER');
  }

  private async procesarEnvioSunat(
    greId: string,
    tenantId: string,
    actorId: string | null,
    idempotencyKey: string,
    origin: 'USUARIO' | 'WORKER' | 'SISTEMA',
  ): Promise<any> {
    await assertExternalFiscalTransportAllowed(this.supabaseService, tenantId);
    const client = this.supabaseService.getClient();
    const { data: claim, error: claimError } = await client.rpc('reservar_envio_gre_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_gre_id: greId,
      p_idempotency_key: idempotencyKey,
      p_origen: origin,
    });
    if (claimError || !claim) {
      throw this.toGreException(claimError, 'No se pudo reservar el envío GRE');
    }
    if (!(claim as any).claimed) {
      return claim;
    }

    const gre = (claim as any).gre;
    const operation = (claim as any).operation;
    if (!gre?.xml_firmado || !operation?.id || !operation?.claim_token) {
      throw new BadRequestException('La reserva GRE no devolvió XML ni claim verificable');
    }

    const { data: config, error: configError } = await client
      .from('empresa_config')
      .select('ruc')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (configError || !/^\d{11}$/.test(String(config?.ruc || ''))) {
      await this.finalizarFalloEnvioGre(
        tenantId,
        operation,
        'GRE_ISSUER_RUC_INVALID',
        'RUC emisor del tenant requerido para transmitir GRE',
      );
      throw new BadRequestException('RUC emisor del tenant requerido para transmitir GRE');
    }

    let response: Awaited<ReturnType<OseService['enviarGre']>>;
    try {
      const fileName = `${config.ruc}-09-${gre.numero}`;
      response = await this.oseService.enviarGre(gre.xml_firmado, fileName, { tenantId });
    } catch (error) {
      const message = this.errorMessage(error);
      await this.finalizarFalloEnvioGre(tenantId, operation, 'GRE_TRANSPORT_EXCEPTION', message);
      throw new BadRequestException(`Error técnico enviando GRE: ${message}`);
    }

    const technicalError = !response.success
      && this.isTechnicalError(response.codigoRespuesta, response.descripcionRespuesta);
    const { data: finalized, error: finalizeError } = await client.rpc('finalizar_envio_gre_tx', {
      p_tenant_id: tenantId,
      p_operation_id: operation.id,
      p_claim_token: operation.claim_token,
      p_success: response.success,
      p_technical_error: technicalError,
      p_codigo: response.codigoRespuesta,
      p_descripcion: response.descripcionRespuesta,
      p_ticket: response.ticket || null,
      p_numero_sunat: response.numeroComprobante || null,
      p_hash: response.hashCPE || gre.hash_gre || null,
      p_cdr: response.cdr || null,
      p_response_summary: {
        observaciones: response.observaciones || [],
        transport: response.ticket ? 'REST_TICKET' : 'DIRECT',
      },
    });
    if (finalizeError || !finalized) {
      throw this.toGreException(finalizeError, 'SUNAT respondió, pero no se pudo cerrar el envío GRE');
    }
    if (!response.success) {
      throw new BadRequestException(
        `${technicalError ? 'Error técnico' : 'SUNAT rechazó la GRE'}: ${response.codigoRespuesta}: ${response.descripcionRespuesta}`,
      );
    }
    return finalized;
  }

  private async finalizarFalloEnvioGre(
    tenantId: string,
    operation: any,
    code: string,
    message: string,
  ): Promise<void> {
    const { error } = await this.supabaseService.getClient().rpc('finalizar_envio_gre_tx', {
      p_tenant_id: tenantId,
      p_operation_id: operation.id,
      p_claim_token: operation.claim_token,
      p_success: false,
      p_technical_error: true,
      p_codigo: code,
      p_descripcion: message,
      p_ticket: null,
      p_numero_sunat: null,
      p_hash: null,
      p_cdr: null,
      p_response_summary: { exception: true },
    });
    if (error) {
      this.logger.error(`No se pudo finalizar el fallo de envío GRE ${operation.id}: ${error.message}`);
    }
  }

  /**
   * Reenviar GRE a SUNAT
   */
  async reenviarGre(
    greId: string,
    tenantId: string,
    actorId: string,
    options?: { idempotencyKey?: string },
  ): Promise<any> {
    return this.procesarEnvioSunat(
      greId,
      tenantId,
      actorId,
      this.requireGreKey(options?.idempotencyKey),
      'USUARIO',
    );
  }

  /**
   * Enviar manualmente GRE firmada a SUNAT
   */
  async enviarManualmenteSunat(
    greId: string,
    tenantId: string,
    actorId: string | null,
    options?: { idempotencyKey?: string },
  ): Promise<any> {
    return this.procesarEnvioSunat(
      greId,
      tenantId,
      actorId,
      this.requireGreKey(options?.idempotencyKey),
      actorId ? 'USUARIO' : 'WORKER',
    );
  }

  async consultarEstadoGre(
    greId: string,
    tenantId: string,
    actorId: string | null,
    idempotencyKey: string,
    origin: 'USUARIO' | 'WORKER' | 'SISTEMA' = actorId ? 'USUARIO' : 'WORKER',
  ): Promise<any> {
    await assertExternalFiscalTransportAllowed(this.supabaseService, tenantId);
    const client = this.supabaseService.getClient();
    const { data: claim, error: claimError } = await client.rpc('reservar_consulta_gre_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_gre_id: greId,
      p_idempotency_key: this.requireGreKey(idempotencyKey),
      p_origen: origin,
    });
    if (claimError || !claim) {
      throw this.toGreException(claimError, 'No se pudo reservar la consulta GRE');
    }
    if (!(claim as any).claimed) return claim;

    const gre = (claim as any).gre;
    const operation = (claim as any).operation;
    const { data: config, error: configError } = await client
      .from('empresa_config')
      .select('ruc')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (configError || !/^\d{11}$/.test(String(config?.ruc || ''))) {
      await this.finalizarFalloConsultaGre(
        tenantId,
        operation,
        'GRE_ISSUER_RUC_INVALID',
        'RUC emisor requerido para consultar GRE',
      );
      throw new BadRequestException('RUC emisor requerido para consultar GRE');
    }

    let response: Awaited<ReturnType<OseService['consultarEstadoCpe']>>;
    try {
      if (gre.sunat_ticket) {
        response = await this.oseService.consultarTicketGre(gre.sunat_ticket, { tenantId });
      } else {
        const [serie, numero] = String(gre.numero || '').split('-');
        if (!serie || !numero) throw new Error(`Número GRE inválido: ${gre.numero}`);
        response = await this.oseService.consultarEstadoCpe(
          config.ruc,
          '09',
          serie,
          numero,
          { tenantId },
        );
      }
    } catch (error) {
      const message = this.errorMessage(error);
      await this.finalizarFalloConsultaGre(tenantId, operation, 'GRE_QUERY_EXCEPTION', message);
      throw new BadRequestException(`Error técnico consultando GRE: ${message}`);
    }

    const pending = !response.success && String(response.codigoRespuesta) === '98';
    const technicalError = !response.success && !pending
      && this.isTechnicalError(response.codigoRespuesta, response.descripcionRespuesta);
    const { data: finalized, error: finalizeError } = await client.rpc('finalizar_consulta_gre_tx', {
      p_tenant_id: tenantId,
      p_operation_id: operation.id,
      p_claim_token: operation.claim_token,
      p_success: response.success,
      p_pending: pending,
      p_technical_error: technicalError,
      p_codigo: response.codigoRespuesta,
      p_descripcion: response.descripcionRespuesta,
      p_cdr: response.cdr || null,
      p_response_summary: { observaciones: response.observaciones || [] },
    });
    if (finalizeError || !finalized) {
      throw this.toGreException(finalizeError, 'No se pudo cerrar la consulta GRE');
    }
    if (!response.success && !pending) {
      throw new BadRequestException(
        `${technicalError ? 'Error técnico' : 'SUNAT rechazó la GRE'}: ${response.codigoRespuesta}: ${response.descripcionRespuesta}`,
      );
    }
    return finalized;
  }

  private async finalizarFalloConsultaGre(
    tenantId: string,
    operation: any,
    code: string,
    message: string,
  ): Promise<void> {
    const { error } = await this.supabaseService.getClient().rpc('finalizar_consulta_gre_tx', {
      p_tenant_id: tenantId,
      p_operation_id: operation.id,
      p_claim_token: operation.claim_token,
      p_success: false,
      p_pending: false,
      p_technical_error: true,
      p_codigo: code,
      p_descripcion: message,
      p_cdr: null,
      p_response_summary: { exception: true },
    });
    if (error) {
      this.logger.error(`No se pudo finalizar el fallo de consulta GRE ${operation.id}: ${error.message}`);
    }
  }

  async anularGuia(
    greId: string,
    tenantId: string,
    actorId: string,
    motivo: string,
    idempotencyKey: string,
  ): Promise<GuiaRemisionResponseDto> {
    const { data, error } = await this.supabaseService.getClient().rpc('anular_gre_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_gre_id: greId,
      p_motivo: motivo,
      p_idempotency_key: this.requireGreKey(idempotencyKey),
    });
    if (error || !data) throw this.toGreException(error, 'No se pudo anular la GRE');
    return this.mapGreRecordToResponse(data);
  }

  async obtenerXmlFirmado(
    greId: string,
    tenantId: string,
  ): Promise<{ filename: string; content: string }> {
    const { data, error } = await this.supabaseService.getClient()
      .from('gre_guias')
      .select('numero,xml_firmado')
      .eq('id', greId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) throw new BadRequestException(`No se pudo leer el XML GRE: ${error.message}`);
    if (!data) throw new NotFoundException('Guía de remisión no encontrada');
    if (!data.xml_firmado) throw new BadRequestException('La GRE aún no tiene XML firmado');
    return { filename: `${data.numero}.xml`, content: data.xml_firmado };
  }

  async generarRepresentacionGre(
    greId: string,
    tenantId: string,
  ): Promise<{ filename: string; content: string }> {
    const gre = await this.findGuiaById(greId, tenantId);
    const lines = [
      `GUÍA DE REMISIÓN ELECTRÓNICA ${gre.numero}`,
      `Estado: ${gre.estado}`,
      `Destinatario: ${gre.destinatario}`,
      `Destino: ${gre.direccionDestino}`,
      `Fecha de traslado: ${gre.fechaTraslado}`,
      `Motivo: ${gre.motivo}`,
      `Modalidad: ${gre.modalidad}`,
      `Peso total: ${gre.pesoTotal} kg`,
      '',
      ...(gre.items || []).map((item, index) => (
        `${index + 1}. ${item.descripcion} — ${item.cantidad} ${item.unidadMedida || 'NIU'}`
      )),
    ];
    return { filename: `${gre.numero}.txt`, content: lines.join('\n') };
  }

  async updateAutoConfig(
    tenantId: string,
    actorId: string,
    body: GreAutoConfigDto,
    idempotencyKey: string,
  ): Promise<any> {
    const { data, error } = await this.supabaseService.getClient().rpc('actualizar_config_gre_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_payload: {
        umbral_gre_automatico: body.umbralGREAutomatico,
        gre_automatico_habilitado: body.greAutomaticoHabilitado,
        gre_obligatorio: body.greObligatorio,
      },
      p_idempotency_key: this.requireGreKey(idempotencyKey),
    });
    if (error || !data) throw this.toGreException(error, 'No se pudo actualizar la configuración GRE');
    return {
      umbralGREAutomatico: Number((data as any).umbral_gre_automatico),
      greAutomaticoHabilitado: (data as any).gre_automatico_habilitado === true,
      greObligatorio: (data as any).gre_obligatorio === true,
      idempotent: (data as any).idempotent === true,
    };
  }

  private requireGreKey(value?: string): string {
    const key = String(value || '').trim();
    if (!key || key.length > 200) {
      throw new BadRequestException('Idempotency-Key GRE requerido y de hasta 200 caracteres');
    }
    return key;
  }

  private resolveGreIdempotencyKey(dto: CreateGuiaRemisionDto, tenantId: string): string {
    const provided = dto.idempotencyKey?.trim();
    if (provided) {
      return provided;
    }

    if (dto.cpeRelacionado) {
      return `${tenantId}:cpe:${dto.cpeRelacionado}`;
    }

    if (dto.pedidoId) {
      return `${tenantId}:pedido:${dto.pedidoId}`;
    }

    if (dto.pedidoNumero) {
      return `${tenantId}:pedido-numero:${dto.pedidoNumero}`;
    }

    return [
      tenantId,
      dto.destinatario ?? 'destinatario',
      dto.fechaTraslado ?? new Date().toISOString(),
      dto.motivo ?? 'OTROS',
    ].join(':');
  }

  private buildGreAdditionalData(dto: CreateGuiaRemisionDto): Record<string, any> | null {
    const extras: Record<string, any> = {
      ...(dto.datosAdicionales || {}),
    };

    const addIfPresent = (key: string, value: unknown) => {
      const normalized = String(value ?? '').trim();
      if (normalized) {
        extras[key] = normalized;
      }
    };

    addIfPresent('transportistaDocumento', dto.transportistaDocumento);
    addIfPresent('destinoUbigeo', dto.ubigeoDestino);
    addIfPresent('conductorDocumentoTipo', dto.conductorDocumentoTipo);
    addIfPresent('conductorDocumentoNumero', dto.conductorDocumentoNumero);
    addIfPresent('conductorNombres', dto.conductorNombres);
    addIfPresent('conductorApellidos', dto.conductorApellidos);

    if (dto.despachosAsociados?.length) {
      extras.notasSalida = Array.from(new Set(dto.despachosAsociados));
    }

    if (dto.pedidoNumero) {
      extras.pedidoNumero = dto.pedidoNumero;
    }

    return Object.keys(extras).length > 0 ? extras : null;
  }

  private mapGreRecordToResponse(record: any): GuiaRemisionResponseDto {
    return {
      id: record.id,
      numero: record.numero,
      estado: record.estado,
      destinatario: record.destinatario,
      direccionDestino: record.direccion_destino,
      ubigeoDestino:
        record.datos_adicionales?.destinoUbigeo ||
        record.datos_adicionales?.ubigeoDestino ||
        record.ubigeo_destino,
      fechaTraslado: record.fecha_traslado,
      fechaCreacion: record.created_at,
      modalidad: record.modalidad,
      motivo: record.motivo,
      pesoTotal: record.peso_total,
      observaciones: record.observaciones,
      transportista: record.transportista,
      transportistaDocumento: record.datos_adicionales?.transportistaDocumento,
      placaVehiculo: record.placa_vehiculo,
      licenciaConducir: record.licencia_conducir,
      conductorDocumentoTipo: record.datos_adicionales?.conductorDocumentoTipo,
      conductorDocumentoNumero: record.datos_adicionales?.conductorDocumentoNumero,
      conductorNombres: record.datos_adicionales?.conductorNombres,
      conductorApellidos: record.datos_adicionales?.conductorApellidos,
      cpeRelacionado: record.cpe_relacionado,
      numeroSunat: record.numero_sunat,
      hashGre: record.hash_gre,
      sunatStatus: record.sunat_status,
      idempotencyKey: record.idempotency_key,
      eventId: record.event_id,
      errorMessage: record.error_message || undefined,
      signedAt: record.signed_at || undefined,
      lastSentAt: record.last_sent_at || undefined,
      lastConsultedAt: record.last_consulted_at || undefined,
      motivoAnulacion: record.motivo_anulacion || undefined,
    };
  }

  async getStats(tenantId: string) {
    const supabase = this.supabaseService.getClient();

    try {
      // Estadísticas básicas de GRE
      const { data: guias, error } = await supabase
        .from('gre_guias')
        .select('estado, peso_total, created_at')
        .eq('tenant_id', tenantId);

      if (error) {
        console.error('Error obteniendo estadísticas GRE:', error);
        return {
          total: 0,
          estados: {},
          pesoTotal: 0,
          tendencia: []
        };
      }

      // Procesar estadísticas
      const estados = guias.reduce((acc, guia) => {
        acc[guia.estado] = (acc[guia.estado] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      // `created_at` es `timestamptz`: recortarlo a diez caracteres da el dia UTC,
      // que para los tres paises del alcance --Peru y Colombia UTC-5, Argentina
      // UTC-3-- no es el dia del contribuyente. Una guia emitida a las 19:30 de
      // Lima ya lleva la fecha de manana en UTC, asi que "emitidas hoy" mostraba
      // cero durante las ultimas cinco horas de cada jornada.
      const pais = await paisDelTenant(this.supabaseService.getClient(), tenantId);
      const today = await fechaHoyDelTenant(this.supabaseService.getClient(), tenantId);
      const diaDelTenant = (valor: unknown): string | null => {
        const instante = new Date(String(valor ?? ''));
        return Number.isNaN(instante.getTime()) ? null : fechaHoyEnPais(pais, instante);
      };
      const stats = {
        total: guias.length,
        estados,
        pesoTotal: guias.reduce((sum, guia) => sum + (guia.peso_total || 0), 0),
        tendencia: this.calcularTendenciaSemanal(guias, pais),
        greEmitidas: guias.filter((guia) => diaDelTenant(guia.created_at) === today).length,
        totalGre: guias.length,
        enTransito: (estados.ENVIADO || 0) + (estados.FIRMADO || 0),
        completados: estados.ACEPTADO || 0,
      };

      console.log('📊 Estadísticas GRE:', stats);
      return stats;
    } catch (error) {
      console.error('Error calculando estadísticas GRE:', error);
      return {
        total: 0,
        estados: {},
        pesoTotal: 0,
        tendencia: [],
        greEmitidas: 0,
        totalGre: 0,
        enTransito: 0,
        completados: 0,
      };
    }
  }

  private calcularTendenciaSemanal(guias: any[], pais?: string | null): any[] {
    // Agrupar por semanas los últimos 7 días, en la zona del contribuyente: los
    // cubos se etiquetaban con el día UTC y una guía de las 19:30 de Lima caía en
    // el del día siguiente.
    const ahora = new Date();
    const semanaAtras = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);

    const guiasSemana = guias.filter(guia =>
      new Date(guia.created_at) >= semanaAtras
    );

    const tendencia = [];
    for (let i = 6; i >= 0; i--) {
      const fecha = new Date(ahora.getTime() - i * 24 * 60 * 60 * 1000);
      const fechaStr = fechaHoyEnPais(pais, fecha);

      const guiasDia = guiasSemana.filter(guia => {
        const instante = new Date(String(guia.created_at ?? ''));
        return !Number.isNaN(instante.getTime()) && fechaHoyEnPais(pais, instante) === fechaStr;
      });

      tendencia.push({
        fecha: fechaStr,
        cantidad: guiasDia.length,
        peso: guiasDia.reduce((sum, guia) => sum + (guia.peso_total || 0), 0)
      });
    }

    return tendencia;
  }

  /**
   * Evaluate if automatic GRE creation should be triggered
   * Requirements: 2.1, 2.2
   */
  async evaluateAutoGRECreation(saleData: {
    tenantId: string;
    saleId: string;
    total: number;
    cpeId?: string;
  }): Promise<boolean> {
    try {
      console.log(`🚚 [GRE] Evaluating auto GRE creation for sale ${saleData.saleId}, total: S/ ${saleData.total}`);

      // Get GRE threshold configuration for tenant
      const thresholdConfig = await this.getGREThresholdConfig(saleData.tenantId);

      // Check if auto GRE is enabled
      if (!thresholdConfig.greAutomaticoHabilitado) {
        console.log(`🚚 [GRE] Auto GRE is disabled for tenant ${saleData.tenantId}`);
        return false;
      }

      // Check if sale amount exceeds threshold
      const shouldCreate = saleData.total >= thresholdConfig.umbralGREAutomatico;

      console.log(
        `🚚 [GRE] Sale total S/ ${saleData.total} ${shouldCreate ? 'EXCEEDS' : 'BELOW'} threshold S/ ${thresholdConfig.umbralGREAutomatico}`
      );

      return shouldCreate;
    } catch (error) {
      console.error(`❌ [GRE] Error evaluating auto GRE creation:`, error);
      return false;
    }
  }

  /**
   * Create automatic GRE from sale data
   * Requirements: 2.1, 2.2, 2.3
   */
  async createAutoGREFromSale(
    saleId: string,
    saleData: {
      tenantId: string;
      cpeId: string;
      clienteId: string;
      clienteNombre?: string;
      clienteDireccion?: string;
      pesoTotal?: number;
      fechaTraslado?: string;
      total: number;
      productos?: any[];
      modalidad?: 'TRANSPORTE_PUBLICO' | 'TRANSPORTE_PRIVADO';
      transportista?: string;
      transportistaDocumento?: string;
      placaVehiculo?: string;
      licenciaConducir?: string;
      conductorDocumentoTipo?: string;
      conductorDocumentoNumero?: string;
      conductorNombres?: string;
      conductorApellidos?: string;
    }
  ): Promise<GuiaRemisionResponseDto> {
    try {
      console.log(`🚚 [GRE] Creating automatic GRE for sale ${saleId}`);

      this.assertAutoGreSaleDataValida(saleData);

      const modalidad = saleData.modalidad || 'TRANSPORTE_PUBLICO';

      // Prepare GRE data
      const greData: CreateGuiaRemisionDto = {
        destinatario: saleData.clienteNombre!,
        direccionDestino: saleData.clienteDireccion!,
        fechaTraslado: saleData.fechaTraslado!,
        modalidad,
        motivo: 'VENTA',
        pesoTotal: Number(saleData.pesoTotal),
        observaciones: `GRE automática - Venta ${saleId} - Total: S/ ${saleData.total}`,
        transportista: saleData.transportista,
        transportistaDocumento: saleData.transportistaDocumento,
        placaVehiculo: saleData.placaVehiculo,
        licenciaConducir: saleData.licenciaConducir,
        conductorDocumentoTipo: saleData.conductorDocumentoTipo,
        conductorDocumentoNumero: saleData.conductorDocumentoNumero,
        conductorNombres: saleData.conductorNombres,
        conductorApellidos: saleData.conductorApellidos,
        cpeRelacionado: saleData.cpeId,
        idempotencyKey: `sale:${saleData.tenantId}:${saleId}`,
        datosAdicionales: {
          origen: 'VENTA_AUTOMATICA',
          ventaId: saleId,
        },
      };

      // Create GRE (with certificate validation)
      const gre = await this.createGuia(greData, saleData.tenantId);

      console.log(`✅ [GRE] Automatic GRE created successfully: ${gre.numero} for sale ${saleId}`);

      return gre;
    } catch (error) {
      console.error(`❌ [GRE] Error creating automatic GRE for sale ${saleId}:`, error);
      throw error;
    }
  }

  /**
   * Datos sin los cuales una GRE automática no se puede declarar.
   *
   * El peso bruto y la fecha de inicio de traslado son campos que SUNAT recibe.
   * Ningún producto del catálogo guarda peso —no existe la columna—, así que no
   * hay de dónde deducirlo: exigirlos es la única forma de no declarar un número
   * inventado. Cuando faltan, el mensaje ya remite al flujo manual.
   */
  private assertAutoGreSaleDataValida(saleData: {
    clienteNombre?: string;
    clienteDireccion?: string;
    pesoTotal?: number;
    fechaTraslado?: string;
    modalidad?: 'TRANSPORTE_PUBLICO' | 'TRANSPORTE_PRIVADO';
    transportista?: string;
    transportistaDocumento?: string;
    placaVehiculo?: string;
    licenciaConducir?: string;
    conductorDocumentoNumero?: string;
    conductorNombres?: string;
    conductorApellidos?: string;
  }): void {
    const missing: string[] = [];
    const modalidad = saleData.modalidad || 'TRANSPORTE_PUBLICO';

    if (!saleData.clienteNombre?.trim()) missing.push('destinatario real');
    if (!saleData.clienteDireccion?.trim()) missing.push('dirección de destino real');
    if (!(Number(saleData.pesoTotal) > 0)) missing.push('peso bruto declarado');
    if (!saleData.fechaTraslado?.trim()) missing.push('fecha de inicio de traslado');

    if (modalidad === 'TRANSPORTE_PUBLICO') {
      if (!saleData.transportista?.trim()) missing.push('transportista');
      if (!/^\d{11}$/.test(this.normalizeDigits(saleData.transportistaDocumento))) {
        missing.push('RUC válido del transportista');
      }
    }

    if (modalidad === 'TRANSPORTE_PRIVADO') {
      if (!this.normalizeGrePlate(saleData.placaVehiculo)) missing.push('placa del vehículo');
      if (!saleData.licenciaConducir?.trim()) missing.push('licencia de conducir');
      if (!this.normalizeDigits(saleData.conductorDocumentoNumero)) missing.push('documento del conductor');
      if (!saleData.conductorNombres?.trim()) missing.push('nombres del conductor');
      if (!saleData.conductorApellidos?.trim()) missing.push('apellidos del conductor');
    }

    if (missing.length > 0) {
      throw new BadRequestException(
        `No se puede generar GRE automática: faltan datos obligatorios de traslado (${missing.join(', ')}). Use el flujo asistido/manual antes de enviar a SUNAT.`,
      );
    }
  }

  /**
   * Get GRE threshold configuration for tenant
   * Requirements: 2.1, 2.2, 2.6
   */
  async getGREThresholdConfig(tenantId: string): Promise<{
    umbralGREAutomatico: number;
    greAutomaticoHabilitado: boolean;
    greObligatorio: boolean;
  }> {
    try {
      console.log(`🚚 [GRE] Getting GRE threshold config for tenant ${tenantId}`);

      const { data, error } = await this.supabaseService.getClient()
        .from('empresa_config')
        .select('umbral_gre_automatico, gre_automatico_habilitado, gre_obligatorio')
        .eq('tenant_id', tenantId)
        .single();

      if (error) {
        console.warn(`⚠️ [GRE] Error getting GRE config, disabling automatic GRE:`, error);
        return {
          umbralGREAutomatico: 700.0,
          greAutomaticoHabilitado: false,
          greObligatorio: false,
        };
      }

      return {
        umbralGREAutomatico: data?.umbral_gre_automatico ?? 700.0,
        greAutomaticoHabilitado: data?.gre_automatico_habilitado === true,
        greObligatorio: data?.gre_obligatorio === true,
      };
    } catch (error) {
      console.error(`❌ [GRE] Error getting GRE threshold config:`, error);
      // Fail closed: GRE automática requiere opt-in del tenant y datos reales de traslado.
      return {
        umbralGREAutomatico: 700.0,
        greAutomaticoHabilitado: false,
        greObligatorio: false,
      };
    }
  }

}
