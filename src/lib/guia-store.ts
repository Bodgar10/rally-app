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
}

const VACIO: EstadoGuia = { guia: null, hechos: new Set() };

let estado: EstadoGuia = VACIO;
const oyentes = new Set<() => void>();

function emitir(siguiente: EstadoGuia) {
  if (siguiente === estado) return;
  estado = siguiente;
  for (const o of oyentes) o();
}

/** Arranca una guía desde cero. */
export function empezarGuia(guia: Guia): void {
  emitir({ guia, hechos: new Set() });
}

/** La apaga: terminada, abandonada o cerrada a mano. */
export function terminarGuia(): void {
  if (estado === VACIO) return;
  emitir(VACIO);
}

/**
 * Una pantalla dice que un paso está cumplido.
 *
 * Inocuo si no hay guía, si es otra guía, o si ya estaba marcado: las pantallas
 * avisan en cada render y no tienen por qué saber si alguien escucha.
 */
export function cumplirPaso(guiaId: string, pasoId: string): void {
  if (estado.guia?.id !== guiaId) return;
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
