/**
 * app/(public)/landing.tsx
 *
 * RALLY · La portada.
 *
 * ► NO HAY UNA SOLA CAPTURA DE PANTALLA
 *   Una portada de capturas envejece el día que se toca un color, y además se
 *   nota. Aquí cada bloque es el componente de verdad con datos de ejemplo, y
 *   la tabla del grupo corre `computeTablaExpres` — el mismo motor que ordena
 *   un torneo real. Si el motor cambia de criterio, la portada cambia con él.
 *
 * ► LA TIPOGRAFÍA HACE EL ARGUMENTO
 *   Frase corta y enorme, y debajo la explicación en pequeño. Es lo que hace
 *   que una portada se lea en diez segundos y se entienda en treinta: el ojo
 *   salta de titular en titular y solo baja al párrafo donde algo le interesó.
 *
 *   La versión anterior tenía todo al mismo tamaño y se leía como un folleto:
 *   cuatro párrafos grises seguidos que hay que leer enteros para saber si
 *   alguno te importa.
 *
 * ► CINCO CTA, CINCO FRASES, UN DESTINO
 *   Todos al login. Ninguno dice lo mismo: cada uno recoge la promesa de la
 *   sección que acaba de leerse. El mismo texto repetido convierte el botón en
 *   decoración y el ojo aprende a saltárselo.
 */

