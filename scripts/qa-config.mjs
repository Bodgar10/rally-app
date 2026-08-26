/**
 * RALLY · Constantes compartidas por los scripts de QA
 *
 * Viven aquí y no duplicadas en cada script porque `clean-qa.mjs` tiene que
 * saber exactamente qué creó `seed-cimepa.mjs` para poder borrarlo. Si el
 * nombre se escribiera dos veces, cambiar uno dejaría basura en la base.
 */

/** El torneo réplica. Se identifica por nombre: no tiene id fijo. */
export const NOMBRE_TORNEO_CIMEPA = 'Sexto Torneo Cimepa (QA)';

/** Torneos que la limpieza puede borrar enteros, con sus categorías. */
export const TORNEOS_QA = [NOMBRE_TORNEO_CIMEPA];
