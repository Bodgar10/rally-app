// src/lib/engine/futuro/index.ts
// ¿De qué partidos depende esta pareja? (motor puro, determinista)
//
// EL HUECO QUE LLENA
//   Una pareja termina sus partidos el viernes y no sabe nada hasta que acaba
//   el último grupo el sábado a medianoche. La app le decía "sigues vivo como
//   mejor segundo, faltan 9 grupos": cierto, y no le sirve para decidir si se
//   va a dormir o se queda.
//
// SON DOS CARRERAS DISTINTAS, CON RIVALES DISTINTOS
//   A) REPESCA — solo contra los otros segundos de la categoría. Los primeros
//      no le afectan.
//   B) BYE — contra los primeros de todos los grupos, porque el orden de
//      siembra decide quién se salta una ronda. Solo existe si el cuadro tiene
//      huecos: 10 clasificados en un cuadro de 16 son 6 byes.
//
//   Y antes de las dos, la previa: qué puesto puede acabar teniendo en SU
//   grupo. Ganar lo que le queda puede sacarlo de la carrera A y meterlo en la
//   B, así que se responde primero.
//
// LO QUE IMPORTA ES EL CORTE, NO EL PUESTO
//   Con 6 repescados, ser el sexto entra igual que ser el primero. Por eso el
//   motor devuelve el PEOR PUESTO GARANTIZADO y no el rango: lo que el jugador
//   necesita oír es "lo peor que te puede tocar es entrar de sexto, ya pasaste".
//
// LOS GAMES SON INCERTIDUMBRE, NO VARIABLE
//   El desempate entre segundos usa diferencia de games, y los games no son
//   binarios: un 6-0 no es un 7-6. Enumerar marcadores es imposible, así que
//   el motor razona SOLO con ganadores y trata los games como desconocidos.
//   Puede afirmar "pasa en todos los escenarios" o "en ninguno"; cuando lo que
//   separa a dos parejas es un empate a puntos, lo dice por su nombre en vez
//   de inventarse una probabilidad.

import type { MatchResultInput, StandingRow } from '../types';
import {
  computeStandings,
  DEFAULT_STANDINGS_CONFIG,
  type StandingsConfig,
} from '../standings';
import { selectQualifiers, type QualifierStanding } from '../seeding/select-qualifiers';
import { computeSeeding } from '../seeding';
import { cuadroDe } from '../../cuadro-tamano';

// ───────────────────────────────────────────
// Entrada y salida
// ───────────────────────────────────────────

export interface GrupoDeCategoria {
  groupId: string;
  /** 'A', 'B'… Lo que se le enseña al jugador. */
  nombre: string;
  pairIds: string[];
  /** Partidos del grupo, jugados o no. */
  matches: MatchResultInput[];
}

export interface EntradaFuturo {
  grupos: GrupoDeCategoria[];
  /** categories.advance_per_group. Obligatorio. */
  advancePerGroup: number;
  /** categories.best_extra_qualifiers. Obligatorio, aunque sea 0. */
  bestExtraQualifiers: number;
  /** La pareja que pregunta. */
  pairId: string;
  /** pairId -> 'Nombre / Apellido'. Lo que sale en las frases. */
  nombres: Record<string, string>;
  config?: StandingsConfig;
  /**
   * Operaciones que el motor se permite gastar. Ver `kMaximo`. Se expone para
   * los tests; en producción no se toca.
   */
  presupuesto?: number;
}

/** Un partido pendiente que de verdad cambia la respuesta. */
export interface PartidoQueImporta {
  matchId: string;
  /** 'A', 'B'… el grupo donde se juega. */
  grupo: string;
  parejaA: string;
  parejaB: string;
  /**
   * Qué resultado le conviene a quien pregunta, por nombre. `null` cuando el
   * partido importa pero ninguno de los dos resultados es mejor — pasa cuando
   * lo que decide es otra combinación.
   */
  meConviene: string | null;
}

export type EstadoCarrera = 'dentro' | 'fuera' | 'depende';

export interface Carrera {
  estado: EstadoCarrera;
  /**
   * El PEOR puesto que puede acabar ocupando en esta carrera, contando que
   * todos los empates a puntos se resuelvan en su contra.
   *
   * Es el número sobre el que se construye la frase: con 6 plazas, un peor
   * puesto de 6 significa "ya pasaste". `null` si no se puede afirmar.
   */
  peorPuestoPosible: number | null;
  /** Cuántas plazas reparte la carrera. */
  plazas: number;
  partidosQueImportan: PartidoQueImporta[];
  /**
   * Parejas con las que empata a puntos y a las que solo la diferencia de
   * games puede separar. No se promete nada sobre ellas.
   */
  dependeDeGamesContra: string[];
}

