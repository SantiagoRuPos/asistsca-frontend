import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ReportesService } from '../../core/reportes/reportes';
import { AcademicoService, Curso, EstudianteMatriculado } from '../../core/academico/academico';

type TipoInforme = 'estudiante' | 'curso' | 'colegio';

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './reportes.html',
})
export class ReportesComponent {
  private readonly reportesService = inject(ReportesService);
  private readonly academicoService = inject(AcademicoService);

  protected readonly tipoInforme = signal<TipoInforme>('estudiante');

  // Rango por defecto: del primer día del mes actual a hoy — un punto de
  // partida más útil que un solo día, sin forzar a elegir nada para probar
  // la pantalla. El usuario puede cambiarlo libremente a cualquier rango.
  protected readonly fechaInicio = signal(this.primerDiaDelMes());
  protected readonly fechaFin = signal(this.hoyIso());

  protected readonly estudiantes = signal<EstudianteMatriculado[]>([]);
  protected readonly cursos = signal<Curso[]>([]);
  protected readonly estudianteId = signal('');
  protected readonly cursoId = signal('');

  protected readonly descargando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly exito = signal<string | null>(null);

  protected readonly rangoValido = computed(() => {
    if (!this.fechaInicio() || !this.fechaFin()) return false;
    return this.fechaInicio() <= this.fechaFin();
  });

  protected readonly puedeDescargar = computed(() => {
    if (!this.rangoValido()) return false;
    if (this.tipoInforme() === 'estudiante') return !!this.estudianteId();
    if (this.tipoInforme() === 'curso') return !!this.cursoId();
    return true;
  });

  constructor() {
    this.academicoService.listarEstudiantesMatriculados().subscribe({
      next: (estudiantes) => this.estudiantes.set(estudiantes),
      error: () => {},
    });
    this.academicoService.listarCursos().subscribe({
      next: (cursos) => this.cursos.set(cursos),
      error: () => {},
    });
  }

  cambiarTipoInforme(tipo: TipoInforme): void {
    this.tipoInforme.set(tipo);
    this.error.set(null);
    this.exito.set(null);
  }

  descargar(): void {
    if (!this.puedeDescargar() || this.descargando()) return;

    this.error.set(null);
    this.exito.set(null);
    this.descargando.set(true);

    const observable =
      this.tipoInforme() === 'estudiante'
        ? this.reportesService.descargarInformeEstudiante(this.estudianteId(), this.fechaInicio(), this.fechaFin())
        : this.tipoInforme() === 'curso'
          ? this.reportesService.descargarInformeCurso(this.cursoId(), this.fechaInicio(), this.fechaFin())
          : this.reportesService.descargarInformeColegio(this.fechaInicio(), this.fechaFin());

    observable.subscribe({
      next: (informe) => {
        this.descargando.set(false);
        this.guardarArchivo(informe.blob, informe.nombreArchivo);
        this.exito.set('Informe descargado correctamente.');
        setTimeout(() => this.exito.set(null), 3000);
      },
      error: async (error: unknown) => {
        this.descargando.set(false);
        this.error.set(await this.obtenerMensajeError(error));
      },
    });
  }

  private guardarArchivo(blob: Blob, nombreArchivo: string): void {
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombreArchivo;
    enlace.click();
    URL.revokeObjectURL(url);
  }

  // Con responseType: 'blob', un error del backend (400/404/etc.) llega con
  // error.error como un Blob (el cuerpo JSON del error, sin parsear) en vez
  // de un objeto ya parseado — hay que leerlo como texto y parsearlo a mano
  // para poder mostrar el mensaje real en vez de un genérico siempre.
  private async obtenerMensajeError(error: unknown): Promise<string> {
    const generico = 'No se pudo generar el informe. Intenta de nuevo.';
    if (error instanceof HttpErrorResponse && error.error instanceof Blob) {
      try {
        const texto = await error.error.text();
        const cuerpo = JSON.parse(texto);
        return typeof cuerpo?.message === 'string' ? cuerpo.message : generico;
      } catch {
        return generico;
      }
    }
    return generico;
  }

  private primerDiaDelMes(): string {
    const hoy = new Date();
    return this.aIso(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  }

  private hoyIso(): string {
    return this.aIso(new Date());
  }

  private aIso(fecha: Date): string {
    const anio = fecha.getFullYear();
    const mes = `${fecha.getMonth() + 1}`.padStart(2, '0');
    const dia = `${fecha.getDate()}`.padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  }
}
