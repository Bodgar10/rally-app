/**
 * RALLY · El estado de siembra de todas las categorías, de un vistazo
 *
 * EL HUECO QUE LLENA
 *   Con ocho categorías, sembrar era entrar a cada pestaña y repetir el mismo
 *   gesto ocho veces. Y pasa el sábado por la noche, con todas terminando a la
 *   vez, que es cuando menos ganas hay de eso.
 *
 *   Peor: no había ninguna vista que dijera CÓMO VA EL TORNEO. Para saber si
 *   la 4ª Mixto estaba lista había que abrir la 4ª Mixto.
 *
 * LA DECISIÓN DE QUÉ SE SIEMBRA EN LOTE, Y QUÉ NO
 *   · Con bloqueantes, no. Son datos que no cuadran.
 *   · Con avisos —hoy solo el empate sin resolver— TAMPOCO, y es a propósito.
 *     Sembrar un empate sin sortear es elegir al primero de un grupo con un
 *     desempate técnico, y esa decisión se toma mirando ese grupo, no pulsando
 *     un botón que dice "todas". Se listan aparte, con su enlace.
 *   · Las ya sembradas se saltan sin ruido: no son un problema.
 *
 * Módulo aparte y sin React para poder probarlo: la regla de qué entra en el
 * lote es justo lo que no se quiere descubrir el sábado por la noche.
 */

import { validarSiembra, type GrupoAValidar, type Problema } from '@/lib/engine/validacion-siembra';
import type { StandingsConfig } from '@/lib/engine/standings';

export interface CategoriaParaSembrar {
  id: string;
  nombre: string;
  grupos: GrupoAValidar[];
  advancePerGroup: number;
  bestExtraQualifiers: number;
  /** Ya tiene partidos de eliminatoria. */
  cuadroSembrado: boolean;
  nombres: Record<string, string>;
  config?: StandingsConfig;
}

/** Por qué una categoría no entra en el lote. `null` = sí entra. */
export type MotivoFuera = 'ya_sembrada' | 'grupos_incompletos' | 'bloqueantes' | 'avisos';

export interface EstadoDeCategoria {
  id: string;
  nombre: string;
  gruposCompletos: number;
  totalGrupos: number;
  cuadroSembrado: boolean;
  bloqueantes: Problema[];
  avisos: Problema[];
  /** Entra en "Sembrar todas". */
  seSiembraEnLote: boolean;
  motivoFuera: MotivoFuera | null;
  /**
   * Frase corta para la fila del checklist. Dice el estado, no el diagnóstico
   * largo: eso está en `bloqueantes` y `avisos`.
   */
  resumen: string;
}

const completos = (c: CategoriaParaSembrar) =>
  c.grupos.filter((g) => g.matches.length > 0
    && g.matches.every((m) => m.played && m.winnerPairId != null)).length;

export function checklistDeSiembra(cats: CategoriaParaSembrar[]): EstadoDeCategoria[] {
  return cats.map((c) => {
    const hechos = completos(c);
    const total = c.grupos.length;

    if (c.cuadroSembrado) {
      return {
        id: c.id, nombre: c.nombre, gruposCompletos: hechos, totalGrupos: total,
        cuadroSembrado: true, bloqueantes: [], avisos: [],
        seSiembraEnLote: false, motivoFuera: 'ya_sembrada',
        resumen: 'Cuadro ya sembrado',
      };
    }

    // Sin todos los grupos terminados no hace falta validar nada más: es lo
    // primero que dirá la validación y lo único accionable ahora.
    if (hechos < total) {
      return {
        id: c.id, nombre: c.nombre, gruposCompletos: hechos, totalGrupos: total,
        cuadroSembrado: false, bloqueantes: [], avisos: [],
        seSiembraEnLote: false, motivoFuera: 'grupos_incompletos',
        resumen: `Faltan ${total - hechos} ${total - hechos === 1 ? 'grupo' : 'grupos'} por terminar`,
      };
    }

    const v = validarSiembra({
      grupos: c.grupos,
      advancePerGroup: c.advancePerGroup,
      bestExtraQualifiers: c.bestExtraQualifiers,
      nombres: c.nombres,
      config: c.config,
    });

    if (v.bloqueantes.length > 0) {
      return {
        id: c.id, nombre: c.nombre, gruposCompletos: hechos, totalGrupos: total,
        cuadroSembrado: false, bloqueantes: v.bloqueantes, avisos: v.avisos,
        seSiembraEnLote: false, motivoFuera: 'bloqueantes',
        resumen: v.bloqueantes.length === 1
          ? 'Hay algo que revisar antes de sembrar'
          : `Hay ${v.bloqueantes.length} cosas que revisar antes de sembrar`,
      };
    }

    if (v.avisos.length > 0) {
      return {
        id: c.id, nombre: c.nombre, gruposCompletos: hechos, totalGrupos: total,
        cuadroSembrado: false, bloqueantes: [], avisos: v.avisos,
        seSiembraEnLote: false, motivoFuera: 'avisos',
        resumen: 'Empate sin sortear: decide tú antes de sembrar',
      };
    }

    return {
      id: c.id, nombre: c.nombre, gruposCompletos: hechos, totalGrupos: total,
      cuadroSembrado: false, bloqueantes: [], avisos: [],
      seSiembraEnLote: true, motivoFuera: null,
      resumen: 'Lista para sembrar',
    };
  });
}

/** Cuántas entran en el lote. Es el número del botón y el del índice. */
export const listasParaSembrar = (estados: EstadoDeCategoria[]): EstadoDeCategoria[] =>
  estados.filter((e) => e.seSiembraEnLote);
