import assert from 'assert'
import { ComprasCxpIntegrationService } from '../../src/modules/compras/services/compras-cxp-integration.service'
import { RecepcionRegistradaEvent } from '../../src/shared/events/event-bus.service'

type AsyncTest = () => Promise<void> | void

interface TestCase {
  name: string
  fn: AsyncTest
}

const tests: TestCase[] = []

function test(name: string, fn: AsyncTest) {
  tests.push({ name, fn })
}

/**
 * Integration Tests: Compras CxP Integration
 * 
 * Tests the integration between Compras and Cuentas por Pagar (CxP)
 * Validates automatic CxP creation from reception events
 * 
 * Requirements: TASK 2.7 - Tests de integración
 */

// Mock data stores
let mockCuentasPorPagar: any[] = []
let mockEmpresaConfig: any[] = []
let mockProveedores: any[] = []
let mockOrdenDetalles: any[] = []
let mockRecepcionItems: any[] = []
let mockRecepciones: any[] = []
let mockOrdenesCompra: any[] = []

// Reset mocks before each test
function resetMocks() {
  mockCuentasPorPagar = []
  mockEmpresaConfig = []
  mockProveedores = []
  mockOrdenDetalles = []
  mockRecepcionItems = []
  mockRecepciones = []
  mockOrdenesCompra = []
}

// Mock Supabase client
function createMockSupabaseClient() {
  return {
    from: (table: string) => {
      const chainBuilder: any = {
        currentFilters: {} as any,
        
        select: function(fields?: string) {
          this.selectFields = fields
          return this
        },
        
        eq: function(field: string, value: any) {
          this.currentFilters[field] = value
          return this
        },
        
        like: function(field: string, value: any) {
          this.currentFilters[`${field}_like`] = value
          return this
        },
        
        order: function() {
          return this
        },
        
        limit: function(count: number) {
          this.limitCount = count
          return this
        },
        
        single: async function() {
          if (table === 'empresa_config') {
            const config = mockEmpresaConfig.find(c => c.tenant_id === this.currentFilters.tenant_id)
            return config ? { data: config, error: null } : { data: null, error: { message: 'Not found' } }
          }
          
          if (table === 'proveedores') {
            const proveedor = mockProveedores.find(p => 
              p.tenant_id === this.currentFilters.tenant_id && 
              p.id === this.currentFilters.id
            )
            return proveedor ? { data: proveedor, error: null } : { data: null, error: { message: 'Not found' } }
          }
          
          if (table === 'ordenes_compra') {
            const orden = mockOrdenesCompra.find(o => 
              o.tenant_id === this.currentFilters.tenant_id && 
              o.id === this.currentFilters.id
            )
            return orden ? { data: orden, error: null } : { data: null, error: { message: 'Not found' } }
          }
          
          return { data: null, error: { message: 'Not found' } }
        }
      }
      
      if (table === 'cuentas_por_pagar') {
        return {
          ...chainBuilder,
          insert: async (data: any) => {
            const cxp = Array.isArray(data) ? data[0] : data
            const nuevaCxp = {
              ...cxp,
              id: `cxp-${mockCuentasPorPagar.length + 1}`,
              created_at: new Date().toISOString()
            }
            mockCuentasPorPagar.push(nuevaCxp)
            
            return {
              select: () => ({
                single: async () => ({ data: nuevaCxp, error: null })
              })
            }
          },
          limit: async function(count: number) {
            const filtered = mockCuentasPorPagar.filter(c => 
              c.tenant_id === chainBuilder.currentFilters.tenant_id &&
              c.referencia_tipo === chainBuilder.currentFilters.referencia_tipo &&
              c.referencia_id === chainBuilder.currentFilters.referencia_id
            )
            return { data: filtered.slice(0, count), error: null }
          }
        }
      }

      if (table === 'orden_compra_detalles') {
        return {
          select: (fields?: string) => ({
            eq: (field: string, value: any) => {
              chainBuilder.currentFilters[field] = value
              return {
                data: mockOrdenDetalles.filter(d => d.orden_id === value),
                error: null
              }
            }
          })
        }
      }
      
      if (table === 'recepcion_items') {
        return {
          select: (fields?: string) => ({
            eq: (field: string, value: any) => {
              chainBuilder.currentFilters[field] = value
              return {
                data: mockRecepcionItems.filter(i => i.recepcion_id === value),
                error: null
              }
            }
          })
        }
      }
      
      if (table === 'recepciones') {
        return {
          select: (fields?: string) => ({
            eq: function(field: string, value: any) {
              chainBuilder.currentFilters[field] = value
              return this
            },
            data: mockRecepciones.filter(r => 
              r.tenant_id === chainBuilder.currentFilters.tenant_id &&
              r.orden_id === chainBuilder.currentFilters.orden_id &&
              r.estado === chainBuilder.currentFilters.estado
            ),
            error: null
          })
        }
      }
      
      return chainBuilder
    }
  }
}

