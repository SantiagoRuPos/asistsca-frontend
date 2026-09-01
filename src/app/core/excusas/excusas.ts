import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type CodigoEstadoExcusa = 'pendiente' | 'aprobada' | 'rechazada';

export interface ExcusaListado {
  id: string;
  estudiante: { id: string; nombres: string; apellidos: string; tipoDocumento: string; numeroDocumento: string };
  curso: { id: string; nombre: string } | null;
  fechaAusencia: string;
  motivo: string;
  tipoExcusa: string;
  archivoSoporteUrl: string | null;
  archivoSoporteNombre: string | null;
  estado: { codigo: CodigoEstadoExcusa; nombre: string };
  fechaRegistro: string;
}

export interface ListaExcusas {
  datos: ExcusaListado[];
  total: number;
  pagina: number;
  limite: number;
  totalPaginas: number;
}

export interface FiltrosExcusas {
  q?: string;
  cursoId?: string;
  estado?: CodigoEstadoExcusa;
  fechaInicio?: string;
  fechaFin?: string;
  pagina?: number;
  limite?: number;
}

export interface ResumenExcusas {
  pendientes: number;
  aprobadas: number;
  negadas: number;
  total: number;
}

export interface CrearExcusa {
  estudianteId: string;
  fechaAusencia: string;
  motivo: string;
  tipoExcusa: string;
  archivoSoporteUrl?: string;
  archivoSoporteNombre?: string;
}

export interface AdjuntoSubido {
  url: string;
  nombre: string;
}

@Injectable({ providedIn: 'root' })
export class ExcusasService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/excusas`;

  listar(filtros: FiltrosExcusas): Observable<ListaExcusas> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor !== undefined && valor !== null && valor !== '') {
        params = params.set(clave, String(valor));
      }
    }
    return this.http.get<ListaExcusas>(this.baseUrl, { params });
  }

  obtenerResumen(): Observable<ResumenExcusas> {
    return this.http.get<ResumenExcusas>(`${this.baseUrl}/resumen`);
  }

  crear(dto: CrearExcusa): Observable<ExcusaListado> {
    return this.http.post<ExcusaListado>(this.baseUrl, dto);
  }

  aprobar(id: string): Observable<unknown> {
    return this.http.patch(`${this.baseUrl}/${id}/aprobar`, {});
  }

  rechazar(id: string): Observable<unknown> {
    return this.http.patch(`${this.baseUrl}/${id}/rechazar`, {});
  }

  subirAdjunto(archivo: File): Observable<AdjuntoSubido> {
    const formData = new FormData();
    formData.append('archivo', archivo, archivo.name);
    return this.http.post<AdjuntoSubido>(`${this.baseUrl}/adjuntos`, formData);
  }

  descargarAdjunto(url: string): Observable<Blob> {
    return this.http.get(`${environment.apiUrl}${url}`, { responseType: 'blob' });
  }
}
