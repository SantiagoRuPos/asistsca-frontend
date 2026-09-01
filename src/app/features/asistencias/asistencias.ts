import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  AsistenciaService,
  FiltrosAsistencia,
  ListaAsistenciaDiaria,
  RegistrarAsistenciaManual,
  ResumenAsistencia,
  TipoRegistroManual,
  VistaAsistencia,
} from '../../core/asistencia/asistencia';
import { AcademicoService, Curso, EstudianteMatriculado } from '../../core/academico/academico';
import { CatalogosService, Estado } from '../../core/catalogos/catalogos';
import { LectorNfc, NfcService } from '../../core/nfc/nfc';
import { AuthService } from '../../core/auth/auth';

interface PestanaAsistencia {
  etiqueta: string;
  valor: VistaAsistencia;
}

@Component({
  selector: 'app-asistencias',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './asistencias.html',
})
export class AsistenciasComponent {
  private readonly asistenciaService = inject(AsistenciaService);
  private readonly academicoService = inject(AcademicoService);
  private readonly catalogosService = inject(CatalogosService);
  private readonly nfcService = inject(NfcService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  protected readonly puedeGestionar = computed(() => {
    const rol = this.authService.usuario()?.rol;
    return rol === 'admin' || rol === 'rector' || rol === 'coordinador';
  });

  protected readonly pestanas: PestanaAsistencia[] = [
    { etiqueta: 'Registro de hoy', valor: 'hoy' },
    { etiqueta: 'Entradas', valor: 'entradas' },
    { etiqueta: 'Salidas', valor: 'salidas' },
    { etiqueta: 'Historial', valor: 'historial' },
  ];

  protected readonly fecha = signal(this.obtenerFechaHoyIso());
  protected readonly vista = signal<VistaAsistencia>('hoy');
  protected readonly pagina = signal(1);
  protected readonly limite = 10;

  protected readonly busquedaInput = signal('');
  protected readonly cursoIdInput = signal('');
  protected readonly estadoInput = signal('');
  protected readonly lectorIdInput = signal('');

  protected readonly resumen = signal<ResumenAsistencia | null>(null);
  protected readonly lista = signal<ListaAsistenciaDiaria | null>(null);
  protected readonly cargandoLista = signal(false);
  protected readonly cargandoResumen = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly cursos = signal<Curso[]>([]);
  protected readonly estados = signal<Estado[]>([]);
  protected readonly lectores = signal<LectorNfc[]>([]);
  protected readonly estudiantesParaModal = signal<EstudianteMatriculado[]>([]);

  protected readonly mostrarModalManual = signal(false);
  protected readonly guardandoManual = signal(false);
  protected readonly errorManual = signal<string | null>(null);

  protected readonly formularioManual = this.fb.group({
    estudianteId: ['', Validators.required],
    tipoRegistro: this.fb.nonNullable.control<TipoRegistroManual>('presente', Validators.required),
    hora: [this.obtenerHoraActualLocal(), Validators.required],
    observacion: ['', [Validators.required, Validators.minLength(4)]],
  });

  protected readonly fechaFormateada = computed(() => {
    const [anio, mes, dia] = this.fecha().split('-').map(Number);
    const fechaLocal = new Date(anio, mes - 1, dia);
    return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }).format(fechaLocal);
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

    this.academicoService.listarCursos().subscribe({ next: (cursos) => this.cursos.set(cursos), error: () => {} });
    this.catalogosService
      .listarEstados('asistencia_diaria')
      .subscribe({ next: (estados) => this.estados.set(estados), error: () => {} });

    if (this.puedeGestionar()) {
      this.nfcService.listarLectores().subscribe({ next: (lectores) => this.lectores.set(lectores), error: () => {} });
    }
  }

  cambiarFecha(valor: string): void {
    this.fecha.set(valor);
    this.pagina.set(1);
    this.cargarResumen();
    this.cargarLista();
  }

