// src/lib/engine/planner/index.ts
//
// RALLY · Planificador de torneo
//
// EL PROBLEMA QUE RESUELVE
//   `computeFormat(n)` decide categoría por categoría mirando solo el número de
//   parejas. Pero las ocho categorías de un torneo compiten por LAS MISMAS
//   canchas, así que ninguna sabe si el conjunto cabe — y nadie se entera hasta
//   que la gente está esperando en el club.
//
//   Evidencia: el Sexto Torneo Cimepa corrió su fase de grupos al 94% de
//   ocupación (165 partidos en 176 slots) y los jugadores esperaron de 30 a 60
//   minutos por cancha. El formato cabía en el papel.
//
// DOS PRESUPUESTOS, NO UNO
//   Grupos y eliminatorias no comparten día (R2): los grupos ocupan todos los
//   días menos el último, las eliminatorias solo el último. Que sobre tiempo el
//   domingo no ayuda si el sábado va apretado.
//
// MAXIMIN, NO MAXIMIZAR EL TOTAL
//   Si se maximizara la suma de partidos, todas las mejoras valdrían lo mismo y
//   el resultado sería arbitrario: una categoría con grupos de 5 al lado de otra
//   con grupos de 3 sin razón visible. Elevar primero al que peor está reparte
//   el tiempo sobrante de una forma que se puede explicar en una frase.
//
// Determinista. Sin IA. Sin BD.

import type { FormatType, KnockoutStart } from '../types';
import {
  correrCalendario,
  programarEliminatorias,
  finRealistaEncadenado,
  cadenasDePartidos,
  formatHora,
  type CategoriaCuadro,
} from '../schedule/knockout';

// ── Entradas ────────────────────────────────────────────────────────────────

export interface VentanaDia {
  fecha: string;   // 'YYYY-MM-DD'
  desde: string;   // 'HH:MM'
  hasta: string;   // 'HH:MM'
}

export interface Capacidad {
  canchas: number;
  /** Una por día, en orden cronológico. La última es la de eliminatorias. */
  ventanas: VentanaDia[];
  /** Se planifica a esto aunque en la práctica dure entre 60 y 90. */
  minutosPorPartido: number;
}

export interface CategoriaEntrada {
  id: string;
  parejas: number;
  /**
   * Ids de los jugadores inscritos en la categoria.
   *
   * Sirve para una sola cosa: que el scheduler sepa que dos categorias
   * comparten gente y no las ponga a la misma hora en rondas tempranas. Esa
   * separacion alarga el dia, asi que sin este dato el planificador
   * recomendaria un nivel de repesca que no cabe en el calendario real.
   *
   * Opcional: sin el, el planificador sigue funcionando como antes — pero
   * decidiendo contra un calendario mas optimista que el que se va a jugar.
   */
  jugadores?: string[];
}

// ── Salida ──────────────────────────────────────────────────────────────────

export type Zona = 'comodo' | 'ajustado' | 'limite' | 'no_cabe';

