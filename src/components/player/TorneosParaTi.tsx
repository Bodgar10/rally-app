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
 * ► LA TARJETA LA PINTA `PortadaDeTorneo`, Y ESO ES A PROPÓSITO
 *   Aquí vive QUÉ se enseña y en qué orden; allí, cómo se ve. Un torneo tiene
 *   que leerse igual salga de esta lista o de la pantalla de Torneos, y con la
 *   tarjeta escrita aquí dentro eso no iba a durar dos cambios.
 *
 * ► Y SIGUE HABIENDO PUERTA A LA LISTA COMPLETA
 *   Esta es corta a propósito y filtra. Lo que se queda fuera no desaparece:
 *   "Ver todos" lleva a la pantalla de Torneos, que no filtra nada.
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { cargarTorneosParaTi } from '@/lib/torneos-para-ti-datos';
import { type TorneoRecomendado } from '@/lib/torneos-para-ti';
import PortadaDeTorneo from '@/components/player/PortadaDeTorneo';
import { color, font, fontSize, radius, space } from '@/lib/design-tokens';

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

      {lista?.map((t) => (
        <PortadaDeTorneo
          key={t.id}
          torneo={t}
          onPress={() => router.push(`/(protected)/inscripcion/${t.id}`)}
        />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  // Separación generosa: son portadas, no filas de una lista. Pegadas se leen
  // como una tabla y pierden justo lo que las hace mirarse.
  raiz: { gap: space[3] },

  cabecera: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: space[2], marginBottom: space[1],
  },
  etiqueta: {
    fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne,
    letterSpacing: 2, textTransform: 'uppercase',
  },
  verTodos: { fontFamily: font.body, fontSize: fontSize.caption, color: color.gold },

  vacio: {
    gap: space[1], padding: space[3.5], borderRadius: radius.md,
    borderWidth: 1, borderColor: color.lineSoft, backgroundColor: color.surface,
  },
  vacioTitulo: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  vacioTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },
});
