/**
 * RALLY · Mensajes de la captura de resultados
 *
 * EL PROBLEMA QUE RESUELVE
 *   `match-result` responde con claves de máquina —`invalid_score`,
 *   `not_authorized`, `not_a_group_match`— y la pantalla del juez las pintaba
 *   tal cual. El juez leía "invalid_score" y no sabía qué corregir. Peor: el
 *   `detail` que trae los errores del engine ("Set 2 con marcador de games
 *   inválido (6-6)"), que es justo lo que le diría qué está mal, se tiraba.
 *
 *   Aquí se traduce la clave y se CONSERVA el detalle. La clave dice de qué
 *   familia es el problema; el detalle, cuál es.
 */

const MENSAJES: Record<string, string> = {
  bad_request:              'La petición llegó incompleta. Vuelve a intentarlo.',
  winner_required:          'Selecciona al ganador del partido.',
  unauthenticated:          'Tu sesión caducó. Vuelve a entrar.',
  not_authorized:           'No tienes permiso para capturar en este torneo.',
  match_not_found:          'Ese partido ya no existe. Actualiza la lista.',
  group_missing:            'Este partido de grupos no tiene grupo asignado. Avisa al organizador.',
  not_a_knockout_match:     'Ese partido no es de eliminatorias.',
  // Se queda como RED, no como respuesta: cuando la Edge Function manda su
  // `detail` (el error del engine, que dice qué set está mal y qué marcador sí
  // valdría), ese detalle SUSTITUYE a esta frase — ver `mensajeDeCaptura`.
  // Anteponerla producía «El marcador no es válido. Set 2: 6-5 no es un
  // marcador válido…»: la primera mitad no añade nada y retrasa la útil.
  invalid_score:            'El marcador no es válido.',
  winner_mismatch:          'El ganador que marcaste no coincide con el marcador.',
  group_busy:               'Otro juez está capturando en este grupo. Espera unos segundos y reintenta.',
  bracket_busy:             'Otro juez está capturando en este cuadro. Espera unos segundos y reintenta.',

  // Eliminatorias: capturar avanza el cuadro en el mismo paso.
  is_a_bye:                 'Ese cruce es un bye: se resolvió al sembrar el cuadro y no se captura.',
  winner_not_in_match:      'El ganador no es ninguna de las dos parejas de este partido.',
  bracket_empty:            'La categoría todavía no tiene cuadro sembrado.',
  bracket_read_failed:      'No se pudo leer el cuadro. No se guardó nada; reintenta.',
  downstream_already_played:
    'No se puede corregir: cambiaría quién juega un partido que ya se jugó. Resuélvelo como organizador.',
  category_incomplete:      'A la categoría le falta configuración (cuántas parejas clasifican).',

  // Fallos de lectura: antes se tragaban y podían dejar la tabla del grupo en
  // ceros. Ahora abortan, y el juez tiene que saber que NO se guardó nada.
  match_read_failed:        'No se pudo leer el partido. No se guardó nada; reintenta.',
  auth_check_failed:        'No se pudo verificar tu permiso. No se guardó nada; reintenta.',
  category_read_failed:     'No se pudo leer la categoría. No se guardó nada; reintenta.',
  group_matches_read_failed:'No se pudieron leer los partidos del grupo. No se guardó nada; reintenta.',
  group_pairs_read_failed:  'No se pudo leer la tabla del grupo. No se guardó nada; reintenta.',
  group_matches_empty:      'El grupo no tiene partidos registrados. Avisa al organizador.',
  group_pairs_empty:        'El grupo no tiene tabla de posiciones. Avisa al organizador.',
  rpc_failed:               'El servidor rechazó el resultado.',
  unhandled:                'Error inesperado del servidor.',
};

const GENERICO = 'No se pudo guardar el resultado.';

/**
 * Claves cuya traducción es un RESUMEN de lo que el `detail` ya dice mejor.
 *
 * El engine no devuelve "marcador inválido" a secas: devuelve «Set 2: 6-5 no
 * es un marcador válido. Puede ser un set normal (6-4, 7-5, 7-6)», que nombra
 * el set, el marcador y qué habría que escribir en su lugar. Anteponerle "El
 * marcador no es válido." solo pone una frase genérica delante de la única que
 * sirve, y en la caja de error del juez la genérica es la que se lee primero.
 *
 * Para el resto de claves la traducción SÍ aporta —el detalle de `group_busy`
 * o `not_authorized` es técnico— y se conserva delante.
 */
const RESUMIDAS_POR_EL_DETALLE = new Set(['invalid_score']);

/**
 * Frase para el juez a partir de la respuesta de la Edge Function.
 *
 * `detail` se añade cuando aporta algo que la traducción no dice ya: los
 * errores del engine son la mitad útil del mensaje. Cuando es la mitad ENTERA
 * (ver `RESUMIDAS_POR_EL_DETALLE`), va solo.
 */
export function mensajeDeCaptura(cuerpo: unknown): string {
  if (!cuerpo || typeof cuerpo !== 'object') return GENERICO;
  const c = cuerpo as { error?: unknown; detail?: unknown; message?: unknown };

  const clave = typeof c.error === 'string' ? c.error : '';
  const detalle = typeof c.detail === 'string' ? c.detail.trim() : '';
  const base = MENSAJES[clave] ?? (typeof c.message === 'string' ? c.message : '') ?? '';

  if (detalle && RESUMIDAS_POR_EL_DETALLE.has(clave)) return detalle;
  if (base && detalle) return `${base} ${detalle}`;
  if (base) return base;
  if (detalle) return detalle;
  if (clave) return `${GENERICO} (${clave})`;
  return GENERICO;
}

/** True si el fallo es transitorio y reintentar tal cual tiene sentido. */
export function vaLaPenaReintentar(cuerpo: unknown): boolean {
  const clave =
    cuerpo && typeof cuerpo === 'object' && typeof (cuerpo as { error?: unknown }).error === 'string'
      ? (cuerpo as { error: string }).error
      : '';
  return [
    'group_busy',
    'match_read_failed',
    'auth_check_failed',
    'category_read_failed',
    'group_matches_read_failed',
    'group_pairs_read_failed',
    'unhandled',
  ].includes(clave);
}
