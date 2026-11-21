/**
 * Fechas en la hora local del gimnasio.
 *
 * El cliente manda fecha y hora "de pared" (lo que ve en el calendario) y la
 * base guarda instantes en UTC. Toda conversión pasa por acá para no depender
 * de la zona horaria del servidor (en producción suele ser UTC).
 */
export const ZONA_HORARIA = 'America/El_Salvador';

/** El Salvador no usa horario de verano: el desfase es fijo. */
const DESFASE = '-06:00';

/** "2026-11-10" + "07:30" en hora de El Salvador -> instante (Date). */
export function aFechaLocal(fecha: string, hora: string): Date {
  return new Date(`${fecha}T${hora}:00${DESFASE}`);
}

/** Fecha de hoy (AAAA-MM-DD) en hora de El Salvador. */
export function hoyLocal(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

/** true si es AAAA-MM-DD y existe en el calendario (rechaza 2026-02-30). */
export function esFechaValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const fechaUtc = new Date(`${fecha}T00:00:00Z`);
  return (
    !Number.isNaN(fechaUtc.getTime()) &&
    fechaUtc.toISOString().slice(0, 10) === fecha
  );
}

/** Suma (o resta) días a una fecha AAAA-MM-DD. */
export function sumarDias(fecha: string, dias: number): string {
  const fechaUtc = new Date(`${fecha}T00:00:00Z`);
  fechaUtc.setUTCDate(fechaUtc.getUTCDate() + dias);
  return fechaUtc.toISOString().slice(0, 10);
}

/** Lunes de la semana a la que pertenece la fecha. */
export function lunesDe(fecha: string): string {
  const diaSemana = new Date(`${fecha}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return sumarDias(fecha, -((diaSemana + 6) % 7));
}

/** Rango [lunes 00:00, lunes siguiente 00:00) de la semana, en hora local. */
export function rangoDeSemana(fecha: string): { desde: Date; hasta: Date } {
  const lunes = lunesDe(fecha);
  return {
    desde: aFechaLocal(lunes, '00:00'),
    hasta: aFechaLocal(sumarDias(lunes, 7), '00:00'),
  };
}