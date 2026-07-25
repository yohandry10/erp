import { invoke } from '@tauri-apps/api/core'
import { isDesktopRuntime } from './offline-store'

export async function saveDesktopAccessToken(accessToken: string): Promise<void> {
  if (!isDesktopRuntime() || !accessToken.trim()) return
  await invoke('save_secure_access_token', { accessToken })
}

export async function loadDesktopAccessToken(): Promise<string | null> {
  if (!isDesktopRuntime()) return null
  return invoke<string | null>('load_secure_access_token')
}

export async function clearDesktopAccessToken(): Promise<void> {
  if (!isDesktopRuntime()) return
  await invoke('clear_secure_access_token')
}
