import { customAuth } from '@/lib/auth-service'

let confirming = false

/** A cancelled, rejected, stale or concurrent dialog never authorizes an action. */
export async function requestConfirmation(message: string, isCurrent: () => boolean = () => true): Promise<boolean> {
  if (typeof window === 'undefined' || confirming) return false
  confirming = true
  const cleanups: Array<() => void> = []
  let invalidated = false
  const invalidate = () => { invalidated = true }
  try {
    // Cached user includes the current actor, tenant, roles and permission snapshot;
    // this reads no token and performs no network request.
    const actor = () => JSON.stringify(customAuth.getCachedSession().session?.user ?? null)
    const location = () => window.location.pathname + window.location.search + window.location.hash
    const initialActor = actor(), initialLocation = location()
    let armed = false
    const { data: { subscription } } = customAuth.onAuthStateChange(() => {
      // onAuthStateChange immediately delivers its initial cached session.
      // Every subsequent notification invalidates, even A -> B -> A.
      if (armed || actor() !== initialActor) invalidate()
    })
    armed = true
    cleanups.push(() => subscription.unsubscribe())
    for (const event of ['pagehide', 'popstate', 'hashchange', 'storage', 'input', 'change']) {
      window.addEventListener(event, invalidate, true)
      cleanups.push(() => window.removeEventListener(event, invalidate, true))
    }
    const navigation = (window as Window & { navigation?: EventTarget }).navigation
    navigation?.addEventListener('navigate', invalidate)
    cleanups.push(() => navigation?.removeEventListener('navigate', invalidate))
    if (!isCurrent() || invalidated || actor() !== initialActor) return false
    const answer = await window.confirm(message)
    return answer === true && !invalidated && actor() === initialActor && location() === initialLocation && isCurrent()
  } catch {
    return false
  } finally {
    for (const cleanup of cleanups.reverse()) {
      try { cleanup() } catch { /* Cleanup failure never authorizes a writer. */ }
    }
    confirming = false
  }
}
