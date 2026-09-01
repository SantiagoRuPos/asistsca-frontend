import { Component, HostListener, computed, inject, signal } from '@angular/core';
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

  // TODO: reemplazar por el nombre real cuando el JWT o /usuarios/me lo provean (mismo TODO que en shell.ts).
  protected readonly nombreMostrado = computed(() => this.authService.usuario()?.email?.split('@')[0] ?? 'Usuario');
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
    plantillaSalida: ['hello_world', Validators.maxLength(120)],
    idiomaPlantilla: ['en_US', Validators.maxLength(10)],
  });

  constructor() {
    this.cargarLectores();
    this.cargarConfigWhatsapp();
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
      plantillaSalida: config?.plantillaSalida ?? 'hello_world',
      idiomaPlantilla: config?.idiomaPlantilla ?? 'en_US',
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
      plantillaSalida: valores.plantillaSalida || undefined,
      idiomaPlantilla: valores.idiomaPlantilla || undefined,
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
