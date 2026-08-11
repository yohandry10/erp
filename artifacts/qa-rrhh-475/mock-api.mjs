import http from 'node:http'

const port = Number(process.argv[2] || process.env.QA_RRHH_MOCK_PORT || 14674)
const user = {
  id: '47500000-0000-4000-8000-000000000001',
  tenant_id: '47500000-0000-4000-8000-000000000010',
  email: 'qa-rrhh-475@local.invalid',
  nombre: 'QA',
  apellido: 'RRHH 475',
  roles: ['ADMIN'],
  is_super_admin: false,
}

const departments = [
  { id: '47500000-0000-4000-8000-000000000101', nombre: 'Ingeniería', codigo: 'ENG', estado: 'activo', activo: true },
  { id: '47500000-0000-4000-8000-000000000102', nombre: 'Operaciones', codigo: 'OPS', estado: 'activo', activo: true },
]
const employees = [
  {
    id: '47500000-0000-4000-8000-000000000201', nombres: 'Ada', apellidos: 'Lovelace',
    tipo_documento: 'DNI', numero_documento: '47500001', email: 'ada@local.invalid',
    puesto: 'Arquitecta de software', fecha_ingreso: '2026-08-01', estado: 'activo', activo: true,
    departamentos: { nombre: 'Ingeniería' }, id_departamento: departments[0].id,
  },
  {
    id: '47500000-0000-4000-8000-000000000202', nombres: 'Grace', apellidos: 'Hopper',
    tipo_documento: 'DNI', numero_documento: '47500002', email: 'grace@local.invalid',
    puesto: 'Coordinadora RRHH', fecha_ingreso: '2026-07-15', estado: 'activo', activo: true,
    departamentos: { nombre: 'Operaciones' }, id_departamento: departments[1].id,
  },
]
const vacancies = [{
  id: '47500000-0000-4000-8000-000000000301', titulo: 'Backend senior',
  puesto_solicitado: 'Backend senior', departamento_id: departments[0].id,
  departamento: 'Ingeniería', estado: 'activa', activo: true,
}]
const candidates = [{
  id: '47500000-0000-4000-8000-000000000401', vacante_id: vacancies[0].id,
  id_vacante: vacancies[0].id, nombres: 'Katherine', apellidos: 'Johnson',
  email: 'katherine@local.invalid', telefono: '999111222', tipo_documento: 'DNI',
  numero_documento: '47500003', experiencia_anos: 5, puntuacion_cv: 93,
  estado: 'entrevista', fecha_postulacion: '2026-08-09T10:00:00.000Z',
}]
const contracts = [{
  id: '47500000-0000-4000-8000-000000000501', id_empleado: employees[0].id,
  empleado_id: employees[0].id, tipo_contrato: 'indefinido', fecha_inicio: '2026-08-01',
  sueldo_bruto: 6500, salario: 6500, moneda: 'PEN', regimen_pensionario: 'AFP',
  jornada_laboral: 'tiempo_completo', estado: 'vigente', activo: true,
  empleados: { nombres: 'Ada', apellidos: 'Lovelace', numero_documento: '47500001', puesto: 'Arquitecta de software' },
}]
const attendance = [{
  id: '47500000-0000-4000-8000-000000000601', empleado_id: employees[0].id,
  id_empleado: employees[0].id, fecha: new Date().toISOString().slice(0, 10),
  hora_entrada: '08:00:00', hora_salida: null, estado: 'presente',
}]
const planillas = [{
  id: '47500000-0000-4000-8000-000000000701', periodo: '2026-08', estado: 'calculada',
  pais_codigo: 'PE', moneda: 'PEN', total_neto: 5200,
}]
const history = [{
  id: '47500000-0000-4000-8000-000000000801', planilla_id: planillas[0].id,
  periodo: '2026-08', version: 1, estado: 'GENERADA', vigente: true,
  resumen: { tregistro_novedades: 1 }, bloqueos: [],
}]
const preview = {
  resumen: {
    trabajadores: 1, prestadores_cuarta: 0, total_ingresos: 6500,
    listo_para_pvs: true,
  },
  bloqueos: [],
  trabajadores: [{
    empleado_id: employees[0].id,
    detalle_id: '47500000-0000-4000-8000-000000000901',
    nombre: 'Ada Lovelace', tipo_documento: 'DNI', numero_documento: '47500001',
    ficha: {
      apellido_paterno: 'Lovelace', apellido_materno: '', ocupacion_codigo: '2141',
      tipo_contrato_codigo: '01', establecimiento_codigo: '0000',
    },
    jornada: { horas_ordinarias: 176, dias_no_laborados: 0, fuente: 'ASISTENCIA' },
  }],
}

