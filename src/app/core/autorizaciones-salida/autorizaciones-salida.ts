import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type CodigoEstadoAutorizacionSalida = 'autorizada' | 'utilizada';

export interface AutorizacionSalidaListado {
  id: string;
  estudiante: { id: string; nombres: string; apellidos: string; numeroDocumento: string };
  fecha: string;
  horaAutorizada: string;
  acudienteAutoriza: { id: string; nombres: string; apellidos: string; parentesco: string; numeroDocumento: string | null };
  nombrePersonaRecoge: string;
  motivo: string;
  evidenciaUrl: string | null;
  evidenciaNombre: string | null;
  autorizadoPorUsuario: { id: string; nombreCompleto: string };
  estado: { codigo: CodigoEstadoAutorizacionSalida; nombre: string };
  fechaRegistro: string;
}

export interface FiltrosAutorizacionesSalida {
  estudianteId?: string;
  fecha?: string;
}

export interface CrearAutorizacionSalida {
  estudianteId: string;
  fecha: string;
  horaAutorizada: string;
  acudienteAutorizaId: string;
  nombrePersonaRecoge: string;
  motivo: string;
  evidenciaUrl?: string;
  evidenciaNombre?: string;
}

export interface AdjuntoSubido {
  url: string;
  nombre: string;
}

@Injectable({ providedIn: 'root' })
export class AutorizacionesSalidaService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/autorizaciones-salida`;

  listar(filtros: FiltrosAutorizacionesSalida): Observable<AutorizacionSalidaListado[]> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor !== undefined && valor !== null && valor !== '') {
        params = params.set(clave, String(valor));
      }
    }
    return this.http.get<AutorizacionSalidaListado[]>(this.baseUrl, { params });
  }

  obtener(id: string): Observable<AutorizacionSalidaListado> {
    return this.http.get<AutorizacionSalidaListado>(`${this.baseUrl}/${id}`);
  }

  crear(dto: CrearAutorizacionSalida): Observable<AutorizacionSalidaListado> {
    return this.http.post<AutorizacionSalidaListado>(this.baseUrl, dto);
  }

  marcarUtilizada(id: string): Observable<unknown> {
    return this.http.patch(`${this.baseUrl}/${id}/utilizada`, {});
  }

  subirAdjunto(archivo: File): Observable<AdjuntoSubido> {
    const formData = new FormData();
    formData.append('archivo', archivo, archivo.name);
    return this.http.post<AdjuntoSubido>(`${this.baseUrl}/adjuntos`, formData);
  }

  descargarAdjunto(url: string): Observable<Blob> {
    return this.http.get(`${environment.apiUrl}${url}`, { responseType: 'blob' });
  }

  descargarPdf(id: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${id}/pdf`, { responseType: 'blob' });
  }
}
