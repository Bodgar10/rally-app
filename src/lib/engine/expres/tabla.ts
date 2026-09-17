// src/lib/engine/expres/tabla.ts
// Tabla de un grupo de exprés. Determinista. No importa nada de ../standings.
//
// LA TABLA NO TIENE GANADOS NI PERDIDOS
//
//   En suma 6 el partido no tiene ganador: sumas tus games y restas los del
//   rival. Así que la tabla tiene cuatro columnas —PJ, GF, GC y balance— y se
//   ordena por balance. Un 4-2 y un 3-3 no son "una victoria y un empate":
//   son +2 y 0.
//
//   Por eso no se reutiliza `computeStandings`. Aquel motor ordena por puntos
//   de victoria y los games son desempate; aquí no hay victorias que contar y
//   los games son el criterio principal. Invertir eso con una bandera dentro
//   del motor viejo es reescribirlo, no configurarlo.
//
// ► EL DESCUBRIMIENTO QUE HACE QUE LA CADENA DE DESEMPATE SEA TAN CORTA
//
//   Todas las parejas juegan los mismos partidos, y cada partido son 6 games
//   exactos. Entonces GF + GC vale lo mismo para todas: con 5 partidos, 30.
//   Y de ahí sale que
//
//        balance = GF − GC = GF − (30 − GF) = 2·GF − 30
//
//   o sea que **ordenar por balance, por games a favor o por menos games en
//   contra es LA MISMA ORDENACIÓN**. No son tres criterios: es uno escrito de
//   tres maneras. Dos parejas empatadas a balance están empatadas también a GF
//   y a GC, exactamente, siempre.
//
//   Encadenar "y si empatan, games a favor" sería teatro: nunca separaría a
//   nadie, y daría la impresión de que el reglamento tiene más recursos de los
//   que tiene. Después del balance solo quedan dos cosas reales: qué pasó
//   cuando se enfrentaron, y la decisión del organizador.
//
// ► Y EL ENFRENTAMIENTO DIRECTO A MENUDO NO EXISTE
//
//   En un grupo de 8 cada pareja juega 5 de sus 7 rivales, así que dos
//   empatadas pueden no haberse visto nunca. No es un caso raro: simulando
//   torneos de cupo 16, cuando hay empate justo en la línea de clasificación
//   el bloque no se había enfrentado entero el 42% de las veces.
//
//   Cuando sí aplica, resuelve el 82%. Sumando todo, el organizador acaba
//   teniendo que decidir en torno al 25% de los torneos de cupo 16 —uno de
//   cada cuatro domingos— y más cuanto mayor es el grupo. Esa pantalla no es
//   un caso límite: es camino principal. (Simulación con resultados
//   uniformes, que es el peor caso; con diferencias de nivel reales los
//   balances se separan más.)

import { CLASIFICAN_POR_GRUPO } from './reglas';
import { GAMES_POR_PARTIDO, validarMarcadorSuma6 } from './suma6';

/** Un partido de grupo tal como lo consume la tabla. */
export interface ResultadoSuma6 {
  matchId: string;
  pairAId: string;
  pairBId: string;
  /** null los dos si todavía no se ha jugado. */
  gamesA: number | null;
  gamesB: number | null;
}

/** Qué colocó a una pareja en su puesto. */
export type CriterioExpres =
  /** Su balance de games, sin empate que resolver. */
  | 'balance'
  /** Empataba, y lo que pasó cuando se enfrentaron las separó. */
  | 'directo'
  /** Empataba y no había forma de separarlas: lo decidió el organizador. */
  | 'manual'
  /** Empataba y nadie lo ha resuelto todavía. El puesto NO es deportivo. */
  | 'sin_resolver';

export interface FilaTablaExpres {
  pairId: string;
  posicion: number;
  jugados: number;
  gamesFavor: number;
  gamesContra: number;
  /** gamesFavor − gamesContra. La columna que ordena. */
  balance: number;
  criterio: CriterioExpres;
  /**
   * True cuando sigue empatada con otra(s) y el motor no puede separarlas.
   * El puesto que se publica es estable pero arbitrario: sale del id.
   */
  empateSinResolver: boolean;
  /** Con quién sigue empatada. Vacío si su puesto está decidido. */
  empatadaCon: string[];
}