export interface PlanCategoria {
  categoryId: string;
  parejas: number;
  formatType: FormatType;
  groupSizes: number[];
  grupos: number;
  costeGrupos: number;
  /** El peor caso manda: min(tamaños) − 1. */
  asegurados: number;
  /**
   * Clasificados. CUALQUIER número ≥ 2, no una potencia de 2.
   *
   * Forzarlo a potencia de 2 era el bug: en el padel real los byes son la
   * norma. El Sexto Torneo Cimepa armó 5ª Fuerza con 12 clasificados en un
   * cuadro de 16 — 4 byes, 4 partidos de octavos.
   */
  clasificados: number;
  /** Tamaño del cuadro: la menor potencia de 2 que contiene a los clasificados. */
  bracketSize: number;
  /** bracketSize − clasificados. Se los llevan los mejores sembrados. */
  byes: number;
  /** Partidos de la primera ronda: clasificados − bracketSize/2. */
  partidosPrimeraRonda: number;
  advancePerGroup: number;
  repescados: number;
  /**
   * SIEMPRE clasificados − 1.
   *
   * Cada partido elimina exactamente a una pareja, y hay que eliminar a
   * C−1 para dejar campeón. Los byes no cambian ese número: solo cambian en
   * qué ronda entra cada quien.
   *
   * Antes se calculaba como bracketSize − 1, que con clasificados no-potencia
   * de 2 contaba partidos que nadie juega. Contra las ocho categorías de
   * Cimepa daba 76 en vez de 47 — un 62% de más, y ese porcentaje inflado era
   * lo que impedía subir de plan en el paso 2.
   */
  costeEliminacion: number;
  knockoutStart: KnockoutStart;
  /**
   * Cuántos SEGUNDOS de grupo llegan al cuadro.
   *
   * Es el número que decide si el torneo se muere a la mitad: cuando de un
   * grupo solo pasa el primero, quien pierde su primer partido ya sabe que no
   * avanza y juega el segundo por jugar. Cimepa metió 6 mejores segundos en 5ª
   * Fuerza justamente por esto — con 10 grupos de 3 tenía 10 primeros, que no
   * llenan un cuadro de 16.
   */
  segundosQueAvanzan: number;
  ratioSegundos: number;
  fraseSegundos: string;
}

export interface Fase {
  presupuesto: number;
  usados: number;
  ocupacion: number;   // 0..1
  zona: Zona;
}

export interface Diagnostico {
  faltanSlots: number;
  canchasQueFaltan: number;
  horasQueFaltan: number;
  parejasQueSobran: number;
}

/** Las tres horas del último día, tal como las calcula el scheduler. */
export interface HorasUltimoDia {
  finEstimado: string | null;
  finRealista: string | null;
  finRealistaUnaCanchaMenos: string | null;
}

export interface PlanTorneo {
  cabe: boolean;
  planes: Map<string, PlanCategoria>;
  grupos: Fase;
  /**
   * Ocupación del último día en slots.
   *
   * INFORMATIVO. Ya no gobierna nada: la decisión de cuántos segundos repescar
   * y el propio `cabe` los manda la hora de `ultimoDia`. Se conserva porque
   * sigue siendo un dato legible —cuántos partidos contra cuántos huecos— pero
   * un porcentaje no mide un día de eliminatorias: las rondas van encadenadas
   * y el cuadro se estrecha, así que el 84% podía significar terminar a las
   * seis o a las diez.
   */
  eliminacion: Fase;
  /** A qué hora termina de verdad el último día. Null si no hay ventanas. */
  ultimoDia: HorasUltimoDia | null;
  avisos: string[];
  diagnostico?: Diagnostico;
}

// ── Constantes ──────────────────────────────────────────────────────────────

/** Tamaños de grupo válidos. Menos de 3 rompe R1 (mínimo 2 asegurados). */
const TAMANOS = [3, 4, 5] as const;

/**
 * Por encima de esto el paso 2 deja de subir de plan.
 *
 * No es conservadurismo: un partido planificado a 60 minutos dura en promedio
 * 69. Con 8 canchas y 165 partidos, esa diferencia son unas 41 horas-cancha de
 * desviación sobre 176 slots — que es exactamente de dónde salieron las esperas
 * de Cimepa. El 15% restante es la diferencia entre el partido que se planifica
 * y el que ocurre.
 */
const UMBRAL_SUBIDA = 0.85;

const ZONA_COMODO = 0.70;

// ── Utilidades de tiempo ────────────────────────────────────────────────────

function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Minutos de una ventana. 0 si la hora final no supera a la inicial. */
export function minutosDeVentana(v: VentanaDia): number {
  return Math.max(0, aMinutos(v.hasta) - aMinutos(v.desde));
}

function slotsDeDia(v: VentanaDia, cap: Capacidad): number {
  return cap.canchas * Math.floor(minutosDeVentana(v) / cap.minutosPorPartido);
}

