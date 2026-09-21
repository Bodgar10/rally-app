/**
 * app/(public)/landing.tsx
 *
 * RALLY · La portada.
 *
 * ► NO HAY UNA SOLA CAPTURA DE PANTALLA
 *   Una portada de capturas envejece el día que se toca un color, y además se
 *   nota: la gente sabe distinguir una imagen de algo que se mueve. Aquí cada
 *   bloque es el componente de verdad, con datos de ejemplo — y la tabla del
 *   grupo corre `computeTablaExpres`, el mismo motor que ordena un torneo
 *   real. Si el motor cambia de criterio, la portada cambia con él.
 *
 * ► CINCO BOTONES, CINCO FRASES, UN DESTINO
 *   Todos llevan al login. Ninguno dice lo mismo: cada uno recoge la promesa
 *   de la sección que acaba de leerse. El mismo texto repetido convierte el
 *   botón en decoración y el ojo aprende a saltárselo.
 *
 * ► VIVE EN `(public)`, QUE NO TIENE GUARD
 *   Es lo único de la app que se ve sin cuenta. `app/index.tsx` manda aquí a
 *   quien llega por la web sin sesión; en la app instalada no tiene sentido
 *   una portada de captación, así que allí sigue yendo al login.
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
                El torneo del domingo,{'\n'}
                <Text style={s.h1Oro}>resuelto.</Text>
              </Text>
            </Revelar>

            <Revelar retraso={220}>
              <Text style={s.bajada}>
                Te inscribes, ves tu grupo en vivo, sabes contra quién juegas y a
                qué hora. Sin grupos de WhatsApp y sin perseguir al organizador.
              </Text>
            </Revelar>

            <Revelar retraso={320}>
              <View style={s.ctaHero}>
                <BotonEntrar
                  texto="Buscar un torneo →"
                  pie="Entrar es gratis. Solo pagas la inscripción del torneo al que juegues."
                />
              </View>
            </Revelar>
          </View>

          {/* ── LA TABLA EN VIVO ─────────────────────────────────── */}
          <Seccion
            eyebrow="MIENTRAS SE JUEGA"
            titulo="Tu grupo, moviéndose"
            texto={
              'Cada marcador que se captura reordena la tabla al momento. Sin '
              + 'esperar a que alguien pase la hoja a limpio, y sin discutir el '
              + 'orden: cuando dos empatan, la tabla dice en qué se separan.'
            }
          >
            <DemoTablaViva />
            <BotonEntrar texto="Ver los torneos abiertos" variante="borde" />
          </Seccion>

          {/* ── LA FICHA DEL RIVAL ───────────────────────────────── */}
          <Seccion
            eyebrow="ANTES DE SALIR A LA CANCHA"
            titulo="Contra quién juegas"
            texto={
              'De qué lado juega cada uno y con qué mano. Parece poco hasta que '
              + 'te toca un zurdo en el revés y te das cuenta en el tercer juego. '
              + 'Es simétrico: ellos ven lo mismo de ti.'
            }
          >
            <DemoFichaRival />
            <BotonEntrar texto="Saber contra quién juego" variante="borde" />
          </Seccion>

          {/* ── PARA EL ORGANIZADOR ──────────────────────────────── */}
          <Seccion
            eyebrow="SI ERES QUIEN LO ORGANIZA"
            titulo="La tarde entera, armada sola"
            texto={
              'Pones los inscritos y sale el sorteo, los grupos, las cinco rondas '
              + 'de cada pareja y quién juega a qué hora y en qué cancha. Tú anotas '
              + 'los marcadores, o le das acceso a un juez. Lo demás ya está hecho.'
            }
          >
            <DemoAgenda />
            <BotonEntrar texto="Organizar mi torneo" variante="borde" />
          </Seccion>

          {/* ── EL RANKING ───────────────────────────────────────── */}
          <Seccion
            eyebrow="Y CUANDO TERMINA"
            titulo="Todo cuenta para tu ranking"
            texto={
              'Cada torneo reparte puntos según lo que es. Tu nivel se mide solo, '
              + 'partido a partido, y no depende de que nadie apunte nada en una '
              + 'libreta.'
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
              <Text style={s.cierreTitulo}>Nos vemos en la cancha</Text>
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

          <Text style={s.legal}>
            RALLY · Torneos de pádel en México
          </Text>
        </ScrollView>
      </ScrollDeLanding.Provider>
    </SafeAreaView>
  );
}

/**
 * Una sección: el rótulo, el titular, el párrafo y la demo.
 *
 * Se escalonan los retrasos para que el texto llegue antes que la tarjeta.
 * Al revés —la demo primero— el ojo se va a lo que se mueve y el titular se
 * queda sin leer, que es justo el que explica lo que se está viendo.
 */
function Seccion({
  eyebrow, titulo, texto, children,
}: {
  eyebrow: string;
  titulo: string;
  texto: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.seccion}>
      <Revelar><Text style={s.eyebrow}>{eyebrow}</Text></Revelar>
      <Revelar retraso={80}><Text style={s.h2}>{titulo}</Text></Revelar>
      <Revelar retraso={160}><Text style={s.parrafo}>{texto}</Text></Revelar>
      <Revelar retraso={260}><View style={s.demo}>{children}</View></Revelar>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  cont: { paddingBottom: bottomInset, ...webContentColumn },

  // ── Hero ────────────────────────────────────────────────────────
  hero: {
    paddingHorizontal: space[5], paddingTop: space[6] * 2, paddingBottom: space[6] * 2,
    gap: space[4], overflow: 'hidden',
  },
  heroFondo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  marca: {
    fontFamily: font.display, fontSize: fontSize.h1Inline, color: color.gold,
    letterSpacing: 8,
  },
  h1: {
    fontFamily: font.display, fontSize: fontSize.displayL, color: color.text,
    lineHeight: 46,
  },
  h1Oro: { color: color.goldBright },
  bajada: {
    fontFamily: font.body, fontSize: fontSize.h1Inline, color: color.muted,
    lineHeight: 27, maxWidth: 480,
  },
  ctaHero: { marginTop: space[3] },

  // ── Secciones ───────────────────────────────────────────────────
  seccion: {
    paddingHorizontal: space[5], paddingTop: space[6] * 2, gap: space[2],
  },
  eyebrow: {
    fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne,
    letterSpacing: 3,
  },
  h2: {
    fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text,
    marginTop: space[1],
  },
  parrafo: {
    fontFamily: font.body, fontSize: fontSize.body, color: color.muted,
    lineHeight: 23, maxWidth: 520, marginBottom: space[3],
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
    paddingHorizontal: space[5], paddingTop: space[6] * 2, paddingBottom: space[6],
    gap: space[3],
  },
  cierreTitulo: { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.goldBright },
  cierreTexto: {
    fontFamily: font.body, fontSize: fontSize.body, color: color.muted,
    lineHeight: 23, maxWidth: 480, marginBottom: space[2],
  },

  legal: {
    fontFamily: font.body, fontSize: fontSize.minAbsolute, color: color.muted,
    textAlign: 'center', paddingVertical: space[6], opacity: 0.6,
  },
});
