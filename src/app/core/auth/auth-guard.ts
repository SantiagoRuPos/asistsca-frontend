import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from './auth';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.estaAutenticado()) {
    return true;
  }

  // Se usa el mismo método "single-flight" que el interceptor HTTP, en vez de
  // llamar authService.refrescar() directo — así, si justo en este momento
  // otra petición también está renovando el token (otra pestaña, otra llamada
  // en curso), no se disparan dos refresh en paralelo con el mismo refresh
  // token: el backend rota (invalida) ese token en cuanto una de las dos
  // llamadas tiene éxito, y la otra fallaría innecesariamente cerrando la sesión.
  return authService.refrescarSiEsNecesario().pipe(
    map(() => true),
    catchError(() => {
      // Si de verdad era un 401 (token inválido/expirado), refrescarSiEsNecesario()
      // ya limpió la sesión guardada. Si fue un error transitorio (backend
      // reiniciando, red), el refresh token sigue guardado en localStorage: un
      // siguiente F5 cuando el backend vuelva a responder debe entrar sin pedir
      // la contraseña de nuevo.
      router.navigate(['/login']);
      return of(false);
    }),
  );
};
