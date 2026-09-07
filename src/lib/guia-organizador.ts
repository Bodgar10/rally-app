/**
 * RALLY · El acompañamiento dentro de la pantalla
 *
 * QUÉ ES
 *   Elegir una pregunta en la ayuda no solo lleva a la pantalla: deja una guía
 *   corriendo que va diciendo qué hacer —"elige el rango", "pulsa Guardar"— y
 *   se apaga sola cuando está hecho.
 *
 * TRES GUÍAS, ELEGIDAS PARA ROMPER EL MECANISMO
 *   Hay trece apartados, y escribir trece antes de saber si el patrón aguanta
 *   es la forma cara de descubrir que no. Estas tres cubren los tres casos que
 *   pueden romperlo:
 *
 *     · `cambiar-fechas`  — una pantalla que YA sabía si el usuario hizo algo.
 *     · `tercer-lugar`    — una que NO lo sabía: hubo que darle la señal.
 *     · `cabe-el-torneo`  — DOS pantallas, con el panel en medio.
 *
 *   Si el patrón sirve, lo que se repite a partir de aquí son datos en `GUIAS`;
 *   si no sirve, se tira un archivo y no trece pantallas.
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
 *      por tiempo. Es determinista, no necesita temporizadores y NO PUEDE
 *      QUEDARSE COLGADA. Un temporizador sí puede colgarse, y además castiga a
 *      quien tarda porque está entendiendo.
 *
 *      QUÉ CUENTA COMO ABANDONAR, CON GUÍAS DE VARIAS PANTALLAS
 *      Pasar por el panel camino del siguiente paso NO es abandonar; irse a
 *      algo que no está en el camino, sí. Y en esta app "el camino" no hay que
 *      adivinarlo: el panel del torneo es el EJE del que cuelgan los trece
 *      apartados, así que ir de uno a otro pasa siempre por él y no hay ningún
 *      otro sitio de paso. La regla queda en una línea:
 *
 *        · la pantalla del paso pendiente  → se dice qué hacer;
 *        · el panel                        → se dice a dónde ir (`comoLlegar`);
 *        · cualquier otra cosa             → se abandonó.
 *
 *      Y no se declara por guía: sería un campo que todas rellenarían igual y
 *      que alguna olvidaría. El eje es de la app, no de la guía.
 *
 *      El precio, dicho en voz alta: quien vuelve al panel para SALIRSE se
 *      lleva una línea diciéndole dónde estaba. Se paga porque la alternativa
 *      —matar la guía al volver— rompe toda guía de dos pantallas, que es la
 *      forma de la mitad de las tareas del panel. La ✕ está al lado.
 *
 * DÓNDE VIVE EL ESTADO
 *   En un store de módulo (`guia-store`), no en la URL ni en almacenamiento.
 *   Sobrevive a la navegación dentro de la sesión, que es lo que hace falta, y
 *   NO sobrevive a cerrar la app: una guía a medias reapareciendo tres días
 *   después es un fantasma, no una ayuda.
 */

import { PANTALLA_EJE } from './ayuda-organizador';

export interface PasoDeGuia {
  id: string;
  /** Segmento de la pantalla donde se muestra. Ver `pantallaDeRuta`. */
  pantalla: string;
  /** Lo que se le dice, en una línea. Cabe en la barra sin partirse. */
  texto: string;
  /**
   * Lo que se le dice desde el panel, cuando este paso está en otra pantalla:
   * cómo llegar. Es el momento en que hay que encontrar una tarjeta entre
   * trece, así que se nombra tal cual está escrita en el panel.
   *
   * Opcional: una guía de una sola pantalla puede no tenerlo, y entonces desde
   * el panel se dice lo mismo que diría en su sitio.
   */
  comoLlegar?: string;
}

export interface Guia {
  id: string;
  /** La pregunta de `ayuda-organizador` que la lanza. */
  desdePregunta: string;
  pasos: PasoDeGuia[];
}

/**
 * Las guías.
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

  // UNA PANTALLA QUE NO SABÍA SI EL USUARIO HABÍA HECHO ALGO.
  // `formato.tsx` comparaba contra la base el formato del tercer set, pero NO
  // el interruptor del tercer lugar — que es justo lo que pregunta la ayuda.
  // Darle la señal fueron dos líneas: guardar el valor cargado y compararlo.
  {
    id: 'tercer-lugar',
    desdePregunta: 'formato',
    pasos: [
      {
        id: 'elegir',
        pantalla: 'formato',
        texto: 'Enciende o apaga el partido por el tercer lugar.',
        comoLlegar: 'Abre "Formato" para decidir el tercer lugar.',
      },
      {
        id: 'guardar',
        pantalla: 'formato',
        texto: 'Baja y pulsa Guardar para aplicarlo.',
      },
    ],
  },

  // DOS PANTALLAS, CON EL PANEL EN MEDIO. La capacidad son dos datos que viven
  // en dos apartados, y no hay forma de ir del primero al segundo sin pasar por
  // el panel. Es el caso que obligó a distinguir "de camino" de "se fue".
  {
    id: 'cabe-el-torneo',
    desdePregunta: 'cabe',
    pasos: [
      {
        id: 'canchas',
        pantalla: 'canchas',
        texto: 'Pon cuántas canchas usarás y guarda.',
        comoLlegar: 'Abre "Canchas" y di cuántas usarás.',
      },
      {
        id: 'horarios',
        pantalla: 'horarios',
        texto: 'Ahora la ventana de juego de cada día. Guarda al terminar.',
        comoLlegar: 'Falta la ventana horaria: abre "Horarios".',
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
  | { tipo: 'transito'; paso: PasoDeGuia; numero: number; total: number }
  | { tipo: 'terminada' }
  | { tipo: 'fuera' };

export function situacionDeGuia(
  guia: Guia,
  hechos: ReadonlySet<string>,
  pantalla: string,
): SituacionDeGuia {
  const pendiente = guia.pasos.find((p) => !hechos.has(p.id));
  if (!pendiente) return { tipo: 'terminada' };

  const donde =
    pendiente.pantalla === pantalla ? 'paso'
    : pantalla === PANTALLA_EJE ? 'transito'
    : 'fuera';
  if (donde === 'fuera') return { tipo: 'fuera' };

  return {
    tipo: donde,
    paso: pendiente,
    // El número que se le enseña cuenta desde 1 y sobre el total real, no sobre
    // los que quedan: "2 de 2" dice cuánto falta; "1 de 1" mentiría.
    numero: guia.pasos.indexOf(pendiente) + 1,
    total: guia.pasos.length,
  };
}

/** Lo que dice la barra, esté donde esté. */
export function textoDeSituacion(s: SituacionDeGuia): string | null {
  if (s.tipo === 'paso') return s.paso.texto;
  if (s.tipo === 'transito') return s.paso.comoLlegar ?? s.paso.texto;
  return null;
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