import { useState } from 'react';
import {
  SafeAreaView, ScrollView, StyleSheet, Text, View,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import Revelar, { ScrollDeLanding } from '@/components/landing/Revelar';
import BotonEntrar from '@/components/landing/BotonEntrar';
import DemoTablaViva from '@/components/landing/DemoTablaViva';
import DemoFichaRival from '@/components/landing/DemoFichaRival';
import DemoAgenda from '@/components/landing/DemoAgenda';
import DemoEnVivo from '@/components/landing/DemoEnVivo';
import DemoFinal from '@/components/landing/DemoFinal';
import { TIER_OPCIONES, puntosDelCampeon } from '@/lib/tier-torneo';
import { color, font, fontSize, gradient, radius, space } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';

export default function LandingScreen() {
  const [scroll, setScroll] = useState({ y: 0, alto: 0 });

  function alDesplazar(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, layoutMeasurement } = e.nativeEvent;
    setScroll({ y: contentOffset.y, alto: layoutMeasurement.height });
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollDeLanding.Provider value={scroll}>
        <ScrollView
          contentContainerStyle={s.cont}
          onScroll={alDesplazar}
          // 16 eventos por segundo: suficiente para revelar bloques y sin
          // despertar al hilo de JS en cada píxel.
          scrollEventThrottle={64}
          onLayout={(e) => setScroll((v) => ({ ...v, alto: e.nativeEvent.layout.height }))}
        >
          {/* ── HERO ─────────────────────────────────────────────── */}
          <View style={s.hero}>
            <LinearGradient
              colors={gradient.hero.colors}
              start={gradient.hero.start}
              end={gradient.hero.end}
              style={s.heroFondo}
            />

            <Revelar>
              <Text style={s.marca}>R A L L Y</Text>
            </Revelar>

            <Revelar retraso={120}>
              <Text style={s.h1}>
                Juega amateur.{'\n'}
                <Text style={s.h1Oro}>Siéntete profesional.</Text>
              </Text>
            </Revelar>

            <Revelar retraso={220}>
              <Text style={s.bajada}>
                Cuadros, ranking, marcadores en vivo y ficha de tus rivales. Todo
                lo que tiene un circuito profesional, en el torneo del domingo de
                tu club.
              </Text>
            </Revelar>

            <Revelar retraso={320}>
              <View style={s.ctaHero}>
                <BotonEntrar
                  texto="Buscar un torneo →"
                  pie="Entrar es gratis. Solo pagas la inscripción del torneo que juegues."
                />
              </View>
            </Revelar>
          </View>

          {/* ── EN VIVO ──────────────────────────────────────────── */}
          <Seccion
            grande="Sabes cuándo entras."
            chico={
              'Tu cancha está ocupada por otra categoría y nadie te avisa. Aquí '
              + 'ves cómo va ese partido, juego a juego, y sabes si te da tiempo a '
              + 'comer algo o si tienes que estar calentando.'
            }
          >
            <DemoEnVivo />
            <BotonEntrar texto="Ver los torneos abiertos" variante="borde" />
          </Seccion>

          {/* ── LA TABLA EN VIVO ─────────────────────────────────── */}
          <Seccion
            grande="Y sabes cómo vas."
            chico={
              'Cada marcador reordena tu grupo al momento. Cuando dos parejas '
              + 'empatan, la tabla dice en qué se separan — sin discutirlo en la '
              + 'cancha con una hoja arrugada.'
            }
          >
            <DemoTablaViva />
            <BotonEntrar texto="Entrar a mi grupo" variante="borde" />
          </Seccion>

          {/* ── CLINCH Y FINAL ───────────────────────────────────── */}
          <Seccion
            grande="Te dice que pasaste antes de que lo sepas."
            chico={
              'La app calcula, partido a partido, si ya no te pueden sacar. '
              + 'Muchas veces te enteras de que estás en cuartos mientras comes '
              + 'algo. Y cuando llegas a la final, se nota.'
            }
          >
            <DemoFinal />
            <BotonEntrar texto="Quiero llegar a una final" variante="borde" />
          </Seccion>

          {/* ── LA FICHA DEL RIVAL ───────────────────────────────── */}
          <Seccion
            grande="Contra quién juegas, antes de salir."
            chico={
              'De qué lado juega cada uno y con qué mano. Parece poco hasta que '
              + 'te toca un zurdo en el drive y lo entiendes en el tercer juego. '
              + 'Es simétrico: ellos ven lo mismo de ti.'
            }
          >
            <DemoFichaRival />
            <BotonEntrar texto="Saber contra quién juego" variante="borde" />
          </Seccion>

          {/* ── PARA EL ORGANIZADOR ──────────────────────────────── */}
          <Seccion
            grande="Y si tú lo organizas, no haces nada."
            chico={
              'Pones los inscritos y sale el sorteo, los grupos, las rondas de '
              + 'cada pareja y quién juega a qué hora y en qué cancha. Tú anotas '
              + 'marcadores. Lo demás ya está hecho.'
            }
          >
            <DemoAgenda />
            <BotonEntrar texto="Organizar mi torneo" variante="borde" />
          </Seccion>

          {/* ── EL RANKING ───────────────────────────────────────── */}
          <Seccion
            grande="Todo cuenta."
            chico={
              'Cada torneo reparte puntos según lo que es, como en el circuito. '
              + 'Tu nivel se mide solo, partido a partido, y no depende de que '
              + 'nadie apunte nada en una libreta.'
            }
          >
            <View style={s.tiers}>
              {TIER_OPCIONES.map((o, i) => (
                <Revelar key={o.valor} retraso={i * 90}>
                  <View style={[s.tier, o.destaque === 'maximo' && s.tierMajor]}>
                    <View style={s.tierTextos}>
                      <Text style={[s.tierNombre, o.destaque === 'maximo' && s.tierNombreMajor]}>
                        {o.titulo}
                      </Text>
                      <Text style={s.tierDias}>{o.dias}</Text>
                    </View>
                    <View style={s.tierPuntos}>
                      <Text style={[s.tierNumero, o.destaque === 'maximo' && s.tierNumeroMajor]}>
                        {puntosDelCampeon(o.valor).toLocaleString('es-MX')}
                      </Text>
                      <Text style={s.tierPie}>pts al campeón</Text>
                    </View>
                  </View>
                </Revelar>
              ))}
            </View>
          </Seccion>

          {/* ── CIERRE ───────────────────────────────────────────── */}
          <View style={s.cierre}>
            <Revelar>
              <Text style={s.cierreTitulo}>
                Nos vemos{'\n'}en la cancha.
              </Text>
            </Revelar>
            <Revelar retraso={120}>
              <Text style={s.cierreTexto}>
                Busca un torneo cerca de ti, apúntate con tu pareja y olvídate del
                resto hasta el domingo.
              </Text>
            </Revelar>
            <Revelar retraso={220}>
              <BotonEntrar
                texto="Entrar a RALLY →"
                pie="Si ya tienes cuenta, te lleva directo a tus torneos."
              />
            </Revelar>
          </View>

          <Text style={s.legal}>RALLY · Torneos de pádel en México</Text>
        </ScrollView>
      </ScrollDeLanding.Provider>
    </SafeAreaView>
  );
}

