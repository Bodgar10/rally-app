/**
 * src/components/player/PortadaDeTorneo.tsx
 *
 * RALLY · La portada de un torneo.
 *
 * ► ERA UNA FILA DE LISTA, Y UN TORNEO NO ES UNA FILA DE LISTA
 *   La tarjeta anterior era un rectángulo gris con el nombre, una línea de
 *   fecha y el precio. Parecía un ajuste del panel, no un evento. Un torneo es
 *   la cosa por la que alguien abre esta app: tiene cartel en el club, tiene
 *   sede, tiene categorías y tiene una fecha que la gente se apunta. Merece
 *   leerse como un cartel.
 *
 * ► LOS TRES DATOS QUE DECIDEN, EN GRANDE Y ETIQUETADOS
 *   CUÁNDO, DÓNDE y CUÁNTO. Son las tres preguntas que se hace cualquiera
 *   delante de un torneo, en ese orden, y antes iban apelotonadas en una sola
 *   línea gris separada por puntos medios. Aquí van como una ficha, cada una
 *   con su etiqueta, porque así se ESCANEAN: la vista salta a la que le
 *   interesa en vez de leer la línea entera.
 *
 *   El club va encima de la ciudad y más grande: "Padel District Pedregal" es
 *   lo que alguien busca en el mapa; "CDMX" solo le dice que no está lejos.
 *
 * ► EL MAJOR SE VE DISTINTO ANTES DE LEERLO
 *   Un Major es el torneo grande del calendario y reparte el doble de puntos
 *   de ranking. Lleva banda de oro con gradiente, sello y nombre en dorado; el
 *   P1 una banda discreta de champán; el P2 apenas un filo.
 *
 *   La jerarquía sale del dato (`destaque` en `@/lib/tier-torneo`), igual que
 *   en el selector del organizador: las dos pantallas dicen lo mismo del mismo
 *   torneo, que es lo que hace que un Major signifique algo.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { porQueSale, type TorneoRecomendado } from '@/lib/torneos-para-ti';
import { opcionDeTier } from '@/lib/tier-torneo';
import { resumenDeDivisiones } from '@/lib/divisiones';
import { formatearRango } from '@/lib/fechas';
import { color, font, fontSize, gradient, radius, space } from '@/lib/design-tokens';

export default function PortadaDeTorneo({
  torneo, onPress,
}: {
  torneo: TorneoRecomendado;
  onPress: () => void;
}) {
  const tier = torneo.tier ? opcionDeTier(torneo.tier) : null;
  const esMajor = tier?.destaque === 'maximo';
  const esP1 = tier?.destaque === 'medio';
  const categorias = resumenDeDivisiones(torneo.divisiones);
  const motivo = porQueSale(torneo);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${torneo.nombre}, ${formatearRango(torneo.inicio, torneo.fin)}`}
      style={({ pressed }) => [
        s.tarjeta,
        esMajor && s.tarjetaMajor,
        pressed && { opacity: 0.9 },
      ]}
    >
      {/* ── LA BANDA ─────────────────────────────────────────────────
          Es lo único que cambia de verdad entre tiers. En el Major ocupa
          y brilla; en el P2 es un filo que casi no se ve. */}
      {esMajor ? (
        <LinearGradient
          colors={gradient.gold.colors}
          start={gradient.gold.start}
          end={gradient.gold.end}
          style={s.banda}
        >
          <Text style={s.bandaMajor}>MAJOR</Text>
          {torneo.modo === 'expres' && <Text style={s.bandaMajorModo}>EXPRÉS</Text>}
        </LinearGradient>
      ) : (
        <View style={[s.bandaFina, esP1 && s.bandaFinaP1]}>
          <Text style={[s.bandaTexto, esP1 && s.bandaTextoP1]}>
            {tier ? tier.titulo.toUpperCase() : 'TORNEO'}
            {torneo.modo === 'expres' ? '  ·  EXPRÉS' : ''}
          </Text>
        </View>
      )}

      <View style={s.cuerpo}>
        <Text style={[s.nombre, esMajor && s.nombreMajor]} numberOfLines={2}>
          {torneo.nombre}
        </Text>
        {categorias && <Text style={s.categorias}>{categorias}</Text>}

        <View style={s.separador} />

        {/* ── LA FICHA ─────────────────────────────────────────────── */}
        <Ficha etiqueta="CUÁNDO" valor={formatearRango(torneo.inicio, torneo.fin)} />

        <Ficha
          etiqueta="DÓNDE"
          valor={torneo.sede ?? torneo.ciudad ?? 'Sede por confirmar'}
          // La ciudad debajo y en pequeño: el club es lo que se busca en el
          // mapa, la ciudad solo sitúa.
          pie={torneo.sede && torneo.ciudad ? torneo.ciudad : null}
        />

        <Ficha
          etiqueta="CUOTA"
          valor={torneo.cuota > 0
            ? `$${torneo.cuota.toLocaleString('es-MX')} MXN`
            : 'Gratuito'}
          pie={torneo.cuota > 0 ? 'por pareja' : null}
        />

        {motivo && (
          <View style={s.pie}>
            <Text style={s.motivo}>{motivo}</Text>
            <Text style={s.flecha}>›</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function Ficha({
  etiqueta, valor, pie,
}: {
  etiqueta: string; valor: string; pie?: string | null;
}) {
  return (
    <View style={s.fila}>
      <Text style={s.etiqueta}>{etiqueta}</Text>
      <View style={s.valorCaja}>
        <Text style={s.valor}>{valor}</Text>
        {pie ? <Text style={s.valorPie}>{pie}</Text> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  tarjeta: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.lineSoft,
    backgroundColor: color.surface,
    overflow: 'hidden',
  },
  tarjetaMajor: { borderColor: color.gold },

  // La banda del Major: alta, dorada y con el sello dentro.
  banda: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space[4], paddingVertical: space[2.5],
  },
  bandaMajor: {
    fontFamily: font.display, fontSize: fontSize.section, color: color.onGold,
    letterSpacing: 4, fontWeight: '700',
  },
  bandaMajorModo: {
    fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.onGold,
    letterSpacing: 2, opacity: 0.75,
  },

  // P1 y P2: un filo, no una banda.
  bandaFina: {
    paddingHorizontal: space[4], paddingVertical: space[2],
    borderBottomWidth: 1, borderBottomColor: color.lineSoft,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  bandaFinaP1: {
    borderBottomColor: color.goldMuted,
    backgroundColor: 'rgba(233,221,182,0.06)',
  },
  bandaTexto: {
    fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.muted,
    letterSpacing: 2.5,
  },
  bandaTextoP1: { color: color.champagne },

  cuerpo: { padding: space[4], gap: space[1] },

  nombre: { fontFamily: font.display, fontSize: fontSize.metric, color: color.text, lineHeight: 28 },
  nombreMajor: { color: color.goldBright },
  categorias: {
    fontFamily: font.body, fontSize: fontSize.body, color: color.champagne,
    marginTop: 2,
  },

  separador: {
    height: 1, backgroundColor: color.lineSoft,
    marginVertical: space[3],
  },

  fila: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], paddingVertical: space[1.5] },
  etiqueta: {
    width: 68,
    fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.muted,
    letterSpacing: 1.4, paddingTop: 3,
  },
  valorCaja: { flex: 1 },
  valor: { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.text, lineHeight: 20 },
  valorPie: { fontFamily: font.body, fontSize: fontSize.minAbsolute, color: color.muted, marginTop: 1 },

  pie: {
    flexDirection: 'row', alignItems: 'center', gap: space[2],
    marginTop: space[3], paddingTop: space[3],
    borderTopWidth: 1, borderTopColor: color.lineSoft,
  },
  motivo: { flex: 1, fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne },
  flecha: { fontFamily: font.display, fontSize: fontSize.h1Inline, color: color.gold },
});
