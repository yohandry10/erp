import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { CpeService } from '../../cpe/cpe.service';
import { ValidationService } from '../../validations/validation.service';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';
import { CreateFacturaDto, TipoDocumento, ItemFacturaDto } from '@erp-suite/dtos';
import { PedidoVenta, PedidoDetalle } from './entities';
import { IntegrationAlertsService } from '../../notifications/integration-alerts.service';

/**
 * CPEIntegrationService
 * Servicio para integrar el módulo de Pedidos con el módulo CPE
 * Requirements: 10.2, 10.3, 10.6, 10.7, 15.3, 15.5, 19.5, 19.6, 19.7, 19.8, 19.9, 19.10
 */
@Injectable()
export class CPEIntegrationService {
  private readonly logger = new Logger(CPEIntegrationService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly cpeService: CpeService,
    private readonly validationService: ValidationService,
    private readonly integrationAlerts: IntegrationAlertsService,
    private readonly taxCalculator: TaxCalculatorService,
  ) {}

  /**
   * Genera una factura desde un pedido
   * Requirements: 10.2, 10.3, 10.6, 10.7
   */
  async generarFacturaDesdePedido(
    pedido: PedidoVenta & { detalle: PedidoDetalle[] },
    tenantId: string,
    idempotencyKey?: string,
  ): Promise<{
    factura_id: string;
    estado: string;
    warnings?: string[];
    serie?: string;
    numero?: number;
    moneda?: string;
    fecha_emision?: string;
    total: number;
    documento_id?: string | null;
    cpe_id?: string;
  }> {
    this.logger.log(`Generando factura desde pedido ${pedido.id}`);

    const startedAt = Date.now();

    try {
      // 1. Validar que no supere 999 items (Requirement 15.3, 19.5)
      if (pedido.detalle.length > 999) {
        throw new BadRequestException({
          message: 'No se puede generar factura: El pedido supera el límite de 999 ítems permitidos por SUNAT',
          code: 'MAX_ITEMS_EXCEEDED',
          details: {
            items_count: pedido.detalle.length,
            max_allowed: 999,
          },
        });
      }

      // 2. Validar certificado digital vigente (Requirement 15.5, 19.6, 19.7)
      const certificateValidation = await this.validationService.validateCertificate(tenantId);
      if (!certificateValidation.isValid) {
        this.logger.error(`Certificado inválido para tenant ${tenantId}: ${certificateValidation.errors.join(', ')}`);
        throw new BadRequestException({
          message: 'No se puede generar factura: Certificado digital inválido o vencido',
          code: 'CERT_VALIDATION_FAILED',
          errors: certificateValidation.errors,
        });
      }

      // Log warnings del certificado (ej: próximo a vencer)
      if (certificateValidation.warnings.length > 0) {
        this.logger.warn(`Advertencias del certificado: ${certificateValidation.warnings.join(', ')}`);
      }

      // 3. Obtener datos del cliente
      const cliente = await this.obtenerCliente(pedido.cliente_id, tenantId);

      // 4. Obtener configuración de la empresa
      const empresaConfig = await this.obtenerEmpresaConfig(tenantId);

      // 5. Mapear datos de pedido a formato CPE (Requirement 10.2)
      const facturaData = await this.mapearPedidoACPE(pedido, cliente, empresaConfig);

      // HARDENING: dedupe de reintentos (ventas→CPE) con una llave estable por pedido.
      if (idempotencyKey && !(facturaData as any).idempotency_key) {
        (facturaData as any).idempotency_key = String(idempotencyKey).trim();
      }

      // 6. Llamar a CPEService para generar XML/UBL 2.1, QR, hash, PDF (Requirement 10.3, 19.8)
      this.logger.log('Llamando a CPEService para crear factura');
      const factura = await this.cpeService.create(facturaData, tenantId);
      const documentoId = (factura as any).documento_id ?? (factura as any).documentoId ?? null;

      this.logger.log(`✅ Factura generada exitosamente: ${factura.id}`);

      // 7. Manejar respuestas de SUNAT (Requirement 10.7, 19.9, 19.10)
      const resultado = this.procesarRespuestaSUNAT(factura);

      const durationMs = Date.now() - startedAt;

      await this.registrarExitoIntegracion({
        pedidoId: pedido.id,
        tenantId,
        facturaId: factura.id ?? null,
        durationMs,
        responseSummary: {
          serie: factura.serie ?? facturaData.serie,
          numero: factura.numero ?? facturaData.numero,
          estado: resultado.estado,
        },
      });

      return {
        factura_id: factura.id,
        cpe_id: factura.id,
        estado: resultado.estado,
        warnings: resultado.warnings,
        serie: factura.serie ?? facturaData.serie,
        numero: factura.numero ?? facturaData.numero,
        moneda: factura.moneda ?? facturaData.moneda ?? 'PEN',
        fecha_emision: (factura as any).fecha_emision ?? new Date().toISOString().split('T')[0],
        total: factura.total_venta ?? facturaData.total_venta,
        documento_id: documentoId,
      };
    } catch (error) {
      this.logger.error(`Error generando factura desde pedido ${pedido.id}:`, error);
      const durationMs = Date.now() - startedAt;

      // Registrar error para reintentos (Requirement 19.10)
      await this.registrarErrorIntegracion({
        pedidoId: pedido.id,
        tenantId,
        errorMessage: error?.message ?? 'Error desconocido generando factura',
        durationMs,
      });
      
      throw error;
    }
  }

