import http from 'node:http'

const port = Number(process.env.PORT || 14602)
const tenantId = '45600000-0000-4000-8000-000000000001'
const actorId = '45600000-0000-4000-8000-000000000002'
const creatorId = '45600000-0000-4000-8000-000000000003'
const rmaId = '45600000-0000-4000-8000-000000000100'
const closedRmaId = '45600000-0000-4000-8000-000000000101'
const saldoId = '45600000-0000-4000-8000-000000000200'
const customer = { razon_social: 'Cliente Demo RMA SAC', nombre: 'Cliente Demo RMA', ruc: '20123456789' }

const now = () => new Date().toISOString()
const events = (type, description) => ({
  id: crypto.randomUUID(),
  tipo: type,
  descripcion: description,
  usuario_id: actorId,
  created_at: now(),
  metadata: {},
})

const state = {
  rmas: [
    {
      id: rmaId,
      numero: 'RMA-2026-00001',
      estado: 'CREADA',
      motivo_general: 'Devolución parcial: doble SKU, servicio y producto no-stock',
      pedido_id: '45600000-0000-4000-8000-000000000300',
      cliente_id: '45600000-0000-4000-8000-000000000301',
      documento_origen_id: '45600000-0000-4000-8000-000000000302',
      cpe_origen_id: '45600000-0000-4000-8000-000000000303',
      cxc_origen_id: '45600000-0000-4000-8000-000000000304',
      almacen_retorno_id: '45600000-0000-4000-8000-000000000305',
      created_by: creatorId,
      created_at: now(),
      updated_at: now(),
      clientes: customer,
      eventos: [events('CREADA', 'RMA creada atómicamente')],
      items: [
        {
          id: '45600000-0000-4000-8000-000000000401',
          producto_id: '45600000-0000-4000-8000-000000000501',
          cantidad_autorizada: 2,
          cantidad_devuelta: 0,
          motivo_item: 'Falla en lote A',
          estado: 'CREADA',
          metadata: { es_servicio: false, controla_stock: true, classification_snapshot: 'FISICO_STOCK' },
          productos: { codigo: 'SKU-DOBLE', nombre: 'Producto físico', es_servicio: false, controla_stock: true },
          detalle: { descripcion: 'Producto físico · línea A' },
          documento_detalle: { orden: 1, descripcion: 'Producto físico · línea A', total_item: 236 },
        },
        {
          id: '45600000-0000-4000-8000-000000000402',
          producto_id: '45600000-0000-4000-8000-000000000501',
          cantidad_autorizada: 1,
          cantidad_devuelta: 0,
          motivo_item: 'Falla en lote B',
          estado: 'CREADA',
          metadata: { es_servicio: false, controla_stock: true, classification_snapshot: 'FISICO_STOCK' },
          productos: { codigo: 'SKU-DOBLE', nombre: 'Producto físico', es_servicio: false, controla_stock: true },
          detalle: { descripcion: 'Producto físico · línea B' },
          documento_detalle: { orden: 2, descripcion: 'Producto físico · línea B', total_item: 59 },
        },
        {
          id: '45600000-0000-4000-8000-000000000403',
          producto_id: '45600000-0000-4000-8000-000000000502',
          cantidad_autorizada: 1,
          cantidad_devuelta: 0,
          motivo_item: 'Servicio no conforme',
          estado: 'CREADA',
          metadata: { es_servicio: true, controla_stock: false, classification_snapshot: 'SERVICIO' },
          productos: { codigo: 'SERV-01', nombre: 'Servicio', es_servicio: false, controla_stock: true },
          detalle: { descripcion: 'Servicio lógico (catálogo mutado después)' },
          documento_detalle: { orden: 3, descripcion: 'Servicio lógico', total_item: 47.2 },
        },
        {
          id: '45600000-0000-4000-8000-000000000404',
          producto_id: '45600000-0000-4000-8000-000000000503',
          cantidad_autorizada: 1,
          cantidad_devuelta: 0,
          motivo_item: 'Producto no-stock no conforme',
          estado: 'CREADA',
          metadata: { es_servicio: false, controla_stock: false, classification_snapshot: 'NO_STOCK' },
          productos: { codigo: 'NOSTOCK-01', nombre: 'Producto no-stock', es_servicio: false, controla_stock: true },
          detalle: { descripcion: 'Producto sin control de stock' },
          documento_detalle: { orden: 4, descripcion: 'Producto sin control de stock', total_item: 23.6 },
        },
      ],
      saldo_favor: null,
    },
    {
      id: closedRmaId,
      numero: 'RMA-2026-00002',
      estado: 'CERRADA',
      motivo_general: 'Caso cerrado con saldo a favor durable',
      pedido_id: '45600000-0000-4000-8000-000000000310',
      documento_origen_id: '45600000-0000-4000-8000-000000000311',
      cpe_origen_id: '45600000-0000-4000-8000-000000000312',
      cxc_origen_id: '45600000-0000-4000-8000-000000000313',
      nota_credito_documento_id: '45600000-0000-4000-8000-000000000314',
      nota_credito_cpe_id: '45600000-0000-4000-8000-000000000315',
      created_by: creatorId,
      created_at: now(),
      updated_at: now(),
      clientes: customer,
      eventos: [events('NOTA_CREDITO', 'Nota de crédito emitida desde RMA')],
      items: [],
      saldo_favor: null,
    },
  ],
  saldos: [
    {
      id: saldoId,
      tenant_id: tenantId,
      cliente_id: '45600000-0000-4000-8000-000000000301',
      rma_id: closedRmaId,
      moneda: 'PEN',
      monto_original: 265.8,
      monto_disponible: 265.8,
      estado: 'DISPONIBLE',
      created_at: now(),
      clientes: customer,
      rma: { numero: 'RMA-2026-00002', estado: 'CERRADA' },
    },
  ],
}

