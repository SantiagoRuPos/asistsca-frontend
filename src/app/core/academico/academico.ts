import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Curso {
  id: string;
  nombre: string;
  anioLectivo: number;
  jornada: string;
  director: { id: string; nombres: string; apellidos: string };
  tieneEstudiantes: boolean;
  cantidadEstudiantes: number;
}

export interface EstudianteMatriculado {
  id: string;
  nombres: string;
  apellidos: string;
  numeroDocumento: string;
  matriculas: { cursoId: string; curso: string; anioLectivo: number }[];
}

export interface ContadorEstudiantes {
  valor: number;
  porcentaje: number;
}

export interface ResumenEstudiantes {
  totalEstudiantes: number;
  totalCursos: number;
  activos: ContadorEstudiantes;
  inactivos: ContadorEstudiantes;
}

export interface EstudianteListado {
  id: string;
  nombres: string;
  apellidos: string;
  tipoDocumento: string;
  numeroDocumento: string;
  fechaNacimiento: string;
  estado: { codigo: string; nombre: string };
  curso: { id: string; nombre: string } | null;
  acudiente: { nombres: string; apellidos: string; telefonoWhatsapp: string } | null;
}

export interface ListaEstudiantes {
  datos: EstudianteListado[];
  total: number;
  pagina: number;
  limite: number;
  totalPaginas: number;
}

export interface FiltrosEstudiantes {
  q?: string;
  cursoId?: string;
  estado?: string;
  pagina?: number;
  limite?: number;
}

export interface DatosEstudiante {
  nombres: string;
  apellidos: string;
  tipoDocumento: string;
  numeroDocumento: string;
  fechaNacimiento: string;
}

export interface DatosMatricula {
  cursoId: string;
  anioLectivo?: number;
}

export interface DatosAcudiente {
  nombres: string;
  apellidos: string;
  parentesco: 'padre' | 'madre' | 'tutor' | 'otro';
  telefonoWhatsapp: string;
  email?: string;
  numeroDocumento?: string;
}

export interface RegistrarEstudianteCompleto {
  estudiante: DatosEstudiante;
  matricula: DatosMatricula;
  acudiente: DatosAcudiente;
}

export interface EstudianteRegistradoRespuesta {
  estudiante: { id: string; nombres: string; apellidos: string };
  matricula: { id: string; cursoId: string; curso: string; anioLectivo: number };
  acudiente: { id: string; nombres: string; apellidos: string };
}

@Injectable({ providedIn: 'root' })
export class AcademicoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/academico`;

  listarCursos(): Observable<Curso[]> {
    return this.http.get<Curso[]>(`${this.baseUrl}/cursos`);
  }

  listarEstudiantesMatriculados(): Observable<EstudianteMatriculado[]> {
    return this.http.get<EstudianteMatriculado[]>(`${this.baseUrl}/estudiantes/matriculados`);
  }

  obtenerResumenEstudiantes(): Observable<ResumenEstudiantes> {
    return this.http.get<ResumenEstudiantes>(`${this.baseUrl}/estudiantes/resumen`);
  }

  listarEstudiantes(filtros: FiltrosEstudiantes): Observable<ListaEstudiantes> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor !== undefined && valor !== null && valor !== '') {
        params = params.set(clave, String(valor));
      }
    }
    return this.http.get<ListaEstudiantes>(`${this.baseUrl}/estudiantes`, { params });
  }

  registrarEstudianteCompleto(dto: RegistrarEstudianteCompleto): Observable<EstudianteRegistradoRespuesta> {
    return this.http.post<EstudianteRegistradoRespuesta>(`${this.baseUrl}/estudiantes/completo`, dto);
  }
}
