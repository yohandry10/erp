import { BadRequestException, Controller, Get, Query, UseGuards, Res, ServiceUnavailableException } from '@nestjs/common';
import { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { SupabaseService } from '../shared/supabase/supabase.service';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import Decimal from 'decimal.js';

@ApiTags('reports')
@Controller('reports')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly supabaseService: SupabaseService) { }

  private async ventasFiltradas(tenantId: string, filters: any): Promise<any[]> {
    for (const key of ['fechaInicio', 'fechaFin']) {
      const value = filters?.[key];
      if (value && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) {
        throw new BadRequestException(`${key} debe ser una fecha válida YYYY-MM-DD`);
      }
    }
    if (filters?.fechaInicio && filters?.fechaFin && filters.fechaInicio > filters.fechaFin) {
      throw new BadRequestException('El rango de fechas está invertido');
    }
    let query = this.supabaseService.getClient().from('documentos').select(`
      id, fecha:fecha_emision, estado, serie, numero_documento:numero, tipo_documento,
      subtotal, igv:impuesto_igv, total, moneda, cliente_id, metodo_pago,
      total_gravadas, total_exoneradas, total_inafectas, total_exportacion,
      clientes(nombre, razon_social, numero_documento, documento_numero, ruc, codigo, tipo_documento)
    `).eq('tenant_id', tenantId).in('tipo_documento', ['FACTURA', 'BOLETA'])
      .not('estado', 'in', '("ANULADO","ANULADA","CANCELADO","CANCELADA")')
      .order('fecha_emision', { ascending: false }).order('id', { ascending: false });
    // La emisión se guarda como fecha fiscal a medianoche UTC; incluir todo el
    // último día evita excluir documentos con hora en esa misma fecha.
    if (filters?.fechaInicio) query = query.gte('fecha_emision', `${filters.fechaInicio}T00:00:00.000Z`);
    if (filters?.fechaFin) {
      const nextDay = new Date(filters.fechaFin);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      query = query.lt('fecha_emision', nextDay.toISOString());
    }
    if (filters?.estado) query = query.eq('estado', filters.estado);
    if (filters?.moneda) query = query.eq('moneda', filters.moneda);
    const ventas: any[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await query.range(offset, offset + 999);
      if (error) throw new ServiceUnavailableException('No se pudo consultar el reporte de ventas');
      ventas.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const cliente = String(filters?.cliente || '').trim().toLocaleLowerCase('es-PE');
    return ventas.map(v => ({ ...v, clientes: v.clientes ? {
      ...v.clientes,
      nombre: v.clientes.razon_social || v.clientes.nombre || '',
      numero_documento: v.clientes.documento_numero || v.clientes.ruc || v.clientes.numero_documento || v.clientes.codigo || '',
    } : null })).filter(v => !cliente || [v.clientes?.nombre, v.clientes?.numero_documento]
      .some(value => String(value || '').toLocaleLowerCase('es-PE').includes(cliente)));
  }

  @Get('/ventas')
  @RequirePermission('reports.ventas.read') // HARDENING: reporte de ventas protegido.
  @ApiOperation({ summary: 'Reporte de ventas' })
  @ApiResponse({ status: 200, description: 'Reporte generado exitosamente' })
  async reporteVentas(
    @CurrentTenant() tenantId: string,
    @Query() query: any,
  ) {
    try {
      const ventas = await this.ventasFiltradas(tenantId, query);
      const empty = () => ({ subtotal: new Decimal(0), igv: new Decimal(0), total: new Decimal(0),
        exoneradas: new Decimal(0), inafectas: new Decimal(0), exportacion: new Decimal(0) });
      const porMoneda = new Map<string, ReturnType<typeof empty>>();
      for (const v of ventas) {
        const moneda = String(v.moneda || '').toUpperCase();
        const acc = porMoneda.get(moneda) || empty();
        acc.subtotal = acc.subtotal.plus(v.total_gravadas ?? v.subtotal ?? 0);
        acc.igv = acc.igv.plus(v.igv || 0);
        acc.total = acc.total.plus(v.total || 0);
        acc.exoneradas = acc.exoneradas.plus(v.total_exoneradas || 0);
        acc.inafectas = acc.inafectas.plus(v.total_inafectas || 0);
        acc.exportacion = acc.exportacion.plus(v.total_exportacion || 0);
        porMoneda.set(moneda, acc);
      }
      const numbers = (totals: ReturnType<typeof empty>) => Object.fromEntries(Object.entries(totals)
        .map(([key, value]) => [key, value.toDecimalPlaces(2).toNumber()]));
      const resumenPorMoneda = [...porMoneda].sort(([a], [b]) => a.localeCompare(b))
        .map(([moneda, totals]) => ({ moneda, ...numbers(totals) }));
      return {
        success: true,
        data: ventas,
        total: ventas.length,
        resumenPorMoneda,
        // Compatibilidad con un solo grupo; mezclar monedas no produce un escalar.
        resumen: porMoneda.size <= 1 ? numbers(porMoneda.values().next().value || empty()) : null,
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('No se pudo consultar el reporte de ventas');
    }
  }

  @Get('/ventas/export/excel')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @RequirePermission('reports.ventas.export')
  @ApiOperation({ summary: 'Exportar reporte de ventas a Excel' })
  @ApiResponse({ status: 200, description: 'Archivo Excel generado exitosamente' })
  async exportVentasExcel(
    @CurrentTenant() tenantId: string,
    @Query() query: any,
    @Res() res: Response,
  ) {
    try {
      const ventas = await this.ventasFiltradas(tenantId, query);

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Reporte de Ventas');

      worksheet.columns = [
        { header: 'Fecha', key: 'fecha', width: 15 },
        { header: 'Documento', key: 'numero_documento', width: 20 },
        { header: 'Cliente', key: 'cliente', width: 30 },
        { header: 'Estado', key: 'estado', width: 15 },
        { header: 'Moneda', key: 'moneda', width: 10 },
        { header: 'Base gravada', key: 'gravadas', width: 15 },
        { header: 'Exoneradas', key: 'exoneradas', width: 15 },
        { header: 'Inafectas', key: 'inafectas', width: 15 },
        { header: 'Exportación', key: 'exportacion', width: 15 },
        { header: 'IGV', key: 'igv', width: 15 },
        { header: 'Total', key: 'total', width: 15 },
      ];

      (ventas || []).forEach((v: any) => {
        worksheet.addRow({
          fecha: v.fecha,
          numero_documento: `${v.tipo_documento} ${v.serie ? v.serie + '-' : ''}${v.numero_documento}`,
          cliente: v.clientes?.nombre || 'Sin Cliente',
          estado: v.estado,
          moneda: v.moneda,
          // El Registro de Ventas pide las bases separadas; una sola columna
          // "Subtotal" obligaba al contador a deducir lo exonerado a mano.
          gravadas: v.total_gravadas ?? v.subtotal,
          exoneradas: v.total_exoneradas ?? 0,
          inafectas: v.total_inafectas ?? 0,
          exportacion: v.total_exportacion ?? 0,
          igv: v.igv,
          total: v.total,
        });
      });

      // Estilos básicos
      worksheet.getRow(1).font = { bold: true };

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=reporte_ventas_${new Date().toISOString().split('T')[0]}.xlsx`,
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      res.status(error instanceof BadRequestException ? 400 : 503)
        .json({ success: false, message: error instanceof BadRequestException ? error.message : 'No se pudo exportar el reporte de ventas' });
    }
  }

  @Get('/inventario')
  @RequirePermission('reports.inventario.read') // HARDENING: reporte inventario protegido.
  @ApiOperation({ summary: 'Reporte de inventario' })
  @ApiResponse({ status: 200, description: 'Reporte generado exitosamente' })
  async reporteInventario(@CurrentTenant() tenantId: string) {
    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('productos')
        .select('*')
        .eq('tenant_id', tenantId);

      if (error) throw error;

      return {
        success: true,
        data: data || [],
        total: data?.length || 0
      };
    } catch (error) {
      console.error('Error generando reporte de inventario:', error);
      throw error;
    }
  }
}
