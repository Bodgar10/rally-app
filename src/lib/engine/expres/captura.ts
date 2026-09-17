// src/lib/engine/expres/captura.ts
// Qué se escribe cuando el juez captura un suma 6. Determinista, sin red.
//
// CAMINO PARALELO, NO UNA RAMA
//
//   `validateScore` y `record_match_result` dan por hecho que un partido tiene
//   ganador: el primero lo deriva del marcador y el segundo lo escribe. Un
//   suma 6 no lo tiene, y un 5-1 ni siquiera es un marcador de set legal —
//   `clasificarSet` lo leería como null y lo rechazaría, con razón.
//
//   Así que la captura exprés tiene su propia función, y esta es. Devuelve lo
//   que hay que persistir; no habla con Supabase. Eso permite que la pantalla
//   del juez y la Edge Function usen EXACTAMENTE la misma verdad, que es lo
//   que evita el `winner_mismatch` de la captura larga: no hay dos cálculos
//   que puedan discrepar porque solo hay uno.
//
// QUÉ DEVUELVE, Y POR QUÉ TODO JUNTO
//
//   Un suma 6 capturado mueve tres cosas a la vez: el partido, su marcador y
//   la tabla entera del grupo —porque el balance de una pareja cambia el
//   puesto de las demás, y con él su clinch—. Devolverlas por separado
//   invitaría a escribir una y olvidar otra.

import { CLASIFICAN_POR_GRUPO, type GrupoId } from './reglas';
import { GAMES_POR_PARTIDO, validarMarcadorSuma6 } from './suma6';
import { computeTablaExpres, type ResultadoSuma6, type TablaExpres } from './tabla';
import { computeClinchExpres, type ClinchExpresResult, type EstadoClinchExpres } from './clinch';

/**
 * Una fila de `group_standings` tal como queda tras la captura.
 *
 * LAS COLUMNAS DEL TORNEO LARGO VAN A CERO, Y VAN EXPLÍCITAS.
 *   `won`, `lost`, `setsWon`, `setsLost` y `points` existen en la tabla desde
 *   la migración 001 y en un exprés no significan nada: no hay victorias que
 *   contar ni sets que ganar. Se escriben en 0 a propósito en vez de dejarlas
 *   como estaban, porque un valor viejo de una captura anterior se leería como
 *   un dato y no como un residuo. La pantalla de exprés no las muestra.
 */
export interface FilaStandingExpres {
  pairId: string;
  played: number;
  gamesWon: number;
  gamesLost: number;
  /** gamesWon − gamesLost. En la base es columna generada; aquí va para poder verificarlo. */
  balance: number;
  position: number;
  clinchStatus: EstadoClinchExpres;
  won: 0;
  lost: 0;
  setsWon: 0;
  setsLost: 0;
  points: 0;
}

export interface CapturaExpres {
  /** Lo que hay que escribir en `matches`. */
  partido: {
    matchId: string;
    /** 'finished' al capturar, 'scheduled' al borrar el marcador. */
    status: 'finished' | 'scheduled';
    /**
     * SIEMPRE null. No es que falte: es que un suma 6 no tiene ganador. Lo que
     * dice que el partido acabó es `status` — ver la migración 075.
     */
    winnerPairId: null;
    formato: 'suma_6';
  };
  /** La fila de `match_sets`. null cuando se está borrando el marcador. */
  marcador: {
    matchId: string;
    setNumber: 1;
    gamesA: number;
    gamesB: number;
    isSuperTiebreak: false;
  } | null;
  /** Una fila por pareja del grupo. Se escriben TODAS: un balance mueve la tabla entera. */
  standings: FilaStandingExpres[];
  /** La tabla resultante, para pintarla sin recalcular. */
  tabla: TablaExpres;
  clinch: ClinchExpresResult[];
}

export interface EntradaCapturaExpres {
  grupo?: GrupoId | string;
  pairIds: readonly string[];
  /** Todos los partidos del grupo, tal como están ANTES de esta captura. */
  resultados: readonly ResultadoSuma6[];
  /** El partido que se captura. Tiene que estar en `resultados`. */
  matchId: string;
  /** Games de la pareja A. null en los dos para BORRAR el marcador. */
  gamesA: number | null;
  gamesB: number | null;
  clasifican?: number;
  ordenManual?: Record<string, number>;
}

/**
 * Aplica un marcador de suma 6 y devuelve todo lo que hay que persistir.
 *
 * No escribe nada. Lanza si el marcador o el partido no son válidos: en una
 * captura, un dato que no cuadra es un error del juez que hay que enseñarle,
 * no algo que corregir por lo bajo.
 */