export interface EmpateExpres {
  balance: number;
  pairIds: string[];
  posiciones: number[];
  /** El empate cruza la línea de clasificación: decide quién juega cuartos. */
  decideClasificacion: boolean;
  motivo:
    /** No se enfrentaron todas entre sí: la mini-tabla no significaría nada. */
    | 'no_se_enfrentaron'
    /** Se enfrentaron y el resultado entre ellas tampoco las separa. */
    | 'directo_no_separa';
}

export interface TablaExpres {
  grupo: string;
  clasifican: number;
  filas: FilaTablaExpres[];
  /**
   * Todas han jugado el mismo número de partidos, así que los balances se
   * pueden comparar. En mitad del torneo es normal que sea false.
   */
  comparable: boolean;
  /** Todos los partidos del grupo están capturados. */
  grupoTerminado: boolean;
  empatesSinResolver: EmpateExpres[];
  /**
   * El grupo terminó y hay un empate sin resolver que decide quién pasa a
   * cuartos. ES LA SEÑAL PARA PEDIRLE AL ORGANIZADOR QUE DECIDA: mientras sea
   * true, el cuadro no se puede sembrar sin inventarse un orden.
   */
  bloqueaClasificacion: boolean;
}

export interface EntradaTablaExpres {
  /** Etiqueta del grupo, solo para poder identificarlo en la salida. */
  grupo?: string;
  pairIds: readonly string[];
  /** Todos los partidos del grupo, jugados o no. */
  resultados: readonly ResultadoSuma6[];
  /** Por defecto CLASIFICAN_POR_GRUPO (4). */
  clasifican?: number;
  /**
   * El orden que el ORGANIZADOR decidió para un empate que el reglamento no
   * separa. `pairId -> 1, 2, 3…`.
   *
   * Solo se aplica a un bloque que sigue siendo un empate irresoluble Y cuyas
   * parejas son exactamente las que traen valor —la misma regla que
   * `group_standings.desempate_manual` (migración 064)—. Si se corrige un
   * resultado y el empate desaparece o cambia de miembros, el dato se ignora
   * solo: un orden viejo no puede reordenar una tabla que sí está decidida.
   */
  ordenManual?: Record<string, number>;
}

interface Stats {
  jugados: number;
  gamesFavor: number;
  gamesContra: number;
}

/**
 * Calcula la tabla de un grupo de exprés.
 *
 * El orden final es: balance → enfrentamiento directo (si existe y separa) →
 * decisión del organizador → sin resolver. No hay más criterios, y el
 * comentario de cabecera explica por qué no puede haberlos.
 */
