// src/lib/engine/expres/clinch.ts
// "Ya clasificaste" en un grupo de exprés. Determinista.
//
// ► POR QUÉ NO SE TOCA ../clinch, QUE ERA LA EXCEPCIÓN PREVISTA
//
//   El plan decía que el clinch sería "la misma estructura con otra
//   constante": donde hoy proyecta `ahora + pointsWin × pendientes`, en suma 6
//   proyectaría `ahora + 6 × pendientes`. Al abrir el motor resulta que no:
//
//   1. `applyScenario` enumera con una MÁSCARA DE BITS —bit 0 gana A, bit 1
//      gana B— y fabrica un 6-0 6-0 sintético. En suma 6 no hay ganador y el
//      resultado no es binario: el balance de un partido puede ser +6, +4, +2,
//      0, −2, −4 o −6. Son SIETE salidas por partido, no dos. El espacio de
//      escenarios no es 2^k, es 7^k, y la máscara de bits no sirve.
//
//   2. `posicionesPosibles` llama a `computeStandings`, que ordena por puntos
//      de victoria. Aquí no hay victorias que contar.
//
//   3. Media mitad de ese motor es la carrera de mejores segundos entre grupos
//      —es lo que le obliga a mirar la categoría entera y a exigir
//      `bestExtraQualifiers`—. En un exprés clasifican 4 por grupo, sin
//      repesca y sin comparar grupos: cada grupo se resuelve solo.
//
//   Meter todo eso dentro sería reescribirlo, no configurarlo. Así que también
//   vive aquí, y la línea exprés acaba SIN TOCAR NI UN MOTOR EXISTENTE.
//
//   (Y la constante del plan tenía un signo de más: el suelo no es
//   `ahora + 0 × pendientes` sino `ahora − 6 × pendientes`. En puntos de
//   victoria perder suma cero; en suma 6 perder RESTA. Con 0 de suelo, el
//   clinch le diría "ya clasificaste" a una pareja que todavía puede hundirse
//   seis games por partido, que es justo el fallo que este motor promete no
//   cometer nunca.)
//
// ► LA PROMESA, Y DE QUÉ LADO SE FALLA
//
//   'clinched' significa "clasifica pase lo que pase". Decírselo a alguien y
//   quitárselo media hora después es el peor fallo posible de esta pantalla.
//   Así que todo aquí está inclinado hacia 'alive': puede sobrar un 'alive'
//   donde ya estaba matemáticamente dentro; nunca puede sobrar un 'clinched'.
//
//   Dos decisiones concretas de ese lado:
//
//   · LOS EMPATES SE TRATAN COMO NO RESUELTOS. Para decidir si está dentro se
//     usa su PEOR puesto posible (pierde todos los empates); para decidir si
//     está fuera, el MEJOR (los gana todos). A veces el enfrentamiento directo
//     sí habría separado el empate y aquí se dice 'alive' de más — pero si el
//     empate acaba sin resolver decide el organizador, y entonces no estaba
//     garantizada de verdad.
//
//   · LOS PARTIDOS A MEDIAS NO EXISTEN. Un suma 6 se captura entero, así que
//     este problema —que en el motor largo obliga a ignorar los partidos en
//     curso— aquí no se presenta: o está el marcador o no está.

import type { ClinchStatus } from '../types';
import { CLASIFICAN_POR_GRUPO } from './reglas';
import { GAMES_POR_PARTIDO } from './suma6';
import { computeTablaExpres, type ResultadoSuma6 } from './tabla';

/**
 * Los tres estados que existen en un exprés.
 *
 * Es un subconjunto del enum `public.clinch_status` a propósito:
 * 'repechage_pending' no tiene sentido sin repesca, y dejarlo disponible
 * invitaría a producirlo. El tipo se importa para que sigan siendo gemelos: si
 * alguien renombra un valor en la base, esto deja de compilar.
 */
export type EstadoClinchExpres = Extract<ClinchStatus, 'clinched' | 'alive' | 'eliminated'>;

/** Los siete balances que puede dejar un partido, vistos desde la pareja A. */
export const DELTAS_SUMA6: readonly number[] = [6, 4, 2, 0, -2, -4, -6] as const;

/**
 * Tope de escenarios a enumerar.
 *
 * Con 7 salidas por partido, k partidos pendientes son 7^k escenarios: 4
 * partidos son 2.401 y 6 son 117.649, que se resuelven en milisegundos; 8 ya
 * son 5.764.801 y la pantalla se congelaría. Por encima del tope se responde
 * con cotas, que dicen menos pero nunca dicen de más.
 *
 * En la práctica el caso que importa —la última ronda, cuando el clinch es
 * noticia— cae dentro: una ronda de un grupo de 8 son 4 partidos y de uno de
 * 12 son 6.
 */
export const MAX_ESCENARIOS = 250_000;

