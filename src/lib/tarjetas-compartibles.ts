/**
 * RALLY · Lo que el jugador manda por WhatsApp.
 *
 * ESTO ES ADQUISICIÓN, NO DECORACIÓN
 *   Un jugador que le manda a su pareja "me dan 38% contra Martínez/Ruiz" está
 *   metiendo a RALLY en un grupo de WhatsApp donde no estábamos. Es el canal
 *   más barato que tenemos y el único que no depende de que alguien busque la
 *   app.
 *
 * SON TEXTOS Y NO IMÁGENES, A PROPÓSITO
 *   Generar una imagen exigiría `react-native-view-shot`, que es una
 *   dependencia nativa más, no funciona igual en web, y produce un archivo que
 *   WhatsApp comprime. Un texto bien escrito se pega en cualquier sitio, se
 *   puede citar, y el enlace es clicable. La imagen bonita se puede añadir
 *   después; el texto es lo que hace el trabajo.
 *
 * ► LA REGLA DE ESTOS TEXTOS: QUE SE PUEDAN MANDAR SIN VERGÜENZA
 *   Nadie comparte un anuncio. Lo que se comparte es algo que dice algo de uno
 *   mismo — que subió, que ganó, que le toca un partido difícil. Por eso el
 *   dato va primero y en primera persona, y el nombre de la app va al final y
 *   una sola vez. Un texto que empieza con "¡RALLY te informa!" no lo manda
 *   nadie, y entonces no sirve para nada.
 */

import { textoDeBalance } from '@/lib/expres-texto';

/** De dónde sale el enlace. La web, no un deep link: tiene que abrir en todos lados. */
export function urlDeLaApp(): string {
  return process.env.EXPO_PUBLIC_WEB_URL ?? 'https://rally.mx';
}

export interface TarjetaCompartible {
  /** Lo que ve el que la recibe. */
  mensaje: string;
  /** Título para el diálogo del sistema. No siempre se usa. */
  titulo: string;
}

/**
 * Campeón de una categoría.
 *
 * El más fácil de compartir de los tres: es la noticia que el jugador ya está
 * contando de todos modos.
 */
export function tarjetaDeCampeon(
  categoria: string,
  /** Nombre del torneo, si se sabe. La tarjeta funciona sin él. */
  torneo?: string | null,
  /** Los dos nombres, si se saben. */
  pareja?: string | null,
): TarjetaCompartible {
  const donde = torneo ? ` en ${torneo}` : '';
  const quien = pareja ? `\n${pareja}` : '';
  return {
    titulo: 'Campeones',
    mensaje: `🏆 Campeones de ${categoria}${donde}.${quien}\n\n${urlDeLaApp()}`,
  };
}

/**
 * Cuánto has subido.
 *
 * Solo se ofrece si de verdad subió: compartir "bajé 40 puntos" no lo va a
 * hacer nadie, y ofrecérselo es recordarle un mal fin de semana.
 */
export function tarjetaDeNivel(
  division: string,
  delta: number,
  partidos: number,
): TarjetaCompartible | null {
  if (delta <= 0) return null;
  const desde = partidos >= 20 ? 'desde que empecé' : 'en mis primeros torneos';
  return {
    titulo: 'Mi nivel',
    mensaje:
      `${textoDeBalance(delta)} puntos de nivel ${desde}. Voy en ${division.toLowerCase()}.\n\n` +
      urlDeLaApp(),
  };
}

/**
 * El partido que viene.
 *
 * Funciona en los dos sentidos y por eso es el que más se manda: si sales
 * favorito lo presumes, y si no, lo usas para picar a tu pareja. Un pronóstico
 * en contra se comparte MÁS que uno a favor.
 */
export function tarjetaDelPartido(
  rival: string,
  probabilidad: number | null,
): TarjetaCompartible {
  if (probabilidad === null) {
    return {
      titulo: 'Mi próximo partido',
      mensaje: `Hoy contra ${rival}.\n\n${urlDeLaApp()}`,
    };
  }
  const pct = Math.round(probabilidad * 100);
  const remate =
    pct >= 60 ? 'A ver si es verdad.' : pct <= 40 ? 'Vamos a dar la sorpresa.' : 'Esto se decide en la cancha.';
  return {
    titulo: 'Mi próximo partido',
    mensaje: `Hoy contra ${rival}. Me dan ${pct}%. ${remate}\n\n${urlDeLaApp()}`,
  };
}
