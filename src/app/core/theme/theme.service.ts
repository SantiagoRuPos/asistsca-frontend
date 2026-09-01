import { Injectable, signal, effect } from '@angular/core';

export type Tema = 'claro' | 'oscuro';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storageKey = 'asistsca-tema';

  readonly tema = signal<Tema>(this.leerTemaGuardado());

  constructor() {
    effect(() => {
      const esOscuro = this.tema() === 'oscuro';
      document.documentElement.classList.toggle('dark', esOscuro);
      localStorage.setItem(this.storageKey, this.tema());
    });
  }

  alternar(): void {
    this.tema.set(this.tema() === 'claro' ? 'oscuro' : 'claro');
  }

  private leerTemaGuardado(): Tema {
    const guardado = localStorage.getItem(this.storageKey);
    return guardado === 'oscuro' ? 'oscuro' : 'claro';
  }
}