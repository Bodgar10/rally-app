/**
 * RALLY · MIS TORNEOS (los que organiza), en el dashboard del jugador
 *
 * Ver `@/lib/torneos-organizador` para el porqué y para las reglas de qué se
 * atiende primero. Aquí solo se pinta.
 *
 * SÍ RECIBE LA LISTA POR PROPS, y aquí eso no es el error de siempre. La regla
 * que este proyecto ya se comió tres veces es sobre componentes con
 * SUSCRIPCIÓN: al inyectarles los datos apagan su canal de Realtime y se
 * quedan callados para siempre. Este no tiene canal — es una consulta de
 * sesión, cacheada por `useOrganizerTournaments`— y el dashboard necesita la
 * misma lista para decidir el orden de la pantalla y si sobra la tarjeta de
 * "sin partidos". Duplicar el hook aquí daría dos fuentes para una decisión
 * que se toma arriba.
 *
 * Cada tarjeta lleva al panel del torneo, que es donde se atiende lo que dice.
 */

import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

import { formatearRango } from '@/lib/fechas';
import { color, radius, space, font, fontSize } from '@/lib/design-tokens';
import {
  queAtender,
  etiquetaDeEstado,
  type TorneoOrganizado,
} from '@/lib/torneos-organizador';

export default function MisTorneosOrganizados({
  torneos,
}: {
  torneos: TorneoOrganizado[];
}) {
  const router = useRouter();
  if (torneos.length === 0) return null;

  return (
    <View>
      <View style={{ marginTop: space[5], marginBottom: space[2] }}>
        <Text
          style={{
            fontFamily: font.body, fontSize: 11, color: color.muted,
            textTransform: 'uppercase', letterSpacing: 1.2,
          }}
        >
          {torneos.length === 1 ? 'MI TORNEO' : 'MIS TORNEOS'}
        </Text>
      </View>

      {torneos.map((t) => {
        const aviso = queAtender(t);
        const fechas = formatearRango(t.inicio, t.fin);
        const estado = etiquetaDeEstado(t.status);

        return (
          <Pressable
            key={t.id}
            onPress={() => router.push(`/(organizer)/org/torneos/${t.id}`)}
            accessibilityRole="button"
            accessibilityLabel={
              `Administrar ${t.nombre}` + (aviso ? `. ${aviso.texto}` : '')
            }
            style={({ pressed }) => [
              {
                backgroundColor: color.surface,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: aviso?.urge ? color.gold : color.line,
                padding: space[4],
                marginBottom: space[2],
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            {/* minWidth: 0 en el lado que crece — sin esto el nombre largo
                empuja al chevron fuera de la tarjeta en web. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                {estado ? (
                  <Text
                    style={{
                      fontFamily: font.body, fontSize: 10, color: color.muted,
                      textTransform: 'uppercase', letterSpacing: 0.6,
                      marginBottom: space[1],
                    }}
                  >
                    {estado}
                  </Text>
                ) : null}

                <Text
                  numberOfLines={2}
                  style={{
                    fontFamily: font.display, fontSize: fontSize.cardName,
                    color: color.text, marginBottom: 2,
                  }}
                >
                  {t.nombre}
                </Text>

                {fechas ? (
                  <Text style={{ fontFamily: font.body, fontSize: fontSize.caption, color: color.muted }}>
                    {fechas}
                  </Text>
                ) : null}
              </View>

              <Text style={{ fontFamily: font.body, fontSize: 22, color: color.muted, lineHeight: 24 }}>
                ›
              </Text>
            </View>

            {/* LO QUE HAY QUE ATENDER. En oro cuando hay gente esperando; en
                gris cuando es trabajo normal. Si no hay nada, no se pinta:
                un "todo en orden" es una línea que se lee y no aporta. */}
            {aviso && (
              <View
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: space[2],
                  marginTop: space[3], paddingTop: space[3],
                  borderTopWidth: 1, borderTopColor: color.lineSoft,
                }}
              >
                <View
                  style={{
                    width: 6, height: 6, borderRadius: 3,
                    backgroundColor: aviso.urge ? color.gold : color.muted,
                  }}
                />
                <Text
                  style={{
                    flex: 1, minWidth: 0,
                    fontFamily: font.body, fontSize: fontSize.caption,
                    color: aviso.urge ? color.gold : color.muted,
                  }}
                >
                  {aviso.texto}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
