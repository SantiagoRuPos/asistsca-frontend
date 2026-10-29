import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  AcademicoService,
  AcudienteListado,
  EstudianteMatriculado,
  FiltrosAcudientes,
  ListaAcudientes,
} from '../../core/academico/academico';

@Component({
  selector: 'app-acudientes',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './acudientes.html',
})
export class AcudientesComponent {
  private readonly academicoService = inject(AcademicoService);
  private readonly fb = inject(FormBuilder);

  protected readonly parentescos: { valor: 'padre' | 'madre' | 'tutor' | 'otro'; etiqueta: string }[] = [
    { valor: 'padre', etiqueta: 'Padre' },
    { valor: 'madre', etiqueta: 'Madre' },
    { valor: 'tutor', etiqueta: 'Tutor' },
    { valor: 'otro', etiqueta: 'Otro' },
  ];

  protected readonly lista = signal<ListaAcudientes | null>(null);
  protected readonly cargandoLista = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly estudiantesMatriculados = signal<EstudianteMatriculado[]>([]);

  protected readonly busquedaInput = signal('');
  protected readonly pagina = signal(1);
  protected readonly limite = 10;

  protected readonly mostrarModalCrear = signal(false);
  protected readonly guardandoCrear = signal(false);
  protected readonly errorCrear = signal<string | null>(null);

  protected readonly acudienteEditando = signal<AcudienteListado | null>(null);
  protected readonly guardandoEditar = signal(false);
  protected readonly errorEditar = signal<string | null>(null);

  protected readonly togglingContacto = signal<string | null>(null);
  protected readonly togglingAutorizacion = signal<string | null>(null);

  // (2026-09-25) Vincular un acudiente ya existente a un estudiante
  // adicional -- el caso de hermanos/sobrinos que comparten el mismo
  // acudiente, sin duplicar sus datos de contacto creando uno nuevo.
  protected readonly acudienteVinculando = signal<AcudienteListado | null>(null);
  protected readonly guardandoVincular = signal(false);
  protected readonly errorVincular = signal<string | null>(null);

  protected readonly formularioVincular = this.fb.group({
    estudianteId: ['', Validators.required],
  });

  // Se excluyen los estudiantes que ya están vinculados a este acudiente
  // (el backend igual lo valida con 409, pero así no se deja ni intentar).
  protected readonly estudiantesDisponiblesParaVincular = computed(() => {
    const acudiente = this.acudienteVinculando();
    if (!acudiente) return [];
    const yaVinculados = new Set(acudiente.estudiantes.map((e) => e.id));
    return this.estudiantesMatriculados().filter((e) => !yaVinculados.has(e.id));
  });

  protected readonly formularioCrear = this.fb.group({
    nombres: ['', [Validators.required, Validators.maxLength(120)]],
    apellidos: ['', [Validators.required, Validators.maxLength(120)]],
    parentesco: this.fb.nonNullable.control<'padre' | 'madre' | 'tutor' | 'otro'>('padre', Validators.required),
    telefonoWhatsapp: ['', [Validators.required, Validators.maxLength(30)]],
    email: ['', Validators.email],
    numeroDocumento: ['', Validators.maxLength(30)],
    estudianteId: [''],
  });

  protected readonly formularioEditar = this.fb.group({
    nombres: ['', [Validators.required, Validators.maxLength(120)]],
    apellidos: ['', [Validators.required, Validators.maxLength(120)]],
    parentesco: this.fb.nonNullable.control<'padre' | 'madre' | 'tutor' | 'otro'>('padre', Validators.required),
    telefonoWhatsapp: ['', [Validators.required, Validators.maxLength(30)]],
    email: ['', Validators.email],
    numeroDocumento: ['', Validators.maxLength(30)],
  });

  constructor() {
    this.cargarLista();
    this.academicoService.listarEstudiantesMatriculados().subscribe({
      next: (estudiantes) => this.estudiantesMatriculados.set(estudiantes),
      error: () => {},
    });
  }

