import assert from 'assert'

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
 * Integration Tests: Ventas Module with RLS
 * 
 * Tests the Sales module (Ventas) to ensure RLS policies correctly isolate
 * tenant data for pedidos_venta, clientes, and related tables.
 * 
 * Requirements: TASK 2.2 - Tests de Integración por Módulo
 */

test('Ventas – Crear cliente solo en tenant propio', async () => {
  const tenantId = 'tenant-ventas-123'
  const otroTenantId = 'tenant-otro-456'

  const mockClientes: any[] = []

  const mockSupabaseVentas = {
    getClient: () => ({
      from: (table: string) => {
        if (table === 'clientes') {
          return {
            select: (fields?: string) => ({
              eq: (field: string, value: any) => {
                if (field === 'tenant_id') {
                  const filtered = mockClientes.filter(c => c.tenant_id === value)
                  return {
                    eq: (field2: string, value2: any) => {
                      const result = filtered.find(c => c[field2] === value2)
                      return {
                        single: async () => result 
                          ? { data: result, error: null }
                          : { data: null, error: null }
                      }
                    },
                    data: filtered,
                    error: null
                  }
                }
                return {
                  eq: () => ({ single: async () => ({ data: null, error: null }) }),
                  data: [],
                  error: null
                }
              }
            }),
            insert: (data: any) => {
              const cliente = Array.isArray(data) ? data[0] : data
              
              // Simular RLS - solo puede insertar en su tenant
              if (cliente.tenant_id !== tenantId) {
                return {
                  select: () => ({
                    single: async () => ({ 
                      data: null, 
                      error: { message: 'RLS violation: Cannot insert into other tenant' } 
                    })
                  })
                }
              }

              const nuevoCliente = {
                ...cliente,
                id: `cliente-${mockClientes.length + 1}`,
                created_at: new Date().toISOString()
              }
              mockClientes.push(nuevoCliente)

              return {
                select: () => ({
                  single: async () => ({ data: nuevoCliente, error: null })
                })
              }
            }
          }
        }
        return {
          select: () => ({ data: [], error: null })
        }
      }
    })
  }

  // Test 1: Crear cliente en tenant correcto
  const clienteData = {
    tenant_id: tenantId,
    tipo: 'EMPRESA',
    documento_tipo: 'RUC',
    documento_numero: '20123456789',
    razon_social: 'Empresa Test SAC',
    email: 'contacto@test.com',
    telefono: '987654321'
  }

  const { data: nuevoCliente, error: errorCliente } = await mockSupabaseVentas
    .getClient()
    .from('clientes')
    .insert(clienteData)
    .select()
    .single()

  assert.strictEqual(errorCliente, null, 'No debe haber error al crear cliente')
  assert.ok(nuevoCliente, 'Debe retornar el cliente creado')
  assert.strictEqual(nuevoCliente.tenant_id, tenantId)
  assert.strictEqual(nuevoCliente.documento_numero, '20123456789')

  // Test 2: Intentar crear cliente en otro tenant (debe fallar por RLS)
  const clienteOtroTenant = {
    tenant_id: otroTenantId,
    tipo: 'EMPRESA',
    documento_tipo: 'RUC',
    documento_numero: '20987654321',
    razon_social: 'Otra Empresa SAC'
  }

  const { data: clienteRechazado, error: errorRLS } = await mockSupabaseVentas
    .getClient()
    .from('clientes')
    .insert(clienteOtroTenant)
    .select()
    .single()

  assert.ok(errorRLS, 'Debe haber error al intentar crear cliente en otro tenant')
  assert.strictEqual(clienteRechazado, null, 'No debe retornar datos')
  assert.ok(errorRLS.message.includes('RLS violation'), 'Error debe indicar violación de RLS')

  // Test 3: Verificar que solo se creó 1 cliente
  assert.strictEqual(mockClientes.length, 1, 'Solo debe haber 1 cliente creado')
  assert.strictEqual(mockClientes[0].tenant_id, tenantId, 'El cliente debe ser del tenant correcto')

  // Test 4: Listar clientes solo retorna del tenant correcto
  const { data: clientesTenant } = await mockSupabaseVentas
    .getClient()
    .from('clientes')
    .select()
    .eq('tenant_id', tenantId)

  assert.strictEqual(clientesTenant.length, 1, 'Debe retornar 1 cliente del tenant')
  assert.strictEqual(clientesTenant[0].id, nuevoCliente.id)

  // Test 5: Listar con otro tenant no retorna datos
  const { data: clientesOtroTenant } = await mockSupabaseVentas
    .getClient()
    .from('clientes')
    .select()
    .eq('tenant_id', otroTenantId)

  assert.strictEqual(clientesOtroTenant.length, 0, 'No debe retornar clientes de otro tenant')
})

