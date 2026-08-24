/**
 * RALLY · Botón "Cómo llegar"
 *
 * Abre la sede en el mapa nativo. NO usa lat/lng: manda una búsqueda por texto
 * con "{nombre}, {dirección}, {ciudad}", que tanto Google Maps como Apple Maps
 * resuelven solos. Por eso `venues.lat` y `venues.lng` pueden seguir vacías
 * indefinidamente — solo harán falta el día que haya filtro por distancia.
 *
 * Consecuencia: la calidad del texto lo es todo. Si el nombre de la sede no
 * coincide con el del mapa, esto no encuentra nada. De ahí el copy del alta
 * de sede, que pide escribirlo tal cual aparece en Google/Apple Maps.
 *
 * `Linking` viene de react-native, no de expo-linking: es el patrón del
 * proyecto para abrir URLs (onboarding-connect, pago, planes, ayuda).
 * expo-linking se usa solo para PARSEAR deep links entrantes.
 */

import { Linking, Platform, Pressable, Text, StyleSheet } from 'react-native';

import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';

export interface VenueParaMapa {
  name:    string | null | undefined;
  address?: string | null;
  city?:   string | null;
}

/**
 * URL del mapa para una sede. Exportada para poder testearla sin render.
 * Devuelve null si no hay ni siquiera un nombre: sin texto no hay búsqueda.
 */
export function buildMapUrl(venue: VenueParaMapa, os: string = Platform.OS): string | null {
  // filter(Boolean) importa: si `address` viniera vacía, evita mandar
  // "Nombre, , CDMX" al buscador, que degrada el resultado.
  const partes = [venue.name, venue.address, venue.city]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter((p) => p.length > 0);

  if (partes.length === 0) return null;

  const query = encodeURIComponent(partes.join(', '));

  // iOS → Apple Maps, preinstalado y sin fricción.
  // Android/web → la URL https de Google Maps abre la app vía App Links y cae
  // al navegador si no está. Preferida a `geo:` porque no obliga a elegir app.
  return os === 'ios'
    ? `https://maps.apple.com/?q=${query}`
    : `https://www.google.com/maps/search/?api=1&query=${query}`;
}

interface Props {
  venue:    VenueParaMapa | null | undefined;
  /** `compact` para incrustarlo en una tarjeta densa como MyNextMatch. */
  variant?: 'default' | 'compact';
}

export default function ComoLlegar({ venue, variant = 'default' }: Props) {
  const url = venue ? buildMapUrl(venue) : null;
  if (!url) return null; // sin datos de sede no se pinta nada

  const compacto = variant === 'compact';

  return (
    <Pressable
      onPress={() => { Linking.openURL(url).catch(() => { /* mapa no disponible */ }); }}
      style={({ pressed }) => [
        s.boton,
        compacto && s.botonCompacto,
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="link"
      accessibilityLabel={`Cómo llegar a ${venue?.name ?? 'la sede'}`}
    >
      <Text style={[s.texto, compacto && s.textoCompacto]}>📍 Cómo llegar</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  boton: {
    borderWidth:       1,
    borderColor:       color.line,
    backgroundColor:   color.surface2,
    borderRadius:      radius.sm,
    minHeight:         touchTarget,
    paddingHorizontal: space[4],
    alignItems:        'center',
    justifyContent:    'center',
    alignSelf:         'flex-start',
  },
  botonCompacto: {
    minHeight:         36,
    paddingHorizontal: space[3],
    borderRadius:      radius.pill,
  },
  texto:         { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.champagne },
  textoCompacto: { fontFamily: font.body, fontSize: fontSize.caption, fontWeight: '600', color: color.champagne },
});