  buscar(): void {
    this.pagina.set(1);
    this.cargarLista();
  }

  limpiarFiltros(): void {
    this.busquedaInput.set('');
    this.pagina.set(1);
    this.cargarLista();
  }

  irAPagina(pagina: number | '...'): void {
    if (pagina === '...') return;
    this.pagina.set(pagina);
    this.cargarLista();
  }

  paginaAnterior(): void {
    if (this.pagina() > 1) {
      this.pagina.update((p) => p - 1);
      this.cargarLista();
    }
  }

  paginaSiguiente(): void {
    const total = this.lista()?.totalPaginas ?? 1;
    if (this.pagina() < total) {
      this.pagina.update((p) => p + 1);
      this.cargarLista();
    }
  }

  protected readonly paginasVisibles = computed<(number | '...')[]>(() => {
    const total = this.lista()?.totalPaginas ?? 1;
    const actual = this.pagina();

    const incluidas = new Set<number>([1, total]);
    for (let n = actual - 1; n <= actual + 1; n++) {
      if (n > 1 && n < total) incluidas.add(n);
    }

    const ordenadas = [...incluidas].sort((a, b) => a - b);
    const resultado: (number | '...')[] = [];
    let anterior = 0;
    for (const n of ordenadas) {
      if (anterior && n - anterior > 1) resultado.push('...');
      resultado.push(n);
      anterior = n;
    }
    return resultado;
  });

  protected rangoMostrado(): string {
    const lista = this.lista();
    if (!lista || lista.total === 0) return '0 de 0';
    const desde = (lista.pagina - 1) * lista.limite + 1;
    const hasta = Math.min(lista.pagina * lista.limite, lista.total);
    return `${desde} a ${hasta} de ${lista.total}`;
  }

  protected iniciales(nombres: string, apellidos: string): string {
    return `${nombres.charAt(0)}${apellidos.charAt(0)}`.toUpperCase();
  }

  protected etiquetaParentesco(valor: string): string {
    return this.parentescos.find((p) => p.valor === valor)?.etiqueta ?? valor;
  }

  abrirModalCrear(): void {
    this.errorCrear.set(null);
    this.formularioCrear.reset({ parentesco: 'padre', estudianteId: '' });
    this.mostrarModalCrear.set(true);
  }

  cerrarModalCrear(): void {
    this.mostrarModalCrear.set(false);
  }

  guardarCrear(): void {
    if (this.formularioCrear.invalid) {
      this.formularioCrear.markAllAsTouched();
      return;
    }

    this.guardandoCrear.set(true);
    this.errorCrear.set(null);

    const valores = this.formularioCrear.getRawValue();

    this.academicoService
      .crearAcudiente({
        nombre: valores.nombres!.trim(),
        apellidos: valores.apellidos!.trim(),
        parentesco: valores.parentesco,
        telefonoWhatsapp: valores.telefonoWhatsapp!.trim(),
        email: valores.email?.trim() || undefined,
        numeroDocumento: valores.numeroDocumento?.trim() || undefined,
        estudianteId: valores.estudianteId || undefined,
      })
      .subscribe({
        next: () => {
          this.guardandoCrear.set(false);
          this.mostrarModalCrear.set(false);
          this.cargarLista();
        },
        error: (error) => {
          this.guardandoCrear.set(false);
          this.errorCrear.set(error.error?.message ?? 'No se pudo registrar el acudiente. Intenta de nuevo.');
        },
      });
  }

  abrirModalEditar(acudiente: AcudienteListado): void {
    this.errorEditar.set(null);
    this.acudienteEditando.set(acudiente);
    this.formularioEditar.reset({
      nombres: acudiente.nombres,
      apellidos: acudiente.apellidos,
      parentesco: (acudiente.parentesco as 'padre' | 'madre' | 'tutor' | 'otro') || 'otro',
      telefonoWhatsapp: acudiente.telefonoWhatsapp,
      email: acudiente.email ?? '',
      numeroDocumento: acudiente.numeroDocumento ?? '',
    });
  }