const candidate = {
  id: '45600000-0000-4000-8000-000000000320',
  numero: 'PV-2026-00456',
  estado: 'FACTURADO',
  moneda: 'PEN',
  total: 483.8,
  clientes: customer,
  documentos: [{
    id: '45600000-0000-4000-8000-000000000321',
    tipo_documento: 'FACTURA', serie: 'F456', numero: '00000009',
    fecha_emision: now(), total: 483.8, estado: 'EMITIDO',
  }],
  detalle: [
    {
      id: '45600000-0000-4000-8000-000000000421',
      producto_id: '45600000-0000-4000-8000-000000000521',
      descripcion: 'Producto físico de demostración', cantidad: 2,
      cantidad_despachada: 2, cantidad_facturada: 2, cantidad_retornable: 2,
      precio_unitario: 118,
      productos: { codigo: 'DEMO-456', nombre: 'Producto físico', es_servicio: false, controla_stock: true },
    },
    {
      id: '45600000-0000-4000-8000-000000000422',
      producto_id: '45600000-0000-4000-8000-000000000522',
      descripcion: 'Servicio facturado sin despacho físico', cantidad: 1,
      cantidad_despachada: 0, cantidad_facturada: 1, cantidad_retornable: 1,
      precio_unitario: 47.2,
      productos: { codigo: 'SERV-DEMO', nombre: 'Servicio', es_servicio: true, controla_stock: false },
    },
  ],
}

