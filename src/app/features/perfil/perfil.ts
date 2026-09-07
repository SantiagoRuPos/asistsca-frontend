import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth/auth';
import { MiPerfil, UsuariosService } from '../../core/usuarios/usuarios';

// Misma política que exige el backend (CambiarPasswordDto): al menos 10
// caracteres, mayúscula, minúscula, número y símbolo — se valida también acá
// para avisar de inmediato en el formulario, en vez de esperar la respuesta
// del servidor.
const PATRON_PASSWORD_SEGURA = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+/;

function passwordsCoincidenValidator(): ValidatorFn {
  return (grupo): ValidationErrors | null => {
    const nueva = grupo.get('passwordNueva')?.value;
    const confirmacion = grupo.get('confirmarPassword')?.value;
    return nueva && confirmacion && nueva !== confirmacion ? { noCoinciden: true } : null;
  };
}

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './perfil.html',
})
export class PerfilComponent {
  private readonly usuariosService = inject(UsuariosService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly perfil = signal<MiPerfil | null>(null);

  // Llegó por la redirección forzada del guard (contraseña temporal
  // pendiente de cambiar) — ver cambiar-password-guard.ts.
  protected readonly cambioForzado = signal(this.route.snapshot.queryParamMap.get('forzado') === '1');

  protected readonly guardando = signal(false);
  protected readonly errorPassword = signal<string | null>(null);
  protected readonly exitoPassword = signal(false);

  protected formatearFecha(iso: string | null): string {
    if (!iso) return 'Este es tu primer ingreso';
    return new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  }

  protected readonly etiquetaRol = computed(() => {
    const nombres: Record<string, string> = {
      admin: 'Administrador',
      rector: 'Rector',
      coordinador: 'Coordinador',
      profesor: 'Profesor',
    };
    const rol = this.perfil()?.rol.nombre;
    return rol ? (nombres[rol] ?? rol) : '';
  });

  protected readonly mostrarPasswordActual = signal(false);
  protected readonly mostrarPasswordNueva = signal(false);

  protected readonly form = this.fb.nonNullable.group(
    {
      passwordActual: ['', [Validators.required]],
      passwordNueva: ['', [Validators.required, Validators.minLength(10), Validators.pattern(PATRON_PASSWORD_SEGURA)]],
      confirmarPassword: ['', [Validators.required]],
    },
    { validators: passwordsCoincidenValidator() },
  );

  constructor() {
    this.cargar();
  }

  private cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.usuariosService.obtenerMiPerfil().subscribe({
      next: (perfil) => {
        this.perfil.set(perfil);
        this.cargando.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar tu perfil. Intenta recargar la página.');
        this.cargando.set(false);
      },
    });
  }

  alternarPasswordActual(): void {
    this.mostrarPasswordActual.update((v) => !v);
  }

  alternarPasswordNueva(): void {
    this.mostrarPasswordNueva.update((v) => !v);
  }

  guardarPassword(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.guardando.set(true);
    this.errorPassword.set(null);
    this.exitoPassword.set(false);

    const { passwordActual, passwordNueva } = this.form.getRawValue();

    this.usuariosService.cambiarMiPassword({ passwordActual, passwordNueva }).subscribe({
      next: () => {
        this.guardando.set(false);
        this.exitoPassword.set(true);
        this.form.reset();
        // El backend ya no exige el cambio — se refleja de una vez en la
        // sesión actual sin esperar a que el access token se renueve solo.
        this.authService.marcarPasswordActualizada();
        this.perfil.update((actual) => (actual ? { ...actual, debeCambiarPassword: false } : actual));

        if (this.cambioForzado()) {
          this.cambioForzado.set(false);
          setTimeout(() => this.router.navigate(['/resumen']), 1500);
        }
      },
      error: (error: HttpErrorResponse) => {
        this.guardando.set(false);
        this.errorPassword.set(error.error?.message ?? 'No se pudo cambiar la contraseña.');
      },
    });
  }
}
