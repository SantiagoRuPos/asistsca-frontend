import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ContadorAsistencia {
  valor: number;
  porcentaje: number;
}

export interface ResumenAsistencia {
  fecha: string;
  totalMatriculados: number;
  entraron: ContadorAsistencia;
  tardanzas: ContadorAsistencia;
  ausencias: ContadorAsistencia;
  salieron: ContadorAsistencia;
}

export interface RegistroAsistenciaDiaria {
  id: string;
  fecha: string;
  estudiante: { id: string; nombres: string; apellidos: string; numeroDocumento: string };
  curso: { id: string; nombre: string } | null;
  estado: { codigo: string; nombre: string };
  horaEntrada: string | null;
  horaSalida: string | null;
  salidaAnticipada: boolean;
  puntoRegistro: string | null;
  origen: 'nfc_automatico' | 'correccion_manual';
}

export interface ListaAsistenciaDiaria {
  datos: RegistroAsistenciaDiaria[];
  total: number;
  pagina: number;
  limite: number;
  totalPaginas: number;
}

export type VistaAsistencia = 'hoy' | 'entradas' | 'salidas' | 'historial';

export interface FiltrosAsistencia {
  fecha?: string;
  fechaInicio?: string;
  fechaFin?: string;
  cursoId?: string;
  estado?: string;
  q?: string;
  lectorId?: string;
  vista?: VistaAsistencia;
  pagina?: number;
  limite?: number;
}

export type TipoRegistroManual =
  | 'presente'
  | 'tarde'
  | 'ausente'
  | 'excusado'
  | 'evadido'
  | 'salida'
  | 'entrada'
  | 'encontrado';

export interface RegistrarAsistenciaManual {
  estudianteId: string;
  tipoRegistro: TipoRegistroManual;
  fecha?: string;
  hora?: string;
  observacion: string;
}

export interface EstudianteResumenCurso {
  id: string;
  nombres: string;
  apellidos: string;
}

export interface EstudianteResumenCursoConHora extends EstudianteResumenCurso {
  horaEntrada: string | null;
  puntoRegistro: string | null;
}

export interface GrupoResumenCurso<T> {
  valor: number;
  porcentaje: number;
  estudiantes: T[];
}

export interface ResumenCurso {
  curso: { id: string; nombre: string; jornada: string; director: { nombres: string; apellidos: string } };
  fecha: string;
  totalMatriculados: number;
  llegaron: GrupoResumenCurso<EstudianteResumenCursoConHora>;
  llegaronTarde: GrupoResumenCurso<EstudianteResumenCursoConHora>;
  noHanLlegado: GrupoResumenCurso<EstudianteResumenCurso>;
  evadidos: GrupoResumenCurso<EstudianteResumenCurso>;
}

@Injectable({ providedIn: 'root' })
export class AsistenciaService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/asistencia`;

  obtenerResumen(fecha?: string): Observable<ResumenAsistencia> {
    let params = new HttpParams();
    if (fecha) params = params.set('fecha', fecha);
    return this.http.get<ResumenAsistencia>(`${this.baseUrl}/resumen`, { params });
  }

  listarDiaria(filtros: FiltrosAsistencia): Observable<ListaAsistenciaDiaria> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor !== undefined && valor !== null && valor !== '') {
        params = params.set(clave, String(valor));
      }
    }
    return this.http.get<ListaAsistenciaDiaria>(`${this.baseUrl}/diaria`, { params });
  }

  registrarManual(dto: RegistrarAsistenciaManual): Observable<RegistroAsistenciaDiaria> {
    return this.http.post<RegistroAsistenciaDiaria>(`${this.baseUrl}/diaria/manual`, dto);
  }

  // (2026-09-25) Deshace la corrección manual más reciente de HOY para un
  // estudiante (ver AsistenciaService.deshacerRegistroManual en el
  // backend) -- pensado para revertir un clic equivocado en Carnets.
  deshacerRegistroManual(estudianteId: string): Observable<{ eliminado: boolean; registro: RegistroAsistenciaDiaria | null }> {
    return this.http.post<{ eliminado: boolean; registro: RegistroAsistenciaDiaria | null }>(`${this.baseUrl}/diaria/deshacer`, {
      estudianteId,
    });
  }

  obtenerResumenCurso(cursoId: string, fecha?: string): Observable<ResumenCurso> {
    let params = new HttpParams();
    if (fecha) params = params.set('fecha', fecha);
    return this.http.get<ResumenCurso>(`${this.baseUrl}/curso/${cursoId}/resumen`, { params });
  }
}
