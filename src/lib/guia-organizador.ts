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
  /**
   * El paso se cumple CON LA VISITA: no hay nada que pulsar.
   *
   * "Ve a comprobar si el torneo cabe" se satisface llegando y mirando.
   * Pedirle una acción que no existe dejaría la barra encendida sin motivo, y
   * obligaría a la pantalla a inventarse una señal que no tiene.
   *
   * SE CUMPLE AL SALIR, NO AL ENTRAR, y la diferencia es todo: marcándolo al
   * entrar, la guía terminaría en el mismo render en que se llega y el texto
   * —lo que hay que mirar— no llegaría a leerse nunca. Así se ve mientras está
   * ahí, y al irse la guía se da por terminada en vez de por abandonada.
   */
  seCumpleAlMirar?: boolean;
}

/**
 * PENDIENTE · LOS PASOS NO SABEN DE PRECONDICIONES, Y HAY UNO QUE DUELE
 *
 * EL CASO, TAL CUAL SE VE
 *   Un organizador nuevo pregunta "¿Cómo cambio el precio de la inscripción?".
 *   La guía lo lleva a Cuota y le dice "Escribe cuánto cobras por pareja". El
 *   campo está DESHABILITADO: `cuota.tsx` lo bloquea mientras el organizador no
 *   haya conectado su cuenta de Stripe, y la propia pantalla lo explica arriba
 *   ("Todavía no puedes cobrar en línea · Conectar pagos →").
 *
 *   Así que la barra le manda hacer algo que no puede hacer, y encima el paso
 *   nunca se cumple: `cuota-escrita` depende de `hayCambios`, que con el campo
 *   bloqueado no llega a cambiar nunca. La guía se queda encendida hasta que él
 *   la cierra o se va a otro apartado.
 *
 *   No es raro: le pasa a TODO organizador nuevo, porque conectar pagos es de
 *   las últimas cosas que se hacen. Y no es exclusivo de Cuota — es la forma
 *   que tiene el problema cuando un apartado depende de otro.
 *
 * POR QUÉ NO SE ARREGLÓ AQUÍ
 *   Porque la solución honesta cambia el modelo: hoy los pasos son DATOS puros
 *   —texto y pantalla— y por eso `GUIAS` se puede editar sin tocar código y sin
 *   entender nada. Meterles una condición los vuelve ejecutables, y eso es una
 *   decisión de diseño, no un parche. Se prefirió dejar 19 guías funcionando y
 *   un caso mal, a 19 guías con una regla nueva metida a última hora.
 *
 * POR DÓNDE ENTRA QUIEN LO RETOME
 *   El problema real es "este paso todavía no se puede dar", así que lo que
 *   falta no es esconder el paso: es DECIR QUÉ FALTA ANTES. La forma que menos
 *   rompe lo que ya hay:
 *
 *     1. Un campo opcional en `PasoDeGuia` con el hecho que lo bloquea y qué
 *        hacer — algo como `{ requiere: 'pagos-conectados', siNo: 'Antes hay
 *        que conectar pagos.', llevaA: 'planes' }`. Sigue siendo dato.
 *     2. Quien sabe si se cumple es la PANTALLA, igual que con `cumplirPaso`:
 *        `cuota.tsx` ya calcula `puedeCobrar`. Un `declararCondicion(nombre,
 *        secumple)` simétrico a `cumplirPaso` mantiene la regla de que nadie
 *        infiere desde fuera lo que la pantalla ya sabe.
 *     3. `situacionDeGuia` gana un caso —'bloqueado'— y la barra pinta el
 *        `siNo` con su enlace en vez del texto del paso. Ni salta el paso ni
 *        mata la guía: el organizador conecta pagos, vuelve, y sigue.
 *
 *   Lo que NO conviene: que la guía consulte la base por su cuenta para saber
 *   si puede. Sería la segunda fuente de verdad que este archivo lleva tres
 *   iteraciones evitando.
 */

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
  // ── Configuración del torneo ──────────────────────────────────────────────
  {
    id: 'cambiar-fechas',
    desdePregunta: 'fechas',
    pasos: [
      { id: 'fechas-elegidas', pantalla: 'fechas',
        texto: 'Toca el día de inicio y luego el de cierre.',
        comoLlegar: 'Abre "Fechas" para elegir el rango.' },
      { id: 'fechas-guardadas', pantalla: 'fechas',
        texto: 'Ahora baja y pulsa Guardar fechas.' },
    ],
  },
  {
    id: 'poner-sede',
    desdePregunta: 'sede',
    pasos: [
      { id: 'sede-elegida', pantalla: 'sede',
        texto: 'Busca el club. Si no está, créalo desde aquí.',
        comoLlegar: 'Abre "Sede" para elegir el club.' },
      { id: 'sede-guardada', pantalla: 'sede',
        texto: 'Pulsa Guardar para dejarlo fijado.' },
    ],
  },
  {
    id: 'armar-categorias',
    desdePregunta: 'categorias',
    pasos: [
      { id: 'categoria-elegida', pantalla: 'categorias',
        texto: 'Marca las categorías que vas a abrir.',
        comoLlegar: 'Abre "Categorías" para marcarlas.' },
      { id: 'categorias-guardadas', pantalla: 'categorias',
        texto: 'Guarda para crearlas en el torneo.' },
    ],
  },
  {
    id: 'cambiar-cuota',
    desdePregunta: 'cuota',
    pasos: [
      { id: 'cuota-escrita', pantalla: 'cuota',
        texto: 'Escribe cuánto cobras por pareja.',
        comoLlegar: 'Abre "Cuota de inscripción".' },
      { id: 'cuota-guardada', pantalla: 'cuota',
        texto: 'Pulsa Guardar para aplicarla.' },
    ],
  },
  {
    id: 'cuantas-canchas',
    desdePregunta: 'canchas',
    pasos: [
      { id: 'canchas-guardadas', pantalla: 'canchas',
        texto: 'Sube o baja el número y pulsa Guardar.',
        comoLlegar: 'Abre "Canchas" y di cuántas usarás.' },
    ],
  },
  {
    id: 'ventana-horaria',
    desdePregunta: 'horarios',
    pasos: [
      { id: 'horarios-guardados', pantalla: 'horarios',
        texto: 'Marca los días y pon de qué hora a qué hora. Guarda.',
        comoLlegar: 'Abre "Horarios" para la ventana de cada día.' },
    ],
  },
  {
    id: 'tercer-lugar',
    desdePregunta: 'formato',
    pasos: [
      { id: 'formato-cambiado', pantalla: 'formato',
        texto: 'Enciende o apaga el partido por el tercer lugar.',
        comoLlegar: 'Abre "Formato" para decidir el tercer lugar.' },
      { id: 'formato-guardado', pantalla: 'formato',
        texto: 'Baja y pulsa Guardar para aplicarlo.' },
    ],
  },
  {
    id: 'cuantos-clasifican',
    desdePregunta: 'clasificados',
    pasos: [
      { id: 'clasificados-guardados', pantalla: 'clasificados',
        texto: 'Elige cuántos pasan por grupo y cuántos de repesca. Guarda.',
        comoLlegar: 'Abre "Cuántos clasifican".' },
    ],
  },

  // TRES PANTALLAS, Y LA ÚLTIMA ES DE MIRAR. La capacidad son dos datos que
  // viven en dos apartados, y la respuesta —si cabe— en un tercero. Es la guía
  // que obligó a distinguir "de camino" de "se fue", y la que estrena el paso
  // que se cumple con la visita.
  {
    id: 'cabe-el-torneo',
    desdePregunta: 'cabe',
    pasos: [
      { id: 'canchas-guardadas', pantalla: 'canchas',
        texto: 'Pon cuántas canchas usarás y guarda.',
        comoLlegar: 'Abre "Canchas" y di cuántas usarás.' },
      { id: 'horarios-guardados', pantalla: 'horarios',
        texto: 'Ahora la ventana de juego de cada día. Guarda al terminar.',
        comoLlegar: 'Falta la ventana horaria: abre "Horarios".' },
      { id: 'mirar-bloques', pantalla: 'bloques', seCumpleAlMirar: true,
        texto: 'Aquí ves si los bloques caben en tus días y canchas.',
        comoLlegar: 'Abre "Horarios de la fase de grupos" y míralo.' },
    ],
  },
  {
    id: 'mirar-bloques',
    desdePregunta: 'bloques',
    pasos: [
      { id: 'mirar-bloques', pantalla: 'bloques', seCumpleAlMirar: true,
        texto: 'Cada grupo es un bloque. Aquí ves si caben todos.',
        comoLlegar: 'Abre "Horarios de la fase de grupos".' },
    ],
  },

  // ── El paso que cambia el torneo de estado ────────────────────────────────
  {
    id: 'cerrar-y-sembrar',
    desdePregunta: 'cerrar-inscripciones',
    pasos: [
      { id: 'inscripciones-cerradas', pantalla: 'cerrar-inscripciones',
        texto: 'Elige la categoría y confirma. Se arman sus grupos.',
        comoLlegar: 'Abre "Cerrar inscripciones", abajo del todo.' },
      { id: 'mirar-sembrar', pantalla: 'sembrar', seCumpleAlMirar: true,
        texto: 'Cuando terminen sus grupos, el cuadro se arma desde aquí.',
        comoLlegar: 'Abre "Sembrar los cuadros" para ver cómo va.' },
    ],
  },
  {
    id: 'armar-cuadro',
    desdePregunta: 'sembrar',
    pasos: [
      { id: 'mirar-sembrar', pantalla: 'sembrar', seCumpleAlMirar: true,
        texto: 'Cada categoría dice si ya se puede sembrar o qué le falta.',
        comoLlegar: 'Abre "Sembrar los cuadros".' },
    ],
  },

  // ── Durante el torneo ─────────────────────────────────────────────────────
  {
    id: 'horas-y-canchas',
    desdePregunta: 'calendario',
    pasos: [
      { id: 'mirar-calendario', pantalla: 'calendario', seCumpleAlMirar: true,
        texto: 'Arrastra un partido para cambiarle hora o cancha.',
        comoLlegar: 'Abre "Calendario".' },
    ],
  },
  {
    id: 'tablas-y-resultados',
    desdePregunta: 'grupos',
    pasos: [
      { id: 'mirar-grupos', pantalla: 'grupos', seCumpleAlMirar: true,
        texto: 'Toca un partido para capturar su marcador.',
        comoLlegar: 'Abre "Grupos".' },
    ],
  },
  {
    id: 'ver-el-empate',
    desdePregunta: 'empate',
    pasos: [
      { id: 'mirar-empate', pantalla: 'grupos', seCumpleAlMirar: true,
        texto: 'La tabla marca el grupo donde el reglamento no separa.',
        comoLlegar: 'Abre "Grupos" y busca el aviso en la tabla.' },
    ],
  },
  {
    id: 'poner-juez',
    desdePregunta: 'jueces',
    pasos: [
      { id: 'juez-asignado', pantalla: 'jueces',
        texto: 'Búscalo por nombre o correo y asígnalo.',
        comoLlegar: 'Abre "Jueces" para asignar a alguien.' },
    ],
  },

  // ── Parejas ───────────────────────────────────────────────────────────────
  {
    id: 'pareja-a-mano',
    desdePregunta: 'agregar-pareja',
    pasos: [
      { id: 'pareja-registrada', pantalla: 'agregar-pareja',
        texto: 'Elige categoría y pon a los dos jugadores. Registra.',
        comoLlegar: 'Abre "Registrar pareja a mano".' },
    ],
  },
  {
    id: 'ver-inscritas',
    desdePregunta: 'parejas',
    pasos: [
      { id: 'mirar-parejas', pantalla: 'parejas', seCumpleAlMirar: true,
        texto: 'Toca una pareja para ver su pago o darla de baja.',
        comoLlegar: 'Abre "Inscritas".' },
    ],
  },
];

export function guiaDePregunta(preguntaId: string): Guia | null {
  return GUIAS.find((g) => g.desdePregunta === preguntaId) ?? null;
}

/**
 * El paso que el usuario acaba de satisfacer con solo estar en `pantalla`.
 *
 * Lo llama la barra al cambiar de ruta, con la pantalla que se ACABA de dejar.
 * `null` si ahí no había nada que se cumpliera mirando.
 */
export function pasoQueSeCumpleAlSalir(
  guia: Guia,
  hechos: ReadonlySet<string>,
  pantallaQueDeja: string,
): PasoDeGuia | null {
  const pendiente = guia.pasos.find((p) => !hechos.has(p.id));
  if (!pendiente) return null;
  if (!pendiente.seCumpleAlMirar) return null;
  return pendiente.pantalla === pantallaQueDeja ? pendiente : null;
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
