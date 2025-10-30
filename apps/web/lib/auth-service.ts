/**
 * Servicio de autenticación custom que reemplaza Supabase Auth
 * Usa el backend API en lugar de Supabase Auth
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

export interface User {
  id: string;
  email: string;
  nombre: string;
  apellido?: string;
  nombre_usuario?: string;
  roles: any[];
  tenant_id: string;
  is_super_admin: boolean;
}

export interface LoginResponse {
  access_token: string;
  user: User;
  session_token?: string;
}

export interface Session {
  access_token: string;
  user: User;
}

class AuthService {
  private session: Session | null = null;
  private listeners: ((session: Session | null) => void)[] = [];

  constructor() {
    // Cargar sesión del localStorage al iniciar
    if (typeof window !== 'undefined') {
      this.loadSession();
    }
  }

  private loadSession() {
    try {
      const token = localStorage.getItem('access_token');
      
      if (token) {
        // Decodificar el JWT para obtener los datos actuales
        try {
          const base64Url = token.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(
            atob(base64)
              .split('')
              .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
              .join('')
          );
          const payload = JSON.parse(jsonPayload);
          
          // Crear usuario desde el JWT, no desde localStorage
          const user = {
            id: payload.sub,
            email: payload.email,
            nombre: payload.username || payload.email.split('@')[0],
            apellido: '',
            nombre_usuario: payload.username,
            roles: payload.roles || [],
            tenant_id: payload.tenant_id,
            is_super_admin: payload.is_super_admin || false,
          };
          
          this.session = { access_token: token, user };
          
          // Actualizar localStorage con datos correctos del JWT
          localStorage.setItem('user', JSON.stringify(user));
        } catch (decodeError) {
          console.error('Error decoding JWT:', decodeError);
          this.clearSession();
        }
      }
    } catch (error) {
      console.error('Error loading session:', error);
      this.clearSession();
    }
  }

  private saveSession(session: Session) {
    this.session = session;
    localStorage.setItem('access_token', session.access_token);
    localStorage.setItem('user', JSON.stringify(session.user));
    
    // También guardar en cookie para el middleware
    document.cookie = `access_token=${session.access_token}; path=/; max-age=28800`; // 8 horas
    
    this.notifyListeners();
  }

  private clearSession() {
    this.session = null;
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    
    // También limpiar cookie
    document.cookie = 'access_token=; path=/; max-age=0';
    
    this.notifyListeners();
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.session));
  }

  /**
   * Login con email y contraseña
   */
  async signInWithPassword(credentials: { email: string; password: string }): Promise<{ data: { user: User; session: Session } | null; error: Error | null }> {
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
      
      const session: Session = {
        access_token: loginData.access_token,
        user: loginData.user,
      };

      this.saveSession(session);

      return {
        data: { user: loginData.user, session },
        error: null,
      };
    } catch (error) {
      console.error('Login error:', error);
      return {
        data: null,
        error: error instanceof Error ? error : new Error('Error de conexión'),
      };
    }
  }

  /**
   * Logout
   */
  async signOut(): Promise<{ error: Error | null }> {
    try {
      // Opcional: llamar al backend para invalidar la sesión
      if (this.session) {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.session.access_token}`,
          },
        }).catch(() => {
          // Ignorar errores del backend, limpiar sesión local de todos modos
        });
      }

      this.clearSession();
      return { error: null };
    } catch (error) {
      console.error('Logout error:', error);
      return { error: error instanceof Error ? error : new Error('Error al cerrar sesión') };
    }
  }

  /**
   * Obtener sesión actual
   */
  async getSession(): Promise<{ data: { session: Session | null }; error: Error | null }> {
    return {
      data: { session: this.session },
      error: null,
    };
  }

  /**
   * Establecer sesión manualmente
   */
  async setSession(session: { access_token: string; refresh_token?: string }): Promise<{ data: { session: Session | null }; error: Error | null }> {
    try {
      // Validar el token con el backend
      const response = await fetch(`${API_URL}/api/auth/profile`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Token inválido');
      }

      const user: User = await response.json();
      
      const newSession: Session = {
        access_token: session.access_token,
        user,
      };

      this.saveSession(newSession);

      return {
        data: { session: newSession },
        error: null,
      };
    } catch (error) {
      console.error('Set session error:', error);
      return {
        data: { session: null },
        error: error instanceof Error ? error : new Error('Error al establecer sesión'),
      };
    }
  }

  /**
   * Escuchar cambios en la autenticación
   */
  onAuthStateChange(callback: (event: string, session: Session | null) => void): { data: { subscription: { unsubscribe: () => void } } } {
    const listener = (session: Session | null) => {
      callback(session ? 'SIGNED_IN' : 'SIGNED_OUT', session);
    };

    this.listeners.push(listener);

    // Llamar inmediatamente con el estado actual
    listener(this.session);

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

// Exportar instancia singleton
export const authService = new AuthService();

// Exportar objeto compatible con Supabase Auth
export const customAuth = {
  signInWithPassword: authService.signInWithPassword.bind(authService),
  signOut: authService.signOut.bind(authService),
  getSession: authService.getSession.bind(authService),
  setSession: authService.setSession.bind(authService),
  onAuthStateChange: authService.onAuthStateChange.bind(authService),
};
