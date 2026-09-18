/**
 * RALLY · De qué lado juega y con qué mano.
 *
 * DOS PREGUNTAS, UN TOQUE CADA UNA
 *   El onboarding que había pedía tres cosas de golpe en una pantalla propia
 *   que, además, no estaba conectada a ninguna ruta. Un formulario al entrar
 *   frena justo a quien solo quería apuntarse a un torneo.
 *
 *   Estas dos se preguntan de una en una, desde una tarjeta del dashboard, con
 *   botones y sin escribir nada. Y cada una dice qué enciende: eso es lo que
 *   convierte la pregunta en un intercambio en vez de un peaje.
 *
 * POR QUÉ ESTAS Y NO OTRAS
 *   · Se contestan de un toque.
 *   · NADIE MIENTE. Con qué mano juegas se comprueba en el primer punto, al
 *     revés que "¿cuál es tu nivel?", que todo el mundo contesta mal y que
 *     además ya mide Glicko.
 *   · Desbloquean algo que se ve: emparejar, y la ficha del rival.
 *
 * ► LO QUE NO SE PREGUNTA, Y ES DELIBERADO
 *   Edad y género. No se usan en ninguna comprobación —la inscripción no valida
 *   género contra la categoría— y en pádel nadie los pregunta. Un campo que no
 *   se usa solo sirve para quedarse vacío.
 */

export type Lado = 'drive' | 'reves' | 'ambos';
export type Mano = 'diestro' | 'zurdo';

export interface PerfilDeJuego {
  lado: Lado | null;
  mano: Mano | null;
}

export type PreguntaId = 'lado' | 'mano';

export interface Opcion {
  valor: string;
  etiqueta: string;
}

export interface Pregunta {
  id: PreguntaId;
  titulo: string;
  /** Qué enciende al contestarla. Va debajo, en pequeño. */
  porque: string;
  opciones: Opcion[];
}

const PREGUNTAS: Pregunta[] = [
  {
    id: 'lado',
    titulo: '¿De qué lado juegas?',
    porque: 'Para buscarte pareja del lado contrario. Tus rivales lo verán, igual que tú el suyo.',
    opciones: [
      { valor: 'drive', etiqueta: 'Drive' },
      { valor: 'reves', etiqueta: 'Revés' },
      { valor: 'ambos', etiqueta: 'Los dos' },
    ],
  },
  {
    id: 'mano',
    titulo: '¿Con qué mano juegas?',
    porque: 'Sale en la ficha que tus rivales ven antes del partido, igual que la suya.',
    opciones: [
      { valor: 'diestro', etiqueta: 'Diestro' },
      { valor: 'zurdo', etiqueta: 'Zurdo' },
    ],
  },
];

/**
 * La siguiente pregunta pendiente, o null si no queda ninguna.
 *
 * El orden importa: primero el lado, que desbloquea más cosas. Y lo saltado no
 * se vuelve a preguntar en la misma sesión — insistir es la forma más rápida de
 * que alguien aprenda a ignorar la tarjeta.
 */
export function siguientePregunta(
  perfil: PerfilDeJuego,
  saltadas: readonly PreguntaId[] = [],
): Pregunta | null {
  const contestada: Record<PreguntaId, boolean> = {
    lado: perfil.lado !== null,
    mano: perfil.mano !== null,
  };
  return PREGUNTAS.find((p) => !contestada[p.id] && !saltadas.includes(p.id)) ?? null;
}

/** La columna de `users` que escribe cada pregunta. */
export const COLUMNA_DE: Record<PreguntaId, 'preferred_side' | 'mano'> = {
  lado: 'preferred_side',
  mano: 'mano',
};

// ── Cómo se cuenta en la ficha del rival ────────────────────────────────────

const LADO: Record<Lado, string> = { drive: 'drive', reves: 'revés', ambos: 'los dos lados' };
const MANO: Record<Mano, string> = { diestro: 'diestro', zurdo: 'zurdo' };

/**
 * "Zurdo, revés" / "Drive" / null.
 *
 * Con lo que haya. Null cuando no se sabe nada: una línea vacía con el nombre
 * del rival y nada al lado se lee como un dato que falló al cargar.
 */
export function textoDeJugador(perfil: PerfilDeJuego): string | null {
  const partes: string[] = [];
  if (perfil.mano) partes.push(MANO[perfil.mano]);
  if (perfil.lado) partes.push(LADO[perfil.lado]);
  if (partes.length === 0) return null;
  return partes.join(', ').replace(/^./, (c) => c.toUpperCase());
}

/**
 * Lo que hay que saber de la pareja rival, si es que hay algo.
 *
 * ► EL ZURDO DE REVÉS SE DICE APARTE.
 *   En pádel es la configuración más temida: el zurdo en el revés tiene su
 *   derecha hacia el centro y cierra el cruzado que la mayoría busca. Quien
 *   lleva años lo ve en el calentamiento; quien lleva uno, no — y decírselo es
 *   exactamente lo que la ficha tiene que hacer por él.
 */
export function avisoDeLaPareja(a: PerfilDeJuego, b: PerfilDeJuego, nombreA: string, nombreB: string): string | null {
  const zurdoDeReves = (p: PerfilDeJuego, n: string) =>
    p.mano === 'zurdo' && p.lado === 'reves' ? n : null;

  const zurdo = zurdoDeReves(a, nombreA) ?? zurdoDeReves(b, nombreB);
  if (zurdo) return `${zurdo} es zurdo por el revés: te va a cerrar el cruzado.`;

  // Los dos en el mismo lado significa que uno juega fuera de su sitio.
  if (a.lado && a.lado === b.lado && a.lado !== 'ambos') {
    return `Los dos juegan de ${LADO[a.lado]}: uno va a estar fuera de su lado.`;
  }
  return null;
}
