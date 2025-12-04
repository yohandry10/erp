import { ImportExportService } from './import-export.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';

describe('ImportExportService', () => {
  let service: ImportExportService;
  let supabaseService: jest.Mocked<SupabaseService>;

  const mockSupabaseClient = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(),
    single: jest.fn(),
  };

  beforeEach(() => {
    supabaseService = {
      getClient: jest.fn().mockReturnValue(mockSupabaseClient),
    } as any;

    service = new ImportExportService(supabaseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getComprobantesTemplate', () => {
    it('debe retornar plantilla CSV con headers correctos', () => {
      const result = service.getComprobantesTemplate();

      expect(result.filename).toBe('plantilla_comprobantes.csv');
      expect(result.content).toContain('tipo_comprobante');
      expect(result.content).toContain('serie');
      expect(result.content).toContain('correlativo');
      expect(result.content).toContain('cliente_numero_doc');
      expect(result.content).toContain('afectacion_igv_item');
    });

    it('debe incluir fila de ejemplo', () => {
      const result = service.getComprobantesTemplate();
      const lines = result.content.split('\n');

      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(lines[1]).toContain('FA'); // tipo_comprobante ejemplo
      expect(lines[1]).toContain('F001'); // serie ejemplo
    });
  });

  describe('getCatalogoTemplate', () => {
    it('debe retornar plantilla CSV con headers correctos', () => {
      const result = service.getCatalogoTemplate();

      expect(result.filename).toBe('plantilla_catalogo.csv');
      expect(result.content).toContain('codigo');
      expect(result.content).toContain('nombre');
      expect(result.content).toContain('es_servicio');
      expect(result.content).toContain('controla_stock');
      expect(result.content).toContain('afectacion_igv');
      expect(result.content).toContain('precio_venta');
    });

    it('debe incluir fila de ejemplo', () => {
      const result = service.getCatalogoTemplate();
      const lines = result.content.split('\n');

      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(lines[1]).toContain('SERV-001'); // codigo ejemplo
      expect(lines[1]).toContain('Análisis Clínico'); // nombre ejemplo
    });
  });

  describe('validateComprobantesCsv', () => {
    it('debe validar CSV correcto', () => {
      const csv = `tipo_comprobante,serie,correlativo,fecha_emision,cliente_numero_doc,codigo_item,cantidad,precio_unitario,afectacion_igv_item
FA,F001,12345,2025-01-15,20123456789,ITEM-001,1,100.00,10`;

      const result = service.validateComprobantesCsv(csv);

      expect(result.success).toBe(true);
      expect(result.validRows).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('debe detectar archivo vacío', () => {
      const result = service.validateComprobantesCsv('');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Archivo vacío');
    });

    it('debe detectar headers faltantes', () => {
      const csv = `tipo_comprobante,serie
FA,F001`;

      const result = service.validateComprobantesCsv(csv);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Falta columna obligatoria'))).toBe(true);
    });

    it('debe detectar campos vacíos en filas', () => {
      const csv = `tipo_comprobante,serie,correlativo,fecha_emision,cliente_numero_doc,codigo_item,cantidad,precio_unitario,afectacion_igv_item
FA,,12345,2025-01-15,20123456789,ITEM-001,1,100.00,10`;

      const result = service.validateComprobantesCsv(csv);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('serie vacía'))).toBe(true);
    });

    it('debe detectar cantidad inválida', () => {
      const csv = `tipo_comprobante,serie,correlativo,fecha_emision,cliente_numero_doc,codigo_item,cantidad,precio_unitario,afectacion_igv_item
FA,F001,12345,2025-01-15,20123456789,ITEM-001,abc,100.00,10`;

      const result = service.validateComprobantesCsv(csv);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('cantidad inválida'))).toBe(true);
    });

    it('debe detectar precio_unitario inválido', () => {
      const csv = `tipo_comprobante,serie,correlativo,fecha_emision,cliente_numero_doc,codigo_item,cantidad,precio_unitario,afectacion_igv_item
FA,F001,12345,2025-01-15,20123456789,ITEM-001,1,invalid,10`;

      const result = service.validateComprobantesCsv(csv);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('precio_unitario inválido'))).toBe(true);
    });

    it('debe contar filas válidas e inválidas correctamente', () => {
      const csv = `tipo_comprobante,serie,correlativo,fecha_emision,cliente_numero_doc,codigo_item,cantidad,precio_unitario,afectacion_igv_item
FA,F001,12345,2025-01-15,20123456789,ITEM-001,1,100.00,10
FA,,12346,2025-01-15,20123456789,ITEM-002,2,50.00,10
FA,F001,12347,2025-01-15,20123456789,ITEM-003,3,75.00,10`;

      const result = service.validateComprobantesCsv(csv);

      expect(result.totalRows).toBe(3);
      expect(result.validRows).toBe(2);
    });
  });

  describe('validateCatalogoCsv', () => {
    it('debe validar CSV correcto', () => {
      const csv = `codigo,nombre,descripcion,es_servicio,controla_stock,afectacion_igv,precio_venta,moneda
PROD-001,Producto Test,Descripción,false,true,10,100.00,PEN`;

      const result = service.validateCatalogoCsv(csv);

      expect(result.success).toBe(true);
      expect(result.validRows).toBe(1);
    });

    it('debe detectar archivo vacío', () => {
      const result = service.validateCatalogoCsv('');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Archivo vacío');
    });

    it('debe detectar headers faltantes', () => {
      const csv = `codigo,nombre
PROD-001,Producto`;

      const result = service.validateCatalogoCsv(csv);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Falta columna obligatoria'))).toBe(true);
    });

    it('debe detectar codigo vacío', () => {
      const csv = `codigo,nombre,es_servicio,controla_stock,afectacion_igv,precio_venta,moneda
,Producto Test,false,true,10,100.00,PEN`;

      const result = service.validateCatalogoCsv(csv);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('codigo vacío'))).toBe(true);
    });

    it('debe detectar precio_venta inválido', () => {
      const csv = `codigo,nombre,es_servicio,controla_stock,afectacion_igv,precio_venta,moneda
PROD-001,Producto Test,false,true,10,invalid,PEN`;

      const result = service.validateCatalogoCsv(csv);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('precio_venta inválido'))).toBe(true);
    });

    it('debe detectar es_servicio con valor inválido', () => {
      const csv = `codigo,nombre,es_servicio,controla_stock,afectacion_igv,precio_venta,moneda
PROD-001,Producto Test,maybe,true,10,100.00,PEN`;

      const result = service.validateCatalogoCsv(csv);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('es_servicio debe ser true/false'))).toBe(true);
    });

    it('debe detectar controla_stock con valor inválido', () => {
      const csv = `codigo,nombre,es_servicio,controla_stock,afectacion_igv,precio_venta,moneda
PROD-001,Producto Test,false,maybe,10,100.00,PEN`;

      const result = service.validateCatalogoCsv(csv);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('controla_stock debe ser true/false'))).toBe(true);
    });

    it('debe detectar stock_inicial inválido', () => {
      const csv = `codigo,nombre,es_servicio,controla_stock,afectacion_igv,precio_venta,moneda,stock_inicial
PROD-001,Producto Test,false,true,10,100.00,PEN,abc`;

      const result = service.validateCatalogoCsv(csv);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('stock_inicial inválido'))).toBe(true);
    });
  });

  describe('importCatalogo', () => {
    const tenantId = 'tenant-123';

    it('debe crear producto nuevo cuando no existe', async () => {
      const csv = `codigo,nombre,es_servicio,controla_stock,afectacion_igv,precio_venta,moneda
PROD-001,Producto Test,false,true,10,100.00,PEN`;

      mockSupabaseClient.maybeSingle.mockResolvedValue({ data: null, error: null });
      mockSupabaseClient.single.mockResolvedValue({ data: { id: 'prod-uuid' }, error: null });

      const result = await service.importCatalogo(csv, tenantId);

      expect(result.success).toBe(true);
      expect(result.created).toBe(1);
      expect(result.updated).toBe(0);
    });

    it('debe actualizar producto existente', async () => {
      const csv = `codigo,nombre,es_servicio,controla_stock,afectacion_igv,precio_venta,moneda
PROD-001,Producto Actualizado,false,true,10,150.00,PEN`;

      mockSupabaseClient.maybeSingle.mockResolvedValue({ data: { id: 'existing-id' }, error: null });
      mockSupabaseClient.single.mockResolvedValue({ data: { id: 'existing-id' }, error: null });

      const result = await service.importCatalogo(csv, tenantId);

      expect(result.success).toBe(true);
      expect(result.created).toBe(0);
      expect(result.updated).toBe(1);
    });

    it('debe fallar validación antes de importar', async () => {
      const csv = `codigo,nombre
PROD-001,Producto`; // Faltan headers obligatorios

      const result = await service.importCatalogo(csv, tenantId);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Falta columna obligatoria'))).toBe(true);
    });

    it('debe manejar errores de base de datos', async () => {
      const csv = `codigo,nombre,es_servicio,controla_stock,afectacion_igv,precio_venta,moneda
PROD-001,Producto Test,false,true,10,100.00,PEN`;

      mockSupabaseClient.maybeSingle.mockResolvedValue({ data: null, error: null });
      mockSupabaseClient.single.mockResolvedValue({ data: null, error: { message: 'DB Error' } });

      const result = await service.importCatalogo(csv, tenantId);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('debe procesar múltiples filas', async () => {
      const csv = `codigo,nombre,es_servicio,controla_stock,afectacion_igv,precio_venta,moneda
PROD-001,Producto 1,false,true,10,100.00,PEN
PROD-002,Producto 2,true,false,10,200.00,PEN
PROD-003,Producto 3,false,true,10,300.00,PEN`;

      mockSupabaseClient.maybeSingle.mockResolvedValue({ data: null, error: null });
      mockSupabaseClient.single.mockResolvedValue({ data: { id: 'new-id' }, error: null });

      const result = await service.importCatalogo(csv, tenantId);

      expect(result.totalRows).toBe(3);
      expect(result.created).toBe(3);
    });

    it('debe manejar servicios sin control de stock', async () => {
      const csv = `codigo,nombre,es_servicio,controla_stock,afectacion_igv,precio_venta,moneda
SERV-001,Servicio Test,true,false,10,500.00,PEN`;

      mockSupabaseClient.maybeSingle.mockResolvedValue({ data: null, error: null });
      mockSupabaseClient.single.mockResolvedValue({ data: { id: 'serv-id' }, error: null });

      const result = await service.importCatalogo(csv, tenantId);

      expect(result.success).toBe(true);
      expect(result.created).toBe(1);
    });
  });
});
