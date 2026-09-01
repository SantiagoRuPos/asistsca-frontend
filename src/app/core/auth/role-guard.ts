import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth';

export const roleGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const rolesPermitidos = route.data['roles'] as string[] | undefined;
  const rolActual = authService.usuario()?.rol;

  if (!rolesPermitidos || (rolActual && rolesPermitidos.includes(rolActual))) {
    return true;
  }

  router.navigate(['/']);
  return false;
};