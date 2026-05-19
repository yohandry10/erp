const API_URL = '/backend';

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
}

class AuthService {
  private session: Session | null = null;
  private listeners: ((session: Session | null) => void)[] = [];

  constructor() {
    // Persistencia en memoria únicamente. El token real vive en cookie HttpOnly.
  }

  private normalizeUserPayload(raw: any): User {
    return {
      id: raw?.id,
      email: raw?.email,
      nombre: raw?.nombre || raw?.username || raw?.email?.split?.('@')[0] || 'Usuario',
      apellido: raw?.apellido || '',
      nombre_usuario: raw?.nombre_usuario || raw?.username,
      roles: raw?.roles || [],
      tenant_id: raw?.tenant_id,
      is_super_admin: raw?.is_super_admin === true || raw?.isSuperAdmin === true || raw?.super_admin === true,
    };
  }

  private async fetchProfile() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(`${API_URL}/api/auth/profile/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (response.status === 401 || response.status === 403) {
      return null;
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.message || 'No fue posible validar la sesión');
    }

    const user = await response.json();
    return this.normalizeUserPayload(user);
  }

  private saveSession(session: Session) {
    this.session = session;
    this.notifyListeners();
  }

  private clearSession() {
    this.session = null;
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
      const response = await fetch(`${API_URL}/api/auth/login/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Error de autenticación' }));
        return {
          data: null,
          error: new Error(errorData.message || 'Credenciales inválidas'),
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

      // Refrescar desde cookie para obtener el payload canónico del usuario.
      const profileUser = await this.fetchProfile().catch(() => null);
      const session: Session = {
        user: profileUser || loginUser,
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
      await fetch(`${API_URL}/api/auth/logout/`, {
        method: 'POST',
        credentials: 'include',
      });
      this.clearSession();
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Error al cerrar sesión') };
    }
  }

  async getSession(): Promise<{ data: { session: Session | null }; error: Error | null }> {
    if (!this.session && typeof window !== 'undefined') {
      try {
        const user = await this.fetchProfile();
        if (user) {
          this.saveSession({ user });
        } else {
          this.clearSession();
        }
      } catch {
        this.clearSession();
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
      const response = await fetch(`${API_URL}/api/auth/profile/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Token inválido');
      }

      const user = this.normalizeUserPayload(await response.json());
      const newSession: Session = {
        user,
      };

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
  setSession: authService.setSession.bind(authService),
  onAuthStateChange: authService.onAuthStateChange.bind(authService),
};
