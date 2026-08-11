import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { createHash } from 'node:crypto';

@Injectable()
export class ImportExportService {
  private readonly logger = new Logger(ImportExportService.name);

  constructor(private readonly supabase: SupabaseService) {}

  getComprobantesTemplate(): { filename: string; content: string } {
    const headers = [
      'tipo_comprobante',
      'serie',
      'correlativo',
      'fecha_emision',
      'moneda',
      'condicion_pago',
      'cliente_tipo_doc',
      'cliente_numero_doc',
      'cliente_razon_social',
      'afectacion_igv_item',
      'codigo_item',
      'descripcion_item',
      'cantidad',
      'precio_unitario',
    ];

    const sample = [
      'FA', // tipo_comprobante
      'F001', // serie
      '12345', // correlativo
      '2025-01-15', // fecha_emision
      'PEN', // moneda
      'CONTADO', // condicion_pago
      'RUC', // cliente_tipo_doc
      '20123456789', // cliente_numero_doc
      'EMPRESA DEMO SAC', // cliente_razon_social
      '10', // afectacion_igv_item (Gravado - Onerosa)
      'ITEM-001', // codigo_item
      'Servicio de laboratorio', // descripcion_item
      '1', // cantidad
      '100.00', // precio_unitario
    ];

    const content = `${headers.join(',')}\n${sample.join(',')}\n`;
    return {
      filename: 'plantilla_comprobantes.csv',
      content,
    };
  }

  getCatalogoTemplate(): { filename: string; content: string } {
    const headers = [
      'codigo',
      'nombre',
      'descripcion',
      'categoria',
      'es_servicio',       // true/false
      'controla_stock',    // true/false
      'afectacion_igv',    // 10, 20, 30, 40, etc.
      'tipo_operacion',    // Gravada/Exonerada/Inafecta
      'clasificador_sunat',
      'precio_venta',
      'precio_compra',
      'moneda',
      'sucursal_id',
      'stock_inicial',
      'stock_minimo',
      'stock_reservado',
      'favorito',
    ];

    const sample = [
      'SERV-001',
      'Análisis Clínico',
      'Perfil completo de laboratorio',
      'LABORATORIO',
      'true',
      'false',
      '10',
      'GRAVADA',
      '',
      '150.00',
      '80.00',
      'PEN',
      'sucursal-uuid',
      '0',
      '0',
      '0',
      'true',
    ];

    const content = `${headers.join(',')}\n${sample.join(',')}\n`;
    return {
      filename: 'plantilla_catalogo.csv',
      content,
    };
  }

