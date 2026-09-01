import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type RolUsuario = 'admin' | 'rector' | 'coordinador' | 'profesor';
export type RolRegistrable = 'admin' | 'rector' | 'coordinador';
export type CodigoEstadoUsuario = 'activo' | 'inactivo';

export interface UsuarioListado {
  id: string;
  nombreCompleto: string;
  email: string;
  telefono: string | null;
  rol: { nombre: RolUsuario };
  estado: { codigo: CodigoEstadoUsuario; nombre: string };
  debeCambiarPassword: boolean;
  ultimoLogin: string | null;
  fechaCreacion: string;
}

export interface ListaUsuarios {
  datos: UsuarioListado[];
  total: number;
  pagina: number;
  limite: number;
  totalPaginas: number;
}

export interface FiltrosUsuarios {
  q?: string;
  rol?: RolUsuario;
  estado?: CodigoEstadoUsuario;
  pagina?: number;
  limite?: number;
}

export interface ResumenUsuarios {
  administradores: number;
  rectores: number;
  coordinadores: number;
  profesores: number;
}

export interface RegistrarUsuario {
  nombreCompleto: string;
  email: string;
  telefono?: string;
  rol: RolRegistrable;
}

export interface UsuarioRegistrado {
  usuario: UsuarioListado;
  correoEnviado: boolean;
  passwordTemporal?: string;
  motivoFalloEnvio?: string;
}

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/usuarios`;

  listar(filtros: FiltrosUsuarios): Observable<ListaUsuarios> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor !== undefined && valor !== null && valor !== '') {
        params = params.set(clave, String(valor));
      }
    }
    return this.http.get<ListaUsuarios>(this.baseUrl, { params });
  }

  obtenerResumen(): Observable<ResumenUsuarios> {
    return this.http.get<ResumenUsuarios>(`${this.baseUrl}/resumen`);
  }

  registrar(dto: RegistrarUsuario): Observable<UsuarioRegistrado> {
    return this.http.post<UsuarioRegistrado>(this.baseUrl, dto);
  }

  activar(id: string): Observable<unknown> {
    return this.http.patch(`${this.baseUrl}/${id}/activar`, {});
  }

  desactivar(id: string): Observable<unknown> {
    return this.http.patch(`${this.baseUrl}/${id}/desactivar`, {});
  }
}
