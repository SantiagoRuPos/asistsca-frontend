import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
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
import { AcademicoService, CrearProfesor, ProfesorRegistrado } from '../../core/academico/academico';
import { AuthService } from '../../core/auth/auth';

// Además de admin/rector/coordinador (que crea /usuarios), desde este mismo
// modal también se puede crear un profesor — en ese caso el formulario llama
// a /academico/profesores en vez de /usuarios, porque un profesor necesita
// datos académicos (nombres/apellidos por separado, documento) que las otras
// cuentas no piden.
type RolCreable = RolRegistrable | 'profesor';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './usuarios.html',
})
export class UsuariosComponent {
  private readonly usuariosService = inject(UsuariosService);
  private readonly academicoService = inject(AcademicoService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  protected readonly rolesRegistrables: { valor: RolCreable; etiqueta: string }[] = [
    { valor: 'admin', etiqueta: 'Administrador' },
    { valor: 'rector', etiqueta: 'Rector' },
    { valor: 'coordinador', etiqueta: 'Coordinador' },
    { valor: 'profesor', etiqueta: 'Profesor' },
  ];

  protected readonly hoyFormateado = new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  }).format(new Date());

  protected readonly miUsuarioId = computed(() => this.authService.usuario()?.sub ?? null);

  // Un coordinador puede registrar profesores desde aquí (el usuario lo pidió
  // explícitamente), pero NO puede listar/gestionar el resto de cuentas —
  // GET /usuarios, activar/desactivar y crear admin/rector/coordinador siguen
  // reservados a admin/rector en el backend. Por eso esta pantalla, para un
  // coordinador, muestra solo el flujo de "nuevo profesor" y ni siquiera pide
  // la lista o el resumen (esas llamadas le devolverían 403).
  protected readonly esCoordinador = computed(() => this.authService.usuario()?.rol === 'coordinador');
  protected readonly puedeGestionarCuentas = computed(() => !this.esCoordinador());

  protected readonly rolesDisponibles = computed(() =>
    this.esCoordinador() ? this.rolesRegistrables.filter((rol) => rol.valor === 'profesor') : this.rolesRegistrables,
  );

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
  protected readonly usuarioRegistrado = signal<UsuarioRegistrado | ProfesorRegistrado | null>(null);
  protected readonly passwordCopiada = signal(false);

  protected readonly formularioUsuario = this.fb.group({
    nombreCompleto: ['', [Validators.required, Validators.maxLength(200)]],
    nombres: [''],
    apellidos: [''],
    numeroDocumento: [''],
    email: ['', [Validators.required, Validators.email]],
    telefono: [''],
    rol: this.fb.nonNullable.control<RolCreable>('coordinador', Validators.required),
  });

  // Se usa solo para condicionar qué campos se muestran en la plantilla — los
  // validadores reales de cada campo se ajustan aparte, en actualizarValidadoresPorRol().
  protected readonly rolSeleccionado = toSignal(this.formularioUsuario.controls.rol.valueChanges, {
    initialValue: this.formularioUsuario.controls.rol.value,
  });
  protected readonly esProfesor = computed(() => this.rolSeleccionado() === 'profesor');

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
    if (this.puedeGestionarCuentas()) {
      this.cargarResumen();
      this.cargarLista();
    }

    this.formularioUsuario.controls.rol.valueChanges.subscribe((rol) => this.actualizarValidadoresPorRol(rol));
  }

  // "Nombre completo" solo aplica a admin/rector/coordinador; un profesor
  // necesita nombres/apellidos separados y número de documento (el backend de
  // /academico/profesores lo exige para evitar duplicados). Se alternan los
  // validadores en vez de tener dos formularios distintos.
  private actualizarValidadoresPorRol(rol: RolCreable): void {
    const esProfesor = rol === 'profesor';
    const { nombreCompleto, nombres, apellidos, numeroDocumento } = this.formularioUsuario.controls;

    nombreCompleto.setValidators(esProfesor ? [] : [Validators.required, Validators.maxLength(200)]);
    nombres.setValidators(esProfesor ? [Validators.required, Validators.maxLength(120)] : []);
    apellidos.setValidators(esProfesor ? [Validators.required, Validators.maxLength(120)] : []);
    numeroDocumento.setValidators(esProfesor ? [Validators.required, Validators.maxLength(30)] : []);

    nombreCompleto.updateValueAndValidity({ emitEvent: false });
    nombres.updateValueAndValidity({ emitEvent: false });
    apellidos.updateValueAndValidity({ emitEvent: false });
    numeroDocumento.updateValueAndValidity({ emitEvent: false });
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
    // Un coordinador solo puede crear profesores — se fuerza el rol del
    // formulario a 'profesor' en vez de dejarlo elegir e intentar admin/rector/
    // coordinador, que el backend le rechazaría con 403.
    const rolInicial = this.esCoordinador() ? 'profesor' : 'coordinador';
    this.formularioUsuario.reset({
      nombreCompleto: '',
      nombres: '',
      apellidos: '',
      numeroDocumento: '',
      email: '',
      telefono: '',
      rol: rolInicial,
    });
    this.actualizarValidadoresPorRol(rolInicial);
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
    this.errorModal.set(null);
    this.guardandoUsuario.set(true);

    if (valores.rol === 'profesor') {
      const dto: CrearProfesor = {
        nombres: valores.nombres!,
        apellidos: valores.apellidos!,
        numeroDocumento: valores.numeroDocumento!,
        email: valores.email!,
        telefono: valores.telefono || undefined,
      };
      this.academicoService.crearProfesor(dto).subscribe({
        next: (resultado) => this.alRegistrarExito(resultado),
        error: (error) => this.alRegistrarError(error, 'profesor'),
      });
      return;
    }

    const dto: RegistrarUsuario = {
      nombreCompleto: valores.nombreCompleto!,
      email: valores.email!,
      telefono: valores.telefono || undefined,
      rol: valores.rol,
    };
    this.usuariosService.registrar(dto).subscribe({
      next: (resultado) => this.alRegistrarExito(resultado),
      error: (error) => this.alRegistrarError(error, 'usuario'),
    });
  }

  private alRegistrarExito(resultado: UsuarioRegistrado | ProfesorRegistrado): void {
    this.guardandoUsuario.set(false);
    this.mostrarModalNuevo.set(false);
    this.pagina.set(1);
    this.cargarLista();
    this.cargarResumen();
    // Si el correo no se pudo enviar, mostramos la contraseña temporal una
    // única vez para que quien lo creó la comunique manualmente.
    if (!resultado.correoEnviado) {
      this.usuarioRegistrado.set(resultado);
    }
  }

  private alRegistrarError(error: { error?: { message?: string } }, tipo: 'usuario' | 'profesor'): void {
    this.guardandoUsuario.set(false);
    this.errorModal.set(error.error?.message ?? `No se pudo registrar el ${tipo}.`);
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