  cambiarVista(vista: VistaAsistencia): void {
    this.vista.set(vista);
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

  buscar(): void {
    this.pagina.set(1);
    this.cargarLista();
  }

  limpiarFiltros(): void {
    this.busquedaInput.set('');
    this.cursoIdInput.set('');
    this.estadoInput.set('');
    this.lectorIdInput.set('');
    this.pagina.set(1);
    this.cargarLista();
  }

  abrirModalManual(): void {
    this.errorManual.set(null);
    this.formularioManual.reset({
      estudianteId: '',
      tipoRegistro: 'presente',
      hora: this.obtenerHoraActualLocal(),
      observacion: '',
    });
    this.mostrarModalManual.set(true);

    if (this.estudiantesParaModal().length === 0) {
      this.academicoService.listarEstudiantesMatriculados().subscribe({
        next: (estudiantes) => this.estudiantesParaModal.set(estudiantes),
        error: () => {},
      });
    }
  }

  cerrarModalManual(): void {
    this.mostrarModalManual.set(false);
  }

  guardarRegistroManual(): void {
    if (this.formularioManual.invalid) {
      this.formularioManual.markAllAsTouched();
      return;
    }

    this.guardandoManual.set(true);
    this.errorManual.set(null);

    const valores = this.formularioManual.getRawValue();
    const dto: RegistrarAsistenciaManual = {
      estudianteId: valores.estudianteId!,
      tipoRegistro: valores.tipoRegistro,
      fecha: this.fecha(),
      hora: valores.hora!,
      observacion: valores.observacion!.trim(),
    };

    this.asistenciaService.registrarManual(dto).subscribe({
      next: () => {
        this.guardandoManual.set(false);
        this.mostrarModalManual.set(false);
        this.cargarResumen();
        this.cargarLista();
      },
      error: (error) => {
        this.guardandoManual.set(false);
        this.errorManual.set(error.error?.message ?? 'No se pudo registrar. Intenta de nuevo.');
      },
    });
  }

  protected estiloEstado(codigo: string): { texto: string; clase: string } {
    const mapa: Record<string, { texto: string; clase: string }> = {
      presente: { texto: 'Entró', clase: 'bg-green-50 text-green-600' },
      tarde: { texto: 'Llegó tarde', clase: 'bg-amber-50 text-amber-600' },
      ausente: { texto: 'Ausente', clase: 'bg-red-50 text-red-600' },
      excusado: { texto: 'Excusado', clase: 'bg-blue-50 text-blue-600' },
      evadido: { texto: 'Evadido', clase: 'bg-purple-50 text-purple-600' },
    };
    return mapa[codigo] ?? { texto: codigo, clase: 'bg-gray-100 text-gray-600' };
  }

  protected iniciales(nombres: string, apellidos: string): string {
    return `${nombres.charAt(0)}${apellidos.charAt(0)}`.toUpperCase();
  }

  protected formatearHora(iso: string | null): string {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('es-CO', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Bogota',
    }).format(new Date(iso));
  }

  protected rangoMostrado(): string {
    const lista = this.lista();
    if (!lista || lista.total === 0) return '0 de 0';
    const desde = (lista.pagina - 1) * lista.limite + 1;
    const hasta = Math.min(lista.pagina * lista.limite, lista.total);
    return `${desde} a ${hasta} de ${lista.total}`;
  }

  private cargarResumen(): void {
    this.cargandoResumen.set(true);
    this.asistenciaService.obtenerResumen(this.fecha()).subscribe({
      next: (resumen) => {
        this.resumen.set(resumen);
        this.cargandoResumen.set(false);
      },
      error: () => this.cargandoResumen.set(false),
    });
  }

  private cargarLista(): void {
    this.cargandoLista.set(true);
    this.error.set(null);

    const filtros: FiltrosAsistencia = {
      cursoId: this.cursoIdInput() || undefined,
      estado: this.estadoInput() || undefined,
      q: this.busquedaInput() || undefined,
      lectorId: this.lectorIdInput() || undefined,
      vista: this.vista(),
      pagina: this.pagina(),
      limite: this.limite,
    };

    if (this.vista() === 'historial') {
      filtros.fechaFin = this.fecha();
      filtros.fechaInicio = this.restarDias(this.fecha(), 30);
    } else {
      filtros.fecha = this.fecha();
    }

    this.asistenciaService.listarDiaria(filtros).subscribe({
      next: (lista) => {
        this.lista.set(lista);
        this.cargandoLista.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar la asistencia. Intenta de nuevo.');
        this.cargandoLista.set(false);
      },
    });
  }

  private obtenerFechaHoyIso(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  private obtenerHoraActualLocal(): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Bogota',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
  }

  private restarDias(fechaIso: string, dias: number): string {
    const [anio, mes, dia] = fechaIso.split('-').map(Number);
    const fecha = new Date(Date.UTC(anio, mes - 1, dia));
    fecha.setUTCDate(fecha.getUTCDate() - dias);
    return fecha.toISOString().slice(0, 10);
  }
}
