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

export interface ProfesorListado {
  id: string;
  nombres: string;
  apellidos: string;
  numeroDocumento: string;
  estado: { codigo: string; nombre: string };
  cursoDirigido: { id: string; nombre: string } | null;
}

export interface CrearCurso {
  nombre: string;
  anioLectivo?: number;
  profesorDirectorId: string;
  jornada?: 'mañana' | 'tarde' | 'unica';
}

export interface CambiarDirectorCurso {
  profesorDirectorId: string;
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

export interface CrearProfesor {
  nombres: string;
  apellidos: string;
  numeroDocumento: string;
  email: string;
  telefono?: string;
}

export interface ProfesorRegistrado {
  profesor: { id: string; nombres: string; apellidos: string; numeroDocumento: string; email: string };
  usuario: { email: string };
  correoEnviado: boolean;
  passwordTemporal?: string;
  motivoFalloEnvio?: string;
}

export interface EstudianteRegistradoRespuesta {
  estudiante: { id: string; nombres: string; apellidos: string };
  matricula: { id: string; cursoId: string; curso: string; anioLectivo: number };
  acudiente: { id: string; nombres: string; apellidos: string };
}

export interface EstudianteVinculadoAcudiente {
  id: string;
  nombres: string;
  apellidos: string;
  esContactoNotificacion: boolean;
}

export interface AcudienteListado {
  id: string;
  nombres: string;
  apellidos: string;
  parentesco: string;
  telefonoWhatsapp: string;
  email: string | null;
  numeroDocumento: string | null;
  estudiantes: EstudianteVinculadoAcudiente[];
}

export interface ListaAcudientes {
  datos: AcudienteListado[];
  total: number;
  pagina: number;
  limite: number;
  totalPaginas: number;
}

export interface FiltrosAcudientes {
  q?: string;
  pagina?: number;
  limite?: number;
}

export interface CrearAcudiente {
  nombre: string;
  apellidos: string;
  parentesco: 'padre' | 'madre' | 'tutor' | 'otro';
  telefonoWhatsapp: string;
  email?: string;
  numeroDocumento?: string;
  estudianteId?: string;
}

export interface ActualizarAcudiente {
  nombre?: string;
  apellidos?: string;
  parentesco?: 'padre' | 'madre' | 'tutor' | 'otro';
  telefonoWhatsapp?: string;
  email?: string;
  numeroDocumento?: string;
}

export interface EstudianteDetalle {
  id: string;
  nombres: string;
  apellidos: string;
  tipoDocumento: string;
  numeroDocumento: string;
  fechaNacimiento: string;
  estado: { codigo: string; nombre: string };
  curso: { id: string; nombre: string } | null;
  tarjeta: { id: string; uidTarjeta: string } | null;
  acudiente: {
    id: string;
    nombres: string;
    apellidos: string;
    parentesco: string;
    telefonoWhatsapp: string;
    email: string | null;
    numeroDocumento: string | null;
  } | null;
}

export interface ActualizarEstudiante {
  nombres?: string;
  apellidos?: string;
  tipoDocumento?: string;
  numeroDocumento?: string;
  fechaNacimiento?: string;
  estadoCodigo?: 'activo' | 'inactivo';
}

export interface CambiarCursoEstudiante {
  cursoId: string;
}

export interface HorarioCurso {
  id: string;
  diaSemana: number; // 1 (lunes) .. 7 (domingo)
  horaEntrada: string; // HH:mm:ss (como lo devuelve Postgres)
  minutosToleranciaTardanza: number;
  horaSalida: string;
}

export interface CrearHorarioCurso {
  diasSemana: number[];
  horaEntrada: string; // HH:mm
  minutosToleranciaTardanza?: number;
  horaSalida: string; // HH:mm
}

export interface ActualizarHorarioCurso {
  horaEntrada?: string;
  minutosToleranciaTardanza?: number;
  horaSalida?: string;
}

@Injectable({ providedIn: 'root' })
export class AcademicoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/academico`;

  listarCursos(): Observable<Curso[]> {
    return this.http.get<Curso[]>(`${this.baseUrl}/cursos`);
  }

  listarProfesores(): Observable<ProfesorListado[]> {
    return this.http.get<ProfesorListado[]>(`${this.baseUrl}/profesores`);
  }

  crearCurso(dto: CrearCurso): Observable<Curso> {
    return this.http.post<Curso>(`${this.baseUrl}/cursos`, dto);
  }

  cambiarDirectorCurso(cursoId: string, dto: CambiarDirectorCurso): Observable<Curso> {
    return this.http.patch<Curso>(`${this.baseUrl}/cursos/${cursoId}/director`, dto);
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

  // Usado desde la pantalla Usuarios cuando se elige el rol "Profesor" en
  // "Nuevo usuario": crea el registro académico del profesor y su cuenta de
  // acceso (rol profesor) en un solo paso, con contraseña temporal generada
  // y enviada por correo — igual que UsuariosService.registrar() para
  // admin/rector/coordinador.
  crearProfesor(dto: CrearProfesor): Observable<ProfesorRegistrado> {
    return this.http.post<ProfesorRegistrado>(`${this.baseUrl}/profesores`, dto);
  }

  listarAcudientes(filtros: FiltrosAcudientes): Observable<ListaAcudientes> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor !== undefined && valor !== null && valor !== '') {
        params = params.set(clave, String(valor));
      }
    }
    return this.http.get<ListaAcudientes>(`${this.baseUrl}/acudientes`, { params });
  }

  crearAcudiente(dto: CrearAcudiente): Observable<{ id: string; nombres: string; apellidos: string }> {
    return this.http.post<{ id: string; nombres: string; apellidos: string }>(`${this.baseUrl}/acudientes`, dto);
  }

  actualizarAcudiente(id: string, dto: ActualizarAcudiente): Observable<{ id: string; nombres: string; apellidos: string }> {
    return this.http.patch<{ id: string; nombres: string; apellidos: string }>(`${this.baseUrl}/acudientes/${id}`, dto);
  }

  actualizarContactoNotificacion(
    estudianteId: string,
    acudienteId: string,
    esContactoNotificacion: boolean,
  ): Observable<{ estudianteId: string; acudienteId: string; esContactoNotificacion: boolean }> {
    return this.http.patch<{ estudianteId: string; acudienteId: string; esContactoNotificacion: boolean }>(
      `${this.baseUrl}/estudiantes/${estudianteId}/acudientes/${acudienteId}/contacto`,
      { esContactoNotificacion },
    );
  }

  obtenerEstudiante(id: string): Observable<EstudianteDetalle> {
    return this.http.get<EstudianteDetalle>(`${this.baseUrl}/estudiantes/${id}`);
  }

  actualizarEstudiante(id: string, dto: ActualizarEstudiante): Observable<EstudianteDetalle> {
    return this.http.patch<EstudianteDetalle>(`${this.baseUrl}/estudiantes/${id}`, dto);
  }

  cambiarCursoEstudiante(id: string, dto: CambiarCursoEstudiante): Observable<{ id: string }> {
    return this.http.patch<{ id: string }>(`${this.baseUrl}/estudiantes/${id}/curso`, dto);
  }

  listarHorariosCurso(cursoId: string): Observable<HorarioCurso[]> {
    return this.http.get<HorarioCurso[]>(`${this.baseUrl}/cursos/${cursoId}/horarios`);
  }

  crearHorarioCurso(
    cursoId: string,
    dto: CrearHorarioCurso,
  ): Observable<{ creados: HorarioCurso[]; omitidos?: string }> {
    return this.http.post<{ creados: HorarioCurso[]; omitidos?: string }>(
      `${this.baseUrl}/cursos/${cursoId}/horarios`,
      dto,
    );
  }

  actualizarHorarioCurso(cursoId: string, horarioId: string, dto: ActualizarHorarioCurso): Observable<HorarioCurso> {
    return this.http.patch<HorarioCurso>(`${this.baseUrl}/cursos/${cursoId}/horarios/${horarioId}`, dto);
  }

  eliminarHorarioCurso(cursoId: string, horarioId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/cursos/${cursoId}/horarios/${horarioId}`);
  }
}
