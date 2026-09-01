import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth';

const RUTAS_SIN_TOKEN = ['/auth/login', '/auth/refresh'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const requiereToken = !RUTAS_SIN_TOKEN.some((ruta) => req.url.includes(ruta));
  const accessToken = authService.obtenerAccessToken();

  const solicitud =
    requiereToken && accessToken
      ? req.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } })
      : req;

  return next(solicitud).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || !requiereToken) {
        return throwError(() => error);
      }

      return authService
        .refrescarSiEsNecesario()
        .pipe(switchMap((nuevoToken) => next(req.clone({ setHeaders: { Authorization: `Bearer ${nuevoToken}` } }))));
    }),
  );
};