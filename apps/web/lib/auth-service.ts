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
      console.log('🔄 [AuthService] Cargando sesión desde localStorage...');
      
      // Diagnóstico completo de localStorage
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        const allKeys = Object.keys(localStorage);
        console.log('🔍 [AuthService] Diagnóstico localStorage:', {
          allKeys: allKeys,
          hasAccessToken: localStorage.getItem('access_token') !== null,
          hasUser: localStorage.getItem('user') !== null,
          localStorageSize: localStorage.length
        });
      }
      
      const token = localStorage.getItem('access_token');
      
      console.log('🔍 [AuthService] Token encontrado:', token ? `SÍ (${token.length} caracteres)` : 'NO');
      
      if (token) {
        // Decodificar el JWT para obtener los datos actuales
        try {
          const base64Url = token.split('.')[1];
          if (!base64Url) {
            throw new Error('Token JWT inválido: no tiene formato correcto (partes separadas por puntos)');
          }
          
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(
            atob(base64)
              .split('')
              .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
              .join('')
          );
          const payload = JSON.parse(jsonPayload);
          
          // Verificar expiración
          if (payload.exp) {
            const expirationDate = new Date(payload.exp * 1000);
            const now = new Date();
            const isExpired = payload.exp * 1000 < Date.now();
            
            console.log('🕐 [AuthService] Información de expiración del token:', {
              expirationDate: expirationDate.toISOString(),
              now: now.toISOString(),
              isExpired: isExpired,
              expiresIn: isExpired ? 'EXPIRADO' : `${Math.round((payload.exp * 1000 - Date.now()) / 1000 / 60)} minutos`
            });
            
            if (isExpired) {
              console.warn('⚠️ [AuthService] Token expirado, limpiando sesión');
              this.clearSession();
              return;
            }
          }
          
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
          console.log('✅ [AuthService] Sesión cargada exitosamente:', {
            userId: user.id,
            email: user.email,
            tenantId: user.tenant_id
          });
          
          // Actualizar localStorage con datos correctos del JWT
          localStorage.setItem('user', JSON.stringify(user));
        } catch (decodeError) {
          console.error('❌ [AuthService] Error decoding JWT:', decodeError);
          console.error('❌ [AuthService] Token problemático (primeros 50 caracteres):', token.substring(0, 50));
          console.error('❌ [AuthService] Esto podría indicar que el token fue corrompido o nunca se guardó correctamente');
          this.clearSession();
        }
      } else {
        console.log('ℹ️ [AuthService] No hay token en localStorage');
        console.log('💡 [AuthService] Posibles causas:');
        console.log('   1. El usuario nunca completó el login');
        console.log('   2. El token fue limpiado por otra parte del código');
        console.log('   3. El localStorage fue limpiado manualmente o por el navegador');
        console.log('   4. Problema de timing: el componente se montó antes de que el token se guardara');
      }
    } catch (error) {
      console.error('❌ [AuthService] Error loading session:', error);
      console.error('❌ [AuthService] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        errorType: error?.constructor?.name
      });
      // Solo limpiar si realmente hay un error crítico
      // No limpiar si simplemente no hay token (eso es normal si el usuario no está logueado)
      if (error instanceof Error && error.message.includes('localStorage')) {
        console.error('❌ [AuthService] Error crítico con localStorage - puede estar deshabilitado o bloqueado');
        this.clearSession();
      }
    }
  }

  private saveSession(session: Session) {
    console.log('💾 [AuthService] Guardando sesión:', {
      hasToken: !!session.access_token,
      tokenLength: session.access_token?.length,
      userId: session.user?.id,
      userEmail: session.user?.email,
      tenantId: session.user?.tenant_id,
    });
    
    // ✅ CRÍTICO: Guardar en memoria PRIMERO
    this.session = session;
    
    // Verificar que estamos en el navegador
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        // ✅ Guardar token y usuario
        localStorage.setItem('access_token', session.access_token);
        localStorage.setItem('user', JSON.stringify(session.user));
        
        // ✅ CRÍTICO: Forzar sincronización del localStorage
        // Algunos navegadores hacen esto de forma asíncrona
        const forceSync = localStorage.getItem('access_token');
        
        console.log('✅ [AuthService] Token guardado en localStorage');
        
        // Verificar inmediatamente que se guardó correctamente
        const savedToken = localStorage.getItem('access_token');
        const savedUser = localStorage.getItem('user');
        
        if (!savedToken || savedToken !== session.access_token) {
          console.error('❌ [AuthService] CRÍTICO: Token no se guardó correctamente en localStorage');
          console.error('❌ [AuthService] Token esperado:', session.access_token.substring(0, 50));
          console.error('❌ [AuthService] Token guardado:', savedToken?.substring(0, 50) || 'NULL');
          throw new Error('Failed to save token to localStorage');
        }
        
        console.log('🔍 [AuthService] Verificación exitosa:', {
          tokenSaved: !!savedToken,
          userSaved: !!savedUser,
          tokenMatches: savedToken === session.access_token
        });
      } catch (error) {
        console.error('❌ [AuthService] Error guardando en localStorage:', error);
        // Re-throw para que el login maneje el error
        throw error;
      }
      
      // También guardar en cookie para el middleware (con SameSite y Secure)
      try {
        const cookieOptions = [
          `access_token=${session.access_token}`,
          'path=/',
          'max-age=28800', // 8 horas
          'SameSite=Lax', // Permitir en requests del mismo sitio
          // No usar Secure en desarrollo local (solo en HTTPS)
          ...(window.location.protocol === 'https:' ? ['Secure'] : [])
        ].join('; ');
        
        document.cookie = cookieOptions;
        console.log('✅ [AuthService] Token guardado en cookie:', {
          hasCookie: document.cookie.includes('access_token'),
          cookieLength: document.cookie.length
        });
      } catch (error) {
        console.error('❌ [AuthService] Error guardando cookie:', error);
        // No throw - la cookie es opcional
      }
    } else {
      console.error('❌ [AuthService] localStorage no disponible - ejecutando en servidor?');
      throw new Error('localStorage not available');
    }
    
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
      console.log('🔐 [AuthService] Intentando login:', credentials.email);
      
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      console.log('📡 [AuthService] Respuesta del servidor:', response.status, response.statusText);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Error de autenticación' }));
        console.error('❌ [AuthService] Error en login:', errorData);
        return {
          data: null,
          error: new Error(errorData.message || 'Credenciales inválidas'),
        };
      }

      const loginData: LoginResponse = await response.json();
      console.log('✅ [AuthService] Login exitoso - Datos recibidos:', {
        hasToken: !!loginData.access_token,
        tokenPreview: loginData.access_token?.substring(0, 20) + '...',
        userId: loginData.user?.id,
        userEmail: loginData.user?.email,
        tenantId: loginData.user?.tenant_id,
      });
      
      if (!loginData.access_token) {
        console.error('❌ [AuthService] CRÍTICO: Backend no devolvió access_token');
        return {
          data: null,
          error: new Error('Error: No se recibió token de autenticación'),
        };
      }
      
      const session: Session = {
        access_token: loginData.access_token,
        user: loginData.user,
      };

      console.log('📝 [AuthService] Llamando a saveSession...');
      this.saveSession(session);
      console.log('📝 [AuthService] saveSession completado');

      return {
        data: { user: loginData.user, session },
        error: null,
      };
    } catch (error) {
      console.error('❌ [AuthService] Login error:', error);
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
    // Si no hay sesión en memoria, intentar cargar desde localStorage
    if (!this.session && typeof window !== 'undefined') {
      console.log('🔄 [AuthService] getSession: No hay sesión en memoria, recargando...');
      this.loadSession();
    }
    
    // Verificar que el token aún existe en localStorage
    if (this.session && typeof window !== 'undefined') {
      const storedToken = localStorage.getItem('access_token');
      if (!storedToken || storedToken !== this.session.access_token) {
        console.warn('⚠️ [AuthService] Token en memoria no coincide con localStorage, recargando...');
        console.warn('⚠️ [AuthService] Detalles:', {
          hasSessionInMemory: !!this.session,
          hasTokenInMemory: !!this.session?.access_token,
          hasTokenInStorage: !!storedToken,
          tokensMatch: storedToken === this.session.access_token
        });
        this.loadSession();
      }
    }
    
    const result = {
      hasSession: !!this.session,
      hasToken: !!this.session?.access_token,
      userId: this.session?.user?.id,
      userEmail: this.session?.user?.email,
      tenantId: this.session?.user?.tenant_id
    };
    
    console.log('📤 [AuthService] getSession retornando:', result);
    
    // Si no hay sesión, agregar información adicional para diagnóstico
    if (!this.session && typeof window !== 'undefined') {
      const tokenInStorage = localStorage.getItem('access_token');
      console.log('🔍 [AuthService] Diagnóstico adicional - No hay sesión pero:', {
        hasTokenInStorage: !!tokenInStorage,
        tokenLength: tokenInStorage?.length || 0,
        localStorageKeys: Object.keys(localStorage)
      });
    }
    
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