// Mock EventBus
const mockEventBus = {
  onRecepcionRegistrada: (handler: any) => {
    // Store handler for manual invocation in tests
    mockEventBus._handler = handler
  },
  _handler: null as any
}

// Create service instance
function createService() {
  const mockSupabase = {
    getClient: () => createMockSupabaseClient()
  }
  
  return new ComprasCxpIntegrationService(
    mockEventBus as any,
    mockSupabase as any
  )
}

// Test 1: CxP creation with RECEPCION configuration
test('Compras CxP Integration – Crear CxP automáticamente cuando configuración es RECEPCION', async () => {
  resetMocks()
  
  const tenantId = 'tenant-test-001'
  const proveedorId = 'prov-001'
  const ordenId = 'orden-001'
  const recepcionId = 'rec-001'
  
  // Setup: Configure empresa to generate CxP on reception
  mockEmpresaConfig.push({
    tenant_id: tenantId,
    generar_cxp_en: 'RECEPCION'
  })
  
  // Setup: Add proveedor with payment terms
  mockProveedores.push({
    id: proveedorId,
    tenant_id: tenantId,
    condiciones_pago: '30 días',
    dias_credito: 30
  })
  
  // Setup: Add orden details
  mockOrdenDetalles.push(
    { id: 'det-1', orden_id: ordenId, producto_id: 'prod-1', precio_unitario: 100, cantidad: 10 },
    { id: 'det-2', orden_id: ordenId, producto_id: 'prod-2', precio_unitario: 50, cantidad: 20 }
  )
  
  // Setup: Add recepcion items (full reception)
  mockRecepcionItems.push(
    { recepcion_id: recepcionId, producto_id: 'prod-1', cantidad_recibida: 10, detalle_id: 'det-1', calidad: 'OK' },
    { recepcion_id: recepcionId, producto_id: 'prod-2', cantidad_recibida: 20, detalle_id: 'det-2', calidad: 'OK' }
  )
  
  // Setup: Add orden
  mockOrdenesCompra.push({
    id: ordenId,
    tenant_id: tenantId,
    estado: 'RECIBIDA'
  })
  
  // Setup: Add recepcion
  mockRecepciones.push({
    id: recepcionId,
    tenant_id: tenantId,
    orden_id: ordenId,
    estado: 'CERRADA'
  })
  
  const service = createService()
  
  // Create event
  const event: RecepcionRegistradaEvent = {
    recepcionId,
    numeroRecepcion: 'REC-2025-0001',
    ordenId,
    numeroOrden: 'OC-2025-0001',
    proveedorId,
    proveedorNombre: 'Proveedor Test',
    proveedorRuc: '20123456789',
    almacenId: 'alm-001',
    fechaRecepcion: '2025-01-15',
    subtotal: 2000,
    igv: 360,
    total: 2360,
    moneda: 'PEN',
    condicionesPago: '30 días',
    items: [],
    tenantId,
    eventId: `evt-${recepcionId}`,
    idempotencyKey: `recepcion:${tenantId}:${recepcionId}`,
    emittedAt: '2025-01-15T05:00:00.000Z',
  }
  
  // Execute: Trigger event handler
  await service['handleRecepcionRegistrada']({
    type: 'recepcion.registrada',
    data: event,
    timestamp: new Date(),
    module: 'compras'
  })
  
  // Assert: CxP was created
  assert.strictEqual(mockCuentasPorPagar.length, 1, 'Debe crear una CxP')
  
  const cxp = mockCuentasPorPagar[0]
  assert.strictEqual(cxp.tenant_id, tenantId, 'CxP debe tener el tenant correcto')
  assert.strictEqual(cxp.proveedor_id, proveedorId, 'CxP debe tener el proveedor correcto')
  assert.strictEqual(cxp.referencia_tipo, 'RECEPCION', 'CxP debe referenciar RECEPCION')
  assert.strictEqual(cxp.referencia_id, recepcionId, 'CxP debe referenciar la recepción correcta')
  assert.strictEqual(cxp.orden_compra_id, ordenId, 'CxP debe referenciar la orden de compra')
  assert.strictEqual(cxp.estado, 'PENDIENTE', 'CxP debe estar en estado PENDIENTE')
  assert.strictEqual(cxp.total, 2360, 'CxP debe tener el total correcto')
  assert.strictEqual(cxp.saldo, 2360, 'CxP debe tener el saldo igual al total')
  assert.strictEqual(cxp.moneda, 'PEN', 'CxP debe tener la moneda correcta')
  
  // Assert: Due date calculated correctly (30 days from reception)
  const fechaEmision = new Date('2025-01-15')
  const fechaVencimientoEsperada = new Date(fechaEmision)
  fechaVencimientoEsperada.setDate(fechaVencimientoEsperada.getDate() + 30)
  assert.strictEqual(cxp.fecha_vencimiento, fechaVencimientoEsperada.toISOString().split('T')[0], 'Fecha de vencimiento debe ser 30 días después')
})

