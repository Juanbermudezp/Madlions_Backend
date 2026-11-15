/**
 * Prepara el texto de búsqueda para compararlo con nombre y apellido:
 * minúsculas y sin tildes (á, à, ä, â, ñ...), así "nunez" encuentra a "Núñez".
 *
 * Debe quitar las mismas marcas que el `translate()` de MiembroRepository.
 */
export function normalizarBusqueda(texto: string): string {
    return texto
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300\u0301\u0302\u0303\u0308]/g, '')
        .normalize('NFC')
        .replace(/\s+/g, ' ');
}

/** Escapa los comodines de LIKE (% _ \) para buscarlos como texto. */
export function escaparLike(texto: string): string {
    return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}
