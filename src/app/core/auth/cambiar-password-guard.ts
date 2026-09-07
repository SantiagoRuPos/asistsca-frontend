import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { AuthService } from './auth';

/**
 * Se aplica como `canActivateChild` en la ruta raíz del shell (ver
 * app.routes.ts), así que corre en cada navegación entre pantallas ya
 * autenticadas. Si el usuario tiene `debeCambiarPassword` en true (contraseña
 * temporal recién asignada por un administrador, ver UsuariosService.registrar
 * y AcademicoService.crearProfesor en el backend) lo manda directo a "Mi
 * perfil" y no lo deja navegar a ninguna otra pantalla hasta que la cambie.
 * "Mi perfil" siempre queda exento, o nadie podría llegar a cambiarla.
 */
export const cambiarPasswordGuard: CanActivateChildFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const usuario = authService.usuario();

  if (!usuario?.debeCambiarPassword || state.url.startsWith('/perfil')) {
    return true;
  }

  router.navigate(['/perfil'], { queryParams: { forzado: '1' } });
  return false;
};
