/**
 * src/components/landing/Landing.tsx
 *
 * RALLY · La portada.
 *
 * ► VIVE EN `src/` Y NO EN UNA RUTA, Y SE MONTA DESDE DOS
 *   La portada es la raíz de la web (`app/index.tsx`) y además tiene su propia
 *   URL (`/landing`). Si el cuerpo viviera en uno de los dos archivos de ruta,
 *   el otro tendría que importarlo — y una ruta importando otra ruta es algo
 *   que el router no promete que vaya a seguir funcionando.
 *
 *   Aquí es un componente normal. Las dos rutas son tres líneas cada una.
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
import Parrafo from '@/components/landing/Parrafo';
import DemoTablaViva from '@/components/landing/DemoTablaViva';
import DemoFichaRival from '@/components/landing/DemoFichaRival';
import DemoAgenda from '@/components/landing/DemoAgenda';
import DemoPanel from '@/components/landing/DemoPanel';
import DemoEnVivo from '@/components/landing/DemoEnVivo';
import DemoFinal from '@/components/landing/DemoFinal';
import { TIER_OPCIONES, puntosDelCampeon } from '@/lib/tier-torneo';
import { color, font, fontSize, gradient, radius, space } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';

export default function Landing() {
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
              <Text style={s.marca}>PADEL CROWN</Text>
            </Revelar>

            <Revelar retraso={120}>
              <Text style={s.h1}>
                Todos los domingos{'\n'}
                <Text style={s.h1Oro}>se corona alguien.</Text>
              </Text>
            </Revelar>

            <Revelar retraso={220}>
              <Parrafo>
                {'Cuadros, *ranking* y *marcadores en vivo*. Lo que tiene un '
                  + 'circuito profesional, en el torneo de *16 parejas de tu '
                  + 'club*.'}
              </Parrafo>
            </Revelar>

            <Revelar retraso={320}>
              <View style={s.ctaHero}>
                <BotonEntrar
                  texto="Buscar mi torneo →"
                  pie="Crear la cuenta no cuesta nada. Solo pagas el torneo que juegues."
                />
              </View>
            </Revelar>
          </View>

          {/* ── EN VIVO ──────────────────────────────────────────── */}
          <Seccion
            grande="Nadie vuelve a preguntar cuándo entra."
            chico={
              'Tu cancha la está usando otra categoría. Aquí ves ese partido '
              + '*juego a juego* y sabes si te da tiempo a un café o si *ya '
              + 'deberías estar calentando*.'
            }
          >
            <DemoEnVivo />
            <BotonEntrar texto="Ver qué hay abierto" variante="borde" />
          </Seccion>

          {/* ── LA TABLA EN VIVO ─────────────────────────────────── */}
          <Seccion
            grande="La tabla se mueve mientras juegas."
            chico={
              'Se captura un marcador y tu grupo *se reordena solo*. Si dos '
              + 'parejas empatan, la tabla *dice exactamente qué las separa*. Se '
              + 'acabó la discusión de la hoja arrugada.'
            }
          >
            <DemoTablaViva />
            <BotonEntrar texto="Entrar a mi grupo" variante="borde" />
          </Seccion>

          {/* ── CLINCH Y FINAL ───────────────────────────────────── */}
          <Seccion
            grande="Te enteras de que pasaste antes que nadie."
            chico={
              'La app sabe el momento exacto en que *ya no te pueden sacar*. Y '
              + 'cuando entras al cuadro deja de hablarte de la tabla: *cuartos, '
              + 'semifinales, la final*. Cada una pesa más que la anterior.'
            }
          >
            <DemoFinal />
            <BotonEntrar texto="Quiero jugar una final" variante="borde" />
          </Seccion>

          {/* ── LA FICHA DEL RIVAL ───────────────────────────────── */}
          <Seccion
            grande="Sabes a quién te enfrentas antes de verle la cara."
            chico={
              'De qué lado juega cada uno y con qué mano. Parece un detalle '
              + 'hasta que te toca *un zurdo en el drive* y lo descubres '
              + 'perdiendo 4-1. Es simétrico: *ellos ven lo mismo de ti*.'
            }
          >
            <DemoFichaRival />
            <BotonEntrar texto="Ver a mis rivales" variante="borde" />
          </Seccion>

          {/* ── PARA EL ORGANIZADOR ──────────────────────────────── */}
          <Seccion
            grande="Organizarlo deja de ser un trabajo."
            chico={
              'Subes la lista de inscritos y sale *el sorteo, los grupos, las '
              + 'cinco rondas y el horario de cada cancha*. Tu único trabajo es '
              + '*anotar marcadores*.'
            }
          >
            {/* Las filas entrando una a una: el trabajo que desaparece. */}
            <DemoAgenda />

            {/* Y lo que hay dentro, por pestañas. La sección prometía cuatro
                cosas y enseñaba una; quien organiza torneos no se cree eso
                con una lista de cinco filas. */}
            <DemoPanel />

            <BotonEntrar texto="Montar mi torneo" variante="borde" />
          </Seccion>

          {/* ── EL RANKING ───────────────────────────────────────── */}
          <Seccion
            grande="Nada de lo que juegas se pierde."
            chico={
              'Cada torneo reparte puntos *según lo que es*, como en el '
              + 'circuito. Tu nivel *se calcula solo*, partido a partido, sin '
              + 'libretas ni favores.'
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
                El domingo{'\n'}hay corona.
              </Text>
            </Revelar>
            <Revelar retraso={120}>
              <View style={s.cierreTexto}>
                <Parrafo>
                  {'Busca un torneo *por tu zona*, apúntate con tu pareja y '
                    + '*no vuelvas a pensar en la logística*.'}
                </Parrafo>
              </View>
            </Revelar>
            <Revelar retraso={220}>
              <BotonEntrar
                texto="Entrar a Padel Crown →"
                pie="¿Ya tienes cuenta? Te deja directo en tus torneos."
              />
            </Revelar>
          </View>

          <Text style={s.legal}>Padel Crown · Torneos de pádel en México</Text>
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
      <Revelar retraso={120}><View style={s.parrafo}><Parrafo>{chico}</Parrafo></View></Revelar>
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
    letterSpacing: 5, marginBottom: space[3],
  },
  h1: {
    fontFamily: font.display, fontSize: fontSize.displayL, color: color.text,
    lineHeight: 47,
  },
  h1Oro: { color: color.goldBright },
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
  // Solo el hueco: el texto lo pinta `Parrafo`, que decide tamaño y realces.
  parrafo: { marginBottom: space[4] },
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
  cierreTexto: { marginBottom: space[3] },

  legal: {
    fontFamily: font.body, fontSize: fontSize.minAbsolute, color: color.muted,
    textAlign: 'center', paddingVertical: space[6], opacity: 0.6,
  },
});
