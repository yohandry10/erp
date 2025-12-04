import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { data: userData, error: userError } = await supabase
      .from('usuarios')
      .select('tenant_id')
      .eq('id', user.id)
      .single()
    if (userError || !userData?.tenant_id) {
      return NextResponse.json({ error: 'User without tenant' }, { status: 400 })
    }
    const tenantId = userData.tenant_id

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    const rol = searchParams.get('rol')
    const categoria = searchParams.get('categoria')

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter \"q\" is required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase.rpc('buscar_ayuda', {
      p_query: query,
      p_rol: rol || null,
      p_categoria: categoria || null,
      p_tenant_id: tenantId,
      p_limite: 5,
    })

    if (error) {
      console.error('Error searching help:', error)
      return NextResponse.json(
        { error: 'Error searching help', details: error.message },
        { status: 500 }
      )
    }

    const resultado = data && data.length > 0 ? data[0] : null
    const relacionados = data && data.length > 1 ? data.slice(1) : []

    return NextResponse.json({
      encontrado: !!resultado,
      resultado,
      relacionados,
    })
  } catch (error) {
    console.error('Unexpected error in help search:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
