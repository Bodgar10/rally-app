/**
 * RALLY · A dónde vuelve el botón de volver
 *
 * EL BUG
 *   `router.back()` no hace NADA cuando no hay historial que deshacer, y eso
 *   pasa más de lo que parece:
 *
 *     · Se llegó con `router.replace`, que SUSTITUYE la entrada en vez de
 *       apilarla. La puerta del juez (`(protected)/arbitrar`) hace justo eso.
 *     · Se abrió la URL directa en web, o se recargó la página con F5.
 *     · Se entró desde una notificación o un enlace compartido.
 *
 *   En los tres casos el botón se pintaba igual y no respondía al tocarlo. No
 *   es que fallara la navegación: es que no había ninguna.
 *
 * EL ARREGLO
 *   Si hay historial, atrás. Si no, se NAVEGA al padre de la ruta actual, que
 *   es a donde el botón dice que va. Un botón que promete "← Torneo" tiene que
 *   llevar al torneo aunque sea la primera pantalla de la sesión.
 *
 * Función pura y aparte para poder probarla: el componente solo la llama.
 */

/**
 * Rutas cuyo padre NO es "quitar el último segmento".
 *
 * Son las pocas donde la jerarquía de archivos y la del producto no coinciden.
 * Se listan una por una a propósito: una regla más lista acertaría en estas
 * cuatro y fallaría en la quinta sin que nadie se enterara.
 */
const EXCEPCIONES: Record<string, string> = {
  // `/org/torneos` no es una pantalla: la lista de torneos del organizador es
  // el panel `/org`.
  '/org/torneos/nuevo': '/(organizer)/org',
  // La inscripción cuelga del torneo del jugador, no de un índice
  // `/inscripcion` que no existe.
  '/inscripcion': '/(protected)/torneos',
};

/** Pantallas públicas: se leen sin sesión, así que su suelo es la portada. */
const PUBLICAS = new Set(['privacidad', 'terminos', 'reembolso', 'ayuda', 'como-cancelar']);

/**
 * Pantallas de sesión: su suelo es el login, NO el dashboard.
 *
 * A quien está recuperando su contraseña no se le puede mandar al dashboard
 * cuando no hay historial: no tiene sesión, así que el guard lo rebotaría a
 * `/login` de todas formas — pero pasando por una pantalla que parpadea. El
 * "← Volver" de `recuperar` dice que vuelve al login; que vaya al login.
 */
const DE_SESION = new Set(['login', 'registro', 'recuperar', 'nueva-contrasena', 'callback']);

/** Suelo de quien todavía no ha entrado. */
export const DESTINO_SIN_SESION = '/(auth)/login';

/** Suelo de la app para quien tiene sesión. */
export const DESTINO_POR_DEFECTO = '/(protected)/dashboard';

/**
 * El destino de "volver" cuando no hay historial.
 *
 * Los grupos de rutas entre paréntesis NO aparecen en el pathname, así que aquí
 * se razona sobre la URL real (`/org/torneos/<id>/canchas`) y se devuelven
 * rutas con grupo donde hace falta, que es lo que espera `router.replace`.
 */
export function rutaPadre(pathname: string): string {
  const limpio = (pathname || '/').split('?')[0].replace(/\/+$/, '');
  if (!limpio || limpio === '/') return DESTINO_POR_DEFECTO;

  if (EXCEPCIONES[limpio]) return EXCEPCIONES[limpio];

  const segmentos = limpio.split('/').filter(Boolean);

  // Un solo segmento: no hay padre dentro de la app.
  if (segmentos.length === 1) {
    if (PUBLICAS.has(segmentos[0])) return '/';
    if (DE_SESION.has(segmentos[0])) return DESTINO_SIN_SESION;
    return DESTINO_POR_DEFECTO;
  }

  if (EXCEPCIONES[`/${segmentos[0]}`]) return EXCEPCIONES[`/${segmentos[0]}`];

  const padre = `/${segmentos.slice(0, -1).join('/')}`;
  if (EXCEPCIONES[padre]) return EXCEPCIONES[padre];
  // `/org/torneos` tampoco es pantalla cuando se llega quitando un segmento.
  if (padre === '/org/torneos') return '/(organizer)/org';

  return padre;
}