// Test 2: Skip CxP creation when configuration is APROBACION_OC
test('Compras CxP Integration – No crear CxP cuando configuración es APROBACION_OC', async () => {
  resetMocks()
  
  const tenantId = 'tenant-test-002'
  
  // Setup: Configure empresa to generate CxP on OC approval
  mockEmpresaConfig.push({
    tenant_id: tenantId,
    generar_cxp_en: 'APROBACION_OC'
  })
  
  const service = createService()
  
  const event: RecepcionRegistradaEvent = {
    recepcionId: 'rec-002',
    numeroRecepcion: 'REC-2025-0002',
    ordenId: 'orden-002',
    numeroOrden: 'OC-2025-0002',
    proveedorId: 'prov-002',
    proveedorNombre: 'Proveedor Test 2',
    proveedorRuc: '20987654321',
    almacenId: 'alm-001',
    fechaRecepcion: '2025-01-15',
    subtotal: 1000,
    igv: 180,
    total: 1180,
    moneda: 'PEN',
    items: [],
    tenantId,
    eventId: 'evt-rec-002',
    idempotencyKey: `recepcion:${tenantId}:rec-002`,
    emittedAt: '2025-01-15T05:00:00.000Z',
  }
  
  await service['handleRecepcionRegistrada']({
    type: 'recepcion.registrada',
    data: event,
    timestamp: new Date(),
    module: 'compras'
  })
  
  // Assert: No CxP was created
  assert.strictEqual(mockCuentasPorPagar.length, 0, 'No debe crear CxP cuando configuración es APROBACION_OC')
})

// Test 3: Idempotency - don't create duplicate CxP
test('Compras CxP Integration – No crear CxP duplicada (idempotencia)', async () => {
  resetMocks()
  
  const tenantId = 'tenant-test-003'
  const recepcionId = 'rec-003'
  
  mockEmpresaConfig.push({
    tenant_id: tenantId,
    generar_cxp_en: 'RECEPCION'
  })
  
  // Setup: CxP already exists for this reception
  mockCuentasPorPagar.push({
    id: 'cxp-existing',
    tenant_id: tenantId,
    referencia_tipo: 'RECEPCION',
    referencia_id: recepcionId,
    total: 1180
  })
  
  const service = createService()
  
  const event: RecepcionRegistradaEvent = {
    recepcionId,
    numeroRecepcion: 'REC-2025-0003',
    ordenId: 'orden-003',
    numeroOrden: 'OC-2025-0003',
    proveedorId: 'prov-003',
    proveedorNombre: 'Proveedor Test 3',
    proveedorRuc: '20111222333',
    almacenId: 'alm-001',
    fechaRecepcion: '2025-01-15',
    subtotal: 1000,
    igv: 180,
    total: 1180,
    moneda: 'PEN',
    items: [],
    tenantId,
    eventId: `evt-${recepcionId}`,
    idempotencyKey: `recepcion:${tenantId}:${recepcionId}`,
    emittedAt: '2025-01-15T05:00:00.000Z',
  }
  
  await service['handleRecepcionRegistrada']({
    type: 'recepcion.registrada',
    data: event,
    timestamp: new Date(),
    module: 'compras'
  })
  
  // Assert: No new CxP was created
  assert.strictEqual(mockCuentasPorPagar.length, 1, 'No debe crear CxP duplicada')
  assert.strictEqual(mockCuentasPorPagar[0].id, 'cxp-existing', 'Debe mantener la CxP existente')
})