export interface AnalisisFuturo {
  estado: 'dentro' | 'fuera' | 'depende' | 'empate_sin_resolver' | 'demasiado_pronto';
  /** Puestos que puede acabar ocupando en SU grupo. Vacío si no se enumeró. */
  posicionesPosiblesEnGrupo: number[];
  /** La carrera de mejores segundos. Ausente si no le aplica. */
  repesca?: Carrera;
  /** La carrera por saltarse una ronda. */
  bye?: Carrera & { aplica: boolean; byesEnElCuadro: number };
  /** Partidos de la categoría que faltan por jugarse. */
  faltan: number;
  /**
   * Con cuántos pendientes podrá responder. Solo con 'demasiado_pronto'.
   * "Faltan 23; te digo algo cuando queden 6" es accionable; "faltan 23" no.
   */
  respondoCuandoQueden?: number;
}

// ───────────────────────────────────────────
// El corte de coste
// ───────────────────────────────────────────

/**
 * Operaciones que el motor se permite. No es un número de partidos: el coste
 * real es `2^k × trabajo_por_escenario`, y el trabajo por escenario crece con
 * el tamaño de la categoría. Con un presupuesto fijo, una categoría de 3
 * grupos se permite más escenarios que una de 10 sin que nadie escriba un
 * umbral a mano.
 */
const PRESUPUESTO = 4_000_000;

/**
 * Lo que cuesta UN escenario, en unidades comparables.
 *
 * Por escenario se recalculan las tablas de todos los grupos (lineal en
 * partidos, con el desempate de la mini-tabla encima), se ordenan los
 * clasificados y se siembra el cuadro, que es cuadrático en su tamaño por el
 * paso de deshacer revanchas.
 */
function costeDeUnEscenario(grupos: GrupoDeCategoria[], cuadro: number): number {
  const parejas = grupos.reduce((a, g) => a + g.pairIds.length, 0);
  const partidos = grupos.reduce((a, g) => a + g.matches.length, 0);
  return partidos * 4 + parejas * 6 + cuadro * cuadro;
}

/** Cuántos pendientes caben en el presupuesto. */
function kMaximo(coste: number, presupuesto: number): number {
  let k = 0;
  while (coste * 2 ** (k + 1) <= presupuesto && k < 24) k++;
  return k;
}

// ───────────────────────────────────────────
// Utilidades
// ───────────────────────────────────────────

/** El dato tiene que llegar. No hay default. Ver la misma nota en ../clinch. */
function exigirEntero(valor: unknown, campo: string, minimo: number): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < minimo) {
    throw new Error(
      `analizarFuturo: ${campo} es obligatorio y debe ser un entero >= ${minimo}; ` +
        `llegó ${JSON.stringify(valor)}. NO hay valor por defecto.`,
    );
  }
  return valor;
}

const nombreDe = (id: string, nombres: Record<string, string>) => nombres[id] ?? id;

/** Aplica un escenario a los pendientes: bit=0 gana A, bit=1 gana B. */
function conEscenario(m: MatchResultInput, ganaB: boolean): MatchResultInput {
  return {
    ...m,
    played: true,
    winnerPairId: ganaB ? m.pairBId : m.pairAId,
    // Marcador sintético SOLO para que las tablas tengan forma. NUNCA se usa
    // para afirmar nada: los games de verdad son desconocidos y todas las
    // conclusiones de este motor salen de los PUNTOS. Ver la cabecera.
    sets: m.sets.length
      ? m.sets
      : [
          { gamesA: ganaB ? 0 : 6, gamesB: ganaB ? 6 : 0, isSuperTiebreak: false },
          { gamesA: ganaB ? 0 : 6, gamesB: ganaB ? 6 : 0, isSuperTiebreak: false },
        ],
  };
}

/** Lo que se sabe de la pareja en UN escenario. */
interface Foto {
  posicionEnGrupo: number;
  empateSinResolver: boolean;
  /** Rivales de la repesca que PODRÍAN quedar por delante (empate a puntos incluido). */
  repescaPodrianAdelantarme: number;
  /** Rivales de la repesca que quedan por delante CON CERTEZA (más puntos). */
  repescaSeguroDelante: number;
  /** Los que empatan a puntos: solo los games los separan. */
  repescaEmpatanAPuntos: string[];
  /** Idem para la carrera del bye, contra todos los clasificados. */
  byePodrianAdelantarme: number;
  byeSeguroDelante: number;
  byeEmpatanAPuntos: string[];
  /** Lo que dice la siembra REAL de este escenario. */
  siembraDaBye: boolean;
  siembraClasifica: boolean;
}

