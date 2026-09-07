// src/lib/engine/validacion-siembra/index.ts
// Lo que hay que comprobar ANTES de sembrar el cuadro. Determinista, sin BD.
//
// SEMBRAR ES EL PUNTO DE NO RETORNO
//   Después, corregir una inconsistencia obliga a borrar partidos de
//   eliminatoria. Todo lo que se pueda detectar antes, se detecta antes.
//
// EN EL MOTOR, PARA QUE SEA EL MISMO CRITERIO EN LOS DOS LADOS
//   La pantalla lo corre para avisar y `generate-bracket` lo corre para
//   rechazar. Si fueran dos implementaciones, un día dirían cosas distintas y
//   la que manda es la del servidor — con la pantalla prometiendo lo contrario.
//   El botón deshabilitado es una pista, no una garantía: una llamada directa
//   o un cliente viejo se lo saltan.
//
// SILENCIO CUANDO TODO ESTÁ BIEN
//   Una validación que siempre interrumpe se aprende a ignorar, y entonces no
//   valida nada. Sin problemas no devuelve nada que enseñar.

import type { MatchResultInput } from '../types';
import { computeStandings, DEFAULT_STANDINGS_CONFIG, type StandingsConfig } from '../standings';
import { selectQualifiers, type QualifierStanding } from '../seeding/select-qualifiers';

/** Una fila de `group_standings` tal como la lee quien va a sembrar. */
export interface FilaDeGrupo extends QualifierStanding {
  clinchStatus: 'clinched' | 'eliminated' | 'alive' | 'repechage_pending';
}

export interface GrupoAValidar {
  groupId: string;
  /** 'A', 'B'… lo que se le enseña al organizador. */
  nombre: string;
  pairIds: string[];
  matches: MatchResultInput[];
  /** Lo que hay HOY en `group_standings`, que es lo que la siembra va a usar. */
  filas: FilaDeGrupo[];
}

export interface EntradaValidacion {
  grupos: GrupoAValidar[];
  advancePerGroup: number;
  bestExtraQualifiers: number;
  /** pairId -> 'Nombre / Nombre'. Los problemas se cuentan con nombres. */
  nombres: Record<string, string>;
  config?: StandingsConfig;
}

export type CodigoProblema =
  | 'numeros_no_cuadran'
  | 'clasifica_dos_veces'
  | 'eliminado_clasificado'
  | 'clasificado_fuera'
  | 'grupo_incompleto'
  | 'empate_sin_resolver'
  | 'posiciones_incoherentes';

export interface Problema {
  codigo: CodigoProblema;
  gravedad: 'bloqueante' | 'aviso';
  /** Redactado para el organizador, con nombres y letras de grupo. */
  mensaje: string;
  /** Grupo al que pertenece, si es de uno. */
  grupo?: string;
  /** Parejas implicadas, por nombre. */
  parejas?: string[];
}

export interface Validacion {
  bloqueantes: Problema[];
  avisos: Problema[];
  /** Sin bloqueantes. Los avisos se pueden saltar con confirmación explícita. */
  puedeSembrar: boolean;
}

const nombreDe = (id: string, nombres: Record<string, string>) => nombres[id] ?? id;

