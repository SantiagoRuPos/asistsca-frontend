import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  AcademicoService,
  Curso,
  EstudianteDetalle,
  EstudianteRegistradoRespuesta,
  FiltrosEstudiantes,
  ListaEstudiantes,
  ResumenEstudiantes,
} from '../../core/academico/academico';
import { NfcService, TarjetaDesconocida } from '../../core/nfc/nfc';
import { AuthService } from '../../core/auth/auth';

@Component({
  selector: 'app-estudiantes',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './estudiantes.html',
})
export class EstudiantesComponent {
  private readonly academicoService = inject(AcademicoService);
  private readonly nfcService = inject(NfcService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly puedeGestionar = computed(() => {
    const rol = this.authService.usuario()?.rol;
    return rol === 'admin' || rol === 'rector' || rol === 'coordinador';
  });

  protected readonly tiposDocumento = ['TI', 'RC', 'CC', 'CE'];
  protected readonly parentescos: { valor: 'padre' | 'madre' | 'tutor' | 'otro'; etiqueta: string }[] = [
    { valor: 'padre', etiqueta: 'Padre' },
    { valor: 'madre', etiqueta: 'Madre' },
    { valor: 'tutor', etiqueta: 'Tutor' },
    { valor: 'otro', etiqueta: 'Otro' },
  ];

  protected readonly resumen = signal<ResumenEstudiantes | null>(null);
  protected readonly lista = signal<ListaEstudiantes | null>(null);
  protected readonly cargandoLista = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly cursos = signal<Curso[]>([]);

  protected readonly busquedaInput = signal('');
  protected readonly cursoIdInput = signal('');
  protected readonly estadoInput = signal('');
  protected readonly pagina = signal(1);
  protected readonly limite = 10;

  protected readonly mostrarWizard = signal(false);
  protected readonly pasoActual = signal(1);
  protected readonly guardando = signal(false);
  protected readonly errorPaso = signal<string | null>(null);
  protected readonly estudianteRegistrado = signal<EstudianteRegistradoRespuesta | null>(null);

  protected readonly formularioEstudiante = this.fb.group({
    nombres: ['', [Validators.required, Validators.maxLength(120)]],
    apellidos: ['', [Validators.required, Validators.maxLength(120)]],
    tipoDocumento: ['TI', Validators.required],
    numeroDocumento: ['', [Validators.required, Validators.maxLength(30)]],
    fechaNacimiento: ['', Validators.required],
  });

  protected readonly formularioMatricula = this.fb.group({
    cursoId: ['', Validators.required],
  });

  protected readonly formularioAcudiente = this.fb.group({
    nombres: ['', [Validators.required, Validators.maxLength(120)]],
    apellidos: ['', [Validators.required, Validators.maxLength(120)]],
    parentesco: this.fb.nonNullable.control<'padre' | 'madre' | 'tutor' | 'otro'>('padre', Validators.required),
    telefonoWhatsapp: ['', [Validators.required, Validators.maxLength(30)]],
    email: ['', Validators.email],
  });

  protected readonly formularioTarjeta = this.fb.group({
    uidTarjeta: ['', [Validators.required, Validators.maxLength(40)]],
  });

  protected readonly guardandoTarjeta = signal(false);
  protected readonly errorTarjeta = signal<string | null>(null);
  protected readonly tarjetaActivada = signal(false);

  // Tarjeta desconocida detectada por refresco periodico (mismo patron que
  // la pantalla Carnets: ver GET /nfc/tarjetas/desconocidas/ultima). Solo se
  // consulta mientras el wizard esta en el paso 4 (activar carnet).
  protected readonly tarjetaDesconocida = signal<TarjetaDesconocida | null>(null);
  private uidDescartado: string | null = null;
  private intervaloTarjetaDesconocida: ReturnType<typeof setInterval> | null = null;

  protected readonly mostrarBannerTarjetaDesconocida = computed(() => {
    const tarjeta = this.tarjetaDesconocida();
    return !!tarjeta && tarjeta.uidTarjeta !== this.uidDescartado;
  });

  // Menú de acciones (los "..." de cada fila) y activar/desactivar rápido.
  protected readonly menuAbiertoId = signal<string | null>(null);
  protected readonly accionEnCurso = signal<string | null>(null);

  // Modal "Ver carnet" (ojito): vista de solo lectura.
  protected readonly estudianteViendo = signal<EstudianteDetalle | null>(null);
  protected readonly cargandoDetalle = signal(false);
  protected readonly errorDetalle = signal<string | null>(null);

  // Modal "Editar estudiante" (lápiz): datos personales, curso, carnet y
  // acudiente, cada sección con su propio guardado independiente.
  protected readonly estudianteEditando = signal<EstudianteDetalle | null>(null);
  protected readonly cargandoEdicion = signal(false);
  protected readonly errorEdicion = signal<string | null>(null);

  protected readonly guardandoDatos = signal(false);
  protected readonly errorDatos = signal<string | null>(null);
  protected readonly formularioEditarDatos = this.fb.group({
    nombres: ['', [Validators.required, Validators.maxLength(120)]],
    apellidos: ['', [Validators.required, Validators.maxLength(120)]],
    tipoDocumento: ['TI', Validators.required],
    numeroDocumento: ['', [Validators.required, Validators.maxLength(30)]],
    fechaNacimiento: ['', Validators.required],
    estadoCodigo: this.fb.nonNullable.control<'activo' | 'inactivo'>('activo', Validators.required),
  });

  protected readonly guardandoCurso = signal(false);
  protected readonly errorCursoEdicion = signal<string | null>(null);
  protected readonly formularioEditarCurso = this.fb.group({
    cursoId: ['', Validators.required],
  });

  protected readonly guardandoCarnet = signal(false);
  protected readonly errorCarnetEdicion = signal<string | null>(null);
  protected readonly formularioEditarCarnet = this.fb.group({
    uidTarjeta: ['', [Validators.required, Validators.maxLength(40)]],
  });

  protected readonly guardandoAcudienteEdicion = signal(false);
  protected readonly errorAcudienteEdicion = signal<string | null>(null);
  protected readonly formularioEditarAcudiente = this.fb.group({
    nombres: ['', [Validators.required, Validators.maxLength(120)]],
    apellidos: ['', [Validators.required, Validators.maxLength(120)]],
    parentesco: this.fb.nonNullable.control<'padre' | 'madre' | 'tutor' | 'otro'>('padre', Validators.required),
    telefonoWhatsapp: ['', [Validators.required, Validators.maxLength(30)]],
    email: ['', Validators.email],
    numeroDocumento: ['', Validators.maxLength(30)],
  });

  constructor() {
    this.cargarResumen();
    this.cargarLista();
    this.academicoService.listarCursos().subscribe({ next: (cursos) => this.cursos.set(cursos), error: () => {} });
  }

  buscar(): void {
    this.pagina.set(1);
    this.cargarLista();
  }

  limpiarFiltros(): void {
    this.busquedaInput.set('');
    this.cursoIdInput.set('');
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

  protected rangoMostrado(): string {
    const lista = this.lista();
    if (!lista || lista.total === 0) return '0 de 0';
    const desde = (lista.pagina - 1) * lista.limite + 1;
    const hasta = Math.min(lista.pagina * lista.limite, lista.total);
    return `${desde} a ${hasta} de ${lista.total}`;
  }

  abrirWizard(): void {
    this.pasoActual.set(1);
    this.errorPaso.set(null);
    this.estudianteRegistrado.set(null);
    this.tarjetaActivada.set(false);
    this.errorTarjeta.set(null);
    this.tarjetaDesconocida.set(null);
    this.uidDescartado = null;
    this.detenerPollingTarjetaDesconocida();
    this.formularioEstudiante.reset({ tipoDocumento: 'TI' });
    this.formularioMatricula.reset();
    this.formularioAcudiente.reset({ parentesco: 'padre' });
    this.formularioTarjeta.reset();
    this.mostrarWizard.set(true);
  }

  cerrarWizard(): void {
    this.mostrarWizard.set(false);
    this.detenerPollingTarjetaDesconocida();
    if (this.estudianteRegistrado()) {
      this.cargarResumen();
      this.cargarLista();
    }
  }

  siguientePaso(): void {
    this.errorPaso.set(null);

    if (this.pasoActual() === 1) {
      if (this.formularioEstudiante.invalid) {
        this.formularioEstudiante.markAllAsTouched();
        return;
      }
      this.pasoActual.set(2);
      return;
    }

    if (this.pasoActual() === 2) {
      if (this.formularioMatricula.invalid) {
        this.formularioMatricula.markAllAsTouched();
        return;
      }
      this.pasoActual.set(3);
      return;
    }
  }

  pasoAnterior(): void {
    if (this.pasoActual() > 1 && this.pasoActual() < 4) {
      this.pasoActual.update((p) => p - 1);
    }
  }

  finalizarRegistro(): void {
    if (this.formularioAcudiente.invalid) {
      this.formularioAcudiente.markAllAsTouched();
      return;
    }

    this.guardando.set(true);
    this.errorPaso.set(null);

    const estudiante = this.formularioEstudiante.getRawValue();
    const matricula = this.formularioMatricula.getRawValue();
    const acudiente = this.formularioAcudiente.getRawValue();

    this.academicoService
      .registrarEstudianteCompleto({
        estudiante: {
          nombres: estudiante.nombres!.trim(),
          apellidos: estudiante.apellidos!.trim(),
          tipoDocumento: estudiante.tipoDocumento!,
          numeroDocumento: estudiante.numeroDocumento!.trim(),
          fechaNacimiento: estudiante.fechaNacimiento!,
        },
        matricula: { cursoId: matricula.cursoId! },
        acudiente: {
          nombres: acudiente.nombres!.trim(),
          apellidos: acudiente.apellidos!.trim(),
          parentesco: acudiente.parentesco,
          telefonoWhatsapp: acudiente.telefonoWhatsapp!.trim(),
          email: acudiente.email?.trim() || undefined,
        },
      })
      .subscribe({
        next: (respuesta) => {
          this.guardando.set(false);
          this.estudianteRegistrado.set(respuesta);
          this.pasoActual.set(4);
          this.iniciarPollingTarjetaDesconocida();
        },
        error: (error) => {
          this.guardando.set(false);
          this.errorPaso.set(error.error?.message ?? 'No se pudo registrar el estudiante. Intenta de nuevo.');
        },
      });
  }

  activarTarjeta(): void {
    if (this.formularioTarjeta.invalid) {
      this.formularioTarjeta.markAllAsTouched();
      return;
    }

    const estudianteId = this.estudianteRegistrado()?.estudiante.id;
    if (!estudianteId) return;

    this.guardandoTarjeta.set(true);
    this.errorTarjeta.set(null);

    const uidTarjeta = this.formularioTarjeta.getRawValue().uidTarjeta!.trim();

    this.nfcService.asignarTarjeta({ uidTarjeta, tipoTitular: 'estudiante', estudianteId }).subscribe({
      next: () => {
        this.guardandoTarjeta.set(false);
        this.tarjetaActivada.set(true);
        this.detenerPollingTarjetaDesconocida();
      },
      error: (error) => {
        this.guardandoTarjeta.set(false);
        this.errorTarjeta.set(error.error?.message ?? 'No se pudo activar el carnet. Verifica el UID e intenta de nuevo.');
      },
    });
  }

  private iniciarPollingTarjetaDesconocida(): void {
    if (this.intervaloTarjetaDesconocida) return; // ya esta corriendo
    this.consultarTarjetaDesconocida();
    this.intervaloTarjetaDesconocida = setInterval(() => this.consultarTarjetaDesconocida(), 3_000);
    this.destroyRef.onDestroy(() => this.detenerPollingTarjetaDesconocida());
  }

  private detenerPollingTarjetaDesconocida(): void {
    if (this.intervaloTarjetaDesconocida) {
      clearInterval(this.intervaloTarjetaDesconocida);
      this.intervaloTarjetaDesconocida = null;
    }
  }

  // Best-effort y silencioso (mismo patron que la pantalla Carnets): si falla
  // una consulta puntual, simplemente no se actualiza el banner.
  private consultarTarjetaDesconocida(): void {
    this.nfcService.obtenerUltimaTarjetaDesconocida().subscribe({
      next: (tarjeta) => this.tarjetaDesconocida.set(tarjeta),
      error: () => {},
    });
  }

  protected usarUidDetectado(): void {
    const tarjeta = this.tarjetaDesconocida();
    if (!tarjeta) return;
    // El mismo banner se muestra en dos contextos distintos (wizard de
    // estudiante nuevo, y el modal "Editar estudiante"), nunca los dos a la
    // vez: se llena el formulario del que este activo en este momento.
    if (this.estudianteEditando()) {
      this.formularioEditarCarnet.patchValue({ uidTarjeta: tarjeta.uidTarjeta });
    } else {
      this.formularioTarjeta.patchValue({ uidTarjeta: tarjeta.uidTarjeta });
    }
    this.uidDescartado = tarjeta.uidTarjeta;
  }

  protected descartarUidDetectado(): void {
    const tarjeta = this.tarjetaDesconocida();
    if (tarjeta) this.uidDescartado = tarjeta.uidTarjeta;
  }

  protected segundosDesde(fechaIso: string): number {
    return Math.max(0, Math.round((Date.now() - new Date(fechaIso).getTime()) / 1000));
  }

  protected iniciales(nombres: string, apellidos: string): string {
    return `${nombres.charAt(0)}${apellidos.charAt(0)}`.toUpperCase();
  }

  @HostListener('document:click')
  cerrarMenuAlHacerClicFuera(): void {
    this.menuAbiertoId.set(null);
  }

  toggleMenu(estudianteId: string, evento: Event): void {
    evento.stopPropagation();
    this.menuAbiertoId.update((actual) => (actual === estudianteId ? null : estudianteId));
  }

  toggleActivo(estudiante: { id: string; estado: { codigo: string } }): void {
    this.menuAbiertoId.set(null);
    const nuevoEstado: 'activo' | 'inactivo' = estudiante.estado.codigo === 'activo' ? 'inactivo' : 'activo';
    this.accionEnCurso.set(estudiante.id);

    this.academicoService.actualizarEstudiante(estudiante.id, { estadoCodigo: nuevoEstado }).subscribe({
      next: () => {
        this.accionEnCurso.set(null);
        this.cargarResumen();
        this.cargarLista();
      },
      error: (error) => {
        this.accionEnCurso.set(null);
        this.error.set(error.error?.message ?? 'No se pudo actualizar el estado del estudiante.');
      },
    });
  }

  abrirVerCarnet(estudianteId: string): void {
    this.menuAbiertoId.set(null);
    this.errorDetalle.set(null);
    this.cargandoDetalle.set(true);
    this.estudianteViendo.set(null);

    this.academicoService.obtenerEstudiante(estudianteId).subscribe({
      next: (detalle) => {
        this.cargandoDetalle.set(false);
        this.estudianteViendo.set(detalle);
      },
      error: (error) => {
        this.cargandoDetalle.set(false);
        this.errorDetalle.set(error.error?.message ?? 'No se pudo cargar el carnet del estudiante.');
      },
    });
  }

  cerrarVerCarnet(): void {
    this.estudianteViendo.set(null);
  }

  abrirEditar(estudianteId: string): void {
    this.menuAbiertoId.set(null);
    this.errorEdicion.set(null);
    this.cargandoEdicion.set(true);
    this.estudianteEditando.set(null);

    this.academicoService.obtenerEstudiante(estudianteId).subscribe({
      next: (detalle) => {
        this.cargandoEdicion.set(false);
        this.estudianteEditando.set(detalle);
        this.errorDatos.set(null);
        this.errorCursoEdicion.set(null);
        this.errorCarnetEdicion.set(null);
        this.errorAcudienteEdicion.set(null);

        // Mismo banner de "tarjeta detectada" que ya existe en el wizard de
        // estudiante nuevo y en Carnets: mientras este modal esta abierto,
        // se ofrece el UID de la ultima tarjeta desconocida escaneada, por
        // si se esta cambiando/asignando el carnet con el lector a mano.
        this.tarjetaDesconocida.set(null);
        this.uidDescartado = null;
        this.iniciarPollingTarjetaDesconocida();

        this.formularioEditarDatos.reset({
          nombres: detalle.nombres,
          apellidos: detalle.apellidos,
          tipoDocumento: detalle.tipoDocumento,
          numeroDocumento: detalle.numeroDocumento,
          fechaNacimiento: detalle.fechaNacimiento?.slice(0, 10) ?? '',
          estadoCodigo: (detalle.estado.codigo as 'activo' | 'inactivo') ?? 'activo',
        });
        this.formularioEditarCurso.reset({ cursoId: detalle.curso?.id ?? '' });
        this.formularioEditarCarnet.reset({ uidTarjeta: '' });

        if (detalle.acudiente) {
          this.formularioEditarAcudiente.reset({
            nombres: detalle.acudiente.nombres,
            apellidos: detalle.acudiente.apellidos,
            parentesco: (detalle.acudiente.parentesco as 'padre' | 'madre' | 'tutor' | 'otro') || 'otro',
            telefonoWhatsapp: detalle.acudiente.telefonoWhatsapp,
            email: detalle.acudiente.email ?? '',
            numeroDocumento: detalle.acudiente.numeroDocumento ?? '',
          });
        }
      },
      error: (error) => {
        this.cargandoEdicion.set(false);
        this.errorEdicion.set(error.error?.message ?? 'No se pudo cargar la información del estudiante.');
      },
    });
  }

  cerrarEditar(): void {
    this.estudianteEditando.set(null);
    this.detenerPollingTarjetaDesconocida();
    this.cargarResumen();
    this.cargarLista();
  }

  guardarDatosPersonales(): void {
    const estudiante = this.estudianteEditando();
    if (!estudiante) return;

    if (this.formularioEditarDatos.invalid) {
      this.formularioEditarDatos.markAllAsTouched();
      return;
    }

    this.guardandoDatos.set(true);
    this.errorDatos.set(null);
    const valores = this.formularioEditarDatos.getRawValue();

    this.academicoService
      .actualizarEstudiante(estudiante.id, {
        nombres: valores.nombres!.trim(),
        apellidos: valores.apellidos!.trim(),
        tipoDocumento: valores.tipoDocumento!,
        numeroDocumento: valores.numeroDocumento!.trim(),
        fechaNacimiento: valores.fechaNacimiento!,
        estadoCodigo: valores.estadoCodigo,
      })
      .subscribe({
        next: (detalle) => {
          this.guardandoDatos.set(false);
          this.estudianteEditando.set(detalle);
        },
        error: (error) => {
          this.guardandoDatos.set(false);
          this.errorDatos.set(error.error?.message ?? 'No se pudieron guardar los datos personales.');
        },
      });
  }

  guardarCurso(): void {
    const estudiante = this.estudianteEditando();
    if (!estudiante) return;

    if (this.formularioEditarCurso.invalid) {
      this.formularioEditarCurso.markAllAsTouched();
      return;
    }

    this.guardandoCurso.set(true);
    this.errorCursoEdicion.set(null);
    const cursoId = this.formularioEditarCurso.getRawValue().cursoId!;

    this.academicoService.cambiarCursoEstudiante(estudiante.id, { cursoId }).subscribe({
      next: () => {
        this.guardandoCurso.set(false);
        this.abrirEditar(estudiante.id);
      },
      error: (error) => {
        this.guardandoCurso.set(false);
        this.errorCursoEdicion.set(error.error?.message ?? 'No se pudo cambiar el curso del estudiante.');
      },
    });
  }

  guardarCarnet(): void {
    const estudiante = this.estudianteEditando();
    if (!estudiante) return;

    if (this.formularioEditarCarnet.invalid) {
      this.formularioEditarCarnet.markAllAsTouched();
      return;
    }

    this.guardandoCarnet.set(true);
    this.errorCarnetEdicion.set(null);
    const uidTarjeta = this.formularioEditarCarnet.getRawValue().uidTarjeta!.trim();

    const peticion = estudiante.tarjeta
      ? this.nfcService.cambiarTarjetaEstudiante(estudiante.id, { uidTarjeta })
      : this.nfcService.asignarTarjeta({ uidTarjeta, tipoTitular: 'estudiante', estudianteId: estudiante.id });

    peticion.subscribe({
      next: () => {
        this.guardandoCarnet.set(false);
        this.abrirEditar(estudiante.id);
      },
      error: (error) => {
        this.guardandoCarnet.set(false);
        this.errorCarnetEdicion.set(error.error?.message ?? 'No se pudo cambiar el carnet del estudiante.');
      },
    });
  }

  guardarAcudienteEdicion(): void {
    const estudiante = this.estudianteEditando();
    if (!estudiante?.acudiente) return;

    if (this.formularioEditarAcudiente.invalid) {
      this.formularioEditarAcudiente.markAllAsTouched();
      return;
    }

    this.guardandoAcudienteEdicion.set(true);
    this.errorAcudienteEdicion.set(null);
    const valores = this.formularioEditarAcudiente.getRawValue();

    this.academicoService
      .actualizarAcudiente(estudiante.acudiente.id, {
        nombre: valores.nombres!.trim(),
        apellidos: valores.apellidos!.trim(),
        parentesco: valores.parentesco,
        telefonoWhatsapp: valores.telefonoWhatsapp!.trim(),
        email: valores.email?.trim() || undefined,
        numeroDocumento: valores.numeroDocumento?.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.guardandoAcudienteEdicion.set(false);
          this.abrirEditar(estudiante.id);
        },
        error: (error) => {
          this.guardandoAcudienteEdicion.set(false);
          this.errorAcudienteEdicion.set(error.error?.message ?? 'No se pudo actualizar el acudiente.');
        },
      });
  }

  private cargarResumen(): void {
    this.academicoService.obtenerResumenEstudiantes().subscribe({
      next: (resumen) => this.resumen.set(resumen),
      error: () => {},
    });
  }

  private cargarLista(): void {
    this.cargandoLista.set(true);
    this.error.set(null);

    const filtros: FiltrosEstudiantes = {
      q: this.busquedaInput() || undefined,
      cursoId: this.cursoIdInput() || undefined,
      estado: this.estadoInput() || undefined,
      pagina: this.pagina(),
      limite: this.limite,
    };

    this.academicoService.listarEstudiantes(filtros).subscribe({
      next: (lista) => {
        this.lista.set(lista);
        this.cargandoLista.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar la lista de estudiantes. Intenta de nuevo.');
        this.cargandoLista.set(false);
      },
    });
  }
}
