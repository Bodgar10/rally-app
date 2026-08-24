/**
 * RALLY · Búsqueda difusa de sedes
 *
 * Detecta sedes ya existentes con nombre parecido para SUGERIRLAS, nunca para
 * bloquear el alta: dos sedes pueden llamarse igual en países distintos y eso
 * es legítimo. La ciudad es lo que las distingue, y por eso siempre se muestra.
 *
 * Corre en el CLIENTE sobre la lista ya cargada. A la escala de hoy (decenas de
 * sedes, cero en producción hoy mismo) una búsqueda en servidor sería más lenta
 * por la latencia de red, y `pg_trgm` obligaría a introducir la primera
 * extensión de Postgres del proyecto — desproporcionado para este volumen.
 * El camino a servidor está preparado con `venues.name_normalized` (migr. 032).
 *
 * `normalizeVenueName` es la MISMA función que se escribe en esa columna al
 * insertar: si divergieran, la detección de duplicados dejaría de coincidir
 * con lo almacenado.
 */

/**
 * Palabras que no distinguen una sede de otra: casi todas las canchas de padel
 * las llevan. Si no se quitan, "Club Padel Coyoacán" y "Club Padel Satélite"
 * salen como parecidas solo por compartir "club padel".
 */
const GENERICOS = new Set([
  'club', 'padel', 'paddle', 'cancha', 'canchas', 'court', 'courts',
  'deportivo', 'centro', 'complejo', 'sports', 'sport', 'arena', 'the', 'de',
  'del', 'la', 'el', 'los', 'las', 'y',
]);

/** Minúsculas + sin acentos. Mismo juego de caracteres que public.slugify. */
function sinAcentos(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/[áàäâã]/g, 'a')
    .replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i')
    .replace(/[óòöôõ]/g, 'o')
    .replace(/[úùüû]/g, 'u')
    .replace(/ñ/g, 'n')
    .replace(/ç/g, 'c');
}

/**
 * Normaliza el nombre de una sede para comparar y para almacenar.
 * Devuelve cadena vacía si el nombre era solo palabras genéricas.
 */
export function normalizeVenueName(nombre: string): string {
  return sinAcentos(nombre)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 0 && !GENERICOS.has(p))
    .join(' ')
    .trim();
}

/** Bigramas de una cadena. 'padel' -> ['pa','ad','de','el'] */
function bigramas(texto: string): string[] {
  const limpio = texto.replace(/\s+/g, '');
  const out: string[] = [];
  for (let i = 0; i < limpio.length - 1; i++) out.push(limpio.slice(i, i + 2));
  return out;
}

/**
 * Coeficiente de Dice sobre bigramas: 0 = nada que ver, 1 = idénticos.
 * Se eligió frente a Levenshtein porque tolera mejor el reordenamiento de
 * palabras ("Padel Point Sur" vs "Sur Padel Point") y no penaliza la longitud.
 */
export function similitud(a: string, b: string): number {
  if (a === b) return a.length > 0 ? 1 : 0;
  if (!a || !b) return 0;

  const ba = bigramas(a);
  const bb = bigramas(b);
  if (ba.length === 0 || bb.length === 0) return 0;

  // Multiconjunto: cada bigrama de `a` consume como mucho una aparición en `b`.
  const restantes = new Map<string, number>();
  for (const g of bb) restantes.set(g, (restantes.get(g) ?? 0) + 1);

  let comunes = 0;
  for (const g of ba) {
    const n = restantes.get(g) ?? 0;
    if (n > 0) {
      comunes++;
      restantes.set(g, n - 1);
    }
  }

  return (2 * comunes) / (ba.length + bb.length);
}

/** Por debajo de esto, dos nombres no se parecen lo suficiente para sugerir. */
export const UMBRAL_SIMILITUD = 0.5;

/** Antes de este número de caracteres no merece la pena sugerir nada. */
export const MIN_CARACTERES_BUSQUEDA = 3;

export interface VenueParaBuscar {
  id:               string;
  name:             string;
  city:             string;
  name_normalized?: string | null;
}

/**
 * Sedes existentes parecidas al nombre tecleado, de más a menos parecida.
 *
 * Coincide por similitud de bigramas O por contención — "Padel Point" debe
 * sugerir "Padel Point Sur" aunque Dice no llegue al umbral por la diferencia
 * de longitud.
 *
 * Usa `name_normalized` de la fila si existe (lo escribió el alta) y si no
 * normaliza al vuelo, para tolerar sedes sembradas por SQL sin esa columna.
 */
export function findSimilarVenues<T extends VenueParaBuscar>(
  consulta: string,
  sedes: readonly T[],
  limite = 4,
): T[] {
  const q = normalizeVenueName(consulta);
  if (q.length < MIN_CARACTERES_BUSQUEDA) return [];

  return sedes
    .map((sede) => {
      const n = sede.name_normalized?.trim()
        ? sede.name_normalized.trim()
        : normalizeVenueName(sede.name);
      if (!n) return { sede, score: 0 };

      const contiene = n.includes(q) || q.includes(n);
      const score = contiene ? Math.max(0.9, similitud(q, n)) : similitud(q, n);
      return { sede, score };
    })
    .filter((r) => r.score >= UMBRAL_SIMILITUD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite)
    .map((r) => r.sede);
}