export function validarSiembra(entrada: EntradaValidacion): Validacion {
  const { grupos, advancePerGroup, bestExtraQualifiers, nombres } = entrada;
  const cfg = entrada.config ?? DEFAULT_STANDINGS_CONFIG;
  const problemas: Problema[] = [];

  const add = (p: Problema) => problemas.push(p);

  // ── 4. Todos los grupos completos ───────────────────────────────────────
  // El botón ya lo comprueba, pero el botón es del cliente.
  for (const g of grupos) {
    const sinJugar = g.matches.filter((m) => !m.played || m.winnerPairId == null);
    if (sinJugar.length > 0) {
      add({
        codigo: 'grupo_incompleto',
        gravedad: 'bloqueante',
        grupo: g.nombre,
        mensaje: `El grupo ${g.nombre} tiene ${sinJugar.length} ` +
          `${sinJugar.length === 1 ? 'partido sin resultado' : 'partidos sin resultado'}. ` +
          `Sembrar ahora repartiría plazas que todavía se están jugando.`,
      });
    }
  }

  // ── 6. Posiciones coherentes ────────────────────────────────────────────
  for (const g of grupos) {
    const esperadas = g.pairIds.map((_, i) => i + 1).join(',');
    const reales = [...g.filas.map((f) => f.position)].sort((a, b) => a - b).join(',');
    if (g.filas.length !== g.pairIds.length || esperadas !== reales) {
      add({
        codigo: 'posiciones_incoherentes',
        gravedad: 'bloqueante',
        grupo: g.nombre,
        mensaje: `Las posiciones del grupo ${g.nombre} no son 1…${g.pairIds.length} ` +
          `sin repetir: hay ${g.filas.length} filas con posiciones ${reales || '—'}. ` +
          `La tabla está a medias y la siembra leería de ahí.`,
      });
    }
  }

  // ── 5. Empates que el reglamento no resuelve ────────────────────────────
  //   AVISO, no bloqueo: el sorteo puede no haberse hecho todavía, y el
  //   organizador tiene derecho a seguir sabiendo lo que hace.
  for (const g of grupos) {
    const tabla = computeStandings(g.pairIds, g.matches, cfg);
    const empatadas = tabla.filter((r) => r.empateSinResolver);
    if (empatadas.length > 0) {
      const quienes = empatadas.map((r) => nombreDe(r.pairId, nombres));
      add({
        codigo: 'empate_sin_resolver',
        gravedad: 'aviso',
        grupo: g.nombre,
        parejas: quienes,
        mensaje: `En el grupo ${g.nombre}, ${quienes.join(', ')} quedaron iguales en todo: ` +
          `puntos, partidos entre ellas, sets y games. El reglamento no las separa, así que ` +
          `el orden que se ve ahora NO es deportivo — sale de un desempate técnico. ` +
          `Sortéalo antes de sembrar, o el primero del grupo lo elige el sistema.`,
      });
    }
  }

  // ── Los clasificados que saldrían de esta tabla ─────────────────────────
  const filas = grupos.flatMap((g) => g.filas);
  const clasificados = filas.length > 0
    ? selectQualifiers(filas, advancePerGroup, bestExtraQualifiers)
    : [];

  // ── 1. Cuadran los números ──────────────────────────────────────────────
  const esperados = grupos.length * advancePerGroup + bestExtraQualifiers;
  if (clasificados.length !== esperados) {
    add({
      codigo: 'numeros_no_cuadran',
      gravedad: 'bloqueante',
      mensaje: `Salen ${clasificados.length} clasificados y deberían ser ${esperados} ` +
        `(${grupos.length} grupos × ${advancePerGroup}` +
        `${bestExtraQualifiers > 0 ? ` + ${bestExtraQualifiers} de repesca` : ''}). ` +
        `El cuadro se sembraría con un tamaño que no corresponde.`,
    });
  }

  // ── 2. Nadie clasifica dos veces ────────────────────────────────────────
  const vistos = new Set<string>();
  const repetidos = new Set<string>();
  for (const q of clasificados) {
    if (vistos.has(q.pairId)) repetidos.add(q.pairId);
    vistos.add(q.pairId);
  }
  if (repetidos.size > 0) {
    const quienes = [...repetidos].map((id) => nombreDe(id, nombres));
    add({
      codigo: 'clasifica_dos_veces',
      gravedad: 'bloqueante',
      parejas: quienes,
      mensaje: `${quienes.join(', ')} ${repetidos.size === 1 ? 'entra' : 'entran'} dos veces ` +
        `en el cuadro: como primera de grupo y además como mejor segundo. ` +
        `Se jugaría contra sí misma.`,
    });
  }

  // ── 3. Coherencia con lo que ve el jugador ──────────────────────────────
  //   Es el fallo más grave que puede haber aquí: la app le dijo una cosa a
  //   una pareja y la siembra hace otra.
  const entra = new Set(clasificados.map((q) => q.pairId));
  const eliminadosDentro = filas.filter((f) => f.clinchStatus === 'eliminated' && entra.has(f.pairId));
  const clasificadosFuera = filas.filter((f) => f.clinchStatus === 'clinched' && !entra.has(f.pairId));

  if (eliminadosDentro.length > 0) {
    const quienes = eliminadosDentro.map((f) => nombreDe(f.pairId, nombres));
    add({
      codigo: 'eliminado_clasificado',
      gravedad: 'bloqueante',
      parejas: quienes,
      mensaje: `A ${quienes.join(', ')} la app ${quienes.length === 1 ? 'le dijo' : 'les dijo'} ` +
        `que ${quienes.length === 1 ? 'estaba eliminada' : 'estaban eliminadas'}, y la siembra ` +
        `${quienes.length === 1 ? 'la mete' : 'las mete'} en el cuadro.`,
    });
  }
  if (clasificadosFuera.length > 0) {
    const quienes = clasificadosFuera.map((f) => nombreDe(f.pairId, nombres));
    add({
      codigo: 'clasificado_fuera',
      gravedad: 'bloqueante',
      parejas: quienes,
      mensaje: `A ${quienes.join(', ')} la app ${quienes.length === 1 ? 'le dijo' : 'les dijo'} ` +
        `que ya ${quienes.length === 1 ? 'había clasificado' : 'habían clasificado'}, y la siembra ` +
        `${quienes.length === 1 ? 'la deja' : 'las deja'} fuera.`,
    });
  }

  const bloqueantes = problemas.filter((p) => p.gravedad === 'bloqueante');
  const avisos = problemas.filter((p) => p.gravedad === 'aviso');
  return { bloqueantes, avisos, puedeSembrar: bloqueantes.length === 0 };
}
