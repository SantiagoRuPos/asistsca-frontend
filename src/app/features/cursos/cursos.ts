import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AcademicoService, Curso, ProfesorListado } from '../../core/academico/academico';
import { AuthService } from '../../core/auth/auth';

interface CursoConDerivados extends Curso {
  grado: string;
  estaActivo: boolean;
}

@Component({
  selector: 'app-cursos',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './cursos.html',
})
export class CursosComponent {
  private readonly academicoService = inject(AcademicoService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly puedeGestionar = computed(() => {
    const rol = this.authService.usuario()?.rol;
    return rol === 'admin' || rol === 'rector' || rol === 'coordinador';
  });

  protected readonly jornadas: { valor: 'mañana' | 'tarde' | 'unica'; etiqueta: string }[] = [
    { valor: 'mañana', etiqueta: 'Mañana' },
    { valor: 'tarde', etiqueta: 'Tarde' },
    { valor: 'unica', etiqueta: 'Única' },
  ];

  protected readonly profesores = signal<ProfesorListado[]>([]);

  protected readonly menuAbiertoId = signal<string | null>(null);

  protected readonly mostrarModalCrear = signal(false);
  protected readonly guardandoCrear = signal(false);
  protected readonly errorCrear = signal<string | null>(null);

  protected readonly formularioCrear = this.fb.group({
    nombre: ['', [Validators.required, Validators.maxLength(40)]],
    anioLectivo: [new Date().getFullYear(), Validators.required],
    profesorDirectorId: ['', Validators.required],
    jornada: this.fb.nonNullable.control<'mañana' | 'tarde' | 'unica'>('unica'),
  });

  protected readonly cursoCambiandoDirector = signal<CursoConDerivados | null>(null);
  protected readonly guardandoDirector = signal(false);
  protected readonly errorDirector = signal<string | null>(null);

  protected readonly formularioCambiarDirector = this.fb.group({
    profesorDirectorId: ['', Validators.required],
  });

  protected readonly anioActual = new Date().getFullYear();
  protected readonly limite = 5;

  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly cursos = signal<CursoConDerivados[]>([]);

  protected readonly busquedaInput = signal('');
  protected readonly gradoInput = signal('');
  protected readonly estadoInput = signal('');
  protected readonly pagina = signal(1);

  protected readonly grados = computed(() => {
    const unicos = new Set(this.cursos().map((c) => c.grado));
    return [...unicos].sort();
  });

  protected readonly cursosFiltrados = computed(() => {
    const busqueda = this.busquedaInput().trim().toLowerCase();
    const grado = this.gradoInput();
    const estado = this.estadoInput();

    return this.cursos().filter((curso) => {
      if (busqueda && !curso.nombre.toLowerCase().includes(busqueda)) return false;
      if (grado && curso.grado !== grado) return false;
      if (estado === 'activo' && !curso.estaActivo) return false;
      if (estado === 'inactivo' && curso.estaActivo) return false;
      return true;
    });
  });

  protected readonly totalPaginas = computed(() => Math.max(1, Math.ceil(this.cursosFiltrados().length / this.limite)));

  protected readonly cursosPagina = computed(() => {
    const inicio = (this.pagina() - 1) * this.limite;
    return this.cursosFiltrados().slice(inicio, inicio + this.limite);
  });

  protected readonly totalEstudiantes = computed(() =>
    this.cursos().reduce((suma, c) => suma + c.cantidadEstudiantes, 0),
  );
  protected readonly totalActivos = computed(() => this.cursos().filter((c) => c.estaActivo).length);
  protected readonly totalInactivos = computed(() => this.cursos().length - this.totalActivos());
  protected readonly porcentajeActivos = computed(() =>
    this.cursos().length > 0 ? Math.round((this.totalActivos() / this.cursos().length) * 100) : 0,
  );
  protected readonly porcentajeInactivos = computed(() =>
    this.cursos().length > 0 ? Math.round((this.totalInactivos() / this.cursos().length) * 100) : 0,
  );

  protected readonly paginasVisibles = computed<(number | '...')[]>(() => {
    const total = this.totalPaginas();
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
    this.cargar();
    this.academicoService.listarProfesores().subscribe({
      next: (profesores) => this.profesores.set(profesores),
      error: () => {},
    });
  }

  @HostListener('document:click')
  cerrarMenuAlHacerClicFuera(): void {
    this.menuAbiertoId.set(null);
  }

  toggleMenu(cursoId: string, evento: Event): void {
    evento.stopPropagation();
    this.menuAbiertoId.update((actual) => (actual === cursoId ? null : cursoId));
  }

  cerrarMenu(): void {
    this.menuAbiertoId.set(null);
  }

  abrirModalCrear(): void {
    this.errorCrear.set(null);
    this.formularioCrear.reset({ anioLectivo: this.anioActual, jornada: 'unica', profesorDirectorId: '' });
    this.mostrarModalCrear.set(true);
  }

  cerrarModalCrear(): void {
    this.mostrarModalCrear.set(false);
  }

  guardarCrear(): void {
    if (this.formularioCrear.invalid) {
      this.formularioCrear.markAllAsTouched();
      return;
    }

    this.guardandoCrear.set(true);
    this.errorCrear.set(null);

    const valores = this.formularioCrear.getRawValue();

    this.academicoService
      .crearCurso({
        nombre: valores.nombre!.trim(),
        anioLectivo: valores.anioLectivo ?? undefined,
        profesorDirectorId: valores.profesorDirectorId!,
        jornada: valores.jornada,
      })
      .subscribe({
        next: () => {
          this.guardandoCrear.set(false);
          this.mostrarModalCrear.set(false);
          this.cargar();
        },
        error: (error) => {
          this.guardandoCrear.set(false);
          this.errorCrear.set(error.error?.message ?? 'No se pudo crear el curso. Intenta de nuevo.');
        },
      });
  }

  abrirCambiarDirector(curso: CursoConDerivados): void {
    this.menuAbiertoId.set(null);
    this.errorDirector.set(null);
    this.formularioCambiarDirector.reset({ profesorDirectorId: curso.director.id });
    this.cursoCambiandoDirector.set(curso);
  }

  cerrarCambiarDirector(): void {
    this.cursoCambiandoDirector.set(null);
  }

  guardarCambiarDirector(): void {
    const curso = this.cursoCambiandoDirector();
    if (!curso) return;

    if (this.formularioCambiarDirector.invalid) {
      this.formularioCambiarDirector.markAllAsTouched();
      return;
    }

    this.guardandoDirector.set(true);
    this.errorDirector.set(null);

    const profesorDirectorId = this.formularioCambiarDirector.getRawValue().profesorDirectorId!;

    this.academicoService.cambiarDirectorCurso(curso.id, { profesorDirectorId }).subscribe({
      next: () => {
        this.guardandoDirector.set(false);
        this.cursoCambiandoDirector.set(null);
        this.cargar();
      },
      error: (error) => {
        this.guardandoDirector.set(false);
        this.errorDirector.set(error.error?.message ?? 'No se pudo cambiar el director de grupo. Intenta de nuevo.');
      },
    });
  }

  actualizarBusqueda(valor: string): void {
    this.busquedaInput.set(valor);
    this.pagina.set(1);
  }

  actualizarGrado(valor: string): void {
    this.gradoInput.set(valor);
    this.pagina.set(1);
  }

  actualizarEstado(valor: string): void {
    this.estadoInput.set(valor);
    this.pagina.set(1);
  }

  limpiarFiltros(): void {
    this.busquedaInput.set('');
    this.gradoInput.set('');
    this.estadoInput.set('');
    this.pagina.set(1);
  }

  irACurso(id: string): void {
    this.router.navigate(['/cursos', id]);
  }

  irAPagina(p: number | '...'): void {
    if (p !== '...') this.pagina.set(p);
  }

  paginaAnterior(): void {
    if (this.pagina() > 1) this.pagina.update((p) => p - 1);
  }

  paginaSiguiente(): void {
    if (this.pagina() < this.totalPaginas()) this.pagina.update((p) => p + 1);
  }

  rangoMostrado(): string {
    const total = this.cursosFiltrados().length;
    if (total === 0) return '0 de 0';
    const desde = (this.pagina() - 1) * this.limite + 1;
    const hasta = Math.min(this.pagina() * this.limite, total);
    return `${desde} a ${hasta} de ${total}`;
  }

  private cargar(): void {
    this.cargando.set(true);
    this.academicoService.listarCursos().subscribe({
      next: (cursos) => {
        const conDerivados: CursoConDerivados[] = cursos.map((curso) => ({
          ...curso,
          grado: this.derivarGrado(curso.nombre),
          estaActivo: curso.anioLectivo === this.anioActual,
        }));
        this.cursos.set(conDerivados);
        this.cargando.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar la lista de cursos.');
        this.cargando.set(false);
      },
    });
  }

  private derivarGrado(nombre: string): string {
    const coincidencia = nombre.match(/^(\d+)/);
    return coincidencia ? `${coincidencia[1]}°` : nombre;
  }
}
