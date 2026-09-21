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
 * ► LOS TRES SON PORTADAS. LO QUE CAMBIA ES CUÁNTO GRITAN
 *   El primer intento dejaba al Major con banda de oro y a los otros dos con
 *   un filo de nada, y eso no era una jerarquía: era un torneo con cartel y
 *   dos sin cartel. Un P2 sigue siendo el torneo al que alguien va el
 *   domingo — también merece portada.
 *
 *   Así que los tres llevan banda entera, con gradiente, y lo que baja es la
 *   temperatura:
 *
 *     MAJOR  oro (grad-gold) sobre texto oscuro. Banda alta, borde dorado de
 *            2px y la tarjeta entera con un tinte cálido. Se ve desde el otro
 *            lado de la pantalla, que es justo lo que es un Major.
 *     P1     granate (grad-wine). Color propio y rico, claramente un escalón
 *            abajo del oro sin parecer apagado.
 *     P2     grafito (grad-hero) con hairline y texto champán. Sobrio, pero
 *            sigue siendo una banda y sigue siendo una portada.
 *
 *   Los tres gradientes son los OFICIALES de Doc D §2.3. No se inventa
 *   ninguno: el escalón se consigue eligiendo entre los que ya existen, que
 *   es justo para lo que están.
 *
 *   La jerarquía sale del dato (`destaque` en `@/lib/tier-torneo`), igual que
 *   en el selector del organizador: las dos pantallas dicen lo mismo del mismo
 *   torneo, que es lo que hace que un Major signifique algo.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { porQueSale, type TorneoRecomendado } from '@/lib/torneos-para-ti';
import { opcionDeTier, textoPuntosDelCampeon } from '@/lib/tier-torneo';
import { resumenDeDivisiones } from '@/lib/divisiones';
import { formatearRango } from '@/lib/fechas';
import { color, font, fontSize, gradient, radius, space } from '@/lib/design-tokens';

/**
 * El aspecto de cada escalón. Vive junto al componente porque son decisiones
 * de pintura —qué gradiente, qué color de texto— y no del dominio; lo que sí
 * es del dominio es CUÁL de los tres le toca a cada torneo, y eso lo dice
 * `destaque` en `@/lib/tier-torneo`.
 */
const BANDA = {
  maximo: {
    gradiente: gradient.gold,
    texto: color.onGold,
    // El único con la banda alta. Es el torneo grande del calendario.
    alta: true,
  },
  medio: {
    gradiente: gradient.wine,
    texto: color.onWine,
    alta: false,
  },
  base: {
    gradiente: gradient.hero,
    texto: color.champagne,
    alta: false,
  },
} as const;

export default function PortadaDeTorneo({
  torneo, onPress,
}: {
  torneo: TorneoRecomendado;
  onPress: () => void;
}) {
  const tier = torneo.tier ? opcionDeTier(torneo.tier) : null;
  // Sin tier se pinta como el escalón de abajo: no sabemos qué reparte, así
  // que no se le pone ni el oro ni el granate.
  const destaque = tier?.destaque ?? 'base';
  const esMajor = destaque === 'maximo';
  const banda = BANDA[destaque];

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
          Entera en los tres, con gradiente en los tres. Lo que sube con el
          tier es la temperatura, no la presencia. */}
      <LinearGradient
        colors={banda.gradiente.colors}
        start={banda.gradiente.start}
        end={banda.gradiente.end}
        style={[s.banda, banda.alta && s.bandaAlta]}
      >
        <Text
          style={[s.bandaTitulo, { color: banda.texto }, esMajor && s.bandaTituloMajor]}
        >
          {tier ? tier.titulo.toUpperCase() : 'TORNEO'}
        </Text>

        <View style={s.bandaDerecha}>
          {torneo.modo === 'expres' && (
            <Text style={[s.bandaModo, { color: banda.texto }]}>EXPRÉS</Text>
          )}
          {/* ► LO QUE SE LLEVA EL CAMPEÓN, NO EL MULTIPLICADOR.
              Aquí decía "×0.6 puntos", que no significa nada para quien
              juega: multiplicado ¿por qué? Un número absoluto se compara
              solo — 2,000 contra 600 se entiende sin saber nada más.
              "desde" porque el campeón suma además lo de la fase de grupos. */}
          {torneo.tier && (
            <Text style={[s.bandaPuntos, { color: banda.texto }]}>
              Campeón: desde {textoPuntosDelCampeon(torneo.tier)}
            </Text>
          )}
        </View>
      </LinearGradient>

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
  // El Major se distingue también con la tarjeta apagada: borde de oro y un
  // tinte cálido en todo el cuerpo, no solo en la banda.
  tarjetaMajor: {
    borderWidth: 2,
    borderColor: color.gold,
    backgroundColor: 'rgba(212,175,55,0.05)',
  },

  banda: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space[4], paddingVertical: space[2.5], gap: space[3],
  },
  bandaAlta: { paddingVertical: space[4] },

  bandaTitulo: {
    fontFamily: font.display, fontSize: fontSize.section,
    letterSpacing: 2.5, fontWeight: '700',
  },
  bandaTituloMajor: { fontSize: fontSize.h1Inline, letterSpacing: 5 },

  bandaDerecha: { alignItems: 'flex-end' },
  bandaModo: {
    fontFamily: font.display, fontSize: fontSize.eyebrow,
    letterSpacing: 2, fontWeight: '700',
  },
  bandaPuntos: {
    fontFamily: font.body, fontSize: fontSize.minAbsolute,
    opacity: 0.8,
  },

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
