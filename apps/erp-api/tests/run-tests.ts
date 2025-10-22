import assert from 'assert'
import { EstadoPedido } from '../src/modules/ventas/pedidos/entities/pedido.entity'
import { PedidosService } from '../src/modules/ventas/pedidos/pedidos.service'
import { ReportesService } from '../src/modules/ventas/reportes/reportes.service'
import { TenantMiddleware } from '../src/common/middleware/tenant.middleware'
import { LogisticaService } from '../src/modules/inventario/logistica/logistica.service'
import { IntegrationAlertsService } from '../src/modules/notifications/integration-alerts.service'
import { PedidoLockService } from '../src/shared/locks/pedido-lock.service'
import { NotificationSeverity, NotificationType } from '../src/modules/notifications/notification.types'

type AsyncTest = () => Promise<void> | void

interface TestCase {
  name: string
  fn: AsyncTest
}

const tests: TestCase[] = []

function test(name: string, fn: AsyncTest) {
  tests.push({ name, fn })
}

const noop = () => undefined
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const mockSupabase = {
  getClient: () => ({
    from: () => ({
      select: () => ({ data: [], error: null }),
      eq: () => ({ data: [], error: null })
    })
  })
}

const mockNotifications = { createNotification: noop }
const mockAudit = { logAction: noop }
const mockCPE = { generarFacturaDesdePedido: noop }
const mockGRE = { verificarSugerenciaGRE: noop }
const mockEventBus = {
  emitVentaProcessed: noop,
  emitPagoFactura: noop
}

class SupabaseIntegrationStub {
  public readonly logs: any[] = []

  getClient() {
    return {
      from: (table: string) => {
        if (table !== 'integration_logs') {
          throw new Error(`Tabla no soportada en stub: ${table}`)
        }
        return {
          insert: async (payload: any) => {
            const entries = Array.isArray(payload) ? payload : [payload]
            entries.forEach((item) => this.logs.push({ ...item }))
            return { error: null }
          }
        }
      }
    }
  }
}

class NotificationsStub {
  public readonly notifications: Array<{
    tenantId: string
    type: NotificationType
    severity: NotificationSeverity
    title: string
    message: string
  }> = []

  async createNotification(
    tenantId: string,
    data: {
      type: NotificationType
      severity: NotificationSeverity
      title: string
      message: string
      action_url?: string
      action_label?: string
    }
  ) {
    this.notifications.push({ tenantId, ...data })
    return {
      id: `notif-${this.notifications.length}`,
      tenant_id: tenantId,
      type: data.type,
      severity: data.severity,
      title: data.title,
      message: data.message,
      action_url: data.action_url,
      action_label: data.action_label,
      leida: false,
      created_at: new Date()
    }
  }
}
test('PedidosService – requiere aprobación por monto máximo configurado', async () => {
  const service = new PedidosService(
    mockSupabase as any,
    mockNotifications as any,
    mockAudit as any,
    mockCPE as any,
    mockGRE as any,
    mockEventBus as any
  )

  ;(service as any).obtenerResumenCredito = async () => ({
    limite: 0,
    pendiente: 0,
    tieneVencidos: false,
    permiteMorosidad: true
  })

  const pedido: any = {
    id: 'pedido-1',
    cliente_id: 'cliente-1',
    total: 6000,
    detalle: [],
    estado: EstadoPedido.PENDIENTE
  }

  const config = {
    usar_flujo_logistica: false,
    monto_maximo_sin_aprobacion: 5000,
    porcentaje_descuento_maximo: undefined,
    requiere_aprobacion_descuento: false,
    aplicar_limite_credito: false,
    dias_vencimiento_factura: 30,
    gre_automatico_habilitado: true,
    umbral_gre_automatico: undefined,
    aplicar_retencion: false,
    retencion_tasa: undefined,
    aplicar_percepcion: false,
    percepcion_tasa: undefined,
    aplicar_detraccion: false,
    detraccion_tasa: undefined,
    detraccion_codigo: null
  }

  const evaluacion = await (service as any).evaluarPoliticasAprobacion(
    pedido,
    'tenant-1',
    config
  )

  assert.strictEqual(evaluacion.requiereAprobacion, true)
  assert.ok(
    evaluacion.motivos.some((motivo: string) => motivo.includes('supera el límite sin aprobación'))
  )
  assert.strictEqual(evaluacion.estadoCredito, 'REVISION')
})

