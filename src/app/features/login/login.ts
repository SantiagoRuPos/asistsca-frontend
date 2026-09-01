import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ThemeService } from '../../core/theme/theme.service';
import { AuthService } from '../../core/auth/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginComponent {
  protected readonly themeService = inject(ThemeService);
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly mostrarPassword = signal(false);
  protected readonly cargando = signal(false);
  protected readonly errorLogin = signal<string | null>(null);

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    recordarme: [false],
  });

  alternarPassword(): void {
    this.mostrarPassword.update((v) => !v);
  }

  enviar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorLogin.set(null);
    this.cargando.set(true);

    const { email, password } = this.form.getRawValue();

    this.authService.login(email!, password!).subscribe({
      next: () => {
        this.cargando.set(false);
        this.router.navigate(['/']);
      },
      error: (error) => {
        this.cargando.set(false);
        this.errorLogin.set(error.error?.message ?? 'No se pudo iniciar sesión. Intenta de nuevo.');
      },
    });
  }
}