// Test 4: Partial reception - calculate correct amount
test('Compras CxP Integration – Calcular monto correcto para recepción parcial', async () => {
  resetMocks()
  
  const tenantId = 'tenant-test-004'
  const proveedorId = 'prov-004'
  const ordenId = 'orden-004'
  const recepcionId = 'rec-004'
  
  mockEmpresaConfig.push({
    tenant_id: tenantId,
    generar_cxp_en: 'RECEPCION'
  })
  
  mockProveedores.push({
    id: proveedorId,
    tenant_id: tenantId,
    condiciones_pago: 'CREDITO_30',
    dias_credito: 30
  })
  
  // Setup: Orden with 2 products
  mockOrdenDetalles.push(
    { id: 'det-1', orden_id: ordenId, producto_id: 'prod-1', precio_unitario: 100, cantidad: 10 },
    { id: 'det-2', orden_id: ordenId, producto_id: 'prod-2', precio_unitario: 50, cantidad: 20 }
  )
  
  // Setup: Partial reception - only 5 units of prod-1 and 10 units of prod-2
  mockRecepcionItems.push(
    { recepcion_id: recepcionId, producto_id: 'prod-1', cantidad_recibida: 5, detalle_id: 'det-1', calidad: 'OK' },
    { recepcion_id: recepcionId, producto_id: 'prod-2', cantidad_recibida: 10, detalle_id: 'det-2', calidad: 'OK' }
  )
  
  mockOrdenesCompra.push({
    id: ordenId,
    tenant_id: tenantId,
    estado: 'PARCIAL'
  })
  
  mockRecepciones.push({
    id: recepcionId,
    tenant_id: tenantId,
    orden_id: ordenId,
    estado: 'CERRADA'
  })
  
  const service = createService()
  
  const event: RecepcionRegistradaEvent = {
    recepcionId,
    numeroRecepcion: 'REC-2025-0004',
    ordenId,
    numeroOrden: 'OC-2025-0004',
    proveedorId,
    proveedorNombre: 'Proveedor Test 4',
    proveedorRuc: '20444555666',
    almacenId: 'alm-001',
    fechaRecepcion: '2025-01-15',
    subtotal: 2000, // Full order amount (fallback)
    igv: 360,
    total: 2360,
    moneda: 'PEN',
    items: [],
    tenantId,
    eventId: `evt-${recepcionId}`,
    idempotencyKey: `recepcion:${tenantId}:${recepcionId}`,
    emittedAt: '2025-01-15T05:00:00.000Z',
  }
  
  await service['handleRecepcionRegistrada']({
    type: 'recepcion.registrada',
    data: event,
    timestamp: new Date(),
    module: 'compras'
  })
  
  // Assert: CxP created with partial amount
  assert.strictEqual(mockCuentasPorPagar.length, 1, 'Debe crear una CxP')
  
  const cxp = mockCuentasPorPagar[0]
  
  // Expected: (5 * 100) + (10 * 50) = 500 + 500 = 1000
  // IGV: 1000 * 0.18 = 180
  // Total: 1000 + 180 = 1180
  assert.strictEqual(cxp.subtotal, 1000, 'Subtotal debe ser calculado según cantidades recibidas')
  assert.strictEqual(cxp.igv, 180, 'IGV debe ser 18% del subtotal')
  assert.strictEqual(cxp.total, 1180, 'Total debe ser subtotal + IGV')
  assert.strictEqual(cxp.saldo, 1180, 'Saldo debe ser igual al total')
  
  // Assert: Observaciones indicate partial reception
  assert.ok(cxp.observaciones.includes('parcial'), 'Observaciones deben indicar recepción parcial')
})