// ───────────────────────────────────────────
// El motor
// ───────────────────────────────────────────

export function analizarFuturo(entrada: EntradaFuturo): AnalisisFuturo {
  const advancePerGroup = exigirEntero(entrada?.advancePerGroup, 'advancePerGroup', 1);
  const bestExtra = exigirEntero(entrada?.bestExtraQualifiers, 'bestExtraQualifiers', 0);
  const cfg = entrada.config ?? DEFAULT_STANDINGS_CONFIG;
  const { grupos, pairId, nombres } = entrada;

  const miGrupo = grupos.find((g) => g.pairIds.includes(pairId));
  if (!miGrupo) throw new Error(`analizarFuturo: ${pairId} no está en ningún grupo.`);

  const pendientes = grupos.flatMap((g) =>
    g.matches
      .filter((m) => !m.played || m.winnerPairId == null)
      .map((m) => ({ grupo: g, match: m })),
  );
  const k = pendientes.length;

  const cuadro = cuadroDe(grupos.length, advancePerGroup, bestExtra);
  const coste = costeDeUnEscenario(grupos, cuadro.bracketSize);
  const kMax = kMaximo(coste, entrada.presupuesto ?? PRESUPUESTO);

  if (k > kMax) {
    return {
      estado: 'demasiado_pronto',
      posicionesPosiblesEnGrupo: [],
      faltan: k,
      // Sale del mismo cálculo que acaba de hacerse: no cuesta nada, y
      // "faltan 23; te digo algo cuando queden 6" sí se puede usar.
      respondoCuandoQueden: kMax,
    };
  }

  // ── Enumeración ────────────────────────────────────────────────────────
  const escenarios = 1 << k;
  const fotos: Foto[] = [];

  for (let mask = 0; mask < escenarios; mask++) {
    fotos.push(fotoDelEscenario(mask, pendientes, grupos, advancePerGroup, bestExtra, pairId, cfg, nombres));
  }

  const posiciones = [...new Set(fotos.map((f) => f.posicionEnGrupo))].sort((a, b) => a - b);

  // Un empate que el reglamento no resuelve no se responde: hace falta sorteo.
  if (fotos.every((f) => f.empateSinResolver)) {
    return { estado: 'empate_sin_resolver', posicionesPosiblesEnGrupo: posiciones, faltan: k };
  }

  // ── Carrera A: repesca ─────────────────────────────────────────────────
  const juegaRepesca = bestExtra > 0 && posiciones.includes(advancePerGroup + 1);
  const repesca = juegaRepesca
    ? carreraDe(fotos, pendientes, bestExtra, 'repesca', grupos, advancePerGroup, bestExtra, pairId, cfg, nombres)
    : undefined;

  // ── Carrera B: bye ─────────────────────────────────────────────────────
  const aplicaBye = cuadro.byes > 0;
  const bye = aplicaBye
    ? {
        aplica: true,
        byesEnElCuadro: cuadro.byes,
        ...carreraDe(fotos, pendientes, cuadro.byes, 'bye', grupos, advancePerGroup, bestExtra, pairId, cfg, nombres),
      }
    : { aplica: false, byesEnElCuadro: 0, estado: 'fuera' as const, peorPuestoPosible: null, plazas: 0, partidosQueImportan: [], dependeDeGamesContra: [] };

  // ── El estado global: clasificar es lo que se pregunta primero ─────────
  const clasificaSiempre = fotos.every((f) => clasificaSeguro(f, advancePerGroup, bestExtra));
  const clasificaNunca = fotos.every((f) => imposibleClasificar(f, advancePerGroup, bestExtra));

  return {
    estado: clasificaSiempre ? 'dentro' : clasificaNunca ? 'fuera' : 'depende',
    posicionesPosiblesEnGrupo: posiciones,
    repesca,
    bye,
    faltan: k,
  };
}

/** ¿Pasa en ESTE escenario pase lo que pase con los games? */
function clasificaSeguro(f: Foto, advancePerGroup: number, bestExtra: number): boolean {
  if (f.empateSinResolver) return false;
  if (f.posicionEnGrupo <= advancePerGroup) return true;           // directo
  if (f.posicionEnGrupo !== advancePerGroup + 1) return false;      // ni repesca
  return f.repescaPodrianAdelantarme < bestExtra;
}

