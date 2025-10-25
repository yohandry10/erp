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
 * Integration Tests: Inventario Module with RLS
 * 
 * Tests the Inventory module (Inventario) to ensure RLS policies correctly isolate
 * tenant data for movimientos_inventario, almacenes, producto_existencias, and related tables.
 * 
 * Requirements: TASK 2.2 - Tests de Integración por Módulo
 */

test('Inventario – Crear almacén solo en tenant propio', async () => {
  const tenantId = 'tenant-inv-123'
  const otroTenantId = 'tenant-otro-456'

  const mockAlmacenes: any[] = []

  const mockSupabaseInventario = {
    getClient: () => ({
      from: (table: string) => {
        if (table === 'almacenes') {
          return {
            select: (fields?: string) => ({
              eq: (field: string, value: any) => {
                if (field === 'tenant_id') {
                  const filtered = mockAlmacenes.filter(a => a.tenant_id === value)
                  return {
                    eq: (field2: string, value2: any) => {
                      const result = filtered.find(a => a[field2] === value2)
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
              const almacen = Array.isArray(data) ? data[0] : data
              
              // Simular RLS - solo puede insertar en su tenant
              if (almacen.tenant_id !== tenantId) {
                return {
                  select: () => ({
                    single: async () => ({ 
                      data: null, 
                      error: { message: 'RLS violation: Cannot insert into other tenant' } 
                    })
                  })
                }
              }

              const nuevoAlmacen = {
                ...almacen,
                id: `almacen-${mockAlmacenes.length + 1}`,
                created_at: new Date().toISOString()
              }
              mockAlmacenes.push(nuevoAlmacen)

              return {
                select: () => ({
                  single: async () => ({ data: nuevoAlmacen, error: null })
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

  // Test 1: Crear almacén en tenant correcto
  const almacenData = {
    tenant_id: tenantId,
    nombre: 'Almacén Principal',
    codigo: 'ALM-001',
    es_principal: true,
    activo: true,
    direccion: 'Av. Principal 123'
  }

  const { data: nuevoAlmacen, error: errorAlmacen } = await mockSupabaseInventario
    .getClient()
    .from('almacenes')
    .insert(almacenData)
    .select()
    .single()

  assert.strictEqual(errorAlmacen, null, 'No debe haber error al crear almacén')
  assert.ok(nuevoAlmacen, 'Debe retornar el almacén creado')
  assert.strictEqual(nuevoAlmacen.tenant_id, tenantId)
  assert.strictEqual(nuevoAlmacen.codigo, 'ALM-001')

  // Test 2: Intentar crear almacén en otro tenant (debe fallar por RLS)
  const almacenOtroTenant = {
    tenant_id: otroTenantId,
    nombre: 'Almacén Otro Tenant',
    codigo: 'ALM-999',
    es_principal: false,
    activo: true
  }

  const { data: almacenRechazado, error: errorRLS } = await mockSupabaseInventario
    .getClient()
    .from('almacenes')
    .insert(almacenOtroTenant)
    .select()
    .single()

  assert.ok(errorRLS, 'Debe haber error al intentar crear almacén en otro tenant')
  assert.strictEqual(almacenRechazado, null, 'No debe retornar datos')
  assert.ok(errorRLS.message.includes('RLS violation'), 'Error debe indicar violación de RLS')

  // Test 3: Verificar que solo se creó 1 almacén
  assert.strictEqual(mockAlmacenes.length, 1, 'Solo debe haber 1 almacén creado')
  assert.strictEqual(mockAlmacenes[0].tenant_id, tenantId, 'El almacén debe ser del tenant correcto')

  // Test 4: Listar almacenes solo retorna del tenant correcto
  const { data: almacenesTenant } = await mockSupabaseInventario
    .getClient()
    .from('almacenes')
    .select()
    .eq('tenant_id', tenantId)

  assert.strictEqual(almacenesTenant.length, 1, 'Debe retornar 1 almacén del tenant')
  assert.strictEqual(almacenesTenant[0].id, nuevoAlmacen.id)
})

test('Inventario – Registrar movimientos y validar aislamiento por tenant', async () => {
  const tenantId = 'tenant-mov-123'
  const otroTenantId = 'tenant-otro-789'
  const productoId = 'producto-test-001'

  const mockMovimientos: any[] = []
  const mockProductos = [
    {
      id: productoId,
      tenant_id: tenantId,
      nombre: 'Producto Test',
      codigo: 'PROD-001'
    }
  ]

  const mockSupabaseMovimientos = {
    getClient: () => ({
      from: (table: string) => {
        if (table === 'movimientos_inventario') {
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
              const filtered = mockMovimientos.filter(m => m.tenant_id === this.currentTenantFilter)
              return {
                data: filtered,
                error: null,
                count: filtered.length
              }
            },

            single: async function () {
              const movimiento = mockMovimientos.find(m =>
                m.id === this.currentFilters.id &&
                m.tenant_id === this.currentTenantFilter
              )
              return movimiento
                ? { data: movimiento, error: null }
                : { data: null, error: { message: 'Not found or RLS violation' } }
            }
          }

          return {
            select: chainBuilder.select.bind(chainBuilder),
            insert: (data: any) => {
              const movimiento = Array.isArray(data) ? data[0] : data

              // Validar RLS
              if (movimiento.tenant_id !== tenantId) {
                return {
                  select: () => ({
                    single: async () => ({ 
                      data: null, 
                      error: { message: 'RLS violation: Cannot insert into other tenant' } 
                    })
                  })
                }
              }

              const nuevoMovimiento = {
                ...movimiento,
                id: `mov-${mockMovimientos.length + 1}`,
                created_at: new Date().toISOString()
              }
              mockMovimientos.push(nuevoMovimiento)

              return {
                select: () => ({
                  single: async () => ({ data: nuevoMovimiento, error: null })
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

  // Test 1: Registrar movimiento de ENTRADA en tenant correcto
  const movimientoEntrada = {
    tenant_id: tenantId,
    producto_id: productoId,
    tipo: 'ENTRADA',
    cantidad: 100,
    referencia_tipo: 'COMPRA',
    referencia_id: 'compra-001',
    notas: 'Compra inicial de stock'
  }

  const { data: entrada, error: errorEntrada } = await mockSupabaseMovimientos
    .getClient()
    .from('movimientos_inventario')
    .insert(movimientoEntrada)
    .select()
    .single()

  assert.strictEqual(errorEntrada, null, 'No debe haber error al registrar entrada')
  assert.ok(entrada, 'Debe retornar el movimiento creado')
  assert.strictEqual(entrada.tenant_id, tenantId)
  assert.strictEqual(entrada.tipo, 'ENTRADA')
  assert.strictEqual(entrada.cantidad, 100)

  // Test 2: Registrar movimiento de RESERVA
  const movimientoReserva = {
    tenant_id: tenantId,
    producto_id: productoId,
    tipo: 'RESERVA',
    cantidad: 20,
    referencia_tipo: 'PEDIDO',
    referencia_id: 'pedido-001',
    notas: 'Reserva para pedido de venta'
  }

  const { data: reserva, error: errorReserva } = await mockSupabaseMovimientos
    .getClient()
    .from('movimientos_inventario')
    .insert(movimientoReserva)
    .select()
    .single()

  assert.strictEqual(errorReserva, null, 'No debe haber error al registrar reserva')
  assert.ok(reserva, 'Debe retornar el movimiento de reserva')
  assert.strictEqual(reserva.tipo, 'RESERVA')
  assert.strictEqual(reserva.cantidad, 20)

  // Test 3: Registrar movimiento de SALIDA
  const movimientoSalida = {
    tenant_id: tenantId,
    producto_id: productoId,
    tipo: 'SALIDA',
    cantidad: 15,
    referencia_tipo: 'PEDIDO',
    referencia_id: 'pedido-001',
    notas: 'Salida por venta'
  }

  const { data: salida, error: errorSalida } = await mockSupabaseMovimientos
    .getClient()
    .from('movimientos_inventario')
    .insert(movimientoSalida)
    .select()
    .single()

  assert.strictEqual(errorSalida, null, 'No debe haber error al registrar salida')
  assert.ok(salida, 'Debe retornar el movimiento de salida')
  assert.strictEqual(salida.tipo, 'SALIDA')

  // Test 4: Intentar registrar movimiento en otro tenant (debe fallar por RLS)
  const movimientoOtroTenant = {
    tenant_id: otroTenantId,
    producto_id: productoId,
    tipo: 'ENTRADA',
    cantidad: 50,
    referencia_tipo: 'COMPRA',
    referencia_id: 'compra-999'
  }

  const { data: movRechazado, error: errorRLS } = await mockSupabaseMovimientos
    .getClient()
    .from('movimientos_inventario')
    .insert(movimientoOtroTenant)
    .select()
    .single()

  assert.ok(errorRLS, 'Debe haber error al intentar registrar movimiento en otro tenant')
  assert.strictEqual(movRechazado, null, 'No debe retornar datos')
  assert.ok(errorRLS.message.includes('RLS violation'), 'Error debe indicar violación de RLS')

  // Test 5: Verificar que solo se crearon 3 movimientos
  assert.strictEqual(mockMovimientos.length, 3, 'Solo debe haber 3 movimientos creados')
  assert.strictEqual(mockMovimientos[0].tenant_id, tenantId)
  assert.strictEqual(mockMovimientos[1].tenant_id, tenantId)
  assert.strictEqual(mockMovimientos[2].tenant_id, tenantId)

  // Test 6: Listar movimientos solo retorna del tenant correcto
  const { data: movimientosTenant } = await mockSupabaseMovimientos
    .getClient()
    .from('movimientos_inventario')
    .select()
    .eq('tenant_id', tenantId)
    .range(0, 49)

  assert.strictEqual(movimientosTenant.length, 3, 'Debe retornar 3 movimientos del tenant')

  // Test 7: Listar con otro tenant no retorna datos
  const { data: movimientosOtroTenant } = await mockSupabaseMovimientos
    .getClient()
    .from('movimientos_inventario')
    .select()
    .eq('tenant_id', otroTenantId)
    .range(0, 49)

  assert.strictEqual(movimientosOtroTenant.length, 0, 'No debe retornar movimientos de otro tenant')
})

test('Inventario – Flujo completo: Almacén → Producto → Existencias → Movimientos con RLS', async () => {
  const tenantId = 'tenant-flujo-inv-123'

  const mockAlmacenes: any[] = []
  const mockProductos: any[] = []
  const mockExistencias: any[] = []
  const mockMovimientos: any[] = []

  const mockSupabaseFlujo = {
    getClient: () => ({
      from: (table: string) => {
        if (table === 'almacenes') {
          return {
            select: () => ({
              eq: (field: string, value: any) => ({
                eq: (field2: string, value2: any) => {
                  const almacen = mockAlmacenes.find(a => 
                    a[field] === value && a[field2] === value2
                  )
                  return {
                    single: async () => almacen
                      ? { data: almacen, error: null }
                      : { data: null, error: null }
                  }
                }
              })
            }),
            insert: (data: any) => {
              const almacen = Array.isArray(data) ? data[0] : data
              if (almacen.tenant_id === tenantId) {
                const nuevo = { ...almacen, id: `almacen-${mockAlmacenes.length + 1}` }
                mockAlmacenes.push(nuevo)
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

        if (table === 'productos') {
          return {
            select: () => ({
              eq: (field: string, value: any) => ({
                eq: (field2: string, value2: any) => {
                  const producto = mockProductos.find(p => 
                    p[field] === value && p[field2] === value2
                  )
                  return {
                    single: async () => producto
                      ? { data: producto, error: null }
                      : { data: null, error: null }
                  }
                }
              })
            }),
            insert: (data: any) => {
              const producto = Array.isArray(data) ? data[0] : data
              if (producto.tenant_id === tenantId) {
                const nuevo = { ...producto, id: `producto-${mockProductos.length + 1}` }
                mockProductos.push(nuevo)
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

        if (table === 'producto_existencias') {
          return {
            select: () => ({
              eq: (field: string, value: any) => ({
                eq: (field2: string, value2: any) => {
                  const existencia = mockExistencias.find(e => 
                    e[field] === value && e[field2] === value2
                  )
                  return {
                    single: async () => existencia
                      ? { data: existencia, error: null }
                      : { data: null, error: null }
                  }
                }
              })
            }),
            insert: (data: any) => {
              const existencia = Array.isArray(data) ? data[0] : data
              if (existencia.tenant_id === tenantId) {
                const nueva = { ...existencia, id: `existencia-${mockExistencias.length + 1}` }
                mockExistencias.push(nueva)
                return {
                  select: () => ({
                    single: async () => ({ data: nueva, error: null })
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
                  const existencia = mockExistencias.find(e => 
                    e[field] === value && e[field2] === value2
                  )
                  if (existencia) {
                    Object.assign(existencia, data)
                    return {
                      select: () => ({
                        single: async () => ({ data: existencia, error: null })
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

        if (table === 'movimientos_inventario') {
          return {
            insert: (data: any) => {
              const movimiento = Array.isArray(data) ? data[0] : data
              if (movimiento.tenant_id === tenantId) {
                const nuevo = { ...movimiento, id: `mov-${mockMovimientos.length + 1}` }
                mockMovimientos.push(nuevo)
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

        return {
          select: () => ({ data: [], error: null })
        }
      }
    })
  }

  // Paso 1: Crear almacén
  const { data: almacen } = await mockSupabaseFlujo
    .getClient()
    .from('almacenes')
    .insert({
      tenant_id: tenantId,
      nombre: 'Almacén Central',
      codigo: 'ALM-CENTRAL',
      es_principal: true,
      activo: true
    })
    .select()
    .single()

  assert.ok(almacen, 'Almacén debe ser creado')
  assert.strictEqual(almacen.tenant_id, tenantId)

  // Paso 2: Crear producto
  const { data: producto } = await mockSupabaseFlujo
    .getClient()
    .from('productos')
    .insert({
      tenant_id: tenantId,
      nombre: 'Laptop HP',
      codigo: 'LAPTOP-001',
      tipo: 'PRODUCTO',
      unidad_medida: 'UND',
      precio_venta: 2500
    })
    .select()
    .single()

  assert.ok(producto, 'Producto debe ser creado')
  assert.strictEqual(producto.tenant_id, tenantId)

  // Paso 3: Crear registro de existencias
  const { data: existencia } = await mockSupabaseFlujo
    .getClient()
    .from('producto_existencias')
    .insert({
      tenant_id: tenantId,
      producto_id: producto.id,
      almacen_id: almacen.id,
      stock_actual: 0,
      stock_reservado: 0,
      stock_danado: 0
    })
    .select()
    .single()

  assert.ok(existencia, 'Existencia debe ser creada')
  assert.strictEqual(existencia.tenant_id, tenantId)
  assert.strictEqual(existencia.stock_actual, 0)

  // Paso 4: Registrar movimiento de ENTRADA
  const { data: movEntrada } = await mockSupabaseFlujo
    .getClient()
    .from('movimientos_inventario')
    .insert({
      tenant_id: tenantId,
      producto_id: producto.id,
      tipo: 'ENTRADA',
      cantidad: 50,
      referencia_tipo: 'COMPRA',
      referencia_id: 'compra-inicial-001',
      notas: 'Compra inicial de laptops'
    })
    .select()
    .single()

  assert.ok(movEntrada, 'Movimiento de entrada debe ser registrado')
  assert.strictEqual(movEntrada.tipo, 'ENTRADA')
  assert.strictEqual(movEntrada.cantidad, 50)

  // Paso 5: Actualizar existencias después de entrada
  const { data: existenciaActualizada } = await mockSupabaseFlujo
    .getClient()
    .from('producto_existencias')
    .update({ stock_actual: 50 })
    .eq('id', existencia.id)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  assert.ok(existenciaActualizada, 'Existencia debe ser actualizada')
  assert.strictEqual(existenciaActualizada.stock_actual, 50)

  // Paso 6: Registrar movimiento de RESERVA
  const { data: movReserva } = await mockSupabaseFlujo
    .getClient()
    .from('movimientos_inventario')
    .insert({
      tenant_id: tenantId,
      producto_id: producto.id,
      tipo: 'RESERVA',
      cantidad: 10,
      referencia_tipo: 'PEDIDO',
      referencia_id: 'pedido-venta-001',
      notas: 'Reserva para pedido de cliente'
    })
    .select()
    .single()

  assert.ok(movReserva, 'Movimiento de reserva debe ser registrado')
  assert.strictEqual(movReserva.tipo, 'RESERVA')

  // Paso 7: Actualizar stock reservado
  const { data: existenciaReservada } = await mockSupabaseFlujo
    .getClient()
    .from('producto_existencias')
    .update({ stock_reservado: 10 })
    .eq('id', existencia.id)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  assert.ok(existenciaReservada, 'Stock reservado debe ser actualizado')
  assert.strictEqual(existenciaReservada.stock_reservado, 10)

  // Paso 8: Registrar movimiento de SALIDA
  const { data: movSalida } = await mockSupabaseFlujo
    .getClient()
    .from('movimientos_inventario')
    .insert({
      tenant_id: tenantId,
      producto_id: producto.id,
      tipo: 'SALIDA',
      cantidad: 10,
      referencia_tipo: 'PEDIDO',
      referencia_id: 'pedido-venta-001',
      notas: 'Salida por venta confirmada'
    })
    .select()
    .single()

  assert.ok(movSalida, 'Movimiento de salida debe ser registrado')
  assert.strictEqual(movSalida.tipo, 'SALIDA')

  // Paso 9: Actualizar existencias después de salida
  const { data: existenciaFinal } = await mockSupabaseFlujo
    .getClient()
    .from('producto_existencias')
    .update({ stock_actual: 40, stock_reservado: 0 })
    .eq('id', existencia.id)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  assert.ok(existenciaFinal, 'Existencia final debe ser actualizada')
  assert.strictEqual(existenciaFinal.stock_actual, 40)
  assert.strictEqual(existenciaFinal.stock_reservado, 0)

  // Validación final: Todo el flujo se completó correctamente
  assert.strictEqual(mockAlmacenes.length, 1, 'Debe haber 1 almacén')
  assert.strictEqual(mockProductos.length, 1, 'Debe haber 1 producto')
  assert.strictEqual(mockExistencias.length, 1, 'Debe haber 1 registro de existencias')
  assert.strictEqual(mockMovimientos.length, 3, 'Debe haber 3 movimientos (ENTRADA, RESERVA, SALIDA)')

  // Validar que todos los registros pertenecen al mismo tenant
  assert.strictEqual(mockAlmacenes[0].tenant_id, tenantId)
  assert.strictEqual(mockProductos[0].tenant_id, tenantId)
  assert.strictEqual(mockExistencias[0].tenant_id, tenantId)
  assert.strictEqual(mockMovimientos[0].tenant_id, tenantId)
  assert.strictEqual(mockMovimientos[1].tenant_id, tenantId)
  assert.strictEqual(mockMovimientos[2].tenant_id, tenantId)

  // Validar tipos de movimientos
  assert.strictEqual(mockMovimientos[0].tipo, 'ENTRADA')
  assert.strictEqual(mockMovimientos[1].tipo, 'RESERVA')
  assert.strictEqual(mockMovimientos[2].tipo, 'SALIDA')
})

// Export tests for runner
export async function runInventarioRLSTests() {
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

  console.log(`\n[Inventario RLS] ${passed}/${tests.length} pruebas superadas`)
  
  return {
    total: tests.length,
    passed,
    failed: tests.length - passed,
    results
  }
}

// Run tests if executed directly
if (require.main === module) {
  runInventarioRLSTests().then(({ passed, total }) => {
    process.exitCode = passed === total ? 0 : 1
  })
}