// ── Generación de candidatos ────────────────────────────────────────────────

const rr = (n: number) => (n * (n - 1)) / 2;

/** Todas las formas de partir n en sumandos de 3, 4 y 5. Tamaños desc. */
function particiones(n: number): number[][] {
  const salida: number[][] = [];
  for (let c = 0; c * 5 <= n; c++) {
    for (let b = 0; b * 4 + c * 5 <= n; b++) {
      const resto = n - b * 4 - c * 5;
      if (resto % 3 !== 0) continue;
      const a = resto / 3;
      if (a + b + c === 0) continue;
      salida.push([
        ...Array(c).fill(5),
        ...Array(b).fill(4),
        ...Array(a).fill(3),
      ]);
    }
  }
  return salida;
}

/** La menor potencia de 2 que contiene a n. El cuadro se deriva, no se fuerza. */
function pow2AlMenos(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return Math.max(p, 2);
}

function knockoutStartFor(Q: number): KnockoutStart {
  if (Q <= 2) return 'final';
  if (Q <= 4) return 'semi';
  if (Q <= 8) return 'quarter';
  if (Q <= 16) return 'r16';
  return 'r32';
}

function fraseDeSegundos(avanzan: number, grupos: number): string {
  const ratio = grupos === 0 ? 0 : avanzan / grupos;
  if (ratio >= 1) return 'Todos los segundos avanzan.';
  if (ratio >= 0.5) return `Quedar segundo sirve: ${avanzan} de ${grupos} segundos avanzan.`;
  if (ratio > 0) {
    return `Solo ${avanzan} de ${grupos} segundos avanzan. Quien pierda el primer partido tiene poco margen.`;
  }
  return 'Solo avanzan los primeros de grupo. Quien pierda su primer partido queda eliminado en la práctica.';
}

/** Todos los planes válidos de una categoría: partición × tamaño de cuadro. */
export function candidatos(cat: CategoriaEntrada): PlanCategoria[] {
  const salida: PlanCategoria[] = [];

  for (const sizes of particiones(cat.parejas)) {
    const grupos = sizes.length;
    const costeGrupos = sizes.reduce((a, s) => a + rr(s), 0);
    const asegurados = Math.min(...sizes) - 1;

    // Un solo grupo: round robin y final directa entre los dos primeros.
    if (grupos === 1) {
      salida.push({
        categoryId: cat.id, parejas: cat.parejas,
        formatType: 'round_robin',
        groupSizes: sizes, grupos, costeGrupos, asegurados,
        clasificados: 2, bracketSize: 2, byes: 0, partidosPrimeraRonda: 1,
        advancePerGroup: 2, repescados: 0,
        costeEliminacion: 1, knockoutStart: 'final',
        segundosQueAvanzan: 1, ratioSegundos: 1,
        fraseSegundos: fraseDeSegundos(1, 1),
      });
      continue;
    }

    // La perilla es una sola: cuántos SEGUNDOS se repescan, de 0 a uno por
    // grupo. Todo lo demás —cuadro, byes, partidos de primera ronda— se
    // deriva de ahí.
    for (let repescados = 0; repescados <= grupos; repescados++) {
      const clasificados = grupos + repescados;
      if (clasificados < 2) continue;

      const bracketSize = pow2AlMenos(clasificados);
      const byes = bracketSize - clasificados;

      // Cuando pasan TODOS los segundos, en realidad pasan 2 por grupo.
      const advancePerGroup = repescados === grupos ? 2 : 1;
      const segundosQueAvanzan = repescados;

      salida.push({
        categoryId: cat.id, parejas: cat.parejas,
        formatType: 'groups_then_knockout',
        groupSizes: sizes, grupos, costeGrupos, asegurados,
        clasificados, bracketSize, byes,
        partidosPrimeraRonda: clasificados - bracketSize / 2,
        advancePerGroup,
        repescados: advancePerGroup === 2 ? 0 : repescados,
        costeEliminacion: clasificados - 1,
        knockoutStart: knockoutStartFor(bracketSize),
        segundosQueAvanzan,
        ratioSegundos: segundosQueAvanzan / grupos,
        fraseSegundos: fraseDeSegundos(segundosQueAvanzan, grupos),
      });
    }
  }

  return salida;
}

