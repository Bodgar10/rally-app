/**
 * src/components/player/TorneosParaTi.tsx
 *
 * RALLY · Los torneos a los que se puede apuntar, en el dashboard.
 *
 * ► ERA UN ENLACE A UNA LISTA, Y UN ENLACE NO ES UNA LISTA
 *   El dashboard decía "Torneos disponibles · Inscríbete y compite" y llevaba
 *   a otra pantalla. Para contestar "¿hay algo para mí este fin de semana?"
 *   —que es a lo que se abre esta app— había que entrar, leer todos los
 *   torneos, mirar la ciudad de cada uno y comprobar si alguna categoría era
 *   la suya. Tres pantallas y un trabajo que la app puede hacer sola.
 *
 *   Ahora están aquí, ya ordenados por lo que de verdad decide si puede ir:
 *   su zona primero, luego su división, luego el tier. El orden y su porqué
 *   viven en `@/lib/torneos-para-ti`, con tests.
 *
 * ► CADA TARJETA DICE POR QUÉ SALE
 *   Un orden que no se explica se lee como un orden que no existe. "Por tu
 *   zona y tu nivel" es lo que convierte una lista ordenada en una lista que
 *   se entiende — y es honesto: cuando no hay motivo (un jugador nuevo, del
 *   que no sabemos ni dónde juega) no se inventa ninguno.
 *
 * ► Y SIGUE HABIENDO PUERTA A LA LISTA COMPLETA
 *   Esta es corta a propósito y filtra. Lo que se queda fuera no desaparece:
 *   "Ver todos" lleva a la pantalla de Torneos, que no filtra nada.
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { cargarTorneosParaTi } from '@/lib/torneos-para-ti-datos';
import { porQueSale, type TorneoRecomendado } from '@/lib/torneos-para-ti';
import { opcionDeTier } from '@/lib/tier-torneo';
import { formatearRango } from '@/lib/fechas';
import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';

export default function TorneosParaTi({ userId }: { userId: string }) {
  const router = useRouter();
  const [lista, setLista] = useState<TorneoRecomendado[] | null>(null);

  useEffect(() => {
    let vivo = true;
    cargarTorneosParaTi(userId).then((r) => { if (vivo) setLista(r.lista); });
    return () => { vivo = false; };
  }, [userId]);

  return (
    <View style={s.raiz}>
      <View style={s.cabecera}>
        <Text style={s.etiqueta}>TORNEOS</Text>
        <Pressable
          onPress={() => router.push('/(protected)/torneos')}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={s.verTodos}>Ver todos ›</Text>
        </Pressable>
      </View>

      {lista === null && <ActivityIndicator color={color.gold} />}

      {/* Vacío de verdad: no hay inscripciones abiertas en ningún sitio. Se
          dice, en vez de dejar un hueco que parece un fallo de carga. */}
      {lista !== null && lista.length === 0 && (
        <Pressable
          onPress={() => router.push('/(protected)/torneos')}
          style={({ pressed }) => [s.vacio, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Text style={s.vacioTitulo}>Nada abierto ahora mismo</Text>
          <Text style={s.vacioTexto}>
            En cuanto se abran inscripciones, los de tu zona salen aquí. Mientras
            tanto puedes ver todos los torneos.
          </Text>
        </Pressable>
      )}

      {lista?.map((t) => {
        const motivo = porQueSale(t);
        const tier = t.tier ? opcionDeTier(t.tier) : null;
        return (
          <Pressable
            key={t.id}
            onPress={() => router.push(`/(protected)/inscripcion/${t.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Inscribirse en ${t.nombre}`}
            style={({ pressed }) => [
              s.tarjeta,
              t.tier === 'major' && s.tarjetaMajor,
              pressed && { opacity: 0.85 },
            ]}
          >
            <View style={s.filaAlta}>
              <Text style={s.nombre} numberOfLines={2}>{t.nombre}</Text>
              {tier && (
                <View style={[s.sello, t.tier === 'major' && s.selloMajor]}>
                  <Text style={[s.selloTexto, t.tier === 'major' && s.selloTextoMajor]}>
                    {tier.titulo}
                  </Text>
                </View>
              )}
            </View>

            <Text style={s.cuando}>
              {formatearRango(t.inicio, t.fin)}
              {t.ciudad ? ` · ${t.ciudad}` : ''}
              {t.modo === 'expres' ? ' · Exprés' : ''}
            </Text>

            <View style={s.filaBaja}>
              {motivo && <Text style={s.motivo}>{motivo}</Text>}
              <Text style={s.cuota}>
                {t.cuota > 0 ? `$${t.cuota.toLocaleString('es-MX')}` : 'Gratuito'}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  raiz: { gap: space[2] },

  cabecera: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: space[2], marginBottom: space[1],
  },
  etiqueta: {
    fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne,
    letterSpacing: 2, textTransform: 'uppercase',
  },
  verTodos: { fontFamily: font.body, fontSize: fontSize.caption, color: color.gold },

  tarjeta: {
    gap: space[1.5], padding: space[3.5], minHeight: touchTarget,
    borderRadius: radius.md, borderWidth: 1, borderColor: color.lineSoft,
    backgroundColor: color.surface,
  },
  // El Major se distingue también aquí, igual que al crearlo: es el torneo
  // que hay que apuntar en el calendario con tiempo.
  tarjetaMajor: { borderColor: color.goldMuted, backgroundColor: 'rgba(212,175,55,0.06)' },

  filaAlta: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  nombre: { flex: 1, fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },

  sello: {
    paddingHorizontal: space[2], paddingVertical: 2,
    borderRadius: radius.sm, borderWidth: 1, borderColor: color.lineSoft,
  },
  selloMajor: { borderColor: color.gold, backgroundColor: 'rgba(212,175,55,0.16)' },
  selloTexto: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.muted, letterSpacing: 0.8 },
  selloTextoMajor: { color: color.goldBright },

  cuando: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },

  filaBaja: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: space[1] },
  motivo: { flex: 1, fontFamily: font.body, fontSize: fontSize.minAbsolute, color: color.champagne },
  cuota: { fontFamily: font.body, fontSize: fontSize.caption, fontWeight: '600', color: color.text },

  vacio: {
    gap: space[1], padding: space[3.5], borderRadius: radius.md,
    borderWidth: 1, borderColor: color.lineSoft, backgroundColor: color.surface,
  },
  vacioTitulo: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  vacioTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },
});