export interface ClinchExpresResult {
  pairId: string;
  estado: EstadoClinchExpres;
  balance: number;
  pendientes: number;
  /** Mejor y peor balance final alcanzable: `balance ± 6 × pendientes`. */
  balanceMaximo: number;
  balanceMinimo: number;
  /** Partidos que todavía pueden cambiar su suerte. Vacío si ya está decidida. */
  dependeDe: string[];
  /**
   * La respuesta salió de cotas y no de enumerar todos los escenarios.
   * Sigue siendo segura: solo puede pecar de prudente.
   */
  aproximado: boolean;
}

export interface EntradaClinchExpres {
  pairIds: readonly string[];
  /** Todos los partidos del grupo, jugados o no. */
  resultados: readonly ResultadoSuma6[];
  /** Por defecto CLASIFICAN_POR_GRUPO (4). */
  clasifican?: number;
}

/**
 * Estado de clasificación de cada pareja de UN grupo.
 *
 *   clinched   — está dentro en todos los escenarios posibles.
 *   alive      — todavía puede entrar en alguno.
 *   eliminated — no puede entrar en ninguno. Y solo entonces.
 */
export function computeClinchExpres(entrada: EntradaClinchExpres): ClinchExpresResult[] {
  const clasifican = entrada?.clasifican ?? CLASIFICAN_POR_GRUPO;
  // La tabla valida la entrada entera y ya calcula los balances. Reutilizarla
  // evita que las dos pantallas puedan discrepar sobre el mismo grupo.
  const tabla = computeTablaExpres({
    pairIds: entrada?.pairIds,
    resultados: entrada?.resultados,
    clasifican,
  });

  const ids = tabla.filas.map((f) => f.pairId);
  const indice = new Map(ids.map((id, i) => [id, i]));
  const balance = ids.map((id) => tabla.filas.find((f) => f.pairId === id)!.balance);

  const pendientes = (entrada.resultados as ResultadoSuma6[]).filter(
    (r) => r.gamesA === null || r.gamesB === null,
  );
  const pendientesDe = new Array<number>(ids.length).fill(0);
  for (const m of pendientes) {
    pendientesDe[indice.get(m.pairAId)!]++;
    pendientesDe[indice.get(m.pairBId)!]++;
  }

  const k = pendientes.length;
  const escenarios = Math.pow(DELTAS_SUMA6.length, k);

  const comun = (i: number) => ({
    pairId: ids[i],
    balance: balance[i],
    pendientes: pendientesDe[i],
    balanceMaximo: balance[i] + GAMES_POR_PARTIDO * pendientesDe[i],
    balanceMinimo: balance[i] - GAMES_POR_PARTIDO * pendientesDe[i],
  });

  if (escenarios <= MAX_ESCENARIOS) {
    return exacto(ids, balance, pendientes, indice, clasifican, comun);
  }
  return porCotas(ids, pendientes, indice, clasifican, comun);
}

// ── Camino exacto: enumerar los 7^k escenarios ──────────────────────────────

function exacto(
  ids: string[],
  balanceBase: number[],
  pendientes: ResultadoSuma6[],
  indice: Map<string, number>,
  clasifican: number,
  comun: (i: number) => Omit<ClinchExpresResult, 'estado' | 'dependeDe' | 'aproximado'>,
): ClinchExpresResult[] {
  const n = ids.length;
  const k = pendientes.length;
  const bal = [...balanceBase];

  /** ¿Está dentro en TODOS los escenarios? (arranca en true y se va apagando) */
  const siempreDentro = new Array<boolean>(n).fill(true);
  /** ¿Puede estar dentro en ALGUNO? */
  const puedeDentro = new Array<boolean>(n).fill(false);
  /** puedeConValor[pareja][partido][valor] — para saber qué partidos importan. */
  const puedeConValor = Array.from({ length: n }, () =>
    Array.from({ length: k }, () => new Array<boolean>(DELTAS_SUMA6.length).fill(false)),
  );

  const eleccion = new Array<number>(k).fill(0);
  const idxA = pendientes.map((m) => indice.get(m.pairAId)!);
  const idxB = pendientes.map((m) => indice.get(m.pairBId)!);

  const evaluar = () => {
    for (let p = 0; p < n; p++) {
      let encima = 0;
      let iguales = 0;
      for (let q = 0; q < n; q++) {
        if (q === p) continue;
        if (bal[q] > bal[p]) encima++;
        else if (bal[q] === bal[p]) iguales++;
      }
      // Peor puesto: pierde todos los empates. Mejor puesto: los gana todos.
      if (encima + iguales + 1 > clasifican) siempreDentro[p] = false;
      if (encima + 1 <= clasifican) {
        puedeDentro[p] = true;
        for (let i = 0; i < k; i++) puedeConValor[p][i][eleccion[i]] = true;
      }
    }
  };

  const bajar = (i: number): void => {
    if (i === k) {
      evaluar();
      return;
    }
    for (let v = 0; v < DELTAS_SUMA6.length; v++) {
      const d = DELTAS_SUMA6[v];
      bal[idxA[i]] += d;
      bal[idxB[i]] -= d;
      eleccion[i] = v;
      bajar(i + 1);
      bal[idxA[i]] -= d;
      bal[idxB[i]] += d;
    }
  };

  bajar(0);

  return ids.map((_, p) => {
    const estado: EstadoClinchExpres = siempreDentro[p]
      ? 'clinched'
      : puedeDentro[p]
        ? 'alive'
        : 'eliminated';
    return {
      ...comun(p),
      estado,
      // Un partido importa si con unos resultados esta pareja puede entrar y
      // con otros no. Si su suerte ya está decidida, no depende de ninguno.
      dependeDe:
        estado === 'alive'
          ? pendientes
              .filter((_, i) => new Set(puedeConValor[p][i]).size > 1)
              .map((m) => m.matchId)
          : [],
      aproximado: false,
    };
  });
}

