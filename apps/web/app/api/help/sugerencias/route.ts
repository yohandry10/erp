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
    const rol = searchParams.get('rol')
    const categoria = searchParams.get('categoria')
    const limite = parseInt(searchParams.get('limite') || '5', 10)

    const { data, error } = await supabase.rpc('obtener_sugerencias_ayuda', {
      p_rol: rol || null,
      p_categoria: categoria || null,
      p_limite: limite,
    })

    if (error) {
      console.error('Error fetching suggestions:', error)
      return NextResponse.json(
        { error: 'Error fetching suggestions', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      sugerencias: data || [],
    })
  } catch (error) {
    console.error('Unexpected error in help suggestions:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
