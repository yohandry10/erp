import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CpeService } from '../cpe/cpe.service';
import { ValidationService } from '../validations/validation.service';
import { ConfigurationService } from '../configuracion/configuration.service';
import { EventBusService } from '../../shared/events/event-bus.service';
import { InventoryIntegrationService } from '../../shared/integration/inventory-integration.service';
import { CxcService } from '../finanzas/cxc/cxc.service';
import { TaxCalculatorService } from '../../shared/utils/tax-calculator';
import { v4 as uuidv4 } from 'uuid';
import { TenantContextService } from '../../shared/tenant/tenant-context.service';
import * as crypto from 'crypto';
import Decimal from 'decimal.js';

@Injectable()
export class PosService {
  private readonly logger = new Logger(PosService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly tenantContext: TenantContextService,
    private readonly cpeService: CpeService,
    private readonly validationService: ValidationService,
    private readonly configurationService: ConfigurationService,
    private readonly eventBus: EventBusService,
    private readonly inventoryIntegration: InventoryIntegrationService,
    private readonly cxcService: CxcService,
    private readonly taxCalculator: TaxCalculatorService,
  ) { }

  private getCertKey(): Buffer {
    const key = process.env.CERT_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
    if (!key || key.length < 32) {
      throw new Error('CERT_ENCRYPTION_KEY no configurada o demasiado corta (min 32 chars)');
    }
    return crypto.createHash('sha256').update(key).digest(); // 32 bytes
  }

