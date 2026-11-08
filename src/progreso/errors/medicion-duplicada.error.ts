export class MedicionDuplicadaError extends Error {
  constructor() {
    super('Ya registraste esta medición en esa fecha');
    this.name = 'MedicionDuplicadaError';
  }
}
