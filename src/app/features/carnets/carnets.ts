import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AsignarTarjeta, NfcService, TarjetaDesconocida, TarjetaNfc } from '../../core/nfc/nfc';
import { AcademicoService, EstudianteMatriculado } from '../../core/academico/academico';
import { AsistenciaService, TipoRegistroManual } from '../../core/asistencia/asistencia';
import { AuthService } from '../../core/auth/auth';

type AccionCarnet = 'entrada' | 'salida' | 'evadido';

@Component({
  selector: 'app-carnets',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './carnets.html',
})
export class CarnetsComponent {
  private readonly nfcService = inject(NfcService);
  private readonly academicoService = inject(AcademicoService);
  private readonly asistenciaService = inject(AsistenciaService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  // admin/rector/coordinador ven la gestión completa (tabla + formulario de
  // asignación); profesor ve una versión reducida de solo lectura pensada
  // para registrar asistencia manual (ver registrarDesdeCarnet más abajo).
  protected readonly esGestion = computed(() => {
    const rol = this.authService.usuario()?.rol;
    return rol === 'admin' || rol === 'rector' || rol === 'coordinador';
  });

  // --- Carnets NFC (asociar UID de tarjeta a un estudiante) ---
  protected readonly cargandoTarjetas = signal(true);
  protected readonly errorTarjetas = signal<string | null>(null);
  protected readonly tarjetas = signal<TarjetaNfc[]>([]);
  protected readonly busquedaTarjetas = signal('');

  // Esta pantalla solo asigna/muestra carnets de estudiantes (así se pidió)
  // — el backend (POST /nfc/tarjetas) también admite tipoTitular: 'profesor',
  // pero esa parte no tiene todavía una pantalla propia.
  protected readonly tarjetasEstudiantes = computed(() => this.tarjetas().filter((t) => t.tipoTitular === 'estudiante'));

  protected readonly tarjetasFiltradas = computed(() => {
    const termino = this.busquedaTarjetas().trim().toLowerCase();
    const lista = this.tarjetasEstudiantes();
    if (!termino) return lista;
    return lista.filter((t) => {
      const nombreCompleto = `${t.estudiante?.nombres ?? ''} ${t.estudiante?.apellidos ?? ''}`.toLowerCase();
      return (
        nombreCompleto.includes(termino) ||
        (t.estudiante?.numeroDocumento ?? '').includes(termino) ||
        t.uidTarjeta.toLowerCase().includes(termino)
      );
    });
  });

  // --- Solo admin/rector/coordinador: asignar un carnet nuevo ---
  protected readonly estudiantesMatriculados = signal<EstudianteMatriculado[]>([]);

  // Un estudiante solo puede tener una tarjeta a la vez (el backend lo valida
  // con 409 si se intenta duplicar) — se le oculta del selector en cuanto ya
  // tiene una, en vez de dejar que el intento falle en el servidor.
  protected readonly estudiantesSinTarjeta = computed(() => {
    const conTarjeta = new Set(this.tarjetasEstudiantes().map((t) => t.estudiante?.id).filter(Boolean));
    return this.estudiantesMatriculados().filter((e) => !conTarjeta.has(e.id));
  });

  protected readonly guardandoTarjeta = signal(false);
  protected readonly errorTarjeta = signal<string | null>(null);
  protected readonly tarjetaAsignadaExito = signal(false);

  protected readonly formularioTarjeta = this.fb.group({
    estudianteId: ['', Validators.required],
    uidTarjeta: ['', [Validators.required, Validators.maxLength(40)]],
  });

  // Tarjeta desconocida detectada por refresco periódico (polling): cuando
  // el ESP32 lee un UID que no corresponde a ningún carnet asignado, el
  // backend lo guarda (ver GET /nfc/tarjetas/desconocidas/ultima) para no
  // tener que copiarlo a mano de la tarjeta física. No se autocompleta solo
  // — se ofrece con un botón "Usar este UID" para no pisar lo que la
  // persona ya haya escrito.
  protected readonly tarjetaDesconocida = signal<TarjetaDesconocida | null>(null);
  private uidDescartado: string | null = null;

  protected readonly mostrarBannerTarjetaDesconocida = computed(() => {
    const tarjeta = this.tarjetaDesconocida();
    return !!tarjeta && tarjeta.uidTarjeta !== this.uidDescartado;
  });

  // --- Solo profesor: registrar asistencia manual desde el carnet ---
  // El profesor no elige presente/tarde/ausente/excusado directamente: solo
  // "entrada" (el sistema decide presente o tarde automáticamente, igual que
  // el flujo NFC automático), "salida" y "evadido" — así lo confirmó el
  // usuario. Ver la validación equivalente en el backend
  // (AsistenciaService.registrarManual).
  protected readonly accionEnCurso = signal<string | null>(null);
  protected readonly errorAccion = signal<string | null>(null);
  protected readonly exitoAccion = signal<string | null>(null);

  // (2026-09-25) "Deshacer" el último registro hecho desde esta pantalla --
  // ej. se marcó "Entrada" al estudiante equivocado por accidente. Solo se
  // ofrece justo después de una acción exitosa (no es un historial, es
  // literalmente "deshacer lo que acabo de hacer"); el backend igual
  // valida que de verdad haya algo que deshacer.
  protected readonly ultimaAccion = signal<{ estudianteId: string; nombreEstudiante: string } | null>(null);
  protected readonly deshaciendo = signal(false);

  constructor() {
    this.cargarTarjetas();
    if (this.esGestion()) {
      this.cargarEstudiantesMatriculados();
      this.consultarTarjetaDesconocida();
      const intervaloTarjetaDesconocida = setInterval(() => this.consultarTarjetaDesconocida(), 3_000);
      this.destroyRef.onDestroy(() => clearInterval(intervaloTarjetaDesconocida));
    }
  }

  actualizarBusquedaTarjetas(valor: string): void {
    this.busquedaTarjetas.set(valor);
  }

  guardarTarjeta(): void {
    if (this.formularioTarjeta.invalid) {
      this.formularioTarjeta.markAllAsTouched();
      return;
    }

    const valores = this.formularioTarjeta.getRawValue();
    const dto: AsignarTarjeta = {
      uidTarjeta: valores.uidTarjeta!.trim(),
      tipoTitular: 'estudiante',
      estudianteId: valores.estudianteId!,
    };

    this.errorTarjeta.set(null);
    this.tarjetaAsignadaExito.set(false);
    this.guardandoTarjeta.set(true);
    this.nfcService.asignarTarjeta(dto).subscribe({
      next: () => {
        this.guardandoTarjeta.set(false);
        this.tarjetaAsignadaExito.set(true);
        this.formularioTarjeta.reset({ estudianteId: '', uidTarjeta: '' });
        this.uidDescartado = null;
        this.tarjetaDesconocida.set(null);
        this.cargarTarjetas();
        setTimeout(() => this.tarjetaAsignadaExito.set(false), 3000);
      },
      error: (error) => {
        this.guardandoTarjeta.set(false);
        this.errorTarjeta.set(error.error?.message ?? 'No se pudo asignar el carnet.');
      },
    });
  }

  registrarDesdeCarnet(tarjeta: TarjetaNfc, accion: AccionCarnet): void {
    const estudianteId = tarjeta.estudiante?.id;
    if (!estudianteId) return;

    const nombreEstudiante = `${tarjeta.estudiante?.nombres ?? ''} ${tarjeta.estudiante?.apellidos ?? ''}`.trim();
    const textosExito: Record<AccionCarnet, string> = {
      entrada: `Entrada registrada: ${nombreEstudiante}.`,
      salida: `Salida registrada: ${nombreEstudiante}.`,
      evadido: `${nombreEstudiante} fue marcado como evadido.`,
    };
    const observaciones: Record<AccionCarnet, string> = {
      entrada: 'Entrada registrada desde la pantalla de Carnets.',
      salida: 'Salida registrada desde la pantalla de Carnets.',
      evadido: 'Marcado como evadido desde la pantalla de Carnets.',
    };

    this.errorAccion.set(null);
    this.exitoAccion.set(null);
    this.accionEnCurso.set(`${tarjeta.id}:${accion}`);
    this.asistenciaService
      .registrarManual({
        estudianteId,
        tipoRegistro: accion as TipoRegistroManual,
        observacion: observaciones[accion],
      })
      .subscribe({
        next: () => {
          this.accionEnCurso.set(null);
          this.exitoAccion.set(textosExito[accion]);
          this.ultimaAccion.set({ estudianteId, nombreEstudiante });
          setTimeout(() => this.exitoAccion.set(null), 3000);
        },
        error: (error) => {
          this.accionEnCurso.set(null);
          this.errorAccion.set(error.error?.message ?? 'No se pudo registrar la asistencia.');
        },
      });
  }

  deshacerUltimaAccion(): void {
    const ultima = this.ultimaAccion();
    if (!ultima || this.deshaciendo()) return;

    this.errorAccion.set(null);
    this.exitoAccion.set(null);
    this.deshaciendo.set(true);
    this.asistenciaService.deshacerRegistroManual(ultima.estudianteId).subscribe({
      next: () => {
        this.deshaciendo.set(false);
        this.ultimaAccion.set(null);
        this.exitoAccion.set(`Se deshizo el último registro de ${ultima.nombreEstudiante}.`);
        setTimeout(() => this.exitoAccion.set(null), 3000);
      },
      error: (error) => {
        this.deshaciendo.set(false);
        this.errorAccion.set(error.error?.message ?? 'No se pudo deshacer el registro.');
      },
    });
  }

  protected estaEnCurso(tarjeta: TarjetaNfc, accion: AccionCarnet): boolean {
    return this.accionEnCurso() === `${tarjeta.id}:${accion}`;
  }

  protected iniciales(nombre: string): string {
    return nombre.slice(0, 2).toUpperCase();
  }

  protected usarUidDetectado(): void {
    const tarjeta = this.tarjetaDesconocida();
    if (!tarjeta) return;
    this.formularioTarjeta.patchValue({ uidTarjeta: tarjeta.uidTarjeta });
    this.uidDescartado = tarjeta.uidTarjeta;
  }

  protected descartarUidDetectado(): void {
    const tarjeta = this.tarjetaDesconocida();
    if (tarjeta) this.uidDescartado = tarjeta.uidTarjeta;
  }

  protected segundosDesde(fechaIso: string): number {
    return Math.max(0, Math.round((Date.now() - new Date(fechaIso).getTime()) / 1000));
  }

  protected formatearFechaHora(fechaIso: string | null): string {
    if (!fechaIso) return 'Nunca';
    const instante = new Date(fechaIso);
    const fecha = new Intl.DateTimeFormat('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Bogota',
    }).format(instante);
    const hora = new Intl.DateTimeFormat('es-CO', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Bogota',
    }).format(instante);
    return `${fecha} ${hora}`;
  }

  private cargarTarjetas(): void {
    this.cargandoTarjetas.set(true);
    this.errorTarjetas.set(null);
    this.nfcService.listarTarjetas().subscribe({
      next: (tarjetas) => {
        this.tarjetas.set(tarjetas);
        this.cargandoTarjetas.set(false);
      },
      error: () => {
        this.errorTarjetas.set('No se pudo cargar la lista de carnets.');
        this.cargandoTarjetas.set(false);
      },
    });
  }

  private cargarEstudiantesMatriculados(): void {
    this.academicoService.listarEstudiantesMatriculados().subscribe({
      next: (estudiantes) => this.estudiantesMatriculados.set(estudiantes),
      // Best-effort: si falla, el selector del formulario simplemente queda
      // vacío (no rompe el resto de la pantalla, que no depende de esto).
      error: () => {},
    });
  }

  // Best-effort y silencioso (igual que el refresco de Lectores en
  // Configuración): si falla una consulta puntual, simplemente no se
  // actualiza el banner, no se muestra ningún error en pantalla por esto.
  private consultarTarjetaDesconocida(): void {
    this.nfcService.obtenerUltimaTarjetaDesconocida().subscribe({
      next: (tarjeta) => this.tarjetaDesconocida.set(tarjeta),
      error: () => {},
    });
  }
}
