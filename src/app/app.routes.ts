import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth-guard';
import { roleGuard } from './core/auth/role-guard';
import { cambiarPasswordGuard } from './core/auth/cambiar-password-guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    // Corre en cada navegación hija: si la cuenta tiene una contraseña
    // temporal pendiente de cambiar, redirige a /perfil sin importar a dónde
    // se intentaba ir (ver cambiar-password-guard.ts).
    canActivateChild: [cambiarPasswordGuard],
    loadComponent: () => import('./layout/shell/shell').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'resumen' },
      {
        // Sin roleGuard: cualquier cuenta autenticada ve y edita su propio perfil.
        path: 'perfil',
        loadComponent: () => import('./features/perfil/perfil').then((m) => m.PerfilComponent),
      },
      {
        path: 'resumen',
        loadComponent: () => import('./features/resumen/resumen').then((m) => m.ResumenComponent),
      },
      {
        // Un profesor no debe ver Asistencias (solo su propio curso, vía el
        // detalle de curso en /cursos/:id, sí lo puede ver).
        path: 'asistencias',
        canActivate: [roleGuard],
        data: { roles: ['admin', 'rector', 'coordinador'] },
        loadComponent: () => import('./features/asistencias/asistencias').then((m) => m.AsistenciasComponent),
      },
      {
        path: 'estudiantes',
        canActivate: [roleGuard],
        data: { roles: ['admin', 'rector', 'coordinador'] },
        loadComponent: () => import('./features/estudiantes/estudiantes').then((m) => m.EstudiantesComponent),
      },
      {
        // Igual que Estudiantes: un profesor no gestiona acudientes ni sus
        // datos de contacto, aunque conozca la URL directamente.
        path: 'acudientes',
        canActivate: [roleGuard],
        data: { roles: ['admin', 'rector', 'coordinador'] },
        loadComponent: () => import('./features/acudientes/acudientes').then((m) => m.AcudientesComponent),
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
        // Los informes exponen datos de asistencia de todo el colegio — se
        // restringe a los mismos roles que Asistencias/Estudiantes, un
        // profesor no puede entrar aunque conozca la URL directamente.
        path: 'reportes',
        canActivate: [roleGuard],
        data: { roles: ['admin', 'rector', 'coordinador'] },
        loadComponent: () => import('./features/reportes/reportes').then((m) => m.ReportesComponent),
      },
      {
        // 'coordinador' puede entrar solo para registrar profesores — la
        // propia pantalla (usuarios.ts) le oculta la gestión del resto de
        // cuentas, que en el backend sigue reservada a admin/rector.
        path: 'usuarios',
        canActivate: [roleGuard],
        data: { roles: ['admin', 'rector', 'coordinador'] },
        loadComponent: () => import('./features/usuarios/usuarios').then((m) => m.UsuariosComponent),
      },
      {
        path: 'configuracion',
        canActivate: [roleGuard],
        data: { roles: ['admin', 'rector', 'coordinador'] },
        loadComponent: () => import('./features/configuracion/configuracion').then((m) => m.ConfiguracionComponent),
      },
      {
        // admin/rector/coordinador: gestión completa (ver y asignar carnets).
        // profesor: vista reducida de solo lectura para registrar asistencia
        // manual (el propio componente decide la vista según el rol).
        path: 'carnets',
        loadComponent: () => import('./features/carnets/carnets').then((m) => m.CarnetsComponent),
      },
      {
        // Sin roleGuard: el backend ya permite admin/rector/coordinador/profesor
        // (POST /autorizaciones-salida) — un profesor que no sea director de
        // grupo del curso recibe 403 del servidor al intentar autorizar, igual
        // que en Carnets.
        path: 'salidas',
        loadComponent: () =>
          import('./features/autorizaciones-salida/autorizaciones-salida').then(
            (m) => m.AutorizacionesSalidaComponent,
          ),
      },
    ],
  },
  { path: '**', redirectTo: 'login' },
];