/** ¿No pasa en ESTE escenario, decidan lo que decidan los games? */
function imposibleClasificar(f: Foto, advancePerGroup: number, bestExtra: number): boolean {
  if (f.posicionEnGrupo <= advancePerGroup) return false;
  if (f.posicionEnGrupo !== advancePerGroup + 1) return true;
  return f.repescaSeguroDelante >= bestExtra;
}

/**
 * Una carrera resuelta sobre todos los escenarios, con su análisis de pivote.
 *
 * EL PIVOTE ES LO QUE HACE ÚTIL LA RESPUESTA. Sin él la lista serían los 9
 * partidos que faltan, que es lo que el jugador ya sabe. Con él son los dos
 * que de verdad cambian su suerte.
 */
function carreraDe(
  fotos: Foto[],
  pendientes: { grupo: GrupoDeCategoria; match: MatchResultInput }[],
  plazas: number,
  cual: 'repesca' | 'bye',
  grupos: GrupoDeCategoria[],
  advancePerGroup: number,
  bestExtra: number,
  pairId: string,
  cfg: StandingsConfig,
  nombres: Record<string, string>,
): Carrera {
  const dentroEn = (f: Foto) => (cual === 'repesca'
    ? clasificaSeguro(f, advancePerGroup, bestExtra)
    : f.byePodrianAdelantarme < plazas && f.siembraDaBye);
  const fueraEn = (f: Foto) => (cual === 'repesca'
    ? imposibleClasificar(f, advancePerGroup, bestExtra)
    : f.byeSeguroDelante >= plazas || !f.siembraDaBye);

  const dentroSiempre = fotos.every(dentroEn);
  const fueraSiempre = fotos.every(fueraEn);
  const estado: EstadoCarrera = dentroSiempre ? 'dentro' : fueraSiempre ? 'fuera' : 'depende';

  // El PEOR puesto: el escenario en que más rivales se le ponen delante, y
  // dentro de él, con todos los empates a puntos perdidos.
  const peor = Math.max(
    ...fotos.map((f) => 1 + (cual === 'repesca' ? f.repescaPodrianAdelantarme : f.byePodrianAdelantarme)),
  );

  const empatan = [...new Set(
    fotos.flatMap((f) => (cual === 'repesca' ? f.repescaEmpatanAPuntos : f.byeEmpatanAPuntos)),
  )].sort((a, b) => a.localeCompare(b, 'es'));

  const partidosQueImportan = estado === 'depende'
    ? pivotes(fotos, pendientes, dentroEn, fueraEn, pairId, nombres)
    : [];

  return { estado, peorPuestoPosible: peor, plazas, partidosQueImportan, dependeDeGamesContra: empatan };
}

/**
 * Los partidos cuyo resultado cambia la respuesta, y qué conviene en cada uno.
 *
 * Se compara el escenario `mask` con `mask | bit`: si el veredicto difiere para
 * algún par, ese partido importa. Los que no cambian nada no se listan — son
 * exactamente el ruido que hacía inservible el aviso viejo.
 */
function pivotes(
  fotos: Foto[],
  pendientes: { grupo: GrupoDeCategoria; match: MatchResultInput }[],
  dentroEn: (f: Foto) => boolean,
  fueraEn: (f: Foto) => boolean,
  pairId: string,
  nombres: Record<string, string>,
): PartidoQueImporta[] {
  const k = pendientes.length;
  const total = 1 << k;
  const out: PartidoQueImporta[] = [];

  for (let bit = 0; bit < k; bit++) {
    let cambia = false;
    let buenoConA = 0;
    let buenoConB = 0;
    for (let mask = 0; mask < total; mask++) {
      if ((mask >> bit) & 1) continue;
      const conA = fotos[mask];
      const conB = fotos[mask | (1 << bit)];
      if (dentroEn(conA) !== dentroEn(conB) || fueraEn(conA) !== fueraEn(conB)) cambia = true;
      if (dentroEn(conA) && !dentroEn(conB)) buenoConA++;
      if (dentroEn(conB) && !dentroEn(conA)) buenoConB++;
    }
    if (!cambia) continue;

    const { grupo, match } = pendientes[bit];
    // El propio partido de quien pregunta no se lista como "te conviene que
    // gane X": ya sabe que le conviene ganar.
    const esMio = match.pairAId === pairId || match.pairBId === pairId;
    const conviene =
      esMio ? nombreDe(pairId, nombres)
      : buenoConA > buenoConB ? nombreDe(match.pairAId, nombres)
      : buenoConB > buenoConA ? nombreDe(match.pairBId, nombres)
      : null;

    out.push({
      matchId: match.matchId,
      grupo: grupo.nombre,
      parejaA: nombreDe(match.pairAId, nombres),
      parejaB: nombreDe(match.pairBId, nombres),
      meConviene: conviene,
    });
  }
  return out;
}

