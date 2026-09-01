import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Estado {
  id: string;
  categoria: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
}

@Injectable({ providedIn: 'root' })
export class CatalogosService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/catalogos`;

  listarEstados(categoria: string): Observable<Estado[]> {
    const params = new HttpParams().set('categoria', categoria);
    return this.http.get<Estado[]>(`${this.baseUrl}/estados`, { params });
  }
}