// Test 5: Exclude rejected items from CxP calculation
test('Compras CxP Integration – Excluir items rechazados del cálculo de CxP', async () => {
  resetMocks()
  
  const tenantId = 'tenant-test-005'
  const proveedorId = 'prov-005'
  const ordenId = 'orden-005'
  const recepcionId = 'rec-005'
  
  mockEmpresaConfig.push({
    tenant_id: tenantId,
    generar_cxp_en: 'RECEPCION'
  })
  
  mockProveedores.push({
    id: proveedorId,
    tenant_id: tenantId,
    condiciones_pago: '30 días',
    dias_credito: 30
  })
  
  mockOrdenDetalles.push(
    { id: 'det-1', orden_id: ordenId, producto_id: 'prod-1', precio_unitario: 100, cantidad: 10 },
    { id: 'det-2', orden_id: ordenId, producto_id: 'prod-2', precio_unitario: 50, cantidad: 20 }
  )
  
  // Setup: One item OK, one item REJECTED
  mockRecepcionItems.push(
    { recepcion_id: recepcionId, producto_id: 'prod-1', cantidad_recibida: 10, detalle_id: 'det-1', calidad: 'OK' },
    { recepcion_id: recepcionId, producto_id: 'prod-2', cantidad_recibida: 20, detalle_id: 'det-2', calidad: 'RECHAZADO' }
  )
  
  mockOrdenesCompra.push({
    id: ordenId,
    tenant_id: tenantId,
    estado: 'PARCIAL'
  })
  
  mockRecepciones.push({
    id: recepcionId,
    tenant_id: tenantId,
    orden_id: ordenId,
    estado: 'CERRADA'
  })
  
  const service = createService()
  
  const event: RecepcionRegistradaEvent = {
    recepcionId,
    numeroRecepcion: 'REC-2025-0005',
    ordenId,
    numeroOrden: 'OC-2025-0005',
    proveedorId,
    proveedorNombre: 'Proveedor Test 5',
    proveedorRuc: '20555666777',
    almacenId: 'alm-001',
    fechaRecepcion: '2025-01-15',
    subtotal: 2000,
    igv: 360,
    total: 2360,
    moneda: 'PEN',
    items: [],
    tenantId,
    eventId: `evt-${recepcionId}`,
    idempotencyKey: `recepcion:${tenantId}:${recepcionId}`,
    emittedAt: '2025-01-15T05:00:00.000Z',
  }
  
  await service['handleRecepcionRegistrada']({
    type: 'recepcion.registrada',
    data: event,
    timestamp: new Date(),
    module: 'compras'
  })
  
  const cxp = mockCuentasPorPagar[0]
  
  // Expected: Only prod-1 (10 * 100) = 1000
  // IGV: 1000 * 0.18 = 180
  // Total: 1000 + 180 = 1180
  assert.strictEqual(cxp.subtotal, 1000, 'Subtotal debe excluir items rechazados')
  assert.strictEqual(cxp.igv, 180, 'IGV debe calcularse solo sobre items aceptados')
  assert.strictEqual(cxp.total, 1180, 'Total debe ser solo de items aceptados')
})

