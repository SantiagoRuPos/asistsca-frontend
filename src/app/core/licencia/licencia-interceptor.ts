import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { LicenciaService } from './licencia';

// Debe coincidir exactamente con CODIGO_ERROR_LICENCIA_DEGRADADA del backend
// (src/modules/licenciamiento/guards/licencia.guard.ts).
const CODIGO_LICENCIA_DEGRADADA = 'LICENCIA_DEGRADADA';

/**
 * NO reemplaza el manejo de error de cada pantalla — cada componente sigue
 * mostrando su propio error() como siempre (mismo patrón ya usado en todo el
 * proyecto). Esto solo detecta el 403 ESPECÍFICO que lanza LicenciaGuard (se
 * distingue por `codigoError`, no por el texto del mensaje ni por el status
 * 403 solo, que también lo usa RolesGuard para "sin permiso") y además lo
 * muestra como un aviso puntual en el shell, para que la persona entienda
 * que no fue un problema de permisos sino de la licencia vencida.
 */
export const licenciaInterceptor: HttpInterceptorFn = (req, next) => {
  const licenciaService = inject(LicenciaService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 403 && error.error?.codigoError === CODIGO_LICENCIA_DEGRADADA) {
        licenciaService.registrarBloqueo(
          error.error.message ?? 'No se pudo guardar: la licencia de AsistSCA está vencida.',
        );
      }
      return throwError(() => error);
    }),
  );
};