test('PedidosService – bloqueo por límite de crédito excedido', async () => {
  const service = new PedidosService(
    mockSupabase as any,
    mockNotifications as any,
    mockAudit as any,
    mockCPE as any,
    mockGRE as any,
    mockEventBus as any
  )

  ;(service as any).obtenerResumenCredito = async () => ({
    limite: 10000,
    pendiente: 9000,
    tieneVencidos: true,
    permiteMorosidad: false
  })

  const pedido: any = {
    id: 'pedido-2',
    cliente_id: 'cliente-2',
    total: 3000,
    detalle: [],
    estado: EstadoPedido.PENDIENTE
  }

  const config = {
    usar_flujo_logistica: false,
    monto_maximo_sin_aprobacion: undefined,
    porcentaje_descuento_maximo: undefined,
    requiere_aprobacion_descuento: false,
    aplicar_limite_credito: true,
    dias_vencimiento_factura: 30,
    gre_automatico_habilitado: true,
    umbral_gre_automatico: undefined,
    aplicar_retencion: false,
    retencion_tasa: undefined,
    aplicar_percepcion: false,
    percepcion_tasa: undefined,
    aplicar_detraccion: false,
    detraccion_tasa: undefined,
    detraccion_codigo: null
  }

  const evaluacion = await (service as any).evaluarPoliticasAprobacion(
    pedido,
    'tenant-1',
    config
  )

  assert.strictEqual(evaluacion.requiereAprobacion, true)
  assert.strictEqual(evaluacion.estadoCredito, 'BLOQUEADO')
  assert.ok(
    evaluacion.motivos.some((motivo: string) => motivo.includes('Límite de crédito excedido'))
  )
  assert.ok(
    evaluacion.motivos.some((motivo: string) => motivo.toLowerCase().includes('cuentas por cobrar vencidas'))
  )
})

test('PedidosService – cálculo de retenciones y percepciones', () => {
  const service = new PedidosService(
    mockSupabase as any,
    mockNotifications as any,
    mockAudit as any,
    mockCPE as any,
    mockGRE as any,
    mockEventBus as any
  )

  const pedido: any = {
    cliente_id: 'cliente-3',
    subtotal: 1000,
    igv: 180,
    total: 1180,
    detalle: [],
    clientes: {
      sujeto_retencion: true,
      retencion_tasa: 3,
      sujeto_percepcion: true,
      percepcion_tasa: 2,
      sujeto_detraccion: true,
      detraccion_tasa: 4
    }
  }

  const config = {
    usar_flujo_logistica: false,
    monto_maximo_sin_aprobacion: undefined,
    porcentaje_descuento_maximo: undefined,
    requiere_aprobacion_descuento: false,
    aplicar_limite_credito: false,
    dias_vencimiento_factura: 30,
    gre_automatico_habilitado: true,
    umbral_gre_automatico: undefined,
    aplicar_retencion: true,
    retencion_tasa: 3,
    aplicar_percepcion: true,
    percepcion_tasa: 2,
    aplicar_detraccion: true,
    detraccion_tasa: 4,
    detraccion_codigo: '123'
  }

  const ajustes = (service as any).calcularAjustesTributarios(pedido, config, undefined, 1180)
  assert.strictEqual(ajustes.retencion, 35.4)
  assert.strictEqual(ajustes.percepcion, 23.6)
  assert.strictEqual(ajustes.detraccion, 47.2)
})

