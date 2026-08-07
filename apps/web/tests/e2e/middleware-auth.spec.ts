import { expect, test } from '@playwright/test'
import { hasPlausibleUnexpiredJwt } from '../../lib/middleware-auth'

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
const unsignedFixture = (payload: Record<string, unknown>) =>
  `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.fixture-signature`

test.describe('fallback de disponibilidad del middleware', () => {
  const now = 2_000_000_000

  test('acepta temporalmente un JWT vigente con usuario y tenant', () => {
    expect(hasPlausibleUnexpiredJwt(unsignedFixture({
      sub: 'user-1',
      tenant_id: 'tenant-1',
      exp: now + 60,
    }), now)).toBe(true)
  })

  test('acepta un superadmin vigente sin tenant', () => {
    expect(hasPlausibleUnexpiredJwt(unsignedFixture({
      sub: 'admin-1',
      is_super_admin: true,
      exp: now + 60,
    }), now)).toBe(true)
  })

  const invalidCases: Array<[string, Record<string, unknown>]> = [
    ['vencido', { sub: 'user-1', tenant_id: 'tenant-1', exp: now }],
    ['sin usuario', { tenant_id: 'tenant-1', exp: now + 60 }],
    ['sin tenant', { sub: 'user-1', exp: now + 60 }],
    ['sin expiración', { sub: 'user-1', tenant_id: 'tenant-1' }],
  ]

  for (const [name, payload] of invalidCases) {
    test(`rechaza un token ${name}`, () => {
      expect(hasPlausibleUnexpiredJwt(unsignedFixture(payload), now)).toBe(false)
    })
  }

  test('rechaza texto que no sea JWT', () => {
    expect(hasPlausibleUnexpiredJwt('not-a-token', now)).toBe(false)
  })
})
