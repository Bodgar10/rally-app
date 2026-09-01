// src/lib/engine/schedule/mover.ts
//
// RALLY · ¿Se puede mover este partido a esta hora y esta cancha?
//
// POR QUÉ VIVE EN EL ENGINE Y NO EN LA PANTALLA
//   La pantalla del organizador la necesita para validar en vivo mientras
//   arrastra la hora, pero no es la única que va a mover partidos: las Edge
//   Functions que reprograman el día también tienen que decidir lo mismo, y una
//   regla escrita dos veces es una regla que a la larga dice dos cosas.
//
//   Determinista, sin red, sin base de datos y SIN ZONAS HORARIAS: el llamador
//   convierte a día ('YYYY-MM-DD') y minutos desde medianoche del club. Meter
//   `Date` aquí dentro haría que la misma comprobación diera resultados
//   distintos según el servidor donde corriera.
//
// EL MENSAJE ES LA MITAD DEL TRABAJO
//   "conflict: player_busy" no le sirve a nadie a las nueve de la mañana de un
//   domingo. El organizador necesita "Ana Teresa terminó su cuarto hace 10
//   minutos" para saber a quién buscar y qué decirle. Por eso cada conflicto
//   lleva nombre propio, y por eso los nombres entran como parámetro: el motor
//   no sabe de `users` ni tiene por qué.

import { DEFAULT_DESCANSO_MINIMO, DEFAULT_MINUTOS_PARTIDO } from './knockout';

/** Un partido con su sitio en el calendario, tal como está hoy. */
export interface PartidoEnCalendario {
  id: string;
  categoryId: string;
  /** 'group' | 'round_of_32' | ... | 'third_place'. */
  stage: string;
  roundLabel: string | null;
  /** Los cuatro jugadores. Menos de cuatro si alguna pareja falta todavía. */
  jugadores: string[];
  /** 'YYYY-MM-DD' en la zona del club. Null si aún no tiene hora. */
  dia: string | null;
  /** Minutos desde medianoche. Null si aún no tiene hora. */
  inicioMin: number | null;
  /** Etiqueta de la cancha tal como la ve el organizador: 'Cancha 3'. */
  cancha: string | null;
  status: string;
  /** Los partidos de la ronda previa que lo alimentan. Null en grupos y siembra. */
  sourceMatchIds: string[] | null;
}

/** A dónde se quiere mover. */
export interface Movimiento {
  matchId: string;
  dia: string;
  inicioMin: number;
  cancha: string;
}

export type MotivoConflicto =
  | 'partido_no_encontrado'
  | 'cancha_ocupada'
  | 'jugador_ocupado'
  | 'descanso_insuficiente'
  | 'ronda_previa_sin_hora'
  | 'ronda_previa_despues'
  | 'hora_invalida';

export interface Conflicto {
  motivo: MotivoConflicto;
  /** Redactado para el organizador, con nombres. */
  mensaje: string;
  /** El partido que estorba, si lo hay. */
  matchId?: string;
}

export interface ResultadoMovimiento {
  ok: boolean;
  conflictos: Conflicto[];
}

export interface EntradaMovimiento {
  /** TODOS los partidos del torneo, con su horario actual. */
  partidos: PartidoEnCalendario[];
  movimiento: Movimiento;
  minutosPorPartido?: number;
  /** Minutos que una pareja necesita entre dos partidos suyos. Default 30. */
  descansoMinimo?: number;
  /** playerId -> nombre. Lo que falte sale como "Un jugador". */
  nombres?: Record<string, string>;
}

const ETIQUETA_ETAPA: Record<string, string> = {
  group: 'partido de grupos',
  round_of_32: 'ronda de 32',
  round_of_16: 'octavos',
  quarter: 'cuarto',
  semi: 'semifinal',
  final: 'final',
  third_place: 'partido por el 3.er lugar',
};

/** El orden del árbol. `third_place` cuelga aparte y no alimenta a nadie. */
const ORDEN_ETAPAS = ['round_of_32', 'round_of_16', 'quarter', 'semi', 'final'];

