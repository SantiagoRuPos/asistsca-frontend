import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, catchError, filter, map, retry, take, tap, throwError, timer } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface UsuarioSesion {
  sub: string;
  email: string;
  rol: string;
  nombreCompleto: string;
  debeCambiarPassword: boolean;
}

interface RespuestaTokens {
  accessToken: string;
  refreshToken: string;
}

const CLAVE_REFRESH_TOKEN = 'asistsca-refresh-token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly accessToken = signal<string | null>(null);
  private readonly refreshToken = signal<string | null>(this.leerRefreshTokenGuardado());

  readonly usuario = signal<UsuarioSesion | null>(null);
  readonly estaAutenticado = computed(() => this.accessToken() !== null);

  private refrescando = false;
  private readonly tokenRenovado$ = new BehaviorSubject<string | null>(null);

  login(email: string, password: string): Observable<RespuestaTokens> {
    return this.http
      .post<RespuestaTokens>(`${environment.apiUrl}/auth/login`, { email, password })
      .pipe(tap((tokens) => this.guardarSesion(tokens)));
  }

  refrescar(): Observable<RespuestaTokens> {
    const refreshTokenActual = this.refreshToken();
    if (!refreshTokenActual) {
      return throwError(() => new Error('No hay sesión activa'));
    }
    return this.http
      .post<RespuestaTokens>(`${environment.apiUrl}/auth/refresh`, { refreshToken: refreshTokenActual })
      .pipe(tap((tokens) => this.guardarSesion(tokens)));
  }

  /**
   * Punto único de renovación de sesión: lo usan tanto el interceptor (tras un 401)
   * como el guard de rutas (al recargar la página). Si ya hay un refresh en curso,
   * los demás llamadores esperan su resultado en vez de disparar otra llamada en
   * paralelo — dos llamadas simultáneas usando el mismo refresh token chocan entre
   * sí, porque el backend lo rota (lo invalida) en cuanto uno de los dos tiene éxito.
   */
  refrescarSiEsNecesario(): Observable<string> {
    if (this.refrescando) {
      return this.tokenRenovado$.pipe(
        filter((token): token is string => token !== null),
        take(1),
      );
    }

    this.refrescando = true;
    this.tokenRenovado$.next(null);

    return this.refrescar().pipe(
      // Un fallo transitorio (backend caído/reiniciando, corte de red) se reintenta
      // una sola vez antes de rendirse — muy común en desarrollo con `--watch`,
      // cuando el backend se está reiniciando justo en el momento del F5. Un 401
      // real (token inválido, expirado o ya usado) no se reintenta: se resuelve de una vez.
      retry({
        count: 1,
        delay: (error) => {
          if (error instanceof HttpErrorResponse && error.status === 401) {
            throw error;
          }
          return timer(800);
        },
      }),
      map((tokens) => tokens.accessToken),
      tap((token) => {
        this.refrescando = false;
        this.tokenRenovado$.next(token);
      }),
      catchError((error) => {
        this.refrescando = false;
        this.tokenRenovado$.next(null);
        // Solo se cierra la sesión de verdad cuando el backend rechazó el refresh
        // token (401 = expiró, fue revocado o ya se usó). Cualquier otro error
        // (backend abajo, red, timeout) no borra el refresh token guardado: un
        // próximo F5 cuando el backend vuelva a responder debe funcionar sin pedir
        // la contraseña de nuevo.
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.limpiarSesion();
          this.router.navigate(['/login']);
        }
        return throwError(() => error);
      }),
    );
  }

  logout(): void {
    const refreshTokenActual = this.refreshToken();
    this.limpiarSesion();
    this.router.navigate(['/login']);

    if (refreshTokenActual) {
      this.http
        .post(`${environment.apiUrl}/auth/logout`, { refreshToken: refreshTokenActual })
        .subscribe({ error: () => {} });
    }
  }

  obtenerAccessToken(): string | null {
    return this.accessToken();
  }

  private guardarSesion(tokens: RespuestaTokens): void {
    this.accessToken.set(tokens.accessToken);
    this.refreshToken.set(tokens.refreshToken);
    localStorage.setItem(CLAVE_REFRESH_TOKEN, tokens.refreshToken);
    this.usuario.set(this.decodificarUsuario(tokens.accessToken));
  }

  private limpiarSesion(): void {
    this.accessToken.set(null);
    this.refreshToken.set(null);
    this.usuario.set(null);
    localStorage.removeItem(CLAVE_REFRESH_TOKEN);
  }

  private leerRefreshTokenGuardado(): string | null {
    return localStorage.getItem(CLAVE_REFRESH_TOKEN);
  }

  private decodificarUsuario(accessToken: string): UsuarioSesion | null {
    try {
      const payloadBase64 = accessToken.split('.')[1];
      const payloadJson = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
      const payload = JSON.parse(payloadJson);
      return {
        sub: payload.sub,
        email: payload.email,
        rol: payload.rol,
        nombreCompleto: payload.nombreCompleto ?? payload.email,
        debeCambiarPassword: payload.debeCambiarPassword === true,
      };
    } catch {
      return null;
    }
  }

  /**
   * Se llama desde "Mi perfil" justo después de cambiar la contraseña con
   * éxito, para que el guard de cambio obligatorio deje de redirigir sin
   * esperar a que el access token actual expire y se renueve (hasta 15
   * minutos) — el backend ya no exige el cambio, pero el token en memoria
   * todavía lo dice hasta el próximo refresh.
   */
  marcarPasswordActualizada(): void {
    this.usuario.update((actual) => (actual ? { ...actual, debeCambiarPassword: false } : actual));
  }
}