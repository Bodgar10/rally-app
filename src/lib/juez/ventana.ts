/**
 * RALLY · La ventana de torneos del juez
 *
 * Qué torneos le salen a un juez en el menú, y en qué orden.
 *
 * Vive aparte de `useJudgeTournaments` para poder probarlo: el hook crea el
 * cliente de Supabase al importarse, y estas dos reglas —las únicas con una
 * decisión dentro— no necesitan base de datos para comprobarse.
 *
 * POR QUÉ HAY VENTANA
 *   Un juez de RALLY acumula torneos temporada tras temporada. Sin filtro, el
 *   menú de quien lleva dos años sería un archivo con el torneo de este fin de
 *   semana perdido dentro.
 */

import { hoy, parseFechaISO } from '@/lib/fechas';

/**
 * Días DESPUÉS del fin del torneo que sigue apareciendo.
 *
 * Cinco: la captura tardía y las correcciones caben de sobra en esa ventana, y
 * el lunes siguiente el torneo ya dejó de ser trabajo.
 */
export const UMBRAL_PASADO_DIAS = 5;

/**
 * Días ANTES del inicio a partir de los cuales ya aparece.
 *
 * Treinta. Es el horizonte en el que un torneo deja de ser un plan y pasa a ser
 * una fecha: antes de eso el juez no tiene nada que hacer ahí, y verlo en el
 * menú solo compite con el que sí se está jugando.
 */
export const UMBRAL_FUTURO_DIAS = 30;

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * ¿Cae dentro de la ventana?
 *
 * Un torneo SIN FECHAS se deja pasar: es un dato incompleto del organizador,
 * no una razón para esconderle su torneo al juez.
 *
 * Se compara por DÍA en la zona del club (`hoy()`), no con la hora cruda: un
 * torneo que termina hoy no puede desaparecer del menú a media tarde porque el
 * reloj UTC ya cambió de día.
 */
export function dentroDeLaVentana(
  inicio: string | null,
  fin: string | null,
  hoyDia: Date = hoy(),
): boolean {
  const finD = parseFechaISO(fin);
  if (finD && Math.floor((hoyDia.getTime() - finD.getTime()) / DIA_MS) > UMBRAL_PASADO_DIAS) {
    return false;
  }

  const inicioD = parseFechaISO(inicio);
  if (inicioD && Math.floor((inicioD.getTime() - hoyDia.getTime()) / DIA_MS) > UMBRAL_FUTURO_DIAS) {
    return false;
  }

  return true;
}

/** Lo mínimo que hace falta para ordenar. */
export interface OrdenableParaJuez {
  nombre: string;
  inicio: string | null;
}

/**
 * Más cercano primero: el de este fin de semana antes que el del mes que viene.
 *
 * Sin fecha va al final — no se puede afirmar cuándo es—, y a igualdad de
 * fecha decide el nombre, para que el orden sea total y no dependa de cómo
 * devolvió las filas Postgres.
 */
export function ordenarPorCercania(a: OrdenableParaJuez, b: OrdenableParaJuez): number {
  const ia = parseFechaISO(a.inicio)?.getTime() ?? Number.POSITIVE_INFINITY;
  const ib = parseFechaISO(b.inicio)?.getTime() ?? Number.POSITIVE_INFINITY;
  if (ia !== ib) return ia - ib;
  return a.nombre.localeCompare(b.nombre, 'es');
}
