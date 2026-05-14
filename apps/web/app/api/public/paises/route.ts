import { NextResponse } from 'next/server'

const API_BASE_URL = process.env.SERVER_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

export async function GET() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/paises`, {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const data = await response.json().catch(() => ({}))

    return NextResponse.json(data, {
      status: response.status,
    })
  } catch (error) {
    console.error('Error proxying países:', error)
    return NextResponse.json(
      {
        success: false,
        message: 'No se pudo obtener la lista de países',
      },
      { status: 500 },
    )
  }
}