// Test 6: Calculate due date with different payment terms
test('Compras CxP Integration – Calcular vencimiento según diferentes condiciones de pago', async () => {
  resetMocks()
  
  const tenantId = 'tenant-test-006'
  
  mockEmpresaConfig.push({
    tenant_id: tenantId,
    generar_cxp_en: 'RECEPCION'
  })
  
  const testCases = [
    { condiciones: 'CONTADO', diasEsperados: 0, descripcion: 'CONTADO debe ser mismo día' },
    { condiciones: '30 días', diasEsperados: 30, descripcion: '30 días debe ser 30 días después' },
    { condiciones: 'CREDITO_45', diasEsperados: 45, descripcion: 'CREDITO_45 debe ser 45 días después' },
    { condiciones: '15/30/45', diasEsperados: 15, descripcion: 'Cuotas múltiples debe usar primera cuota' }
  ]
  
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i]
    const proveedorId = `prov-006-${i}`
    const recepcionId = `rec-006-${i}`
    const ordenId = `orden-006-${i}`
    
    mockProveedores.push({
      id: proveedorId,
      tenant_id: tenantId,
      condiciones_pago: testCase.condiciones,
      dias_credito: testCase.diasEsperados
    })
    
    mockOrdenDetalles.push({
      id: `det-${i}`,
      orden_id: ordenId,
      producto_id: 'prod-1',
      precio_unitario: 100,
      cantidad: 10
    })
    
    mockRecepcionItems.push({
      recepcion_id: recepcionId,
      producto_id: 'prod-1',
      cantidad_recibida: 10,
      detalle_id: `det-${i}`,
      calidad: 'OK'
    })
    
    mockOrdenesCompra.push({
      id: ordenId,
      tenant_id: tenantId,
      estado: 'RECIBIDA'
    })
    
    mockRecepciones.push({
      id: recepcionId,
      tenant_id: tenantId,
      orden_id: ordenId,
      estado: 'CERRADA'
    })
    
    const service = createService()
    
    const event: RecepcionRegistradaEvent = {
      recepcionId,
      numeroRecepcion: `REC-2025-000${i}`,
      ordenId,
      numeroOrden: `OC-2025-000${i}`,
      proveedorId,
      proveedorNombre: `Proveedor Test ${i}`,
      proveedorRuc: '20666777888',
      almacenId: 'alm-001',
      fechaRecepcion: '2025-01-15',
      subtotal: 1000,
      igv: 180,
      total: 1180,
      moneda: 'PEN',
      condicionesPago: testCase.condiciones,
      items: [],
      tenantId,
      eventId: `evt-${recepcionId}`,
      idempotencyKey: `recepcion:${tenantId}:${recepcionId}`,
      emittedAt: '2025-01-15T05:00:00.000Z',
    }
    
    await service['handleRecepcionRegistrada']({
      type: 'recepcion.registrada',
      data: event,
      timestamp: new Date(),
      module: 'compras'
    })
  }
  
  // Assert: All CxPs created with correct due dates
  assert.strictEqual(mockCuentasPorPagar.length, testCases.length, 'Debe crear una CxP por cada caso')
  
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i]
    const cxp = mockCuentasPorPagar[i]
    
    const fechaEmision = new Date('2025-01-15')
    const fechaVencimientoEsperada = new Date(fechaEmision)
    fechaVencimientoEsperada.setDate(fechaVencimientoEsperada.getDate() + testCase.diasEsperados)
    
    assert.strictEqual(
      cxp.fecha_vencimiento,
      fechaVencimientoEsperada.toISOString().split('T')[0],
      testCase.descripcion
    )
  }
})

