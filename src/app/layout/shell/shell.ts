import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ThemeService } from '../../core/theme/theme.service';
import { AuthService } from '../../core/auth/auth';

interface ItemMenu {
  etiqueta: string;
  icono: string;
  ruta: string;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class ShellComponent {
  protected readonly themeService = inject(ThemeService);
  private readonly authService = inject(AuthService);

  protected readonly usuario = this.authService.usuario;

  protected readonly etiquetaRol = computed(() => {
    const rol = this.usuario()?.rol;
    const nombres: Record<string, string> = {
      admin: 'Administrador',
      rector: 'Rector',
      coordinador: 'Coordinador',
      profesor: 'Profesor',
    };
    return rol ? (nombres[rol] ?? rol) : '';
  });

  // TODO: reemplazar por el nombre real cuando el JWT o /usuarios/me lo provean.
  protected readonly nombreMostrado = computed(() => this.usuario()?.email?.split('@')[0] ?? 'Usuario');

  protected readonly iniciales = computed(() => {
    const nombre = this.nombreMostrado();
    return nombre.slice(0, 2).toUpperCase();
  });

  protected readonly menu: ItemMenu[] = [
    { etiqueta: 'Inicio', icono: 'inicio', ruta: '/resumen' },
    { etiqueta: 'Asistencias', icono: 'asistencias', ruta: '/asistencias' },
    { etiqueta: 'Estudiantes', icono: 'estudiantes', ruta: '/estudiantes' },
    { etiqueta: 'Cursos', icono: 'cursos', ruta: '/cursos' },
    { etiqueta: 'Excusas', icono: 'excusas', ruta: '/excusas' },
    { etiqueta: 'Reportes', icono: 'reportes', ruta: '/reportes' },
    { etiqueta: 'Usuarios', icono: 'usuarios', ruta: '/usuarios' },
    { etiqueta: 'Configuración', icono: 'configuracion', ruta: '/configuracion' },
  ];

  logout(): void {
    this.authService.logout();
  }
}