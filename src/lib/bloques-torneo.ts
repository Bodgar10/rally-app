/**
 * RALLY · Los bloques de un torneo, leídos de la base
 *
 * El motor (`@/lib/engine/schedule/bloques`) es lógica pura: no sabe de
 * Supabase. Este archivo es el puente — lee las tres piezas que el organizador
 * capturó en su panel y las convierte en la retícula:
 *
 *   · `tournaments.courts`         → canchas (pantalla Canchas)
 *   · `tournaments.match_minutes`  → minutos por partido (pantalla Horarios)
 *   · `tournament_windows`         → ventanas por día (pantalla Horarios)
 *
 * SI FALTA CUALQUIERA DE LAS TRES, NO HAY BLOQUES QUE OFRECER.
 * Y eso NO bloquea la inscripción: la pareja se inscribe sin bloque y queda
 * registrada así. Un organizador que todavía no capturó sus canchas no puede
 * ser la razón por la que alguien no se inscriba.
 *
 * La ocupación viene de `bloques_ocupacion` (migración 049), una RPC agregada:
 * el jugador que está eligiendo necesita ver el cupo, pero no puede leer las
 * elecciones de los demás.
 */

import { supabase } from '@/lib/supabase/client';
import {
  generarBloques,
  type Bloque,
  type Ocupacion,
  type ReticulaBloques,
} from '@/lib/engine/schedule/bloques';

/** Lo que la UI necesita para pintar el selector. */
export interface BloquesDelTorneo {
  bloques:   Bloque[];
  ocupacion: Ocupacion;
  /** La retícula completa: capacidad total, avisos, días. Null si no hay config. */
  reticula:  ReticulaBloques | null;
  /**
   * Por qué no hay bloques. Null cuando sí los hay. Es texto para el
   * organizador, no para el jugador: al jugador simplemente no se le enseña
   * el paso.
   */
  motivoSinBloques: string | null;
}

const VACIO: BloquesDelTorneo = {
  bloques: [], ocupacion: {}, reticula: null, motivoSinBloques: null,
};

interface FilaVentana { dia: string; desde: string; hasta: string }
interface FilaOcupacion { bloque_id: string; category_id: string; parejas: number }

/** 'HH:MM:SS' de Postgres → 'HH:MM', que es lo que espera el motor. */
const aHoraCorta = (t: string) => t.slice(0, 5);

/**
 * Retícula + ocupación de un torneo. Nunca lanza: si algo falta devuelve la
 * lista vacía con el motivo, porque la inscripción tiene que seguir viva.
 */
export async function cargarBloquesDelTorneo(
  tournamentId: string,
): Promise<BloquesDelTorneo> {
  // Casts: `tournament_windows` y la RPC `bloques_ocupacion` son de migraciones
  // posteriores a la última generación de database.types.ts.
  const [torneoRes, ventanasRes, ocupacionRes] = await Promise.all([
    supabase
      .from('tournaments')
      .select('courts, match_minutes')
      .eq('id', tournamentId)
      .maybeSingle() as unknown as Promise<{
        data: { courts: number | null; match_minutes: number | null } | null;
      }>,
    (supabase.from as unknown as (t: string) => {
      select: (c: string) => { eq: (c: string, v: string) => Promise<{ data: FilaVentana[] | null }> };
    })('tournament_windows')
      .select('dia, desde, hasta')
      .eq('tournament_id', tournamentId),
    (supabase.rpc as unknown as (
      f: string, a: Record<string, string>,
    ) => Promise<{ data: FilaOcupacion[] | null }>)(
      'bloques_ocupacion', { p_tournament_id: tournamentId },
    ),
  ]);

  const torneo   = torneoRes.data;
  const ventanas = ventanasRes.data ?? [];

  if (!torneo) return VACIO;

  if (!torneo.courts || torneo.courts <= 0) {
    return { ...VACIO, motivoSinBloques: 'Falta capturar cuántas canchas se van a usar.' };
  }
  if (ventanas.length === 0) {
    return { ...VACIO, motivoSinBloques: 'Faltan los horarios: ningún día tiene ventana de juego.' };
  }

  let reticula: ReticulaBloques;
  try {
    reticula = generarBloques({
      ventanas: ventanas.map((v) => ({
        dia:   v.dia,
        desde: aHoraCorta(v.desde),
        hasta: aHoraCorta(v.hasta),
      })),
      canchas:           torneo.courts,
      minutosPorPartido: torneo.match_minutes ?? 60,
    });
  } catch (e) {
    // Datos imposibles (hora mal guardada, canchas en 0). Se registra y se
    // sigue sin bloques: la inscripción no depende de esto.
    console.error('[bloques-torneo] retícula inválida:', e);
    return { ...VACIO, motivoSinBloques: 'Los horarios capturados no forman bloques válidos.' };
  }

  const ocupacion: Ocupacion = {};
  for (const fila of ocupacionRes.data ?? []) {
    (ocupacion[fila.bloque_id] ??= {})[fila.category_id] = fila.parejas;
  }

  return {
    bloques:   reticula.bloques,
    ocupacion,
    reticula,
    motivoSinBloques: reticula.bloques.length === 0
      ? 'Las ventanas capturadas no alcanzan para un bloque completo.'
      : null,
  };
}

// ── Guardar la elección ─────────────────────────────────────────────────────

/**
 * Aparta el bloque de una pareja YA CREADA.
 *
 * POR QUÉ DESPUÉS DE CREAR LA PAREJA Y NO DENTRO DE LA EDGE FUNCTION
 *   La fila de `pairs` nace en `pair-register-self` / `pair-register-manual`,
 *   y el bloque necesita su id. Meterlo dentro obligaría a redesplegar las dos
 *   funciones para que la elección se guarde; aquí basta con correr la
 *   migración. La RLS de la 049 ya permite exactamente este insert: la pareja
 *   la suya, el organizador cualquiera de su torneo.
 *
 *   LO QUE SE ACEPTA A CAMBIO: la pareja puede quedar inscrita sin bloque si
 *   este insert falla. No es un estado roto — es el mismo estado de un torneo
 *   sin canchas capturadas, y la pantalla de ocupación lo lista como "sin
 *   bloque" para que el organizador lo resuelva.
 *
 * Devuelve null si guardó, o un mensaje para enseñar si no.
 */
export async function guardarEleccionDeBloque(args: {
  pairId:       string;
  tournamentId: string;
  bloqueId:     string;
  /** Solo el organizador: metió la pareja en un bloque sin cupo. */
  forzado?:     boolean;
}): Promise<string | null> {
  // Cast: `pair_block_choices` es de la migración 049, posterior a la última
  // generación de database.types.ts.
  const { error } = await (supabase.from as unknown as (t: string) => {
    upsert: (row: unknown, opts: { onConflict: string }) => Promise<{ error: { message?: string } | null }>;
  })('pair_block_choices').upsert(
    {
      pair_id:       args.pairId,
      tournament_id: args.tournamentId,
      bloque_id:     args.bloqueId,
      forzado:       args.forzado ?? false,
    },
    { onConflict: 'pair_id' },
  );

  if (error) {
    console.error('[bloques-torneo] guardar elección:', error);
    return 'La inscripción quedó hecha, pero el horario no se guardó. Avisa al organizador.';
  }
  return null;
}