test('ReportesService – clasificación de buckets aging', () => {
  const service = new ReportesService(mockSupabase as any)

  const casos = [
    { dias: -1, esperado: 'corriente' },
    { dias: 0, esperado: 'corriente' },
    { dias: 15, esperado: 'b30' },
    { dias: 45, esperado: 'b60' },
    { dias: 75, esperado: 'b90' },
    { dias: 150, esperado: 'b120' }
  ]

  casos.forEach((caso) => {
    const bucket = (service as any).definirBucketAging(caso.dias)
    assert.strictEqual(bucket, caso.esperado)
  })
})

test('TenantMiddleware – request sin headers mantiene contexto nulo', () => {
  const contexts: any[] = []
  const tenantContextStub = {
    run: (context: any, callback: () => void) => {
      contexts.push(context)
      callback()
    }
  }

  const middleware = new TenantMiddleware(tenantContextStub as any)
  const req: any = { headers: {}, path: '/api/pedidos' }
  let nextInvoked = false

  middleware.use(req, {} as any, () => {
    nextInvoked = true
  })

  assert.ok(nextInvoked, 'El middleware debe continuar la cadena')
  assert.strictEqual(contexts.length, 1)
  assert.strictEqual(contexts[0].tenantId, null)
  assert.strictEqual(contexts[0].userId, null)
  assert.strictEqual(contexts[0].supabaseAccessToken, null)
  assert.strictEqual((req as any).tenant_id, undefined)
})

test('TenantMiddleware – propaga tenant y tokens desde headers', () => {
  const contexts: any[] = []
  const tenantContextStub = {
    run: (context: any, callback: () => void) => {
      contexts.push(context)
      callback()
    }
  }

  const middleware = new TenantMiddleware(tenantContextStub as any)
  const req: any = {
    headers: { 'x-supabase-access-token': 'access-token-123' },
    path: '/api/pedidos',
    user: {
      tenant_id: 'tenant-123',
      id: 'user-456'
    }
  }

  middleware.use(req, {} as any, () => undefined)

  assert.strictEqual(contexts.length, 1)
  assert.strictEqual(contexts[0].tenantId, 'tenant-123')
  assert.strictEqual(contexts[0].userId, 'user-456')
  assert.strictEqual(contexts[0].supabaseAccessToken, 'access-token-123')
  assert.strictEqual(req.tenant_id, 'tenant-123')
  assert.strictEqual(req.user_id, 'user-456')
})

test('IntegrationAlertsService – registra error y dispara alerta crítica', async () => {
  const supabaseStub = new SupabaseIntegrationStub()
  const notificationsStub = new NotificationsStub()
  const service = new IntegrationAlertsService(
    supabaseStub as any,
    notificationsStub as any
  )

  await service.recordError({
    tenantId: 'tenant-1',
    servicio: 'CPE',
    operacion: 'GENERAR_FACTURA',
    correlacionId: 'pedido-99',
    correlacionTipo: 'PEDIDO',
    errorMessage: 'Timeout comunicando con SUNAT',
    durationMs: 12000
  })

  assert.strictEqual(supabaseStub.logs.length, 1, 'Debe insertar un log de integración')
  assert.strictEqual(supabaseStub.logs[0].status, 'ERROR')
  assert.strictEqual(notificationsStub.notifications.length, 1, 'Debe emitir notificación')
  assert.strictEqual(
    notificationsStub.notifications[0].type,
    NotificationType.INTEGRACION_ERROR
  )
  assert.strictEqual(
    notificationsStub.notifications[0].severity,
    NotificationSeverity.ERROR
  )
})