/**
 * El plan de piso: el MÁS BARATO en las dos fases.
 *
 * Sin repescar a nadie, que es lo mínimo que se puede jugar. Si el piso no
 * cabe, nada cabe.
 *
 * Que eso deje ratio 0 es correcto AQUÍ: subir la repesca es trabajo del paso
 * 2, que es quien sabe cuánto presupuesto sobra. Preferir un plan más caro ya
 * en el piso —como hacía una versión anterior, con un desempate por
 * advancePerGroup— rompía el propio concepto de piso: elegía el cuadro más
 * grande posible antes de saber si cabía.
 */
function piso(cands: PlanCategoria[]): PlanCategoria {
  return [...cands].sort((a, b) =>
    a.costeGrupos - b.costeGrupos
    || a.costeEliminacion - b.costeEliminacion
    || a.byes - b.byes
  )[0];
}

/**
 * Los cuadros de un conjunto de planes, en el formato que espera el scheduler.
 * Menos de 2 clasificados no es cuadro y no ocupa cancha.
 */
function cuadrosDe(
  planes: Iterable<PlanCategoria>,
  jugadores?: Map<string, string[]>,
): CategoriaCuadro[] {
  const out: CategoriaCuadro[] = [];
  for (const p of planes) {
    if (p.clasificados >= 2) {
      out.push({
        id: p.categoryId,
        clasificados: p.clasificados,
        jugadores: jugadores?.get(p.categoryId),
      });
    }
  }
  return out;
}

/**
 * A qué hora terminaría el último día con estos cuadros, contando los retrasos.
 *
 * El techo se abre a 23:59 A PROPÓSITO. La pregunta no es "cabe" —eso lo
 * decide quien llama, comparando con su cierre— sino "a qué hora acabarías".
 * Con el techo real la corrida cortaría partidos y devolvería una hora
 * falsamente temprana, que es justo el error que hace falta evitar aquí.
 */
function horaFinRealista(
  planes: Iterable<PlanCategoria>,
  cap: Capacidad,
  ventana: VentanaDia,
  jugadores?: Map<string, string[]>,
): string | null {
  const cuadros = cuadrosDe(planes, jugadores);
  if (cuadros.length === 0) return null;
  try {
    // Se planifica a la duracion NORMAL y luego se estira la cadena, con la
    // misma funcion que usa programarEliminatorias. Replanificar a 75 minutos
    // recompactaria el dia y daria una hora que nadie va a ver.
    const r = correrCalendario({
      canchas: cap.canchas,
      desde: ventana.desde,
      hasta: '23:59',
      categorias: cuadros,
      minutosPorPartido: cap.minutosPorPartido,
    });
    if (!r.cabe) return null;
    const min = finRealistaEncadenado(cadenasDePartidos(r.partidos), cap.minutosPorPartido);
    return min === null ? null : formatHora(min);
  } catch {
    // Capacidad imposible (ventana invertida, duración fuera de rango). Quien
    // llama lo trata como "no cabe".
    return null;
  }
}

function zonaDe(ocupacion: number): Zona {
  if (ocupacion > 1) return 'no_cabe';
  if (ocupacion > UMBRAL_SUBIDA) return 'limite';
  if (ocupacion > ZONA_COMODO) return 'ajustado';
  return 'comodo';
}

// ── El algoritmo ────────────────────────────────────────────────────────────