/** Una foto del escenario `mask`: tablas, clasificados y siembra REALES. */
function fotoDelEscenario(
  mask: number,
  pendientes: { grupo: GrupoDeCategoria; match: MatchResultInput }[],
  grupos: GrupoDeCategoria[],
  advancePerGroup: number,
  bestExtra: number,
  pairId: string,
  cfg: StandingsConfig,
  nombres: Record<string, string>,
): Foto {
  // 1) Tablas de cada grupo con los pendientes resueltos.
  const decidido = new Map<string, MatchResultInput>();
  pendientes.forEach(({ match }, bit) => {
    decidido.set(match.matchId, conEscenario(match, !!((mask >> bit) & 1)));
  });

  const tablas = new Map<string, StandingRow[]>();
  const qualifierRows: QualifierStanding[] = [];
  for (const g of grupos) {
    const ms = g.matches.map((m) => decidido.get(m.matchId) ?? m);
    const tabla = computeStandings(g.pairIds, ms, cfg);
    tablas.set(g.groupId, tabla);
    for (const r of tabla) {
      qualifierRows.push({
        pairId: r.pairId, groupId: g.groupId, position: r.position, points: r.points,
        setsWon: r.setsWon, setsLost: r.setsLost, gamesWon: r.gamesWon, gamesLost: r.gamesLost,
      });
    }
  }

  const miGrupo = grupos.find((g) => g.pairIds.includes(pairId))!;
  const miFila = tablas.get(miGrupo.groupId)!.find((r) => r.pairId === pairId)!;

  // 2) El pipeline REAL de siembra. No una réplica: si el análisis y la
  //    siembra usaran criterios distintos, el aviso sería peor que no darlo.
  const clasificados = selectQualifiers(qualifierRows, advancePerGroup, bestExtra);
  const siembraClasifica = clasificados.some((q) => q.pairId === pairId);
  let siembraDaBye = false;
  if (clasificados.length >= 2) {
    const siembra = computeSeeding(clasificados);
    const mio = siembra.matches.find((mm) => mm.pairAId === pairId || mm.pairBId === pairId);
    siembraDaBye = !!mio && (mio.pairAId === null || mio.pairBId === null);
  }

  // 3) Certeza POR PUNTOS. Los games del escenario son sintéticos y no valen
  //    para afirmar nada; lo único firme es quién ganó cada partido.
  const rivalesRepesca = qualifierRows.filter(
    (r) => r.pairId !== pairId && r.position === advancePerGroup + 1,
  );
  const rivalesBye = qualifierRows.filter(
    (r) => r.pairId !== pairId && clasificados.some((q) => q.pairId === r.pairId),
  );

  const cuenta = (rivales: QualifierStanding[], mejorPosicionCuenta: boolean) => {
    let podrian = 0, seguros = 0;
    const empatan: string[] = [];
    for (const r of rivales) {
      const porPosicion = mejorPosicionCuenta && r.position < miFila.position;
      if (porPosicion || r.points > miFila.points) { podrian++; seguros++; continue; }
      if (mejorPosicionCuenta && r.position > miFila.position) continue;
      if (r.points === miFila.points) { podrian++; empatan.push(nombreDe(r.pairId, nombres)); }
    }
    return { podrian, seguros, empatan };
  };

  // En la repesca todos los rivales están en el mismo puesto de grupo, así que
  // la posición no separa: separan los puntos. En la carrera del bye sí, porque
  // un primero siempre se siembra por delante de un segundo.
  const rep = cuenta(rivalesRepesca, false);
  const byeC = cuenta(rivalesBye, true);

  return {
    posicionEnGrupo: miFila.position,
    empateSinResolver: miFila.empateSinResolver,
    repescaPodrianAdelantarme: rep.podrian,
    repescaSeguroDelante: rep.seguros,
    repescaEmpatanAPuntos: rep.empatan,
    byePodrianAdelantarme: byeC.podrian,
    byeSeguroDelante: byeC.seguros,
    byeEmpatanAPuntos: byeC.empatan,
    siembraDaBye,
    siembraClasifica,
  };
}
