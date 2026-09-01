import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  CodigoEstadoUsuario,
  FiltrosUsuarios,
  ListaUsuarios,
  RegistrarUsuario,
  ResumenUsuarios,
  RolRegistrable,
  RolUsuario,
  UsuarioListado,
  UsuarioRegistrado,
  UsuariosService,
} from '../../core/usuarios/usuarios';
import { AuthService } from '../../core/auth/auth';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './usuarios.html',
})
export class UsuariosComponent {
  private readonly usuariosService = inject(UsuariosService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  protected readonly rolesRegistrables: { valor: RolRegistrable; etiqueta: string }[] = [
    { valor: 'admin', etiqueta: 'Administrador' },
    { valor: 'rector', etiqueta: 'Rector' },
    { valor: 'coordinador', etiqueta: 'Coordinador' },
  ];

  protected readonly hoyFormateado = new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  }).format(new Date());

  protected readonly miUsuarioId = computed(() => this.authService.usuario()?.sub ?? null);

  protected readonly resumen = signal<ResumenUsuarios | null>(null);
  protected readonly lista = signal<ListaUsuarios | null>(null);
  protected readonly cargandoLista = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly errorAccion = signal<string | null>(null);

  protected readonly busquedaInput = signal('');
  protected readonly rolInput = signal('');
  protected readonly estadoInput = signal('');
  protected readonly pagina = signal(1);
  protected readonly limite = 10;

  protected readonly dropdownAbierto = signal<string | null>(null);
  protected readonly accionEnCurso = signal<string | null>(null);

  protected readonly mostrarModalNuevo = signal(false);
  protected readonly guardandoUsuario = signal(false);
  protected readonly errorModal = signal<string | null>(null);
  protected readonly usuarioRegistrado = signal<UsuarioRegistrado | null>(null);
  protected readonly passwordCopiada = signal(false);

  protected readonly formularioUsuario = this.fb.group({
    nombreCompleto: ['', [Validators.required, Validators.maxLength(200)]],
    email: ['', [Validators.required, Validators.email]],
    telefono: [''],
    rol: this.fb.nonNullable.control<RolRegistrable>('coordinador', Validators.required),
  });

  protected readonly paginasVisibles = computed<(number | '...')[]>(() => {
    const total = this.lista()?.totalPaginas ?? 1;
    const actual = this.pagina();

    const incluidas = new Set<number>([1, total]);
    for (let n = actual - 1; n <= actual + 1; n++) {
      if (n > 1 && n < total) incluidas.add(n);
    }

    const ordenadas = [...incluidas].sort((a, b) => a - b);
    const resultado: (number | '...')[] = [];
    let anterior = 0;
    for (const n of ordenadas) {
      if (anterior && n - anterior > 1) resultado.push('...');
      resultado.push(n);
      anterior = n;
    }
    return resultado;
  });

  constructor() {
    this.cargarResumen();
    this.cargarLista();
  }

  actualizarBusqueda(valor: string): void {
    this.busquedaInput.set(valor);
    this.pagina.set(1);
    this.cargarLista();
  }

  actualizarRol(valor: string): void {
    this.rolInput.set(valor);
    this.pagina.set(1);
    this.cargarLista();
  }

  actualizarEstado(valor: string): void {
    this.estadoInput.set(valor);
    this.pagina.set(1);
    this.cargarLista();
  }

  limpiarFiltros(): void {
    this.busquedaInput.set('');
    this.rolInput.set('');
    this.estadoInput.set('');
    this.pagina.set(1);
    this.cargarLista();
  }

  irAPagina(pagina: number | '...'): void {
    if (pagina === '...') return;
    this.pagina.set(pagina);
    this.cargarLista();
  }

  paginaAnterior(): void {
    if (this.pagina() > 1) {
      this.pagina.update((p) => p - 1);
      this.cargarLista();
    }
  }

  paginaSiguiente(): void {
    const total = this.lista()?.totalPaginas ?? 1;
    if (this.pagina() < total) {
      this.pagina.update((p) => p + 1);
      this.cargarLista();
    }
  }

  rangoMostrado(): string {
    const lista = this.lista();
    if (!lista || lista.total === 0) return '0 de 0';
    const desde = (lista.pagina - 1) * lista.limite + 1;
    const hasta = Math.min(lista.pagina * lista.limite, lista.total);
    return `${desde} a ${hasta} de ${lista.total}`;
  }

  alternarDropdown(id: string, evento: Event): void {
    evento.stopPropagation();
    this.dropdownAbierto.update((actual) => (actual === id ? null : id));
  }

  @HostListener('document:click')
  cerrarDropdowns(): void {
    this.dropdownAbierto.set(null);
  }

  activar(usuario: UsuarioListado): void {
    this.dropdownAbierto.set(null);
    this.errorAccion.set(null);
    this.accionEnCurso.set(usuario.id);
    this.usuariosService.activar(usuario.id).subscribe({
      next: () => {
        this.accionEnCurso.set(null);
        this.cargarLista();
        this.cargarResumen();
      },
      error: (error) => {
        this.accionEnCurso.set(null);
        this.errorAccion.set(error.error?.message ?? 'No se pudo activar el usuario.');
      },
    });
  }

  desactivar(usuario: UsuarioListado): void {
    this.dropdownAbierto.set(null);
    this.errorAccion.set(null);
    this.accionEnCurso.set(usuario.id);
    this.usuariosService.desactivar(usuario.id).subscribe({
      next: () => {
        this.accionEnCurso.set(null);
        this.cargarLista();
        this.cargarResumen();
      },
      error: (error) => {
        this.accionEnCurso.set(null);
        this.errorAccion.set(error.error?.message ?? 'No se pudo desactivar el usuario.');
      },
    });
  }

  abrirModalNuevo(): void {
    this.formularioUsuario.reset({ nombreCompleto: '', email: '', telefono: '', rol: 'coordinador' });
    this.errorModal.set(null);
    this.mostrarModalNuevo.set(true);
  }

  cerrarModalNuevo(): void {
    this.mostrarModalNuevo.set(false);
  }

  guardarUsuario(): void {
    if (this.formularioUsuario.invalid) {
      this.formularioUsuario.markAllAsTouched();
      return;
    }

    const valores = this.formularioUsuario.getRawValue();
    const dto: RegistrarUsuario = {
      nombreCompleto: valores.nombreCompleto!,
      email: valores.email!,
      telefono: valores.telefono || undefined,
      rol: valores.rol,
    };

    this.errorModal.set(null);
    this.guardandoUsuario.set(true);
    this.usuariosService.registrar(dto).subscribe({
      next: (resultado) => {
        this.guardandoUsuario.set(false);
        this.mostrarModalNuevo.set(false);
        this.pagina.set(1);
        this.cargarLista();
        this.cargarResumen();
        // Si el correo no se pudo enviar, mostramos la contraseña temporal
        // una única vez para que el administrador la comunique manualmente.
        if (!resultado.correoEnviado) {
          this.usuarioRegistrado.set(resultado);
        }
      },
      error: (error) => {
        this.guardandoUsuario.set(false);
        this.errorModal.set(error.error?.message ?? 'No se pudo registrar el usuario.');
      },
    });
  }

  copiarPassword(): void {
    const password = this.usuarioRegistrado()?.passwordTemporal;
    if (!password) return;
    navigator.clipboard?.writeText(password).then(() => {
      this.passwordCopiada.set(true);
      setTimeout(() => this.passwordCopiada.set(false), 2000);
    });
  }

  cerrarModalPassword(): void {
    this.usuarioRegistrado.set(null);
    this.passwordCopiada.set(false);
  }

  protected iniciales(nombreCompleto: string): string {
    return nombreCompleto.trim().slice(0, 2).toUpperCase();
  }

  protected etiquetaRol(rol: RolUsuario): string {
    const nombres: Record<RolUsuario, string> = {
      admin: 'Administrador',
      rector: 'Rector',
      coordinador: 'Coordinador',
      profesor: 'Profesor',
    };
    return nombres[rol] ?? rol;
  }

  protected etiquetaEstado(codigo: CodigoEstadoUsuario): string {
    return codigo === 'activo' ? 'Activo' : 'Inactivo';
  }

  protected claseEstado(codigo: CodigoEstadoUsuario): string {
    return codigo === 'activo' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500';
  }

  protected formatearFechaHora(fechaIso: string | null): string {
    if (!fechaIso) return 'Nunca';
    const instante = new Date(fechaIso);
    return new Intl.DateTimeFormat('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Bogota',
    }).format(instante);
  }

  private cargarLista(): void {
    this.cargandoLista.set(true);
    this.error.set(null);

    const filtros: FiltrosUsuarios = {
      q: this.busquedaInput() || undefined,
      rol: (this.rolInput() as RolUsuario) || undefined,
      estado: (this.estadoInput() as CodigoEstadoUsuario) || undefined,
      pagina: this.pagina(),
      limite: this.limite,
    };

    this.usuariosService.listar(filtros).subscribe({
      next: (lista) => {
        this.lista.set(lista);
        this.cargandoLista.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar la lista de usuarios. Intenta de nuevo.');
        this.cargandoLista.set(false);
      },
    });
  }

  private cargarResumen(): void {
    this.usuariosService.obtenerResumen().subscribe({ next: (resumen) => this.resumen.set(resumen), error: () => {} });
  }
}
