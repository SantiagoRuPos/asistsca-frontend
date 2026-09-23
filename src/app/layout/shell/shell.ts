import { Component, DestroyRef, HostListener, computed, effect, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ThemeService } from '../../core/theme/theme.service';
import { AuthService } from '../../core/auth/auth';
import { LicenciaService } from '../../core/licencia/licencia';

interface ItemMenu {
  etiqueta: string;
  icono: string;
  ruta: string;
  // Si no se define, el ítem es visible para cualquier rol autenticado.
  roles?: string[];
}

// Reorganización visual del menú (2026-09-23, pedido explícito del usuario:
// "no me gusta como se ve esta desorganizado") — antes era una sola lista
// plana de 10 ítems sin agrupar; ahora se muestran en tres grupos con un
// encabezado pequeño cada uno, mismo criterio que usaría cualquier persona
// para separar "lo que uso todos los días" de "administración del colegio"
// de "mi cuenta y ajustes del sistema".
interface GrupoMenu {
  titulo: string;
  items: ItemMenu[];
}

// Igual que GET /licencia/estado en el backend, solo admin/rector consultan
// el estado persistente de la licencia (banner de aviso/degradado).
const ROLES_VEN_ESTADO_LICENCIA = ['admin', 'rector'];

// El estado de licencia no cambia rápido (días de gracia) — no hace falta
// más frecuencia que esto. La primera consulta es inmediata, al entrar.
const INTERVALO_CONSULTA_LICENCIA_MS = 5 * 60 * 1000;

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
  private readonly licenciaService = inject(LicenciaService);

  protected readonly usuario = this.authService.usuario;

  // Aviso puntual (tipo "toast") de una escritura bloqueada por licencia
  // vencida — lo dispara licencia-interceptor.ts en CUALQUIER pantalla, para
  // cualquier rol (es sobre la acción que la persona intentó, no expone
  // datos de licencia/plan del colegio). Se limpia solo tras unos segundos.
  protected readonly mensajeBloqueoLicencia = this.licenciaService.mensajeBloqueoReciente;

  // Banner persistente de aviso/degradación — solo para admin/rector, igual
  // que el backend solo les permite consultar GET /licencia/estado. null si
  // no aplica (rol sin acceso, licencia activa, o todavía sin respuesta).
  protected readonly bannerLicencia = computed(() => {
    const rol = this.usuario()?.rol;
    if (!rol || !ROLES_VEN_ESTADO_LICENCIA.includes(rol)) {
      return null;
    }
    const estado = this.licenciaService.estado();
    return estado && estado.nivel !== 'activa' ? estado : null;
  });

  // Menú lateral como "drawer" en pantallas angostas (celular/tablet): oculto
  // por defecto, se abre con el botón hamburguesa de la barra superior móvil
  // y se cierra solo al navegar a una pantalla, tocar el fondo oscuro, o con
  // la X. Desde el punto de quiebre "lg" (1024px) el menú queda siempre
  // visible y fijo, como antes — esto no afecta nada en desktop.
  protected readonly menuMovilAbierto = signal(false);

  alternarMenuMovil(): void {
    this.menuMovilAbierto.update((abierto) => !abierto);
  }

  cerrarMenuMovil(): void {
    this.menuMovilAbierto.set(false);
  }

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

  // Antes derivaba el nombre del email (TODO histórico: "cuando el JWT o
  // /usuarios/me lo provean") — ahora el JWT sí trae nombreCompleto (ver
  // AuthService.emitirTokens), así que se usa directamente.
  protected readonly nombreMostrado = computed(() => this.usuario()?.nombreCompleto ?? 'Usuario');

  protected readonly iniciales = computed(() => {
    const nombre = this.nombreMostrado();
    return nombre.slice(0, 2).toUpperCase();
  });

  // Un profesor solo debe ver Inicio, Cursos, Excusas y Reportes (pidieron
  // explícitamente que no vea Asistencias, Estudiantes, Usuarios ni Configuración).
  // Las rutas correspondientes también están protegidas con roleGuard en
  // app.routes.ts — este filtro es solo para no mostrar en el menú algo a lo que
  // de todas formas no podría entrar, no es en sí mismo el control de acceso.
  private static readonly ROLES_GESTION_OPERATIVA = ['admin', 'rector', 'coordinador'];

  private readonly gruposMenuCompleto: GrupoMenu[] = [
    {
      titulo: 'Principal',
      items: [
        { etiqueta: 'Inicio', icono: 'inicio', ruta: '/resumen' },
        { etiqueta: 'Cursos', icono: 'cursos', ruta: '/cursos' },
        // Sin restricción de rol: admin/rector/coordinador ven la gestión
        // completa de carnets, y un profesor ve una vista reducida para
        // registrar asistencia manual (el propio componente decide la vista).
        { etiqueta: 'Carnets', icono: 'carnets', ruta: '/carnets' },
      ],
    },
    {
      titulo: 'Gestión escolar',
      items: [
        { etiqueta: 'Asistencias', icono: 'asistencias', ruta: '/asistencias', roles: ShellComponent.ROLES_GESTION_OPERATIVA },
        { etiqueta: 'Estudiantes', icono: 'estudiantes', ruta: '/estudiantes', roles: ShellComponent.ROLES_GESTION_OPERATIVA },
        { etiqueta: 'Acudientes', icono: 'acudientes', ruta: '/acudientes', roles: ShellComponent.ROLES_GESTION_OPERATIVA },
        { etiqueta: 'Excusas', icono: 'excusas', ruta: '/excusas' },
        // Sin restricción de rol adicional a nivel de menú: mismo criterio que
        // Excusas — el backend ya filtra qué puede autorizar un profesor.
        { etiqueta: 'Salidas', icono: 'salidas', ruta: '/salidas' },
        // Los informes exponen datos de asistencia de todo el colegio — mismo
        // criterio de roles que Asistencias/Estudiantes/Configuración.
        { etiqueta: 'Reportes', icono: 'reportes', ruta: '/reportes', roles: ShellComponent.ROLES_GESTION_OPERATIVA },
      ],
    },
    {
      titulo: 'Cuenta y sistema',
      items: [
        { etiqueta: 'Usuarios', icono: 'usuarios', ruta: '/usuarios', roles: ['admin', 'rector', 'coordinador'] },
        { etiqueta: 'Configuración', icono: 'configuracion', ruta: '/configuracion', roles: ShellComponent.ROLES_GESTION_OPERATIVA },
        // Sin restricción de rol: cualquier cuenta (incluido profesor) debe
        // poder ver sus propios datos y cambiar su contraseña.
        { etiqueta: 'Mi perfil', icono: 'perfil', ruta: '/perfil' },
      ],
    },
  ];

  protected readonly grupos = computed(() => {
    const rol = this.usuario()?.rol;
    return this.gruposMenuCompleto
      .map((grupo) => ({
        titulo: grupo.titulo,
        items: grupo.items.filter((item) => !item.roles || (rol && item.roles.includes(rol))),
      }))
      .filter((grupo) => grupo.items.length > 0);
  });

  // Reloj de la barra superior: sirve de referencia para saber a qué hora se
  // está registrando una entrada/salida (sobre todo en Carnets, donde el
  // registro manual del profesor siempre usa "ahora"). Se actualiza cada
  // segundo; el intervalo se limpia al destruir el componente para no dejar
  // un temporizador corriendo de fondo tras cerrar sesión o navegar fuera.
  private readonly destroyRef = inject(DestroyRef);
  protected readonly ahora = signal(new Date());

  protected readonly horaActual = computed(() =>
    new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(this.ahora()),
  );

  protected readonly fechaActual = computed(() =>
    new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(this.ahora()),
  );

  // Evita arrancar el polling de licencia más de una vez (el effect de abajo
  // se reevalúa cada vez que cambia `usuario()`, no solo la primera).
  private licenciaPollingIniciado = false;

  constructor() {
    const intervalo = setInterval(() => this.ahora.set(new Date()), 1000);
    this.destroyRef.onDestroy(() => clearInterval(intervalo));

    // No se puede leer `usuario()` una sola vez de forma síncrona en el
    // constructor: justo después de un F5, el shell puede montarse ANTES de
    // que termine de resolverse la sesión (mientras se renueva el access
    // token en segundo plano) — en ese instante `usuario()` todavía es null,
    // y un `if` de una sola vez nunca se repite después, así que el aviso de
    // licencia jamás llegaría a arrancar esa vez. Con `effect()` se reevalúa
    // solo cada vez que `usuario()` cambia, hasta que el rol esté disponible.
    effect(() => {
      const rol = this.usuario()?.rol;
      if (this.licenciaPollingIniciado || !rol || !ROLES_VEN_ESTADO_LICENCIA.includes(rol)) {
        return;
      }
      this.licenciaPollingIniciado = true;

      const consultar = () => this.licenciaService.consultarEstado().subscribe({ error: () => {} });
      consultar();
      const intervaloLicencia = setInterval(consultar, INTERVALO_CONSULTA_LICENCIA_MS);
      this.destroyRef.onDestroy(() => clearInterval(intervaloLicencia));
    });
  }

  // El botón de cuenta al pie del menú ya no cierra sesión directamente: abre
  // un pequeño menú con "Ver perfil" y "Cerrar sesión" (mismo patrón que en
  // configuracion.ts/excusas.ts/usuarios.ts).
  protected readonly dropdownUsuarioAbierto = signal(false);

  @HostListener('document:click')
  cerrarDropdownUsuario(): void {
    this.dropdownUsuarioAbierto.set(false);
  }

  alternarDropdownUsuario(evento: Event): void {
    evento.stopPropagation();
    this.dropdownUsuarioAbierto.update((actual) => !actual);
  }

  logout(): void {
    this.authService.logout();
  }
}