test('IntegrationAlertsService – alerta por integración lenta', async () => {
  const supabaseStub = new SupabaseIntegrationStub()
  const notificationsStub = new NotificationsStub()
  const service = new IntegrationAlertsService(
    supabaseStub as any,
    notificationsStub as any
  )

  await service.recordSuccess({
    tenantId: 'tenant-1',
    servicio: 'GRE',
    operacion: 'GENERAR_GRE',
    correlacionId: 'pedido-1',
    correlacionTipo: 'PEDIDO',
    durationMs: 9000
  })

  assert.strictEqual(supabaseStub.logs.length, 1)
  assert.strictEqual(supabaseStub.logs[0].status, 'SUCCESS')
  assert.strictEqual(notificationsStub.notifications.length, 1)
  assert.strictEqual(
    notificationsStub.notifications[0].type,
    NotificationType.INTEGRACION_LENTA
  )
  assert.strictEqual(
    notificationsStub.notifications[0].severity,
    NotificationSeverity.WARNING
  )
})

test('PedidoLockService – serializa ejecuciones concurrentes por pedido', async () => {
  const lock = new PedidoLockService()
  const eventos: string[] = []

  await Promise.all(
    ['Tarea-A', 'Tarea-B', 'Tarea-C'].map((nombre) =>
      lock.runWithLock('tenant-1', 'pedido-XYZ', async () => {
        eventos.push(`${nombre}-inicio`)
        await delay(5)
        eventos.push(`${nombre}-fin`)
      })
    )
  )

  assert.deepStrictEqual(eventos, [
    'Tarea-A-inicio',
    'Tarea-A-fin',
    'Tarea-B-inicio',
    'Tarea-B-fin',
    'Tarea-C-inicio',
    'Tarea-C-fin'
  ])
})

test('PedidoLockService – permite paralelismo entre pedidos distintos', async () => {
  const lock = new PedidoLockService()
  let concurrentes = 0
  let maxConcurrentes = 0

  await Promise.all(
    ['pedido-1', 'pedido-2', 'pedido-3'].map((pedidoId) =>
      lock.runWithLock('tenant-1', pedidoId, async () => {
        concurrentes += 1
        if (concurrentes > maxConcurrentes) {
          maxConcurrentes = concurrentes
        }
        await delay(5)
        concurrentes -= 1
      })
    )
  )

  assert.ok(maxConcurrentes >= 2, 'Debería existir paralelismo entre pedidos distintos')
})

test('LogisticaService – normalizarItemsDespachados respeta pendientes', () => {
  const service = new LogisticaService(
    {} as any,
    { createNotification: noop } as any,
    { logAction: noop } as any,
    new PedidoLockService()
  )
  const detalle = [
    { id: 'detalle-1', cantidad: 10, cantidad_despachada: 4 },
    { id: 'detalle-2', cantidad: 5, cantidad_despachada: 0 }
  ]

  const planPendiente = (service as any).normalizarItemsDespachados(detalle, ['detalle-1'])
  assert.strictEqual(planPendiente.get('detalle-1'), 6)

  const planParcial = (service as any).normalizarItemsDespachados(detalle, [
    { detalle_id: 'detalle-2', cantidad: 3 }
  ])
  assert.strictEqual(planParcial.get('detalle-2'), 3)

  const planInvalido = (service as any).normalizarItemsDespachados(detalle, [
    { detalle_id: 'detalle-2', cantidad: -5 }
  ])
  assert.strictEqual(planInvalido.has('detalle-2'), false)
})

async function run() {
  let passed = 0
  for (const { name, fn } of tests) {
    try {
      await fn()
      console.log(`✅ ${name}`)
      passed += 1
    } catch (error) {
      console.error(`❌ ${name}`)
      console.error(error)
      process.exitCode = 1
    }
  }

  console.log(`\n${passed}/${tests.length} pruebas superadas`)
  if (process.exitCode && process.exitCode !== 0) {
    throw new Error('Some tests failed')
  }
}

run().catch((error) => {
  console.error('Error ejecutando pruebas:', error)
  process.exitCode = 1
})
