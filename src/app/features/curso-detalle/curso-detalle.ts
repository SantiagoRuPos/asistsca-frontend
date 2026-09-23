import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { AsistenciaService, ResumenCurso } from '../../core/asistencia/asistencia';
import { AcademicoService, HorarioCurso } from '../../core/academico/academico';
import { AuthService } from '../../core/auth/auth';

type SeccionCurso = 'llegaron' | 'llegaronTarde' | 'noHanLlegado' | 'evadidos';

// 1 = lunes ... 7 = domingo, igual que HorarioCurso.diaSemana en el backend.
const DIAS_SEMANA: { valor: number; etiqueta: string }[] = [
  { valor: 1, etiqueta: 'Lunes' },
  { valor: 2, etiqueta: 'Martes' },
  { valor: 3, etiqueta: 'Miércoles' },
  { valor: 4, etiqueta: 'Jueves' },
  { valor: 5, etiqueta: 'Viernes' },
  { valor: 6, etiqueta: 'Sábado' },
  { valor: 7, etiqueta: 'Domingo' },
];

@Component({
  selector: 'app-curso-detalle',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './curso-detalle.html',
})
export class CursoDetalleComponent {
  private readonly asistenciaService = inject(AsistenciaService);
  private readonly academicoService = inject(AcademicoService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly cursoId = this.route.snapshot.paramMap.get('id')!;

  protected readonly diasSemana = DIAS_SEMANA;

  protected readonly fecha = signal(this.obtenerFechaHoyIso());
  protected readonly resumen = signal<ResumenCurso | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly accionEnCurso = signal<string | null>(null);

  protected readonly seccionesExpandidas = signal<Record<SeccionCurso, boolean>>({
    llegaron: true,
    llegaronTarde: true,
    noHanLlegado: true,
    evadidos: true,
  });

  protected readonly mostrarTodos = signal<Record<SeccionCurso, boolean>>({
    llegaron: false,
    llegaronTarde: false,
    noHanLlegado: false,
    evadidos: false,
  });

  protected readonly fechaFormateada = computed(() => {
    const [anio, mes, dia] = this.fecha().split('-').map(Number);
    const fechaLocal = new Date(anio, mes - 1, dia);
    return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }).format(fechaLocal);
  });

  // El backend (POST /asistencia/diaria/manual) permite marcar evadido a
  // admin/rector/coordinador y también a cualquier profesor (de cualquier
  // curso, no solo el que dirige) — es el profesor que está físicamente en
  // el salón quien nota que el estudiante no está, así que necesita poder
  // marcarlo aunque no sea su curso dirigido.
  protected readonly puedeMarcarEvadido = computed(() => {
    const rol = this.authService.usuario()?.rol;
    return rol === 'admin' || rol === 'rector' || rol === 'coordinador' || rol === 'profesor';
  });

  // El backend solo permite crear/editar/borrar horarios a admin/rector/
  // coordinador (ver @Roles(...ROLES_GESTION) en academico.controller.ts) —
  // un profesor puede VER el horario (GET ya lo permite) pero no tocarlo.
  protected readonly puedeConfigurarHorario = computed(() => {
    const rol = this.authService.usuario()?.rol;
    return rol === 'admin' || rol === 'rector' || rol === 'coordinador';
  });

  protected readonly horarios = signal<HorarioCurso[]>([]);
  protected readonly cargandoHorarios = signal(true);
  protected readonly mostrarHorario = signal(true);
  protected readonly diaEnEdicion = signal<number | null>(null);
  protected readonly formHoraEntrada = signal('07:00');
  protected readonly formHoraSalida = signal('14:00');
  protected readonly formTolerancia = signal(10);
  protected readonly guardandoHorario = signal(false);
  protected readonly errorHorario = signal<string | null>(null);

  protected readonly horarioPorDia = computed(() => {
    const mapa = new Map<number, HorarioCurso>();
    for (const horario of this.horarios()) {
      mapa.set(horario.diaSemana, horario);
    }
    return mapa;
  });

  constructor() {
    this.cargar();
    this.cargarHorarios();
  }

  cambiarFecha(valor: string): void {
    this.fecha.set(valor);
    this.cargar();
  }

  volver(): void {
    this.router.navigate(['/cursos']);
  }

  alternarSeccion(seccion: SeccionCurso): void {
    this.seccionesExpandidas.update((actual) => ({ ...actual, [seccion]: !actual[seccion] }));
  }

  verTodos(seccion: SeccionCurso): void {
    this.mostrarTodos.update((actual) => ({ ...actual, [seccion]: true }));
  }

  filasVisibles<T>(seccion: SeccionCurso, filas: T[]): T[] {
    return this.mostrarTodos()[seccion] ? filas : filas.slice(0, 2);
  }

  marcarEvadido(estudianteId: string): void {
    this.accionEnCurso.set(estudianteId);
    this.asistenciaService
      .registrarManual({
        estudianteId,
        tipoRegistro: 'evadido',
        fecha: this.fecha(),
        observacion: 'Marcado como evadido desde la vista de curso.',
      })
      .subscribe({
        next: () => {
          this.accionEnCurso.set(null);
          this.cargar();
        },
        error: (error) => {
          this.accionEnCurso.set(null);
          this.error.set(error.error?.message ?? 'No se pudo marcar al estudiante como evadido.');
        },
      });
  }

  marcarEncontrado(estudianteId: string): void {
    this.accionEnCurso.set(estudianteId);
    this.asistenciaService
      .registrarManual({
        estudianteId,
        tipoRegistro: 'encontrado',
        fecha: this.fecha(),
        observacion: 'Revertido de evadido a encontrado desde la vista de curso.',
      })
      .subscribe({
        next: () => {
          this.accionEnCurso.set(null);
          this.cargar();
        },
        error: (error) => {
          this.accionEnCurso.set(null);
          this.error.set(error.error?.message ?? 'No se pudo marcar al estudiante como encontrado.');
        },
      });
  }

  alternarHorario(): void {
    this.mostrarHorario.update((actual) => !actual);
  }

  abrirEdicionHorario(dia: number): void {
    const existente = this.horarioPorDia().get(dia);
    this.formHoraEntrada.set(existente ? existente.horaEntrada.slice(0, 5) : '07:00');
    this.formHoraSalida.set(existente ? existente.horaSalida.slice(0, 5) : '14:00');
    this.formTolerancia.set(existente ? existente.minutosToleranciaTardanza : 10);
    this.errorHorario.set(null);
    this.diaEnEdicion.set(dia);
  }

  cancelarEdicionHorario(): void {
    this.diaEnEdicion.set(null);
    this.errorHorario.set(null);
  }

  guardarHorarioDia(dia: number): void {
    this.errorHorario.set(null);
    this.guardandoHorario.set(true);

    const existente = this.horarioPorDia().get(dia);
    const horaEntrada = this.formHoraEntrada();
    const horaSalida = this.formHoraSalida();
    const minutosToleranciaTardanza = this.formTolerancia();

    // Tipado explícito a Observable<unknown>: actualizar y crear devuelven
    // formas distintas (HorarioCurso vs { creados, omitidos }) y no nos
    // interesa el valor emitido, solo que la petición haya terminado — sin
    // esto, TypeScript no puede unificar las sobrecargas de .subscribe()
    // entre los dos tipos de Observable del ternario (TS2349).
    const accion$: Observable<unknown> = existente
      ? this.academicoService.actualizarHorarioCurso(this.cursoId, existente.id, {
          horaEntrada,
          horaSalida,
          minutosToleranciaTardanza,
        })
      : this.academicoService.crearHorarioCurso(this.cursoId, {
          diasSemana: [dia],
          horaEntrada,
          horaSalida,
          minutosToleranciaTardanza,
        });

    accion$.subscribe({
      next: () => {
        this.guardandoHorario.set(false);
        this.diaEnEdicion.set(null);
        this.cargarHorarios();
      },
      error: (error: any) => {
        this.guardandoHorario.set(false);
        this.errorHorario.set(error.error?.message ?? 'No se pudo guardar el horario de ese día.');
      },
    });
  }

  eliminarHorarioDia(dia: number): void {
    const existente = this.horarioPorDia().get(dia);
    if (!existente) return;
    if (!confirm(`¿Quitar el horario configurado para ${this.diasSemana.find((d) => d.valor === dia)?.etiqueta}?`)) {
      return;
    }
    this.errorHorario.set(null);
    this.academicoService.eliminarHorarioCurso(this.cursoId, existente.id).subscribe({
      next: () => this.cargarHorarios(),
      error: (error) => this.errorHorario.set(error.error?.message ?? 'No se pudo eliminar el horario.'),
    });
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

  private cargarHorarios(): void {
    this.cargandoHorarios.set(true);
    this.academicoService.listarHorariosCurso(this.cursoId).subscribe({
      next: (horarios) => {
        this.horarios.set(horarios);
        this.cargandoHorarios.set(false);
      },
      error: () => {
        this.cargandoHorarios.set(false);
      },
    });
  }

  private cargar(): void {
    this.cargando.set(true);
    this.error.set(null);

    this.asistenciaService.obtenerResumenCurso(this.cursoId, this.fecha()).subscribe({
      next: (resumen) => {
        this.resumen.set(resumen);
        this.cargando.set(false);
      },
      error: (error) => {
        this.error.set(error.error?.message ?? 'No se pudo cargar la información del curso.');
        this.cargando.set(false);
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
}
