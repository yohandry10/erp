import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';

/**
 * Servicio de Exportación PLE (Programa de Libros Electrónicos) SUNAT
 * Q56: Exporta libros contables en formato TXT pipe-delimited según especificaciones SUNAT
 * 
 * Libros soportados:
 * - 5.1 Libro Diario
 * - 6.1 Libro Mayor
 * - 3.1 Balance de Comprobación
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
      .select('ruc, razon_social')
      .eq('tenant_id', tenantId)
      .single();

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
      .select('ruc')
      .eq('tenant_id', tenantId)
      .single();

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
   * Exporta Balance de Comprobación (3.1) en formato PLE
   */
  async exportarBalanceComprobacion(anio: number, mes: number): Promise<{ filename: string; content: string }> {
    this.assertPeriodoValido(anio, mes);
    const tenantId = this.resolveTenantId();
    this.logger.log(`📚 Exportando Balance de Comprobación PLE ${anio}-${mes.toString().padStart(2, '0')}`);

    const { data: empresa } = await this.supabase.getClient()
      .from('empresa_config')
      .select('ruc')
      .eq('tenant_id', tenantId)
      .single();

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
      this.exportarLibroDiario(anio, mes),
      this.exportarLibroMayor(anio, mes),
      this.exportarBalanceComprobacion(anio, mes),
    ]);

    this.logger.log(`✅ Exportación PLE completa: ${resultados.length} archivos generados`);

    return resultados;
  }
}
