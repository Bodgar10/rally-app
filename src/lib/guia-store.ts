/**
 * RALLY · Dónde vive la guía activa
 *
 * Un store de módulo con suscriptores, no un Context. La guía la lanza la hoja
 * de ayuda (que vive en el layout) y la cumplen las pantallas (que viven dentro
 * del Stack): meter un Provider en medio obligaría a tocar los dos layouts del
 * organizador y a que todo el árbol se re-renderizara cada vez que se marca un
 * paso. Aquí solo se entera quien se suscribe.
 *
 * NO SE PERSISTE, y es a propósito. Sobrevive a navegar entre pantallas —que es
 * el requisito— y muere al cerrar la app. Una guía a medias reapareciendo tres
 * días después no es ayuda, es un fantasma.
 */

import { useSyncExternalStore } from 'react';

import { marcarHecho, type Guia } from './guia-organizador';

interface EstadoGuia {
  guia: Guia | null;
  hechos: ReadonlySet<string>;
  /**
   * Puesto cuando esta guía entró pisando otra a medias.
   *
   * La barra lo dice en una línea y luego lo suelta. Que la anterior
   * desapareciera en silencio confunde a quien creía tener dos cosas en marcha:
   * el estado nuevo es correcto —solo se sigue una— pero el usuario no tiene
   * por qué deducirlo de que la barra cambió de texto.
   */
  pisoAOtra: boolean;
}

const VACIO: EstadoGuia = { guia: null, hechos: new Set(), pisoAOtra: false };

let estado: EstadoGuia = VACIO;
const oyentes = new Set<() => void>();

function emitir(siguiente: EstadoGuia) {
  if (siguiente === estado) return;
  estado = siguiente;
  for (const o of oyentes) o();
}

/**
 * Arranca una guía desde cero.
 *
 * Solo se sigue UNA a la vez: dos barras compitiendo por el mismo hueco no es
 * un producto, y "¿cuál de las dos me está hablando?" no tiene respuesta buena.
 * Pisar es lo correcto — pero se dice, no se hace en silencio.
 */
export function empezarGuia(guia: Guia): void {
  const habiaOtraAMedias = estado.guia !== null && estado.guia.id !== guia.id;
  emitir({ guia, hechos: new Set(), pisoAOtra: habiaOtraAMedias });
}

/** La barra ya dijo lo de "dejamos la anterior"; no hace falta repetirlo. */
export function avisoDeRelevoVisto(): void {
  if (!estado.pisoAOtra) return;
  emitir({ ...estado, pisoAOtra: false });
}

/** La apaga: terminada, abandonada o cerrada a mano. */
export function terminarGuia(): void {
  if (estado === VACIO) return;
  emitir(VACIO);
}

/**
 * Una pantalla dice QUÉ PASÓ. No a qué guía le sirve.
 *
 * El id es del hecho —'canchas-guardadas'— y no de un paso de una guía
 * concreta. Así una pantalla que aparece en tres guías avisa UNA vez, y añadir
 * una guía que reutilice ese hecho no obliga a volver a tocar la pantalla. Al
 * revés —`cumplirPaso(guiaId, pasoId)`— cada guía nueva era una línea más en
 * una pantalla que ya funcionaba, y esa es la lista que nadie mantiene.
 *
 * Inocuo si no hay guía, si la activa no tiene ese paso, o si ya estaba
 * marcado: las pantallas avisan en cada render y no tienen por qué saber si
 * alguien escucha.
 */
export function cumplirPaso(pasoId: string): void {
  if (!estado.guia?.pasos.some((p) => p.id === pasoId)) return;
  const hechos = marcarHecho(estado.hechos, pasoId);
  if (hechos === estado.hechos) return;
  emitir({ ...estado, hechos });
}

function suscribir(o: () => void): () => void {
  oyentes.add(o);
  return () => { oyentes.delete(o); };
}

const leer = () => estado;

/** El estado actual, reactivo. */
export function useGuiaActiva(): EstadoGuia {
  return useSyncExternalStore(suscribir, leer, leer);
}
