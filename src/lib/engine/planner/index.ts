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
  /** Tamaño del cuadro. Siempre potencia de 2 (R3): no hay byes. */
  Q: number;
  advancePerGroup: number;
  repescados: number;
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

function esPow2(n: number): boolean {
  return n >= 2 && (n & (n - 1)) === 0;
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
        Q: 2, advancePerGroup: 2, repescados: 0,
        costeEliminacion: 1, knockoutStart: 'final',
        segundosQueAvanzan: 1, ratioSegundos: 1,
        fraseSegundos: fraseDeSegundos(1, 1),
      });
      continue;
    }

    for (let Q = 2; Q <= 2 * grupos; Q *= 2) {
      if (Q < grupos) continue;
      if (!esPow2(Q)) continue;

      const advancePerGroup = Q >= 2 * grupos ? 2 : 1;
      const repescados = Q - advancePerGroup * grupos;
      if (repescados < 0) continue;

      // Con advancePerGroup = 2 pasan TODOS los segundos; con 1, solo los
      // repescados.
      const segundosQueAvanzan = advancePerGroup === 2 ? grupos : repescados;

      salida.push({
        categoryId: cat.id, parejas: cat.parejas,
        formatType: 'groups_then_knockout',
        groupSizes: sizes, grupos, costeGrupos, asegurados,
        Q, advancePerGroup, repescados,
        costeEliminacion: Q - 1,
        knockoutStart: knockoutStartFor(Q),
        segundosQueAvanzan,
        ratioSegundos: segundosQueAvanzan / grupos,
        fraseSegundos: fraseDeSegundos(segundosQueAvanzan, grupos),
      });
    }
  }

  return salida;
}

/**
 * El plan de piso: el más barato en canchas.
 *
 * Entre los de coste mínimo se prefiere el que hace que quedar segundo sirva:
 * primero el de mayor advancePerGroup, luego el de mayor ratioSegundos. Un
 * cuadro donde solo entra el primero de cada grupo es más barato, pero deja a
 * medio torneo jugando su segundo partido sin nada en juego.
 */
function piso(cands: PlanCategoria[]): PlanCategoria {
  return [...cands].sort((a, b) =>
    a.costeGrupos - b.costeGrupos
    || b.advancePerGroup - a.advancePerGroup
    || a.costeEliminacion - b.costeEliminacion
    || b.ratioSegundos - a.ratioSegundos
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

    // Cota de seguridad: cada vuelta sube una categoría de nivel, y los niveles
    // por categoría son finitos (3 tamaños de grupo).
    for (let vuelta = 0; vuelta < activas.length * 4; vuelta++) {
      const candidatas = activas
        .filter((c) => !tope.has(c.id))
        .sort((x, y) => {
          const px = elegido.get(x.id)!, py = elegido.get(y.id)!;
          return px.asegurados - py.asegurados   // el que peor está
              || y.parejas - x.parejas           // beneficia a más gente
              || (x.id < y.id ? -1 : 1);         // determinismo
        });

      if (candidatas.length === 0) break;

      let subio = false;
      for (const c of candidatas) {
        const actual = elegido.get(c.id)!;
        const mejores = cands.get(c.id)!
          .filter((p) => p.asegurados > actual.asegurados)
          .sort((a, b) =>
            a.asegurados - b.asegurados          // el siguiente escalón, no el techo
            || a.costeGrupos - b.costeGrupos     // el más barato de ese escalón
            || b.ratioSegundos - a.ratioSegundos // que quedar segundo sirva
            || a.costeEliminacion - b.costeEliminacion
          );

        if (mejores.length === 0) { tope.add(c.id); continue; }

        const siguiente = mejores[0];
        elegido.set(c.id, siguiente);

        const okG = usaGrupos() <= presupuestoGrupos * UMBRAL_SUBIDA;
        const okE = usaElim()   <= presupuestoElim   * UMBRAL_SUBIDA;

        if (okG && okE) { subio = true; break; }

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
  // antes de los cuartos. Con Q=16 hacen falta 4 rondas encadenadas aunque
  // hubiera 100 canchas libres. Es una restricción que rara vez muerde, pero
  // su fallo es imposible de diagnosticar desde la capacidad agregada.
  if (!unSoloDia && dias > 0) {
    const maxRondas = Math.max(0, ...[...elegido.values()].map((p) => Math.log2(p.Q)));
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
