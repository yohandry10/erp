import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/configuracion-fiscal
 * Obtiene la configuración fiscal del tenant actual
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Obtener el usuario autenticado
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    // Obtener el tenant_id del usuario
    const { data: userData, error: userError } = await supabase
      .from('usuarios')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    if (userError || !userData?.tenant_id) {
      return NextResponse.json(
        { success: false, error: 'Usuario sin tenant asignado' },
        { status: 400 }
      )
    }

    const tenantId = userData.tenant_id

    // Obtener la configuración fiscal del tenant
    const { data: config, error: configError } = await supabase
      .from('empresa_config')
      .select('igv_porcentaje, pais_id, moneda_defecto')
      .eq('tenant_id', tenantId)
      .single()

    if (configError) {
      console.error('Error obteniendo configuración fiscal:', configError)
      // Retornar valores por defecto si no hay configuración
      return NextResponse.json({
        success: true,
        data: {
          tasa_igv: 0.18,
          moneda_principal: 'PEN',
          pais_id: 1,
          impuesto_principal_nombre: 'IGV',
          impuesto_principal_porcentaje: 0.18,
        },
      })
    }

    // Obtener información del país para el nombre del impuesto
    const { data: paisData } = await supabase
      .from('configuracion_fiscal')
      .select('impuesto_principal_nombre, impuesto_principal_porcentaje')
      .eq('pais_id', config.pais_id || 1)
      .single()

    const tasaIgv = config.igv_porcentaje || paisData?.impuesto_principal_porcentaje || 0.18
    const nombreImpuesto = paisData?.impuesto_principal_nombre || 'IGV'

    return NextResponse.json({
      success: true,
      data: {
        tasa_igv: Number(tasaIgv),
        moneda_principal: config.moneda_defecto || 'PEN',
        pais_id: config.pais_id || 1,
        impuesto_principal_nombre: nombreImpuesto,
        impuesto_principal_porcentaje: Number(tasaIgv),
      },
    })
  } catch (error) {
    console.error('Error en /api/configuracion-fiscal:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Error al obtener configuración fiscal',
      },
      { status: 500 }
    )
  }
}
