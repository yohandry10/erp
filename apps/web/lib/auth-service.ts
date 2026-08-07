import { buildApiUrl } from './api-url';
import { getOfflineStatus, isDesktopRuntime } from './offline-store';
import {
  clearDesktopAccessToken,
  loadDesktopAccessToken,
  saveDesktopAccessToken,
} from './desktop-secure-session';

const AUTH_SESSION_STORAGE_KEY = 'erp.auth.session.snapshot';
const PERMISSION_STORAGE_KEY = 'erp.permissions.snapshot';
let desktopTokenMutation: Promise<void> = Promise.resolve();

function queueDesktopTokenMutation(operation: () => Promise<void>) {
  desktopTokenMutation = desktopTokenMutation.catch(() => undefined).then(operation);
  return desktopTokenMutation;
}

function readSafeSessionSnapshot(): Session | null {
  if (typeof window === 'undefined') return null;
  const raw =
    window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY) ||
    window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Session;
  if (!parsed?.user?.id) return null;
  const sanitized = { ...parsed, access_token: undefined };
  if (parsed.access_token) {
    const json = JSON.stringify(sanitized);
    window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, json);
    window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, json);
  }
  return sanitized;
}

// Rutas públicas donde el middleware ya garantiza que NO hay sesión válida (si la
// hubiera, redirigiría a /dashboard antes de renderizar). Cualquier llamada a
// /auth/profile desde estas páginas produce un 401 esperado que ensucia la consola
// sin aportar información. Lista exacta (no incluye sub-rutas como /demo/convert).
const PUBLIC_AUTH_SKIP_PATHS = new Set(['/login', '/demo']);

function isPublicAuthSkipPath(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname;
  // next.config.js usa trailingSlash: true → puede llegar como "/login/".
  const normalized = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  return PUBLIC_AUTH_SKIP_PATHS.has(normalized);
}

function extractErrorMessage(payload: any): string | null {
  const candidate = payload?.message ?? payload?.error ?? payload?.detail;
  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate;
  }
  if (Array.isArray(candidate)) {
    const message = candidate.filter((item) => typeof item === 'string' && item.trim()).join(', ');
    return message || null;
  }
  return null;
}

function authErrorMessageForStatus(status: number, payload: any, fallback = 'Error de autenticación'): string {
  const payloadMessage = extractErrorMessage(payload);
  if (payloadMessage) return payloadMessage;

  if (status === 401) return 'Credenciales inválidas';
  if (status === 403) return 'No tienes permisos para esta operación';
  if (status === 429) return 'Demasiados intentos. Espera un momento antes de volver a intentar';
  if (status === 503) return 'Servicio de autenticación temporalmente no disponible';

  return fallback;
}

export interface User {
  id: string;
  email: string;
  nombre: string;
  apellido?: string;
  nombre_usuario?: string;
  roles: string[];
  tenant_id: string;
  is_super_admin: boolean;
}

export interface LoginResponse {
  access_token: string;
  user: User;
  session_token?: string;
}

export interface Session {
  user: User;
  access_token?: string;
}

class AuthService {
  private session: Session | null = null;
  private accessToken: string | null = null;
  private listeners: ((session: Session | null) => void)[] = [];
  private profileInFlight: Promise<User | null> | null = null;

  constructor() {
    // Persistencia en memoria únicamente. El token real vive en cookie HttpOnly.
  }

  private normalizeUserPayload(raw: any): User {
    // El backend devuelve `roles` con dos formas distintas:
    //   - POST /api/auth/login → roles: [{ id, nombre, descripcion }]   (objetos)
    //   - GET  /api/auth/profile → roles: ['ADMIN', ...]                (strings)
    // Normalizamos a string[] siempre para que el resto de la app (sidebar,
    // guards) pueda usar role.toUpperCase() / includes() sin chequeos de tipo.
    const rawRoles = Array.isArray(raw?.roles) ? raw.roles : [];
    const roles = rawRoles
      .map((r: any) => (typeof r === 'string' ? r : r?.nombre))
      .filter((r: any): r is string => typeof r === 'string' && r.length > 0);

    return {
      id: raw?.id,
      email: raw?.email,
      nombre: raw?.nombre || raw?.username || raw?.email?.split?.('@')[0] || 'Usuario',
      apellido: raw?.apellido || '',
      nombre_usuario: raw?.nombre_usuario || raw?.username,
      roles,
      tenant_id: raw?.tenant_id,
      is_super_admin: raw?.is_super_admin === true || raw?.isSuperAdmin === true || raw?.super_admin === true,
    };
  }