export function computeTablaExpres(entrada: EntradaTablaExpres): TablaExpres {
  const pairIds = exigirParejas(entrada?.pairIds);
  const resultados = exigirResultados(entrada?.resultados, pairIds);
  const clasifican = entrada?.clasifican ?? CLASIFICAN_POR_GRUPO;

  const stats = new Map<string, Stats>(
    pairIds.map((id) => [id, { jugados: 0, gamesFavor: 0, gamesContra: 0 }]),
  );
  /** balance de A frente a B en su enfrentamiento, si lo hubo y está jugado. */
  const directo = new Map<string, number>();

  for (const r of resultados) {
    if (r.gamesA === null || r.gamesB === null) continue;
    const a = stats.get(r.pairAId)!;
    const b = stats.get(r.pairBId)!;
    a.jugados++;
    b.jugados++;
    a.gamesFavor += r.gamesA;
    a.gamesContra += r.gamesB;
    b.gamesFavor += r.gamesB;
    b.gamesContra += r.gamesA;
    directo.set(`${r.pairAId}|${r.pairBId}`, r.gamesA - r.gamesB);
    directo.set(`${r.pairBId}|${r.pairAId}`, r.gamesB - r.gamesA);
  }

  const balanceDe = (id: string) => {
    const s = stats.get(id)!;
    return s.gamesFavor - s.gamesContra;
  };

  // Orden base: balance descendente. El desempate técnico por id NO es
  // deportivo — existe solo para que la salida sea un orden total y
  // determinista, y las filas afectadas van marcadas.
  const ordenadas = [...pairIds].sort((x, y) => balanceDe(y) - balanceDe(x) || (x < y ? -1 : 1));

  const bloques = agrupar(ordenadas, balanceDe);
  const filas: FilaTablaExpres[] = [];
  const empates: EmpateExpres[] = [];

  for (const bloque of bloques) {
    if (bloque.length === 1) {
      filas.push(fila(bloque[0], 'balance', []));
      continue;
    }

    // ¿Se enfrentaron TODAS entre sí? Si no, la mini-tabla compararía a una
    // pareja que jugó ese duelo con otra que no lo jugó. No se aplica.
    const completo = bloque.every((x, i) =>
      bloque.slice(i + 1).every((y) => directo.has(`${x}|${y}`)),
    );

    const subBloques = completo
      ? agrupar(
          [...bloque].sort(
            (x, y) => miniBalance(y, bloque, directo) - miniBalance(x, bloque, directo) || (x < y ? -1 : 1),
          ),
          (id) => miniBalance(id, bloque, directo),
        )
      : [bloque];

    for (const sub of subBloques) {
      if (sub.length === 1) {
        // Solo se llega aquí habiendo partido un bloque con la mini-tabla:
        // si no se enfrentaron todas, `subBloques` es el bloque entero.
        filas.push(fila(sub[0], 'directo', []));
        continue;
      }

      const manual = ordenDelOrganizador(sub, entrada?.ordenManual, pairIds);
      if (manual) {
        for (const id of manual) filas.push(fila(id, 'manual', []));
        continue;
      }

      const posicionInicial = filas.length + 1;
      for (const id of sub) {
        filas.push(fila(id, 'sin_resolver', sub.filter((o) => o !== id)));
      }
      empates.push({
        balance: balanceDe(sub[0]),
        pairIds: [...sub],
        posiciones: sub.map((_, i) => posicionInicial + i),
        decideClasificacion: posicionInicial <= clasifican && posicionInicial + sub.length - 1 > clasifican,
        motivo: completo ? 'directo_no_separa' : 'no_se_enfrentaron',
      });
    }
  }

  for (const [i, f] of filas.entries()) f.posicion = i + 1;

  const jugados = pairIds.map((id) => stats.get(id)!.jugados);
  const grupoTerminado =
    resultados.length > 0 && resultados.every((r) => r.gamesA !== null && r.gamesB !== null);

  return {
    grupo: entrada?.grupo ?? '',
    clasifican,
    filas,
    comparable: new Set(jugados).size <= 1,
    grupoTerminado,
    empatesSinResolver: empates,
    bloqueaClasificacion: grupoTerminado && empates.some((e) => e.decideClasificacion),
  };

  function fila(pairId: string, criterio: CriterioExpres, empatadaCon: string[]): FilaTablaExpres {
    const s = stats.get(pairId)!;
    return {
      pairId,
      posicion: 0, // se rellena al final
      jugados: s.jugados,
      gamesFavor: s.gamesFavor,
      gamesContra: s.gamesContra,
      balance: s.gamesFavor - s.gamesContra,
      criterio,
      empateSinResolver: criterio === 'sin_resolver',
      empatadaCon,
    };
  }
}

/** Balance de `id` contando SOLO los partidos contra el resto del bloque. */
function miniBalance(id: string, bloque: readonly string[], directo: Map<string, number>): number {
  let total = 0;
  for (const otro of bloque) {
    if (otro === id) continue;
    total += directo.get(`${id}|${otro}`) ?? 0;
  }
  return total;
}

/** Parte una lista YA ordenada en bloques con el mismo valor. */
function agrupar(ids: readonly string[], valor: (id: string) => number): string[][] {
  const out: string[][] = [];
  for (const id of ids) {
    const ultimo = out[out.length - 1];
    if (ultimo && valor(ultimo[0]) === valor(id)) ultimo.push(id);
    else out.push([id]);
  }
  return out;
}

/**
 * El orden que decidió el organizador, si aplica a ESTE bloque y a nadie más.
 *
 * Se exige que las parejas con valor dentro del grupo sean exactamente las del
 * bloque: así, si un resultado se corrige y el empate cambia de miembros, la
 * decisión vieja deja de aplicarse sola y la tabla vuelve a decir la verdad —
 * que hay un empate sin resolver— en vez de publicar un orden que el
 * organizador tomó sobre otra situación.
 */
