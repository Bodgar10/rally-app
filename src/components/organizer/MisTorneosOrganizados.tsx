/**
 * RALLY · MIS TORNEOS (los que organiza), en el dashboard del jugador
 *
 * Ver `@/lib/torneos-organizador` para el porqué y para las reglas de qué se
 * atiende primero. Los píxeles son de `TarjetaDeTorneo`, compartida con la
 * sección del juez: aquí solo se elige qué va en cada hueco.
 *
 * SÍ RECIBE LA LISTA POR PROPS, y aquí eso no es el error de siempre. La regla
 * que este proyecto ya se comió tres veces es sobre componentes con
 * SUSCRIPCIÓN: al inyectarles los datos apagan su canal de Realtime y se
 * quedan callados para siempre. Este no tiene canal —es una consulta de
 * sesión, cacheada por `useOrganizerTournaments`— y el dashboard necesita la
 * misma lista para decidir el orden de la pantalla y si sobra la tarjeta de
 * "sin partidos". Duplicar el hook aquí daría dos fuentes para una decisión
 * que se toma arriba.
 */

import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { formatearRango } from '@/lib/fechas';
import TarjetaDeTorneo, { EtiquetaDeSeccion } from '@/components/shared/TarjetaDeTorneo';
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
      <EtiquetaDeSeccion texto={torneos.length === 1 ? 'MI TORNEO' : 'MIS TORNEOS'} />

      {torneos.map((t) => {
        const aviso = queAtender(t);
        return (
          <TarjetaDeTorneo
            key={t.id}
            eyebrow={etiquetaDeEstado(t.status)}
            titulo={t.nombre}
            subtitulo={formatearRango(t.inicio, t.fin)}
            aviso={aviso}
            onPress={() => router.push(`/(organizer)/org/torneos/${t.id}`)}
            accessibilityLabel={`Administrar ${t.nombre}` + (aviso ? `. ${aviso.texto}` : '')}
          />
        );
      })}
    </View>
  );
}
