import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CreateGuiaRemisionDto, GuiaRemisionResponseDto } from './gre.types';
import { EventBusService } from '../../shared/events/event-bus.service';
import { InventoryIntegrationService } from '../../shared/integration/inventory-integration.service';
import { OseService } from '../ose/ose.service';
import { ValidationService } from '../validations/validation.service';

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
    private readonly inventoryService: InventoryIntegrationService,
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
      const productos = datos.productos || [];
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

        if (!datos.clienteDireccion) {
          throw new BadRequestException('No se puede crear GRE automática: falta dirección de destino del cliente');
        }

        // Crear GRE automática con datos validados (con certificado)
        const greAutomatica = await this.createGuia({
          destinatario: `Cliente ${clienteId}`,
          direccionDestino: datos.clienteDireccion,
          fechaTraslado: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Mañana
          modalidad: 'TRANSPORTE_PUBLICO',
          motivo: 'VENTA',
          pesoTotal: this.calcularPesoEstimado(productos, total),
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

  private calcularPesoEstimado(productos: any[], total: number): number {
    console.log(`🚚 [GRE] Calculando peso estimado para ${productos.length} productos, total S/ ${total}`);

    // Peso estimado básico: 1kg por cada S/ 100 de valor, más peso base de productos
    let pesoEstimado = total / 100; // 1kg por cada S/ 100

    // Si hay productos, agregar peso base
    if (productos.length > 0) {
      pesoEstimado += productos.length * 0.5; // 500g por producto
    } else {
      // Si no hay detalle de productos, usar peso base según total
      pesoEstimado = total / 50; // 1kg por cada S/ 50 cuando no hay detalle
    }

    const pesoFinal = Math.max(Math.round(pesoEstimado * 100) / 100, 1); // Mínimo 1kg, redondear a 2 decimales
    console.log(`🚚 [GRE] Peso estimado calculado: ${pesoFinal} kg`);

    return pesoFinal;
  }

  findAll() {
    // Mock data for now
    return {
      message: 'GRE module is working',
      data: []
    };
  }

  async findAllGuias(tenantId: string): Promise<GuiaRemisionResponseDto[]> {
    const supabase = this.supabaseService.getClient();

    try {
      console.log(`🔍 Consultando tabla gre_guias para tenant ${tenantId}...`);

      const { data, error } = await supabase
        .from('gre_guias')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      console.log('📊 Resultado de consulta:', { data, error });

      if (error) {
        console.error('❌ Error al consultar GREs:', error);
        throw new Error(`Error al consultar las guías de remisión: ${error.message}`);
      }

      console.log(`✅ Se encontraron ${data?.length || 0} registros GRE`);

      return (data || []).map(gre => this.mapGreRecordToResponse(gre));
    } catch (error) {
      console.error('❌ Error en servicio GRE:', error);
      throw error;
    }
  }

  async findGuiaById(id: string, tenantId: string): Promise<GuiaRemisionResponseDto> {
    const supabase = this.supabaseService.getClient();

    try {
      console.log(`🔍 Consultando GRE con ID: ${id} para tenant ${tenantId}`);

      const { data, error } = await supabase
        .from('gre_guias')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      console.log('📊 Resultado de consulta individual:', { data, error });

      if (error) {
        console.error('❌ Error al consultar GRE:', error);
        throw new Error(`Error al consultar la guía de remisión: ${error.message}`);
      }

      if (!data) {
        throw new Error('Guía de remisión no encontrada');
      }

      console.log(`✅ GRE encontrada:`, data);

      return this.mapGreRecordToResponse(data);
    } catch (error) {
      console.error('❌ Error en servicio GRE al obtener por ID:', error);
      throw error;
    }
  }

  /**
   * Genera CSV GRE (SUNAT) con columnas estándar.
   */
  async generarCsvGre(tenantId: string, anio?: number, mes?: number): Promise<string> {
    const supabase = this.supabaseService.getClient();

    let query = supabase
      .from('gre_guias')
      .select('serie, numero, fecha_emision, fecha_vencimiento, cliente_ruc, cliente_nombre, base_imponible, igv, total, moneda, estado, tenant_id, anio, mes')
      .eq('tenant_id', tenantId);

    if (anio) query = query.eq('anio', anio);
    if (mes) query = query.eq('mes', mes);

    const { data, error } = await query;

    if (error) {
      this.logger.error('❌ Error consultando GREs para CSV:', error);
      throw new Error(`Error generando CSV GRE: ${error.message}`);
    }

    const headers = [
      'serie',
      'numero',
      'fecha_emision',
      'fecha_vencimiento',
      'ruc_cliente',
      'razon_social',
      'base',
      'igv',
      'total',
      'moneda',
      'estado',
    ];

    const rows = (data || []).map((g: any) => [
      g.serie || '',
      g.numero || '',
      (g.fecha_emision || '').split('T')[0],
      (g.fecha_vencimiento || '').split('T')[0],
      g.cliente_ruc || '',
      (g.cliente_nombre || '').replace(/,/g, ' '),
      this.formatNumber(g.base_imponible),
      this.formatNumber(g.igv),
      this.formatNumber(g.total),
      g.moneda || 'PEN',
      g.estado || '',
    ]);

    const lines = [headers.join(',')].concat(rows.map(r => r.join(',')));

    // Auditoría opcional: registrar en integration_logs la generación del CSV
    try {
      await supabase.from('integration_logs').insert({
        tenant_id: tenantId,
        tipo: 'GRE_CSV',
        estado: 'GENERATED',
        payload: {
          periodo: anio && mes ? `${anio}-${String(mes).padStart(2, '0')}` : 'all',
          filas: rows.length,
        },
        referencia: `gre_csv_${anio || 'all'}_${mes || 'all'}`,
      });
    } catch (logErr) {
      this.logger.warn('⚠️ [GRE] No se pudo registrar integration_logs para CSV:', logErr?.message || logErr);
    }

    return lines.join('\n');
  }

  private formatNumber(value: any): string {
    const num = Number(value || 0);
    return Number.isFinite(num) ? num.toFixed(2) : '0.00';
  }

  async createGuia(greData: CreateGuiaRemisionDto, tenantId: string): Promise<GuiaRemisionResponseDto> {
    const supabase = this.supabaseService.getClient();

    try {
      this.logger.log(`🚚 [GRE] Creando nueva guía de remisión para tenant: ${tenantId}`);
      console.log('🚚 [GRE] Datos recibidos:', greData);
      this.assertCreateGreDataValida(greData);

      // VALIDACIÓN: GRE es exclusivo de Perú
      const { data: empresaConfig } = await supabase
        .from('empresa_config')
        .select('pais_id')
        .eq('tenant_id', tenantId)
        .single();

      if (empresaConfig?.pais_id) {
        const { data: pais } = await supabase
          .from('paises')
          .select('codigo_iso, nombre')
          .eq('id', empresaConfig.pais_id)
          .single();

        if (pais && pais.codigo_iso !== 'PE') {
          this.logger.error(`❌ [GRE] Intento de crear GRE para país ${pais.nombre} (${pais.codigo_iso}). GRE solo disponible para Perú.`);
          throw new BadRequestException({
            message: `Las Guías de Remisión Electrónicas (GRE) solo están disponibles para empresas peruanas. Su empresa está configurada para ${pais.nombre}.`,
            code: 'GRE_NOT_AVAILABLE_FOR_COUNTRY',
            country: pais.nombre,
          });
        }
      }

      await this.assertOrigenGreExiste(greData, tenantId);

      const eventId = randomUUID();
      const idempotencyKey = this.resolveGreIdempotencyKey(greData, tenantId);

      const { data: existingGre, error: existingGreError } = await supabase
        .from('gre_guias')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existingGreError && existingGreError.code && existingGreError.code !== 'PGRST116') {
        this.logger.error(
          `❌ [GRE] Error verificando idempotencia (${idempotencyKey}): ${existingGreError.message}`,
        );
        throw new BadRequestException('No se pudo validar idempotencia al crear la GRE');
      }

      if (existingGre) {
        this.logger.warn(
          `♻️ [GRE] Solicitud idempotente detectada (${idempotencyKey}), retornando GRE existente ${existingGre.id}`,
        );
        return this.mapGreRecordToResponse(existingGre);
      }

      // HARDENING E2: Validar certificado antes de generar GRE
      this.logger.log(`🔐 [GRE] Validando certificado digital antes de generar GRE...`);
      const certificateValidation = await this.validationService.validateCertificate(tenantId);

      if (!certificateValidation.isValid) {
        this.logger.error(`❌ [GRE] Validación de certificado fallida: ${certificateValidation.errors.join(', ')}`);
        throw new BadRequestException({
          message: 'No se puede generar la GRE: Certificado digital inválido',
          errors: certificateValidation.errors,
          code: 'CERT_VALIDATION_FAILED',
        });
      }

      if (certificateValidation.warnings.length > 0) {
        this.logger.warn(`⚠️ [GRE] Advertencias de certificado: ${certificateValidation.warnings.join(', ')}`);
      }

      this.logger.log(`✅ [GRE] Certificado validado exitosamente antes de generar GRE`);

      const numeroCorrelativo = await this.generarNumeroCorrelativo(tenantId);
      const { serie, correlativo } = this.extractSerieYCorrelativo(numeroCorrelativo);
      const datosAdicionales = this.buildGreAdditionalData(greData);
      const timestamp = new Date().toISOString();

      const greDataInsert: Record<string, any> = {
        numero: numeroCorrelativo,
        serie,
        correlativo,
        estado: 'BORRADOR',
        destinatario: greData.destinatario,
        direccion_destino: greData.direccionDestino,
        fecha_traslado: greData.fechaTraslado,
        modalidad: greData.modalidad,
        motivo: greData.motivo,
        peso_total: greData.pesoTotal,
        observaciones: greData.observaciones,
        transportista: greData.transportista,
        placa_vehiculo: greData.placaVehiculo,
        licencia_conducir: greData.licenciaConducir,
        cpe_relacionado: greData.cpeRelacionado || null,
        tenant_id: tenantId,
        created_at: timestamp,
        idempotency_key: idempotencyKey,
        event_id: eventId,
        sunat_status: this.sunatStatuses.NOT_SENT,
      };

      if (datosAdicionales) {
        greDataInsert.datos_adicionales = datosAdicionales;
      }

      console.log('🚚 [GRE] Datos preparados para inserción:', greDataInsert);

      const { data, error } = await supabase
        .from('gre_guias')
        .insert(greDataInsert)
        .select()
        .single();

      if (error) {
        console.error('❌ Error insertando GRE:', error);
        throw new Error(`Error creando guía de remisión: ${error.message}`);
      }

      // Auditoría: integration_logs por tenant (éxito)
      try {
        await supabase.from('integration_logs').insert({
          tenant_id: tenantId,
          servicio: 'GRE',
          operacion: 'CREATE',
          correlacion_id: data.id,
          correlacion_tipo: 'GRE',
          status: 'SUCCESS',
          request_summary: { idempotencyKey, serie, correlativo },
          response_summary: { id: data.id, estado: data.estado },
        });
      } catch (logErr) {
        this.logger.warn('⚠️ [GRE] No se pudo registrar integration_logs de creación:', logErr?.message || logErr);
      }

      console.log('✅ GRE creada exitosamente:', data);

      if (greData.pedidoId) {
        const { data: pedidoDetalles, error: pedidoDetallesError } = await supabase
          .from('pedidos_venta_detalle')
          .select('producto_id, descripcion, cantidad')
          .eq('pedido_id', greData.pedidoId)
          .eq('tenant_id', tenantId);

        if (pedidoDetallesError) {
          throw new Error(`Error obteniendo detalle del pedido para GRE: ${pedidoDetallesError.message}`);
        }

        if (!pedidoDetalles || pedidoDetalles.length === 0) {
          throw new Error('No se puede generar GRE: el pedido no tiene items para gre_detalles');
        }

        const detalleInvalido = pedidoDetalles.find((item: any) => Number(item.cantidad || 0) <= 0);
        if (detalleInvalido) {
          throw new BadRequestException('No se puede generar GRE: el pedido contiene cantidades inválidas');
        }

        const greDetalles = pedidoDetalles.map((item: any) => ({
          gre_id: data.id,
          tenant_id: tenantId,
          producto_id: item.producto_id,
          descripcion: item.descripcion,
          cantidad: Number(item.cantidad || 0),
          unidad_medida: 'NIU',
          peso: Number(greData.pesoTotal || 0) / Math.max(pedidoDetalles.length, 1),
          estado: 'ACTIVO',
        }));

        const { error: greDetallesError } = await supabase
          .from('gre_detalles')
          .insert(greDetalles);

        if (greDetallesError) {
          throw new Error(`Error creando detalle de GRE: ${greDetallesError.message}`);
        }

        await this.registrarRelacionPedidoGre({
          pedidoId: greData.pedidoId,
          greId: data.id,
          greNumero: data.numero,
          greEstado: data.estado ?? 'BORRADOR',
          tenantIdHint: greData.tenantId,
          notas: greData.observaciones ?? null,
          despachos: greData.despachosAsociados,
        });
      }

      const xmlPreparation = await this.procesarGeneracionXML(data.id, tenantId);
      const sunatStatusForEvent = xmlPreparation.success ? this.sunatStatuses.READY : this.sunatStatuses.ERROR;

      let greRecord = data;
      try {
        const { data: refreshedGre, error: refreshError } = await supabase
          .from('gre_guias')
          .select('*')
          .eq('id', data.id)
          .maybeSingle();

        if (!refreshError && refreshedGre) {
          greRecord = refreshedGre;
        } else {
          greRecord = {
            ...data,
            sunat_status: sunatStatusForEvent,
            hash_gre: xmlPreparation.hash ?? data.hash_gre,
          };
        }
      } catch (refreshError) {
        this.logger.warn(`⚠️ [GRE] No se pudo refrescar GRE ${data.id} después de la inserción:`, refreshError);
        greRecord = {
          ...data,
          sunat_status: sunatStatusForEvent,
          hash_gre: xmlPreparation.hash ?? data.hash_gre,
        };
      }

      await this.eventBus.emitGuiaRemisionCreada({
        eventId,
        tenantId,
        idempotencyKey,
        greId: greRecord.id,
        tipoDocumento: '09',
        serie: greRecord.serie ?? serie,
        numero: Number(greRecord.correlativo ?? correlativo) || correlativo,
        numeroCompleto: greRecord.numero ?? numeroCorrelativo,
        transportistaId: greRecord.transportista ?? greData.transportista ?? undefined,
        vehiculoId: greRecord.placa_vehiculo ?? greData.placaVehiculo ?? undefined,
        ruta: greRecord.direccion_destino ?? greData.direccionDestino,
        peso: Number(greRecord.peso_total ?? greData.pesoTotal) || greData.pesoTotal,
        cpeRelacionado: greRecord.cpe_relacionado ?? greData.cpeRelacionado ?? undefined,
        ventaRelacionada: greRecord.venta_id ?? undefined,
        fechaTraslado: greRecord.fecha_traslado ?? greData.fechaTraslado,
        destinatario: greRecord.destinatario ?? greData.destinatario,
        direccionDestino: greRecord.direccion_destino ?? greData.direccionDestino,
        sunatStatus: greRecord.sunat_status ?? sunatStatusForEvent,
        hashGre: greRecord.hash_gre ?? xmlPreparation.hash ?? undefined,
        notasSalida: greData.despachosAsociados ?? [],
      });

      return this.mapGreRecordToResponse(greRecord);
    } catch (error) {
      console.error('❌ Error en createGuia:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      // Auditoría: integration_logs por tenant (error)
      try {
        await this.supabaseService.getClient().from('integration_logs').insert({
          tenant_id: tenantId,
          servicio: 'GRE',
          operacion: 'CREATE',
          correlacion_tipo: 'GRE',
          status: 'ERROR',
          error_message: error instanceof Error ? error.message : 'Error creando GRE',
          request_summary: {
            destinatario: greData?.destinatario,
            fechaTraslado: greData?.fechaTraslado,
          },
        });
      } catch {
        /* ignore logging errors */
      }
      throw new BadRequestException(error?.message || 'Error creando guía de remisión');
    }
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

    const extras = dto.datosAdicionales || {};
    const ubigeoDestino = this.normalizeDigits(
      dto.ubigeoDestino ||
      extras.destinoUbigeo ||
      extras.ubigeoDestino,
    );
    if (!/^\d{6}$/.test(ubigeoDestino)) {
      throw new BadRequestException(
        'No se puede generar GRE: el ubigeo de destino debe tener 6 dígitos',
      );
    }

    if (dto.modalidad === 'TRANSPORTE_PUBLICO') {
      if (!dto.transportista?.trim()) {
        throw new BadRequestException('No se puede generar GRE: transporte público requiere transportista');
      }

      const transportistaDocumento = this.normalizeDigits(
        dto.transportistaDocumento ||
        extras.transportistaDocumento ||
        extras.transportistaRuc,
      );
      if (!/^\d{11}$/.test(transportistaDocumento)) {
        throw new BadRequestException('No se puede generar GRE: transporte público requiere RUC válido del transportista');
      }
    }

    if (dto.modalidad === 'TRANSPORTE_PRIVADO') {
      const placa = this.normalizeGrePlate(dto.placaVehiculo || extras.placaVehiculo || extras.placa);
      if (!placa) {
        throw new BadRequestException('No se puede generar GRE: transporte privado requiere placa del vehículo');
      }
      const licenciaConducir = String(dto.licenciaConducir || extras.licenciaConducir || '').trim();
      if (!licenciaConducir) {
        throw new BadRequestException('No se puede generar GRE: transporte privado requiere licencia de conducir');
      }

      const conductorDocumentoTipo = String(dto.conductorDocumentoTipo || extras.conductorDocumentoTipo || '1').trim();
      const conductorDocumentoNumero = this.normalizeDigits(dto.conductorDocumentoNumero || extras.conductorDocumentoNumero);
      const conductorNombres = String(dto.conductorNombres || extras.conductorNombres || '').trim();
      const conductorApellidos = String(dto.conductorApellidos || extras.conductorApellidos || '').trim();

      if (!/^[0147A]$/.test(conductorDocumentoTipo) || conductorDocumentoTipo === '6') {
        throw new BadRequestException('No se puede generar GRE: tipo de documento del conductor inválido');
      }
      if (!conductorDocumentoNumero || conductorDocumentoNumero.length > 15) {
        throw new BadRequestException('No se puede generar GRE: transporte privado requiere número de documento del conductor');
      }
      if (!conductorNombres || !conductorApellidos) {
        throw new BadRequestException('No se puede generar GRE: transporte privado requiere nombres y apellidos del conductor');
      }
    }
  }

  private async assertOrigenGreExiste(dto: CreateGuiaRemisionDto, tenantId: string): Promise<void> {
    const supabase = this.supabaseService.getClient();

    if (dto.cpeRelacionado) {
      const { data, error } = await supabase
        .from('cpe')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('id', dto.cpeRelacionado)
        .maybeSingle();

      if (error) {
        throw new BadRequestException(`No se pudo validar CPE relacionado para GRE: ${error.message}`);
      }
      if (!data) {
        throw new BadRequestException('No se puede generar GRE: documento origen CPE no existe');
      }
    }

    if (dto.pedidoId) {
      const { data, error } = await supabase
        .from('pedidos_venta')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('id', dto.pedidoId)
        .maybeSingle();

      if (error) {
        throw new BadRequestException(`No se pudo validar pedido relacionado para GRE: ${error.message}`);
      }
      if (!data) {
        throw new BadRequestException('No se puede generar GRE: documento origen pedido no existe');
      }
    }
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
        <cbc:ID schemeID="${receptorDocTipo}" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${receptorDocNumero}</cbc:ID>
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

  private async registrarRelacionPedidoGre(params: {
    pedidoId: string;
    greId: string;
    greNumero: string;
    greEstado: string;
    tenantIdHint?: string;
    notas?: string | null;
    despachos?: string[] | undefined;
  }): Promise<void> {
    const client = this.supabaseService.getClient();

    try {
      const { data: pedido, error: pedidoError } = await client
        .from('pedidos_venta')
        .select('tenant_id, numero')
        .eq('id', params.pedidoId)
        .single();

      if (pedidoError || !pedido) {
        console.warn(
          `⚠️ [GRE] No se pudo vincular GRE ${params.greId} con pedido ${params.pedidoId}: ${pedidoError?.message ?? 'pedido no encontrado'
          }`,
        );
        return;
      }

      const tenantId = pedido.tenant_id ?? params.tenantIdHint;
      if (!tenantId) {
        console.warn(
          `⚠️ [GRE] Tenant desconocido al vincular GRE ${params.greId} con pedido ${params.pedidoId}`,
        );
        return;
      }

      const relacion = {
        tenant_id: tenantId,
        pedido_id: params.pedidoId,
        gre_id: params.greId,
        estado: params.greEstado ?? 'BORRADOR',
        notas: params.notas ?? null,
        creado_en: new Date().toISOString(),
      };

      const { error: linkError } = await client.from('pedido_gres').insert(relacion);
      if (linkError) {
        console.error(
          `❌ [GRE] Error registrando relación pedido-gre (${params.pedidoId} -> ${params.greId}): ${linkError.message}`,
        );
      }

      const { error: pedidoUpdate } = await client
        .from('pedidos_venta')
        .update({
          gre_id: params.greId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.pedidoId)
        .eq('tenant_id', tenantId);

      if (pedidoUpdate) {
        console.warn(
          `⚠️ [GRE] No se pudo actualizar pedidos_venta.gre_id para ${params.pedidoId}: ${pedidoUpdate.message}`,
        );
      }
    } catch (error) {
      console.error(
        `❌ [GRE] Error inesperado al vincular GRE ${params.greId} con pedido ${params.pedidoId}`,
        error as Error,
      );
    }
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
   * Procesar generación de XML UBL y firma (sin enviar a SUNAT)
   * 
   * NOTA: El envío automático a SUNAT está DESACTIVADO por ahora.
   * Para enviar manualmente usar el endpoint: POST /api/gre/guias/:id/enviar-sunat
   * 
   * HARDENING E2: Valida certificado antes de firmar el XML
   */
  private async procesarGeneracionXML(
    greId: string,
    tenantId?: string,
  ): Promise<{ success: boolean; hash?: string }> {
    try {
      this.logger.log(`📄 [GRE] Generando XML para GRE ${greId}...`);

      // Obtener datos de la GRE
      const query = this.supabaseService.getClient()
        .from('gre_guias')
        .select('*')
        .eq('id', greId);

      if (tenantId) {
        query.eq('tenant_id', tenantId);
      }

      const { data: greData, error } = await query.single();

      if (error || !greData) {
        throw new Error('No se pudo obtener los datos de la GRE');
      }

      // HARDENING E2: Validar certificado antes de firmar XML (si se proporciona tenantId)
      if (tenantId) {
        this.logger.log(`🔐 [GRE] Validando certificado antes de firmar XML para GRE ${greId}...`);
        const certificateValidation = await this.validationService.validateCertificate(tenantId);

        if (!certificateValidation.isValid) {
          this.logger.error(`❌ [GRE] Validación de certificado fallida antes de firmar: ${certificateValidation.errors.join(', ')}`);

          // Marcar GRE como ERROR sin intentar firmar
          await this.supabaseService.update(
            'gre_guias',
            {
              estado: 'ERROR',
              error_message: `Error validando certificado antes de firmar: ${certificateValidation.errors.join(', ')}`,
              updated_at: new Date().toISOString()
            },
            { id: greId }
          );

          throw new BadRequestException({
            message: 'No se puede firmar la GRE: Certificado digital inválido',
            errors: certificateValidation.errors,
            code: 'CERT_VALIDATION_FAILED',
          });
        }

        if (certificateValidation.warnings.length > 0) {
          this.logger.warn(`⚠️ [GRE] Advertencias de certificado: ${certificateValidation.warnings.join(', ')}`);
        }

        this.logger.log(`✅ [GRE] Certificado validado exitosamente antes de firmar XML`);
      }

      // Generar XML UBL
      const xmlPayload = await this.buildGreXmlPayload(greData);
      const xmlContent = this.generateGreXmlUbl(xmlPayload);

      // Firmar el XML (sin enviar a SUNAT)
      const xmlSigned = await this.firmarXmlGre(xmlContent, tenantId);
      const hash = this.generarHashXml(xmlSigned);

      // Guardar XML firmado en BD
      await this.supabaseService.update(
        'gre_guias',
        {
          xml_firmado: xmlSigned,
          hash_gre: hash,
          estado: 'FIRMADO', // Estado que indica que está listo para SUNAT
          sunat_status: this.sunatStatuses.READY,
          updated_at: new Date().toISOString()
        },
        { id: greId }
      );

      this.logger.log(`✅ [GRE] XML generado y firmado para GRE ${greId} - Hash: ${hash}`);
      return { success: true, hash };
    } catch (error) {
      this.logger.error(`❌ [GRE] Error generando XML para GRE ${greId}:`, error);

      // Marcar como ERROR
      await this.supabaseService.update(
        'gre_guias',
        {
          estado: 'ERROR',
          error_message: `Error generando XML: ${error.message}`,
          sunat_status: this.sunatStatuses.ERROR,
          updated_at: new Date().toISOString()
        },
        { id: greId }
      );

      if (error instanceof BadRequestException) {
        throw error;
      }

      return { success: false };
    }
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
  ): Promise<void> {
    return this.procesarEnvioSunat(greId, tenantId, options);
  }

  /**
   * Procesar envío de GRE a SUNAT (método preparado para activar después)
   */
  private async procesarEnvioSunat(
    greId: string,
    tenantId?: string,
    options?: { idempotencyKey?: string },
  ): Promise<void> {
    try {
      console.log(`📤 [GRE] Procesando envío de GRE ${greId} a SUNAT...`);

      // Obtener datos de la GRE
      const { data: greData, error } = await this.supabaseService.getClient()
        .from('gre_guias')
        .select('*')
        .eq('id', greId)
        .single();

      if (error || !greData) {
        throw new Error('No se pudo obtener los datos de la GRE');
      }

      const effectiveTenantId = tenantId ?? (greData as any).tenant_id;
      if (!effectiveTenantId) {
        throw new Error('Tenant requerido para enviar GRE a SUNAT');
      }
      const effectiveIdempotencyKey =
        String(options?.idempotencyKey ?? '').trim() ||
        String((greData as any).idempotency_key ?? '').trim() ||
        `gre.send:${effectiveTenantId}:${greId}`;

      // HARDENING: evitar doble envío concurrente si ya está en flight.
      if (
        (greData as any).estado === 'ENVIADO' &&
        (greData as any).sunat_status === this.sunatStatuses.SENDING
      ) {
        this.logger.warn(
          `♻️ [GRE] Envío ya en progreso para ${greId} (idempotencyKey=${effectiveIdempotencyKey}); omitiendo duplicado.`,
        );
        return;
      }

      // Marcar como ENVIADO
      await this.supabaseService.update(
        'gre_guias',
        {
          estado: 'ENVIADO',
          sunat_status: this.sunatStatuses.SENDING,
          updated_at: new Date().toISOString()
        },
        { id: greId }
      );

      // Generar XML UBL con datos reales
      const xmlPayload = await this.buildGreXmlPayload(greData);
      const xmlContent = this.generateGreXmlUbl(xmlPayload);
      const fileName = `${xmlPayload.emisor.ruc}-09-${greData.numero}`;

      // Enviar a SUNAT mediante OSE
      const response = await this.oseService.enviarGre(xmlContent, fileName, { tenantId: effectiveTenantId });

      if (response.success) {
        if (response.ticket && !response.cdr) {
          console.log(`⏳ [GRE] GRE ${greId} recibida por SUNAT con ticket ${response.ticket}; pendiente de consulta CDR`);

          await this.supabaseService.update(
            'gre_guias',
            {
              estado: 'ENVIADO',
              sunat_status: this.sunatStatuses.SENDING,
              numero_sunat: response.ticket,
              hash_gre: response.hashCPE,
              updated_at: new Date().toISOString()
            },
            { id: greId }
          );
          return;
        }

        console.log(`✅ [GRE] GRE ${greId} enviada exitosamente a SUNAT`);

        // Actualizar como ACEPTADO
        await this.supabaseService.update(
          'gre_guias',
          {
            estado: 'ACEPTADO',
            sunat_status: this.sunatStatuses.ACCEPTED,
            numero_sunat: response.numeroComprobante,
            hash_gre: response.hashCPE,
            cdr_sunat: response.cdr || 'CDR_RECEIVED',
            updated_at: new Date().toISOString()
          },
          { id: greId }
        );
      } else {
        console.error(`❌ [GRE] Error enviando GRE ${greId}: ${response.descripcionRespuesta}`);

        // 🔴 CRÍTICO FIX: Determinar si es error técnico recuperable o error de validación
        const isTechnicalError = this.isTechnicalError(response.codigoRespuesta, response.descripcionRespuesta);

        // Marcar como RECHAZADO
        await this.supabaseService.update(
          'gre_guias',
          {
            estado: isTechnicalError ? 'ERROR' : 'RECHAZADO',
            sunat_status: isTechnicalError ? this.sunatStatuses.ERROR : this.sunatStatuses.REJECTED,
            error_message: `${response.codigoRespuesta}: ${response.descripcionRespuesta}`,
            retry_count: 0,
            next_retry_at: null,
            updated_at: new Date().toISOString()
          },
          { id: greId }
        );

        throw new BadRequestException(`SUNAT rechazó la GRE: ${response.codigoRespuesta}: ${response.descripcionRespuesta}`);
      }

    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      console.error(`❌ [GRE] Error técnico enviando GRE ${greId}:`, error);

      // 🔴 CRÍTICO FIX: Marcar como RECHAZADO con información de reintento
      const retryCount = 0; // Primera vez que falla
      await this.supabaseService.update(
        'gre_guias',
        {
          estado: 'ERROR',
          sunat_status: this.sunatStatuses.ERROR,
          error_message: `Error técnico: ${error.message}`,
          retry_count: retryCount,
          next_retry_at: null, // El servicio de reintentos lo programará
          updated_at: new Date().toISOString()
        },
        { id: greId }
      );
    }
  }

  /**
   * Reenviar GRE a SUNAT
   */
  async reenviarGre(
    greId: string,
    tenantId: string,
    options?: { idempotencyKey?: string },
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🔄 [GRE] Reenviando GRE ${greId} a SUNAT...`);

      await this.procesarEnvioSunat(greId, tenantId, options);

      return {
        success: true,
        message: 'GRE reenviada exitosamente a SUNAT'
      };
    } catch (error) {
      console.error(`❌ [GRE] Error reenviando GRE ${greId}:`, error);
      return {
        success: false,
        message: `Error reenviando GRE: ${error.message}`
      };
    }
  }

  /**
   * Enviar manualmente GRE firmada a SUNAT
   */
  async enviarManualmenteSunat(
    greId: string,
    tenantId: string,
    options?: { idempotencyKey?: string },
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🚀 [GRE] Enviando manualmente GRE ${greId} a SUNAT...`);
      await this.procesarEnvioSunat(greId, tenantId, options);
      return { success: true, message: 'GRE enviada a SUNAT exitosamente' };
    } catch (error) {
      console.error(`❌ Error enviando manualmente GRE ${greId}:`, error);
      return { success: false, message: `Error enviando GRE: ${error.message}` };
    }
  }

  /**
   * Consultar estado de GRE en SUNAT
   */
  async consultarEstadoGre(greId: string, tenantId: string): Promise<any> {
    try {
      console.log(`🔍 [GRE] Consultando estado de GRE ${greId} en SUNAT...`);

      // Obtener datos de la GRE
      const { data: greData, error } = await this.supabaseService.getClient()
        .from('gre_guias')
        .select('numero, numero_sunat')
        .eq('id', greId)
        .eq('tenant_id', tenantId)
        .single();

      if (error || !greData) {
        throw new Error('GRE no encontrada');
      }

      const { data: empresaConfig, error: empresaError } = await this.supabaseService.getClient()
        .from('empresa_config')
        .select('ruc, sunat_gre_transport')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (empresaError) {
        throw new Error(`No se pudo obtener RUC emisor para GRE: ${empresaError.message}`);
      }

      const rucEmisor = (empresaConfig as any)?.ruc;
      if (!rucEmisor) {
        throw new Error('RUC emisor requerido para consultar GRE en SUNAT');
      }

      let response: Awaited<ReturnType<OseService['consultarEstadoCpe']>>;
      if ((empresaConfig as any)?.sunat_gre_transport === 'rest' && greData.numero_sunat) {
        response = await this.oseService.consultarTicketGre(greData.numero_sunat, { tenantId });
      } else {
        const [serie, numero] = String(greData.numero || '').split('-');
        if (!serie || !numero) {
          throw new Error(`Número GRE inválido para consulta SUNAT: ${greData.numero}`);
        }

        response = await this.oseService.consultarEstadoCpe(
          rucEmisor,
          '09',
          serie,
          numero,
          { tenantId },
        );
      }

      // Actualizar estado en BD si es necesario
      if (response.success) {
        await this.supabaseService.update(
          'gre_guias',
          {
            estado: 'ACEPTADO',
            sunat_status: this.sunatStatuses.ACCEPTED,
            cdr_sunat: response.cdr || 'CDR_RECEIVED',
            updated_at: new Date().toISOString()
          },
          { id: greId }
        );
      } else {
        await this.supabaseService.update(
          'gre_guias',
          {
            sunat_status: this.sunatStatuses.REJECTED,
            error_message: `${response.codigoRespuesta}: ${response.descripcionRespuesta}`,
            updated_at: new Date().toISOString()
          },
          { id: greId }
        );
      }

      return {
        id: greId,
        estado: response.success ? 'ACEPTADO' : 'PENDIENTE',
        codigoSunat: response.codigoRespuesta,
        descripcionSunat: response.descripcionRespuesta,
        timestamp: new Date()
      };

    } catch (error) {
      console.error(`❌ [GRE] Error consultando estado de GRE ${greId}:`, error);
      await this.supabaseService.update(
        'gre_guias',
        {
          sunat_status: this.sunatStatuses.ERROR,
          error_message: `Error consultando estado: ${error.message}`,
          updated_at: new Date().toISOString()
        },
        { id: greId }
      );
      return {
        id: greId,
        estado: 'ERROR',
        mensaje: `Error consultando estado: ${error.message}`,
        timestamp: new Date()
      };
    }
  }

  private async generarNumeroCorrelativo(tenantId: string): Promise<string> {
    try {
      // Obtener el último número usado
      const { data, error } = await this.supabaseService.getClient()
        .from('gre_guias')
        .select('serie, correlativo')
        .eq('tenant_id', tenantId)
        .order('correlativo', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error obteniendo último número:', error);
        return 'T001-00000001'; // Número inicial si hay error
      }

      if (!data || data.length === 0) {
        return 'T001-00000001'; // Primer número
      }

      const serie = data[0].serie || 'T001';
      const correlativoActual = Number(data[0].correlativo || 0);
      const siguienteNumero = correlativoActual + 1 || 1;
      return `${serie}-${siguienteNumero.toString().padStart(8, '0')}`;
    } catch (error) {
      console.error('Error generando número correlativo:', error);
      return 'T001-00000001';
    }
  }

  private extractSerieYCorrelativo(numeroCompleto: string): { serie: string; correlativo: number } {
    const [serieRaw, correlativoRaw] = (numeroCompleto || '').split('-');
    const serie = serieRaw && serieRaw.trim().length > 0 ? serieRaw.trim().toUpperCase() : 'T001';
    const correlativoNumber = Number(correlativoRaw ?? '0');
    const correlativo = Number.isFinite(correlativoNumber) && correlativoNumber > 0 ? correlativoNumber : 0;
    return { serie, correlativo };
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
      const stats = {
        total: guias.length,
        estados: guias.reduce((acc, guia) => {
          acc[guia.estado] = (acc[guia.estado] || 0) + 1;
          return acc;
        }, {}),
        pesoTotal: guias.reduce((sum, guia) => sum + (guia.peso_total || 0), 0),
        tendencia: this.calcularTendenciaSemanal(guias)
      };

      console.log('📊 Estadísticas GRE:', stats);
      return stats;
    } catch (error) {
      console.error('Error calculando estadísticas GRE:', error);
      return {
        total: 0,
        estados: {},
        pesoTotal: 0,
        tendencia: []
      };
    }
  }

  private calcularTendenciaSemanal(guias: any[]): any[] {
    // Agrupar por semanas los últimos 7 días
    const ahora = new Date();
    const semanaAtras = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);

    const guiasSemana = guias.filter(guia =>
      new Date(guia.created_at) >= semanaAtras
    );

    const tendencia = [];
    for (let i = 6; i >= 0; i--) {
      const fecha = new Date(ahora.getTime() - i * 24 * 60 * 60 * 1000);
      const fechaStr = fecha.toISOString().split('T')[0];

      const guiasDia = guiasSemana.filter(guia =>
        guia.created_at.split('T')[0] === fechaStr
      );

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

      // Calculate estimated weight
      const pesoEstimado = this.calcularPesoEstimado(saleData.productos || [], saleData.total);
      const modalidad = saleData.modalidad || 'TRANSPORTE_PUBLICO';

      // Prepare GRE data
      const greData: CreateGuiaRemisionDto = {
        destinatario: saleData.clienteNombre || `Cliente ${saleData.clienteId}`,
        direccionDestino: saleData.clienteDireccion!,
        fechaTraslado: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
        modalidad,
        motivo: 'VENTA',
        pesoTotal: pesoEstimado,
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

      // Update GRE to mark as automatic and link to sale
      await this.supabaseService.getClient()
        .from('gre_guias')
        .update({
          es_automatica: true,
          venta_id: saleId,
          motivo_creacion: 'AUTO_THRESHOLD',
        })
        .eq('id', gre.id);

      // Link GRE with inventory movement
      await this.linkGREWithInventory(gre.id, saleId, saleData.tenantId, {
        productos: saleData.productos,
        total: saleData.total,
      });

      console.log(`✅ [GRE] Automatic GRE created successfully: ${gre.numero} for sale ${saleId}`);

      return gre;
    } catch (error) {
      console.error(`❌ [GRE] Error creating automatic GRE for sale ${saleId}:`, error);
      throw error;
    }
  }

  private assertAutoGreSaleDataValida(saleData: {
    clienteNombre?: string;
    clienteDireccion?: string;
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
   * Link GRE with inventory movement
   * Requirements: 2.3, 2.6
   */
  async linkGREToInventoryMovement(greId: string, movementId: string): Promise<void> {
    try {
      console.log(`🚚 [GRE] Linking GRE ${greId} to inventory movement ${movementId}`);

      const { error } = await this.supabaseService.getClient()
        .from('gre_guias')
        .update({
          movimiento_inventario_id: movementId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', greId);

      if (error) {
        console.error(`❌ [GRE] Error linking GRE to inventory movement:`, error);
        throw error;
      }

      console.log(`✅ [GRE] GRE ${greId} linked to inventory movement ${movementId}`);
    } catch (error) {
      console.error(`❌ [GRE] Error linking GRE to inventory movement:`, error);
      throw error;
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
        umbralGREAutomatico: data?.umbral_gre_automatico || 700.0,
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

  /**
   * Find or create inventory movement for a sale
   * Requirements: 2.3, 2.6
   */
  async findOrCreateInventoryMovement(
    saleId: string,
    tenantId: string,
    saleData?: {
      productos?: any[];
      total?: number;
    }
  ): Promise<string | null> {
    try {
      console.log(`🚚 [GRE] Finding canonical inventory movement for sale ${saleId}`);

      // First, try to find existing inventory movement for this sale
      const { data: existingMovement, error: findError } = await this.supabaseService.getClient()
        .from('movimientos_inventario')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('referencia_id', saleId)
        .in('referencia_tipo', ['VENTA_POS', 'VENTA'])
        .eq('tipo', 'SALIDA')
        .limit(1)
        .maybeSingle();

      if (existingMovement && !findError) {
        console.log(`✅ [GRE] Found existing inventory movement: ${existingMovement.id}`);
        return existingMovement.id;
      }

      // GRE no crea stock: la venta física debe haberlo hecho atómicamente.
      // Inventar aquí un almacén causaría un segundo descuento.
      console.warn(`⚠️ [GRE] No canonical inventory movement found for sale ${saleId}`);
      return null;
    } catch (error) {
      console.error(`❌ [GRE] Error finding/creating inventory movement:`, error);
      return null;
    }
  }

  /**
   * Link GRE with inventory movement and update GRE record
   * Requirements: 2.3, 2.6
   */
  async linkGREWithInventory(
    greId: string,
    saleId: string,
    tenantId: string,
    saleData?: {
      productos?: any[];
      total?: number;
    }
  ): Promise<void> {
    try {
      console.log(`🚚 [GRE] Linking GRE ${greId} with inventory for sale ${saleId}`);

      // Find or create inventory movement
      const movementId = await this.findOrCreateInventoryMovement(saleId, tenantId, saleData);

      if (movementId) {
        // Link GRE to inventory movement
        await this.linkGREToInventoryMovement(greId, movementId);
        console.log(`✅ [GRE] GRE ${greId} linked to inventory movement ${movementId}`);
      } else {
        console.warn(`⚠️ [GRE] Could not link GRE ${greId} to inventory - no movement found/created`);
      }
    } catch (error) {
      console.error(`❌ [GRE] Error linking GRE with inventory:`, error);
      // Don't throw - this is not critical for GRE creation
    }
  }
}
