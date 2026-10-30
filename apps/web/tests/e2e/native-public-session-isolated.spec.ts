import { test, expect } from '@playwright/test'

const snapshotKey = 'erp.auth.session.snapshot'
const user = { id: 'f0f246ce-d34a-4353-9de7-6ac02482e956', tenant_id: '84da6605-66a4-4ba1-8127-c7e560a3a38f',
  email: 'native-session-probe@example.test', nombre: 'Sesión local', apellido: '', nombre_usuario: 'sesion-local', roles: ['ADMIN'], is_super_admin: false }

for (const mode of ['valid', 'revoked', 'missing', 'web'] as const) {
  test(`public login preserves only the canonical secure desktop session: ${mode}`, async ({ page, context }) => {
    const profiles: string[] = []
    const writers: string[] = []
    await context.addInitScript(({ mode, snapshotKey, user }) => {
      if (!sessionStorage.getItem('native-session-probe-initialized')) {
        localStorage.setItem(snapshotKey, JSON.stringify({ user: { ...user, nombre: 'Snapshot anterior' } }))
        sessionStorage.setItem('native-session-probe-initialized', '1')
      }
      let protectedToken: string | null = mode === 'missing' ? null : 'LOCAL-ISOLATED-OPAQUE-SESSION-PROBE'
      if (mode !== 'web') Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
        invoke: async (command: string) => {
          if (command === 'load_secure_access_token') return protectedToken
          if (command === 'clear_secure_access_token') { protectedToken = null; return null }
          if (command === 'get_offline_status') return { offline_mode: false, pending_requests: 0, failed_requests: 0 }
          return null
        },
      } })
    }, { mode, snapshotKey, user })
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url())
      if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return route.abort()
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
        writers.push(request.method() + ' ' + url.pathname)
        return route.abort()
      }
      if (url.pathname.replace(/\/$/, '').endsWith('/auth/profile')) {
        profiles.push(request.headers().authorization ?? '')
        return route.fulfill({ status: mode === 'revoked' ? 401 : 200, json: mode === 'revoked' ? { message: 'Sesión revocada' } : user })
      }
      // The destination is deliberately inert: this tests authentication and
      // shared storage, without inheriting dashboard or business acceptance.
      if (request.isNavigationRequest() && url.pathname === '/dashboard/') {
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Destino autenticado de prueba</h1>' })
      }
      if (url.pathname.includes('/api/')) return route.fulfill({ status: 503, json: { message: 'Fuera del alcance del caso aislado' } })
      return route.continue()
    })
    await page.goto('/login/', { waitUntil: 'domcontentloaded' })
    if (mode === 'valid') {
      await expect(page).toHaveURL(/\/dashboard\/$/)
      expect(profiles.length).toBeGreaterThan(0)
      expect(profiles.every(value => value === 'Bearer LOCAL-ISOLATED-OPAQUE-SESSION-PROBE')).toBe(true)
      expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).user, snapshotKey)).toMatchObject(user)
    } else {
      await expect(page.getByLabel('Correo Electrónico')).toBeEnabled()
      await expect(page).toHaveURL(/\/login\/$/)
      expect(await page.evaluate(key => localStorage.getItem(key), snapshotKey)).toBeNull()
      if (mode === 'revoked') expect(profiles.length).toBeGreaterThan(0)
      else expect(profiles).toHaveLength(0)
    }
    expect(writers).toEqual([])
  })
}