export function planTournament(
  categorias: CategoriaEntrada[],
  cap: Capacidad,
): PlanTorneo {
  const avisos: string[] = [];

  // Menos de 3 parejas no forma grupo. Se excluye y se señala: contarla
  // silenciosamente daría un presupuesto falso.
  const sinGrupo = categorias.filter((c) => c.parejas < 3);
  for (const c of sinGrupo) {
    avisos.push(`Una categoría tiene ${c.parejas} ${c.parejas === 1 ? 'pareja' : 'parejas'}: no alcanza para un grupo.`);
  }
  const activas = categorias.filter((c) => c.parejas >= 3);

  // Presupuestos. Con un solo día, R2 no puede cumplirse y ambos comparten.
  const dias = cap.ventanas.length;
  const unSoloDia = dias <= 1;
  if (unSoloDia) {
    avisos.push('Con un solo día, la fase de grupos y las eliminatorias comparten cancha.');
  }

  const totalSlots = cap.ventanas.reduce((a, v) => a + slotsDeDia(v, cap), 0);
  const presupuestoGrupos = unSoloDia
    ? totalSlots
    : cap.ventanas.slice(0, -1).reduce((a, v) => a + slotsDeDia(v, cap), 0);
  const presupuestoElim = unSoloDia
    ? totalSlots
    : slotsDeDia(cap.ventanas[dias - 1], cap);

  // Quien juega en cada categoria, para que el scheduler pueda hermanarlas.
  // Sin esto el planificador decide contra un calendario mas optimista que el
  // que se va a jugar: es el mismo error de mirar un modelo que no refleja la
  // realidad, un nivel mas arriba.
  const jugadoresPorCat = new Map<string, string[]>();
  for (const c of categorias) {
    if (c.jugadores?.length) jugadoresPorCat.set(c.id, c.jugadores);
  }

  // La ventana del último día: la de las eliminatorias. Con un solo día no hay
  // "último" que aislar y el criterio por hora no aplica (ver okElim).
  const ventanaElim = dias > 0 ? cap.ventanas[dias - 1] : null;

  /**
   * La hora de fin de una configuración, cacheada.
   *
   * El bucle greedy prueba y deshace muchas veces, y vuelve a pasar por las
   * mismas configuraciones. La hora depende SOLO del multiconjunto de
   * clasificados, así que esa lista ordenada es una clave exacta.
   */
  const cacheHora = new Map<string, string | null>();
  const horaFin = (planes: PlanCategoria[]): string | null => {
    if (!ventanaElim) return null;
    const clave = cuadrosDe(planes).map((c) => c.clasificados).sort((a, b) => a - b).join(',');
    const ya = cacheHora.get(clave);
    if (ya !== undefined) return ya;
    const fin = horaFinRealista(planes, cap, ventanaElim, jugadoresPorCat);
    cacheHora.set(clave, fin);
    return fin;
  };

  // ── Paso 1 · Piso ─────────────────────────────────────────────────────────
  const cands = new Map<string, PlanCategoria[]>();
  const elegido = new Map<string, PlanCategoria>();
  for (const c of activas) {
    const lista = candidatos(c);
    cands.set(c.id, lista);
    elegido.set(c.id, piso(lista));
  }

  const sumaGrupos = () => [...elegido.values()].reduce((a, p) => a + p.costeGrupos, 0);
  const sumaElim   = () => [...elegido.values()].reduce((a, p) => a + p.costeEliminacion, 0);

  // Con un solo día ambos costes caen sobre el mismo presupuesto.
  const usaGrupos = () => unSoloDia ? sumaGrupos() + sumaElim() : sumaGrupos();
  const usaElim   = () => unSoloDia ? sumaGrupos() + sumaElim() : sumaElim();

  const noCabeGrupos = usaGrupos() > presupuestoGrupos;
  const noCabeElim   = usaElim()   > presupuestoElim;

  // ── Paso 2 · Elevar el suelo (maximin) ────────────────────────────────────
  // Solo si el piso cabe: si no cabe, subir empeora.
  if (!noCabeGrupos && !noCabeElim) {
    const tope = new Set<string>();

    // Cota de seguridad: cada vuelta sube UNA categoría un escalón, y los
    // escalones son finitos porque los candidatos lo son. No se puede subir
    // más veces que planes hay.
    //
    // Era `activas.length * 4`, pensado para los 3 tamaños de grupo. Al añadir
    // la repesca —que sube de uno en uno y puede tener una decena de
    // escalones— la cota se agotaba antes de llegar a probar los grupos: un
    // torneo de 12 parejas con canchas de sobra se quedaba en grupos de 3
    // repescando a todos, en vez de subir a grupos de 4.
    const maxVueltas = activas.reduce((a, c) => a + (cands.get(c.id)?.length ?? 0), 0);

    for (let vuelta = 0; vuelta < maxVueltas; vuelta++) {
      const candidatas = activas
        .filter((c) => !tope.has(c.id))
        .sort((x, y) => {
          const px = elegido.get(x.id)!, py = elegido.get(y.id)!;
          return px.asegurados - py.asegurados      // el que peor está
              || px.ratioSegundos - py.ratioSegundos // y a igual, el de peor ratio
              || y.parejas - x.parejas              // beneficia a más gente
              || (x.id < y.id ? -1 : 1);            // determinismo
        });

      if (candidatas.length === 0) break;

      let subio = false;
      for (const c of candidatas) {
        const actual = elegido.get(c.id)!;

        // PRIMERO LOS REPESCADOS, DESPUÉS LOS GRUPOS. Un repescado cuesta
        // exactamente 1 partido (costeEliminacion = C−1 crece de uno en uno);
        // subir un tamaño de grupo cuesta decenas. Comprar ratio a un partido
        // la unidad antes de gastar en partidos asegurados es estrictamente
        // mejor uso del presupuesto.
        const masRepesca = cands.get(c.id)!
          .filter((p) =>
            p.asegurados === actual.asegurados
            && p.costeGrupos === actual.costeGrupos
            && p.segundosQueAvanzan > actual.segundosQueAvanzan)
          .sort((a, b) =>
            a.segundosQueAvanzan - b.segundosQueAvanzan   // uno a la vez
            || a.costeEliminacion - b.costeEliminacion
            // A igualdad, menos byes: un cuadro lleno se lee mejor que uno
            // donde media tabla pasa sin jugar.
            || a.byes - b.byes
          );

        const masGrupo = cands.get(c.id)!
          .filter((p) => p.asegurados > actual.asegurados)
          .sort((a, b) =>
            a.asegurados - b.asegurados          // el siguiente escalón, no el techo
            || a.costeGrupos - b.costeGrupos     // el más barato de ese escalón
            || b.ratioSegundos - a.ratioSegundos // que quedar segundo sirva
            || a.costeEliminacion - b.costeEliminacion
          );

        const mejores = [...masRepesca, ...masGrupo];
        if (mejores.length === 0) { tope.add(c.id); continue; }

        const siguiente = mejores[0];

        const antesG = usaGrupos(), antesE = usaElim();
        elegido.set(c.id, siguiente);
        const despuesG = usaGrupos(), despuesE = usaElim();

        // GRUPOS: sin cambios. Ahí los partidos son independientes y corren en
        // paralelo, así que el porcentaje de ocupación sí mide algo y el 15%
        // de margen del umbral es la forma correcta de reservarlo.
        //
        // Una fase deja pasar la subida si queda bajo el umbral O si la subida
        // no la toca. Sin esta segunda condición, un torneo con la fase de
        // grupos ya al 94% —como Cimepa— no podría repescar a nadie, aunque
        // repescar solo gasta slots del último día y ese va al 49%. Se estaba
        // bloqueando una mejora gratuita por culpa de un presupuesto ajeno.
        const ok = (despues: number, antes: number, presupuesto: number) =>
          despues <= presupuesto * UMBRAL_SUBIDA || despues === antes;

        // ELIMINATORIAS: la hora, no el porcentaje.
        //
        // Un día de eliminatorias no se mide en huecos ocupados: las rondas de
        // una categoría van encadenadas y el cuadro se estrecha, así que las
        // últimas horas usan una cancha de ocho. El 84% de Cimepa se leía
        // holgado y terminaba a las 22:15.
        //
        // NO se añade margen sobre la hora: `minutosPorPartido` ya va
        // multiplicado por FACTOR_RETRASO dentro de horaFinRealista, y meter
        // encima el UMBRAL_SUBIDA sería contar el mismo retraso dos veces —
        // que es exactamente lo que hacía el umbral del 85%, según su propio
        // comentario ("la diferencia entre el partido que se planifica y el
        // que ocurre").
        const okElim = () => {
          // Con un solo día los grupos comparten cancha con el cuadro y el
          // scheduler solo modela el cuadro: no puede responder la pregunta.
          // Se queda el criterio de slots, que sí cuenta las dos fases.
          if (unSoloDia) return ok(despuesE, antesE, presupuestoElim);
          if (despuesE === antesE) return true;   // la subida no toca el último día
          const fin = horaFin([...elegido.values()]);
          return fin !== null && fin <= ventanaElim!.hasta;
        };

        if (ok(despuesG, antesG, presupuestoGrupos) && okElim()) {
          subio = true; break;
        }

        elegido.set(c.id, actual);   // deshacer
        tope.add(c.id);
      }

      if (!subio) break;
    }
  }

  // ── Paso 3 · Ocupación ────────────────────────────────────────────────────
  const gUsados = usaGrupos();
  const eUsados = usaElim();
  const gOcup = presupuestoGrupos > 0 ? gUsados / presupuestoGrupos : Infinity;
  const eOcup = presupuestoElim   > 0 ? eUsados / presupuestoElim   : Infinity;

  const grupos: Fase = {
    presupuesto: presupuestoGrupos, usados: gUsados,
    ocupacion: gOcup, zona: zonaDe(gOcup),
  };
  const eliminacion: Fase = {
    presupuesto: presupuestoElim, usados: eUsados,
    ocupacion: eOcup, zona: zonaDe(eOcup),
  };

  // ── El último día, en horas ───────────────────────────────────────────────
  // Tres corridas (plan, realista, una cancha menos) UNA sola vez, sobre la
  // configuración ya elegida. Dentro del bucle solo se corría la realista.
  let ultimoDia: HorasUltimoDia | null = null;
  if (ventanaElim) {
    const cuadros = cuadrosDe(elegido.values(), jugadoresPorCat);
    if (cuadros.length > 0) {
      try {
        const r = programarEliminatorias({
          canchas: cap.canchas,
          desde: ventanaElim.desde,
          hasta: ventanaElim.hasta,
          categorias: cuadros,
          minutosPorPartido: cap.minutosPorPartido,
        });
        ultimoDia = {
          finEstimado: r.finEstimado,
          finRealista: r.finRealista,
          finRealistaUnaCanchaMenos: r.finRealistaUnaCanchaMenos,
        };
      } catch {
        ultimoDia = null;
      }
    }
  }

  /**
   * El último día cabe si su hora REALISTA queda antes del cierre.
   *
   * Ya no `eOcup <= 1`: caber en huecos y terminar a tiempo son cosas
   * distintas cuando las rondas van encadenadas. Con un solo día no hay hora
   * fiable —el scheduler no ve los partidos de grupos que comparten cancha—
   * así que ahí manda el criterio de slots de siempre.
   */
  const elimCabe = unSoloDia || !ventanaElim || ultimoDia === null
    ? eOcup <= 1
    : ultimoDia.finRealista !== null && ultimoDia.finRealista <= ventanaElim.hasta;

  const cabe = gOcup <= 1 && elimCabe;

  // ── Avisos del último día ─────────────────────────────────────────────────
  // Sustituyen al aviso de camino crítico (maxRondas × minutos > ventana) y al
  // de "va al límite". Los dos aproximaban a ojo lo que el scheduler calcula
  // exacto, y ninguno daba la única cifra accionable: la hora.
  if (!unSoloDia && ventanaElim && ultimoDia?.finRealista) {
    if (ultimoDia.finRealista > ventanaElim.hasta) {
      avisos.push(
        `El último día terminaría a las ${ultimoDia.finRealista}, después del cierre de las ${ventanaElim.hasta}.`,
      );
    }
    const uno = ultimoDia.finRealistaUnaCanchaMenos;
    if (uno && uno > ventanaElim.hasta) {
      avisos.push(
        `Con una cancha menos, el último día terminaría a las ${uno}: este formato depende de que no falle ninguna.`,
      );
    }
  }

  // ── Avisos de ocupación ───────────────────────────────────────────────────
  if (grupos.zona === 'limite') {
    avisos.push('La fase de grupos va al límite. Con retrasos habituales habrá esperas.');
  }

  // ── Diagnóstico ───────────────────────────────────────────────────────────
  let diagnostico: Diagnostico | undefined;
  if (!cabe) {
    // Contra el 85%, no contra el 100%: el número accionable es cuánto falta
    // para correr con margen, no para caber por los pelos.
    const faltanG = Math.max(0, gUsados - presupuestoGrupos * UMBRAL_SUBIDA);
    const faltanE = Math.max(0, eUsados - presupuestoElim * UMBRAL_SUBIDA);
    const faltanSlots = Math.ceil(faltanG + faltanE);

    const horasTotales = cap.ventanas.reduce((a, v) => a + minutosDeVentana(v), 0) / 60;
    const partidosPorHora = 60 / cap.minutosPorPartido;

    diagnostico = {
      faltanSlots,
      canchasQueFaltan: horasTotales > 0
        ? Math.ceil(faltanSlots / (horasTotales * partidosPorHora)) : 0,
      horasQueFaltan: cap.canchas > 0
        ? Math.ceil(faltanSlots / (cap.canchas * partidosPorHora)) : 0,
      parejasQueSobran: parejasQueSobran(activas, cap, presupuestoGrupos, presupuestoElim, unSoloDia),
    };
  }

  return { cabe, planes: elegido, grupos, eliminacion, ultimoDia, avisos, diagnostico };
}

