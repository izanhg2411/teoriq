// Normalización de texto y claves estables de pregunta.

/** Minúsculas, sin tildes, sin signos, espacios colapsados. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Texto visible limpio (para mostrar), sin tocar mayúsculas ni tildes. */
export function clean(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/** Hash FNV-1a de 53 bits (suficiente para claves locales; no criptográfico). */
export function hash(s: string): string {
  let h1 = 0xdeadbeef ^ s.length;
  let h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Clave de pregunta: enunciado + opciones ORDENADAS (la plataforma puede barajarlas).
 * Limitación conocida: dos preguntas con imagen distinta pero mismo texto y mismas opciones
 * compartirán clave hasta que se conozca el DOM de las imágenes.
 */
export function questionKey(platform: string, stem: string, options: string[]): string {
  const opts = options.map(normalize).sort().join('|');
  return `${platform}:${hash(`${normalize(stem)}##${opts}`)}`;
}
