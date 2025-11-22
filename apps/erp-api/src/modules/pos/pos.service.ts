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
    try {
      this.logger.log('Procesando venta:', JSON.stringify(ventaData, null, 2));

      // ===== PRE-SALE VALIDATIONS =====
      this.logger.log(`Starting pre-sale validations for tenant: ${user.tenant_id}`);

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
          items: ventaData.items || [],
          total: ventaData.total,
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

      // Generar número de venta único
      const numeroVenta = `V${Date.now()}`;

      // Insertar venta - usar solo columnas que existen en la tabla
      const { data: venta, error: ventaError } = await this.supabase.getClient()
        .from('ventas_pos')
        .insert({
          tenant_id: user.tenant_id,
          usuario_id: user.id,
          numero_venta: numeroVenta,
          cliente_nombre: ventaData.cliente_nombre,
          cliente_documento: ventaData.cliente_documento,
          subtotal: ventaData.subtotal,
          impuestos: ventaData.impuestos,
          total: ventaData.total,
          metodo_pago: ventaData.metodo_pago_id,
          estado: 'PAGADA',
          numero_ticket: numeroComprobante,
          vendedor: user.email || user.username,
          observaciones: JSON.stringify({
            cliente_id: ventaData.cliente_id,
            items: ventaData.items,
            descuento_global: ventaData.descuento_global,
            descuentos: ventaData.descuentos,
            referencia_pago: ventaData.referencia_pago,
            comprobante: {
              ...ventaData.comprobante,
              serie,
              correlativo,
              numero: numeroComprobante,
            }
          })
        })
        .select()
        .single();

      if (ventaError) {
        this.logger.error('Error insertando venta:', ventaError);
        throw ventaError;
      }

      // Insertar detalles de venta - guardar en observaciones por ahora
      // La tabla detalle_ventas_pos no tiene todas las columnas necesarias
      this.logger.log('✅ Detalles guardados en observaciones de la venta');

      // 🔴 CRÍTICO FIX: Actualizar stock usando servicio de inventario (crea movimiento y emite evento)
      // Reemplaza actualización directa de stock que no generaba movimientos ni eventos
      for (const item of ventaData.items) {
        try {
          // Obtener producto para stock anterior y precio
          const { data: producto } = await this.supabase.getClient()
            .from('productos')
            .select('stock, stock_reservado, precio_venta')
            .eq('id', item.producto_id)
            .eq('tenant_id', user.tenant_id)
            .single();

          if (producto) {
            const stockAnterior = Number(producto.stock || 0);
            const stockNuevo = stockAnterior - item.cantidad;
            const precioVenta = Number(producto.precio_venta || item.precio_unitario || 0);
            const valorTotal = precioVenta * item.cantidad;

            // Validar que hay suficiente stock (opcional, depender de política de negocio)
            if (stockAnterior < item.cantidad) {
              this.logger.warn(
                `⚠️ Stock insuficiente para producto ${item.producto_id}: ` +
                `disponible ${stockAnterior}, solicitado ${item.cantidad}`
              );
              // Continuar con la venta pero registrar el warning
            }

            // Usar InventoryIntegrationService para actualizar stock
            // Esto crea movimiento de inventario y emite evento para contabilidad
            await this.inventoryIntegration.realizarMovimientoStock({
              productoId: item.producto_id,
              tipoMovimiento: 'SALIDA',
              cantidad: item.cantidad,
              stockAnterior,
              stockNuevo,
              motivo: `Venta POS ${venta.numero_ticket || numeroVenta}`,
              precioUnitario: precioVenta,
              valorTotal,
              usuarioId: user.id,
              referencia: venta.numero_ticket || numeroVenta,
              ventaId: venta.id,
            }, user.tenant_id);

            this.logger.log(
              `✅ Stock actualizado para producto ${item.producto_id}: ` +
              `${stockAnterior} -> ${stockNuevo} unidades`
            );
          } else {
            this.logger.warn(`⚠️ Producto ${item.producto_id} no encontrado, no se actualiza stock`);
          }
        } catch (error) {
          this.logger.error(`❌ Error actualizando stock para producto ${item.producto_id}:`, error);
          // Decidir si bloquear la venta o continuar
          // Por ahora, continuamos pero registramos el error
          // En producción, podría ser necesario revertir la venta si falla el stock
        }
      }

      // Actualizar sesión de caja
      const sesionCajaResult = await this.getSesionCajaActual(user);
      const sesionCaja = sesionCajaResult?.success ? sesionCajaResult.data : null;
      if (sesionCaja) {
        const metodo = ventaData.metodo_pago_id;
        const updateData: any = {};

        if (metodo === 'efectivo') {
          updateData.total_efectivo = sesionCaja.total_efectivo + ventaData.total;
        } else {
          updateData.total_tarjeta = sesionCaja.total_tarjeta + ventaData.total;
        }

        await this.supabase.getClient()
          .from('sesiones_caja')
          .update(updateData)
          .eq('id', sesionCaja.id);
      }

      this.logger.log('✅ Venta procesada exitosamente:', venta.id);

      // 🔴 CRÍTICO FIX: Emitir evento VentaProcessedEvent para contabilidad
      // Esto asegura que las ventas POS generen asientos contables automáticamente
      try {
        const eventId = uuidv4();
        const resolvedTenant = venta.tenant_id ?? user.tenant_id;
        const idempotencyKey = `pos:venta:${resolvedTenant}:${venta.id}`;

        await this.eventBus.emitVentaProcessed({
          eventId,
          tenantId: resolvedTenant,
          idempotencyKey,
          source: 'ventas.pos.registro',
          ventaId: venta.id,
          numeroTicket: String(venta.numero_ticket || numeroVenta),
          clienteId: ventaData.cliente_id || null,
          clienteNombre: ventaData.cliente_nombre || 'Cliente Genérico',
          metodoPago: ventaData.metodo_pago_id || 'EFECTIVO',
          subtotal: Number(ventaData.subtotal || 0),
          impuestos: Number(ventaData.impuestos || 0),
          total: Number(ventaData.total || 0),
          items: (ventaData.items || []).map((item: any) => ({
            productoId: item.producto_id,
            cantidad: Number(item.cantidad || 0),
            precio: Number(item.precio_unitario || 0),
            total: Number(item.subtotal || (item.cantidad || 0) * (item.precio_unitario || 0)),
          })),
          cpeId: ventaData.cpe_id || null,
        });
        this.logger.log('✅ Evento VentaProcessedEvent emitido para POS');
      } catch (error) {
        this.logger.error('❌ Error emitiendo evento de venta procesada:', error);
        // No bloquear la venta si falla el evento
        // El outbox pattern garantizará que el evento se procese luego si está configurado
      }

      // Emitir CPE automáticamente
      let cpeEmitido = false;
      let cpeId = null;
      let cpeData = null;
      
      try {
        this.logger.log('📄 Emitiendo CPE para venta:', venta.id);

        // Obtener configuración de empresa para datos del emisor
        const { data: empresaData, error: empresaError } = await this.supabase.getClient()
          .from('empresa_config')
          .select('ruc, razon_social')
          .eq('tenant_id', user.tenant_id)
          .single();

        if (empresaError) {
          this.logger.error('❌ Error obteniendo empresa_config:', empresaError);
        }

        const empresa = (empresaData && empresaData.ruc) ? empresaData : {
          ruc: '12345678901',
          razon_social: 'EMPRESA DEMO SAC'
        };

        this.logger.log('✅ Empresa encontrada:', empresa.razon_social);

        // ✅ FIX: Obtener tasa de IGV una sola vez antes del map
        const tasaIgv = await this.taxCalculator.getTasaIgv(user.tenant_id);
        
        cpeData = {
          tipo_documento: '03' as any, // Boleta
          serie: 'B001',
          numero: parseInt(venta.numero_ticket.split('-')[1]) || Date.now(),
          ruc_emisor: empresa.ruc || '12345678901',
          razon_social_emisor: empresa.razon_social || 'EMPRESA DEMO',
          tipo_documento_receptor: ventaData.cliente_documento.length === 11 ? '6' : '1',
          documento_receptor: ventaData.cliente_documento,
          razon_social_receptor: ventaData.cliente_nombre,
          direccion_receptor: '',
          moneda: 'PEN',
          total_gravadas: parseFloat(ventaData.subtotal),
          total_igv: parseFloat(ventaData.impuestos),
          total_venta: parseFloat(ventaData.total),
          items: ventaData.items.map((item: any) => ({
            cantidad: parseFloat(item.cantidad) || 1,
            codigo_producto: item.producto?.codigo || 'PROD',
            descripcion: item.producto?.nombre || 'Producto',
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

        const cpe = await this.cpeService.create(cpeData, user.tenant_id);
        cpeEmitido = true;
        cpeId = cpe.id;
        this.logger.log('✅ CPE emitido exitosamente:', cpe.id);
      } catch (cpeError) {
        this.logger.error('❌ Error completo emitiendo CPE:', cpeError);
        this.logger.error('❌ Stack trace:', cpeError.stack);
        
        // 🔴 TAREA 12: Registrar venta como pendiente de facturación para reintentos
        await this.registrarVentaPendienteFacturacion(
          venta.id,
          user.tenant_id,
          cpeData,
          cpeError.message || 'Error desconocido al generar CPE'
        );
      }

      // 🔴 CRÍTICO FIX: Si es venta a crédito, crear cuenta por cobrar
      // Se crea después del CPE para tener el CPE ID real (o usar venta.id si falló el CPE)
      const metodoPago = ventaData.metodo_pago_id || 'efectivo';
      const esVentaCredito = metodoPago !== 'efectivo' && metodoPago !== 'tarjeta' && metodoPago !== 'efectivo_id' && metodoPago !== 'tarjeta_id';
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
            this.logger.warn(`⚠️ [POS] No se encontró cliente para venta ${venta.id}. No se creará CxC.`);
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
                : venta.numero_ticket?.split('-')[1] || null; // HARDENING: preservar formato del correlativo serializado.

            // Crear FacturaEmitidaEvent para usar el método de CxC
            const facturaEvent = {
              eventId: uuidv4(),
              tenantId: user.tenant_id,
              pedidoId: undefined, // HARDENING: POS puede no tener pedido asociado.
              cpeId: cpeId || venta.id, // Usar CPE ID si existe, sino venta ID
              facturaId: venta.id,
              serie: serieCpe,
              numero: numeroCpe ?? '0',
              clienteId: clienteId,
              subtotal: ventaData.subtotal || 0,
              impuestos: ventaData.impuestos || 0,
              total: ventaData.total || 0,
              moneda: 'PEN',
              fechaEmision: fechaEmision.toISOString(),
              fechaVencimiento: fechaVencimiento.toISOString(),
              idempotencyKey: `pos:${user.tenant_id}:${venta.id}`,
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
              .eq('documento_id', cpeId || venta.id)
              .eq('cliente_id', clienteId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (cuentaCreada) {
              cuentaPorCobrarId = cuentaCreada.id;
              this.logger.log(`✅ [POS] Cuenta por cobrar creada: ${cuentaPorCobrarId} para venta ${venta.id}`);
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
        venta_id: venta.id,
        numero_ticket: venta.numero_ticket,
        estado: venta.estado,
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

      // Guardar en empresa_config
      const { data, error } = await this.supabase.getClient()
        .from('empresa_config')
        .update({
          certificado_pfx: certificadoBuffer,
          certificado_password: password,
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
}