// Test 7: Multiple partial receptions create multiple CxPs
test('Compras CxP Integration – Múltiples recepciones parciales crean múltiples CxPs', async () => {
  resetMocks()
  
  const tenantId = 'tenant-test-007'
  const proveedorId = 'prov-007'
  const ordenId = 'orden-007'
  
  mockEmpresaConfig.push({
    tenant_id: tenantId,
    generar_cxp_en: 'RECEPCION'
  })
  
  mockProveedores.push({
    id: proveedorId,
    tenant_id: tenantId,
    condiciones_pago: '30 días',
    dias_credito: 30
  })
  
  mockOrdenDetalles.push({
    id: 'det-1',
    orden_id: ordenId,
    producto_id: 'prod-1',
    precio_unitario: 100,
    cantidad: 100
  })
  
  mockOrdenesCompra.push({
    id: ordenId,
    tenant_id: tenantId,
    estado: 'PARCIAL'
  })
  
  const service = createService()
  
  // First partial reception: 30 units
  const recepcionId1 = 'rec-007-1'
  mockRecepcionItems.push({
    recepcion_id: recepcionId1,
    producto_id: 'prod-1',
    cantidad_recibida: 30,
    detalle_id: 'det-1',
    calidad: 'OK'
  })
  
  mockRecepciones.push({
    id: recepcionId1,
    tenant_id: tenantId,
    orden_id: ordenId,
    estado: 'CERRADA'
  })
  
  const event1: RecepcionRegistradaEvent = {
    recepcionId: recepcionId1,
    numeroRecepcion: 'REC-2025-0007-1',
    ordenId,
    numeroOrden: 'OC-2025-0007',
    proveedorId,
    proveedorNombre: 'Proveedor Test 7',
    proveedorRuc: '20777888999',
    almacenId: 'alm-001',
    fechaRecepcion: '2025-01-15',
    subtotal: 3000,
    igv: 540,
    total: 3540,
    moneda: 'PEN',
    items: [],
    tenantId,
    eventId: `evt-${recepcionId1}`,
    idempotencyKey: `recepcion:${tenantId}:${recepcionId1}`,
    emittedAt: '2025-01-15T05:00:00.000Z',
  }
  
  await service['handleRecepcionRegistrada']({
    type: 'recepcion.registrada',
    data: event1,
    timestamp: new Date(),
    module: 'compras'
  })
  
  // Second partial reception: 40 units
  const recepcionId2 = 'rec-007-2'
  mockRecepcionItems.push({
    recepcion_id: recepcionId2,
    producto_id: 'prod-1',
    cantidad_recibida: 40,
    detalle_id: 'det-1',
    calidad: 'OK'
  })
  
  mockRecepciones.push({
    id: recepcionId2,
    tenant_id: tenantId,
    orden_id: ordenId,
    estado: 'CERRADA'
  })
  
  const event2: RecepcionRegistradaEvent = {
    recepcionId: recepcionId2,
    numeroRecepcion: 'REC-2025-0007-2',
    ordenId,
    numeroOrden: 'OC-2025-0007',
    proveedorId,
    proveedorNombre: 'Proveedor Test 7',
    proveedorRuc: '20777888999',
    almacenId: 'alm-001',
    fechaRecepcion: '2025-01-20',
    subtotal: 4000,
    igv: 720,
    total: 4720,
    moneda: 'PEN',
    items: [],
    tenantId,
    eventId: `evt-${recepcionId2}`,
    idempotencyKey: `recepcion:${tenantId}:${recepcionId2}`,
    emittedAt: '2025-01-20T05:00:00.000Z',
  }
  
  await service['handleRecepcionRegistrada']({
    type: 'recepcion.registrada',
    data: event2,
    timestamp: new Date(),
    module: 'compras'
  })
  
  // Assert: Two CxPs created
  assert.strictEqual(mockCuentasPorPagar.length, 2, 'Debe crear dos CxPs para dos recepciones parciales')
  
  // First CxP: 30 units * 100 = 3000 + 18% = 3540
  assert.strictEqual(mockCuentasPorPagar[0].subtotal, 3000, 'Primera CxP debe tener subtotal de 30 unidades')
  assert.strictEqual(mockCuentasPorPagar[0].total, 3540, 'Primera CxP debe tener total correcto')
  
  // Second CxP: 40 units * 100 = 4000 + 18% = 4720
  assert.strictEqual(mockCuentasPorPagar[1].subtotal, 4000, 'Segunda CxP debe tener subtotal de 40 unidades')
  assert.strictEqual(mockCuentasPorPagar[1].total, 4720, 'Segunda CxP debe tener total correcto')
  
  // Both should reference the same orden
  assert.strictEqual(mockCuentasPorPagar[0].orden_compra_id, ordenId, 'Primera CxP debe referenciar la orden')
  assert.strictEqual(mockCuentasPorPagar[1].orden_compra_id, ordenId, 'Segunda CxP debe referenciar la orden')
})

// Export tests for runner
export async function runComprasCxpIntegrationTests() {
  let passed = 0
  const results: Array<{ name: string; passed: boolean; error?: any }> = []

  for (const { name, fn } of tests) {
    try {
      await fn()
      console.log(`✅ ${name}`)
      results.push({ name, passed: true })
      passed += 1
    } catch (error) {
      console.error(`❌ ${name}`)
      console.error(error)
      results.push({ name, passed: false, error })
    }
  }

  console.log(`\n[Compras CxP Integration] ${passed}/${tests.length} pruebas superadas`)
  
  return {
    total: tests.length,
    passed,
    failed: tests.length - passed,
    results
  }
}

// Run tests if executed directly
if (require.main === module) {
  runComprasCxpIntegrationTests().then(({ passed, total }) => {
    process.exitCode = passed === total ? 0 : 1
  })
}