function ordenDelOrganizador(
  bloque: readonly string[],
  ordenManual: Record<string, number> | undefined,
  pairIdsDelGrupo: readonly string[],
): string[] | null {
  if (!ordenManual) return null;

  const conValor = pairIdsDelGrupo.filter((id) => typeof ordenManual[id] === 'number');
  if (conValor.length !== bloque.length) return null;
  if (!bloque.every((id) => conValor.includes(id))) return null;

  const valores = bloque.map((id) => ordenManual[id]);
  if (new Set(valores).size !== valores.length) return null;

  return [...bloque].sort((x, y) => ordenManual[x] - ordenManual[y]);
}

// ── Validación de entrada ───────────────────────────────────────────────────

function exigirParejas(pairIds: unknown): string[] {
  if (!Array.isArray(pairIds) || pairIds.length === 0) {
    throw new Error(
      `computeTablaExpres: pairIds es obligatorio y debe ser un array no vacío; ` +
        `llegó ${JSON.stringify(pairIds)}.`,
    );
  }
  if (pairIds.some((p) => typeof p !== 'string' || p.length === 0)) {
    throw new Error(`computeTablaExpres: hay ids de pareja vacíos o que no son texto.`);
  }
  if (new Set(pairIds as string[]).size !== pairIds.length) {
    throw new Error(
      `computeTablaExpres: hay parejas repetidas en pairIds; sus games contarían dos veces.`,
    );
  }
  return pairIds as string[];
}

function exigirResultados(
  resultados: unknown,
  pairIds: readonly string[],
): readonly ResultadoSuma6[] {
  if (!Array.isArray(resultados)) {
    throw new Error(
      `computeTablaExpres: resultados es obligatorio y debe ser un array; ` +
        `llegó ${JSON.stringify(resultados)}. Un grupo sin partidos se pasa como [].`,
    );
  }

  const enGrupo = new Set(pairIds);
  const ids = new Set<string>();
  const duelos = new Set<string>();

  for (const r of resultados as ResultadoSuma6[]) {
    if (typeof r?.matchId !== 'string' || r.matchId.length === 0) {
      throw new Error(`computeTablaExpres: hay un resultado sin matchId.`);
    }
    if (ids.has(r.matchId)) {
      throw new Error(
        `computeTablaExpres: el matchId "${r.matchId}" aparece dos veces; sus games ` +
          `se contarían por duplicado.`,
      );
    }
    ids.add(r.matchId);

    if (!enGrupo.has(r.pairAId) || !enGrupo.has(r.pairBId)) {
      throw new Error(
        `computeTablaExpres: el partido "${r.matchId}" enfrenta a parejas que no ` +
          `están en este grupo (${r.pairAId} vs ${r.pairBId}).`,
      );
    }
    if (r.pairAId === r.pairBId) {
      throw new Error(`computeTablaExpres: el partido "${r.matchId}" es una pareja contra sí misma.`);
    }

    const duelo = [r.pairAId, r.pairBId].sort().join('|');
    if (duelos.has(duelo)) {
      throw new Error(
        `computeTablaExpres: ${r.pairAId} y ${r.pairBId} aparecen enfrentadas dos ` +
          `veces. En un exprés nadie repite rival: esto es un fixture corrupto.`,
      );
    }
    duelos.add(duelo);

    const sinJugar = r.gamesA === null && r.gamesB === null;
    if (sinJugar) continue;
    if (r.gamesA === null || r.gamesB === null) {
      throw new Error(
        `computeTablaExpres: el partido "${r.matchId}" tiene un lado capturado y el ` +
          `otro no. Un suma ${GAMES_POR_PARTIDO} se captura entero: los dos números ` +
          `salen a la vez.`,
      );
    }
    const errores = validarMarcadorSuma6(r.gamesA, r.gamesB);
    if (errores.length > 0) {
      throw new Error(`computeTablaExpres: partido "${r.matchId}" — ${errores.join(' ')}`);
    }
  }

  return resultados as ResultadoSuma6[];
}