const qaState = {
  employeeCreates: [], attendanceMarks: [], vacancyCreates: [],
  candidateUpdates: [], contractCreates: [], plameWrites: [],
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(payload))
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const key = String(req.headers['idempotency-key'] || '')

  if (req.method === 'GET' && path === '/__qa__/state') return sendJson(res, 200, qaState)
  if (req.method === 'POST' && path === '/api/auth/login') {
    res.setHeader('Set-Cookie', 'access_token=mock-access-token-475; HttpOnly; Path=/; SameSite=Lax')
    return sendJson(res, 200, { access_token: 'mock-access-token-475', user })
  }
  if (req.method === 'GET' && path === '/api/auth/profile') return sendJson(res, 200, user)
  if (req.method === 'GET' && path === '/api/configuration/context/country') {
    return sendJson(res, 200, { success: true, data: { pais_id: 1, paisCodigo: 'PE', paisNombre: 'Perú', monedaDefecto: 'PEN' } })
  }
  if (req.method === 'GET' && ['/api/configuration/status', '/api/configuration/context/status', '/api/configuracion/status'].includes(path)) {
    return sendJson(res, 200, { success: true, data: { isComplete: true, completionPercentage: 100, missingItems: [], certificate: { exists: true, isValid: true } } })
  }
  if (req.method === 'GET' && path === '/api/rrhh/configuracion-laboral') {
    return sendJson(res, 200, {
      success: true,
      data: {
        pais: 'PE', configuracion: null,
        readiness: { ready: true, missing: [] },
        normativa: {
          periodo: '2026-08', uit: 5350, rmv: 1130, asignacion_familiar: 113,
          afp_aporte: 0.10, afp_prima_seguro: 0.0137, afp_comision_flujo_default: 0.0155,
          onp_aporte: 0.13, essalud_aporte: 0.09, quinta_deduccion_uit: 7,
          bancarizacion_pen_min: 2000, igv_tasa: 0.18,
        },
      },
    })
  }
  if (req.method === 'GET' && path === '/api/rrhh/empleados') return sendJson(res, 200, { success: true, data: employees })
  if (req.method === 'GET' && path === '/api/rrhh/departamentos') return sendJson(res, 200, { success: true, data: departments })
  if (req.method === 'GET' && path === '/api/rrhh/vacantes') return sendJson(res, 200, { success: true, data: vacancies })
  if (req.method === 'GET' && path === '/api/rrhh/candidatos') return sendJson(res, 200, { success: true, data: candidates })
  if (req.method === 'GET' && path === '/api/rrhh/contratos') return sendJson(res, 200, { success: true, data: contracts })
  if (req.method === 'GET' && path === '/api/rrhh/asistencias') return sendJson(res, 200, { success: true, data: attendance })
  if (req.method === 'GET' && path === '/api/rrhh/planillas') return sendJson(res, 200, { success: true, data: planillas })
  if (req.method === 'GET' && path === '/api/rrhh/peru/planilla-electronica/paquetes/historial') return sendJson(res, 200, { success: true, data: history })
  if (req.method === 'GET' && path === `/api/rrhh/peru/planilla-electronica/${planillas[0].id}/preview`) return sendJson(res, 200, { success: true, data: preview })

  if (req.method === 'POST' && path === '/api/rrhh/empleados') {
    if (key.length < 8) return sendJson(res, 400, { message: 'Idempotency-Key requerido para crear empleado' })
    const body = await readBody(req)
    const created = {
      id: `47500000-0000-4000-8000-${String(employees.length + 1).padStart(12, '0')}`,
      ...body,
      departamentos: departments.find((item) => item.id === body.id_departamento) || null,
    }
    employees.push(created)
    qaState.employeeCreates.push({ path, key, body })
    return sendJson(res, 201, { success: true, data: created })
  }
  if (req.method === 'POST' && path === '/api/rrhh/asistencias/marcar') {
    if (key.length < 8) return sendJson(res, 400, { message: 'Idempotency-Key requerido para asistencia' })
    const body = await readBody(req)
    const existing = attendance.find((item) =>
      (item.empleado_id === body.empleado_id || item.id_empleado === body.empleado_id)
      && item.fecha === body.fecha)
    if (body.tipo === 'salida' && (!existing?.hora_entrada || body.hora <= existing.hora_entrada)) {
      return sendJson(res, 400, { message: 'La salida debe ser posterior a la entrada' })
    }
    if (body.tipo === 'salida' && existing) existing.hora_salida = body.hora
    if (body.tipo === 'entrada' && !existing) attendance.push({
      id: `attendance-${attendance.length + 1}`, empleado_id: body.empleado_id,
      id_empleado: body.empleado_id, fecha: body.fecha, hora_entrada: body.hora,
      hora_salida: null, estado: 'presente',
    })
    qaState.attendanceMarks.push({ path, key, body })
    return sendJson(res, 200, { success: true, data: existing || attendance.at(-1) })
  }
  if (req.method === 'POST' && path === '/api/rrhh/vacantes') {
    if (key.length < 8) return sendJson(res, 400, { message: 'Idempotency-Key requerido para crear vacante' })
    const body = await readBody(req)
    const created = { id: `vacancy-${vacancies.length + 1}`, ...body }
    vacancies.push(created)
    qaState.vacancyCreates.push({ path, key, body })
    return sendJson(res, 201, { success: true, data: created })
  }
  if (req.method === 'PUT' && path === `/api/rrhh/candidatos/${candidates[0].id}`) {
    if (key.length < 8) return sendJson(res, 400, { message: 'Idempotency-Key requerido para editar candidato' })
    const body = await readBody(req)
    Object.assign(candidates[0], body)
    qaState.candidateUpdates.push({ path, key, body })
    return sendJson(res, 200, { success: true, data: candidates[0] })
  }
  if (req.method === 'POST' && path === '/api/rrhh/contratos') {
    if (key.length < 8) return sendJson(res, 400, { message: 'Idempotency-Key requerido para crear contrato' })
    const body = await readBody(req)
    const created = { id: `contract-${contracts.length + 1}`, ...body }
    contracts.push(created)
    qaState.contractCreates.push({ path, key, body })
    return sendJson(res, 201, { success: true, data: created })
  }
  if (req.method === 'PUT' && /\/api\/rrhh\/peru\/planilla-electronica\/(empleados|detalles)\//.test(path)) {
    if (key.length < 8) return sendJson(res, 400, { message: 'Idempotency-Key requerido para PLAME' })
    const body = await readBody(req)
    qaState.plameWrites.push({ path, key, body })
    return sendJson(res, 200, { success: true, data: { id: path.split('/').at(-2), ...body } })
  }

  if (req.method === 'GET' && /permissions|permisos/.test(path)) {
    return sendJson(res, 200, { success: true, data: ['rrhh.access', 'rrhh.planilla_electronica.read', 'rrhh.planilla_electronica.write'] })
  }
  if (req.method === 'GET') return sendJson(res, 200, { success: true, data: [] })
  if (['POST', 'PUT', 'DELETE'].includes(req.method || '')) {
    return sendJson(res, 200, { success: true, data: { ok: true } })
  }
  return sendJson(res, 404, { message: `Mock sin ruta ${req.method} ${path}` })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`QA_RRHH_475_MOCK_READY http://127.0.0.1:${port}`)
})
