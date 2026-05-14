import { NextRequest, NextResponse } from 'next/server'

const API_BASE_URL = process.env.SERVER_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  const sourceUrl = new URL(request.url)
  const targetUrl = `${API_BASE_URL}/${path.join('/')}${sourceUrl.search}`

  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.delete('content-length')
  headers.delete('x-forwarded-host')
  headers.delete('x-original-url')
  headers.delete('x-rewrite-url')

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer(),
    cache: 'no-store',
    redirect: 'manual',
  })

  const responseHeaders = new Headers(response.headers)
  responseHeaders.delete('content-encoding')
  responseHeaders.delete('content-length')
  responseHeaders.delete('transfer-encoding')
  responseHeaders.delete('connection')

  const body = await response.arrayBuffer()

  return new NextResponse(body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  })
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
