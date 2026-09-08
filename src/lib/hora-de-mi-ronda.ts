/**
 * RALLY · Lo que SÍ se sabe de la ronda a la que entras
 *
 * EL CASO
 *   Eduardo, 3ª Mixto, primero de grupo con bye garantizado a semifinales. La
 *   tarjeta le decía "Todavía sin hora — tu cruce depende de cómo terminen los
 *   otros grupos".
 *
 *   Y en `match_schedule` estaba escrito desde el viernes:
 *       semi · slot 0 → domingo 16:00 · Cancha 1
 *       semi · slot 1 → domingo 16:00 · Cancha 2
 *
 *   Las dos semifinales a la misma hora. Su hora estaba decidida: juega el
 *   domingo a las 16:00. Lo que no se sabía era en cuál de las dos canchas y
 *   contra quién — que son otras dos preguntas.
 *
 *   Decirle "todavía sin hora" es exactamente lo que este producto existe para
 *   evitar: irse a dormir sin saber a qué hora levantarse cuando la app ya lo
 *   sabe.
 *
 * CUÁNDO JUEGAS Y CONTRA QUIÉN SON DOS COSAS
 *   El rival sale del cuadro y no se sabe hasta que terminen los grupos. La
 *   hora sale del PLAN, que existe desde que el organizador programa el torneo.
 *   Mezclarlas hacía que la incógnita de una tapara la certeza de la otra.
 *
 * TRES NIVELES, Y NI UNO MÁS
 *   Lo que se puede afirmar depende de cuántos huecos tiene esa ronda en el
 *   plan y de si comparten hora:
 *
 *     · UN SOLO HUECO       → hora y cancha. No hay ambigüedad posible.
 *     · VARIOS A LA MISMA HORA → la hora es cierta; la cancha, no.
 *     · A HORAS DISTINTAS   → ni la hora; se dice el rango, que es lo que hay.
 *
 * NO SE PROMETE DE MÁS
 *   Esto solo se llama con la ronda de entrada GARANTIZADA. Sin garantía no se
 *   sabe en qué ronda entra, y entonces cualquier hora sería inventada — ahí sí
 *   es correcto decir que falta información.
 */

/** Una fila de `match_schedule` de la ronda que interesa. */
export interface HuecoDelPlan {
  /** ISO. */
  scheduledAt: string | null;
  courtLabel: string | null;
}

export type CertezaDeRonda =
  /** Un solo hueco: hora y cancha. */
  | { nivel: 'hora-y-cancha'; cuando: string; cancha: string }
  /** Varios huecos a la misma hora: la hora es cierta, la cancha no. */
  | { nivel: 'solo-hora'; cuando: string }
  /** Huecos a horas distintas: solo se puede acotar. */
  | { nivel: 'rango'; desde: string; hasta: string }
  /** El plan no dice nada de esa ronda. */
  | { nivel: 'nada' };

/**
 * Qué se puede afirmar de una ronda, dados sus huecos en el plan.
 *
 * Los huecos sin hora se descartan antes de decidir: una fila del plan a la que
 * el planificador no llegó a ponerle hora no puede sostener ninguna afirmación,
 * y contarla como "varios huecos" degradaría una respuesta que sí era cierta.
 */
export function certezaDeRonda(huecos: HuecoDelPlan[]): CertezaDeRonda {
  const conHora = huecos.filter((h): h is HuecoDelPlan & { scheduledAt: string } =>
    typeof h.scheduledAt === 'string' && h.scheduledAt !== '');
  if (conHora.length === 0) return { nivel: 'nada' };

  const horas = [...new Set(conHora.map((h) => h.scheduledAt))].sort();

  if (horas.length > 1) {
    return { nivel: 'rango', desde: horas[0], hasta: horas[horas.length - 1] };
  }

  const cuando = horas[0];
  // Una sola cancha nombrada Y un solo hueco. Con dos huecos a la misma hora en
  // la misma cancha —que no debería pasar, pero el plan lo permite— tampoco se
  // puede decir cuál es suyo, así que se cae al nivel de solo hora.
  if (conHora.length === 1) {
    const cancha = conHora[0].courtLabel?.trim();
    if (cancha) return { nivel: 'hora-y-cancha', cuando, cancha };
  }
  return { nivel: 'solo-hora', cuando };
}

/**
 * De qué se sabe la hora, en palabras.
 *
 * @param fechaYHora cómo se escribe un instante ('dom 8, 16:00'). Se inyecta
 *   porque el formato vive en `@/lib/fechas` y depende de la zona del torneo;
 *   aquí solo se compone, y así se prueba sin relojes.
 */
export function cuandoJuegas(
  certeza: CertezaDeRonda,
  ronda: string,
  fechaYHora: (iso: string) => string,
): string | null {
  switch (certeza.nivel) {
    case 'hora-y-cancha':
      return `Juegas ${ronda} el ${fechaYHora(certeza.cuando)} en la ${certeza.cancha}.`;
    case 'solo-hora':
      // La cancha NO se calla: que falte un dato concreto tranquiliza más que
      // un silencio, porque descarta "se me pasó mirar".
      return `Juegas ${ronda} el ${fechaYHora(certeza.cuando)}. La cancha se sabrá al armarse el cruce.`;
    case 'rango':
      // Sin verbo: "la final se juegan" y "las semifinales se juega" no pueden
      // concordar los dos con la misma plantilla, y el nombre de la ronda ya
      // viene con su artículo.
      return `${capitalizar(ronda)}: entre ${fechaYHora(certeza.desde)} y ${fechaYHora(certeza.hasta)}. Tu hora exacta se sabrá al armarse el cruce.`;
    default:
      return null;
  }
}

/**
 * Y contra quién: siempre desconocido en este punto, y se dice aparte.
 *
 * Va en su propia frase a propósito. Pegado a la hora —"juegas a las 16:00
 * contra alguien"— la incógnita contamina el dato cierto; separado, cada uno
 * se lee por lo que es.
 */
export function contraQuien(gruposPendientes: number): string {
  if (gruposPendientes <= 0) return 'Contra quién se sabrá al armarse el cuadro.';
  return gruposPendientes === 1
    ? 'Contra quién todavía no: falta 1 grupo por terminar.'
    : `Contra quién todavía no: faltan ${gruposPendientes} grupos por terminar.`;
}

const capitalizar = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);
