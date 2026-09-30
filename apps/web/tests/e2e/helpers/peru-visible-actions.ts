import type { Page } from '@playwright/test'

// Inventario de controles realmente visibles. No acredita su ejecución.
// No captura valores de formularios, query strings ni enlaces firmados.
export async function visiblePeruActions(page: Page) {
  return page.locator('main button, main a, main input, main select, main textarea').evaluateAll(nodes =>
    nodes.filter(node => {
      const box = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    }).map(node => {
      const control = node as HTMLInputElement
      const label = node.getAttribute('aria-label') || control.labels?.[0]?.textContent ||
        node.textContent || node.getAttribute('placeholder') || node.getAttribute('title') || ''
      const href = node.getAttribute('href')
      return {
        element: node.tagName.toLowerCase(),
        label: label.trim().replace(/\s+/g, ' ').slice(0, 180),
        type: node.getAttribute('type'),
        disabled: control.disabled === true || node.getAttribute('aria-disabled') === 'true',
        path: href ? new URL(href, location.href).pathname.replace(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi, '[id]') : null,
        executed: false,
      }
    }))
}
