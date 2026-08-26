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

export interface PlanTorneo {
  cabe: boolean;
  planes: Map<string, PlanCategoria>;
  grupos: Fase;
  eliminacion: Fase;
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

        // Una fase deja pasar la subida si queda bajo el umbral O si la subida
        // no la toca. Sin esta segunda condición, un torneo con la fase de
        // grupos ya al 94% —como Cimepa— no podría repescar a nadie, aunque
        // repescar solo gasta slots del último día y ese va al 49%. Se estaba
        // bloqueando una mejora gratuita por culpa de un presupuesto ajeno.
        const ok = (despues: number, antes: number, presupuesto: number) =>
          despues <= presupuesto * UMBRAL_SUBIDA || despues === antes;

        if (ok(despuesG, antesG, presupuestoGrupos) && ok(despuesE, antesE, presupuestoElim)) {
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

  const cabe = gOcup <= 1 && eOcup <= 1;

  // ── Camino crítico del último día ─────────────────────────────────────────
  // Las rondas de una categoría son secuenciales: no se juega la semifinal
  // antes de los cuartos. Con un cuadro de 16 hacen falta 4 rondas encadenadas
  // aunque hubiera 100 canchas libres. Manda el bracketSize, no los
  // clasificados: un bye ocupa ronda igual, aunque no se juegue. Es una restricción que rara vez muerde, pero
  // su fallo es imposible de diagnosticar desde la capacidad agregada.
  if (!unSoloDia && dias > 0) {
    const maxRondas = Math.max(0, ...[...elegido.values()].map((p) => Math.log2(p.bracketSize)));
    const minutosUltimo = minutosDeVentana(cap.ventanas[dias - 1]);
    const minutosNecesarios = maxRondas * cap.minutosPorPartido;
    if (minutosNecesarios > minutosUltimo) {
      const h = Math.ceil(minutosNecesarios / 60);
      avisos.push(
        `El último día necesita al menos ${h} h seguidas: las rondas de una categoría se juegan una tras otra.`,
      );
    }
  }

  // ── Avisos de ocupación ───────────────────────────────────────────────────
  if (grupos.zona === 'limite') {
    avisos.push('La fase de grupos va al límite. Con retrasos habituales habrá esperas.');
  }
  if (eliminacion.zona === 'limite' && !unSoloDia) {
    avisos.push('El último día va al límite. Con retrasos habituales habrá esperas.');
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

  return { cabe, planes: elegido, grupos, eliminacion, avisos, diagnostico };
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
