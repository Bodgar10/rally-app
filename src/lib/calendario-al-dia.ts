/**
 * RALLY · ¿Está el calendario al día?
 *
 * POR QUÉ EXISTE
 *   "Reprogramar" era el botón más grande y dorado de la pantalla, y eso
 *   sugería que había que pulsarlo para que las cosas quedaran bien. No es así:
 *   el plan del último día se genera al cerrar inscripciones, vive en
 *   `match_schedule`, y desde las migraciones 061, 066 y 067 los partidos
 *   heredan su hora en las TRES rutas por las que pueden nacer.
 *
 *   Rehacer el calendario es la respuesta a que algo cambió de verdad: se cayó
 *   una cancha, se movió una hora, se corrigió un resultado que reordena el
 *   cuadro. Un botón permanente para eso enseña a pulsarlo por si acaso, que es
 *   justo lo contrario de lo que hace falta.
 *
 *   Así que primero se comprueba, y solo si hay algo se ofrece.
 *
 * QUÉ CUENTA COMO "DESCUADRADO"
 *   Un partido jugable —los dos lados puestos— y todavía por jugar, que no
 *   tiene hora, o que la tiene distinta de la que le reserva el plan. Lo que NO
 *   cuenta:
 *     · los byes, que no ocupan cancha y no tienen hueco;
 *     · lo ya jugado o en curso, porque su hora es un registro de lo que pasó;
 *     · un partido sin hueco en el plan — el plan no cubre esa ronda todavía, y
 *       rehacerlo no lo va a arreglar.
 */

export interface PartidoDelCuadro {
  id: string;
  categoryId: string;
  categoria: string;
  stage: string;
  /** Zero-padded: su orden lexicográfico es el numérico. */
  roundLabel: string | null;
  scheduledAt: string | null;
  pairAId: string | null;
  pairBId: string | null;
  status: 'scheduled' | 'in_progress' | 'finished';
}

export interface SlotDelPlan {
  categoryId: string;
  stage: string;
  slotIndex: number;
  scheduledAt: string;
}

export interface EstadoDelPlan {
  alDia: boolean;
  /** Jugables por jugar, sin hora, teniendo hueco en el plan. */
  sinHora: number;
  /** Jugables por jugar cuya hora no es la del plan. */
  movidos: number;
  /** Total de partidos jugables por jugar que el plan cubre. */
  cubiertos: number;
  /** Categorías afectadas, por nombre, para poder decirlo. */
  categorias: string[];
}

const mismoInstante = (a: string | null, b: string) =>
  a != null && new Date(a).getTime() === new Date(b).getTime();

export function estadoDelPlan(
  partidos: PartidoDelCuadro[],
  plan: SlotDelPlan[],
): EstadoDelPlan {
  // El plan, indexado por (categoría, etapa) y ordenado por slot.
  const porRonda = new Map<string, SlotDelPlan[]>();
  for (const s of plan) {
    const k = `${s.categoryId}#${s.stage}`;
    const ya = porRonda.get(k);
    if (ya) ya.push(s); else porRonda.set(k, [s]);
  }
  for (const arr of porRonda.values()) arr.sort((a, b) => a.slotIndex - b.slotIndex);

  // Los partidos jugables y por jugar, en el mismo orden que el plan: el
  // `round_label` lleva zero-padding justo para que esto funcione.
  const jugables = new Map<string, PartidoDelCuadro[]>();
  for (const p of partidos) {
    if (p.stage === 'group') continue;
    if (!p.pairAId || !p.pairBId) continue;      // bye: no ocupa cancha
    if (p.status !== 'scheduled') continue;      // jugado o en curso: es historia
    const k = `${p.categoryId}#${p.stage}`;
    const ya = jugables.get(k);
    if (ya) ya.push(p); else jugables.set(k, [p]);
  }
  for (const arr of jugables.values()) {
    arr.sort((a, b) => (a.roundLabel ?? '').localeCompare(b.roundLabel ?? ''));
  }

  let sinHora = 0, movidos = 0, cubiertos = 0;
  const categorias = new Set<string>();

  for (const [k, arr] of jugables) {
    const slots = porRonda.get(k);
    if (!slots) continue;   // el plan no cubre esta ronda: rehacerlo no ayuda
    for (let i = 0; i < arr.length && i < slots.length; i++) {
      cubiertos++;
      const p = arr[i];
      if (p.scheduledAt == null) { sinHora++; categorias.add(p.categoria); continue; }
      if (!mismoInstante(p.scheduledAt, slots[i].scheduledAt)) {
        movidos++; categorias.add(p.categoria);
      }
    }
  }

  return {
    alDia: sinHora === 0 && movidos === 0,
    sinHora, movidos, cubiertos,
    categorias: [...categorias].sort((a, b) => a.localeCompare(b, 'es')),
  };
}

/** La frase que lee el organizador. `null` cuando no hay nada que decir. */
export function fraseDelPlan(e: EstadoDelPlan): string | null {
  if (e.alDia) return null;
  const partes: string[] = [];
  if (e.sinHora > 0) {
    partes.push(`${e.sinHora} ${e.sinHora === 1 ? 'partido sin hora' : 'partidos sin hora'}`);
  }
  if (e.movidos > 0) {
    partes.push(`${e.movidos} ${e.movidos === 1 ? 'movido' : 'movidos'} respecto al plan`);
  }
  const donde = e.categorias.length > 0 ? ` (${e.categorias.join(', ')})` : '';
  return `${partes.join(' y ')}${donde}.`;
}
