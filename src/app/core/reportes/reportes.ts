import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface InformeArchivo {
  blob: Blob;
  nombreArchivo: string;
}

@Injectable({ providedIn: 'root' })
export class ReportesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/reportes`;

  descargarInformeEstudiante(estudianteId: string, fechaInicio: string, fechaFin: string): Observable<InformeArchivo> {
    const params = new HttpParams()
      .set('estudianteId', estudianteId)
      .set('fechaInicio', fechaInicio)
      .set('fechaFin', fechaFin);
    return this.descargar(`${this.baseUrl}/asistencia/estudiante`, params);
  }

  descargarInformeCurso(cursoId: string, fechaInicio: string, fechaFin: string): Observable<InformeArchivo> {
    const params = new HttpParams().set('cursoId', cursoId).set('fechaInicio', fechaInicio).set('fechaFin', fechaFin);
    return this.descargar(`${this.baseUrl}/asistencia/curso`, params);
  }

  descargarInformeColegio(fechaInicio: string, fechaFin: string): Observable<InformeArchivo> {
    const params = new HttpParams().set('fechaInicio', fechaInicio).set('fechaFin', fechaFin);
    return this.descargar(`${this.baseUrl}/asistencia/colegio`, params);
  }

  // El backend manda el nombre del archivo en Content-Disposition — se lee
  // de ahí en vez de inventar uno en el frontend, para que coincida siempre
  // con el que arma ReportesService (colegio/estudiante/curso + fechas).
  private descargar(url: string, params: HttpParams): Observable<InformeArchivo> {
    return this.http.get(url, { params, responseType: 'blob', observe: 'response' }).pipe(
      map((respuesta) => ({
        blob: respuesta.body as Blob,
        nombreArchivo: this.extraerNombreArchivo(respuesta.headers.get('content-disposition')),
      })),
    );
  }

  // Evita una expresión regular con comillas literales dentro (confunde a
  // algunos verificadores de sintaxis simples) — extraer el nombre a mano es
  // igual de correcto para el formato fijo que manda el backend
  // (`attachment; filename="algo.xlsx"`).
  private extraerNombreArchivo(disposicion: string | null): string {
    const porDefecto = 'informe.xlsx';
    if (!disposicion) return porDefecto;
    const marcador = 'filename=';
    const indice = disposicion.indexOf(marcador);
    if (indice === -1) return porDefecto;
    let nombre = disposicion.slice(indice + marcador.length).trim();
    if (nombre.startsWith('"') && nombre.endsWith('"')) {
      nombre = nombre.slice(1, -1);
    }
    return nombre || porDefecto;
  }
}
