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
import { TenantContextService } from '../../shared/tenant/tenant-context.service';
import * as crypto from 'crypto';
import Decimal from 'decimal.js';
import { PosAuditService, TipoEventoPOS } from './services/pos-audit.service';
import { ConfigService } from '@nestjs/config';
import { toPostgresBytea } from '../../shared/utils/certificate.utils';
import { validateColombiaNit } from '../paises/initial-country';
import { CanjearTicketPosDto } from './dto/canjear-ticket-pos.dto';

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

  /**
   * Tipos de método de pago que se liquidan en el acto. Sólo lo que no está aquí
   * genera cuenta por cobrar: una transferencia o un Yape se cobran al momento
   * de la venta aunque no entren a la gaveta, y tratarlos como crédito abría una
   * CxC por una venta ya pagada. `DIGITAL` se conserva por compatibilidad con
   * catálogos antiguos anteriores a `BILLETERA_DIGITAL`.
   */
  private static readonly TIPOS_PAGO_INMEDIATO = new Set([
    'EFECTIVO',
    'TARJETA',
    'DIGITAL',
    'BILLETERA_DIGITAL',
    'TRANSFERENCIA',
  ]);

  private esPagoInmediato(tipo: string | null | undefined): boolean {
    return PosService.TIPOS_PAGO_INMEDIATO.has(String(tipo ?? '').trim().toUpperCase());
  }

  /**
   * Descuenta el descuento global de la base imponible de cada ítem, prorrateado
   * por su peso en el subtotal. El prorrateo evita mover base entre afectaciones
   * distintas: si se restara todo de un ítem gravado, un descuento sobre una
   * venta mixta reduciría el IGV más de lo que corresponde.
   */
  private aplicarDescuentoGlobal(items: any[], descuentoGlobal: any): void {
    if (!descuentoGlobal || items.length === 0) return;

    const valor = Number(descuentoGlobal.valor ?? 0);
    if (!Number.isFinite(valor) || valor <= 0) return;

    const subtotal = items.reduce((acc, item) => acc.plus(item.subtotal ?? 0), new Decimal(0));
    if (subtotal.lessThanOrEqualTo(0)) return;

    const descuento = String(descuentoGlobal.tipo ?? '').toUpperCase() === 'MONTO_FIJO'
      ? Decimal.min(new Decimal(valor), subtotal)
      : subtotal.times(Decimal.min(new Decimal(valor), 100)).dividedBy(100);

    if (descuento.lessThanOrEqualTo(0)) return;

    let repartido = new Decimal(0);
    items.forEach((item, indice) => {
      const base = new Decimal(item.subtotal ?? 0);
      const parte = indice === items.length - 1
        ? descuento.minus(repartido)
        : descuento.times(base).dividedBy(subtotal).toDecimalPlaces(2);
      repartido = repartido.plus(parte);

      const nuevaBase = Decimal.max(new Decimal(0), base.minus(parte)).toDecimalPlaces(2);
      item.descuento_monto = new Decimal(item.descuento_monto ?? 0).plus(parte).toDecimalPlaces(2).toNumber();
      item.subtotal = nuevaBase.toNumber();
    });
  }

  /**
   * Reparte el IGV de cabecera entre los ítems gravados. El residuo del redondeo
   * queda en el último ítem gravado para que la suma sea exacta.
   */
  private repartirIgvEntreItems(items: any[], productosMap: Map<string, any>, igvTotal: number): void {
    const esItemGravado = (item: any) => esGravado(productosMap.get(item.producto_id)?.afectacion_igv);
    const gravados = items.filter(esItemGravado);

    for (const item of items) {
      item.igv = 0;
    }

    if (gravados.length === 0) return;

    const baseGravada = gravados.reduce((acc, item) => acc.plus(item.subtotal ?? 0), new Decimal(0));
    if (baseGravada.lessThanOrEqualTo(0)) return;

    const total = new Decimal(igvTotal);
    let repartido = new Decimal(0);
    gravados.forEach((item, indice) => {
      const parte = indice === gravados.length - 1
        ? total.minus(repartido)
        : total.times(item.subtotal ?? 0).dividedBy(baseGravada).toDecimalPlaces(2);
      repartido = repartido.plus(parte);
      item.igv = parte.toNumber();
    });
  }

  /**
   * Reserva el siguiente correlativo de la serie fiscal en documento_series, que
   * es la secuencia compartida por POS, Documentos y facturación de pedidos.
   * Un reintento de la misma venta reutiliza el correlativo ya reservado en vez
   * de quemar uno nuevo.
   */
  private async reservarCorrelativoFiscal(
    tenantId: string,
    tipoComprobante: string,
    serieFiscal: string,
    ventaId: string,
  ): Promise<number> {
    const client = this.supabase.getClient();

    const { data: ventaExistente } = await client
      .from('ventas_pos')
      .select('cpe_data')
      .eq('id', ventaId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const cpeDataPrevio = (ventaExistente as any)?.cpe_data;
    if (cpeDataPrevio && String(cpeDataPrevio.serie ?? '').trim().toUpperCase() === serieFiscal) {
      const numeroPrevio = this.parseCorrelativo(cpeDataPrevio.numero);
      if (numeroPrevio > 0) {
        return numeroPrevio;
      }
    }

    const { data, error } = await client.rpc('obtener_siguiente_numero_documento', {
      p_tenant_id: tenantId,
      p_tipo_documento: tipoComprobante,
      p_serie: serieFiscal,
    });

    if (error) {
      throw error;
    }

    const numero = this.parseCorrelativo(Array.isArray(data) ? data[0] : data);
    if (numero <= 0) {
      throw new Error(`Correlativo fiscal inválido para ${serieFiscal}: ${JSON.stringify(data)}`);
    }

    return numero;
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

      // `productos.stock_actual` puede ser agregado de varios almacenes y cada
      // línea aislada no detecta SKU repetidos. La disponibilidad vinculada a
      // la caja se valida, agregada y bajo lock, dentro de la RPC 451.
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
        const { data, error } = await this.supabase.getClient()
          .rpc('obtener_sesion_caja_actual_tx', {
            p_tenant_id: user.tenant_id,
            p_actor_id: user.id,
          });
        if (error) throw error;

        // Consultar el estado de caja no puede cerrarla. Este GET cerraba toda
        // sesión cuya apertura no cayera en el día UTC actual, sin saldo teórico,
        // sin conteo y sin responsable: el efectivo quedaba sin rastro por el solo
        // hecho de abrir el POS. Además, comparar en UTC parte la jornada peruana
        // a las 19:00 locales. La sesión abierta se devuelve tal cual y sólo se
        // cierra desde el flujo de cierre, con su arqueo.
        return { success: true, data: data ?? null };
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

        const ventas = Array.isArray(data) ? data : [];
        const ventaIds = ventas
          .map((venta: any) => venta?.id)
          .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
        let canjes: any[] = [];

        if (ventaIds.length > 0) {
          const { data: canjesData, error: canjesError } = await this.supabase.getClient()
            .from('pos_ticket_canjes')
            .select('id, venta_pos_id, documento_fiscal_id, tipo_documento, serie, numero, receptor_cliente_id, receptor_tipo_documento, receptor_documento, receptor_nombre, actor_id, estado, created_at')
            .eq('tenant_id', user.tenant_id)
            .in('venta_pos_id', ventaIds);

          if (canjesError) throw canjesError;
          canjes = Array.isArray(canjesData) ? canjesData : [];
        }

        const canjePorVenta = new Map(canjes.map((canje: any) => [canje.venta_pos_id, canje]));
        const ventasConCanje = ventas.map((venta: any) => {
          const canje = canjePorVenta.get(venta.id) || null;
          const tipoEmision = venta.tipo_emision || null;
          const numeroFiscal = canje
            ? `${canje.serie}-${canje.numero}`
            : venta.atomic_result?.numero_fiscal || null;

          return {
            ...venta,
            tipo_emision: tipoEmision,
            canje,
            numero_fiscal: numeroFiscal,
            canjeable: tipoEmision === 'TICKET' && !canje && !venta.cpe_id,
          };
        });

        return {
          success: true,
          data: ventasConCanje,
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

  async canjearTicket(ventaId: string, payload: CanjearTicketPosDto, user: any) {
    return this.runWithTenantContext(user, async () => {
      try {
        const idempotencyKey = String(payload?.idempotency_key || '').trim();
        const { data, error } = await this.supabase.getClient()
          .rpc('pos_canjear_ticket_tx', {
            p_tenant_id: user.tenant_id,
            p_venta_pos_id: ventaId,
            p_actor_id: user.id,
            p_idempotency_key: idempotencyKey,
            p_payload: {
              tipo_documento: payload.tipo_documento,
              serie: payload.serie?.trim().toUpperCase() || null,
              cliente_id: payload.cliente_id || null,
              cliente_tipo_documento: payload.cliente_tipo_documento.trim().toUpperCase(),
              cliente_documento: payload.cliente_documento.trim(),
              cliente_nombre: payload.cliente_nombre.trim(),
              cliente_direccion: payload.cliente_direccion?.trim() || null,
            },
          });

        if (
          error?.code === 'PGRST202' &&
          String(error?.details || error?.message || '').includes('pos_canjear_ticket_tx')
        ) {
          throw new Error(
            'POS_TICKET_EXCHANGE_CONTRACT_UNAVAILABLE: falta pos_canjear_ticket_tx; canje bloqueado sin alterar la venta',
          );
        }
        if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
          throw error || new Error('No se pudo reservar el comprobante fiscal del canje');
        }

        const result = data as Record<string, any>;
        return {
          success: true,
          ...result,
          message: result.idempotent
            ? 'Canje ya reservado; reintento idempotente sin repetir impactos'
            : 'Canje fiscal reservado sin repetir cobro, inventario, CxC ni contabilidad',
        };
      } catch (error) {
        this.logger.error(`Error canjeando ticket POS venta=${ventaId}:`, error);
        return {
          success: false,
          message: error?.message || 'Error al canjear el ticket POS',
          error: {
            tipo: 'POS_TICKET_EXCHANGE_ERROR',
            codigo: error?.code,
            mensaje: error?.message || 'Error al canjear el ticket POS',
          },
        };
      }
    });
  }

  private async procesarVentaInternal(ventaData: any, user: any) {
    const items = Array.isArray(ventaData?.items) ? ventaData.items : [];
    const emitirCpe = ventaData?.emitir_cpe !== false;
    try {
      this.logger.log(
        `Procesando venta POS tenant=${user.tenant_id} items=${items.length} emitir_cpe=${emitirCpe}`
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

      // La intención original se conserva separada del precio resuelto. Un
      // retry confirmado debe devolver la venta ya comprometida aunque la
      // lista haya vencido o cambiado; la BD compara esta huella antes de
      // volver a cotizar y vuelve a ejecutar sus postcondiciones canónicas.
      const commercialRequest = {
        cliente_id: ventaData.cliente_id || null,
        cliente_documento: String(ventaData.cliente_documento || '').trim(),
        cliente_nombre: String(ventaData.cliente_nombre || '').trim(),
        cliente_direccion: ventaData.cliente_direccion || '',
        cliente_tipo_documento: ventaData.cliente_tipo_documento || null,
        moneda: String(ventaData.moneda || 'PEN').toUpperCase(),
        emitir_cpe: emitirCpe,
        comprobante: ventaData.comprobante || null,
        metodo_pago: ventaData.metodo_pago || null,
        metodo_pago_id: ventaData.metodo_pago_id || null,
        referencia_pago: ventaData.referencia_pago || null,
        descuento_global: ventaData.descuento_global || 0,
        pagos: ventaData.pagos || null,
        redondeo_efectivo_legal: ventaData.redondeo_efectivo_legal === true,
        items,
      };
      const { data: retryData, error: retryError } = await this.supabase.getClient()
        .rpc('reintentar_venta_pos_comercial_tx', {
          p_tenant_id: user.tenant_id,
          p_usuario_id: user.id,
          p_idempotency_key: ventaIdempotencyKey,
          p_intencion: commercialRequest,
          p_sesion_caja_id: ventaData.sesion_caja_id || null,
        });
      if (retryError) {
        throw retryError;
      }
      if (retryData && typeof retryData === 'object' && !Array.isArray(retryData)) {
        const retry = retryData as Record<string, any>;
        const tipoEmisionRetry = retry.tipo_emision
          || (emitirCpe ? 'FISCAL_INMEDIATO' : 'TICKET');
        return {
          success: true,
          venta_id: retry.venta_id,
          numero_ticket: retry.numero_ticket,
          estado: 'PAGADA',
          subtotal: Number(retry.subtotal),
          impuestos: Number(retry.impuestos),
          total: Number(retry.total),
          factura_electronica: Boolean(retry.cpe_id),
          cpe_id: retry.cpe_id ?? null,
          cpe_pendiente: Boolean(retry.cpe_pendiente),
          facturacion_pendiente: Boolean(retry.facturacion_pendiente),
          tipo_emision: tipoEmisionRetry,
          canjeable: Boolean(retry.canjeable ?? tipoEmisionRetry === 'TICKET'),
          numero_fiscal: retry.numero_fiscal ?? null,
          cuenta_por_cobrar_id: retry.cuenta_por_cobrar_id ?? null,
          credito_monto: Number(retry.credito_monto ?? 0),
          accounting_event_id: retry.accounting_event_id,
          documento_id: retry.documento_id,
          caja_movimiento_id: retry.caja_movimiento_id ?? null,
          items_actualizados: retry.items_actualizados ?? [],
          idempotent: true,
          redondeo_efectivo_legal: retry.redondeo_efectivo_legal === true,
          monto_efectivo_cobrado: retry.monto_efectivo_cobrado ?? null,
          monto_ajuste_redondeo: retry.monto_ajuste_redondeo ?? null,
          message: tipoEmisionRetry === 'TICKET'
            ? 'Ticket interno ya confirmado; reintento validado sin recalcular la lista'
            : 'Venta fiscal ya confirmada; reintento validado sin recalcular la lista',
        };
      }

      // Validar config de empresa antes de crear venta (hard-stop CPE)
      const { data: empresaCfg, error: empresaCfgErr } = await this.supabase.getClient()
        .from('empresa_config')
        .select('ruc, razon_social, moneda_defecto, igv_porcentaje, serie_factura, serie_boleta, pais, pais_id, arca_punto_venta')
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
      const monedaVenta = String(ventaData?.moneda || empresaCfg.moneda_defecto || 'PEN').toUpperCase();
      const { data: detalleConPrecios, error: preciosError } = await this.supabase.getClient()
        .rpc('resolver_precios_venta_tx', {
          p_tenant_id: user.tenant_id,
          p_vendedor_id: user.id,
          p_cliente_id: ventaData.cliente_id || null,
          p_detalle: items,
          p_fecha: null,
          p_moneda: monedaVenta,
        });
      if (preciosError || !Array.isArray(detalleConPrecios)
          || detalleConPrecios.length !== items.length) {
        throw preciosError || new Error(
          'COMMERCIAL_PRICING_CONTRACT_INVALID: no se obtuvo un precio verificable para cada línea',
        );
      }
      const recomputed = detalleConPrecios.map((item: any) => {
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

      // El descuento global se aplica a la base imponible, no al total. Restarlo
      // después del IGV cobraría impuesto sobre un importe que no se cobra, y
      // dejarlo fuera del recálculo hacía que el POS mostrara un total con
      // descuento pero registrara y cobrara el total sin él.
      this.aplicarDescuentoGlobal(recomputed, ventaData?.descuento_global);

      // Los productos se validan ANTES de calcular el dinero: su afectación del
      // IGV (Catálogo 07) decide qué parte de la venta es gravada. Calcular un
      // IGV plano cobraría impuesto sobre bienes exonerados o inafectos.
      const productosMap = await this.validarProductosVentaPOS(
        recomputed,
        user.tenant_id,
      );

      const desgloseIgv = calcularDesgloseIgv(
        recomputed.map((item: any) => ({
          baseImponible: Number(item.subtotal ?? 0),
          afectacionIgv: productosMap.get(item.producto_id)?.afectacion_igv,
        })),
        tasaIgv,
      );

      // La RPC liquida el impuesto sumando el `igv` de cada ítem: se reparte el
      // IGV de cabecera para que lo cobrado coincida al céntimo con el desglose
      // que viaja al comprobante.
      this.repartirIgvEntreItems(recomputed, productosMap, desgloseIgv.igv);

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
      if (emitirCpe && empresaCfg?.pais === 'PE' && tipoComprobanteSolicitado === '03' && totalCalculado > 700) {
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
      const solicitaRedondeoEfectivo = ventaData?.redondeo_efectivo_legal === true;
      let pagosNormalizados: Array<{
        codigo: string;
        tipo: string;
        monto: number;
        moneda: string;
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
          if (!Number.isFinite(montoPago) || montoPago < 0) {
            throw new Error('Monto de pago inválido');
          }
          sumaPagos = sumaPagos.plus(montoPago);
          pagosNormalizados.push({
            codigo: metodoInfo.codigo,
            tipo: metodoInfo.tipo,
            monto: montoPago,
            moneda: empresaCfg.moneda_defecto || 'PEN',
            referencia: pago?.referencia ?? null,
            metodo_pago_id: metodoInfo.id,
          });
        }

        const diferenciaPago = totalCalculadoDecimal.minus(sumaPagos).toDecimalPlaces(2);
        const efectivoLegalEsperado = totalCalculadoDecimal
          .times(10)
          .floor()
          .dividedBy(10)
          .toDecimalPlaces(2);
        const redondeoValido = solicitaRedondeoEfectivo
          && String(empresaCfg?.pais || '').trim().toUpperCase() === 'PE'
          && monedaVenta === 'PEN'
          && pagosNormalizados.every((pago) => pago.tipo === 'EFECTIVO')
          && diferenciaPago.greaterThanOrEqualTo(0.01)
          && diferenciaPago.lessThanOrEqualTo(0.09)
          && sumaPagos.equals(efectivoLegalEsperado);
        const pagosConCeroValidos = pagosNormalizados.every((pago) => pago.monto > 0)
          || (
            redondeoValido
            && pagosNormalizados.length === 1
            && pagosNormalizados[0].monto === 0
          );

        if (solicitaRedondeoEfectivo && (!redondeoValido || !pagosConCeroValidos)) {
          throw new Error(
            'Redondeo de efectivo inválido: sólo aplica a una venta PE/PEN íntegramente en efectivo y al décimo inferior',
          );
        }
        if (!pagosConCeroValidos) {
          throw new Error('Monto de pago inválido');
        }
        if (!solicitaRedondeoEfectivo && !diferenciaPago.isZero()) {
          throw new Error(
            `Pagos no cuadran con total. Pagos=${sumaPagos.toFixed(2)} Total=${totalCalculadoDecimal.toFixed(2)}`,
          );
        }
      } else if (solicitaRedondeoEfectivo) {
        throw new Error(
          'Redondeo de efectivo inválido: se requiere el pago efectivo explícito',
        );
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
      const serie = ventaData?.comprobante?.serie || (
        empresaCfg?.pais === 'AR'
          ? String(empresaCfg.arca_punto_venta || 1).padStart(5, '0')
          : empresaCfg?.pais === 'CO'
            ? String(empresaCfg.serie_factura || 'FE')
            : 'T001'
      );
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

      const documentoClienteFactura = String(ventaData.cliente_documento || '').trim();
      const documentoFacturaValido =
        empresaCfg?.pais === 'AR'
          ? /^\d{11}$/.test(documentoClienteFactura)
          : empresaCfg?.pais === 'CO'
            ? validateColombiaNit(documentoClienteFactura)
            : /^\d{11}$/.test(documentoClienteFactura);
      if (emitirCpe && tipoDocumento === '01' && !documentoFacturaValido) {
        const documentoFiscal = empresaCfg?.pais === 'AR' ? 'CUIT' : empresaCfg?.pais === 'CO' ? 'NIT' : 'RUC';
        return {
          success: false,
          message: `Factura requiere ${documentoFiscal} válido`,
          error: {
            tipo: 'VALIDATION_ERROR',
            codigo: `FACTURA_REQUIERE_${documentoFiscal}`,
            mensaje: `Proporcione un ${documentoFiscal} válido para emitir factura`,
          },
        };
      }

      const totalItemsDocumento = recomputed.reduce((sum, item) => sum + Number(item.cantidad ?? 0), 0);
      const maxItemsDocumento = empresaCfg?.pais === 'CO' ? 1000 : 999;
      if (totalItemsDocumento > maxItemsDocumento) {
        return {
          success: false,
          message: `No se puede completar la venta: el comprobante supera ${maxItemsDocumento} items`,
          error: {
            tipo: 'VALIDATION_ERROR',
            codigo: 'DOCUMENT_ITEM_LIMIT',
            mensaje: `${empresaCfg?.pais === 'CO' ? 'DIAN' : 'SUNAT'} permite como máximo ${maxItemsDocumento} items por comprobante`,
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

      const metodoPagoPrincipal =
        pagosNormalizados && pagosNormalizados.length > 0
          ? (pagosNormalizados.length > 1 ? 'MIXTO' : pagosNormalizados[0].codigo)
          : (ventaData.metodo_pago_id || 'efectivo');

      const tipoComprobante = emitirCpe
        ? String(ventaData?.comprobante?.tipo || '03').trim()
        : 'TICKET';
      const prefijoFiscal = tipoComprobante === '01' ? 'F' : 'B';
      const serieSolicitada = String(ventaData?.comprobante?.serie ?? '').trim().toUpperCase();
      const serieConfigurada = String(
        (tipoComprobante === '01' ? empresaCfg.serie_factura : empresaCfg.serie_boleta) ?? '',
      ).trim().toUpperCase();
      const esSerieFiscalValida = (serieFiscal: string) =>
        /^[A-Z0-9]{4}$/.test(serieFiscal) &&
        !serieFiscal.startsWith('T') &&
        (empresaCfg?.pais !== 'PE' || serieFiscal.startsWith(prefijoFiscal));
      const serieCpe = esSerieFiscalValida(serieSolicitada)
        ? serieSolicitada
        : esSerieFiscalValida(serieConfigurada)
          ? serieConfigurada
          : `${prefijoFiscal}001`;
      const docReceptor = String(ventaData.cliente_documento || '').trim();
      const tipoDocReceptor = this.inferirTipoDocumento(
        docReceptor,
        ventaData.cliente_tipo_documento,
      );
      if (emitirCpe && tipoComprobante === '01' && tipoDocReceptor !== '6') {
        throw new Error('Factura requiere RUC válido de 11 dígitos');
      }

      // Frontera única 469 -> dispatcher 471: la BD aplica una vez venta, CxC,
      // caja, inventario y outbox. El ticket interno no recibe correlativo fiscal;
      // una venta fiscal inmediata sí deja CPE durable en la misma transacción.
      const atomicPayload = {
        emitir_cpe: emitirCpe,
        commercial_request: commercialRequest,
        cliente_id: ventaData.cliente_id || null,
        cliente_documento: docReceptor,
        cliente_tipo_documento: tipoDocReceptor,
        cliente_nombre: String(ventaData.cliente_nombre || '').trim(),
        metodo_pago: metodoPagoPrincipal,
        moneda: String(ventaData?.moneda || empresaCfg.moneda_defecto || 'PEN').toUpperCase(),
        ticket_serie: 'T001',
        items: recomputed,
        pagos: pagosNormalizados
          ? pagosNormalizados.map((pago) => ({
              codigo: pago.codigo,
              monto: pago.monto,
              moneda: pago.moneda,
              referencia: pago.referencia,
              metodo_pago_id: pago.metodo_pago_id,
            }))
          : null,
        redondeo_efectivo_legal: solicitaRedondeoEfectivo,
        referencia_pago: ventaData.referencia_pago || null,
        cpe_data: emitirCpe ? {
          tipo_documento: tipoComprobante,
          serie: serieCpe,
          ruc_emisor: empresaCfg.ruc,
          razon_social_emisor: empresaCfg.razon_social,
          tipo_documento_receptor: tipoDocReceptor,
          documento_receptor: docReceptor,
          razon_social_receptor: String(ventaData.cliente_nombre || '').trim(),
          direccion_receptor: ventaData.cliente_direccion || '',
          moneda: String(ventaData?.moneda || empresaCfg.moneda_defecto || 'PEN').toUpperCase(),
          total_gravadas: desgloseIgv.gravadas,
          total_exoneradas: desgloseIgv.exoneradas,
          total_inafectas: desgloseIgv.inafectas,
          total_exportacion: desgloseIgv.exportacion,
          total_igv: impuestosCalculados,
          total_venta: totalCalculado,
        } : null,
      };

      const { data: txData, error: txError } = await this.supabase.getClient()
        .rpc('pos_registrar_venta_comercial_tx', {
          p_tenant_id: user.tenant_id,
          p_usuario_id: user.id,
          p_sesion_caja_id: sesionCajaId,
          p_idempotency_key: ventaIdempotencyKey,
          p_payload: atomicPayload,
        });

      if (
        txError?.code === 'PGRST202' &&
        String(txError?.details || txError?.message || '').includes('pos_registrar_venta_comercial_tx')
      ) {
        throw new Error(
          'POS_ATOMIC_CONTRACT_UNAVAILABLE: falta pos_registrar_venta_comercial_tx; venta bloqueada para evitar saldos divergentes',
        );
      }

      if (txError || !txData || typeof txData !== 'object' || Array.isArray(txData)) {
        this.logger.error('❌ Error transaccional POS:', txError);
        throw txError || new Error('No se pudo registrar la venta (RPC)');
      }

      const ventaTx = txData as Record<string, any>;
      const tipoEmision = ventaTx.tipo_emision
        || (emitirCpe ? 'FISCAL_INMEDIATO' : 'TICKET');
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
          'POS_IMPACTS_NOT_ATOMIC: la frontera 451 no confirmó todos los impactos',
        );
      }

      return {
        success: true,
        venta_id: ventaResult.id,
        numero_ticket: ventaResult.numero_ticket,
        estado: ventaResult.estado,
        subtotal: Number(ventaTx.subtotal),
        impuestos: Number(ventaTx.impuestos),
        total: Number(ventaTx.total),
        factura_electronica: Boolean(ventaTx.cpe_id),
        cpe_id: ventaTx.cpe_id ?? null,
        cpe_pendiente: Boolean(ventaTx.cpe_pendiente),
        facturacion_pendiente: Boolean(ventaTx.facturacion_pendiente),
        tipo_emision: tipoEmision,
        canjeable: Boolean(ventaTx.canjeable ?? tipoEmision === 'TICKET'),
        numero_fiscal: ventaTx.numero_fiscal ?? null,
        cuenta_por_cobrar_id: ventaTx.cuenta_por_cobrar_id ?? null,
        credito_monto: Number(ventaTx.credito_monto ?? 0),
        accounting_event_id: ventaTx.accounting_event_id,
        documento_id: ventaTx.documento_id,
        caja_movimiento_id: ventaTx.caja_movimiento_id ?? null,
        items_actualizados: ventaTx.items_actualizados ?? [],
        idempotent: Boolean(ventaTx.idempotent),
        redondeo_efectivo_legal: ventaTx.redondeo_efectivo_legal === true,
        monto_efectivo_cobrado: ventaTx.monto_efectivo_cobrado ?? null,
        monto_ajuste_redondeo: ventaTx.monto_ajuste_redondeo ?? null,
        message: tipoEmision === 'TICKET'
          ? 'Venta confirmada como ticket interno canjeable; sin correlativo fiscal reservado'
          : 'Venta confirmada atómicamente; CPE en cola durable',
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
    _cpeData: any,
    errorMessage: string
  ): Promise<void> {
    try {
      const failureKey = this.posCpeFailureKey(ventaId, errorMessage);
      const { error } = await this.supabase.getClient().rpc('registrar_fallo_cpe_pos_tx', {
        p_tenant_id: tenantId,
        p_venta_id: ventaId,
        p_error_message: errorMessage,
        p_failure_key: failureKey,
      });
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
    tipo_emision: string | null;
    canjeable: boolean;
    numero_fiscal: string | null;
    intentos_facturacion: number;
    error_facturacion: string | null;
    ultimo_intento_facturacion: string | null;
  }> {
    return this.runWithTenantContext(user, async () => {
      const { data: venta, error } = await this.supabase.getClient()
        .from('ventas_pos')
        .select('id, numero_ticket, cpe_id, cpe_pendiente, tipo_emision, atomic_result, cpe_data, intentos_facturacion, error_facturacion, ultimo_intento_facturacion')
        .eq('id', ventaId)
        .eq('tenant_id', user.tenant_id)
        .single();

      if (error || !venta) {
        throw new Error('Venta no encontrada para el tenant activo');
      }

      const tipoEmision = venta.tipo_emision || null;
      const esTicketInterno = tipoEmision === 'TICKET';

      return {
        venta_id: venta.id,
        numero_ticket: venta.numero_ticket,
        cpe_id: venta.cpe_id || null,
        cpe_pendiente: !esTicketInterno && Boolean(venta.cpe_pendiente),
        factura_electronica: Boolean(venta.cpe_id),
        tipo_emision: tipoEmision,
        canjeable: esTicketInterno && !venta.cpe_id,
        numero_fiscal: venta.atomic_result?.numero_fiscal || null,
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

      if (venta.tipo_emision === 'TICKET') {
        return {
          success: false,
          message: 'El ticket interno no tiene una emisión CPE pendiente; use el flujo de canje a factura o boleta',
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
      const cpe = await this.cpeService.create(
        cpeData,
        user.tenant_id,
        user.id,
        { finalizarDocumentoPosReservado: true },
      );

      this.logger.log(`✅ Facturación exitosa para venta ${ventaId} en reintento ${venta.intentos_facturacion + 1}`);

      return {
        success: true,
        cpe_id: cpe.id,
        message: 'Facturación completada exitosamente'
      };
    } catch (error) {
      this.logger.error(`❌ Error reintentando facturación para venta ${ventaId}:`, error);

      await this.registrarFalloCpePos(
        ventaId,
        user.tenant_id,
        error.message || 'Error desconocido',
      );

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
        .select('id, numero_venta, numero_ticket, cliente_nombre, total, cpe_id, cpe_pendiente, tipo_emision, intentos_facturacion, ultimo_intento_facturacion, error_facturacion, fecha')
        .eq('tenant_id', user.tenant_id)
        .eq('cpe_pendiente', true)
        .order('ultimo_intento_facturacion', { ascending: false })
        .limit(limit);

      if (error) {
        this.logger.error('Error obteniendo ventas pendientes:', error);
        throw new Error(`No se pudieron leer ventas POS pendientes: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      this.logger.error('Excepción obteniendo ventas pendientes:', error);
      throw error;
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
        .eq('cpe_pendiente', true)
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
        throw new Error(`No se pudieron reclamar ventas POS pendientes: ${error.message}`);
      }

      if (!ventasPendientes || ventasPendientes.length === 0) {
        return { procesadas: 0, errores: 0 };
      }

      let procesadas = 0;
      let errores = 0;

      for (const venta of ventasPendientes) {
        try {
          if (venta.cpe_id || venta.tipo_emision === 'TICKET') {
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
          await this.cpeService.create(
            cpeData,
            venta.tenant_id,
            cpeActorId,
            { finalizarDocumentoPosReservado: true },
          );

          procesadas++;
          this.logger.log(`✅ Venta ${venta.id} facturada exitosamente en procesamiento automático`);
        } catch (error) {
          errores++;
          await this.registrarFalloCpePos(
            venta.id,
            venta.tenant_id,
            error.message || 'Error desconocido',
          );

          this.logger.error(`❌ Error procesando venta ${venta.id}:`, error);
        }
      }

      return { procesadas, errores };
    } catch (error) {
      this.logger.error('Excepción procesando ventas pendientes:', error);
      throw error;
    }
  }

  private posCpeFailureKey(ventaId: string, message: string): string {
    const fingerprint = crypto.createHash('sha256').update(String(message)).digest('hex').slice(0, 24);
    return `pos.cpe.failure:${ventaId}:${fingerprint}`;
  }

  private async registrarFalloCpePos(
    ventaId: string,
    tenantId: string,
    message: string,
  ): Promise<void> {
    const { error } = await this.supabase.getClient().rpc('registrar_fallo_cpe_pos_tx', {
      p_tenant_id: tenantId,
      p_venta_id: ventaId,
      p_error_message: message,
      p_failure_key: this.posCpeFailureKey(ventaId, message),
    });
    if (error) {
      this.logger.error(`No se pudo registrar el fallo CPE POS ${ventaId}: ${error.message}`);
    }
  }

}