/**
 * Mínimo k tal que quitando k parejas el PISO cabe.
 *
 * Se quitan de la categoría más grande, que es la que más partidos ahorra por
 * pareja retirada. Devuelve 0 si ni vaciando el torneo cabe (capacidad nula).
 */
function parejasQueSobran(
  activas: CategoriaEntrada[],
  cap: Capacidad,
  presupuestoGrupos: number,
  presupuestoElim: number,
  unSoloDia: boolean,
): number {
  const copia = activas.map((c) => ({ ...c }));
  const total = copia.reduce((a, c) => a + c.parejas, 0);

  for (let k = 0; k <= total; k++) {
    const vivas = copia.filter((c) => c.parejas >= 3);
    let g = 0, e = 0;
    for (const c of vivas) {
      const p = piso(candidatos(c));
      g += p.costeGrupos; e += p.costeEliminacion;
    }
    const usaG = unSoloDia ? g + e : g;
    const usaE = unSoloDia ? g + e : e;
    if (usaG <= presupuestoGrupos * UMBRAL_SUBIDA && usaE <= presupuestoElim * UMBRAL_SUBIDA) {
      return k;
    }

    // Quitar una pareja de la categoría más grande.
    const mayor = copia.filter((c) => c.parejas > 0).sort((a, b) => b.parejas - a.parejas)[0];
    if (!mayor) return k;
    mayor.parejas--;
  }
  return total;
}