const etiqueta = (stage: string) => ETIQUETA_ETAPA[stage] ?? 'partido';

const nombreDe = (id: string, nombres?: Record<string, string>) =>
  nombres?.[id] ?? 'Un jugador';

/** '10 minutos' · '1 hora' · '1 h 30 min'. Para que el mensaje se lea. */
function duracionLegible(min: number): string {
  if (min < 60) return `${min} ${min === 1 ? 'minuto' : 'minutos'}`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  const horas = `${h} ${h === 1 ? 'hora' : 'horas'}`;
  return m === 0 ? horas : `${h} h ${m} min`;
}

/** Dos intervalos [a1,a2) y [b1,b2) se pisan. */
const seSolapan = (a1: number, a2: number, b1: number, b2: number) => a1 < b2 && b1 < a2;

/**
 * ¿Se puede mover `movimiento.matchId` a ese día, hora y cancha?
 *
 * Devuelve TODOS los conflictos, no el primero: el organizador que mueve una
 * semifinal quiere ver de una vez que la cancha está ocupada Y que dos de sus
 * jugadores vienen de jugar, no descubrirlo de uno en uno.
 */
export function validarMovimiento(entrada: EntradaMovimiento): ResultadoMovimiento {
  const dur = entrada.minutosPorPartido ?? DEFAULT_MINUTOS_PARTIDO;
  const desc = entrada.descansoMinimo ?? DEFAULT_DESCANSO_MINIMO;
  const { movimiento: mov, nombres } = entrada;

  const partido = entrada.partidos.find((p) => p.id === mov.matchId);
  if (!partido) {
    return {
      ok: false,
      conflictos: [{ motivo: 'partido_no_encontrado', mensaje: 'Ese partido no está en el calendario.' }],
    };
  }

  if (!Number.isFinite(mov.inicioMin) || mov.inicioMin < 0 || mov.inicioMin >= 24 * 60) {
    return {
      ok: false,
      conflictos: [{ motivo: 'hora_invalida', mensaje: 'La hora está fuera del día.' }],
    };
  }

  const inicio = mov.inicioMin;
  const fin = inicio + dur;
  const conflictos: Conflicto[] = [];

  // Todo lo demás del mismo día. El propio partido no se compara consigo mismo.
  //
  // LOS QUE NO TIENEN HORA SE EXCLUYEN EXPLÍCITAMENTE, los dos campos, y no
  // porque la comparación vaya a fallar sola: `null === null` es `true`, así
  // que dos partidos sin día se habrían dado por simultáneos, y un `inicioMin`
  // nulo entra en la aritmética como 0 y coloca el partido a medianoche. Un
  // partido sin hora no ocupa cancha, no ocupa a nadie y no gasta descanso:
  // todavía no está en ningún sitio.
  const delDia = entrada.partidos.filter(
    (p) => p.id !== partido.id && p.dia !== null && p.inicioMin !== null && p.dia === mov.dia,
  );

  // ── 1. La cancha ─────────────────────────────────────────────────────────
  for (const otro of delDia) {
    if (otro.cancha !== mov.cancha) continue;
    if (!seSolapan(inicio, fin, otro.inicioMin!, otro.inicioMin! + dur)) continue;
    conflictos.push({
      motivo: 'cancha_ocupada',
      matchId: otro.id,
      mensaje: `La ${mov.cancha} ya tiene un ${etiqueta(otro.stage)} a esa hora.`,
    });
    break;   // con saber que está ocupada basta; listarlas todas es ruido
  }

  // ── 2. Los cuatro jugadores ──────────────────────────────────────────────
  // Se recorre por jugador y no por partido para poder decir el nombre, que es
  // lo único que le sirve a quien tiene que resolverlo.
  // Sin ids vacíos: una pareja a medio inscribir trae un hueco, y un hueco
  // compartido convertiría en "el mismo jugador" a dos partidos sin relación.
  const mios = new Set((partido.jugadores ?? []).filter((j) => !!j));

  for (const otro of delDia) {
    const compartidos = (otro.jugadores ?? []).filter((j) => !!j && mios.has(j));
    if (compartidos.length === 0) continue;

    const oIni = otro.inicioMin!;
    const oFin = oIni + dur;
    const quien = nombreDe(compartidos[0], nombres);
    const masDeUno = compartidos.length > 1
      ? ` (y ${compartidos.length - 1} más)`
      : '';

    // 2a. Solapamiento puro: no se puede estar en dos canchas a la vez.
    if (seSolapan(inicio, fin, oIni, oFin)) {
      conflictos.push({
        motivo: 'jugador_ocupado',
        matchId: otro.id,
        mensaje: `${quien}${masDeUno} juega su ${etiqueta(otro.stage)} a esa misma hora.`,
      });
      continue;
    }

    // 2b. Descanso. Vale en los dos sentidos: acaba de jugar, o el partido que
    // se está moviendo lo dejaría sin aire para el siguiente.
    if (oFin <= inicio && inicio - oFin < desc) {
      const hace = inicio - oFin;
      conflictos.push({
        motivo: 'descanso_insuficiente',
        matchId: otro.id,
        mensaje: hace === 0
          ? `${quien}${masDeUno} termina su ${etiqueta(otro.stage)} justo a esa hora.`
          : `${quien}${masDeUno} termina su ${etiqueta(otro.stage)} ${duracionLegible(hace)} antes; ` +
            `necesita ${duracionLegible(desc)} de descanso.`,
      });
      continue;
    }
    if (fin <= oIni && oIni - fin < desc) {
      conflictos.push({
        motivo: 'descanso_insuficiente',
        matchId: otro.id,
        mensaje: `${quien}${masDeUno} empieza su ${etiqueta(otro.stage)} ${duracionLegible(oIni - fin)} ` +
                 `después de este; necesita ${duracionLegible(desc)} de descanso.`,
      });
    }
  }

  // ── 3. Eliminatorias: la ronda anterior ──────────────────────────────────
  // No se puede jugar una semifinal antes de que se sepa quién la juega.
  if (partido.stage !== 'group') {
    for (const previo of partidosPrevios(partido, entrada.partidos)) {
      if (previo.status === 'finished') continue;   // ya se sabe el resultado

      if (previo.dia === null || previo.inicioMin === null) {
        conflictos.push({
          motivo: 'ronda_previa_sin_hora',
          matchId: previo.id,
          mensaje: `Antes se juega un ${etiqueta(previo.stage)} que todavía no tiene hora.`,
        });
        continue;
      }
      const pFin = previo.inicioMin + dur;
      // Distinto día: si el previo es de un día posterior, imposible.
      const antes = previo.dia < mov.dia || (previo.dia === mov.dia && pFin + desc <= inicio);
      if (!antes) {
        conflictos.push({
          motivo: 'ronda_previa_despues',
          matchId: previo.id,
          mensaje: `El ${etiqueta(previo.stage)} del que sale este todavía no habría terminado.`,
        });
      }
    }
  }

  return { ok: conflictos.length === 0, conflictos };
}

/**
 * Los partidos de los que sale este.
 *
 * Con `source_match_ids` (migración 049) es exacto. Sin ellos —cuadros
 * sembrados antes— se cae a "todos los de la ronda anterior de la categoría",
 * que sobre-restringe pero nunca deja pasar un imposible: es el lado correcto
 * en el que equivocarse.
 */
function partidosPrevios(
  partido: PartidoEnCalendario,
  todos: PartidoEnCalendario[],
): PartidoEnCalendario[] {
  if (partido.sourceMatchIds?.length) {
    const ids = new Set(partido.sourceMatchIds);
    return todos.filter((p) => ids.has(p.id));
  }

  // El 3.er lugar sale de las semifinales; el resto, de la etapa anterior.
  const objetivo = partido.stage === 'third_place'
    ? 'semi'
    : ORDEN_ETAPAS[ORDEN_ETAPAS.indexOf(partido.stage) - 1];
  if (!objetivo) return [];

  return todos.filter((p) => p.categoryId === partido.categoryId && p.stage === objetivo);
}
