/**
 * RALLY · PARA ARBITRAR, en el dashboard del jugador
 *
 * Ver `@/lib/torneos-juez` para qué cuenta como pendiente y por qué se nombra
 * la cancha solo cuando hay una sola. Misma tarjeta que la del organizador.
 *
 * LLEVA A SUS PARTIDOS, NO A LA LISTA. Desde el dashboard ya se sabe de qué
 * torneo se habla —lo dice la tarjeta que acaba de tocar—, así que pasar por
 * la lista de torneos sería un peaje. Es el caso contrario al de la pestaña
 * "Juez", que sí pasa siempre por la lista porque desde ahí no se ha elegido
 * nada y su "Volver" tiene que significar algo.
 */

import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { formatearRango } from '@/lib/fechas';
import TarjetaDeTorneo, { EtiquetaDeSeccion } from '@/components/shared/TarjetaDeTorneo';
import { queCapturar, type TorneoArbitrado } from '@/lib/torneos-juez';

export default function MisTorneosArbitrados({
  torneos,
}: {
  torneos: TorneoArbitrado[];
}) {
  const router = useRouter();
  if (torneos.length === 0) return null;

  return (
    <View>
      <EtiquetaDeSeccion texto="PARA ARBITRAR" />

      {torneos.map((t) => {
        const aviso = queCapturar(t);
        const fechas = formatearRango(t.inicio, t.fin);
        return (
          <TarjetaDeTorneo
            key={t.id}
            // El club, no el estado del torneo: es lo que el juez reconoce, y
            // lo que le distingue dos torneos que caen el mismo fin de semana.
            eyebrow={t.organizador}
            titulo={t.nombre}
            subtitulo={fechas}
            aviso={aviso}
            onPress={() => router.push(`/(judge)/juez/${t.id}`)}
            accessibilityLabel={`Arbitrar ${t.nombre}` + (aviso ? `. ${aviso.texto}` : '')}
          />
        );
      })}
    </View>
  );
}