  /**
   * Mapea datos del pedido al formato CPE
   * Requirements: 10.2, 15.3
   */
  private async mapearPedidoACPE(
    pedido: PedidoVenta & { detalle: PedidoDetalle[] },
    cliente: any,
    empresaConfig: any,
  ): Promise<CreateFacturaDto> {
    // Obtener serie y número de factura
    const { serie, numero } = await this.obtenerSerieYNumero(pedido.tenant_id);

    // ✅ CORRECCIÓN SRP: Obtener tasa de IGV una sola vez usando TaxCalculatorService
    const tasaIgv = await this.taxCalculator.getTasaIgv(pedido.tenant_id);

    // Mapear items del pedido a items de factura
    const items: ItemFacturaDto[] = pedido.detalle.map((item) => {
      const cantidad = Number(item.cantidad ?? 0);
      const precioUnitario = Number(item.precio_unitario ?? 0);
      const valorVenta = Number(item.subtotal ?? cantidad * precioUnitario);
      const igv = valorVenta * tasaIgv;
      const precioVenta = valorVenta + igv;

      return {
        codigo: item.producto_id.substring(0, 8), // Código simplificado
        descripcion: item.descripcion,
        cantidad,
        unidad: 'NIU', // Unidad por defecto (SUNAT)
        precio_unitario: precioUnitario,
        valor_venta: valorVenta,
        igv,
        precio_venta: precioVenta,
      };
    });

    const numeroDocumentoCliente = ((
      cliente.documento_numero ??
      cliente.numero_documento ??
      cliente.documento ??
      ''
    )
      ?.toString()
      .trim()) || null;

    if (!numeroDocumentoCliente) {
      throw new BadRequestException({
        message: 'El cliente seleccionado no tiene un documento tributario configurado',
        code: 'CLIENTE_SIN_DOCUMENTO',
      });
    }

    const tipoDocumentoSunat = this.mapearTipoDocumentoSunat(cliente.documento_tipo);
    const razonSocialCliente = cliente.razon_social || cliente.nombre_comercial;

    if (!razonSocialCliente) {
      throw new BadRequestException({
        message: 'El cliente no tiene una razón social configurada',
        code: 'CLIENTE_SIN_RAZON_SOCIAL',
      });
    }

    // Construir DTO de factura
    const facturaDto: CreateFacturaDto = {
      serie: serie,
      numero: numero,
      tipo_documento: TipoDocumento.FACTURA,
      ruc_emisor: empresaConfig.ruc,
      razon_social_emisor: empresaConfig.razon_social,
      tipo_documento_receptor: tipoDocumentoSunat,
      documento_receptor: numeroDocumentoCliente,
      razon_social_receptor: razonSocialCliente,
      direccion_receptor: cliente.direccion || 'DIRECCIÓN NO REGISTRADA',
      moneda: 'PEN', // Por ahora solo soles
      items: items,
      total_gravadas: Number(pedido.subtotal ?? 0),
      total_igv: Number(pedido.igv ?? 0),
      total_venta: Number(pedido.total ?? 0),
    };

    return facturaDto;
  }

  /**
   * Procesa la respuesta de SUNAT
   * Requirements: 10.7, 19.9, 19.10
   */
  private procesarRespuestaSUNAT(factura: any): { estado: string; warnings: string[] } {
    const warnings: string[] = [];

    // Estados posibles: FIRMADO, ENVIADO, ACEPTADO, RECHAZADO
    switch (factura.estado) {
      case 'ACEPTADO':
        this.logger.log(`✅ Factura ${factura.id} aceptada por SUNAT`);
        return { estado: 'ACEPTADO', warnings };

      case 'FIRMADO':
        // Factura firmada pero no enviada a SUNAT todavía
        warnings.push('La factura fue firmada pero debe ser enviada manualmente a SUNAT desde el módulo CPE');
        this.logger.warn(`⚠️ Factura ${factura.id} firmada, pendiente de envío a SUNAT`);
        return { estado: 'FIRMADO', warnings };

      case 'ENVIADO':
        warnings.push('La factura fue enviada a SUNAT y está pendiente de respuesta');
        this.logger.log(`📤 Factura ${factura.id} enviada a SUNAT, esperando respuesta`);
        return { estado: 'ENVIADO', warnings };

      case 'RECHAZADO':
        this.logger.error(`❌ Factura ${factura.id} rechazada por SUNAT: ${factura.error_message}`);
        throw new BadRequestException({
          message: 'La factura fue rechazada por SUNAT',
          code: 'FACTURA_RECHAZADA',
          details: {
            error_sunat: factura.error_message,
          },
        });

      default:
        warnings.push(`Estado desconocido: ${factura.estado}`);
        return { estado: factura.estado, warnings };
    }
  }