export function prepararCapturaExpres(entrada: EntradaCapturaExpres): CapturaExpres {
  const matchId = exigirTexto(entrada?.matchId, 'matchId');
  const resultados = exigirArray(entrada?.resultados);
  const clasifican = entrada?.clasifican ?? CLASIFICAN_POR_GRUPO;

  const partido = resultados.find((r) => r.matchId === matchId);
  if (!partido) {
    throw new Error(
      `prepararCapturaExpres: el partido "${matchId}" no está entre los ${resultados.length} ` +
        `del grupo. Se capturan los partidos del grupo que se pasa, no cualquiera.`,
    );
  }

  const borrando = entrada.gamesA === null && entrada.gamesB === null;
  if (!borrando) {
    const errores = validarMarcadorSuma6(entrada?.gamesA, entrada?.gamesB);
    if (errores.length > 0) {
      throw new Error(`prepararCapturaExpres: ${errores.join(' ')}`);
    }
  }

  // El grupo con el nuevo marcador aplicado. Se sustituye el partido en su
  // sitio, sin reordenar: el orden de `resultados` es el del calendario.
  const conElNuevo: ResultadoSuma6[] = resultados.map((r) =>
    r.matchId === matchId ? { ...r, gamesA: entrada.gamesA, gamesB: entrada.gamesB } : r,
  );

  const tabla = computeTablaExpres({
    grupo: typeof entrada?.grupo === 'string' ? entrada.grupo : undefined,
    pairIds: entrada?.pairIds,
    resultados: conElNuevo,
    clasifican,
    ordenManual: entrada?.ordenManual,
  });

  const clinch = computeClinchExpres({
    pairIds: entrada?.pairIds,
    resultados: conElNuevo,
    clasifican,
  });

  const estadoDe = new Map(clinch.map((c) => [c.pairId, c.estado]));

  const standings: FilaStandingExpres[] = tabla.filas.map((f) => ({
    pairId: f.pairId,
    played: f.jugados,
    gamesWon: f.gamesFavor,
    gamesLost: f.gamesContra,
    balance: f.balance,
    position: f.posicion,
    clinchStatus: estadoDe.get(f.pairId)!,
    won: 0,
    lost: 0,
    setsWon: 0,
    setsLost: 0,
    points: 0,
  }));

  return {
    partido: {
      matchId,
      status: borrando ? 'scheduled' : 'finished',
      winnerPairId: null,
      formato: 'suma_6',
    },
    marcador: borrando
      ? null
      : {
          matchId,
          setNumber: 1,
          gamesA: entrada.gamesA as number,
          gamesB: entrada.gamesB as number,
          isSuperTiebreak: false,
        },
    standings,
    tabla,
    clinch,
  };
}

/**
 * Cuántos partidos del grupo faltan por capturar.
 *
 * La pantalla del juez lo necesita para saber cuándo enseñar el cierre del
 * grupo, y la del organizador para saber cuándo puede sembrar el cuadro.
 */
export function partidosPendientes(resultados: readonly ResultadoSuma6[]): number {
  return exigirArray(resultados).filter((r) => r.gamesA === null || r.gamesB === null).length;
}

/**
 * Los games que ganó cada lado en un marcador, vistos como balance.
 * Un 4-2 es +2 para A y −2 para B. Un 3-3 es 0 para los dos.
 */
export function balanceDelMarcador(gamesA: number, gamesB: number): { a: number; b: number } {
  const errores = validarMarcadorSuma6(gamesA, gamesB);
  if (errores.length > 0) throw new Error(`balanceDelMarcador: ${errores.join(' ')}`);
  return { a: gamesA - gamesB, b: gamesB - gamesA };
}

/** Games que pone en juego una pareja en `partidos` partidos. Siempre 6 por partido. */
export function gamesEnJuegoDelGrupo(partidos: number): number {
  return partidos * GAMES_POR_PARTIDO;
}

function exigirTexto(v: unknown, campo: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(
      `prepararCapturaExpres: ${campo} es obligatorio y debe ser un texto no vacío; ` +
        `llegó ${JSON.stringify(v)}.`,
    );
  }
  return v;
}

function exigirArray(v: unknown): readonly ResultadoSuma6[] {
  if (!Array.isArray(v)) {
    throw new Error(
      `prepararCapturaExpres: resultados es obligatorio y debe ser un array; llegó ${JSON.stringify(v)}.`,
    );
  }
  return v as ResultadoSuma6[];
}
