import { Controller, Get, Query, UseGuards, Res } from '@nestjs/common';
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

  @Get('/ventas')
  @RequirePermission('reports.ventas.read') // HARDENING: reporte de ventas protegido.
  @ApiOperation({ summary: 'Reporte de ventas' })
  @ApiResponse({ status: 200, description: 'Reporte generado exitosamente' })
  async reporteVentas(
    @CurrentTenant() tenantId: string,
    @Query() query: any,
  ) {
    try {
      const fechaInicio = query?.fechaInicio;
      const fechaFin = query?.fechaFin;
      const estado = query?.estado;
      const moneda = query?.moneda;
      // La tabla `ventas` no la puebla ningún flujo; las ventas reales viven en
      // `documentos` (comprobantes emitidos). Se alias-ean columnas para conservar
      // el shape esperado por el frontend (fecha, numero_documento, igv).
      let listQuery = this.supabaseService
        .getClient()
        .from('documentos')
        .select(`
          id, fecha:fecha_emision, estado, numero_documento:numero, tipo_documento,
          subtotal, igv:impuesto_igv, total, moneda, cliente_id, metodo_pago,
          total_gravadas, total_exoneradas, total_inafectas, total_exportacion,
          clientes(nombre, numero_documento, tipo_documento)
        `)
        .eq('tenant_id', tenantId)
        .in('tipo_documento', ['FACTURA', 'BOLETA'])
        .not('estado', 'in', '("ANULADO","ANULADA","CANCELADO","CANCELADA")')
        .order('fecha_emision', { ascending: false });

      if (fechaInicio) listQuery = listQuery.gte('fecha_emision', fechaInicio);
      if (fechaFin) listQuery = listQuery.lte('fecha_emision', fechaFin);
      if (moneda) listQuery = listQuery.eq('moneda', moneda);

      const { data: ventas, error: listError } = await listQuery;
      if (listError) throw listError;

      // ✅ FIX: Usar Decimal.js para resúmenes financieros
      const resumen = (ventas || []).reduce(
        (acc: any, v: any) => {
          acc.subtotal = acc.subtotal.plus(v.subtotal || 0);
          acc.igv = acc.igv.plus(v.igv || 0);
          acc.total = acc.total.plus(v.total || 0);
          acc.exoneradas = acc.exoneradas.plus(v.total_exoneradas || 0);
          acc.inafectas = acc.inafectas.plus(v.total_inafectas || 0);
          acc.exportacion = acc.exportacion.plus(v.total_exportacion || 0);
          return acc;
        },
        {
          subtotal: new Decimal(0),
          igv: new Decimal(0),
          total: new Decimal(0),
          exoneradas: new Decimal(0),
          inafectas: new Decimal(0),
          exportacion: new Decimal(0)
        },
      );

      return {
        success: true,
        data: ventas || [],
        total: ventas?.length || 0,
        resumen: {
          subtotal: resumen.subtotal.toDecimalPlaces(2).toNumber(),
          igv: resumen.igv.toDecimalPlaces(2).toNumber(),
          total: resumen.total.toDecimalPlaces(2).toNumber(),
          // Sin estas bases el resumen no cuadraba: subtotal + IGV se quedaba
          // corto en toda venta con lineas exoneradas o inafectas.
          exoneradas: resumen.exoneradas.toDecimalPlaces(2).toNumber(),
          inafectas: resumen.inafectas.toDecimalPlaces(2).toNumber(),
          exportacion: resumen.exportacion.toDecimalPlaces(2).toNumber()
        },
      };
    } catch (error) {
      console.error('Error generando reporte de ventas:', error);
      throw error;
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
      const fechaInicio = query?.fechaInicio;
      const fechaFin = query?.fechaFin;
      const estado = query?.estado;
      const moneda = query?.moneda;

      // La tabla `ventas` no la puebla ningún flujo; las ventas reales viven en
      // `documentos` (comprobantes emitidos). Se alias-ean columnas para conservar
      // el shape esperado por el frontend (fecha, numero_documento, igv).
      let listQuery = this.supabaseService
        .getClient()
        .from('documentos')
        .select(`
          id, fecha:fecha_emision, estado, numero_documento:numero, tipo_documento,
          subtotal, igv:impuesto_igv, total, moneda, cliente_id, metodo_pago,
          total_gravadas, total_exoneradas, total_inafectas, total_exportacion,
          clientes(nombre, numero_documento, tipo_documento)
        `)
        .eq('tenant_id', tenantId)
        .in('tipo_documento', ['FACTURA', 'BOLETA'])
        .not('estado', 'in', '("ANULADO","ANULADA","CANCELADO","CANCELADA")')
        .order('fecha_emision', { ascending: false });

      if (fechaInicio) listQuery = listQuery.gte('fecha_emision', fechaInicio);
      if (fechaFin) listQuery = listQuery.lte('fecha_emision', fechaFin);
      if (moneda) listQuery = listQuery.eq('moneda', moneda);

      const { data: ventas, error: listError } = await listQuery;
      if (listError) throw listError;

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
          numero_documento: `${v.tipo_documento} ${v.numero_documento}`,
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
      console.error('Error exportando Excel:', error);
      res.status(500).json({ success: false, message: 'Error generando Excel' });
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
