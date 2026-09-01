import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AsistenciaService, ResumenCurso } from '../../core/asistencia/asistencia';

type SeccionCurso = 'llegaron' | 'llegaronTarde' | 'noHanLlegado' | 'evadidos';

@Component({
  selector: 'app-curso-detalle',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './curso-detalle.html',
})
export class CursoDetalleComponent {
  private readonly asistenciaService = inject(AsistenciaService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly cursoId = this.route.snapshot.paramMap.get('id')!;

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

  constructor() {
    this.cargar();
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
