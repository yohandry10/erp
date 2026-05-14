import { NextRequest, NextResponse } from 'next/server'

const API_BASE_URL = process.env.SERVER_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

async function proxyAuth(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  const sourceUrl = new URL(request.url)
  const targetUrl = `${API_BASE_URL}/api/auth/${path.join('/')}${sourceUrl.search}`

  const headers = new Headers()
  const contentType = request.headers.get('content-type')
  const cookie = request.headers.get('cookie')
  const userAgent = request.headers.get('user-agent')

  if (contentType) headers.set('content-type', contentType)
  if (cookie) headers.set('cookie', cookie)
  if (userAgent) headers.set('user-agent', userAgent)

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text(),
    cache: 'no-store',
    redirect: 'manual',
  })

  const responseHeaders = new Headers()
  const responseContentType = response.headers.get('content-type')
  const setCookie = response.headers.get('set-cookie')

  if (responseContentType) responseHeaders.set('content-type', responseContentType)
  if (setCookie) responseHeaders.set('set-cookie', setCookie)

  return new NextResponse(await response.text(), {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  })
}

export const GET = proxyAuth
export const POST = proxyAuth
export const DELETE = proxyAuth