  validateComprobantesCsv(content: string) {
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      return { success: false, errors: ['Archivo vacío'], totalRows: 0, validRows: 0 };
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const requiredHeaders = [
      'tipo_comprobante',
      'serie',
      'correlativo',
      'cliente_numero_doc',
      'codigo_item',
      'cantidad',
      'precio_unitario',
      'afectacion_igv_item',
    ];

    const headerErrors = requiredHeaders
      .filter((h) => !headers.includes(h))
      .map((h) => `Falta columna obligatoria: ${h}`);

    const rowErrors: string[] = [...headerErrors];
    let validRows = 0;

    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i];
      const cols = raw.split(',').map((c) => c.trim());
      if (cols.length === 0 || cols.every((c) => c === '')) continue;

      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = cols[idx] ?? '';
      });

      const errs: string[] = [];
      if (!row['tipo_comprobante']) errs.push('tipo_comprobante vacío');
      if (!row['serie']) errs.push('serie vacía');
      if (!row['correlativo']) errs.push('correlativo vacío');
      if (!row['cliente_numero_doc']) errs.push('cliente_numero_doc vacío');
      if (!row['codigo_item']) errs.push('codigo_item vacío');
      if (!row['cantidad'] || isNaN(Number(row['cantidad']))) errs.push('cantidad inválida');
      if (!row['precio_unitario'] || isNaN(Number(row['precio_unitario']))) errs.push('precio_unitario inválido');
      if (!row['afectacion_igv_item']) errs.push('afectacion_igv_item vacío');

      if (errs.length > 0) {
        rowErrors.push(`Fila ${i + 1}: ${errs.join('; ')}`);
      } else {
        validRows++;
      }
    }

    return {
      success: rowErrors.length === 0,
      errors: rowErrors,
      totalRows: lines.length - 1,
      validRows,
    };
  }

  validateCatalogoCsv(content: string) {
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      return { success: false, errors: ['Archivo vacío'], totalRows: 0, validRows: 0 };
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const requiredHeaders = [
      'codigo',
      'nombre',
      'es_servicio',
      'controla_stock',
      'afectacion_igv',
      'precio_venta',
      'moneda',
    ];

    const headerErrors = requiredHeaders
      .filter((h) => !headers.includes(h))
      .map((h) => `Falta columna obligatoria: ${h}`);

    const rowErrors: string[] = [...headerErrors];
    let validRows = 0;

    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i];
      const cols = raw.split(',').map((c) => c.trim());
      if (cols.length === 0 || cols.every((c) => c === '')) continue;

      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = cols[idx] ?? '';
      });

      const errs: string[] = [];
      if (!row['codigo']) errs.push('codigo vacío');
      if (!row['nombre']) errs.push('nombre vacío');
      if (!row['afectacion_igv']) errs.push('afectacion_igv vacía');
      if (!row['precio_venta'] || isNaN(Number(row['precio_venta']))) errs.push('precio_venta inválido');
      if (!row['moneda']) errs.push('moneda vacía');
      if (row['controla_stock'] && !['true', 'false', ''].includes(row['controla_stock'].toLowerCase())) {
        errs.push('controla_stock debe ser true/false');
      }
      if (row['es_servicio'] && !['true', 'false', ''].includes(row['es_servicio'].toLowerCase())) {
        errs.push('es_servicio debe ser true/false');
      }
      if (row['stock_inicial'] && row['stock_inicial'].length > 0 && isNaN(Number(row['stock_inicial']))) {
        errs.push('stock_inicial inválido');
      }
      if (row['stock_minimo'] && row['stock_minimo'].length > 0 && isNaN(Number(row['stock_minimo']))) {
        errs.push('stock_minimo inválido');
      }
      if (row['imagen_url']) {
        errs.push('imagen_url no se importa; cargue la foto desde alta o edición del producto');
      }

      if (errs.length > 0) {
        rowErrors.push(`Fila ${i + 1}: ${errs.join('; ')}`);
      } else {
        validRows++;
      }
    }

    return {
      success: rowErrors.length === 0,
      errors: rowErrors,
      totalRows: lines.length - 1,
      validRows,
    };
  }

  async importCatalogo(
    content: string,
    tenantId: string,
    actorId: string,
    importIntent: string,
  ) {
    const validation = this.validateCatalogoCsv(content);
    if (!validation.success) {
      return { success: false, ...validation };
    }

    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i];
      const cols = raw.split(',').map((c) => c.trim());
      if (cols.length === 0 || cols.every((c) => c === '')) continue;

      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = cols[idx] ?? '';
      });

      try {
        const esServicio = (row['es_servicio'] || '').toLowerCase() === 'true';
        const controlaStock = esServicio ? false : (row['controla_stock'] || 'true').toLowerCase() !== 'false';
        const precioVenta = Number(row['precio_venta'] || 0);
        const precioCompra = Number(row['precio_compra'] || 0);
        const stockInicial = Number(row['stock_inicial'] || 0);
        const stockMinimo = Number(row['stock_minimo'] || 0);
        const stockReservado = Number(row['stock_reservado'] || 0);
        const moneda = row['moneda'] || 'PEN';
        const sucursalId = row['sucursal_id'] || null;
        const almacenId = row['almacen_id'] || null;
        if (controlaStock && (stockInicial > 0 || stockReservado > 0) && !almacenId) {
          throw new Error('almacen_id es obligatorio cuando se importa stock inicial o reservado');
        }

        const codigo = row['codigo'].trim().toUpperCase();
        const rowIntent = `catalog:${createHash('sha256')
          .update(`${importIntent}:${i}:${codigo}`)
          .digest('hex')}`;
        // DTO canónico: el tenant y el actor sólo viajan como argumentos de la
        // RPC service_role; nunca se aceptan desde las columnas importadas.
        const baseProducto = {
          codigo,
          nombre: row['nombre'],
          descripcion: row['descripcion'] || '',
          categoria: row['categoria'] || '',
          es_servicio: esServicio,
          controla_stock: controlaStock,
          afectacion_igv: row['afectacion_igv'] || '10',
          tipo_operacion: row['tipo_operacion'] || null,
          clasificador_sunat: row['clasificador_sunat'] || null,
          favorito: (row['favorito'] || '').toLowerCase() === 'true',
          precio_venta: precioVenta,
          precio_compra: precioCompra,
          stock_minimo: stockMinimo,
        };

        const { data: existing, error: existingError } = await this.supabase.getClient()
          .from('productos')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('codigo', codigo)
          .maybeSingle();
        if (existingError) throw existingError;

        const preciosSucursal = sucursalId
          ? [{ sucursal_id: sucursalId, moneda, precio: precioVenta, activo: true }]
          : [];
        let productoId: string;
        if (existing?.id) {
          const { data: priorCreate, error: priorCreateError } = await this.supabase.getClient()
            .from('inventario_maestro_operaciones')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('entidad', 'PRODUCTO')
            .eq('accion', 'CREAR')
            .eq('idempotency_key', `${rowIntent}:create`)
            .maybeSingle();
          if (priorCreateError) throw priorCreateError;

          if (priorCreate?.id) {
            const { data, error } = await this.supabase.getClient().rpc(
              'crear_producto_maestro_tx',
              {
                p_tenant_id: tenantId,
                p_actor_id: actorId,
                p_idempotency_key: `${rowIntent}:create`,
                p_payload: {
                  ...baseProducto,
                  stock_inicial: stockInicial,
                  stock_reservado: stockReservado,
                  almacen_id: almacenId,
                  precios_sucursal: preciosSucursal,
                },
              },
            );
            if (error) throw error;
            productoId = data.id;
            created++;
          } else {
            if (controlaStock && (stockInicial > 0 || stockReservado > 0)) {
              throw new Error('El catálogo no puede sobrescribir stock de un producto existente; use la importación de stock inicial');
            }
            const { data, error } = await this.supabase.getClient().rpc(
              'actualizar_producto_maestro_tx',
              {
                p_tenant_id: tenantId,
                p_actor_id: actorId,
                p_producto_id: existing.id,
                p_idempotency_key: `${rowIntent}:update`,
                p_cambios: { ...baseProducto, precios_sucursal: preciosSucursal },
              },
            );
            if (error) throw error;
            productoId = data.id;
            updated++;
          }
        } else {
          const { data, error } = await this.supabase.getClient().rpc(
            'crear_producto_maestro_tx',
            {
              p_tenant_id: tenantId,
              p_actor_id: actorId,
              p_idempotency_key: `${rowIntent}:create`,
              p_payload: {
                ...baseProducto,
                stock_inicial: stockInicial,
                stock_reservado: stockReservado,
                almacen_id: almacenId,
                precios_sucursal: preciosSucursal,
              },
            },
          );
          if (error) throw error;
          productoId = data.id;
          created++;
        }
        if (!productoId) throw new Error('La RPC maestra no devolvió producto_id');
      } catch (err: any) {
        this.logger.error(`Error importando fila ${i + 1}: ${err.message}`);
        errors.push(`Fila ${i + 1}: ${err.message}`);
      }
    }

    return {
      success: errors.length === 0,
      created,
      updated,
      errors,
      totalRows: lines.length - 1,
    };
  }
}
