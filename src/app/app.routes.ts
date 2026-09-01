import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth-guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell/shell').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'resumen' },
      {
        path: 'resumen',
        loadComponent: () => import('./features/resumen/resumen').then((m) => m.ResumenComponent),
      },
      {
        path: 'asistencias',
        loadComponent: () => import('./features/asistencias/asistencias').then((m) => m.AsistenciasComponent),
      },
      {
        path: 'estudiantes',
        loadComponent: () => import('./features/estudiantes/estudiantes').then((m) => m.EstudiantesComponent),
      },
      {
        path: 'cursos',
        loadComponent: () => import('./features/cursos/cursos').then((m) => m.CursosComponent),
      },
      {
        path: 'cursos/:id',
        loadComponent: () => import('./features/curso-detalle/curso-detalle').then((m) => m.CursoDetalleComponent),
      },
      {
        path: 'excusas',
        loadComponent: () => import('./features/excusas/excusas').then((m) => m.ExcusasComponent),
      },
      {
        path: 'usuarios',
        loadComponent: () => import('./features/usuarios/usuarios').then((m) => m.UsuariosComponent),
      },
      {
        path: 'configuracion',
        loadComponent: () => import('./features/configuracion/configuracion').then((m) => m.ConfiguracionComponent),
      },
    ],
  },
  { path: '**', redirectTo: 'login' },
];