// ── Camino por cotas: demasiados escenarios para enumerar ───────────────────

function porCotas(
  ids: string[],
  pendientes: ResultadoSuma6[],
  indice: Map<string, number>,
  clasifican: number,
  comun: (i: number) => Omit<ClinchExpresResult, 'estado' | 'dependeDe' | 'aproximado'>,
): ClinchExpresResult[] {
  const n = ids.length;
  const c = ids.map((_, i) => comun(i));
  const pares = pendientes.map((m) => [indice.get(m.pairAId)!, indice.get(m.pairBId)!] as const);

  return ids.map((_, p) => {
    const suelo = c[p].balanceMinimo;
    const techo = c[p].balanceMaximo;

    // Quién PUEDE terminar por encima de esta pareja en su peor día.
    const amenazas: number[] = [];
    // Quién está por encima HAGA LO QUE HAGA, incluso en su mejor día.
    let segurasEncima = 0;
    for (let q = 0; q < n; q++) {
      if (q === p) continue;
      if (c[q].balanceMaximo > suelo) amenazas.push(q);
      if (c[q].balanceMinimo > techo) segurasEncima++;
    }

    const estado: EstadoClinchExpres = !puedenEcharla(amenazas, clasifican, suelo, c, pares)
      ? 'clinched'
      : segurasEncima >= clasifican
        ? 'eliminated'
        : 'alive';

    return {
      ...c[p],
      estado,
      // Sin enumerar no se puede saber QUÉ partido concreto la mueve; lo
      // honesto es decir que depende de todos los que faltan.
      dependeDe: estado === 'alive' ? pendientes.map((m) => m.matchId) : [],
      aproximado: true,
    };
  });
}

/**
 * ¿Puede haber `clasifican` parejas por encima del suelo de esta?
 *
 * Contar amenazas una a una es demasiado flojo: ignora que los games son un
 * juego de suma cero. Si cuatro parejas tienen que quedar todas por encima, y
 * dos de ellas se enfrentan entre sí, lo que gana una lo pierde la otra.
 *
 * Así que se comprueba conjunto a conjunto: el balance total que un grupo de
 * `clasifican` parejas puede llegar a acumular es su balance de hoy más 6 por
 * cada partido pendiente contra alguien de FUERA del grupo —los de dentro se
 * anulan—. Si ni así llegan a superar el umbral de media, ese conjunto es
 * imposible. Si ningún conjunto es posible, la pareja está dentro.
 *
 * Es una relajación: puede decir "sí es posible" para un conjunto que en
 * realidad no lo es, y entonces se responde 'alive' de más. Nunca al revés.
 */
function puedenEcharla(
  amenazas: readonly number[],
  clasifican: number,
  suelo: number,
  c: readonly { balance: number }[],
  pares: readonly (readonly [number, number])[],
): boolean {
  if (amenazas.length < clasifican) return false;

  let posible = false;
  combinaciones(amenazas, clasifican, (grupo) => {
    const dentro = new Set(grupo);
    let suma = 0;
    for (const q of grupo) suma += c[q].balance;
    for (const [a, b] of pares) {
      if (dentro.has(a) !== dentro.has(b)) suma += GAMES_POR_PARTIDO;
    }
    if (suma > clasifican * suelo) {
      posible = true;
      return false; // basta con uno
    }
    return true;
  });
  return posible;
}

/** Subconjuntos de tamaño `k`. `visita` devuelve false para cortar. */
function combinaciones(
  origen: readonly number[],
  k: number,
  visita: (grupo: number[]) => boolean,
): void {
  const actual: number[] = [];
  let seguir = true;
  const bajar = (desde: number) => {
    if (!seguir) return;
    if (actual.length === k) {
      seguir = visita([...actual]);
      return;
    }
    for (let i = desde; i < origen.length && seguir; i++) {
      actual.push(origen[i]);
      bajar(i + 1);
      actual.pop();
    }
  };
  bajar(0);
}