function send(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, authorization, idempotency-key, x-country-id',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    ...extraHeaders,
  })
  res.end(JSON.stringify(body))
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function listRmas() {
  return state.rmas.map(({ items, eventos, saldo_favor, ...rma }) => rma)
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {})
  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`)
  const path = url.pathname.replace(/\/+$/, '') || '/'

  if (path === '/api/configuration/context/country' && req.method === 'GET') {
    return send(res, 200, {
      data: {
        pais_id: 1,
        paisCodigo: 'PE',
        monedaDefecto: 'PEN',
      },
    })
  }

  if (path === '/api/auth/profile' && req.method === 'GET') {
    return send(res, 200, {
      id: actorId,
      email: 'aprobador.rma@demo.local',
      nombre: 'Aprobador',
      apellido: 'RMA',
      tenant_id: tenantId,
      roles: ['ADMIN'],
      is_super_admin: true,
    })
  }
  if (path === '/api/auth/login' && req.method === 'POST') {
    await readBody(req)
    const user = {
      id: actorId,
      email: 'aprobador.rma@demo.local',
      nombre: 'Aprobador',
      apellido: 'RMA',
      tenant_id: tenantId,
      roles: ['ADMIN'],
      is_super_admin: true,
    }
    return send(res, 200, { user, access_token: 'local-rma-visual-token' }, {
      'set-cookie': 'access_token=local-rma-visual-token; Path=/; HttpOnly; SameSite=Lax',
    })
  }
  if (path === '/api/tenants/me' && req.method === 'GET') {
    return send(res, 200, { id: tenantId, codigo: 'DEMO-RMA-456', nombre: 'Demo aislada RMA 456', pais: 'PE', activo: true })
  }
  if (path === '/api/usuarios-sistema/me/permissions' && req.method === 'GET') {
    return send(res, 200, [])
  }
  if (path === '/api/ventas/rma' && req.method === 'GET') return send(res, 200, listRmas())
  if (path === '/api/ventas/rma/saldos-favor' && req.method === 'GET') return send(res, 200, state.saldos)
  if (path === '/api/ventas/rma/candidatos' && req.method === 'GET') return send(res, 200, [candidate])
  if (path === '/api/ventas/rma/recursos-recepcion' && req.method === 'GET') {
    return send(res, 200, {
      control_calidad_requerido: true,
      almacenes: [{ id: '45600000-0000-4000-8000-000000000305', codigo: 'CAL-01', nombre: 'Cuarentena devoluciones', es_principal: true }],
      ubicaciones: [{ id: '45600000-0000-4000-8000-000000000306', almacen_id: '45600000-0000-4000-8000-000000000305', codigo: 'QA-01', nombre: 'Inspección de calidad', estado: 'ACTIVO' }],
    })
  }
  if (path === '/api/ventas/rma/medios-reembolso' && req.method === 'GET') {
    return send(res, 200, {
      bancos: [{ id: '45600000-0000-4000-8000-000000000601', nombre: 'Cuenta corriente demo', banco: 'Banco local', moneda: 'PEN', saldo: 1000 }],
      sesiones_caja: [{ id: '45600000-0000-4000-8000-000000000602', moneda: 'PEN', cajas: { codigo: 'CAJA-01', nombre: 'Caja principal' } }],
    })
  }
  if (path === `/api/ventas/rma/saldos-favor/${saldoId}/cxc-aplicables` && req.method === 'GET') {
    return send(res, 200, [{ id: '45600000-0000-4000-8000-000000000701', numero_documento: 'F456-00000020', moneda: 'PEN', monto_pendiente: 80, estado: 'PENDIENTE' }])
  }
  const detailMatch = path.match(/^\/api\/ventas\/rma\/([0-9a-f-]+)$/i)
  if (detailMatch && req.method === 'GET') {
    const found = state.rmas.find((rma) => rma.id === detailMatch[1])
    return found ? send(res, 200, found) : send(res, 404, { message: 'RMA no encontrada' })
  }

  if (path === '/api/ventas/rma' && req.method === 'POST') {
    const body = await readBody(req)
    const id = crypto.randomUUID()
    const created = {
      ...state.rmas[0], id, numero: `RMA-2026-${String(state.rmas.length + 1).padStart(5, '0')}`,
      motivo_general: body.motivo_general, created_by: actorId,
      items: (body.items || []).map((item, index) => ({
        id: crypto.randomUUID(), producto_id: item.producto_id, cantidad_autorizada: item.cantidad,
        cantidad_devuelta: 0, motivo_item: item.motivo_item, estado: 'CREADA',
        metadata: { es_servicio: index === 1, controla_stock: index !== 1, classification_snapshot: index === 1 ? 'SERVICIO' : 'FISICO_STOCK' },
        productos: candidate.detalle[index]?.productos, detalle: { descripcion: candidate.detalle[index]?.descripcion },
      })),
      eventos: [events('CREADA', 'RMA creada atómicamente')], saldo_favor: null,
    }
    state.rmas.unshift(created)
    return send(res, 200, { success: true, rma_id: id, numero: created.numero, estado: 'CREADA', idempotent: false })
  }

  const actionMatch = path.match(/^\/api\/ventas\/rma\/([0-9a-f-]+)\/(aprobar|recepcionar|revertir-recepcion|nota-credito)$/i)
  if (actionMatch && req.method === 'POST') {
    const rma = state.rmas.find((item) => item.id === actionMatch[1])
    if (!rma) return send(res, 404, { message: 'RMA no encontrada' })
    const body = await readBody(req)
    if (actionMatch[2] === 'aprobar') {
      rma.estado = body.aprobar === false ? 'RECHAZADA' : 'APROBADA'
      rma.aprobado_por = actorId
      rma.aprobado_en = now()
      rma.eventos.push(events('DECISION', `RMA ${rma.estado}`))
    } else if (actionMatch[2] === 'recepcionar') {
      for (const line of body.items || []) {
        const item = rma.items.find((value) => value.id === line.rma_item_id)
        if (!item) continue
        item.cantidad_devuelta = Number(item.cantidad_devuelta) + Number(line.cantidad_recibida)
        item.estado = item.cantidad_devuelta >= item.cantidad_autorizada ? 'CERRADO' : 'PARCIAL'
      }
      rma.estado = rma.items.every((item) => item.cantidad_devuelta >= item.cantidad_autorizada) ? 'RECIBIDA' : 'PARCIAL'
      rma.eventos.push(events('RECEPCION', `Recepción RMA: ${rma.estado}`))
    } else if (actionMatch[2] === 'revertir-recepcion') {
      rma.items.forEach((item) => { item.cantidad_devuelta = 0; item.estado = 'CREADA' })
      rma.estado = 'APROBADA'
      rma.eventos.push(events('RECEPCION_REVERSA', 'Recepción RMA revertida'))
    } else {
      rma.estado = 'CERRADA'
      rma.nota_credito_documento_id = crypto.randomUUID()
      rma.nota_credito_cpe_id = crypto.randomUUID()
      rma.saldo_favor = state.saldos[0]
      rma.eventos.push(events('NOTA_CREDITO', 'Nota de crédito emitida desde RMA'))
    }
    rma.updated_at = now()
    return send(res, 200, { success: true, rma_id: rma.id, estado: rma.estado, idempotent: false })
  }

  if (path === `/api/ventas/rma/saldos-favor/${saldoId}/aplicar` && req.method === 'POST') {
    const body = await readBody(req)
    state.saldos[0].monto_disponible = Math.max(0, state.saldos[0].monto_disponible - Number(body.monto || 0))
    state.saldos[0].estado = state.saldos[0].monto_disponible > 0 ? 'PARCIAL' : 'AGOTADO'
    return send(res, 200, { success: true, saldo_disponible: state.saldos[0].monto_disponible })
  }
  if (path === `/api/ventas/rma/saldos-favor/${saldoId}/reembolsar` && req.method === 'POST') {
    const body = await readBody(req)
    state.saldos[0].monto_disponible = Math.max(0, state.saldos[0].monto_disponible - Number(body.monto || 0))
    state.saldos[0].estado = state.saldos[0].monto_disponible > 0 ? 'PARCIAL' : 'AGOTADO'
    return send(res, 200, { success: true, saldo_disponible: state.saldos[0].monto_disponible })
  }

  if (req.method === 'GET') return send(res, 200, [])
  return send(res, 404, { message: `Ruta demo no implementada: ${req.method} ${path}` })
})

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`mock-rma-api listening on http://127.0.0.1:${port}\n`)
})
