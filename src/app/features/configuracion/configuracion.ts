import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CrearLector, LectorCreado, LectorNfc, NfcService } from '../../core/nfc/nfc';
import {
  ActualizarConfiguracionWhatsapp,
  ConfiguracionWhatsapp,
  EntornoWhatsapp,
  ResultadoPruebaConexion,
  WhatsappService,
} from '../../core/whatsapp/whatsapp';
import { AuthService } from '../../core/auth/auth';

@Component({
  selector: 'app-configuracion',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './configuracion.html',
})
export class ConfiguracionComponent {
  private readonly nfcService = inject(NfcService);
  private readonly whatsappService = inject(WhatsappService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  protected readonly hoyFormateado = new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  }).format(new Date());

  // El JWT ya trae nombreCompleto (ver AuthService.emitirTokens) — mismo
  // cambio que en shell.ts, cierra el TODO histórico de ambos archivos.
  protected readonly nombreMostrado = computed(() => this.authService.usuario()?.nombreCompleto ?? 'Usuario');
  protected readonly inicialesUsuario = computed(() => this.nombreMostrado().slice(0, 2).toUpperCase());
  protected readonly etiquetaRol = computed(() => {
    const rol = this.authService.usuario()?.rol;
    const nombres: Record<string, string> = {
      admin: 'Administrador',
      rector: 'Rector',
      coordinador: 'Coordinador',
      profesor: 'Profesor',
    };
    return rol ? (nombres[rol] ?? rol) : '';
  });
  protected readonly dropdownUsuarioAbierto = signal(false);

  // --- Lectores NFC ---
  protected readonly cargandoLectores = signal(true);
  protected readonly errorLectores = signal<string | null>(null);
  protected readonly lectores = signal<LectorNfc[]>([]);
  protected readonly mostrarInactivos = signal(false);

  protected readonly lectoresActivos = computed(() => this.lectores().filter((l) => l.estado.codigo === 'activo'));
  protected readonly lectoresInactivos = computed(() => this.lectores().filter((l) => l.estado.codigo !== 'activo'));
  protected readonly lectoresMostrados = computed(() =>
    this.mostrarInactivos() ? this.lectores() : this.lectoresActivos(),
  );

  // --- Indicador de "sin señal" por lector ---
  // Un lector se considera sin señal si nunca ha reportado conexión, o si su
  // último `ultimaConexion` (actualizado por LectorApiKeyGuard en cada evento
  // NFC o consulta a GET /api/health que haga el ESP32) tiene más de 2 minutos.
  // `ahora` se actualiza sola cada 10s para que el indicador cambie de verde a
  // rojo/parpadeante sin depender de que el usuario recargue la pantalla, y la
  // lista de lectores se vuelve a pedir cada 30s para reflejar reconexiones reales.
  private static readonly UMBRAL_SIN_SENAL_MS = 2 * 60 * 1000;
  private readonly destroyRef = inject(DestroyRef);
  protected readonly ahora = signal(Date.now());

  protected readonly sinSenalPorId = computed(() => {
    const ahora = this.ahora();
    const mapa = new Map<string, boolean>();
    for (const lector of this.lectores()) {
      const sinSenal =
        !lector.ultimaConexion ||
        ahora - new Date(lector.ultimaConexion).getTime() > ConfiguracionComponent.UMBRAL_SIN_SENAL_MS;
      mapa.set(lector.id, sinSenal);
    }
    return mapa;
  });

  protected readonly guardandoLector = signal(false);
  protected readonly errorLector = signal<string | null>(null);
  protected readonly lectorCreado = signal<LectorCreado | null>(null);
  protected readonly apiKeyCopiada = signal(false);

  protected readonly formularioLector = this.fb.group({
    nombre: ['', [Validators.required, Validators.maxLength(120)]],
    codigoLector: ['', [Validators.required, Validators.maxLength(60)]],
    descripcionUbicacion: ['', Validators.maxLength(200)],
    descripcion: ['', Validators.maxLength(2000)],
  });

  // --- WhatsApp ---
  protected readonly cargandoWhatsapp = signal(true);
  protected readonly configWhatsapp = signal<ConfiguracionWhatsapp | null>(null);
  protected readonly probandoWhatsapp = signal(false);
  protected readonly resultadoPruebaWhatsapp = signal<ResultadoPruebaConexion | null>(null);

  protected readonly mostrarModalWhatsapp = signal(false);
  protected readonly guardandoWhatsapp = signal(false);
  protected readonly errorModalWhatsapp = signal<string | null>(null);

  protected readonly formularioWhatsapp = this.fb.group({
    entorno: this.fb.nonNullable.control<EntornoWhatsapp>('prueba', Validators.required),
    phoneNumberId: ['', [Validators.required, Validators.maxLength(60)]],
    accessToken: ['', Validators.required],
    apiVersion: ['v21.0', Validators.maxLength(10)],
    plantillaEntrada: ['hello_world', Validators.maxLength(120)],
    idiomaPlantillaEntrada: ['es_CO', Validators.maxLength(10)],
    plantillaSalida: ['hello_world', Validators.maxLength(120)],
    idiomaPlantillaSalida: ['es_CO', Validators.maxLength(10)],
  });

  constructor() {
    this.cargarLectores();
    this.cargarConfigWhatsapp();

    const intervaloReloj = setInterval(() => this.ahora.set(Date.now()), 10_000);
    const intervaloRefresco = setInterval(() => this.actualizarLectoresEnSegundoPlano(), 30_000);
    this.destroyRef.onDestroy(() => {
      clearInterval(intervaloReloj);
      clearInterval(intervaloRefresco);
    });
  }

  @HostListener('document:click')
  cerrarDropdownUsuario(): void {
    this.dropdownUsuarioAbierto.set(false);
  }

  alternarDropdownUsuario(evento: Event): void {
    evento.stopPropagation();
    this.dropdownUsuarioAbierto.update((actual) => !actual);
  }

  cerrarSesion(): void {
    this.authService.logout();
  }

  alternarInactivos(): void {
    this.mostrarInactivos.update((actual) => !actual);
  }

  guardarLector(): void {
    if (this.formularioLector.invalid) {
      this.formularioLector.markAllAsTouched();
      return;
    }

    const valores = this.formularioLector.getRawValue();
    const dto: CrearLector = {
      nombre: valores.nombre!,
      codigoLector: valores.codigoLector!,
      descripcionUbicacion: valores.descripcionUbicacion || undefined,
      descripcion: valores.descripcion || undefined,
    };

    this.errorLector.set(null);
    this.guardandoLector.set(true);
    this.nfcService.crearLector(dto).subscribe({
      next: (creado) => {
        this.guardandoLector.set(false);
        this.lectorCreado.set(creado);
        this.apiKeyCopiada.set(false);
        this.formularioLector.reset({
          nombre: '',
          codigoLector: '',
          descripcionUbicacion: '',
          descripcion: '',
        });
        this.cargarLectores();
      },
      error: (error) => {
        this.guardandoLector.set(false);
        this.errorLector.set(error.error?.message ?? 'No se pudo registrar el lector.');
      },
    });
  }

  cerrarApiKeyModal(): void {
    this.lectorCreado.set(null);
  }

  copiarApiKey(): void {
    const creado = this.lectorCreado();
    if (!creado) return;
    navigator.clipboard
      .writeText(creado.apiKey)
      .then(() => {
        this.apiKeyCopiada.set(true);
        setTimeout(() => this.apiKeyCopiada.set(false), 2000);
      })
      .catch(() => {});
  }

  probarWhatsapp(): void {
    this.probandoWhatsapp.set(true);
    this.resultadoPruebaWhatsapp.set(null);
    this.whatsappService.probarConexion().subscribe({
      next: (resultado) => {
        this.probandoWhatsapp.set(false);
        this.resultadoPruebaWhatsapp.set(resultado);
      },
      error: (error) => {
        this.probandoWhatsapp.set(false);
        this.resultadoPruebaWhatsapp.set({
          exitoso: false,
          mensaje: error.error?.message ?? 'No se pudo probar la conexión.',
        });
      },
    });
  }

  abrirEditarWhatsapp(): void {
    const config = this.configWhatsapp();
    this.formularioWhatsapp.reset({
      entorno: config?.entorno ?? 'prueba',
      phoneNumberId: config?.phoneNumberId ?? '',
      accessToken: '',
      apiVersion: config?.apiVersion ?? 'v21.0',
      plantillaEntrada: config?.plantillaEntrada ?? 'hello_world',
      idiomaPlantillaEntrada: config?.idiomaPlantillaEntrada ?? 'es_CO',
      plantillaSalida: config?.plantillaSalida ?? 'hello_world',
      idiomaPlantillaSalida: config?.idiomaPlantillaSalida ?? 'es_CO',
    });
    this.errorModalWhatsapp.set(null);
    this.mostrarModalWhatsapp.set(true);
  }

  cerrarEditarWhatsapp(): void {
    this.mostrarModalWhatsapp.set(false);
  }

  guardarWhatsapp(): void {
    if (this.formularioWhatsapp.invalid) {
      this.formularioWhatsapp.markAllAsTouched();
      return;
    }

    const valores = this.formularioWhatsapp.getRawValue();
    const dto: ActualizarConfiguracionWhatsapp = {
      entorno: valores.entorno,
      phoneNumberId: valores.phoneNumberId!,
      accessToken: valores.accessToken!,
      apiVersion: valores.apiVersion || undefined,
      plantillaEntrada: valores.plantillaEntrada || undefined,
      idiomaPlantillaEntrada: valores.idiomaPlantillaEntrada || undefined,
      plantillaSalida: valores.plantillaSalida || undefined,
      idiomaPlantillaSalida: valores.idiomaPlantillaSalida || undefined,
    };

    this.errorModalWhatsapp.set(null);
    this.guardandoWhatsapp.set(true);
    this.whatsappService.actualizar(dto).subscribe({
      next: (config) => {
        this.guardandoWhatsapp.set(false);
        this.mostrarModalWhatsapp.set(false);
        this.configWhatsapp.set(config);
        this.resultadoPruebaWhatsapp.set(null);
      },
      error: (error) => {
        this.guardandoWhatsapp.set(false);
        this.errorModalWhatsapp.set(error.error?.message ?? 'No se pudo guardar la configuración.');
      },
    });
  }

  protected iniciales(nombre: string): string {
    return nombre.slice(0, 2).toUpperCase();
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

  private cargarLectores(): void {
    this.cargandoLectores.set(true);
    this.errorLectores.set(null);
    this.nfcService.listarLectores().subscribe({
      next: (lectores) => {
        this.lectores.set(lectores);
        this.cargandoLectores.set(false);
      },
      error: () => {
        this.errorLectores.set('No se pudo cargar la lista de lectores.');
        this.cargandoLectores.set(false);
      },
    });
  }

  // Refresco periódico (cada 30s) para que "última conexión" y el indicador de
  // señal reflejen reconexiones reales sin que el usuario tenga que recargar la
  // pantalla. A diferencia de cargarLectores(), no toca cargandoLectores/errorLectores:
  // un fallo puntual de red en un refresco de fondo no debe hacer parpadear toda
  // la tabla a estado de carga ni tapar la última lista buena con un mensaje de error.
  private actualizarLectoresEnSegundoPlano(): void {
    this.nfcService.listarLectores().subscribe({
      next: (lectores) => this.lectores.set(lectores),
      error: () => {},
    });
  }

  private cargarConfigWhatsapp(): void {
    this.cargandoWhatsapp.set(true);
    this.whatsappService.obtener().subscribe({
      next: (config) => {
        this.configWhatsapp.set(config);
        this.cargandoWhatsapp.set(false);
      },
      error: () => {
        this.cargandoWhatsapp.set(false);
      },
    });
  }
}