  /**
   * Obtiene datos del cliente
   */
  private async obtenerCliente(clienteId: string, tenantId: string): Promise<any> {
    const { data: cliente, error } = await this.supabase.getClient()
      .from('clientes')
      .select(
        `
          id,
          tenant_id,
          tipo,
          documento_tipo,
          documento_numero:numero_documento,
          razon_social,
          nombre_comercial,
          direccion,
          email,
          telefono,
          limite_credito,
          permite_morosidad
        `,
      )
      .eq('id', clienteId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !cliente) {
      throw new BadRequestException('Cliente no encontrado');
    }

    return cliente;
  }

  private mapearTipoDocumentoSunat(tipo?: string | null): string {
    if (!tipo) {
      return '0';
    }

    const normalizado = tipo.toString().trim().toUpperCase();

    // Si ya viene con código SUNAT (numérico) lo respetamos
    if (/^\d+$/.test(normalizado) && normalizado.length <= 2) {
      return normalizado;
    }

    const map: Record<string, string> = {
      RUC: '6',
      DNI: '1',
      CE: '4',
      CARNET_EXTRANJERIA: '4',
      PASAPORTE: '7',
      PTP: '4',
    };

    return map[normalizado] ?? '0';
  }

  /**
   * Obtiene configuración de la empresa
   */
  private async obtenerEmpresaConfig(tenantId: string): Promise<any> {
    const { data: config, error } = await this.supabase.getClient()
      .from('empresa_config')
      .select('ruc, razon_social, serie_factura, ultimo_numero_factura')
      .eq('tenant_id', tenantId)
      .single();

    if (error || !config) {
      throw new BadRequestException('Configuración de empresa no encontrada');
    }

    if (!config.ruc || !config.razon_social) {
      throw new BadRequestException({
        message: 'Configuración de empresa incompleta',
        code: 'RUC_VALIDATION_FAILED',
        details: {
          missing_fields: [
            !config.ruc && 'ruc',
            !config.razon_social && 'razon_social',
          ].filter(Boolean),
        },
      });
    }

    return config;
  }

  /**
   * Obtiene serie y número de factura
   */
  private async obtenerSerieYNumero(tenantId: string): Promise<{ serie: string; numero: number }> {
    const { data: config, error } = await this.supabase.getClient()
      .from('empresa_config')
      .select('serie_factura, ultimo_numero_factura')
      .eq('tenant_id', tenantId)
      .single();

    if (error || !config) {
      throw new BadRequestException('No se pudo obtener la serie de factura');
    }

    const serie = config.serie_factura || 'F001';
    const numero = (config.ultimo_numero_factura || 0) + 1;

    // Actualizar correlativo
    await this.supabase.getClient()
      .from('empresa_config')
      .update({ ultimo_numero_factura: numero, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId);

    return { serie, numero };
  }

  private async registrarExitoIntegracion(options: {
    pedidoId: string;
    tenantId: string;
    facturaId: string | null;
    durationMs: number;
    responseSummary?: Record<string, unknown>;
  }): Promise<void> {
    const { pedidoId, tenantId, facturaId, durationMs, responseSummary } = options;

    await this.integrationAlerts.recordSuccess({
      tenantId,
      servicio: 'CPE',
      operacion: 'GENERAR_FACTURA',
      correlacionId: pedidoId,
      correlacionTipo: 'PEDIDO',
      statusCode: 200,
      durationMs,
      responseSummary: responseSummary ?? null,
      metadata: facturaId ? { factura_id: facturaId } : null,
    });
  }

  /**
   * Registra errores de integración para auditoría y reintentos
   * Requirements: 19.10
   */
  private async registrarErrorIntegracion(options: {
    pedidoId: string;
    tenantId: string;
    errorMessage: string;
    durationMs: number;
  }): Promise<void> {
    const { pedidoId, tenantId, errorMessage, durationMs } = options;

    await this.integrationAlerts.recordError({
      tenantId,
      servicio: 'CPE',
      operacion: 'GENERAR_FACTURA',
      correlacionId: pedidoId,
      correlacionTipo: 'PEDIDO',
      errorMessage,
      durationMs,
      metadata: {
        source: 'CPEIntegrationService',
      },
    });
  }
}