  private encryptBuffer(data: Buffer): Buffer {
    const iv = crypto.randomBytes(12);
    const key = this.getCertKey();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]); // iv(12) + tag(16) + data
  }

  private encryptText(text: string): string {
    const iv = crypto.randomBytes(12);
    const key = this.getCertKey();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  /**
   * Normaliza el método de pago a su metadata para evitar depender de strings "efectivo"/"tarjeta"
   */
  private async getMetodoPagoInfo(metodo: string | null | undefined, tenantId: string) {
    const normalized = (metodo || '').toString().trim().toLowerCase();

    // Atajos para literales comunes
    if (!normalized) {
      return { tipo: 'EFECTIVO', codigo: 'efectivo' };
    }
    if (['efectivo', 'cash', 'cash_id', 'efectivo_id'].includes(normalized)) {
      return { tipo: 'EFECTIVO', codigo: normalized };
    }
    if (['tarjeta', 'card', 'card_id', 'tarjeta_id'].includes(normalized)) {
      return { tipo: 'TARJETA', codigo: normalized };
    }

    // Buscar en catálogo de métodos de pago por id o código
    const { data: metodoPago, error } = await this.supabase.getClient()
      .from('metodos_pago')
      .select('id, codigo, tipo')
      .or(`id.eq.${normalized},codigo.eq.${normalized}`)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      this.logger.warn(`⚠️ No se pudo resolver método de pago ${metodo}: ${error.message}`);
    }

    const codigo = metodoPago?.codigo?.toLowerCase() || normalized;
    const tipo = metodoPago?.tipo?.toUpperCase() || 'EFECTIVO';
    return { tipo, codigo };
  }

  private async runWithTenantContext<T>(user: any, operation: () => Promise<T>): Promise<T> {
    if (!user?.tenant_id) {
      this.logger.error('❌ [POS] Usuario sin tenant_id al intentar ejecutar operación POS');
      throw new Error('Tenant no identificado en la sesión POS');
    }

    const existing = this.tenantContext.getContext();
    if (existing?.tenantId === user.tenant_id) {
      await this.supabase.prepareTenantContext();
      return operation();
    }

    return await this.tenantContext.run(
      {
        tenantId: user.tenant_id,
        userId: user.id ?? null,
        supabaseAccessToken: null,
        isSuperAdmin: user.is_super_admin ?? false,
      },
      async () => {
        await this.supabase.prepareTenantContext();
        return operation();
      },
    );
  }

  async getProductos(user: any) {
    return this.runWithTenantContext(user, async () => {
      try {
        this.logger.log(`Obteniendo productos POS para tenant: ${user.tenant_id}`);

        const { data, error } = await this.supabase.getClient()
          .from('vista_pos_productos')
          .select('*')
          .eq('activo', true)
          .order('nombre', { ascending: true });

        if (error) {
          this.logger.error('Error en query vista_pos_productos:', error);
          throw error;
        }

        this.logger.log(`Productos POS encontrados: ${data?.length || 0}`);

        return {
          success: true,
          data: data || [],
        };
      } catch (error) {
        this.logger.error('Error obteniendo productos POS:', error);
        throw error;
      }
    });
  }

  async getClientes(user: any) {
    return this.runWithTenantContext(user, async () => {
      try {
        const { data, error } = await this.supabase.getClient()
          .from('clientes')
          .select('*')
          .eq('tenant_id', user.tenant_id)
          .eq('activo', true)
          .order('razon_social', { ascending: true });

        if (error) throw error;

        return {
          success: true,
          data: data || [],
        };
      } catch (error) {
        this.logger.error('Error obteniendo clientes POS:', error);
        throw error;
      }
    });
  }

  async getMetodosPago(user: any) {
    return this.runWithTenantContext(user, async () => {
      try {
        const { data, error } = await this.supabase.getClient()
          .from('metodos_pago')
          .select('*')
          .eq('tenant_id', user.tenant_id)
          .eq('activo', true)
          .order('nombre', { ascending: true });

        if (error) throw error;

        return {
          success: true,
          data: data || [],
        };
      } catch (error) {
        this.logger.error('Error obteniendo métodos de pago POS:', error);
        throw error;
      }
    });
  }

  async getEmpresaConfig(user: any) {
    return this.runWithTenantContext(user, async () => {
      try {
        const { data, error } = await this.supabase.getClient()
          .from('empresa_config')
          .select('*')
          .eq('tenant_id', user.tenant_id)
          .maybeSingle();

        if (error) throw error;

        return {
          success: true,
          data: data ?? null,
        };
      } catch (error) {
        this.logger.error('Error obteniendo configuración de empresa para POS:', error);
        return { success: true, data: null };
      }
    });
  }

  async getSesionCajaActual(user: any) {
    return this.runWithTenantContext(user, async () => {
      try {
        const hoy = new Date().toISOString().split('T')[0];

        const { data, error } = await this.supabase.getClient()
          .from('sesiones_caja')
          .select('*')
          .eq('tenant_id', user.tenant_id)
          .eq('usuario_id', user.id)
          .gte('fecha_apertura', `${hoy}T00:00:00`)
          .lte('fecha_apertura', `${hoy}T23:59:59`)
          .is('fecha_cierre', null)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error;

        return {
          success: true,
          data: data ?? null,
        };
      } catch (error) {
        this.logger.error('Error obteniendo sesión de caja POS:', error);
        return {
          success: false,
          data: null,
          message: error.message || 'Error obteniendo sesión de caja',
        };
      }
    });
  }

  async getVentasRecientes(user: any) {
    return this.runWithTenantContext(user, async () => {
      try {
        const { data, error } = await this.supabase.getClient()
          .from('ventas_pos')
          .select('*')
          .eq('tenant_id', user.tenant_id)
          .order('fecha', { ascending: false })
          .limit(50);

        if (error) throw error;

        return {
          success: true,
          data: data || [],
        };
      } catch (error) {
        this.logger.error('Error obteniendo ventas recientes POS:', error);
        return {
          success: false,
          data: [],
          message: error.message || 'Error obteniendo ventas recientes',
        };
      }
    });
  }

  async procesarVenta(ventaData: any, user: any) {
    return this.runWithTenantContext(user, () => this.procesarVentaInternal(ventaData, user));
  }

  private async procesarVentaInternal(ventaData: any, user: any) {
    const productLocks: string[] = [];
    const items = Array.isArray(ventaData?.items) ? ventaData.items : [];
    try {
      this.logger.log('Procesando venta:', JSON.stringify(ventaData, null, 2));

      // ===== PRE-SALE VALIDATIONS =====
      this.logger.log(`Starting pre-sale validations for tenant: ${user.tenant_id}`);

      // Idempotencia obligatoria
      if (!ventaData.idempotency_key) {
        return {
          success: false,
          message: 'Falta idempotency_key para procesar la venta',
        };
      }

      // Lock por tenant + idempotency y, si existe, sesión de caja para evitar colisiones concurrentes
      const lockKey = [
        user.tenant_id,
        ventaData.sesion_caja_id || null,
        ventaData.idempotency_key || 'venta'
      ].filter(Boolean).join(':');

      // Acquire advisory lock principal (tenant + sesion + idempotency)
      await this.supabase.getClient().rpc('acquire_pos_lock', {
        p_tenant_id: user.tenant_id,
        p_lock_key: lockKey,
      });

      // Acquire per-product locks (ordenados para evitar deadlocks)
      const productIds = Array.from(new Set(items.map((i: any) => i.producto_id).filter(Boolean))).sort();
      for (const pid of productIds) {
        const key = `product:${pid}`;
        await this.supabase.getClient().rpc('acquire_pos_lock', {
          p_tenant_id: user.tenant_id,
          p_lock_key: key,
        });
        productLocks.push(key);
      }

      // Idempotencia: si ya existe evento/venta, retornar
      if (ventaData.idempotency_key) {
        const { data: existingEvent } = await this.supabase.getClient()
          .from('outbox_events')
          .select('aggregate_id')
          .eq('idempotency_key', ventaData.idempotency_key)
          .eq('aggregate_type', 'venta_pos')
          .maybeSingle();

        if (existingEvent?.aggregate_id) {
          const { data: ventaExistente } = await this.supabase.getClient()
            .from('ventas_pos')
            .select('id, numero_ticket, estado, total, subtotal, impuestos')
            .eq('id', existingEvent.aggregate_id)
            .maybeSingle();

          if (ventaExistente) {
            this.logger.log(`♻️ [POS] Venta ya procesada por idempotency_key ${ventaData.idempotency_key}`);
            return {
              success: true,
              venta_id: ventaExistente.id,
              numero_ticket: ventaExistente.numero_ticket,
              estado: ventaExistente.estado,
              total: ventaExistente.total,
              subtotal: ventaExistente.subtotal,
              impuestos: ventaExistente.impuestos,
              message: 'Venta ya procesada (idempotente)',
            };
          }
        }
      }

      // Validaciones mínimas de entrada antes de tocar la BD
      if (!items.length) {
        return {
          success: false,
          message: 'No se puede completar la venta: se requieren items',
        };
      }

      if (!ventaData?.cliente_documento || String(ventaData.cliente_documento).trim().length === 0) {
        return {
          success: false,
          message: 'No se puede completar la venta: documento del cliente faltante',
        };
      }
      if (!ventaData?.cliente_nombre || String(ventaData.cliente_nombre).trim().length === 0) {
        return {
          success: false,
          message: 'No se puede completar la venta: nombre del cliente faltante',
        };
      }

      // Validar config de empresa antes de crear venta (hard-stop CPE)
      const { data: empresaCfg, error: empresaCfgErr } = await this.supabase.getClient()
        .from('empresa_config')
        .select('ruc, razon_social')
        .eq('tenant_id', user.tenant_id)
        .single();
      if (empresaCfgErr) {
        this.logger.error('❌ Error obteniendo empresa_config:', empresaCfgErr);
        throw empresaCfgErr;
      }
      if (!empresaCfg?.ruc || !empresaCfg?.razon_social) {
        return {
          success: false,
          message: 'Configuración de empresa incompleta: falta RUC o razón social',
          error: {
            tipo: 'CONFIG_ERROR',
            codigo: 'EMPRESA_INCOMPLETA',
            mensaje: 'Complete RUC y razón social antes de emitir ventas',
          },
        };
      }

      // Recalcular totales server-side para evitar manipulación de cliente
      const tasaIgv = await this.taxCalculator.getTasaIgv(user.tenant_id);
      const recomputed = items.map((item: any) => {
        const cantidad = Number(item.cantidad ?? 0);
        const precioBase = Number(item.precio_unitario ?? item.precio_original ?? 0);
        // ✅ FIX: Usar Decimal.js para cálculos de descuentos y subtotales
        const descuentoMonto =
          Number(item.descuento_monto ?? 0) > 0
            ? Number(item.descuento_monto)
            : Number(item.descuento_porcentaje ?? 0) > 0
              ? new Decimal(precioBase).times(cantidad).times(Number(item.descuento_porcentaje)).dividedBy(100).toNumber()
              : 0;

        const subtotalItem = new Decimal(precioBase).times(cantidad).minus(descuentoMonto).toDecimalPlaces(2).toNumber();
        const subtotalItemFinal = Math.max(0, subtotalItem);
        return {
          ...item,
          cantidad,
          precio_unitario: precioBase,
          descuento_monto: descuentoMonto,
          subtotal: subtotalItemFinal,
        };
      });

      // ✅ FIX: Usar Decimal.js para sumas y cálculos de impuestos
      const subtotalCalculado = recomputed.reduce(
        (acc, item) => acc.plus(item.subtotal ?? 0),
        new Decimal(0)
      ).toDecimalPlaces(2).toNumber();
      const impuestosCalculados = new Decimal(subtotalCalculado).times(tasaIgv).toDecimalPlaces(2).toNumber();
      const totalCalculado = new Decimal(subtotalCalculado).plus(impuestosCalculados).toDecimalPlaces(2).toNumber();

      // Si los totales del cliente no coinciden, forzar los calculados
      const clienteSubtotal = Number(ventaData.subtotal ?? 0);
      const clienteImpuestos = Number(ventaData.impuestos ?? 0);
      const clienteTotal = Number(ventaData.total ?? 0);
      const descuadre =
        Math.abs(clienteSubtotal - subtotalCalculado) > 0.01 ||
        Math.abs(clienteImpuestos - impuestosCalculados) > 0.01 ||
        Math.abs(clienteTotal - totalCalculado) > 0.01;

      if (descuadre) {
        this.logger.warn(
          `⚠️ Totales de cliente no coinciden. Cliente: ${clienteSubtotal}/${clienteImpuestos}/${clienteTotal} ` +
          `Servidor: ${subtotalCalculado}/${impuestosCalculados}/${totalCalculado}`,
        );
      }

      // Normalizar datos de comprobante para validaciones SUNAT
      const serie = ventaData?.comprobante?.serie || 'T001';
      const correlativo = ventaData?.comprobante?.correlativo || String(Date.now()).slice(-8);
      const tipoDocumento = ventaData?.comprobante?.tipo || '03'; // Boleta por defecto
      const numeroComprobante = ventaData?.numero_comprobante
        || ventaData?.comprobante?.numero
        || `${serie}-${correlativo}`;

      ventaData.comprobante = {
        ...ventaData.comprobante,
        serie,
        correlativo,
        tipo: tipoDocumento,
        numero: numeroComprobante,
      };

      // 1. Validate certificate
      const certificateValidation = await this.validationService.validateCertificate(user.tenant_id);
      if (!certificateValidation.isValid) {
        this.logger.error(`Certificate validation failed: ${certificateValidation.errors.join(', ')}`);
        return {
          success: false,
          message: 'No se puede completar la venta: Certificado digital inválido',
          error: {
            tipo: 'VALIDATION_ERROR',
            codigo: 'CERT_VALIDATION_FAILED',
            mensaje: certificateValidation.errors.join('. '),
            errores: certificateValidation.errors,
          }
        };
      }

      // Log certificate warnings (expiring soon)
      if (certificateValidation.warnings.length > 0) {
        this.logger.warn(`Certificate warnings: ${certificateValidation.warnings.join(', ')}`);
      }

      // 2. Validate RUC configuration
      const rucValidation = await this.validationService.validateRucConfiguration(user.tenant_id);
      if (!rucValidation.isValid) {
        this.logger.error(`RUC validation failed: ${rucValidation.errors.join(', ')}`);
        return {
          success: false,
          message: 'No se puede completar la venta: Configuración de RUC incompleta',
          error: {
            tipo: 'VALIDATION_ERROR',
            codigo: 'RUC_VALIDATION_FAILED',
            mensaje: rucValidation.errors.join('. '),
            errores: rucValidation.errors,
            camposFaltantes: rucValidation.missingFields,
          }
        };
      }

      // 3. Validate sale document (items count, amounts, etc.) - multi-country
      const documentValidation = await this.validationService.validateDocumentBeforeEmission(
        {
          items: recomputed,
          total: totalCalculado,
          serie: ventaData.comprobante?.serie,
          correlativo: ventaData.comprobante?.correlativo?.toString(),
          tipoDocumento: ventaData.comprobante?.tipo,
        },
        user.tenant_id // 🌍 Pasar tenantId para validaciones por país
      );

      if (!documentValidation.isValid) {
        this.logger.error(`Document validation failed: ${documentValidation.errors.length} errors`);
        return {
          success: false,
          message: 'No se puede completar la venta: El documento no cumple con las validaciones SUNAT',
          error: {
            tipo: 'VALIDATION_ERROR',
            codigo: 'DOCUMENT_VALIDATION_FAILED',
            mensaje: documentValidation.errors.map(e => e.message).join('. '),
            errores: documentValidation.errors,
          }
        };
      }

      // Log document warnings
      if (documentValidation.warnings.length > 0) {
        this.logger.warn(`Document warnings: ${documentValidation.warnings.map(w => w.message).join(', ')}`);
      }

      this.logger.log('✅ All pre-sale validations passed');
      // ===== END PRE-SALE VALIDATIONS =====

      // Sesión de caja actual (si existe)
      const sesionActual = await this.getSesionCajaActual(user);
      const sesionCajaId = sesionActual?.success ? sesionActual.data?.id ?? null : null;

      // RPC transaccional: venta + detalles + stock + caja + outbox
      const { data: txData, error: txError } = await this.supabase.getClient()
        .rpc('pos_registrar_venta_tx', {
          p_tenant_id: user.tenant_id,
          p_usuario_id: user.id,
          p_cliente_id: ventaData.cliente_id || null,
          p_cliente_documento: ventaData.cliente_documento,
          p_cliente_nombre: ventaData.cliente_nombre,
          p_metodo_pago: ventaData.metodo_pago_id,
          p_items: recomputed,
          p_serie: ventaData.comprobante?.serie || 'B001',
          p_sesion_caja_id: sesionCajaId,
          p_vendedor: user.email || user.username,
        });

      if (txError || !txData || !Array.isArray(txData) || txData.length === 0) {
        this.logger.error('❌ Error transaccional POS:', txError);
        throw txError || new Error('No se pudo registrar la venta (RPC)');
      }

      const ventaTx = txData[0];
      const ventaResult = {
        id: ventaTx.venta_id,
        numero_ticket: ventaTx.numero_ticket,
        subtotal: ventaTx.subtotal,
        impuestos: ventaTx.impuestos,
        total: ventaTx.total,
        estado: 'PAGADA',
        tenant_id: user.tenant_id,
      };

      this.logger.log('✅ Venta procesada exitosamente:', ventaResult.id);

      // Emitir CPE automáticamente
      let cpeEmitido = false;
      let cpeId = null;
      let cpeData = null;

      try {
        this.logger.log('📄 Emitiendo CPE para venta:', ventaResult.id);

        // Obtener configuración de empresa para datos del emisor
        const { data: empresaData, error: empresaError } = await this.supabase.getClient()
          .from('empresa_config')
          .select('ruc, razon_social')
          .eq('tenant_id', user.tenant_id)
          .single();

        if (empresaError) {
          this.logger.error('❌ Error obteniendo empresa_config:', empresaError);
        }

        if (!empresaData?.ruc || !empresaData?.razon_social) {
          throw new Error('Configuración de empresa incompleta: falta RUC o razón social');
        }

        this.logger.log('✅ Empresa encontrada:', empresaData.razon_social);

        // ✅ FIX: Obtener tasa de IGV una sola vez antes del map
        const tasaIgv = await this.taxCalculator.getTasaIgv(user.tenant_id);

        // Sanitizar documento del receptor
        const docReceptor = (ventaData.cliente_documento || '').toString().trim();
        const tipoDocReceptor = docReceptor.length === 11 ? '6' : '1';

        // Numero CPE seguro
        const numeroCpe = Number(ventaResult.numero_ticket?.split('-')[1]) || Date.now();

        cpeData = {
          tipo_documento: '03' as any, // Boleta
          serie: 'B001',
          numero: numeroCpe,
          ruc_emisor: empresaData.ruc,
          razon_social_emisor: empresaData.razon_social,
          tipo_documento_receptor: tipoDocReceptor,
          documento_receptor: docReceptor,
          razon_social_receptor: ventaData.cliente_nombre,
          direccion_receptor: '',
          moneda: 'PEN',
          total_gravadas: parseFloat(subtotalCalculado.toFixed(2)),
          total_igv: parseFloat(impuestosCalculados.toFixed(2)),
          total_venta: parseFloat(totalCalculado.toFixed(2)),
          items: (recomputed || []).map((item: any) => ({
            cantidad: parseFloat(item.cantidad) || 1,
            codigo_producto: item.producto?.codigo || item.codigo || item.sku || 'PROD',
            descripcion: item.producto?.nombre || item.nombre || item.descripcion || 'Producto',
            unidad_medida: 'NIU',
            precio_unitario: parseFloat(item.precio_unitario) || 0,
            valor_unitario: parseFloat(item.precio_unitario) || 0,
            precio_venta: parseFloat(item.subtotal) || 0,
            valor_venta: parseFloat(item.subtotal) || 0,
            igv: parseFloat(item.subtotal) * tasaIgv || 0,
            total_impuestos: parseFloat(item.subtotal) * tasaIgv || 0,
            total: parseFloat(item.subtotal) * (1 + tasaIgv) || 0
          }))
        };

        this.logger.log('📋 Datos CPE preparados:', JSON.stringify(cpeData, null, 2));

        // Retry/backoff simple para CPE
        let ultimoError: any = null;
        for (let intento = 1; intento <= 3; intento++) {
          try {
            const cpe = await this.cpeService.create(cpeData, user.tenant_id);
            cpeEmitido = true;
            cpeId = cpe.id;
            this.logger.log(`✅ CPE emitido exitosamente en intento ${intento}:`, cpe.id);
            break;
          } catch (err) {
            ultimoError = err;
            this.logger.warn(`⚠️ Error emitiendo CPE (intento ${intento}/3): ${err?.message || err}`);
            if (intento < 3) {
              const delay = 500 * Math.pow(2, intento - 1); // backoff exponencial simple
              await new Promise(res => setTimeout(res, delay));
            }
          }
        }
        if (!cpeEmitido && ultimoError) {
          throw ultimoError;
        }
      } catch (cpeError) {
        this.logger.error('❌ Error completo emitiendo CPE:', cpeError);
        this.logger.error('❌ Stack trace:', cpeError.stack);

        // 🔴 TAREA 12: Registrar venta como pendiente de facturación para reintentos
        await this.registrarVentaPendienteFacturacion(
          ventaResult.id,
          user.tenant_id,
          cpeData,
          cpeError.message || 'Error desconocido al generar CPE'
        );
      }

      // 🔴 CRÍTICO FIX: Si es venta a crédito, crear cuenta por cobrar
      // Se crea después del CPE para tener el CPE ID real (o usar venta.id si falló el CPE)
      const metodoPago = ventaData.metodo_pago_id || 'efectivo';
      const metodoInfoCxC = await this.getMetodoPagoInfo(metodoPago, user.tenant_id);
      const esVentaCredito = metodoInfoCxC.tipo !== 'EFECTIVO' && metodoInfoCxC.tipo !== 'TARJETA';
      let cuentaPorCobrarId: string | null = null;

      if (esVentaCredito) {
        try {
          this.logger.log(`💰 [POS] Venta a crédito detectada (método: ${metodoPago}), creando cuenta por cobrar...`);

          // Obtener cliente: buscar por cliente_id o por documento
          let clienteId: string | null = null;

          if (ventaData.cliente_id) {
            // Verificar que el cliente existe y pertenece al tenant
            const { data: clienteExistente } = await this.supabase.getClient()
              .from('clientes')
              .select('id')
              .eq('id', ventaData.cliente_id)
              .eq('tenant_id', user.tenant_id)
              .maybeSingle();

            if (clienteExistente) {
              clienteId = clienteExistente.id;
            }
          }

          // Si no hay cliente_id, buscar por documento
          if (!clienteId && ventaData.cliente_documento) {
            const { data: clientePorDoc } = await this.supabase.getClient()
              .from('clientes')
              .select('id')
              .eq('numero_documento', ventaData.cliente_documento)
              .eq('tenant_id', user.tenant_id)
              .maybeSingle();

            if (clientePorDoc) {
              clienteId = clientePorDoc.id;
            }
          }

          // Si aún no hay cliente y se requiere crear CxC, no crear CxC sin cliente válido
          if (!clienteId) {
            this.logger.warn(`⚠️ [POS] No se encontró cliente para venta ${ventaResult.id}. No se creará CxC.`);
            this.logger.warn(`⚠️ [POS] Documento cliente: ${ventaData.cliente_documento}, Nombre: ${ventaData.cliente_nombre}`);
            // No crear CxC sin cliente válido
          } else {
            // Obtener configuración para días de vencimiento
            const { data: config } = await this.supabase.getClient()
              .from('empresa_config')
              .select('dias_vencimiento_factura')
              .eq('tenant_id', user.tenant_id)
              .maybeSingle();

            const diasVencimiento = config?.dias_vencimiento_factura || 30;
            const fechaEmision = new Date();
            const fechaVencimiento = new Date();
            fechaVencimiento.setDate(fechaVencimiento.getDate() + diasVencimiento);

            // Preparar datos del CPE para serie y número (usar datos del CPE si se emitió exitosamente)
            const serieCpe = cpeData?.serie || 'B001';
            const numeroCpe =
              cpeData?.numero != null
                ? String(cpeData.numero)
                : ventaResult.numero_ticket?.split('-')[1] || null; // HARDENING: preservar formato del correlativo serializado.

            // Crear FacturaEmitidaEvent para usar el método de CxC
            const facturaEvent = {
              eventId: uuidv4(),
              tenantId: user.tenant_id,
              pedidoId: undefined, // HARDENING: POS puede no tener pedido asociado.
              cpeId: cpeId || ventaResult.id, // Usar CPE ID si existe, sino venta ID
              facturaId: ventaResult.id,
              serie: serieCpe,
              numero: numeroCpe ?? '0',
              clienteId: clienteId,
              subtotal: subtotalCalculado || 0,
              impuestos: impuestosCalculados || 0,
              total: totalCalculado || 0,
              moneda: 'PEN',
              fechaEmision: fechaEmision.toISOString(),
              fechaVencimiento: fechaVencimiento.toISOString(),
              idempotencyKey: `pos:${user.tenant_id}:${ventaResult.id}`,
              source: 'pos',
              ajustes: {
                retencion: 0,
                percepcion: 0,
                detraccion: 0,
                anticipo: 0,
              },
            };

            // Crear cuenta por cobrar usando el servicio
            await this.cxcService.crearCuentaPorCobrarDesdeFactura(facturaEvent as any);

            // Obtener el ID de la cuenta creada
            const { data: cuentaCreada } = await this.supabase.getClient()
              .from('cuentas_por_cobrar')
              .select('id')
              .eq('tenant_id', user.tenant_id)
              .eq('documento_id', cpeId || ventaResult.id)
              .eq('cliente_id', clienteId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (cuentaCreada) {
              cuentaPorCobrarId = cuentaCreada.id;
              this.logger.log(`✅ [POS] Cuenta por cobrar creada: ${cuentaPorCobrarId} para venta ${ventaResult.id}`);
            } else {
              this.logger.warn(`⚠️ [POS] No se pudo obtener ID de cuenta por cobrar creada`);
            }
          }
        } catch (error) {
          this.logger.error('❌ Error creando cuenta por cobrar para venta POS:', error);
          // No bloquear la venta si falla crear CxC
          // La venta ya está procesada y el stock ya se actualizó
        }
      }

      return {
        success: true,
        venta_id: ventaResult.id,
        numero_ticket: ventaResult.numero_ticket,
        estado: ventaResult.estado,
        factura_electronica: cpeEmitido,
        cpe_id: cpeId,
        cuenta_por_cobrar_id: cuentaPorCobrarId,
        message: cpeEmitido
          ? esVentaCredito
            ? 'Venta procesada, CPE emitido y cuenta por cobrar creada'
            : 'Venta procesada y CPE emitido exitosamente'
          : 'Venta procesada (CPE pendiente)'
      };
    } catch (error) {
      this.logger.error('❌ Error procesando venta:', error);
      return {
        success: false,
        message: error.message || 'Error procesando venta',
        error: {
          tipo: 'DATABASE_ERROR',
          mensaje: error.message,
          codigo: error.code,
          detalles: error.details
        }
      };
    } finally {
      try {
        const lockKey = ventaData.idempotency_key || `${user.tenant_id}:venta`;
        await this.supabase.getClient().rpc('release_pos_lock', {
          p_tenant_id: user.tenant_id,
          p_lock_key: lockKey,
        });
        // Liberar locks por producto (solo los adquiridos)
        const productIds = productLocks.length
          ? productLocks.map((key) => key.replace(/^product:/, ''))
          : Array.from(new Set(items.map((i: any) => i.producto_id).filter(Boolean))).sort();
        for (const pid of productIds) {
          await this.supabase.getClient().rpc('release_pos_lock', {
            p_tenant_id: user.tenant_id,
            p_lock_key: `product:${pid}`,
          });
        }
      } catch (unlockErr) {
        this.logger.warn('⚠️ No se pudo liberar el advisory lock POS:', unlockErr);
      }
    }
  }

  async abrirCaja(montoInicial: number, user: any) {
    return this.runWithTenantContext(user, () => this.abrirCajaInternal(montoInicial, user));
  }

  private async abrirCajaInternal(montoInicial: number, user: any) {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('sesiones_caja')
        .insert({
          tenant_id: user.tenant_id,
          usuario_id: user.id,
          monto_inicial: montoInicial,
          total_efectivo: 0,
          total_tarjeta: 0,
          fecha_apertura: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data
      };
    } catch (error) {
      this.logger.error('Error abriendo caja:', error);
      throw error;
    }
  }

  async cerrarCaja(montoContado: number, notas: string, user: any) {
    return this.runWithTenantContext(user, () => this.cerrarCajaInternal(montoContado, notas, user));
  }

  private async cerrarCajaInternal(montoContado: number, notas: string, user: any) {
    try {
      const sesionResult = await this.getSesionCajaActual(user);
      const sesion = sesionResult?.success ? sesionResult.data : null;

      if (!sesion) {
        throw new Error('No hay sesión de caja abierta');
      }

      const { data, error } = await this.supabase.getClient()
        .from('sesiones_caja')
        .update({
          monto_contado: montoContado,
          notas_cierre: notas,
          fecha_cierre: new Date().toISOString()
        })
        .eq('id', sesion.id)
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data
      };
    } catch (error) {
      this.logger.error('Error cerrando caja:', error);
      throw error;
    }
  }

  async getDetallesVenta(ventaId: string, user: any) {
    return this.runWithTenantContext(user, () => this.getDetallesVentaInternal(ventaId, user));
  }

  private async getDetallesVentaInternal(ventaId: string, user: any) {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('detalle_ventas_pos')
        .select('*')
        .eq('venta_id', ventaId)
        .eq('tenant_id', user.tenant_id);

      if (error) throw error;

      return {
        success: true,
        data: data || [],
      };
    } catch (error) {
      this.logger.error('Error obteniendo detalles de venta:', error);
      return {
        success: false,
        data: [],
        message: error.message || 'Error obteniendo detalles de venta',
      };
    }
  }

  async configurarCertificado(certificadoBase64: string, password: string, user: any) {
    return this.runWithTenantContext(user, () => this.configurarCertificadoInternal(certificadoBase64, password, user));
  }

  private async configurarCertificadoInternal(certificadoBase64: string, password: string, user: any) {
    try {
      this.logger.log('📄 Configurando certificado para tenant:', user.tenant_id);

      // Convertir base64 a buffer
      const certificadoBuffer = Buffer.from(certificadoBase64, 'base64');

      // Cifrar certificado y contraseña antes de almacenar
      const certEncrypted = this.encryptBuffer(certificadoBuffer);
      const passEncrypted = this.encryptText(password || '');

      // Guardar en empresa_config (almacenamos cifrado en mismas columnas)
      const { data, error } = await this.supabase.getClient()
        .from('empresa_config')
        .update({
          certificado_pfx: certEncrypted,            // bytes: iv|tag|ciphertext
          certificado_password: passEncrypted,       // base64: iv|tag|ciphertext
          updated_at: new Date().toISOString()
        })
        .eq('tenant_id', user.tenant_id)
        .select()
        .single();

      if (error) {
        this.logger.error('❌ Error guardando certificado:', error);
        throw error;
      }

      this.logger.log('✅ Certificado configurado exitosamente');

      return {
        success: true,
        message: 'Certificado configurado correctamente'
      };
    } catch (error) {
      this.logger.error('❌ Error configurando certificado:', error);
      return {
        success: false,
        message: error.message || 'Error configurando certificado'
      };
    }
  }

  async getConfigurationStatus(user: any) {
    return this.runWithTenantContext(user, () => this.getConfigurationStatusInternal(user));
  }

  private async getConfigurationStatusInternal(user: any) {
    try {
      this.logger.log(`Getting configuration status for tenant: ${user.tenant_id}`);

      const status = await this.configurationService.getConfigurationStatus(user.tenant_id);

      return {
        success: true,
        data: status
      };
    } catch (error) {
      this.logger.error('Error getting configuration status:', error);
      return {
        success: false,
        message: error.message || 'Error obteniendo estado de configuración',
        data: {
          isComplete: false,
          completionPercentage: 0,
          missingItems: ['Error al verificar configuración'],
          certificate: {
            exists: false,
            isValid: false
          },
          ruc: {
            isConfigured: false,
            missingFields: []
          }
        }
      };
    }
  }

  /**
   * 🔴 TAREA 12: Registrar venta como pendiente de facturación
   * Cuando falla la generación del CPE, se registra para reintentos posteriores
   */
  async registrarVentaPendienteFacturacion(
    ventaId: string,
    tenantId: string,
    cpeData: any,
    errorMessage: string
  ): Promise<void> {
    try {
      const { error } = await this.supabase.getClient()
        .from('ventas_pos')
        .update({
          cpe_pendiente: true,
          intentos_facturacion: 1,
          ultimo_intento_facturacion: new Date().toISOString(),
          error_facturacion: errorMessage.substring(0, 500), // Limitar tamaño
          cpe_data: cpeData
        })
        .eq('id', ventaId)
        .eq('tenant_id', tenantId);

      if (error) {
        this.logger.error('❌ Error registrando venta pendiente:', error);
      } else {
        this.logger.warn(`⚠️ Venta ${ventaId} registrada como pendiente de facturación. Error: ${errorMessage}`);
      }
    } catch (err) {
      this.logger.error('❌ Excepción registrando venta pendiente:', err);
    }
  }

  /**
   * 🔴 TAREA 12: Reintentar facturación de una venta POS pendiente
   */
  async reintentarFacturacionVenta(ventaId: string, user: any): Promise<{ success: boolean; cpe_id?: string; message: string }> {
    return this.runWithTenantContext(user, () => this.reintentarFacturacionVentaInternal(ventaId, user));
  }

  private async reintentarFacturacionVentaInternal(ventaId: string, user: any): Promise<{ success: boolean; cpe_id?: string; message: string }> {
    try {
      // Obtener venta pendiente
      const { data: venta, error: ventaError } = await this.supabase.getClient()
        .from('ventas_pos')
        .select('*')
        .eq('id', ventaId)
        .eq('tenant_id', user.tenant_id)
        .eq('cpe_pendiente', true)
        .single();

      if (ventaError || !venta) {
        throw new Error('Venta no encontrada o ya facturada');
      }

      // Verificar máximo de intentos (5 intentos)
      if (venta.intentos_facturacion >= 5) {
        throw new Error('Máximo de reintentos alcanzado (5 intentos). Contacte al administrador.');
      }

      // Obtener datos CPE guardados
      const cpeData = venta.cpe_data || null;
      if (!cpeData) {
        throw new Error('No se encontraron datos del CPE para reintentar');
      }

      // Intentar crear CPE nuevamente
      const cpe = await this.cpeService.create(cpeData, user.tenant_id);

      // Actualizar venta como facturada
      await this.supabase.getClient()
        .from('ventas_pos')
        .update({
          cpe_pendiente: false,
          error_facturacion: null,
          ultimo_intento_facturacion: new Date().toISOString()
        })
        .eq('id', ventaId)
        .eq('tenant_id', user.tenant_id);

      this.logger.log(`✅ Facturación exitosa para venta ${ventaId} en reintento ${venta.intentos_facturacion + 1}`);

      return {
        success: true,
        cpe_id: cpe.id,
        message: 'Facturación completada exitosamente'
      };
    } catch (error) {
      this.logger.error(`❌ Error reintentando facturación para venta ${ventaId}:`, error);

      // Incrementar contador de intentos
      const { data: venta } = await this.supabase.getClient()
        .from('ventas_pos')
        .select('intentos_facturacion')
        .eq('id', ventaId)
        .eq('tenant_id', user.tenant_id)
        .single();

      if (venta) {
        await this.supabase.getClient()
          .from('ventas_pos')
          .update({
            intentos_facturacion: (venta.intentos_facturacion || 0) + 1,
            ultimo_intento_facturacion: new Date().toISOString(),
            error_facturacion: error.message?.substring(0, 500) || 'Error desconocido'
          })
          .eq('id', ventaId)
          .eq('tenant_id', user.tenant_id);
      }

      return {
        success: false,
        message: error.message || 'Error al reintentar facturación'
      };
    }
  }

  /**
   * 🔴 TAREA 12: Obtener ventas pendientes de facturación
   */
  async obtenerVentasPendientesFacturacion(user: any, limit: number = 50): Promise<any[]> {
    return this.runWithTenantContext(user, () => this.obtenerVentasPendientesFacturacionInternal(user, limit));
  }

  private async obtenerVentasPendientesFacturacionInternal(user: any, limit: number = 50): Promise<any[]> {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('ventas_pos')
        .select('id, numero_venta, numero_ticket, cliente_nombre, total, intentos_facturacion, ultimo_intento_facturacion, error_facturacion, fecha')
        .eq('tenant_id', user.tenant_id)
        .eq('cpe_pendiente', true)
        .order('ultimo_intento_facturacion', { ascending: false })
        .limit(limit);

      if (error) {
        this.logger.error('Error obteniendo ventas pendientes:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      this.logger.error('Excepción obteniendo ventas pendientes:', error);
      return [];
    }
  }

  /**
   * 🔴 TAREA 12: Procesar ventas pendientes de facturación (para worker/cron)
   * Procesa ventas pendientes que no han excedido el máximo de intentos
   */
  async procesarVentasPendientesFacturacion(tenantId?: string, limit: number = 10): Promise<{ procesadas: number; errores: number }> {
    // Asegurar contexto de tenant para aislamiento
    if (tenantId) {
      return this.tenantContext.run(
        {
          tenantId,
          userId: null,
          supabaseAccessToken: null,
          isSuperAdmin: true,
        },
        async () => {
          await this.supabase.prepareTenantContext();
          return this.procesarVentasPendientesFacturacionInternal(tenantId, limit);
        },
      );
    }

    // Sin tenant explícito, procesar todas (solo para workers autorizados)
    return this.procesarVentasPendientesFacturacionInternal(undefined, limit);
  }

  private async procesarVentasPendientesFacturacionInternal(tenantId?: string, limit: number = 10): Promise<{ procesadas: number; errores: number }> {
    try {
      let query = this.supabase.getClient()
        .from('ventas_pos')
        .select('*')
        .eq('cpe_pendiente', true)
        .lt('intentos_facturacion', 5) // Solo ventas con menos de 5 intentos
        .order('ultimo_intento_facturacion', { ascending: true })
        .limit(limit);

      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { data: ventasPendientes, error } = await query;

      if (error) {
        this.logger.error('Error obteniendo ventas pendientes para procesar:', error);
        return { procesadas: 0, errores: 0 };
      }

      if (!ventasPendientes || ventasPendientes.length === 0) {
        return { procesadas: 0, errores: 0 };
      }

      let procesadas = 0;
      let errores = 0;

      for (const venta of ventasPendientes) {
        try {
          // Reintentar facturación
          const cpeData = venta.cpe_data;
          if (!cpeData) {
            this.logger.warn(`Venta ${venta.id} no tiene datos CPE guardados`);
            errores++;
            continue;
          }

          const cpe = await this.cpeService.create(cpeData, venta.tenant_id);

          // Marcar como procesada
          await this.supabase.getClient()
            .from('ventas_pos')
            .update({
              cpe_pendiente: false,
              error_facturacion: null,
              ultimo_intento_facturacion: new Date().toISOString()
            })
            .eq('id', venta.id)
            .eq('tenant_id', venta.tenant_id);

          procesadas++;
          this.logger.log(`✅ Venta ${venta.id} facturada exitosamente en procesamiento automático`);
        } catch (error) {
          errores++;
          // Incrementar contador de intentos
          await this.supabase.getClient()
            .from('ventas_pos')
            .update({
              intentos_facturacion: (venta.intentos_facturacion || 0) + 1,
              ultimo_intento_facturacion: new Date().toISOString(),
              error_facturacion: error.message?.substring(0, 500) || 'Error desconocido'
            })
            .eq('id', venta.id)
            .eq('tenant_id', venta.tenant_id);

          this.logger.error(`❌ Error procesando venta ${venta.id}:`, error);
        }
      }

      return { procesadas, errores };
    } catch (error) {
      this.logger.error('Excepción procesando ventas pendientes:', error);
      return { procesadas: 0, errores: 0 };
    }
  }

  /**
   * Elimina venta y detalles para evitar estados inconsistentes cuando falla un paso crítico.
   */
  private async rollbackVenta(ventaId: string, tenantId: string): Promise<void> {
    try {
      await this.supabase.getClient()
        .from('detalle_ventas_pos')
        .delete()
        .eq('venta_id', ventaId)
        .eq('tenant_id', tenantId);

      await this.supabase.getClient()
        .from('ventas_pos')
        .delete()
        .eq('id', ventaId)
        .eq('tenant_id', tenantId);

      this.logger.warn(`♻️ Venta ${ventaId} revertida por inconsistencia`);
    } catch (err) {
      this.logger.error(`❌ Error revirtiendo venta ${ventaId}:`, err);
    }
  }
}
