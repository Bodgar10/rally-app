// src/lib/engine/expres/index.ts
// Motor de fixture del TORNEO EXPRÉS. Determinista. Función pura.
//
//   generarFixtureExpres({ pairIds, semilla }) → grupos, rondas y orden de juego
//
// No toca ningún motor existente y ninguno lo importa. Ver reglas.ts para el
// porqué, circulo.ts para la combinatoria y sorteo.ts para la semilla.

import {
  CLASIFICAN_POR_GRUPO,
  CUPO_MINIMO,
  GRUPO_MINIMO,
  PARTIDOS_POR_PAREJA,
  type FixtureExpres,
  type FranjaExpres,
  type GrupoExpres,
  type GrupoId,
  type PartidoExpres,
} from './reglas';
import { rondasDelCirculo, verificarReparto } from './circulo';
import { repartirGrupos, tamanosDeGrupo } from './sorteo';

export * from './reglas';
export { rondasDelCirculo, verificarReparto } from './circulo';
export {
  barajar,
  generadorDeSemilla,
  repartirGrupos,
  tamanosDeGrupo,
  GRUPOS,
} from './sorteo';

export interface EntradaFixtureExpres {
  /** Parejas inscritas al cerrar el cupo. El orden da igual: se sortea. */
  pairIds: readonly string[];
  /**
   * Semilla del sorteo. OBLIGATORIA, sin valor por defecto.
   *
   * Un default aquí —la fecha, el id del torneo, cualquier cosa— convierte un
   * dato que falta en un sorteo que nadie decidió y que además parece
   * legítimo. Que reviente con el nombre del campo.
   */
  semilla: string;
  /** Partidos por pareja. Por defecto PARTIDOS_POR_PAREJA (5). */
  partidosPorPareja?: number;
}

/**
 * Arma la fase de grupos completa de un exprés.
 *
 * QUÉ GARANTIZA, Y LO COMPRUEBA ANTES DE DEVOLVER
 *   · Todas las parejas juegan exactamente el mismo número de partidos.
 *   · Nadie repite rival.
 *   · Dentro de una ronda, nadie juega dos veces.
 *   · Las rondas de los dos grupos se alternan sin huecos: A1, B1, A2, B2, …
 *
 * QUÉ NO HACE
 *   Horas, canchas concretas y cuadro eliminatorio. Esto devuelve el ORDEN de
 *   juego; ponerle reloj es del planificador.
 */
export function generarFixtureExpres(entrada: EntradaFixtureExpres): FixtureExpres {
  const pairIds = exigirParejas(entrada?.pairIds);
  const semilla = exigirSemilla(entrada?.semilla);
  const cupo = pairIds.length;

  const tamanos = tamanosDeGrupo(cupo);
  const k = exigirPartidos(entrada?.partidosPorPareja, Math.min(tamanos.A, tamanos.B));

  const reparto = repartirGrupos(pairIds, semilla);

  const grupos: GrupoExpres[] = [];
  for (const id of ['A', 'B'] as const) {
    const miembros = reparto[id];
    const rondasIdx = rondasDelCirculo(miembros.length, k);
    verificarReparto(miembros.length, k, rondasIdx);

    const rondas: PartidoExpres[][] = rondasIdx.map((ronda, r) =>
      ronda.map(([a, b], p) => ({
        // `orden` se rellena al intercalar: aquí todavía no se sabe la franja.
        ref: `${id}-R${r + 1}-P${p + 1}`,
        grupo: id as GrupoId,
        ronda: r + 1,
        orden: 0,
        pairAId: miembros[a],
        pairBId: miembros[b],
      })),
    );

    grupos.push({ grupo: id, pairIds: miembros, rondas });
  }

  // Alternancia. Los dos grupos tienen el MISMO número de rondas —siempre k,
  // sin importar cuántas parejas tenga cada uno— y por eso se intercalan sin
  // que ninguno acabe jugando dos franjas seguidas.
  const franjas: FranjaExpres[] = [];
  const partidos: PartidoExpres[] = [];
  let orden = 0;
  for (let r = 0; r < k; r++) {
    for (const g of grupos) {
      orden++;
      const deLaRonda = g.rondas[r];
      for (const p of deLaRonda) p.orden = orden;
      franjas.push({ orden, grupo: g.grupo, ronda: r + 1, partidos: deLaRonda });
      partidos.push(...deLaRonda);
    }
  }

  return {
    cupo,
    partidosPorPareja: k,
    clasificanPorGrupo: CLASIFICAN_POR_GRUPO,
    grupos,
    franjas,
    partidos,
    canchasNecesarias: Math.max(tamanos.A, tamanos.B) / 2,
    totalPartidos: partidos.length,
  };
}

