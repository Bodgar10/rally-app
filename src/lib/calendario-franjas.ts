/**
 * RALLY · La lógica de la vista cronológica
 *
 * Estaba dentro de `calendario.tsx`, que solo pintaba el domingo. Sale aquí
 * porque el viernes y el sábado necesitan exactamente lo mismo y una segunda
 * copia habría divergido — y porque desde una pantalla no se puede probar.
 *
 * LOS HUECOS SON EL DATO
 *   Una franja vacía no se omite: se muestra. En Cimepa el viernes de 14:00 a
 *   17:00 solo trabajaron 3 de 8 canchas, y ese dato el organizador no lo tuvo
 *   nunca. No es necesariamente un error —a esa hora la gente trabaja— pero es
 *   suyo para decidirlo, y para eso hay que enseñárselo.
 */

/** Un partido con hora, tal como lo pinta la vista. */
export interface FilaCalendario {
  id: string;
  categoriaId: string;
  categoria: string;
  stage: string;
  etapa: string;
  cancha: string;
  hora: string;
  horaMin: number;
  /** El timestamptz crudo, para quien tenga que reformatearlo. */
  iso: string;
  parejaAId: string | null;
  parejaBId: string | null;
  parejaA: string | null;
  parejaB: string | null;
  estado: 'scheduled' | 'in_progress' | 'finished';
  /** Ids, para detectar choques reales. */
  jugadores: string[];
}

/** Un tramo de la vista: partidos seguidos de la misma categoría y ronda. */
export interface BloqueFranja {
  clave: string;
  categoria: string;
  etapa: string;
  canchas: string;
  filas: FilaCalendario[];
}

export interface Franja {
  hora: string;
  filas: FilaCalendario[];
  /** Canchas distintas ocupadas en esta franja. */
  ocupadas: number;
}

/** Cada cuánto se dibuja una franja. Media hora es el paso del scheduler. */
export const PASO_FRANJA = 30;

const aMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const fmt = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * El día partido en franjas de media hora, de la primera a la última CON
 * partidos.
 *
 * Las intermedias vacías se conservan: son el hueco, y verlo es el punto.
 */
export function agruparPorHora(filas: FilaCalendario[]): Franja[] {
  if (filas.length === 0) return [];

  const porHora = new Map<string, FilaCalendario[]>();
  for (const f of filas) {
    const ya = porHora.get(f.hora);
    if (ya) ya.push(f); else porHora.set(f.hora, [f]);
  }

  const horas = [...porHora.keys()].map(aMin).sort((a, b) => a - b);
  const salida: Franja[] = [];
  for (let m = horas[0]; m <= horas[horas.length - 1]; m += PASO_FRANJA) {
    const h = fmt(m);
    const suyas = (porHora.get(h) ?? []).sort(
      (a, b) => a.categoria.localeCompare(b.categoria) || a.cancha.localeCompare(b.cancha, 'es', { numeric: true }),
    );
    salida.push({ hora: h, filas: suyas, ocupadas: new Set(suyas.map((f) => f.cancha)).size });
  }
  return salida;
}

/**
 * Dentro de una franja, junta los partidos de la misma categoría y ronda.
 *
 * Ocho octavos de 5ª Fuerza a la misma hora eran ocho tarjetas idénticas que
 * llenaban la pantalla sin decir nada que no dijera una.
 */
export function agruparEnBloques(filas: FilaCalendario[]): BloqueFranja[] {
  const porRonda = new Map<string, FilaCalendario[]>();
  for (const f of filas) {
    const k = `${f.categoriaId}#${f.stage}`;
    const ya = porRonda.get(k);
    if (ya) ya.push(f); else porRonda.set(k, [f]);
  }

  return [...porRonda.entries()].map(([clave, fs]) => {
    const ordenadas = [...fs].sort((a, b) => a.cancha.localeCompare(b.cancha, 'es', { numeric: true }));
    return {
      clave,
      categoria: ordenadas[0].categoria,
      etapa: ordenadas[0].etapa,
      canchas: resumirCanchas(ordenadas.map((f) => f.cancha)),
      filas: ordenadas,
    };
  }).sort((a, b) => a.categoria.localeCompare(b.categoria) || a.clave.localeCompare(b.clave));
}

/** ['Cancha 1','Cancha 2','Cancha 3'] → 'Canchas 1-3'. Sin rango, las lista. */
export function resumirCanchas(etiquetas: string[]): string {
  if (etiquetas.length === 0) return '';
  if (etiquetas.length === 1) return etiquetas[0];

  const nums = etiquetas
    .map((e) => Number(/(\d+)/.exec(e)?.[1] ?? NaN))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);

  // Solo se colapsa si son consecutivas: 'Canchas 1-8' tiene que significar
  // las ocho, no "de la 1 a la 8, algunas".
  const consecutivas =
    nums.length === etiquetas.length &&
    nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);

  return consecutivas
    ? `Canchas ${nums[0]}-${nums[nums.length - 1]}`
    : etiquetas.join(', ');
}

/**
 * "3 de 8 canchas". La frase que pone número al hueco.
 *
 * Sin el total no se puede: "3 canchas" suena a mucho o a poco según cuántas
 * haya, y el organizador necesita el cociente para decidir si le sobra sitio.
 */
export function fraseOcupacion(ocupadas: number, canchas: number | null): string {
  if (ocupadas === 0) return 'Sin partidos';
  if (!canchas || canchas <= 0) return `${ocupadas} ${ocupadas === 1 ? 'cancha' : 'canchas'}`;
  return `${ocupadas} de ${canchas} ${canchas === 1 ? 'cancha' : 'canchas'}`;
}

/** True si la franja deja más de la mitad de las canchas paradas. */
export function esHuecoNotable(ocupadas: number, canchas: number | null): boolean {
  if (!canchas || canchas <= 0) return false;
  return ocupadas > 0 && ocupadas * 2 <= canchas;
}
