import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  AdjuntoSubido,
  CodigoEstadoExcusa,
  CrearExcusa,
  ExcusaListado,
  ExcusasService,
  FiltrosExcusas,
  ListaExcusas,
  ResumenExcusas,
} from '../../core/excusas/excusas';
import { AcademicoService, Curso, EstudianteMatriculado } from '../../core/academico/academico';
import { AuthService } from '../../core/auth/auth';

@Component({
  selector: 'app-excusas',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './excusas.html',
})
export class ExcusasComponent {
  private readonly excusasService = inject(ExcusasService);
  private readonly academicoService = inject(AcademicoService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  protected readonly tiposExcusa = [
    'Cita médica',
    'Enfermedad',
    'Asunto familiar',
    'Evaluación médica',
    'Viaje familiar',
    'Otro',
  ];

  protected readonly puedeDecidir = computed(() => {
    const rol = this.authService.usuario()?.rol;
    return rol === 'admin' || rol === 'rector' || rol === 'coordinador';
  });

  protected readonly hoyFormateado = new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  }).format(new Date());

  protected readonly resumen = signal<ResumenExcusas | null>(null);
  protected readonly lista = signal<ListaExcusas | null>(null);
  protected readonly cargandoLista = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly cursos = signal<Curso[]>([]);
  protected readonly estudiantes = signal<EstudianteMatriculado[]>([]);

  protected readonly busquedaInput = signal('');
  protected readonly cursoIdInput = signal('');
  protected readonly estadoInput = signal('');
  protected readonly fechaInicioInput = signal('');
  protected readonly fechaFinInput = signal('');
  protected readonly pagina = signal(1);
  protected readonly limite = 10;

  protected readonly dropdownAbierto = signal<string | null>(null);
  protected readonly excusaDetalle = signal<ExcusaListado | null>(null);
  protected readonly accionEnCurso = signal<string | null>(null);
  protected readonly descargandoAdjunto = signal<string | null>(null);
  protected readonly errorAccion = signal<string | null>(null);

  protected readonly mostrarModalNueva = signal(false);
  protected readonly guardandoExcusa = signal(false);
  protected readonly errorModal = signal<string | null>(null);
  protected readonly archivoSubiendo = signal(false);
  protected readonly archivoSubido = signal<AdjuntoSubido | null>(null);
  protected readonly errorArchivo = signal<string | null>(null);

  protected readonly formularioExcusa = this.fb.group({
    estudianteId: ['', Validators.required],
    fechaAusencia: ['', Validators.required],
    tipoExcusa: ['', Validators.required],
    motivo: ['', [Validators.required, Validators.maxLength(500)]],
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
    this.academicoService
      .listarEstudiantesMatriculados()
      .subscribe({ next: (estudiantes) => this.estudiantes.set(estudiantes), error: () => {} });
  }

  actualizarBusqueda(valor: string): void {
    this.busquedaInput.set(valor);
    this.pagina.set(1);
    this.cargarLista();
  }

  actualizarEstado(valor: string): void {
    this.estadoInput.set(valor);
    this.pagina.set(1);
    this.cargarLista();
  }

  actualizarCurso(valor: string): void {
    this.cursoIdInput.set(valor);
    this.pagina.set(1);
    this.cargarLista();
  }

  actualizarFechaInicio(valor: string): void {
    this.fechaInicioInput.set(valor);
    this.pagina.set(1);
    this.cargarLista();
  }

  actualizarFechaFin(valor: string): void {
    this.fechaFinInput.set(valor);
    this.pagina.set(1);
    this.cargarLista();
  }

  limpiarFiltros(): void {
    this.busquedaInput.set('');
    this.cursoIdInput.set('');
    this.estadoInput.set('');
    this.fechaInicioInput.set('');
    this.fechaFinInput.set('');
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

  abrirDetalle(excusa: ExcusaListado): void {
    this.dropdownAbierto.set(null);
    this.excusaDetalle.set(excusa);
  }

  cerrarDetalle(): void {
    this.excusaDetalle.set(null);
  }

  aprobar(id: string): void {
    this.dropdownAbierto.set(null);
    this.errorAccion.set(null);
    this.accionEnCurso.set(id);
    this.excusasService.aprobar(id).subscribe({
      next: () => {
        this.accionEnCurso.set(null);
        this.cargarLista();
        this.cargarResumen();
      },
      error: (error) => {
        this.accionEnCurso.set(null);
        this.errorAccion.set(error.error?.message ?? 'No se pudo aprobar la excusa.');
      },
    });
  }

  rechazar(id: string): void {
    this.dropdownAbierto.set(null);
    this.errorAccion.set(null);
    this.accionEnCurso.set(id);
    this.excusasService.rechazar(id).subscribe({
      next: () => {
        this.accionEnCurso.set(null);
        this.cargarLista();
        this.cargarResumen();
      },
      error: (error) => {
        this.accionEnCurso.set(null);
        this.errorAccion.set(error.error?.message ?? 'No se pudo negar la excusa.');
      },
    });
  }

  verAdjunto(excusa: ExcusaListado): void {
    if (!excusa.archivoSoporteUrl) return;
    this.descargandoAdjunto.set(excusa.id);
    this.excusasService.descargarAdjunto(excusa.archivoSoporteUrl).subscribe({
      next: (blob) => {
        this.descargandoAdjunto.set(null);
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      },
      error: () => {
        this.descargandoAdjunto.set(null);
        this.errorAccion.set('No se pudo abrir el adjunto.');
      },
    });
  }

  abrirModalNueva(): void {
    this.formularioExcusa.reset({ estudianteId: '', fechaAusencia: '', tipoExcusa: '', motivo: '' });
    this.archivoSubido.set(null);
    this.errorArchivo.set(null);
    this.errorModal.set(null);
    this.mostrarModalNueva.set(true);
  }

  cerrarModalNueva(): void {
    this.mostrarModalNueva.set(false);
  }

  seleccionarArchivo(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (!archivo) return;

    const tiposPermitidos = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!tiposPermitidos.includes(archivo.type)) {
      this.errorArchivo.set('Solo se aceptan archivos PDF, JPG o PNG.');
      input.value = '';
      return;
    }
    if (archivo.size > 5 * 1024 * 1024) {
      this.errorArchivo.set('El archivo no puede pesar más de 5 MB.');
      input.value = '';
      return;
    }

    this.errorArchivo.set(null);
    this.archivoSubiendo.set(true);
    this.excusasService.subirAdjunto(archivo).subscribe({
      next: (subido) => {
        this.archivoSubiendo.set(false);
        this.archivoSubido.set(subido);
        input.value = '';
      },
      error: (error) => {
        this.archivoSubiendo.set(false);
        this.errorArchivo.set(error.error?.message ?? 'No se pudo subir el archivo.');
        input.value = '';
      },
    });
  }

  quitarArchivo(): void {
    this.archivoSubido.set(null);
  }

  guardarExcusa(): void {
    if (this.formularioExcusa.invalid) {
      this.formularioExcusa.markAllAsTouched();
      return;
    }

    const valores = this.formularioExcusa.getRawValue();
    const adjunto = this.archivoSubido();
    const dto: CrearExcusa = {
      estudianteId: valores.estudianteId!,
      fechaAusencia: valores.fechaAusencia!,
      tipoExcusa: valores.tipoExcusa!,
      motivo: valores.motivo!,
      archivoSoporteUrl: adjunto?.url,
      archivoSoporteNombre: adjunto?.nombre,
    };

    this.errorModal.set(null);
    this.guardandoExcusa.set(true);
    this.excusasService.crear(dto).subscribe({
      next: () => {
        this.guardandoExcusa.set(false);
        this.mostrarModalNueva.set(false);
        this.pagina.set(1);
        this.cargarLista();
        this.cargarResumen();
      },
      error: (error) => {
        this.guardandoExcusa.set(false);
        this.errorModal.set(error.error?.message ?? 'No se pudo registrar la excusa.');
      },
    });
  }

  protected iniciales(nombres: string, apellidos: string): string {
    return `${nombres.charAt(0)}${apellidos.charAt(0)}`.toUpperCase();
  }

  protected etiquetaEstado(codigo: CodigoEstadoExcusa): string {
    if (codigo === 'aprobada') return 'Aprobada';
    if (codigo === 'rechazada') return 'Negada';
    return 'Pendiente';
  }

  protected claseEstado(codigo: CodigoEstadoExcusa): string {
    if (codigo === 'aprobada') return 'bg-green-50 text-green-600';
    if (codigo === 'rechazada') return 'bg-red-50 text-red-500';
    return 'bg-amber-50 text-amber-500';
  }

  protected formatearFecha(fechaIso: string): { fecha: string; dia: string } {
    const [anio, mes, dia] = fechaIso.split('-').map(Number);
    const fechaLocal = new Date(anio, mes - 1, dia);
    return {
      fecha: new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
        fechaLocal,
      ),
      dia: new Intl.DateTimeFormat('es-CO', { weekday: 'long' }).format(fechaLocal),
    };
  }

  protected formatearFechaHora(fechaIso: string): { fecha: string; hora: string } {
    const instante = new Date(fechaIso);
    return {
      fecha: new Intl.DateTimeFormat('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'America/Bogota',
      }).format(instante),
      hora: new Intl.DateTimeFormat('es-CO', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Bogota',
      }).format(instante),
    };
  }

  private cargarLista(): void {
    this.cargandoLista.set(true);
    this.error.set(null);

    const filtros: FiltrosExcusas = {
      q: this.busquedaInput() || undefined,
      cursoId: this.cursoIdInput() || undefined,
      estado: (this.estadoInput() as CodigoEstadoExcusa) || undefined,
      fechaInicio: this.fechaInicioInput() || undefined,
      fechaFin: this.fechaFinInput() || undefined,
      pagina: this.pagina(),
      limite: this.limite,
    };

    this.excusasService.listar(filtros).subscribe({
      next: (lista) => {
        this.lista.set(lista);
        this.cargandoLista.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar la lista de excusas. Intenta de nuevo.');
        this.cargandoLista.set(false);
      },
    });
  }

  private cargarResumen(): void {
    this.excusasService.obtenerResumen().subscribe({ next: (resumen) => this.resumen.set(resumen), error: () => {} });
  }
}
