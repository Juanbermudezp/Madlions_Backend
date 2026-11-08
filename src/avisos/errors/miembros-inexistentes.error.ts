export class MiembrosInexistentesError extends Error {
  constructor(public readonly ids: string[]) {
    super(`No existen los miembros: ${ids.join(', ')}`);
    this.name = 'MiembrosInexistentesError';
  }
}
