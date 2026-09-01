import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AsistenciaService, ResumenAsistencia } from '../../core/asistencia/asistencia';
import { ExcusasService, ResumenExcusas } from '../../core/excusas/excusas';

interface AccionRapida {
  etiqueta: string;
  icono: string;
  colorTexto: string;
  colorFondo: string;
  ruta: string;
}

interface AtencionCard {
  etiqueta: string;
  valor: number;
  descripcion: string;
  colorTexto: string;
  colorFondo: string;
  icono: string;
}

@Component({
  selector: 'app-resumen',
  standalone: true,
  templateUrl: './resumen.html',
})
export class ResumenComponent {
  private readonly asistenciaService = inject(AsistenciaService);
  private readonly excusasService = inject(ExcusasService);
  private readonly router = inject(Router);

  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly resumenAsistencia = signal<ResumenAsistencia | null>(null);
  protected readonly resumenExcusas = signal<ResumenExcusas | null>(null);

  protected readonly porcentajeAsistencia = computed(() => this.resumenAsistencia()?.entraron.porcentaje ?? 0);
  protected readonly entraron = computed(() => this.resumenAsistencia()?.entraron.valor ?? 0);
  protected readonly tardanzas = computed(() => this.resumenAsistencia()?.tardanzas.valor ?? 0);
  protected readonly ausencias = computed(() => this.resumenAsistencia()?.ausencias.valor ?? 0);
  protected readonly excusasPendientes = computed(() => this.resumenExcusas()?.pendientes ?? 0);

  protected readonly bannerVisible = signal(true);

  protected readonly fechaHoy = new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  }).format(new Date());

  private readonly radio = 80;

  protected readonly circunferencia = 2 * Math.PI * this.radio;

  protected readonly offsetProgreso = computed(
    () =>
      this.circunferencia *
      (1 - this.porcentajeAsistencia() / 100),
  );

  protected readonly acciones: AccionRapida[] = [
    {
      etiqueta: 'Registrar entrada',
      icono: 'entrada',
      colorTexto: 'text-brand-teal',
      colorFondo: 'bg-brand-teal/10',
      ruta: '/asistencias',
    },
    {
      etiqueta: 'Registrar tardanza',
      icono: 'tardanza',
      colorTexto: 'text-amber-500',
      colorFondo: 'bg-amber-50',
      ruta: '/asistencias',
    },
    {
      etiqueta: 'Registrar ausencia',
      icono: 'ausencia',
      colorTexto: 'text-red-500',
      colorFondo: 'bg-red-50',
      ruta: '/asistencias',
    },
    {
      etiqueta: 'Ver excusas',
      icono: 'excusas',
      colorTexto: 'text-blue-500',
      colorFondo: 'bg-blue-50',
      ruta: '/excusas',
    },
  ];

  protected readonly atencion = computed<AtencionCard[]>(() => [
    {
      etiqueta: 'No han llegado',
      valor: this.ausencias(),
      descripcion: 'Estudiantes',
      colorTexto: 'text-red-500',
      colorFondo: 'bg-red-50',
      icono: 'persona',
    },
    {
      etiqueta: 'Llegadas tarde',
      valor: this.tardanzas(),
      descripcion: 'Estudiantes',
      colorTexto: 'text-amber-500',
      colorFondo: 'bg-amber-50',
      icono: 'reloj',
    },
    {
      etiqueta: 'Excusas pendientes',
      valor: this.excusasPendientes(),
      descripcion: 'Por aprobar',
      colorTexto: 'text-blue-500',
      colorFondo: 'bg-blue-50',
      icono: 'documento',
    },
  ]);

  constructor() {
    this.cargarResumen();
  }

  ejecutarAccion(accion: AccionRapida): void {
    this.router.navigateByUrl(accion.ruta);
  }

  irAAsistencias(): void {
    this.router.navigateByUrl('/asistencias');
  }

  cerrarBanner(): void {
    this.bannerVisible.set(false);
  }

  private cargarResumen(): void {
    this.cargando.set(true);
    this.error.set(null);

    this.asistenciaService.obtenerResumen().subscribe({
      next: (resumen) => {
        this.resumenAsistencia.set(resumen);
        this.cargando.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar el resumen de asistencia de hoy.');
        this.cargando.set(false);
      },
    });

    this.excusasService.obtenerResumen().subscribe({
      next: (resumen) => this.resumenExcusas.set(resumen),
      error: () => {},
    });
  }
}
