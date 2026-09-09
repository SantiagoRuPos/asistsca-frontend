import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface LectorNfc {
  id: string;
  nombre: string | null;
  codigoLector: string;
  descripcionUbicacion: string | null;
  descripcion: string | null;
  ultimaConexion: string | null;
  fechaRegistro: string;
  estado: { codigo: string; nombre: string };
}

export interface CrearLector {
  nombre: string;
  codigoLector: string;
  descripcionUbicacion?: string;
  descripcion?: string;
}

export interface LectorCreado {
  lector: LectorNfc;
  apiKey: string;
}

export type TipoTitularTarjeta = 'estudiante' | 'profesor';

export interface AsignarTarjeta {
  uidTarjeta: string;
  tipoTitular: TipoTitularTarjeta;
  estudianteId?: string;
  profesorId?: string;
}

export interface CambiarTarjetaEstudiante {
  uidTarjeta: string;
}

export interface TarjetaNfc {
  id: string;
  uidTarjeta: string;
  tipoTitular: TipoTitularTarjeta;
  estado: { codigo: string; nombre: string };
  estudiante: { id: string; nombres: string; apellidos: string; numeroDocumento: string } | null;
  profesor: { id: string; nombres: string; apellidos: string; numeroDocumento: string } | null;
  fechaAsignacion: string;
}

export interface TarjetaDesconocida {
  uidTarjeta: string;
  fechaEscaneo: string;
  lector: { id: string; nombre: string | null; codigoLector: string } | null;
}

@Injectable({ providedIn: 'root' })
export class NfcService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/nfc`;

  listarLectores(): Observable<LectorNfc[]> {
    return this.http.get<LectorNfc[]>(`${this.baseUrl}/lectores`);
  }

  crearLector(dto: CrearLector): Observable<LectorCreado> {
    return this.http.post<LectorCreado>(`${this.baseUrl}/lectores`, dto);
  }

  asignarTarjeta(dto: AsignarTarjeta): Observable<TarjetaNfc> {
    return this.http.post<TarjetaNfc>(`${this.baseUrl}/tarjetas`, dto);
  }

  listarTarjetas(): Observable<TarjetaNfc[]> {
    return this.http.get<TarjetaNfc[]>(`${this.baseUrl}/tarjetas`);
  }

  cambiarTarjetaEstudiante(estudianteId: string, dto: CambiarTarjetaEstudiante): Observable<TarjetaNfc> {
    return this.http.patch<TarjetaNfc>(`${this.baseUrl}/tarjetas/estudiante/${estudianteId}`, dto);
  }

  obtenerUltimaTarjetaDesconocida(): Observable<TarjetaDesconocida | null> {
    return this.http.get<TarjetaDesconocida | null>(`${this.baseUrl}/tarjetas/desconocidas/ultima`);
  }
}
