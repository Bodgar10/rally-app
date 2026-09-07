/**
 * RALLY · El acompañamiento dentro de la pantalla (PILOTO: Fechas)
 *
 * QUÉ ES
 *   Elegir una pregunta en la ayuda no solo lleva a la pantalla: deja una guía
 *   corriendo que va diciendo qué hacer —"elige el rango", "pulsa Guardar"— y
 *   se apaga sola cuando está hecho.
 *
 * ESTO ES UN PILOTO Y ESTÁ HECHO PARA JUZGARLO
 *   Hay trece apartados. Antes de escribir trece guías conviene ver si el
 *   mecanismo aguanta, así que aquí hay UNA, la más simple, y la máquina que la
 *   mueve. Si el patrón sirve, lo que se repite son datos en `GUIAS`; si no
 *   sirve, se tira un archivo y no trece pantallas.
 *
 * LAS TRES COSAS DIFÍCILES, Y CÓMO SE RESUELVEN
 *
 *   1. SEGUIR DÓNDE ESTÁ EL USUARIO — cada paso declara SU pantalla y la guía
 *      solo se pinta si la ruta actual coincide. No hay que avisar a nadie al
 *      navegar: la ruta ya es el estado, y se lee en cada render.
 *
 *   2. SABER SI HIZO LO QUE SE LE PIDIÓ — no lo adivina la guía, lo declara la
 *      pantalla. `fechas.tsx` ya sabía si había cambios y si había guardado;
 *      solo tiene que decirlo. Inferirlo desde fuera —mirar la base, comparar
 *      props— sería una segunda fuente de verdad sobre algo que la pantalla ya
 *      sabe de primera mano.
 *
 *   3. SOBREVIVIR A QUE SE SALGA A MEDIA GUÍA — se abandona POR PANTALLA y no
 *      por tiempo. Si la ruta actual no es la de ningún paso pendiente, la guía
 *      se acabó. Es determinista, no necesita temporizadores y NO PUEDE
 *      QUEDARSE COLGADA: no existe el estado "guía activa en una pantalla que
 *      no la conoce". Un temporizador sí puede colgarse, y además castiga a
 *      quien tarda porque está entendiendo.
 *
 * DÓNDE VIVE EL ESTADO
 *   En un store de módulo (`guia-store`), no en la URL ni en almacenamiento.
 *   Sobrevive a la navegación dentro de la sesión, que es lo que hace falta, y
 *   NO sobrevive a cerrar la app: una guía a medias reapareciendo tres días
 *   después es un fantasma, no una ayuda.
 */

export interface PasoDeGuia {
  id: string;
  /** Segmento de la pantalla donde se muestra. Ver `pantallaDeRuta`. */
  pantalla: string;
  /** Lo que se le dice, en una línea. Cabe en la barra sin partirse. */
  texto: string;
}

export interface Guia {
  id: string;
  /** La pregunta de `ayuda-organizador` que la lanza. */
  desdePregunta: string;
  pasos: PasoDeGuia[];
}

/**
 * Las guías. Hoy una.
 *
 * Los textos van aquí igual que los de la ayuda: cambiar lo que dice un paso no
 * toca ningún componente.
 */
export const GUIAS: Guia[] = [
  {
    id: 'cambiar-fechas',
    desdePregunta: 'fechas',
    pasos: [
      {
        id: 'elegir-rango',
        pantalla: 'fechas',
        texto: 'Toca el día de inicio y luego el de cierre.',
      },
      {
        id: 'guardar',
        pantalla: 'fechas',
        texto: 'Ahora baja y pulsa Guardar fechas.',
      },
    ],
  },
];

export function guiaDePregunta(preguntaId: string): Guia | null {
  return GUIAS.find((g) => g.desdePregunta === preguntaId) ?? null;
}

/**
 * Qué toca ahora.
 *
 *   · `paso`      — hay algo que decir, y se dice.
 *   · `terminada` — se hicieron todos. La barra se despide y se apaga.
 *   · `fuera`     — la ruta actual no es la del paso pendiente: se abandonó.
 *
 * `hechos` es el conjunto de ids de pasos ya cumplidos. Se usa un conjunto y no
 * un índice porque una pantalla puede cumplir dos pasos de un tirón (elegir el
 * rango y guardar sin soltar el teléfono) y un índice se quedaría corto.
 */
export type SituacionDeGuia =
  | { tipo: 'paso'; paso: PasoDeGuia; numero: number; total: number }
  | { tipo: 'terminada' }
  | { tipo: 'fuera' };

export function situacionDeGuia(
  guia: Guia,
  hechos: ReadonlySet<string>,
  pantalla: string,
): SituacionDeGuia {
  const pendiente = guia.pasos.find((p) => !hechos.has(p.id));
  if (!pendiente) return { tipo: 'terminada' };
  if (pendiente.pantalla !== pantalla) return { tipo: 'fuera' };

  return {
    tipo: 'paso',
    paso: pendiente,
    // El número que se le enseña cuenta desde 1 y sobre el total real, no sobre
    // los que quedan: "2 de 2" dice cuánto falta; "1 de 1" mentiría.
    numero: guia.pasos.indexOf(pendiente) + 1,
    total: guia.pasos.length,
  };
}

/**
 * Cumplir un paso.
 *
 * Devuelve un conjunto NUEVO —no muta— para que el store pueda comparar
 * referencias y no re-renderizar de más. Marcar dos veces el mismo paso no
 * hace nada: las pantallas avisan en cada render y eso tiene que ser inocuo.
 */
export function marcarHecho(
  hechos: ReadonlySet<string>,
  pasoId: string,
): ReadonlySet<string> {
  if (hechos.has(pasoId)) return hechos;
  return new Set([...hechos, pasoId]);
}