/**
 * Una sección: la frase grande, el párrafo chico y la demo.
 *
 * ► EL TAMAÑO ES EL ARGUMENTO
 *   La frase va enorme y sola; la explicación, pequeña y gris debajo. Quien
 *   baja rápido lee solo las frases grandes y se lleva la idea entera; quien
 *   se para en una, encuentra el porqué justo debajo.
 *
 * Se escalonan los retrasos para que el texto llegue antes que la tarjeta: al
 * revés, el ojo se va a lo que se mueve y el titular se queda sin leer — y es
 * el que explica lo que se está viendo.
 */
function Seccion({
  grande, chico, children,
}: {
  grande: string;
  chico: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.seccion}>
      <Revelar><Text style={s.h2}>{grande}</Text></Revelar>
      <Revelar retraso={120}><Text style={s.parrafo}>{chico}</Text></Revelar>
      <Revelar retraso={240}><View style={s.demo}>{children}</View></Revelar>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  cont: { paddingBottom: bottomInset, ...webContentColumn },

  // ── Hero ────────────────────────────────────────────────────────
  hero: {
    paddingHorizontal: space[5], paddingTop: space[6] * 2.5, paddingBottom: space[6] * 2.5,
    gap: space[4], overflow: 'hidden',
  },
  heroFondo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  marca: {
    fontFamily: font.display, fontSize: fontSize.cardName, color: color.gold,
    letterSpacing: 10, marginBottom: space[3],
  },
  h1: {
    fontFamily: font.display, fontSize: fontSize.displayL, color: color.text,
    lineHeight: 47,
  },
  h1Oro: { color: color.goldBright },
  bajada: {
    fontFamily: font.body, fontSize: fontSize.h1Inline, color: color.muted,
    lineHeight: 28, maxWidth: 460,
  },
  ctaHero: { marginTop: space[4] },

  // ── Secciones ───────────────────────────────────────────────────
  seccion: {
    paddingHorizontal: space[5], paddingTop: space[6] * 2.5, gap: space[3],
  },
  // La frase grande. Es el argumento entero; si no se entiende sola, sobra.
  h2: {
    fontFamily: font.display, fontSize: fontSize.displayL, color: color.text,
    lineHeight: 44, maxWidth: 560,
  },
  // Y el porqué, pequeño y gris, para quien se paró en la frase de arriba.
  parrafo: {
    fontFamily: font.body, fontSize: fontSize.caption, color: color.muted,
    lineHeight: 21, maxWidth: 440, marginBottom: space[4],
  },
  demo: { gap: space[5] },

  // ── Tiers ───────────────────────────────────────────────────────
  tiers: { gap: space[2] },
  tier: {
    flexDirection: 'row', alignItems: 'center', gap: space[3],
    padding: space[4], borderRadius: radius.md,
    borderWidth: 1, borderColor: color.lineSoft, backgroundColor: color.surface,
  },
  tierMajor: { borderColor: color.gold, backgroundColor: 'rgba(212,175,55,0.06)' },
  tierTextos: { flex: 1, gap: 2 },
  tierNombre: { fontFamily: font.display, fontSize: fontSize.h1Inline, color: color.text },
  tierNombreMajor: { color: color.goldBright },
  tierDias: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  tierPuntos: { alignItems: 'flex-end' },
  tierNumero: { fontFamily: font.display, fontSize: fontSize.metric, color: color.champagne },
  tierNumeroMajor: { color: color.goldBright },
  tierPie: { fontFamily: font.body, fontSize: fontSize.minAbsolute, color: color.muted },

  // ── Cierre ──────────────────────────────────────────────────────
  cierre: {
    paddingHorizontal: space[5], paddingTop: space[6] * 2.5, paddingBottom: space[6],
    gap: space[3],
  },
  cierreTitulo: {
    fontFamily: font.display, fontSize: fontSize.displayL, color: color.goldBright,
    lineHeight: 44,
  },
  cierreTexto: {
    fontFamily: font.body, fontSize: fontSize.caption, color: color.muted,
    lineHeight: 21, maxWidth: 420, marginBottom: space[3],
  },

  legal: {
    fontFamily: font.body, fontSize: fontSize.minAbsolute, color: color.muted,
    textAlign: 'center', paddingVertical: space[6], opacity: 0.6,
  },
});