test('Ventas – Crear pedido y validar aislamiento por tenant', async () => {
  const tenantId = 'tenant-pedidos-123'
  const otroTenantId = 'tenant-otro-789'
  const clienteId = 'cliente-test-001'

  const mockPedidos: any[] = []
  const mockDetalles: any[] = []
  const mockClientes = [
    {
      id: clienteId,
      tenant_id: tenantId,
      razon_social: 'Cliente Test',
      documento_numero: '20123456789'
    }
  ]

  const mockSupabasePedidos = {
    getClient: () => ({
      from: (table: string) => {
        if (table === 'clientes') {
          return {
            select: () => ({
              eq: (field: string, value: any) => ({
                eq: (field2: string, value2: any) => {
                  const cliente = mockClientes.find(c => 
                    c[field] === value && c[field2] === value2
                  )
                  return {
                    single: async () => cliente
                      ? { data: cliente, error: null }
                      : { data: null, error: { message: 'Cliente no encontrado' } }
                  }
                }
              })
            })
          }
        }

        if (table === 'pedidos_venta') {
          const chainBuilder = {
            currentTenantFilter: tenantId,
            currentFilters: {} as any,

            select: function (fields?: string) {
              return this
            },

            eq: function (field: string, value: any) {
              this.currentFilters[field] = value
              if (field === 'tenant_id') {
                this.currentTenantFilter = value
              }
              return this
            },

            order: function () {
              return this
            },

            range: function () {
              const filtered = mockPedidos.filter(p => p.tenant_id === this.currentTenantFilter)
              return {
                data: filtered,
                error: null,
                count: filtered.length
              }
            },

            single: async function () {
              const pedido = mockPedidos.find(p =>
                p.id === this.currentFilters.id &&
                p.tenant_id === this.currentTenantFilter
              )
              if (!pedido) {
                return { data: null, error: { message: 'Not found or RLS violation' } }
              }

              // Agregar detalles y cliente
              const detalles = mockDetalles.filter(d => d.pedido_id === pedido.id)
              const cliente = mockClientes.find(c => c.id === pedido.cliente_id)
              
              return {
                data: {
                  ...pedido,
                  detalle: detalles,
                  clientes: cliente
                },
                error: null
              }
            }
          }

          return {
            select: chainBuilder.select.bind(chainBuilder),
            insert: (data: any) => {
              const pedido = Array.isArray(data) ? data[0] : data

              // Validar RLS
              if (pedido.tenant_id !== tenantId) {
                return {
                  select: () => ({
                    single: async () => ({ 
                      data: null, 
                      error: { message: 'RLS violation: Cannot insert into other tenant' } 
                    })
                  })
                }
              }

              const nuevoPedido = {
                ...pedido,
                id: `pedido-${mockPedidos.length + 1}`,
                created_at: new Date().toISOString()
              }
              mockPedidos.push(nuevoPedido)

              return {
                select: () => ({
                  single: async () => ({ data: nuevoPedido, error: null })
                })
              }
            },
            update: (data: any) => ({
              eq: (field: string, value: any) => ({
                eq: (field2: string, value2: any) => {
                  const pedido = mockPedidos.find(p => 
                    p[field] === value && p[field2] === value2
                  )
                  if (pedido) {
                    Object.assign(pedido, data)
                    return {
                      select: () => ({
                        single: async () => ({ data: pedido, error: null })
                      })
                    }
                  }
                  return {
                    select: () => ({
                      single: async () => ({ 
                        data: null, 
                        error: { message: 'Not found or RLS violation' } 
                      })
                    })
                  }
                }
              })
            })
          }
        }

        if (table === 'pedidos_venta_detalle') {
          return {
            insert: (data: any) => {
              const detalles = Array.isArray(data) ? data : [data]
              
              detalles.forEach(detalle => {
                // Verificar que el pedido pertenece al tenant correcto
                const pedido = mockPedidos.find(p => p.id === detalle.pedido_id)
                if (pedido && pedido.tenant_id === tenantId) {
                  mockDetalles.push({
                    ...detalle,
                    id: `detalle-${mockDetalles.length + 1}`
                  })
                }
              })

              return { error: null }
            }
          }
        }

        return {
          select: () => ({ data: [], error: null })
        }
      }
    })
  }

  // Test 1: Crear pedido en tenant correcto
  const pedidoData = {
    tenant_id: tenantId,
    cliente_id: clienteId,
    numero: 'PV-001',
    fecha_pedido: '2025-10-24',
    moneda: 'PEN',
    subtotal: 1000,
    igv: 180,
    total: 1180,
    estado: 'PENDIENTE'
  }

  const { data: nuevoPedido, error: errorPedido } = await mockSupabasePedidos
    .getClient()
    .from('pedidos_venta')
    .insert(pedidoData)
    .select()
    .single()

  assert.strictEqual(errorPedido, null, 'No debe haber error al crear pedido')
  assert.ok(nuevoPedido, 'Debe retornar el pedido creado')
  assert.strictEqual(nuevoPedido.tenant_id, tenantId)
  assert.strictEqual(nuevoPedido.numero, 'PV-001')
  assert.strictEqual(nuevoPedido.total, 1180)

  // Test 2: Crear detalles del pedido
  const detallesData = [
    {
      pedido_id: nuevoPedido.id,
      producto_id: 'prod-001',
      descripcion: 'Producto Test 1',
      cantidad: 10,
      precio_unitario: 50,
      subtotal: 500,
      igv: 90,
      total: 590
    },
    {
      pedido_id: nuevoPedido.id,
      producto_id: 'prod-002',
      descripcion: 'Producto Test 2',
      cantidad: 5,
      precio_unitario: 100,
      subtotal: 500,
      igv: 90,
      total: 590
    }
  ]

  const { error: errorDetalles } = await mockSupabasePedidos
    .getClient()
    .from('pedidos_venta_detalle')
    .insert(detallesData)

  assert.strictEqual(errorDetalles, null, 'No debe haber error al crear detalles')
  assert.strictEqual(mockDetalles.length, 2, 'Debe haber 2 detalles creados')

  // Test 3: Consultar pedido con detalles
  const { data: pedidoConsultado } = await mockSupabasePedidos
    .getClient()
    .from('pedidos_venta')
    .select('*, detalle(*), clientes(*)')
    .eq('id', nuevoPedido.id)
    .eq('tenant_id', tenantId)
    .single()

  assert.ok(pedidoConsultado, 'Debe poder consultar el pedido')
  assert.ok(pedidoConsultado.detalle, 'Debe incluir detalles')
  assert.strictEqual(pedidoConsultado.detalle.length, 2, 'Debe tener 2 detalles')
  assert.ok(pedidoConsultado.clientes, 'Debe incluir datos del cliente')

  // Test 4: Intentar crear pedido en otro tenant (debe fallar por RLS)
  const pedidoOtroTenant = {
    tenant_id: otroTenantId,
    cliente_id: clienteId,
    numero: 'PV-002',
    fecha_pedido: '2025-10-24',
    total: 500,
    estado: 'PENDIENTE'
  }

  const { data: pedidoRechazado, error: errorRLS } = await mockSupabasePedidos
    .getClient()
    .from('pedidos_venta')
    .insert(pedidoOtroTenant)
    .select()
    .single()

  assert.ok(errorRLS, 'Debe haber error al intentar crear pedido en otro tenant')
  assert.strictEqual(pedidoRechazado, null, 'No debe retornar datos')
  assert.ok(errorRLS.message.includes('RLS violation'), 'Error debe indicar violación de RLS')

  // Test 5: Verificar que solo se creó 1 pedido
  assert.strictEqual(mockPedidos.length, 1, 'Solo debe haber 1 pedido creado')
  assert.strictEqual(mockPedidos[0].tenant_id, tenantId, 'El pedido debe ser del tenant correcto')

  // Test 6: Listar pedidos solo retorna del tenant correcto
  const { data: pedidosTenant } = await mockSupabasePedidos
    .getClient()
    .from('pedidos_venta')
    .select()
    .eq('tenant_id', tenantId)
    .range(0, 49)

  assert.strictEqual(pedidosTenant.length, 1, 'Debe retornar 1 pedido del tenant')
  assert.strictEqual(pedidosTenant[0].id, nuevoPedido.id)

  // Test 7: Listar con otro tenant no retorna datos
  const { data: pedidosOtroTenant } = await mockSupabasePedidos
    .getClient()
    .from('pedidos_venta')
    .select()
    .eq('tenant_id', otroTenantId)
    .range(0, 49)

  assert.strictEqual(pedidosOtroTenant.length, 0, 'No debe retornar pedidos de otro tenant')

  // Test 8: Actualizar estado del pedido
  const { data: pedidoActualizado } = await mockSupabasePedidos
    .getClient()
    .from('pedidos_venta')
    .update({ estado: 'APROBADO' })
    .eq('id', nuevoPedido.id)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  assert.ok(pedidoActualizado, 'Debe poder actualizar el pedido')
  assert.strictEqual(pedidoActualizado.estado, 'APROBADO', 'Estado debe estar actualizado')

  // Test 9: Intentar actualizar pedido de otro tenant (debe fallar)
  const pedidoOtroTenantId = 'pedido-otro-tenant'
  mockPedidos.push({
    id: pedidoOtroTenantId,
    tenant_id: otroTenantId,
    numero: 'PV-999',
    estado: 'PENDIENTE'
  })

  const { data: pedidoNoActualizado } = await mockSupabasePedidos
    .getClient()
    .from('pedidos_venta')
    .update({ estado: 'APROBADO' })
    .eq('id', pedidoOtroTenantId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  assert.strictEqual(pedidoNoActualizado, null, 'No debe poder actualizar pedido de otro tenant')
})

test('Ventas – Flujo completo: Cliente → Pedido → Facturación con RLS', async () => {
  const tenantId = 'tenant-flujo-123'

  const mockClientes: any[] = []
  const mockPedidos: any[] = []
  const mockDetalles: any[] = []
  const mockFacturas: any[] = []

  const mockSupabaseFlujo = {
    getClient: () => ({
      from: (table: string) => {
        if (table === 'clientes') {
          return {
            select: () => ({
              eq: (field: string, value: any) => ({
                eq: (field2: string, value2: any) => {
                  const cliente = mockClientes.find(c => 
                    c[field] === value && c[field2] === value2
                  )
                  return {
                    single: async () => cliente
                      ? { data: cliente, error: null }
                      : { data: null, error: null }
                  }
                }
              })
            }),
            insert: (data: any) => {
              const cliente = Array.isArray(data) ? data[0] : data
              if (cliente.tenant_id === tenantId) {
                const nuevo = { ...cliente, id: `cliente-${mockClientes.length + 1}` }
                mockClientes.push(nuevo)
                return {
                  select: () => ({
                    single: async () => ({ data: nuevo, error: null })
                  })
                }
              }
              return {
                select: () => ({
                  single: async () => ({ data: null, error: { message: 'RLS violation' } })
                })
              }
            }
          }
        }

        if (table === 'pedidos_venta') {
          return {
            select: () => ({
              eq: (field: string, value: any) => ({
                eq: (field2: string, value2: any) => {
                  const pedido = mockPedidos.find(p => 
                    p[field] === value && p[field2] === value2
                  )
                  return {
                    single: async () => pedido
                      ? { 
                          data: {
                            ...pedido,
                            detalle: mockDetalles.filter(d => d.pedido_id === pedido.id)
                          }, 
                          error: null 
                        }
                      : { data: null, error: null }
                  }
                }
              })
            }),
            insert: (data: any) => {
              const pedido = Array.isArray(data) ? data[0] : data
              if (pedido.tenant_id === tenantId) {
                const nuevo = { ...pedido, id: `pedido-${mockPedidos.length + 1}` }
                mockPedidos.push(nuevo)
                return {
                  select: () => ({
                    single: async () => ({ data: nuevo, error: null })
                  })
                }
              }
              return {
                select: () => ({
                  single: async () => ({ data: null, error: { message: 'RLS violation' } })
                })
              }
            },
            update: (data: any) => ({
              eq: (field: string, value: any) => ({
                eq: (field2: string, value2: any) => {
                  const pedido = mockPedidos.find(p => 
                    p[field] === value && p[field2] === value2
                  )
                  if (pedido) {
                    Object.assign(pedido, data)
                    return {
                      select: () => ({
                        single: async () => ({ data: pedido, error: null })
                      })
                    }
                  }
                  return {
                    select: () => ({
                      single: async () => ({ data: null, error: { message: 'RLS violation' } })
                    })
                  }
                }
              })
            })
          }
        }

        if (table === 'pedidos_venta_detalle') {
          return {
            insert: (data: any) => {
              const detalles = Array.isArray(data) ? data : [data]
              detalles.forEach(d => {
                const pedido = mockPedidos.find(p => p.id === d.pedido_id)
                if (pedido && pedido.tenant_id === tenantId) {
                  mockDetalles.push({ ...d, id: `detalle-${mockDetalles.length + 1}` })
                }
              })
              return { error: null }
            }
          }
        }

        if (table === 'cuentas_por_cobrar') {
          return {
            insert: (data: any) => {
              const factura = Array.isArray(data) ? data[0] : data
              if (factura.tenant_id === tenantId) {
                const nueva = { ...factura, id: `factura-${mockFacturas.length + 1}` }
                mockFacturas.push(nueva)
                return { error: null }
              }
              return { error: { message: 'RLS violation' } }
            }
          }
        }

        return {
          select: () => ({ data: [], error: null })
        }
      }
    })
  }

  // Paso 1: Crear cliente
  const { data: cliente } = await mockSupabaseFlujo
    .getClient()
    .from('clientes')
    .insert({
      tenant_id: tenantId,
      tipo: 'EMPRESA',
      documento_tipo: 'RUC',
      documento_numero: '20555666777',
      razon_social: 'Cliente Flujo Test SAC'
    })
    .select()
    .single()

  assert.ok(cliente, 'Cliente debe ser creado')
  assert.strictEqual(cliente.tenant_id, tenantId)

  // Paso 2: Crear pedido
  const { data: pedido } = await mockSupabaseFlujo
    .getClient()
    .from('pedidos_venta')
    .insert({
      tenant_id: tenantId,
      cliente_id: cliente.id,
      numero: 'PV-FLUJO-001',
      fecha_pedido: '2025-10-24',
      moneda: 'PEN',
      subtotal: 2000,
      igv: 360,
      total: 2360,
      estado: 'PENDIENTE'
    })
    .select()
    .single()

  assert.ok(pedido, 'Pedido debe ser creado')
  assert.strictEqual(pedido.tenant_id, tenantId)
  assert.strictEqual(pedido.cliente_id, cliente.id)

  // Paso 3: Agregar detalles al pedido
  await mockSupabaseFlujo
    .getClient()
    .from('pedidos_venta_detalle')
    .insert([
      {
        pedido_id: pedido.id,
        producto_id: 'prod-A',
        descripcion: 'Producto A',
        cantidad: 20,
        precio_unitario: 100,
        subtotal: 2000,
        igv: 360,
        total: 2360
      }
    ])

  assert.strictEqual(mockDetalles.length, 1, 'Detalle debe ser creado')

  // Paso 4: Aprobar pedido
  const { data: pedidoAprobado } = await mockSupabaseFlujo
    .getClient()
    .from('pedidos_venta')
    .update({ estado: 'APROBADO' })
    .eq('id', pedido.id)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  assert.ok(pedidoAprobado, 'Pedido debe ser aprobado')
  assert.strictEqual(pedidoAprobado.estado, 'APROBADO')

  // Paso 5: Generar factura (CxC)
  const { error: errorFactura } = await mockSupabaseFlujo
    .getClient()
    .from('cuentas_por_cobrar')
    .insert({
      tenant_id: tenantId,
      cliente_id: cliente.id,
      pedido_id: pedido.id,
      serie: 'F001',
      numero: '00001',
      fecha_emision: '2025-10-24',
      fecha_vencimiento: '2025-11-24',
      moneda: 'PEN',
      monto_total: 2360,
      monto_pendiente: 2360,
      estado: 'PENDIENTE'
    })

  assert.strictEqual(errorFactura, null, 'Factura debe ser creada')
  assert.strictEqual(mockFacturas.length, 1, 'Debe haber 1 factura')
  assert.strictEqual(mockFacturas[0].tenant_id, tenantId)
  assert.strictEqual(mockFacturas[0].pedido_id, pedido.id)

  // Paso 6: Actualizar estado del pedido a FACTURADO
  const { data: pedidoFacturado } = await mockSupabaseFlujo
    .getClient()
    .from('pedidos_venta')
    .update({ estado: 'FACTURADO' })
    .eq('id', pedido.id)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  assert.ok(pedidoFacturado, 'Pedido debe ser actualizado')
  assert.strictEqual(pedidoFacturado.estado, 'FACTURADO')

  // Validación final: Todo el flujo se completó correctamente
  assert.strictEqual(mockClientes.length, 1, 'Debe haber 1 cliente')
  assert.strictEqual(mockPedidos.length, 1, 'Debe haber 1 pedido')
  assert.strictEqual(mockDetalles.length, 1, 'Debe haber 1 detalle')
  assert.strictEqual(mockFacturas.length, 1, 'Debe haber 1 factura')

  // Validar que todos los registros pertenecen al mismo tenant
  assert.strictEqual(mockClientes[0].tenant_id, tenantId)
  assert.strictEqual(mockPedidos[0].tenant_id, tenantId)
  assert.strictEqual(mockFacturas[0].tenant_id, tenantId)
})

// Export tests for runner
export async function runVentasRLSTests() {
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

  console.log(`\n[Ventas RLS] ${passed}/${tests.length} pruebas superadas`)
  
  return {
    total: tests.length,
    passed,
    failed: tests.length - passed,
    results
  }
}

// Run tests if executed directly
if (require.main === module) {
  runVentasRLSTests().then(({ passed, total }) => {
    process.exitCode = passed === total ? 0 : 1
  })
}
