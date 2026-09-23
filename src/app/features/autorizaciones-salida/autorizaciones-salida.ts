import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  AdjuntoSubido,
  AutorizacionSalidaListado,
  AutorizacionesSalidaService,
  CrearAutorizacionSalida,
  FiltrosAutorizacionesSalida,
} from '../../core/autorizaciones-salida/autorizaciones-salida';
import { AcademicoService, EstudianteMatriculado } from '../../core/academico/academico';
import { AuthService } from '../../core/auth/auth';

// El backend permite el POST a estos roles (ver
// AutorizacionesSalidaController) pero un profesor solo puede autorizar si
// es el director de grupo del curso del estudiante — esa segunda validación
// solo la puede hacer el backend (necesita saber a qué curso pertenece el
// estudiante hoy), así que aquí solo se filtra por rol y cualquier rechazo
// más fino llega como error del servidor.
const ROLES_PERMITIDOS = ['admin', 'rector', 'coordinador', 'profesor'];

interface AcudienteAutorizable {
  id: string;
  nombres: string;
  apellidos: string;
  parentesco: string;
  numeroDocumento: string | null;
}

@Component({
  selector: 'app-autorizaciones-salida',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './autorizaciones-salida.html',
})
export class AutorizacionesSalidaComponent {
  private readonly autorizacionesService = inject(AutorizacionesSalidaService);
  private readonly academicoService = inject(AcademicoService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  protected readonly puedeAutorizar = computed(() => {
    const rol = this.authService.usuario()?.rol;
    return !!rol && ROLES_PERMITIDOS.includes(rol);
  });

  protected readonly hoyIso = this.obtenerFechaHoyIso();

  protected readonly lista = signal<AutorizacionSalidaListado[]>([]);
  protected readonly cargandoLista = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly estudiantes = signal<EstudianteMatriculado[]>([]);

  protected readonly fechaFiltro = signal(this.hoyIso);
  protected readonly busquedaInput = signal('');

  protected readonly listaFiltrada = computed(() => {
    const texto = this.busquedaInput().trim().toLowerCase();
    if (!texto) return this.lista();
    return this.lista().filter((autorizacion) =>
      `${autorizacion.estudiante.nombres} ${autorizacion.estudiante.apellidos}`.toLowerCase().includes(texto),
    );
  });

  protected readonly mostrarModalNueva = signal(false);
  protected readonly guardando = signal(false);
  protected readonly errorModal = signal<string | null>(null);
  protected readonly acudienteEncontrado = signal<AcudienteAutorizable | null>(null);
  protected readonly buscandoAcudiente = signal(false);

  protected readonly archivoSubiendo = signal(false);
  protected readonly archivoSubido = signal<AdjuntoSubido | null>(null);
  protected readonly errorArchivo = signal<string | null>(null);

  protected readonly autorizacionDetalle = signal<AutorizacionSalidaListado | null>(null);
  protected readonly descargandoPdf = signal(false);
  protected readonly accionEnCurso = signal<string | null>(null);
  protected readonly errorAccion = signal<string | null>(null);

  protected readonly formularioAutorizacion = this.fb.group({
    estudianteId: ['', Validators.required],
    fecha: [this.hoyIso, Validators.required],
    horaAutorizada: ['', Validators.required],
    nombrePersonaRecoge: ['', [Validators.required, Validators.maxLength(200)]],
    motivo: ['', [Validators.required, Validators.maxLength(500)]],
  });

  constructor() {
    this.cargarLista();
    this.academicoService
      .listarEstudiantesMatriculados()
      .subscribe({ next: (estudiantes) => this.estudiantes.set(estudiantes), error: () => {} });
  }

  actualizarFecha(valor: string): void {
    this.fechaFiltro.set(valor);
    this.cargarLista();
  }

  actualizarBusqueda(valor: string): void {
    this.busquedaInput.set(valor);
  }

  abrirModalNueva(): void {
    this.formularioAutorizacion.reset({
      estudianteId: '',
      fecha: this.hoyIso,
      horaAutorizada: '',
      nombrePersonaRecoge: '',
      motivo: '',
    });
    this.acudienteEncontrado.set(null);
    this.archivoSubido.set(null);
    this.errorArchivo.set(null);
    this.errorModal.set(null);
    this.mostrarModalNueva.set(true);
  }

  cerrarModalNueva(): void {
    this.mostrarModalNueva.set(false);
  }

  seleccionarEstudiante(estudianteId: string): void {
    this.formularioAutorizacion.patchValue({ estudianteId });
    this.acudienteEncontrado.set(null);
    if (!estudianteId) return;

    this.buscandoAcudiente.set(true);
    this.academicoService.obtenerEstudiante(estudianteId).subscribe({
      next: (detalle) => {
        this.buscandoAcudiente.set(false);
        this.acudienteEncontrado.set(detalle.acudiente ? { ...detalle.acudiente } : null);
        if (!detalle.acudiente) {
          this.errorModal.set('Este estudiante no tiene un acudiente registrado — no se puede autorizar su salida.');
        } else {
          this.errorModal.set(null);
        }
      },
      error: () => {
        this.buscandoAcudiente.set(false);
        this.errorModal.set('No se pudo consultar el acudiente del estudiante.');
      },
    });
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
    this.autorizacionesService.subirAdjunto(archivo).subscribe({
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

  guardarAutorizacion(): void {
    const acudiente = this.acudienteEncontrado();
    if (this.formularioAutorizacion.invalid || !acudiente) {
      this.formularioAutorizacion.markAllAsTouched();
      if (!acudiente) this.errorModal.set('Selecciona un estudiante con acudiente registrado.');
      return;
    }

    const valores = this.formularioAutorizacion.getRawValue();
    const adjunto = this.archivoSubido();
    const dto: CrearAutorizacionSalida = {
      estudianteId: valores.estudianteId!,
      fecha: valores.fecha!,
      horaAutorizada: valores.horaAutorizada!,
      acudienteAutorizaId: acudiente.id,
      nombrePersonaRecoge: valores.nombrePersonaRecoge!,
      motivo: valores.motivo!,
      evidenciaUrl: adjunto?.url,
      evidenciaNombre: adjunto?.nombre,
    };

    this.errorModal.set(null);
    this.guardando.set(true);
    this.autorizacionesService.crear(dto).subscribe({
      next: (creada) => {
        this.guardando.set(false);
        this.mostrarModalNueva.set(false);
        this.cargarLista();
        this.autorizacionDetalle.set(creada);
      },
      error: (error) => {
        this.guardando.set(false);
        this.errorModal.set(error.error?.message ?? 'No se pudo registrar la autorización.');
      },
    });
  }

  verDetalle(autorizacion: AutorizacionSalidaListado): void {
    this.autorizacionDetalle.set(autorizacion);
  }

  cerrarDetalle(): void {
    this.autorizacionDetalle.set(null);
  }

  marcarUtilizada(id: string): void {
    this.errorAccion.set(null);
    this.accionEnCurso.set(id);
    this.autorizacionesService.marcarUtilizada(id).subscribe({
      next: () => {
        this.accionEnCurso.set(null);
        this.cargarLista();
        this.cerrarDetalle();
      },
      error: (error) => {
        this.accionEnCurso.set(null);
        this.errorAccion.set(error.error?.message ?? 'No se pudo marcar la autorización como utilizada.');
      },
    });
  }

  descargarPdf(autorizacion: AutorizacionSalidaListado): void {
    this.descargandoPdf.set(true);
    this.autorizacionesService.descargarPdf(autorizacion.id).subscribe({
      next: (blob) => {
        this.descargandoPdf.set(false);
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = `autorizacion_salida_${autorizacion.estudiante.nombres}_${autorizacion.fecha}.pdf`;
        enlace.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.descargandoPdf.set(false);
        this.errorAccion.set('No se pudo descargar el PDF.');
      },
    });
  }

  verEvidencia(autorizacion: AutorizacionSalidaListado): void {
    if (!autorizacion.evidenciaUrl) return;
    this.autorizacionesService.descargarAdjunto(autorizacion.evidenciaUrl).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      },
      error: () => this.errorAccion.set('No se pudo abrir la evidencia adjunta.'),
    });
  }

  protected iniciales(nombres: string, apellidos: string): string {
    return `${nombres.charAt(0)}${apellidos.charAt(0)}`.toUpperCase();
  }

  protected etiquetaParentesco(parentesco: string): string {
    if (parentesco === 'padre') return 'el padre';
    if (parentesco === 'madre') return 'la madre';
    if (parentesco === 'tutor') return 'el acudiente (tutor legal)';
    return 'el acudiente';
  }

  protected etiquetaEstado(codigo: string): string {
    return codigo === 'utilizada' ? 'Utilizada' : 'Autorizada';
  }

  protected claseEstado(codigo: string): string {
    return codigo === 'utilizada' ? 'bg-gray-100 text-gray-500' : 'bg-green-50 text-green-600';
  }

  protected formatearFecha(fechaIso: string): string {
    const [anio, mes, dia] = fechaIso.split('-').map(Number);
    return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }).format(
      new Date(anio, mes - 1, dia),
    );
  }

  protected textoFormato(autorizacion: AutorizacionSalidaListado): string {
    const documentoAcudiente = autorizacion.acudienteAutoriza.numeroDocumento
      ? `identificado(a) con documento No. ${autorizacion.acudienteAutoriza.numeroDocumento}`
      : 'identificado(a) ante la institución';

    return (
      `El estudiante de nombre ${autorizacion.estudiante.nombres} ${autorizacion.estudiante.apellidos} tiene permiso de ` +
      `${this.etiquetaParentesco(autorizacion.acudienteAutoriza.parentesco)}, ${autorizacion.acudienteAutoriza.nombres} ` +
      `${autorizacion.acudienteAutoriza.apellidos}, ${documentoAcudiente}, de salir temprano de la institución el día ` +
      `${this.formatearFecha(autorizacion.fecha)} a las ${autorizacion.horaAutorizada} con motivo de: ${autorizacion.motivo}. ` +
      `Persona que recoge al estudiante: ${autorizacion.nombrePersonaRecoge}. Yo, ${autorizacion.autorizadoPorUsuario.nombreCompleto}, ` +
      `apruebo su salida en los términos aquí descritos.`
    );
  }

  private cargarLista(): void {
    this.cargandoLista.set(true);
    this.error.set(null);
    const filtros: FiltrosAutorizacionesSalida = { fecha: this.fechaFiltro() || undefined };
    this.autorizacionesService.listar(filtros).subscribe({
      next: (lista) => {
        this.lista.set(lista);
        this.cargandoLista.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar la lista de autorizaciones.');
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
}
