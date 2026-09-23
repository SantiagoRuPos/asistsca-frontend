import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export type NivelLicencia = 'activa' | 'aviso' | 'degradada';

export interface EstadoLicencia {
  nivel: NivelLicencia;
  bloqueaEscrituras: boolean;
  mensaje: string;
  fingerprintServidor: string;
  diasSinValidarExitosamente: number | null;
  diasRestantesDeGracia: number | null;
  fechaUltimaValidacionExitosa: string | null;
  fechaExpiracionToken: string | null;
  cliente: string | null;
  plan: string | null;
  modulosHabilitados: string[] | null;
}

// Cuánto dura visible el aviso puntual (tipo "toast") de escritura bloqueada
// antes de desaparecer solo.
const DURACION_TOAST_BLOQUEO_MS = 6000;

@Injectable({ providedIn: 'root' })
export class LicenciaService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/licencia`;

  // Estado persistente de la licencia (activa/aviso/degradada). Solo lo
  // consulta ShellComponent, y solo para admin/rector — igual que el backend
  // solo permite esos roles en GET /licencia/estado.
  readonly estado = signal<EstadoLicencia | null>(null);

  // Mensaje puntual cuando una escritura se bloquea por licencia vencida.
  // A diferencia de `estado` de arriba, esto lo puede disparar CUALQUIER rol
  // (lo activa licencia-interceptor.ts en cualquier pantalla): es sobre la
  // propia acción que la persona intentó, no sobre datos de licencia/plan
  // del colegio, así que no hace falta restringirlo por rol.
  readonly mensajeBloqueoReciente = signal<string | null>(null);
  private temporizadorBloqueo: ReturnType<typeof setTimeout> | null = null;

  consultarEstado(): Observable<EstadoLicencia> {
    return this.http
      .get<EstadoLicencia>(`${this.baseUrl}/estado`)
      .pipe(tap((estado) => this.estado.set(estado)));
  }

  /** Lo llama licencia-interceptor.ts al detectar el 403 específico de licencia. */
  registrarBloqueo(mensaje: string): void {
    this.mensajeBloqueoReciente.set(mensaje);
    if (this.temporizadorBloqueo) {
      clearTimeout(this.temporizadorBloqueo);
    }
    this.temporizadorBloqueo = setTimeout(() => {
      this.mensajeBloqueoReciente.set(null);
    }, DURACION_TOAST_BLOQUEO_MS);
  }
}