  private async fetchProfile(): Promise<User | null> {
    // Coalescer llamadas concurrentes: un burst de fetchApi/getSession en una misma
    // navegación comparte una sola request a /auth/profile en vuelo, evitando N
    // round-trips redundantes contra el API remoto. Sin TTL → cero staleness: solo
    // se deduplica el vuelo activo; llamadas posteriores vuelven a consultar.
    if (this.profileInFlight) return this.profileInFlight;
    this.profileInFlight = this.doFetchProfile().finally(() => {
      this.profileInFlight = null;
    });
    return this.profileInFlight;
  }

  private async doFetchProfile(): Promise<User | null> {
    if (await this.isOfflineAuthMode()) {
      return this.getCachedSession().session?.user ?? null;
    }

    // Corto-circuito: en /login y /demo el middleware garantiza ausencia de
    // sesión EN EL MOMENTO INICIAL. Pero después de signInWithPassword (login
    // exitoso desde /demo o /login) ya tenemos accessToken en memoria y SÍ
    // queremos llamar a /auth/profile para obtener el payload canónico
    // (roles como string[], no como objetos). Por eso saltamos solo si aún
    // no hay accessToken.
    if (isPublicAuthSkipPath() && !this.accessToken) {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(buildApiUrl('/api/auth/profile/'), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
      },
      credentials: 'include',
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (response.status === 401 || response.status === 403) {
      return null;
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(authErrorMessageForStatus(response.status, payload, 'No fue posible validar la sesión'));
    }

    const user = await response.json();
    return this.normalizeUserPayload(user);
  }

  private async isOfflineAuthMode(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
    if (!isDesktopRuntime()) return false;
    try {
      return (await getOfflineStatus()).offline_mode;
    } catch {
      return false;
    }
  }

  private saveSession(session: Session) {
    this.session = session;
    this.accessToken = session.access_token || this.accessToken;
    if (session.access_token) {
      void queueDesktopTokenMutation(() => saveDesktopAccessToken(session.access_token!)).catch((error) => {
        console.warn('[auth] No se pudo proteger la sesión de escritorio:', error);
      });
    }
    this.notifyListeners();
  }

  private clearSession() {
    this.session = null;
    this.accessToken = null;
    void queueDesktopTokenMutation(clearDesktopAccessToken).catch(() => undefined);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
        window.sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
        window.localStorage.removeItem(PERMISSION_STORAGE_KEY);
      } catch {
        /* limpiar cache local no debe bloquear logout */
      }
    }
    this.notifyListeners();
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener(this.session));
  }

  async signInWithPassword(credentials: { email: string; password: string }): Promise<{
    data: { user: User; session: Session } | null;
    error: Error | null;
  }> {
    try {
      const response = await fetch(buildApiUrl('/api/auth/login/'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          data: null,
          error: new Error(authErrorMessageForStatus(response.status, errorData)),
        };
      }

      const loginData: LoginResponse = await response.json();
      const loginUser = this.normalizeUserPayload(loginData.user);
      if (!loginUser.id) {
        return {
          data: null,
          error: new Error('Respuesta de autenticación incompleta'),
        };
      }

      this.accessToken = loginData.access_token;

      // Refrescar desde cookie/token para obtener el payload canónico del usuario.
      const profileUser = await this.fetchProfile().catch(() => null);
      const session: Session = {
        user: profileUser || loginUser,
        access_token: loginData.access_token,
      };
      this.saveSession(session);

      return {
        data: { user: session.user, session },
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error('Error de conexión'),
      };
    }
  }

  async signOut(): Promise<{ error: Error | null }> {
    try {
      if (!(await this.isOfflineAuthMode())) {
        await fetch(buildApiUrl('/api/auth/logout/'), {
          method: 'POST',
          credentials: 'include',
          headers: {
            ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
          },
        });
      }
      this.clearSession();
      return { error: null };
    } catch (error) {
      this.clearSession();
      return { error: null };
    }
  }

  // Sesión cacheada SIN red: hidrata desde memoria o snapshot (localStorage/sessionStorage)
  // pero NUNCA llama a /auth/profile. La usa fetchApi en cada request (solo necesita token +
  // tenant/user para headers/meta). El refresh/validación real de sesión lo hacen
  // AuthContext.loadSession y use-api (cuando falta user) vía getSession(). Reduce 1 round-trip
  // de perfil por cada request basada en fetchApi contra el API remoto.
  getCachedSession(): { session: Session | null; accessToken: string | null } {
    if (!this.session && typeof window !== 'undefined') {
      try {
        const stored = readSafeSessionSnapshot();
        if (stored?.user?.id) {
          // Hidratación silenciosa (sin notifyListeners): es una lectura, no un cambio de sesión.
          this.session = stored;
        }
      } catch {
        /* hidratación optimista; sin red */
      }
    }
    return { session: this.session, accessToken: this.accessToken };
  }

  async getSession(): Promise<{ data: { session: Session | null }; error: Error | null }> {
    let storedSession: Session | null = null;

    if (!this.accessToken && isDesktopRuntime()) {
      try {
        await desktopTokenMutation.catch(() => undefined);
        this.accessToken = await loadDesktopAccessToken();
      } catch (error) {
        console.warn('[auth] No se pudo recuperar la sesión protegida de escritorio:', error);
      }
    }

    if (!this.session && typeof window !== 'undefined') {
      try {
        storedSession = readSafeSessionSnapshot();

        if (storedSession?.user?.id) {
          this.saveSession(storedSession);
        }
      } catch {
        /* ignore optimistic session hydration failures */
      }
    }

    if (typeof window !== 'undefined') {
      try {
        const user = (await this.isOfflineAuthMode())
          ? (this.session?.user ?? storedSession?.user ?? null)
          : await this.fetchProfile();
        if (user) {
          this.saveSession({ user, access_token: this.accessToken || undefined });
        } else {
          // Si el perfil canónico ya no existe para la cookie actual, cualquier
          // snapshot optimista es obsoleto y debe descartarse.
          this.clearSession();
        }
      } catch {
        if (!this.session) {
          this.clearSession();
        }
      }
    }

    return {
      data: { session: this.session },
      error: null,
    };
  }

  async setSession(session: { access_token: string; refresh_token?: string }): Promise<{
    data: { session: Session | null };
    error: Error | null;
  }> {
    try {
      void session;
      if (await this.isOfflineAuthMode()) {
        const cached = this.getCachedSession().session;
        return {
          data: { session: cached },
          error: cached ? null : new Error('No hay sesion local para operar offline'),
        };
      }
      const response = await fetch(buildApiUrl('/api/auth/profile/'), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Token inválido');
      }

      const user = this.normalizeUserPayload(await response.json());
      const newSession: Session = {
        user,
        access_token: session.access_token,
      };
      this.accessToken = session.access_token;

      this.saveSession(newSession);

      return {
        data: { session: newSession },
        error: null,
      };
    } catch (error) {
      return {
        data: { session: null },
        error: error instanceof Error ? error : new Error('Error al establecer sesión'),
      };
    }
  }

  onAuthStateChange(callback: (event: string, session: Session | null) => void): {
    data: { subscription: { unsubscribe: () => void } };
  } {
    const listener = (session: Session | null) => {
      callback(session ? 'SIGNED_IN' : 'SIGNED_OUT', session);
    };

    this.listeners.push(listener);
    if (this.session) {
      listener(this.session);
    }

    return {
      data: {
        subscription: {
          unsubscribe: () => {
            const index = this.listeners.indexOf(listener);
            if (index > -1) {
              this.listeners.splice(index, 1);
            }
          },
        },
      },
    };
  }
}

export const authService = new AuthService();

export const customAuth = {
  signInWithPassword: authService.signInWithPassword.bind(authService),
  signOut: authService.signOut.bind(authService),
  getSession: authService.getSession.bind(authService),
  getCachedSession: authService.getCachedSession.bind(authService),
  setSession: authService.setSession.bind(authService),
  onAuthStateChange: authService.onAuthStateChange.bind(authService),
};
