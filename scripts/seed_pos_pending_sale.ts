import { createClient } from '@supabase/supabase-js'
import { runPosFacturaPendienteJob } from '../apps/worker/src/jobs/pos-facturacion-pendiente.job'

// Ajusta estas variables antes de ejecutar
const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const TENANT_ID = process.env.SEED_TENANT_ID || '' // Tenant de prueba

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TENANT_ID) {
  console.error('Faltan variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_TENANT_ID')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  // 1. Crear venta_pos pendiente
  const numero = `T001-${Math.floor(Math.random() * 90000000 + 10000000)}`
  const cpeData = {
    tipo_documento: '03', // Boleta
    serie: 'T001',
    numero: numero.split('-')[1],
    ruc_emisor: '20123456789',
    razon_social_emisor: 'EMPRESA DEMO SAC',
    tipo_documento_receptor: '1',
    documento_receptor: '12345678',
    razon_social_receptor: 'Cliente Demo',
    direccion_receptor: 'Av Siempre Viva 123',
    moneda: 'PEN',
    total_gravadas: 100,
    total_igv: 18,
    total_venta: 118,
    items: [
      {
        codigo: 'PROD001',
        descripcion: 'Producto demo',
        cantidad: 1,
        valor_unitario: 100,
        igv: 18,
        total: 118,
      },
    ],
  }

  const { data: venta, error } = await supabase
    .from('ventas_pos')
    .insert({
      tenant_id: TENANT_ID,
      numero_venta: numero,
      numero_ticket: numero,
      estado: 'PENDIENTE_FACTURACION',
      total: 118,
      cpe_data: cpeData,
      cpe_pendiente: true,
      intentos_facturacion: 0,
    })
    .select()
    .single()

  if (error || !venta) {
    console.error('Error creando venta_pos:', error)
    process.exit(1)
  }

  console.log('✅ Venta POS creada:', venta.id, venta.numero_venta)

  // 2. Disparar job manual
  const result = await runPosFacturaPendienteJob()
  console.log('🏁 Resultado job:', result)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
