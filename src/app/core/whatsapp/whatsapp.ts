import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type EntornoWhatsapp = 'prueba' | 'produccion';

export interface ConfiguracionWhatsapp {
  id: string;
  entorno: EntornoWhatsapp;
  phoneNumberId: string;
  accessToken: string;
  apiVersion: string;
  plantillaEntrada: string;
  plantillaSalida: string;
  idiomaPlantilla: string;
  fechaActualizacion: string;
}

export interface ActualizarConfiguracionWhatsapp {
  entorno: EntornoWhatsapp;
  phoneNumberId: string;
  accessToken: string;
  apiVersion?: string;
  plantillaEntrada?: string;
  plantillaSalida?: string;
  idiomaPlantilla?: string;
}

export interface ResultadoPruebaConexion {
  exitoso: boolean;
  mensaje: string;
}

@Injectable({ providedIn: 'root' })
export class WhatsappService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/whatsapp/configuracion`;

  obtener(): Observable<ConfiguracionWhatsapp | null> {
    return this.http.get<ConfiguracionWhatsapp | null>(this.baseUrl);
  }

  actualizar(dto: ActualizarConfiguracionWhatsapp): Observable<ConfiguracionWhatsapp> {
    return this.http.put<ConfiguracionWhatsapp>(this.baseUrl, dto);
  }

  probarConexion(): Observable<ResultadoPruebaConexion> {
    return this.http.get<ResultadoPruebaConexion>(`${this.baseUrl}/probar`);
  }
}