  cerrarModalEditar(): void {
    this.acudienteEditando.set(null);
  }

  guardarEditar(): void {
    const acudiente = this.acudienteEditando();
    if (!acudiente) return;

    if (this.formularioEditar.invalid) {
      this.formularioEditar.markAllAsTouched();
      return;
    }

    this.guardandoEditar.set(true);
    this.errorEditar.set(null);

    const valores = this.formularioEditar.getRawValue();

    this.academicoService
      .actualizarAcudiente(acudiente.id, {
        nombre: valores.nombres!.trim(),
        apellidos: valores.apellidos!.trim(),
        parentesco: valores.parentesco,
        telefonoWhatsapp: valores.telefonoWhatsapp!.trim(),
        email: valores.email?.trim() || undefined,
        numeroDocumento: valores.numeroDocumento?.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.guardandoEditar.set(false);
          this.acudienteEditando.set(null);
          this.cargarLista();
        },
        error: (error) => {
          this.guardandoEditar.set(false);
          this.errorEditar.set(error.error?.message ?? 'No se pudo actualizar el acudiente. Intenta de nuevo.');
        },
      });
  }

  abrirModalVincular(acudiente: AcudienteListado): void {
    this.errorVincular.set(null);
    this.formularioVincular.reset({ estudianteId: '' });
    this.acudienteVinculando.set(acudiente);
  }

  cerrarModalVincular(): void {
    this.acudienteVinculando.set(null);
  }

  guardarVincular(): void {
    const acudiente = this.acudienteVinculando();
    if (!acudiente) return;

    if (this.formularioVincular.invalid) {
      this.formularioVincular.markAllAsTouched();
      return;
    }

    this.guardandoVincular.set(true);
    this.errorVincular.set(null);
    const estudianteId = this.formularioVincular.getRawValue().estudianteId!;

    this.academicoService.vincularAcudienteExistente(acudiente.id, estudianteId).subscribe({
      next: () => {
        this.guardandoVincular.set(false);
        this.acudienteVinculando.set(null);
        this.cargarLista();
      },
      error: (error) => {
        this.guardandoVincular.set(false);
        this.errorVincular.set(error.error?.message ?? 'No se pudo vincular el acudiente a ese estudiante.');
      },
    });
  }

  toggleAutorizacion(acudiente: AcudienteListado): void {
    this.togglingAutorizacion.set(acudiente.id);

    this.academicoService.actualizarAutorizacionDatos(acudiente.id, !acudiente.autorizacionTratamientoDatos).subscribe({
      next: () => {
        this.togglingAutorizacion.set(null);
        this.cargarLista();
      },
      error: () => {
        this.togglingAutorizacion.set(null);
        this.error.set('No se pudo actualizar la autorización de datos. Intenta de nuevo.');
      },
    });
  }

  toggleContacto(estudianteId: string, acudienteId: string, valorActual: boolean): void {
    const clave = `${estudianteId}-${acudienteId}`;
    this.togglingContacto.set(clave);

    this.academicoService.actualizarContactoNotificacion(estudianteId, acudienteId, !valorActual).subscribe({
      next: () => {
        this.togglingContacto.set(null);
        this.cargarLista();
      },
      error: () => {
        this.togglingContacto.set(null);
        this.error.set('No se pudo actualizar el contacto de notificación. Intenta de nuevo.');
      },
    });
  }

  private cargarLista(): void {
    this.cargandoLista.set(true);
    this.error.set(null);

    const filtros: FiltrosAcudientes = {
      q: this.busquedaInput() || undefined,
      pagina: this.pagina(),
      limite: this.limite,
    };

    this.academicoService.listarAcudientes(filtros).subscribe({
      next: (lista) => {
        this.lista.set(lista);
        this.cargandoLista.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar la lista de acudientes. Intenta de nuevo.');
        this.cargandoLista.set(false);
      },
    });
  }
}
