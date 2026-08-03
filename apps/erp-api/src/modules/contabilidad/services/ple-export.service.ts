import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';

/**
 * Servicio de Exportación PLE (Programa de Libros Electrónicos) SUNAT
 * Q56: Exporta libros contables en formato TXT pipe-delimited según especificaciones SUNAT
 * 
 * Libros soportados:
 * - 14.1 Registro de Ventas e Ingresos
 * - 8.1 Registro de Compras
 * - 5.1 Libro Diario
 * - 6.1 Libro Mayor
 * - 3.1 Balance de Comprobación
 *
 * Los archivos siguen la estructura publicada por SUNAT, pero antes de usarlos
 * en una declaración real hay que pasarlos por el validador PVS: aquí no hay
 * forma de contrastarlos contra él.
 */
@Injectable()
export class PleExportService {
  private readonly logger = new Logger(PleExportService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private resolveTenantId(): string {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant requerido para exportación PLE');
    }
    return tenantId;
  }

  private assertPeriodoValido(anio: number, mes: number): void {
    if (!Number.isInteger(anio) || anio < 1900 || anio > 2100) {
      throw new Error(`Año PLE inválido: ${anio}`);
    }
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      throw new Error(`Mes PLE inválido: ${mes}`);
    }
  }

  private resolveRucPle(empresa?: { ruc?: string | null } | null): string {
    const ruc = String(empresa?.ruc || '').replace(/\D/g, '');
    if (!/^\d{11}$/.test(ruc)) {
      throw new Error('RUC de empresa requerido para exportación PLE SUNAT');
    }
    return ruc;
  }

  private assertPeruPle(empresa?: { pais?: string | null } | null): void {
    if (String(empresa?.pais || 'PE').toUpperCase() !== 'PE') {
      throw new Error(
        'La exportación PLE corresponde únicamente a SUNAT Perú; Argentina utiliza Libro Diario, Mayor y libros IVA.',
      );
    }
  }

  private formatPleDate(value: unknown): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    const yyyy = parsed.getUTCFullYear().toString().padStart(4, '0');
    const mm = (parsed.getUTCMonth() + 1).toString().padStart(2, '0');
    const dd = parsed.getUTCDate().toString().padStart(2, '0');
    return `${dd}/${mm}/${yyyy}`;
  }

  private formatPleAmount(value: unknown): string {
    const numeric = Number(value || 0);
    return (Number.isFinite(numeric) ? numeric : 0).toFixed(2);
  }

  private sanitizePleText(value: unknown, maxLength = 200): string {
    return String(value || '')
      .replace(/\|/g, ' ')
      .replace(/[\r\n\t]/g, ' ')
      .trim()
      .substring(0, maxLength);
  }

  private toPleLine(fields: Array<string | number>): string {
    return `${fields.map((field) => String(field ?? '')).join('|')}|`;
  }

  private getPeriodoPle(anio: number, mes: number): string {
    return `${anio}${mes.toString().padStart(2, '0')}00`;
  }

  private getFechaFinMes(anio: number, mes: number): string {
    const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
    return `${anio}-${mes.toString().padStart(2, '0')}-${ultimoDia.toString().padStart(2, '0')}`;
  }

  private getCorrelativoPle(correlativo: number): string {
    return `M${correlativo.toString().padStart(6, '0')}`;
  }

  /**
   * Genera nombre de archivo PLE según formato SUNAT
   * Formato: LE{RUC}{AAAA}{MM}{DD}{LIBRO}{OPERACION}{CONTENIDO}{MONEDA}{INDICADOR}.TXT
   */
  private generarNombreArchivoPLE(
    ruc: string,
    anio: number,
    mes: number,
    codigoLibro: string,
    tieneOperaciones: boolean = true,
  ): string {
    const fecha = new Date(anio, mes - 1, 1);
    const aaaa = anio.toString();
    const mm = mes.toString().padStart(2, '0');
    const dd = '00'; // Día 00 para libros mensuales
    const operacion = '00'; // Operación regular
    const contenido = tieneOperaciones ? '1' : '0'; // 1=con info, 0=sin info
    const moneda = '1'; // 1=Soles
    const indicador = '1'; // 1=Generado por sistema

    return `LE${ruc}${aaaa}${mm}${dd}${codigoLibro}${operacion}${contenido}${moneda}${indicador}.TXT`;
  }

  /**
   * Exporta Libro Diario (5.1) en formato PLE
   * Estructura según Resolución de Superintendencia N° 286-2009/SUNAT
   */
  async exportarLibroDiario(anio: number, mes: number): Promise<{ filename: string; content: string }> {
    this.assertPeriodoValido(anio, mes);
    const tenantId = this.resolveTenantId();
    this.logger.log(`📚 Exportando Libro Diario PLE ${anio}-${mes.toString().padStart(2, '0')}`);

    // Obtener datos de empresa
    const { data: empresa } = await this.supabase.getClient()
      .from('empresa_config')
      .select('ruc, razon_social, pais')
      .eq('tenant_id', tenantId)
      .single();

    this.assertPeruPle(empresa);
    const ruc = this.resolveRucPle(empresa);

    // Obtener asientos del período
    const fechaInicio = `${anio}-${mes.toString().padStart(2, '0')}-01`;
    const fechaFin = this.getFechaFinMes(anio, mes);

    const { data: asientos, error } = await this.supabase.getClient()
      .from('asientos_contables')
      .select(`
        id, numero_asiento, fecha, concepto, referencia,
        detalle_asientos(
          id, cuenta_id, debe, haber, concepto,
          plan_cuentas(codigo, nombre)
        )
      `)
      .eq('tenant_id', tenantId)
      .gte('fecha', fechaInicio)
      .lte('fecha', fechaFin)
      .order('fecha')
      .order('numero_asiento');

    if (error) {
      this.logger.error('Error obteniendo asientos:', error);
      throw error;
    }

    // Generar contenido PLE
    const lineas: string[] = [];
    let correlativo = 1;

    for (const asiento of asientos || []) {
      for (const detalle of (asiento.detalle_asientos || []) as any[]) {
        const cuenta = detalle.plan_cuentas as { codigo: string; nombre: string } | null;
        
        // Formato PLE 5.1 (campos separados por |)
        // 1. Período
        // 2. CUO (Código Único de Operación)
        // 3. Correlativo
        // 4. Código de cuenta
        // 5. Código de unidad de operación (vacío)
        // 6. Código de centro de costos (vacío)
        // 7. Tipo de moneda
        // 8. Tipo de documento de identidad del emisor
        // 9. Número de documento de identidad del emisor
        // 10. Tipo de comprobante
        // 11. Serie del comprobante
        // 12. Número del comprobante
        // 13. Fecha contable
        // 14. Fecha de vencimiento
        // 15. Fecha de operación
        // 16. Glosa
        // 17. Glosa referencial
        // 18. Debe
        // 19. Haber
        // 20. Dato estructurado
        // 21. Estado

        const periodo = this.getPeriodoPle(anio, mes);
        const cuo = `M${(asiento as any).numero_asiento?.toString().padStart(8, '0') || correlativo.toString().padStart(8, '0')}`;
        const correlativoPle = this.getCorrelativoPle(correlativo);
        const codigoCuenta = cuenta?.codigo || '';
        const fechaContable = this.formatPleDate((asiento as any).fecha);
        const glosa = this.sanitizePleText(detalle.concepto || (asiento as any).concepto);
        const debe = this.formatPleAmount(detalle.debe);
        const haber = this.formatPleAmount(detalle.haber);

        const linea = this.toPleLine([
          periodo,                    // 1. Período
          cuo,                        // 2. CUO
          correlativoPle,             // 3. Correlativo: SUNAT exige prefijo A/M/C
          codigoCuenta,               // 4. Código cuenta
          '',                         // 5. Unidad operación
          '',                         // 6. Centro costos
          'PEN',                      // 7. Moneda
          '',                         // 8. Tipo doc emisor
          '',                         // 9. Num doc emisor
          '',                         // 10. Tipo comprobante
          '',                         // 11. Serie
          '',                         // 12. Número
          fechaContable,              // 13. Fecha contable
          '',                         // 14. Fecha vencimiento
          fechaContable,              // 15. Fecha operación
          glosa,                      // 16. Glosa
          '',                         // 17. Glosa referencial
          debe,                       // 18. Debe
          haber,                      // 19. Haber
          '',                         // 20. Dato estructurado
          '1',                        // 21. Estado (1=Activo)
        ]);

        lineas.push(linea);
        correlativo++;
      }
    }

    const filename = this.generarNombreArchivoPLE(ruc, anio, mes, '050100', lineas.length > 0);
    const content = lineas.join('\r\n');

    this.logger.log(`✅ Libro Diario PLE generado: ${filename} (${lineas.length} líneas)`);

    return { filename, content };
  }

  /**
   * Exporta Libro Mayor (6.1) en formato PLE
   */
  async exportarLibroMayor(anio: number, mes: number): Promise<{ filename: string; content: string }> {
    this.assertPeriodoValido(anio, mes);
    const tenantId = this.resolveTenantId();
    this.logger.log(`📚 Exportando Libro Mayor PLE ${anio}-${mes.toString().padStart(2, '0')}`);

    const { data: empresa } = await this.supabase.getClient()
      .from('empresa_config')
      .select('ruc, pais')
      .eq('tenant_id', tenantId)
      .single();

    this.assertPeruPle(empresa);
    const ruc = this.resolveRucPle(empresa);

    // Obtener movimientos agrupados por cuenta
    const fechaInicio = `${anio}-${mes.toString().padStart(2, '0')}-01`;
    const fechaFin = this.getFechaFinMes(anio, mes);

    const { data: movimientos, error } = await this.supabase.getClient()
      .from('detalle_asientos')
      .select(`
        id, cuenta_id, debe, haber, concepto,
        plan_cuentas(codigo, nombre),
        asientos_contables!inner(
          id, numero_asiento, fecha, concepto, tenant_id
        )
      `)
      .eq('asientos_contables.tenant_id', tenantId)
      .gte('asientos_contables.fecha', fechaInicio)
      .lte('asientos_contables.fecha', fechaFin)
      .order('codigo', { foreignTable: 'plan_cuentas' })
      .order('fecha', { foreignTable: 'asientos_contables' });

    if (error) {
      this.logger.error('Error obteniendo movimientos:', error);
      throw error;
    }

    const lineas: string[] = [];
    let correlativo = 1;

    for (const mov of (movimientos || []) as any[]) {
      const cuenta = mov.plan_cuentas as { codigo: string; nombre: string } | null;
      const asiento = mov.asientos_contables as { id: string; numero_asiento: number; fecha: string; concepto: string } | null;
      
      const periodo = this.getPeriodoPle(anio, mes);
      const cuo = `M${asiento?.numero_asiento?.toString().padStart(8, '0') || correlativo.toString().padStart(8, '0')}`;
      const correlativoPle = this.getCorrelativoPle(correlativo);
      const codigoCuenta = cuenta?.codigo || '';
      const fechaContable = this.formatPleDate(asiento?.fecha);
      const glosa = this.sanitizePleText(mov.concepto || asiento?.concepto);

      const linea = this.toPleLine([
        periodo,
        cuo,
        correlativoPle,
        codigoCuenta,
        '',
        '',
        'PEN',
        '',
        '',
        '',
        '',
        '',
        fechaContable,
        '',
        fechaContable,
        glosa,
        '',
        this.formatPleAmount(mov.debe),
        this.formatPleAmount(mov.haber),
        '',
        '1',
      ]);

      lineas.push(linea);
      correlativo++;
    }

    const filename = this.generarNombreArchivoPLE(ruc, anio, mes, '060100', lineas.length > 0);
    const content = lineas.join('\r\n');

    this.logger.log(`✅ Libro Mayor PLE generado: ${filename} (${lineas.length} líneas)`);

    return { filename, content };
  }

  /**
   * Catálogo 10 de SUNAT. El registro de ventas y el de compras identifican el
   * comprobante por su código, no por el nombre interno del documento.
   */
  private codigoTipoComprobante(tipo: unknown): string {
    const clave = String(tipo || '')
      .toUpperCase()
      .replace(/[\s_-]/g, '');
    const catalogo: Record<string, string> = {
      FACTURA: '01',
      BOLETA: '03',
      BOLETADEVENTA: '03',
      NOTACREDITO: '07',
      NOTADEBITO: '08',
      GUIAREMISION: '09',
      RECIBOHONORARIOS: '02',
      TICKET: '12',
    };
    return catalogo[clave] || '00';
  }

  /**
   * Catálogo 06 de SUNAT: tipo de documento de identidad de la contraparte.
   * Un RUC de 11 dígitos es siempre 6 aunque el registro diga otra cosa.
   */
  private codigoTipoDocumentoIdentidad(tipo: unknown, numero: string): string {
    if (/^\d{11}$/.test(numero)) return '6';
    const clave = String(tipo || '')
      .toUpperCase()
      .replace(/[\s_.-]/g, '');
    const catalogo: Record<string, string> = {
      DNI: '1',
      RUC: '6',
      CE: '4',
      CARNETEXTRANJERIA: '4',
      PASAPORTE: '7',
      PARTIDANACIMIENTO: '0',
    };
    if (catalogo[clave]) return catalogo[clave];
    return /^\d{8}$/.test(numero) ? '1' : '0';
  }

  /**
   * Los comprobantes de compra llegan como "F001-00000123": el PLE los pide en
   * dos campos separados.
   */
  private partirSerieNumero(valor: unknown): { serie: string; numero: string } {
    const crudo = String(valor || '').trim().toUpperCase();
    const guion = crudo.indexOf('-');
    if (guion > 0) {
      return {
        serie: crudo.slice(0, guion),
        numero: crudo.slice(guion + 1),
      };
    }
    return { serie: '', numero: crudo };
  }

  /**
   * Exporta el Registro de Ventas e Ingresos (14.1) en formato PLE.
   *
   * Las bases van separadas porque SUNAT las declara en casillas distintas: lo
   * gravado paga IGV, lo exonerado (Apéndice I) y lo inafecto no, y la
   * exportación tiene su propio campo. Sumarlas en una sola columna obligaría al
   * contador a deshacer la suma a mano.
   */
  async exportarRegistroVentas(anio: number, mes: number): Promise<{ filename: string; content: string }> {
    this.assertPeriodoValido(anio, mes);
    const tenantId = this.resolveTenantId();
    this.logger.log(`📚 Exportando Registro de Ventas PLE ${anio}-${mes.toString().padStart(2, '0')}`);

    const { data: empresa } = await this.supabase.getClient()
      .from('empresa_config')
      .select('ruc, pais')
      .eq('tenant_id', tenantId)
      .single();

    this.assertPeruPle(empresa);
    const ruc = this.resolveRucPle(empresa);

    const fechaInicio = `${anio}-${mes.toString().padStart(2, '0')}-01`;
    const fechaFin = this.getFechaFinMes(anio, mes);

    const { data: comprobantes, error } = await this.supabase.getClient()
      .from('documentos')
      .select(`
        id, serie, numero, tipo_documento, fecha_emision, fecha_vencimiento,
        moneda, tipo_cambio, estado,
        subtotal, impuesto_igv, total,
        total_gravadas, total_exoneradas, total_inafectas, total_exportacion,
        receptor_tipo_doc, receptor_numero_doc, receptor_razon_social
      `)
      .eq('tenant_id', tenantId)
      .in('tipo_documento', ['FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO'])
      .gte('fecha_emision', fechaInicio)
      .lte('fecha_emision', `${fechaFin}T23:59:59`)
      .order('fecha_emision')
      .order('serie')
      .order('numero');

    if (error) {
      this.logger.error('Error obteniendo comprobantes de venta:', error);
      throw error;
    }

    const periodo = this.getPeriodoPle(anio, mes);
    const lineas: string[] = [];
    let correlativo = 1;

    for (const comprobante of comprobantes || []) {
      const doc = comprobante as any;
      const anulado = ['ANULADO', 'ANULADA', 'CANCELADO', 'CANCELADA'].includes(
        String(doc.estado || '').toUpperCase(),
      );
      const numeroDocIdentidad = String(doc.receptor_numero_doc || '').trim();
      const gravadas = Number(doc.total_gravadas ?? doc.subtotal ?? 0);
      const igv = Number(doc.impuesto_igv || 0);

      lineas.push(
        this.toPleLine([
          periodo,                                                        // 1  Periodo
          `M${correlativo.toString().padStart(8, '0')}`,                  // 2  CUO
          this.getCorrelativoPle(correlativo),                            // 3  Correlativo del asiento
          this.formatPleDate(doc.fecha_emision),                          // 4  Fecha de emision
          this.formatPleDate(doc.fecha_vencimiento),                      // 5  Fecha de vencimiento o pago
          this.codigoTipoComprobante(doc.tipo_documento),                 // 6  Tipo de comprobante (cat. 10)
          this.sanitizePleText(doc.serie, 20),                            // 7  Serie
          '',                                                             // 8  Numero de maquina registradora
          this.sanitizePleText(doc.numero, 20),                           // 9  Numero del comprobante
          '',                                                             // 10 Numero final (rangos de boletas)
          this.codigoTipoDocumentoIdentidad(doc.receptor_tipo_doc, numeroDocIdentidad), // 11 Tipo doc identidad (cat. 06)
          numeroDocIdentidad,                                             // 12 Numero doc identidad
          this.sanitizePleText(doc.receptor_razon_social, 100),           // 13 Apellidos y nombres o razon social
          this.formatPleAmount(doc.total_exportacion),                    // 14 Valor facturado de la exportacion
          this.formatPleAmount(gravadas),                                 // 15 Base imponible de la operacion gravada
          '0.00',                                                         // 16 Descuento de la base imponible
          this.formatPleAmount(igv),                                      // 17 IGV
          '0.00',                                                         // 18 Descuento del IGV
          this.formatPleAmount(doc.total_exoneradas),                     // 19 Importe total de la operacion exonerada
          this.formatPleAmount(doc.total_inafectas),                      // 20 Importe total de la operacion inafecta
          '0.00',                                                         // 21 ISC
          '0.00',                                                         // 22 Base imponible del arroz pilado
          '0.00',                                                         // 23 IVAP
          '0.00',                                                         // 24 Otros tributos y cargos
          this.formatPleAmount(doc.total),                                // 25 Importe total del comprobante
          this.sanitizePleText(doc.moneda || 'PEN', 3),                   // 26 Codigo de moneda (cat. 02)
          this.formatPleAmount(doc.tipo_cambio || 1),                     // 27 Tipo de cambio
          '',                                                             // 28 Fecha del comprobante modificado
          '',                                                             // 29 Tipo del comprobante modificado
          '',                                                             // 30 Serie del comprobante modificado
          '',                                                             // 31 Numero del comprobante modificado
          '',                                                             // 32 Identificacion del contrato o proyecto
          '',                                                             // 33 Error tipo 1: inconsistencia en el tipo de cambio
          '',                                                             // 34 Indicador de comprobante de pago cancelado
          '',                                                             // 35 Campo libre
          anulado ? '2' : '1',                                            // 36 Estado (1=informado, 2=anulado)
        ]),
      );
      correlativo++;
    }

    const filename = this.generarNombreArchivoPLE(ruc, anio, mes, '140100', lineas.length > 0);
    const content = lineas.join('\r\n');

    this.logger.log(`✅ Registro de Ventas PLE generado: ${filename} (${lineas.length} líneas)`);

    return { filename, content };
  }

  /**
   * Exporta el Registro de Compras (8.1) en formato PLE.
   *
   * Se toma de cuentas por pagar, que es donde queda el comprobante del
   * proveedor con su IGV. Solo lo gravado da derecho a credito fiscal: una
   * compra exonerada con IGV declarado seria un credito indebido, asi que
   * cuando el comprobante no trae impuesto la base va como no gravada.
   */
  async exportarRegistroCompras(anio: number, mes: number): Promise<{ filename: string; content: string }> {
    this.assertPeriodoValido(anio, mes);
    const tenantId = this.resolveTenantId();
    this.logger.log(`📚 Exportando Registro de Compras PLE ${anio}-${mes.toString().padStart(2, '0')}`);

    const { data: empresa } = await this.supabase.getClient()
      .from('empresa_config')
      .select('ruc, pais')
      .eq('tenant_id', tenantId)
      .single();

    this.assertPeruPle(empresa);
    const ruc = this.resolveRucPle(empresa);

    const fechaInicio = `${anio}-${mes.toString().padStart(2, '0')}-01`;
    const fechaFin = this.getFechaFinMes(anio, mes);

    const { data: compras, error } = await this.supabase.getClient()
      .from('cuentas_por_pagar')
      .select(`
        id, numero_documento, tipo_documento, fecha_emision, fecha_vencimiento,
        subtotal, igv, total, moneda, estado,
        proveedores!cuentas_por_pagar_proveedor_id_fkey(ruc, numero_documento, razon_social, tipo_documento)
      `)
      .eq('tenant_id', tenantId)
      .gte('fecha_emision', fechaInicio)
      .lte('fecha_emision', fechaFin)
      .order('fecha_emision')
      .order('numero_documento');

    if (error) {
      this.logger.error('Error obteniendo comprobantes de compra:', error);
      throw error;
    }

    const periodo = this.getPeriodoPle(anio, mes);
    const lineas: string[] = [];
    let correlativo = 1;

    for (const compra of compras || []) {
      const doc = compra as any;
      const anulado = ['ANULADA', 'ANULADO'].includes(String(doc.estado || '').toUpperCase());
      const proveedor = (Array.isArray(doc.proveedores) ? doc.proveedores[0] : doc.proveedores) || {};
      const numeroDocIdentidad = String(
        proveedor.ruc || proveedor.numero_documento || '',
      ).trim();
      const { serie, numero } = this.partirSerieNumero(doc.numero_documento);
      const igv = Number(doc.igv || 0);
      const base = Number(doc.subtotal || 0);
      // Sin IGV en el comprobante no hay credito fiscal que sustentar: la base
      // se declara como adquisicion no gravada, no como gravada con IGV cero.
      const baseGravada = igv > 0 ? base : 0;
      const baseNoGravada = igv > 0 ? 0 : base;

      lineas.push(
        this.toPleLine([
          periodo,                                                        // 1  Periodo
          `M${correlativo.toString().padStart(8, '0')}`,                  // 2  CUO
          this.getCorrelativoPle(correlativo),                            // 3  Correlativo del asiento
          this.formatPleDate(doc.fecha_emision),                          // 4  Fecha de emision del comprobante
          this.formatPleDate(doc.fecha_vencimiento),                      // 5  Fecha de vencimiento o pago
          this.codigoTipoComprobante(doc.tipo_documento),                 // 6  Tipo de comprobante (cat. 10)
          serie,                                                          // 7  Serie del comprobante
          '',                                                             // 8  Año de emision de la DUA
          numero,                                                         // 9  Numero del comprobante
          '',                                                             // 10 Numero final (rangos)
          this.codigoTipoDocumentoIdentidad(proveedor.tipo_documento, numeroDocIdentidad), // 11 Tipo doc identidad proveedor
          numeroDocIdentidad,                                             // 12 Numero doc identidad proveedor
          this.sanitizePleText(proveedor.razon_social, 100),              // 13 Apellidos y nombres o razon social
          this.formatPleAmount(baseGravada),                              // 14 Base imponible de adquisiciones gravadas destinadas a op. gravadas
          this.formatPleAmount(igv),                                      // 15 IGV de la casilla 14
          '0.00',                                                         // 16 Base imponible gravadas y no gravadas
          '0.00',                                                         // 17 IGV de la casilla 16
          '0.00',                                                         // 18 Base imponible destinada a op. no gravadas
          '0.00',                                                         // 19 IGV de la casilla 18
          '0.00',                                                         // 20 Valor de las adquisiciones no gravadas
          this.formatPleAmount(baseNoGravada),                            // 21 Importe de adquisiciones no gravadas
          '0.00',                                                         // 22 ISC
          '0.00',                                                         // 23 Otros tributos y cargos
          this.formatPleAmount(doc.total),                                // 24 Importe total de la adquisicion
          '',                                                             // 25 Codigo del pais del no domiciliado
          this.sanitizePleText(doc.moneda || 'PEN', 3),                   // 26 Codigo de moneda (cat. 02)
          '1.000',                                                        // 27 Tipo de cambio
          '',                                                             // 28 Fecha del comprobante modificado
          '',                                                             // 29 Tipo del comprobante modificado
          '',                                                             // 30 Serie del comprobante modificado
          '',                                                             // 31 Numero del comprobante modificado
          '',                                                             // 32 Fecha de emision de la constancia de detraccion
          '',                                                             // 33 Numero de la constancia de detraccion
          '',                                                             // 34 Marca del comprobante sujeto a retencion
          '',                                                             // 35 Clasificacion de los bienes y servicios
          '',                                                             // 36 Identificacion del contrato o proyecto
          '',                                                             // 37 Error tipo 1: comprobante que no cumple los requisitos
          '',                                                             // 38 Campo libre
          anulado ? '2' : '1',                                            // 39 Estado (1=informado, 2=anulado)
        ]),
      );
      correlativo++;
    }

    const filename = this.generarNombreArchivoPLE(ruc, anio, mes, '080100', lineas.length > 0);
    const content = lineas.join('\r\n');

    this.logger.log(`✅ Registro de Compras PLE generado: ${filename} (${lineas.length} líneas)`);

    return { filename, content };
  }

  /**
   * Exporta Balance de Comprobación (3.1) en formato PLE
   */
  async exportarBalanceComprobacion(anio: number, mes: number): Promise<{ filename: string; content: string }> {
    this.assertPeriodoValido(anio, mes);
    const tenantId = this.resolveTenantId();
    this.logger.log(`📚 Exportando Balance de Comprobación PLE ${anio}-${mes.toString().padStart(2, '0')}`);

    const { data: empresa } = await this.supabase.getClient()
      .from('empresa_config')
      .select('ruc, pais')
      .eq('tenant_id', tenantId)
      .single();

    this.assertPeruPle(empresa);
    const ruc = this.resolveRucPle(empresa);

    // Obtener saldos por cuenta
    const fechaInicio = `${anio}-${mes.toString().padStart(2, '0')}-01`;
    const fechaFin = new Date(anio, mes, 0).toISOString().split('T')[0];

    const { data: saldos, error } = await this.supabase.getClient()
      .rpc('calcular_balance_comprobacion', {
        p_tenant_id: tenantId,
        p_fecha_inicio: fechaInicio,
        p_fecha_fin: fechaFin,
      });

    // Si no existe la función RPC, calcular manualmente
    let balanceData = saldos;
    if (error || !saldos) {
      const { data: cuentas } = await this.supabase.getClient()
        .from('plan_cuentas')
        .select('id, codigo, nombre')
        .eq('tenant_id', tenantId)
        .eq('activo', true)
        .order('codigo');

      balanceData = [];
      for (const cuenta of cuentas || []) {
        const { data: totales } = await this.supabase.getClient()
          .from('detalle_asientos')
          .select(`
            debe,
            haber,
            asientos_contables!inner(
              tenant_id,
              fecha
            )
          `)
          .eq('cuenta_id', cuenta.id)
          .eq('asientos_contables.tenant_id', tenantId)
          .gte('asientos_contables.fecha', fechaInicio)
          .lte('asientos_contables.fecha', fechaFin);

        const totalDebe = (totales || []).reduce((sum, t) => sum + (t.debe || 0), 0);
        const totalHaber = (totales || []).reduce((sum, t) => sum + (t.haber || 0), 0);

        if (totalDebe > 0 || totalHaber > 0) {
          balanceData.push({
            codigo: cuenta.codigo,
            nombre: cuenta.nombre,
            debe: totalDebe,
            haber: totalHaber,
            saldo_deudor: totalDebe > totalHaber ? totalDebe - totalHaber : 0,
            saldo_acreedor: totalHaber > totalDebe ? totalHaber - totalDebe : 0,
          });
        }
      }
    }

    const lineas: string[] = [];
    const periodo = `${anio}${mes.toString().padStart(2, '0')}00`;

    for (const cuenta of balanceData || []) {
      // Formato PLE 3.1
      const linea = this.toPleLine([
        periodo,                              // 1. Período
        cuenta.codigo || '',                  // 2. Código cuenta
        this.formatPleAmount(cuenta.saldo_deudor),   // 3. Saldo deudor inicial
        this.formatPleAmount(cuenta.saldo_acreedor), // 4. Saldo acreedor inicial
        this.formatPleAmount(cuenta.debe),        // 5. Debe del período
        this.formatPleAmount(cuenta.haber),       // 6. Haber del período
        this.formatPleAmount(cuenta.saldo_deudor),   // 7. Saldo deudor final
        this.formatPleAmount(cuenta.saldo_acreedor), // 8. Saldo acreedor final
        '1',                                  // 9. Estado
      ]);

      lineas.push(linea);
    }

    const filename = this.generarNombreArchivoPLE(ruc, anio, mes, '030100', lineas.length > 0);
    const content = lineas.join('\r\n');

    this.logger.log(`✅ Balance de Comprobación PLE generado: ${filename} (${lineas.length} líneas)`);

    return { filename, content };
  }

  /**
   * Exporta todos los libros PLE del período
   */
  async exportarTodosPLE(anio: number, mes: number): Promise<Array<{ filename: string; content: string }>> {
    this.logger.log(`📚 Exportando todos los libros PLE ${anio}-${mes.toString().padStart(2, '0')}`);

    const resultados = await Promise.all([
      this.exportarRegistroVentas(anio, mes),
      this.exportarRegistroCompras(anio, mes),
      this.exportarLibroDiario(anio, mes),
      this.exportarLibroMayor(anio, mes),
      this.exportarBalanceComprobacion(anio, mes),
    ]);

    this.logger.log(`✅ Exportación PLE completa: ${resultados.length} archivos generados`);

    return resultados;
  }
}