// ── Validación de entrada ───────────────────────────────────────────────────
//
// Nada de defaults silenciosos. Un exprés mal armado no falla: se juega, y el
// problema aparece cuando hay que publicar la tabla.

function exigirParejas(pairIds: unknown): string[] {
  if (!Array.isArray(pairIds)) {
    throw new Error(
      `generarFixtureExpres: pairIds es obligatorio y debe ser un array; ` +
        `llegó ${JSON.stringify(pairIds)}.`,
    );
  }
  const malas = pairIds.filter((p) => typeof p !== 'string' || p.length === 0);
  if (malas.length > 0) {
    throw new Error(
      `generarFixtureExpres: hay ${malas.length} id(s) de pareja vacíos o que no ` +
        `son texto. Un id inventado reparte a alguien que no existe.`,
    );
  }
  const unicos = new Set(pairIds as string[]);
  if (unicos.size !== pairIds.length) {
    throw new Error(
      `generarFixtureExpres: hay parejas repetidas en pairIds ` +
        `(${pairIds.length} entradas, ${unicos.size} distintas). Una pareja ` +
        `duplicada jugaría contra sí misma y su balance contaría dos veces.`,
    );
  }
  if (pairIds.length < CUPO_MINIMO) {
    throw new Error(
      `generarFixtureExpres: el cupo mínimo de un exprés es ${CUPO_MINIMO} ` +
        `(${GRUPO_MINIMO}+${GRUPO_MINIMO}) y llegaron ${pairIds.length}. ` +
        `Clasifican ${CLASIFICAN_POR_GRUPO} por grupo, así que con menos no hay ` +
        `fase de grupos que jugar.`,
    );
  }
  if (pairIds.length % 2 !== 0) {
    throw new Error(
      `generarFixtureExpres: el cupo debe ser PAR y llegaron ${pairIds.length}. ` +
        `Con ${PARTIDOS_POR_PAREJA} partidos por pareja —un número impar— cada ` +
        `grupo tiene que tener un número par de parejas, así que el total ` +
        `también. No hay reparto posible con ${pairIds.length}: el organizador ` +
        `cierra en ${pairIds.length - 1} o abre a ${pairIds.length + 1}.`,
    );
  }
  return pairIds as string[];
}

function exigirSemilla(semilla: unknown): string {
  if (typeof semilla !== 'string' || semilla.length === 0) {
    throw new Error(
      `generarFixtureExpres: semilla es obligatoria y debe ser un texto no ` +
        `vacío; llegó ${JSON.stringify(semilla)}. Sin semilla guardada el ` +
        `sorteo no se puede reproducir ni auditar.`,
    );
  }
  return semilla;
}

function exigirPartidos(valor: unknown, grupoMasPequeno: number): number {
  const k = valor === undefined ? PARTIDOS_POR_PAREJA : valor;
  if (typeof k !== 'number' || !Number.isInteger(k) || k < 1) {
    throw new Error(
      `generarFixtureExpres: partidosPorPareja debe ser un entero >= 1; ` +
        `llegó ${JSON.stringify(valor)}.`,
    );
  }
  if (k > grupoMasPequeno - 1) {
    throw new Error(
      `generarFixtureExpres: no caben ${k} partidos por pareja en un grupo de ` +
        `${grupoMasPequeno}: solo hay ${grupoMasPequeno - 1} rivales distintos. ` +
        `O baja partidosPorPareja a ${grupoMasPequeno - 1} o sube el cupo.`,
    );
  }
  if (k % 2 !== 0 && grupoMasPequeno % 2 !== 0) {
    throw new Error(
      `generarFixtureExpres: ${k} partidos por pareja es impar y el grupo de ` +
        `${grupoMasPequeno} también: no existe reparto donde todas jueguen lo mismo.`,
    );
  }
  return k;
}
