/**
 * RALLY · Qué dice la guía en la pantalla actual
 *
 * Lo consumen DOS sitios y por eso vive aquí y no dentro de la barra:
 *   · `BarraDeGuia`, para pintarse.
 *   · El layout de `(organizer)`, para reservarle sitio abajo.
 *
 * LO SEGUNDO NO ES CAPRICHO. La barra es un overlay, y el paso final de la guía
 * de Fechas dice "baja y pulsa Guardar fechas" — un botón que la propia barra
 * tapaba al llegar al fondo del scroll. Un cartel que esconde justo lo que pide
 * pulsar es peor que no tener cartel. Con el padding en el layout se arregla
 * UNA vez para las diecisiete pantallas, y solo mientras hay guía corriendo.
 */

import { usePathname } from 'expo-router';

import { pantallaDeRuta } from '@/lib/ayuda-organizador';
import { situacionDeGuia, type SituacionDeGuia } from '@/lib/guia-organizador';
import { useGuiaActiva } from '@/lib/guia-store';

/** `null` = no hay guía. Si no, la situación en ESTA pantalla. */
export function useGuiaEnPantalla(): SituacionDeGuia | null {
  const { guia, hechos } = useGuiaActiva();
  const pathname = usePathname();
  if (!guia) return null;
  return situacionDeGuia(guia, hechos, pantallaDeRuta(pathname));
}
