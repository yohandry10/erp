import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CpeService } from '../cpe/cpe.service';
import { ValidationService } from '../validations/validation.service';
import { ConfigurationService } from '../configuracion/configuration.service';
import { EventBusService } from '../../shared/events/event-bus.service';
import { InventoryIntegrationService } from '../../shared/integration/inventory-integration.service';
import { CxcService } from '../finanzas/cxc/cxc.service';
import { TaxCalculatorService } from '../../shared/utils/tax-calculator';
import { AFECTACION_IGV, calcularDesgloseIgv, esGravado } from '../../shared/utils/igv-afectacion.util';
import { CajasService } from '../cajas/cajas.service';
import { AbrirCajaDto } from '../cajas/dto/abrir-caja.dto';
import { CerrarCajaDto } from '../cajas/dto/cerrar-caja.dto';
import { v4 as uuidv4 } from 'uuid';
import { TenantContextService } from '../../shared/tenant/tenant-context.service';
import * as crypto from 'crypto';
import Decimal from 'decimal.js';
import { PosAuditService, TipoEventoPOS } from './services/pos-audit.service';
import { ConfigService } from '@nestjs/config';
import { toPostgresBytea } from '../../shared/utils/certificate.utils';

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
    private readonly cajasService: CajasService,
    private readonly posAuditService: PosAuditService,
    private readonly configService: ConfigService,
  ) { }

  private getCertKey(): Buffer {
    const key = this.configService.get<string>('CERT_ENCRYPTION_KEY') ?? this.configService.get<string>('ENCRYPTION_KEY');
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
   * Infiere tipo de documento según catálogo SUNAT básico, permitiendo override explícito.
   */
  private inferirTipoDocumento(doc: string, tipoExplicito?: string): string {
    const map: Record<string, string> = {
      DNI: '1',
      RUC: '6',
      CE: '4',
      PASAPORTE: '7',
      OTROS: '0',
    };
    // Permitir códigos SUNAT explícitos (catálogo 06) si ya vienen en payload
    const catalogo06 = new Set(['0', '1', '4', '6', '7', 'A', 'B', 'C', 'D', 'E', 'F', 'G']);
    if (tipoExplicito) {
      const normalized = tipoExplicito.toString().toUpperCase();
      if (catalogo06.has(normalized)) return normalized;
      return map[normalized] || tipoExplicito;
    }

    const cleaned = (doc || '').trim();
    if (/^(10|15|17|20)\d{9}$/.test(cleaned)) return '6'; // RUC
    if (/^\d{8}$/.test(cleaned)) return '1'; // DNI
    if (/^[A-Z0-9]{9,12}$/i.test(cleaned)) return '4'; // CE (carné de extranjería, 9-12 chars)
    if (/^[A-Z0-9]{6,8}$/i.test(cleaned)) return '7'; // Pasaporte genérico
    return '0'; // Otros
  }

  private isUuid(value: string | null | undefined): boolean {
    return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  /**
   * Normaliza el método de pago a su metadata para evitar depender de strings "efectivo"/"tarjeta"
   */
  private async getMetodoPagoInfo(metodo: string | null | undefined, tenantId: string) {
    const normalized = (metodo || '').toString().trim().toLowerCase();

    // Atajos para literales comunes
    if (!normalized) {
      return { id: null, tipo: 'EFECTIVO', codigo: 'efectivo' };
    }
    if (['efectivo', 'cash', 'cash_id', 'efectivo_id'].includes(normalized)) {
      return { id: null, tipo: 'EFECTIVO', codigo: 'efectivo' };
    }
    if (['tarjeta', 'card', 'card_id', 'tarjeta_id'].includes(normalized)) {
      return { id: null, tipo: 'TARJETA', codigo: 'tarjeta' };
    }

    // Buscar en catálogo de métodos de pago por id o código
    const query = this.supabase.getClient()
      .from('metodos_pago')
      .select('id, codigo, tipo')
      .eq('tenant_id', tenantId)
      .limit(1);

    const { data: metodoPagoRows, error } = this.isUuid(normalized)
      ? await query.or(`id.eq.${normalized},codigo.eq.${normalized}`)
      : await query.eq('codigo', normalized);

    if (error) {
      this.logger.warn(`⚠️ No se pudo resolver método de pago ${metodo}: ${error.message}`);
    }

    const metodoPago = Array.isArray(metodoPagoRows) ? metodoPagoRows[0] : metodoPagoRows;
    const codigo = metodoPago?.codigo?.toLowerCase() || normalized;
    const tipo = metodoPago?.tipo?.toUpperCase() || 'EFECTIVO';
    return { id: metodoPago?.id ?? null, tipo, codigo };
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

  private buildVentaLockKey(ventaData: any, user: any): string {
    return [
      user.tenant_id,
      ventaData?.sesion_caja_id || null,
      ventaData?.idempotency_key || 'venta',
    ].filter(Boolean).join(':');
  }

  private deferPosSideEffect(label: string, operation: () => Promise<unknown>): void {
    void operation().catch((error) => {
      this.logger.warn(`⚠️ [POS] Side effect diferido falló (${label}):`, error);
    });
  }

  private parseCorrelativo(value: any): number {
    const raw = String(value ?? '').trim();
    const numeric = raw.includes('-') ? raw.split('-').pop() : raw;
    const parsed = Number(numeric);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  private async resolveCajaIdForSesion(tenantId: string, sesionCajaId: string | null): Promise<string | null> {
    if (!sesionCajaId) return null;
    const { data, error } = await this.supabase.getClient()
      .from('sesiones_caja')
      .select('caja_id')
      .eq('tenant_id', tenantId)
      .eq('id', sesionCajaId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data?.caja_id ?? null;
  }

  private async getMaxCorrelativoFiscalOcupado(tenantId: string, serie: string): Promise<number> {
    const client = this.supabase.getClient();
    const normalizedSerie = String(serie || '').trim().toUpperCase();
    let max = 0;

    // Obtener solo el MAX correlativo de cada tabla (orden DESC + limit 1)
    // en vez de fetch masivo con LIMIT(1000) que podía subestimar el máximo.
    const [ventas, cpes, documentos] = await Promise.all([
      client
        .from('ventas_pos')
        .select('numero_ticket, correlativo')
        .eq('tenant_id', tenantId)
        .eq('serie', normalizedSerie)
        .order('correlativo', { ascending: false })
        .limit(5),
      client
        .from('cpe')
        .select('numero')
        .eq('tenant_id', tenantId)
        .eq('serie', normalizedSerie)
        .order('numero', { ascending: false })
        .limit(5),
      client
        .from('documentos')
        .select('numero')
        .eq('tenant_id', tenantId)
        .eq('serie', normalizedSerie)
        .order('numero', { ascending: false })
        .limit(5),
    ]);

    for (const result of [ventas, cpes, documentos]) {
      if (result.error) {
        throw result.error;
      }
    }

    for (const venta of ventas.data || []) {
      max = Math.max(max, this.parseCorrelativo(venta.correlativo), this.parseCorrelativo(venta.numero_ticket));
    }
    for (const cpe of cpes.data || []) {
      max = Math.max(max, this.parseCorrelativo(cpe.numero));
    }
    for (const documento of documentos.data || []) {
      max = Math.max(max, this.parseCorrelativo(documento.numero));
    }

    return max;
  }

  private async syncPosNumeracionConDocumentos(tenantId: string, serie: string, cajaId: string | null): Promise<void> {
    const client = this.supabase.getClient();
    const normalizedSerie = String(serie || 'B001').trim().toUpperCase();
    const maxOcupado = await this.getMaxCorrelativoFiscalOcupado(tenantId, normalizedSerie);

    const query = client
      .from('pos_numeracion')
      .select('id, correlativo_actual')
      .eq('tenant_id', tenantId)
      .eq('tipo_documento', 'TICKET')
      .eq('serie', normalizedSerie)
      .eq('activo', true);

    const { data: existente, error } = cajaId
      ? await query.eq('caja_id', cajaId).maybeSingle()
      : await query.is('caja_id', null).maybeSingle();

    if (error) {
      throw error;
    }

    if (existente?.id) {
      const actual = Number(existente.correlativo_actual ?? 0);
      if (actual < maxOcupado) {
        const { error: updateError } = await client
          .from('pos_numeracion')
          .update({ correlativo_actual: maxOcupado, updated_at: new Date().toISOString() })
          .eq('id', existente.id);
        if (updateError) throw updateError;
      }
      return;
    }

    const { error: insertError } = await client.from('pos_numeracion').insert({
      tenant_id: tenantId,
      tipo_documento: 'TICKET',
      serie: normalizedSerie,
      caja_id: cajaId,
      correlativo_actual: maxOcupado,
      correlativo_maximo: 99999999,
      activo: true,
      estado: 'ACTIVO',
    });

    if (insertError && (insertError as any).code !== '23505') {
      throw insertError;
    }
  }

  private async validarProductosVentaPOS(
    items: any[],
    tenantId: string,
    permiteVentaSinStock: boolean,
  ): Promise<Map<string, any>> {
    const productIds = Array.from(new Set(items.map((item: any) => item.producto_id).filter(Boolean)));
    if (productIds.length === 0) {
      throw new Error('La venta POS requiere productos válidos');
    }

    const { data: productos, error } = await this.supabase.getClient()
      .from('productos')
      .select('id, codigo, nombre, precio_venta, precio_compra, costo, stock, stock_actual, stock_reservado, activo, estado, es_servicio, controla_stock, unidad_medida, afectacion_igv')
      .eq('tenant_id', tenantId)
      .in('id', productIds);

    if (error) {
      throw error;
    }

    const productosMap = new Map<string, any>((productos || []).map((producto: any) => [producto.id, producto]));
    for (const item of items) {
      const producto = productosMap.get(item.producto_id);
      if (!producto) {
        throw new Error(`Producto POS no encontrado: ${item.producto_id}`);
      }

      const activo = producto.activo !== false && String(producto.estado || 'ACTIVO').toUpperCase() !== 'INACTIVO';
      if (!activo) {
        throw new Error(`Producto inactivo no vendible en POS: ${producto.nombre || producto.codigo || item.producto_id}`);
      }

      const cantidad = Number(item.cantidad ?? 0);
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        throw new Error(`Cantidad inválida para ${producto.nombre || producto.codigo || item.producto_id}`);
      }

      const controlaStock = producto.es_servicio === true ? false : producto.controla_stock !== false;
      if (controlaStock && !permiteVentaSinStock) {
        const stockActual = Number(producto.stock_actual ?? producto.stock ?? 0);
        const stockReservado = Number(producto.stock_reservado ?? 0);
        const stockDisponible = stockActual - stockReservado;
        if (stockDisponible < cantidad) {
          throw new Error(
            `Stock insuficiente para ${producto.nombre || producto.codigo || item.producto_id}. Disponible=${stockDisponible}, solicitado=${cantidad}`,
          );
        }
      }
    }

    return productosMap;
  }

  async getProductos(user: any) {
    return this.runWithTenantContext(user, async () => {
      try {
        this.logger.log(`Obteniendo productos POS para tenant: ${user.tenant_id}`);

        const { data, error } = await this.supabase.getClient()
          .from('vista_pos_productos')
          .select('*')
          .eq('tenant_id', user.tenant_id)
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
        const client = this.supabase.getClient();

        // Traer todas las sesiones ABIERTAS de este usuario (por rol/campos) ordenadas por apertura desc
        const { data: sesiones, error } = await client
          .from('sesiones_caja')
          .select('*')
          .eq('tenant_id', user.tenant_id)
          .or(`usuario_id.eq.${user.id},usuario_apertura.eq.${user.id},cajero_id.eq.${user.id},abierto_por.eq.${user.id}`)
          .eq('estado', 'ABIERTA')
          .is('hora_cierre', null)
          .is('fecha_cierre', null)
          .order('hora_apertura', { ascending: false })
          .limit(10);

        if (error && error.code !== 'PGRST116') throw error;

        const listaSesiones = Array.isArray(sesiones)
          ? sesiones
          : sesiones
            ? [sesiones as any]
            : [];

        if (listaSesiones.length === 0) {
          return { success: true, data: null };
        }

        const hoy = new Date();
        const hoyString = hoy.toISOString().split('T')[0];

        // Cerrar sesiones anteriores a hoy para evitar arrastre de sesiones "huérfanas"
        const sesionesVencidas = listaSesiones.filter((s) => {
          const aperturaIso = s.hora_apertura || s.fecha_apertura || s.created_at;
          if (!aperturaIso) return true;
          const apertura = new Date(aperturaIso);
          const aperturaStr = apertura.toISOString().split('T')[0];
          return aperturaStr !== hoyString;
        });

        if (sesionesVencidas.length > 0) {
          const ids = sesionesVencidas.map((s) => s.id);
          try {
            await client
              .from('sesiones_caja')
              .update({
                estado: 'CERRADA',
                hora_cierre: new Date().toISOString(),
                fecha_cierre: new Date().toISOString(),
                notas: 'Cierre automático por sesión anterior al día actual',
              })
              .in('id', ids);
          } catch (cerrarErr) {
            this.logger.warn('⚠️ No se pudieron cerrar sesiones vencidas:', cerrarErr);
          }
        }

        // Quedarse con la sesión más reciente de hoy
        const sesionHoy = listaSesiones.find((s) => {
          const aperturaIso = s.hora_apertura || s.fecha_apertura || s.created_at;
          if (!aperturaIso) return false;
          const apertura = new Date(aperturaIso);
          return apertura.toISOString().split('T')[0] === hoyString;
        });

        return { success: true, data: sesionHoy || null };
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

  private async resolveCajaId(tenantId: string, cajaId?: string): Promise<string> {
    if (cajaId) return cajaId;

    const cajas = await this.cajasService.listarCajas(tenantId);
    const activas = (cajas || []).filter((c: any) => !c.estado || c.estado === 'ACTIVO');

    if (activas.length === 0) {
      throw new Error('No hay cajas activas configuradas para este tenant.');
    }

    if (activas.length > 1) {
      throw new Error('Debe especificar caja_id cuando existen multiples cajas activas.');
    }

    return activas[0].id;
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
    const items = Array.isArray(ventaData?.items) ? ventaData.items : [];
    try {
      this.logger.log(
        `Procesando venta POS tenant=${user.tenant_id} items=${items.length} tiene_cpe=${Boolean(ventaData?.emitir_cpe)}`
      );

      // ===== PRE-SALE VALIDATIONS =====
      this.logger.log(`Starting pre-sale validations for tenant: ${user.tenant_id}`);

      // Idempotencia obligatoria
      if (!ventaData.idempotency_key) {
        return {
          success: false,
          message: 'Falta idempotency_key para procesar la venta',
        };
      }

      // Normalizar idempotency_key para que sea estable (trim) en todos los sub-flujos (CPE/CxC/outbox).
      ventaData.idempotency_key = String(ventaData.idempotency_key).trim();
      const ventaIdempotencyKey = ventaData.idempotency_key;

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
        .select('ruc, razon_social, moneda_defecto, igv_porcentaje, serie_factura, serie_boleta')
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
      const tasaIgvEmpresa = Number(empresaCfg?.igv_porcentaje);
      const tasaIgv = Number.isFinite(tasaIgvEmpresa) && tasaIgvEmpresa >= 0
        ? tasaIgvEmpresa / 100
        : await this.taxCalculator.getTasaIgv(user.tenant_id);
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

      // Los productos se validan ANTES de calcular el dinero: su afectación del
      // IGV (Catálogo 07) decide qué parte de la venta es gravada. Calcular un
      // IGV plano cobraría impuesto sobre bienes exonerados o inafectos.
      const productosMap = await this.validarProductosVentaPOS(
        recomputed,
        user.tenant_id,
        ventaData?.permite_venta_sin_stock === true,
      );

      const desgloseIgv = calcularDesgloseIgv(
        recomputed.map((item: any) => ({
          baseImponible: Number(item.subtotal ?? 0),
          afectacionIgv: productosMap.get(item.producto_id)?.afectacion_igv,
        })),
        tasaIgv,
      );

      // ✅ FIX: Usar Decimal.js para sumas y cálculos de impuestos
      const subtotalCalculado = recomputed.reduce(
        (acc, item) => acc.plus(item.subtotal ?? 0),
        new Decimal(0)
      ).toDecimalPlaces(2).toNumber();
      const impuestosCalculados = desgloseIgv.igv;
      const totalCalculado = new Decimal(subtotalCalculado).plus(impuestosCalculados).toDecimalPlaces(2).toNumber();
      const totalCalculadoDecimal = new Decimal(totalCalculado);

      // SUNAT: una boleta mayor a S/ 700 debe identificar al adquirente. Se valida
      // ANTES de cobrar y descontar stock: si se dejara para la emisión del CPE, el
      // cajero cobraría la venta y recién después descubriría que le falta el DNI,
      // con el cliente ya fuera de la tienda y la venta sin comprobante.
      const tipoComprobanteSolicitado = String(ventaData?.comprobante?.tipo || '03').trim();
      if (tipoComprobanteSolicitado === '03' && totalCalculado > 700) {
        const documentoCliente = String(ventaData?.cliente_documento ?? '').trim();
        const nombreCliente = String(ventaData?.cliente_nombre ?? '').trim();
        if (!documentoCliente || /^9+$/.test(documentoCliente) || !nombreCliente) {
          throw new BadRequestException(
            'Las boletas mayores a S/ 700 requieren los datos del cliente (nombre y número de documento). ' +
              'Solicítalos antes de cobrar o emite una factura.',
          );
        }
      }

      const pagosRaw = Array.isArray(ventaData?.pagos) ? ventaData.pagos : null;
      let pagosNormalizados: Array<{
        codigo: string;
        tipo: string;
        monto: number;
        referencia?: string | null;
        metodo_pago_id?: string | null;
      }> | null = null;

      if (pagosRaw && pagosRaw.length > 0) {
        let sumaPagos = new Decimal(0);
        pagosNormalizados = [];

        for (const pago of pagosRaw) {
          const metodoValor = pago?.metodo_pago_id || pago?.metodo_pago || pago?.codigo;
          if (!metodoValor) {
            throw new Error('Pago sin metodo_pago válido');
          }
          const metodoInfo = await this.getMetodoPagoInfo(String(metodoValor), user.tenant_id);
          const montoPago = Number(pago?.monto ?? 0);
          if (!Number.isFinite(montoPago) || montoPago <= 0) {
            throw new Error('Monto de pago inválido');
          }
          sumaPagos = sumaPagos.plus(montoPago);
          pagosNormalizados.push({
            codigo: metodoInfo.codigo,
            tipo: metodoInfo.tipo,
            monto: montoPago,
            referencia: pago?.referencia ?? null,
            metodo_pago_id: metodoInfo.id,
          });
        }

        if (sumaPagos.minus(totalCalculadoDecimal).abs().greaterThan(0.01)) {
          throw new Error(
            `Pagos no cuadran con total. Pagos=${sumaPagos.toFixed(2)} Total=${totalCalculadoDecimal.toFixed(2)}`,
          );
        }
      }

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

      if (tipoDocumento === '01' && !/^\d{11}$/.test(String(ventaData.cliente_documento || '').trim())) {
        return {
          success: false,
          message: 'Factura requiere RUC válido de 11 dígitos',
          error: {
            tipo: 'VALIDATION_ERROR',
            codigo: 'FACTURA_REQUIERE_RUC',
            mensaje: 'Proporcione un RUC válido (11 dígitos) para emitir factura',
          },
        };
      }

      const totalItemsDocumento = recomputed.reduce((sum, item) => sum + Number(item.cantidad ?? 0), 0);
      if (totalItemsDocumento > 999) {
        return {
          success: false,
          message: 'No se puede completar la venta: el comprobante supera 999 items',
          error: {
            tipo: 'VALIDATION_ERROR',
            codigo: 'DOCUMENT_ITEM_LIMIT',
            mensaje: 'SUNAT permite como máximo 999 items por comprobante',
          }
        };
      }

      this.logger.log('✅ All pre-sale validations passed');
      // ===== END PRE-SALE VALIDATIONS =====

      // Sesión de caja actual. La UI POS envía sesion_caja_id; evitar una consulta extra
      // mantiene el flujo rápido y la RPC full_tx valida que siga abierta dentro de la transacción.
      let sesionCajaId = ventaData.sesion_caja_id ? String(ventaData.sesion_caja_id) : null;
      if (!sesionCajaId) {
        const sesionActual = await this.getSesionCajaActual(user);
        sesionCajaId = sesionActual?.success ? sesionActual.data?.id ?? null : null;
      }

      // Permitir que el frontend envíe la sesión explícita (por ejemplo, recién abierta) y validarla
      if (!sesionCajaId && ventaData.sesion_caja_id) {
        const { data: sesionPayload } = await this.supabase.getClient()
          .from('sesiones_caja')
          .select('id, tenant_id, estado, hora_cierre, fecha_cierre')
          .eq('id', ventaData.sesion_caja_id)
          .eq('tenant_id', user.tenant_id)
          .eq('estado', 'ABIERTA')
          .is('hora_cierre', null)
          .is('fecha_cierre', null)
          .maybeSingle();

        if (sesionPayload) {
          sesionCajaId = sesionPayload.id;
        }
      }

      if (!sesionCajaId) {
        this.logger.warn(
          `🚫 Venta bloqueada: sin sesión de caja abierta. Tenant=${user.tenant_id}, Usuario=${user.id}`,
        );
        return {
          success: false,
          message: 'Debe abrir la caja antes de registrar ventas en el POS.',
          error: {
            tipo: 'CAJA_CERRADA',
            codigo: 'POS_CAJA_REQUERIDA',
            mensaje: 'Abra la caja con el monto inicial para continuar.',
          },
        };
      }

      this.deferPosSideEffect('sync-pos-numeracion', async () => {
        const cajaIdActual = await this.resolveCajaIdForSesion(user.tenant_id, sesionCajaId);
        await this.syncPosNumeracionConDocumentos(
          user.tenant_id,
          ventaData.comprobante?.serie || 'B001',
          cajaIdActual,
        );
      });

      this.deferPosSideEffect('audit-inicio-venta', () => this.posAuditService.registrarEvento(user.tenant_id, sesionCajaId, user.id, {
        tipo_evento: TipoEventoPOS.INICIO_VENTA,
        datos: {
          idempotency_key: ventaIdempotencyKey,
          items: recomputed.length,
          total: totalCalculado,
          metodo_pago: ventaData.metodo_pago_id,
          pagos: pagosNormalizados || null,
        },
      }));

      // RPC transaccional: venta + detalles + stock + caja + outbox
      const maxDescuentoPct = (() => {
        const descuentosItems = recomputed.map((item: any) => {
          const cantidad = Number(item.cantidad ?? 0);
          const precio = Number(item.precio_unitario ?? 0);
          const descuento = Number(item.descuento_monto ?? 0);
          const base = cantidad * precio;
          if (!Number.isFinite(base) || base <= 0) return 0;
          return descuento / base;
        });
        const descuentoGlobalPct =
          ventaData?.descuento_global?.tipo === 'PORCENTAJE'
            ? Number(ventaData?.descuento_global?.valor ?? 0) / 100
            : 0;
        const maxPct = Math.max(0, descuentoGlobalPct, ...descuentosItems);
        if (!Number.isFinite(maxPct)) return 0;
        return Math.min(0.9, Math.max(0, maxPct));
      })();

      const metodoPagoPrincipal =
        pagosNormalizados && pagosNormalizados.length > 0
          ? (pagosNormalizados.length > 1 ? 'MIXTO' : pagosNormalizados[0].codigo)
          : (ventaData.metodo_pago_id || 'efectivo');

      const rpcPayload: Record<string, any> = {
        p_tenant_id: user.tenant_id,
        p_usuario_id: user.id,
        p_cliente_id: ventaData.cliente_id || null,
        p_cliente_documento: ventaData.cliente_documento,
        p_cliente_nombre: ventaData.cliente_nombre,
        p_metodo_pago: metodoPagoPrincipal,
        p_items: recomputed,
        p_serie: ventaData.comprobante?.serie || 'B001',
        p_sesion_caja_id: sesionCajaId,
        p_vendedor: user.email || user.username,
        p_max_descuento_pct: maxDescuentoPct,
        p_idempotency_key: ventaData.idempotency_key,
        p_pagos: pagosNormalizados
          ? pagosNormalizados.map((p) => ({
            codigo: p.codigo,
            tipo: p.tipo,
            monto: p.monto,
            referencia: p.referencia,
            metodo_pago_id: p.metodo_pago_id,
          }))
          : null,
      };

      let txData: any;
      let txError: any;
      ({ data: txData, error: txError } = await this.supabase.getClient()
        .rpc('pos_registrar_venta_full_tx', rpcPayload));

      if (
        txError?.code === 'PGRST202' &&
        String(txError?.details || txError?.message || '').includes('pos_registrar_venta_full_tx')
      ) {
        throw new Error(
          'POS_INVENTORY_CONTRACT_UNAVAILABLE: falta pos_registrar_venta_full_tx; venta bloqueada para evitar saldos divergentes',
        );
      }

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
      const impactosAplicadosPorRpc = Boolean(ventaTx.impactos_aplicados);

      this.deferPosSideEffect('audit-venta-completada', () => this.posAuditService.registrarEvento(user.tenant_id, sesionCajaId, user.id, {
        tipo_evento: TipoEventoPOS.VENTA_COMPLETADA,
        venta_id: String(ventaResult.id),
        datos: {
          numero_ticket: ventaResult.numero_ticket,
          subtotal: ventaResult.subtotal,
          impuestos: ventaResult.impuestos,
          total: ventaResult.total,
          idempotency_key: ventaIdempotencyKey,
        },
      }));

      this.logger.log('✅ Venta procesada exitosamente:', ventaResult.id);

      if (!impactosAplicadosPorRpc) {
        throw new Error(
          'POS_INVENTORY_IMPACTS_NOT_ATOMIC: full_tx no confirmó impactos; venta bloqueada',
        );
      }

      // Registrar movimiento de caja (solo efectivo) para calcular saldo esperado correctamente
      try {
        if (impactosAplicadosPorRpc) {
          this.logger.log(`✅ Impactos POS aplicados por RPC full_tx: ${ventaResult.id}`);
        } else {
        let montoEfectivo = 0;
        if (pagosNormalizados && pagosNormalizados.length > 0) {
          montoEfectivo = pagosNormalizados
            .filter((p) => p.tipo === 'EFECTIVO')
            .reduce((sum, p) => sum + p.monto, 0);
        } else {
          const metodoPago = ventaData.metodo_pago_id || 'efectivo';
          const metodoInfo = await this.getMetodoPagoInfo(metodoPago, user.tenant_id);
          if (metodoInfo.tipo === 'EFECTIVO') {
            montoEfectivo = ventaResult.total;
          }
        }

        if (montoEfectivo > 0 && sesionCajaId) {
          const { data: movimientoExistente } = await this.supabase.getClient()
            .from('movimientos_caja')
            .select('id')
            .eq('sesion_caja_id', sesionCajaId)
            .eq('tenant_id', user.tenant_id)
            .eq('referencia_tipo', 'venta_pos')
            .eq('referencia_documento', String(ventaResult.id))
            .maybeSingle();

          if (!movimientoExistente) {
            await this.supabase.getClient().rpc('registrar_movimiento_caja', {
              p_sesion_caja_id: sesionCajaId,
              p_tipo_movimiento: 'VENTA',
              p_monto: montoEfectivo,
              p_referencia_documento: String(ventaResult.id),
              p_referencia_tipo: 'venta_pos',
              p_motivo: `Venta POS ${ventaResult.numero_ticket}`,
              p_usuario_id: user.id,
              p_metadata: {
                metodo_pago: 'EFECTIVO',
                metodo_codigo: 'efectivo',
                pagos_mixtos: pagosNormalizados && pagosNormalizados.length > 0,
              },
            });
          }
        }
        }
      } catch (movError) {
        this.logger.error('❌ ALERTA: No se pudo registrar movimiento de caja POS (monto esperado será incorrecto al cierre):', movError);
      }

      // En POS la venta no debe esperar firma/XML/eventos fiscales. Se deja una cola durable
      // para que el worker de facturación procese el CPE sin bloquear al cajero.
      let cpeEmitido = false;
      let cpeId = null;
      let cpeData: any = null;
      let cpePendiente = false;

      try {
        this.logger.log('📄 Programando CPE POS para worker:', ventaResult.id);

        // Tomar tipo/serie/moneda/UOM reales
        const tipoComprobante = ventaData?.comprobante?.tipo || '03';
        // La serie FISCAL depende del tipo de comprobante (SUNAT: F### para
        // facturas, B### para boletas). El ticket del POS usa una serie interna
        // por caja (T###) que NO es válida ante SUNAT; heredarla hacía que todas
        // las boletas del POS fueran rechazadas. Solo se acepta la serie recibida
        // si es coherente con el tipo; si no, se usa la configurada del tenant.
        const prefijoFiscal = tipoComprobante === '01' ? 'F' : 'B';
        const serieSolicitada = String(ventaData?.comprobante?.serie ?? '').trim().toUpperCase();
        const serieConfigurada = String(
          (tipoComprobante === '01' ? empresaCfg.serie_factura : empresaCfg.serie_boleta) ?? '',
        ).trim().toUpperCase();
        const esSerieFiscalValida = (serie: string) =>
          /^[A-Z0-9]{4}$/.test(serie) && serie.startsWith(prefijoFiscal);

        const serieCpe = esSerieFiscalValida(serieSolicitada)
          ? serieSolicitada
          : esSerieFiscalValida(serieConfigurada)
            ? serieConfigurada
            : `${prefijoFiscal}001`;
        const monedaCpe = (ventaData?.moneda || empresaCfg.moneda_defecto || 'PEN').toString();

        // Sanitizar documento del receptor y validar contra tipo de comprobante
        const docReceptor = (
          ventaData.cliente_documento || ''
        ).toString().trim();
        const tipoDocReceptor = this.inferirTipoDocumento(docReceptor, ventaData.cliente_tipo_documento);
        if (tipoComprobante === '01' && tipoDocReceptor !== '6') {
          throw new Error('Factura requiere RUC válido de 11 dígitos');
        }

        // Numero CPE seguro
        const correlativoStr = ventaResult.numero_ticket?.split('-')[1] || ventaData?.comprobante?.correlativo;
        const numeroCpe = correlativoStr ? Number(correlativoStr) : NaN;
        if (!Number.isFinite(numeroCpe)) {
          throw new Error('No se pudo determinar correlativo numérico para el CPE');
        }

        cpeData = {
          tipo_documento: tipoComprobante as any,
          serie: serieCpe,
          numero: numeroCpe,
          // Dedupe de reintentos POS→CPE (mismo idempotency_key de venta, namespaced)
          idempotency_key: `pos.cpe:${user.tenant_id}:${ventaIdempotencyKey}`,
          ruc_emisor: empresaCfg.ruc,
          razon_social_emisor: empresaCfg.razon_social,
          tipo_documento_receptor: tipoDocReceptor,
          documento_receptor: docReceptor,
          razon_social_receptor:
            ventaData.cliente_nombre ||
            'Cliente',
          direccion_receptor: ventaData.cliente_direccion || '',
          moneda: monedaCpe,
          // Bases separadas por afectación: declarar todo como gravado haría que
          // SUNAT reciba IGV sobre bienes exonerados o inafectos.
          total_gravadas: desgloseIgv.gravadas,
          total_exoneradas: desgloseIgv.exoneradas,
          total_inafectas: desgloseIgv.inafectas,
          total_exportacion: desgloseIgv.exportacion,
          total_igv: parseFloat(impuestosCalculados.toFixed(2)),
          total_venta: parseFloat(totalCalculado.toFixed(2)),
          items: (recomputed || []).map((item: any) => {
            const producto = productosMap.get(item.producto_id) || {};
            const cantidad = parseFloat(item.cantidad) || 1;
            const baseUnit = parseFloat(item.precio_unitario) || 0; // asumido sin IGV
            const baseItem = parseFloat(item.subtotal) || 0; // base total
            const afectacionItem = String(producto.afectacion_igv ?? AFECTACION_IGV.GRAVADO);
            const tasaItem = esGravado(afectacionItem) ? tasaIgv : 0;
            const igvItem = parseFloat((baseItem * tasaItem).toFixed(2));
            const totalItem = parseFloat((baseItem + igvItem).toFixed(2));
            const uom =
              item.producto?.unidad_medida_sunat ||
              item.unidad_medida_sunat ||
              item.producto?.unidad_medida ||
              item.unidad_medida ||
              producto.unidad_medida_sunat ||
              producto.unidad_medida ||
              (item.producto?.es_servicio ? 'ZZ' : 'NIU');
            return {
              cantidad,
              codigo_producto: item.producto?.codigo || item.codigo || item.sku || producto.codigo || 'PROD',
              descripcion: item.producto?.nombre || item.nombre || item.descripcion || producto.nombre || 'Producto',
              unidad_medida: uom,
              precio_unitario: parseFloat((baseUnit * (1 + tasaItem)).toFixed(6)), // con IGV
              valor_unitario: parseFloat(baseUnit.toFixed(6)), // sin IGV
              precio_venta: totalItem, // con IGV
              valor_venta: baseItem, // sin IGV
              igv: igvItem,
              total_impuestos: igvItem,
              total: totalItem,
              tipo_afectacion_igv: afectacionItem,
            };
          })
        };

        this.logger.log(
          `Datos CPE POS en cola tenant=${user.tenant_id} tipo=${cpeData.tipo_documento} serie=${cpeData.serie} total=${cpeData.total_venta}`
        );

        const { error: cpeQueueError } = await this.supabase.getClient()
          .from('ventas_pos')
          .update({
            cpe_id: null,
            cpe_pendiente: true,
            intentos_facturacion: 0,
            error_facturacion: null,
            cpe_data: cpeData,
            ultimo_intento_facturacion: new Date().toISOString(),
          })
          .eq('id', ventaResult.id)
          .eq('tenant_id', user.tenant_id);

        if (cpeQueueError) {
          throw cpeQueueError;
        }
        cpePendiente = true;
      } catch (cpeError) {
        this.logger.error('❌ Error programando CPE POS:', cpeError);
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
      let creditoMonto = 0;
      if (pagosNormalizados && pagosNormalizados.length > 0) {
        creditoMonto = pagosNormalizados
          .filter((p) => p.tipo !== 'EFECTIVO' && p.tipo !== 'TARJETA' && p.tipo !== 'DIGITAL')
          .reduce((sum, p) => sum + p.monto, 0);
      } else {
        const metodoPago = ventaData.metodo_pago_id || 'efectivo';
        const metodoInfoCxC = await this.getMetodoPagoInfo(metodoPago, user.tenant_id);
        if (metodoInfoCxC.tipo !== 'EFECTIVO' && metodoInfoCxC.tipo !== 'TARJETA' && metodoInfoCxC.tipo !== 'DIGITAL') {
          creditoMonto = totalCalculado;
        }
      }
      const esVentaCredito = creditoMonto > 0;
      let cuentaPorCobrarId: string | null = null;

      if (esVentaCredito) {
        try {
          this.logger.log(`💰 [POS] Venta a crédito detectada (monto: ${creditoMonto}), creando cuenta por cobrar...`);

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
            this.logger.warn(`⚠️ [POS] No se encontró cliente para venta ${ventaResult.id}. Venta a crédito no permitida sin cliente.`);
            await this.rollbackVenta(ventaResult.id, user.tenant_id);
            return {
              success: false,
              message: 'Venta a crédito requiere cliente registrado con documento válido',
              error: {
                tipo: 'VALIDATION_ERROR',
                codigo: 'CLIENTE_REQUERIDO_CREDITO',
                mensaje: 'Para ventas a crédito, el cliente debe estar registrado con documento válido',
              },
            };
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
            const ratio = totalCalculado > 0 ? creditoMonto / totalCalculado : 0;
            const facturaEvent = {
              eventId: uuidv4(),
              tenantId: user.tenant_id,
              pedidoId: undefined, // HARDENING: POS puede no tener pedido asociado.
              cpeId: cpeId || ventaResult.id, // Usar CPE ID si existe, sino venta ID
              facturaId: ventaResult.id,
              serie: serieCpe,
              numero: numeroCpe ?? '0',
              clienteId: clienteId,
              subtotal: Number((subtotalCalculado * ratio).toFixed(2)),
              impuestos: Number((impuestosCalculados * ratio).toFixed(2)),
              total: Number(creditoMonto.toFixed(2)),
              moneda: 'PEN',
              fechaEmision: fechaEmision.toISOString(),
              fechaVencimiento: fechaVencimiento.toISOString(),
              idempotencyKey: `pos.cxc:${user.tenant_id}:${ventaIdempotencyKey}`,
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
              await this.supabase.getClient()
                .from('ventas_pos')
                .update({
                  cuenta_por_cobrar_id: cuentaPorCobrarId,
                  cxc_pendiente: false,
                  cxc_error: null,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', ventaResult.id)
                .eq('tenant_id', user.tenant_id);
              this.logger.log(`✅ [POS] Cuenta por cobrar creada: ${cuentaPorCobrarId} para venta ${ventaResult.id}`);
            } else {
              this.logger.warn(`⚠️ [POS] No se pudo obtener ID de cuenta por cobrar creada`);
            }
          }
        } catch (error) {
          this.logger.error(`❌ ALERTA: Error creando CxC para venta ${ventaResult.id} (crédito=${creditoMonto}). Receivable sin tracking:`, error);
          await this.supabase.getClient()
            .from('ventas_pos')
            .update({
              cxc_pendiente: true,
              cxc_error: error?.message || 'Error creando cuenta por cobrar',
              cxc_reintentos: 0,
              updated_at: new Date().toISOString(),
            })
            .eq('id', ventaResult.id)
            .eq('tenant_id', user.tenant_id);

          return {
            success: false,
            message: 'Venta registrada, pero la cuenta por cobrar no pudo crearse. Requiere regularización antes de cerrar caja/contabilidad.',
            data: {
              venta_id: ventaResult.id,
              numero_ticket: ventaResult.numero_ticket,
              cxc_pendiente: true,
              error: error?.message || 'Error creando cuenta por cobrar',
            },
            error: {
              tipo: 'ACCOUNTING_INTEGRATION_ERROR',
              codigo: 'POS_CREDITO_CXC_PENDIENTE',
              mensaje: 'No se pudo crear la cuenta por cobrar de la venta a crédito',
            },
          };
        }
      }

      if (this.eventBus) {
        this.deferPosSideEffect('event-bus-venta-procesada', () => this.eventBus.emitVentaProcessed({
          eventId: uuidv4(),
          tenantId: user.tenant_id,
          idempotencyKey: `pos.venta:${user.tenant_id}:${ventaIdempotencyKey}`,
          source: 'pos.venta.registrada',
          ventaId: ventaResult.id,
          numeroTicket: String(ventaResult.numero_ticket),
          clienteId: ventaData.cliente_id || undefined,
          clienteNombre: ventaData.cliente_nombre || 'Cliente POS',
          metodoPago: metodoPagoPrincipal,
          subtotal: subtotalCalculado,
          impuestos: impuestosCalculados,
          total: totalCalculado,
          items: recomputed.map((item: any) => ({
            productoId: item.producto_id,
            cantidad: Number(item.cantidad ?? 0),
            precio: Number(item.precio_unitario ?? 0),
            total: Number(item.subtotal ?? 0),
          })),
          cpeId: cpeId || undefined,
          inventarioAplicado: true,
        }));
      }

      return {
        success: true,
        venta_id: ventaResult.id,
        numero_ticket: ventaResult.numero_ticket,
        estado: ventaResult.estado,
        subtotal: subtotalCalculado,
        impuestos: impuestosCalculados,
        total: totalCalculado,
        factura_electronica: cpeEmitido,
        cpe_id: cpeId,
        cpe_pendiente: cpePendiente,
        facturacion_pendiente: cpePendiente,
        cuenta_por_cobrar_id: cuentaPorCobrarId,
        items_actualizados: recomputed.map((item: any) => {
          const producto = productosMap.get(item.producto_id);
          const stockActualOriginal = producto ? Number(producto.stock_actual ?? producto.stock ?? 0) : null;
          const stockReservado = producto ? Number(producto.stock_reservado ?? 0) : 0;
          const stockActual = stockActualOriginal == null
            ? null
            : impactosAplicadosPorRpc
              ? Math.max(stockActualOriginal - Number(item.cantidad ?? 0), 0)
              : stockActualOriginal;
          return {
            producto_id: item.producto_id,
            stock_actual: stockActual,
            stock_disponible: stockActual == null ? null : Math.max(stockActual - stockReservado, 0),
          };
        }),
        message: cpeEmitido
          ? esVentaCredito
            ? 'Venta procesada, CPE emitido y cuenta por cobrar creada'
            : 'Venta procesada y CPE emitido exitosamente'
          : 'Venta procesada; CPE en cola de facturación'
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
        }
      };
    }
  }

  async abrirCaja(
    data: {
      monto_inicial: number;
      caja_id?: string;
      dispositivo?: string;
      moneda?: string;
      supervisor_id?: string;
      razon_autorizacion?: string;
      denominaciones_apertura?: AbrirCajaDto['denominaciones_apertura'];
      ip_address?: string;
      geolocalizacion?: AbrirCajaDto['geolocalizacion'];
      foto_apertura?: string;
      user_agent?: string;
    } | number,
    user: any,
  ) {
    return this.runWithTenantContext(user, () => this.abrirCajaInternal(data, user));
  }

  private async abrirCajaInternal(
    data: {
      monto_inicial: number;
      caja_id?: string;
      dispositivo?: string;
      moneda?: string;
      supervisor_id?: string;
      razon_autorizacion?: string;
      denominaciones_apertura?: AbrirCajaDto['denominaciones_apertura'];
      ip_address?: string;
      geolocalizacion?: AbrirCajaDto['geolocalizacion'];
      foto_apertura?: string;
      user_agent?: string;
    } | number,
    user: any,
  ) {
    try {
      const montoInicial = typeof data === 'number' ? data : data?.monto_inicial;
      if (!montoInicial && montoInicial !== 0) {
        throw new Error('monto_inicial requerido');
      }

      const client = this.supabase.getClient();
      const { data: empresaCfg } = await client
        .from('empresa_config')
        .select('moneda_defecto')
        .eq('tenant_id', user.tenant_id)
        .maybeSingle();

      const cajaId = await this.resolveCajaId(
        user.tenant_id,
        typeof data === 'number' ? undefined : data?.caja_id,
      );

      const dto: AbrirCajaDto = {
        monto_inicio: montoInicial,
        moneda: (typeof data === 'number' ? undefined : data?.moneda) || empresaCfg?.moneda_defecto || 'PEN',
        dispositivo: typeof data === 'number' ? undefined : data?.dispositivo,
        supervisor_id: typeof data === 'number' ? undefined : data?.supervisor_id,
        razon_autorizacion: typeof data === 'number' ? undefined : data?.razon_autorizacion,
        denominaciones_apertura: typeof data === 'number' ? undefined : data?.denominaciones_apertura,
        ip_address: typeof data === 'number' ? undefined : data?.ip_address,
        geolocalizacion: typeof data === 'number' ? undefined : data?.geolocalizacion,
        foto_apertura: typeof data === 'number' ? undefined : data?.foto_apertura,
        user_agent: typeof data === 'number' ? undefined : data?.user_agent,
      };

      const sesion = await this.cajasService.abrirCaja(user.tenant_id, cajaId, dto, user.id, dto.ip_address);

      return {
        success: true,
        data: sesion,
      };
    } catch (error) {
      this.logger.error('Error abriendo caja:', error);
      throw error;
    }
  }

  async cerrarCaja(
    data: {
      monto_contado: number;
      notas?: string;
      caja_id?: string;
      sesion_id?: string;
      sesionId?: string;
    } | number,
    user: any,
    notas?: string,
  ) {
    return this.runWithTenantContext(user, () => this.cerrarCajaInternal(data, user, notas));
  }

  private async cerrarCajaInternal(
    data: {
      monto_contado: number;
      notas?: string;
      caja_id?: string;
      sesion_id?: string;
      sesionId?: string;
    } | number,
    user: any,
    notasFallback?: string,
  ) {
    try {
      const montoContado = typeof data === 'number' ? data : data?.monto_contado;
      const notas = typeof data === 'number' ? notasFallback : data?.notas;
      if (montoContado === undefined || montoContado === null) {
        throw new Error('monto_contado requerido');
      }

      const sesionResult = await this.getSesionCajaActual(user);
      const sesion = sesionResult?.success ? sesionResult.data : null;

      if (!sesion) {
        throw new Error('No hay sesión de caja abierta');
      }

      let cajaId = sesion?.caja_id ?? undefined;
      let sesionId = sesion?.id ?? undefined;

      if (!cajaId && sesionId) {
        const { data: sesionDb } = await this.supabase.getClient()
          .from('sesiones_caja')
          .select('caja_id')
          .eq('tenant_id', user.tenant_id)
          .eq('id', sesionId)
          .maybeSingle();
        cajaId = sesionDb?.caja_id ?? undefined;
      }

      if (!cajaId) {
        throw new Error('No se pudo determinar la caja para cerrar la sesión');
      }

      const dto: CerrarCajaDto = {
        monto_cierre: montoContado,
        monto_contado: montoContado,
        notas: notas,
      };

      const sesionCerrada = await this.cajasService.cerrarCaja(
        user.tenant_id,
        cajaId,
        sesionId ?? null,
        dto,
        user.id,
      );

      return {
        success: true,
        data: sesionCerrada,
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
          certificado_pfx: toPostgresBytea(certEncrypted), // bytea: iv|tag|ciphertext
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

  async obtenerEstadoFacturacionVenta(ventaId: string, user: any): Promise<{
    venta_id: string;
    numero_ticket?: string;
    cpe_id: string | null;
    cpe_pendiente: boolean;
    factura_electronica: boolean;
    intentos_facturacion: number;
    error_facturacion: string | null;
    ultimo_intento_facturacion: string | null;
  }> {
    return this.runWithTenantContext(user, async () => {
      const { data: venta, error } = await this.supabase.getClient()
        .from('ventas_pos')
        .select('id, numero_ticket, cpe_id, cpe_pendiente, intentos_facturacion, error_facturacion, ultimo_intento_facturacion')
        .eq('id', ventaId)
        .eq('tenant_id', user.tenant_id)
        .single();

      if (error || !venta) {
        throw new Error('Venta no encontrada para el tenant activo');
      }

      return {
        venta_id: venta.id,
        numero_ticket: venta.numero_ticket,
        cpe_id: venta.cpe_id || null,
        cpe_pendiente: Boolean(venta.cpe_pendiente),
        factura_electronica: Boolean(venta.cpe_id),
        intentos_facturacion: Number(venta.intentos_facturacion || 0),
        error_facturacion: venta.error_facturacion || null,
        ultimo_intento_facturacion: venta.ultimo_intento_facturacion || null,
      };
    });
  }

  private async reintentarFacturacionVentaInternal(ventaId: string, user: any): Promise<{ success: boolean; cpe_id?: string; message: string }> {
    try {
      // Obtener venta pendiente
      const { data: venta, error: ventaError } = await this.supabase.getClient()
        .from('ventas_pos')
        .select('*')
        .eq('id', ventaId)
        .eq('tenant_id', user.tenant_id)
        .single();

      if (ventaError || !venta) {
        throw new Error('Venta no encontrada para el tenant activo');
      }

      if (venta.cpe_id) {
        return {
          success: true,
          cpe_id: venta.cpe_id,
          message: 'La venta ya tiene CPE asociado',
        };
      }

      // Verificar máximo de intentos (5 intentos)
      if (Number(venta.intentos_facturacion || 0) >= 5) {
        throw new Error('Máximo de reintentos alcanzado (5 intentos). Contacte al administrador.');
      }

      // Obtener datos CPE guardados
      const cpeData = venta.cpe_data || null;
      if (!cpeData) {
        throw new Error('No se encontraron datos del CPE para reintentar');
      }

      // HARDENING: asegurar idempotency_key para dedupe de reintentos (retrocompatible con ventas antiguas)
      const fallbackVentaKey = (venta as any)?.idempotency_key || ventaId;
      (cpeData as any).idempotency_key =
        (cpeData as any).idempotency_key || `pos.cpe:${user.tenant_id}:${fallbackVentaKey}`;

      // Intentar crear CPE nuevamente
      const cpe = await this.cpeService.create(cpeData, user.tenant_id, user.id);

      // Actualizar venta como facturada
      await this.supabase.getClient()
        .from('ventas_pos')
        .update({
          cpe_id: cpe.id,
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
        .select('id, numero_venta, numero_ticket, cliente_nombre, total, cpe_id, cpe_pendiente, intentos_facturacion, ultimo_intento_facturacion, error_facturacion, fecha')
        .eq('tenant_id', user.tenant_id)
        .or('cpe_pendiente.eq.true,cpe_id.is.null')
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
    if (!tenantId) {
      throw new Error('procesarVentasPendientesFacturacion requiere tenantId para aislamiento');
    }

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

  private async procesarVentasPendientesFacturacionInternal(tenantId?: string, limit: number = 10): Promise<{ procesadas: number; errores: number }> {
    try {
      let query = this.supabase.getClient()
        .from('ventas_pos')
        .select('*')
        .or('cpe_pendiente.eq.true,cpe_id.is.null')
        .not('cpe_data', 'is', null)
        .lt('intentos_facturacion', 5)
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
          if (venta.cpe_id) {
            continue;
          }

          if (Number(venta.intentos_facturacion || 0) >= 5) {
            errores++;
            this.logger.warn(`Venta ${venta.id} alcanzó el máximo de reintentos de facturación`);
            continue;
          }

          // Reintentar facturación
          const cpeData = venta.cpe_data;
          if (!cpeData) {
            this.logger.warn(`Venta ${venta.id} no tiene datos CPE guardados`);
            errores++;
            continue;
          }

          const fallbackVentaKey = (venta as any)?.idempotency_key || venta.id;
          (cpeData as any).idempotency_key =
            (cpeData as any).idempotency_key || `pos.cpe:${venta.tenant_id}:${fallbackVentaKey}`;

          const cpeActorId = (venta as any).created_by || (venta as any).usuario_id || undefined;
          const cpe = await this.cpeService.create(cpeData, venta.tenant_id, cpeActorId);

          // Marcar como procesada
          await this.supabase.getClient()
            .from('ventas_pos')
            .update({
              cpe_id: cpe.id,
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
    const errores: string[] = [];
    const client = this.supabase.getClient();

    // Intentar cada paso individualmente y registrar errores
    try {
      await client.from('ventas_pos_pagos').delete().eq('venta_pos_id', ventaId).eq('tenant_id', tenantId);
    } catch (err) { errores.push(`pagos: ${err?.message ?? err}`); }

    try {
      await client.from('detalle_ventas_pos').delete().eq('venta_id', ventaId).eq('tenant_id', tenantId);
    } catch (err) { errores.push(`detalle: ${err?.message ?? err}`); }

    try {
      await client.from('outbox_events').delete().eq('tenant_id', tenantId).eq('aggregate_type', 'venta_pos').eq('aggregate_id', ventaId);
    } catch (err) { errores.push(`outbox: ${err?.message ?? err}`); }

    try {
      await client.from('ventas_pos').delete().eq('id', ventaId).eq('tenant_id', tenantId);
    } catch (err) { errores.push(`venta: ${err?.message ?? err}`); }

    if (errores.length > 0) {
      this.logger.error(`ROLLBACK_PARTIAL venta=${ventaId} errores=[${errores.join('; ')}]`);
      // Marcar como FALLIDA si no se pudo eliminar para que no quede huérfana
      try {
        await client.from('ventas_pos').update({ estado: 'ANULADA', observaciones: `Rollback parcial: ${errores.join('; ')}` }).eq('id', ventaId).eq('tenant_id', tenantId);
      } catch { /* best effort */ }
    } else {
      this.logger.warn(`♻️ Venta ${ventaId} revertida completamente`);
    }
  }
}
