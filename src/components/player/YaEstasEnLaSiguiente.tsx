/**
 * RALLY · "Ya estás en la siguiente ronda"
 *
 * Gana los cuartos, sale de la pista, abre el teléfono — y la app no le decía
 * nada. Su semifinal todavía no existe como partido (el cuadro avanza con la
 * ronda COMPLETA, y quedan otros cuartos por jugar), así que "Mi próximo
 * partido" no tenía qué enseñar y "Mi situación" ya se había callado. Lo único
 * que veía era su propia lista de resultados.
 *
 * Todo lo que necesitaba estaba escrito: la ronda a la que entra sale del mismo
 * motor que armará el cruce, y la hora y la cancha llevan reservadas en
 * `match_schedule` desde que se programó el día. Ver `@/lib/siguiente-ronda`.
 *
 * EL TONO ES DE LOGRO, NO DE AVISO. Acaba de ganar: lo primero que lee es dónde
 * está, no lo que le falta por saber.
 *
 * SE APAGA SOLA. En cuanto la ronda se completa nace el partido de verdad y
 * `MyNextMatch` lo enseña entero; el helper devuelve `null` desde ese mismo
 * instante y esta tarjeta desaparece. Por eso se suscribe al cuadro de su
 * categoría: el relevo ocurre sin que nadie recargue.
 *
 * Solo lectura, como todo lo que hay debajo.
 */

import { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';

import Icon from '@/components/ui/Icon';
import { color, font, fontSize, radius, space } from '@/lib/design-tokens';
import { diaYHoraDeTorneo } from '@/lib/fechas';
import { subscribeToTable, categoryChannel } from '@/lib/realtime/channels';
import { fetchSiguienteRonda, type SiguienteRonda } from '@/lib/siguiente-ronda';

export default function YaEstasEnLaSiguiente({ pairIds }: { pairIds: string[] }) {
  const [donde, setDonde] = useState<SiguienteRonda | null>(null);

  const cargar = useCallback(async () => {
    setDonde(await fetchSiguienteRonda(pairIds));
  }, [pairIds]);

  useEffect(() => { void cargar(); }, [cargar]);

  // Al cuadro de SU categoría, que es donde va a nacer el partido que jubila
  // esta tarjeta. No se puede suscribir antes de saber cuál es, y no hace
  // falta: hasta entonces no hay nada pintado.
  useEffect(() => {
    if (!donde) return;
    return subscribeToTable({
      channelName: `${categoryChannel(donde.categoryId)}:siguiente_ronda`,
      table: 'matches',
      filter: `category_id=eq.${donde.categoryId}`,
      onData: () => void cargar(),
    });
  }, [donde, cargar]);

  // Mientras carga no se pinta un spinner: esto no es la respuesta que el
  // jugador vino a buscar, es una que se le adelanta. Un hueco girando encima
  // de sus resultados sería peor que aparecer medio segundo después.
  if (!donde) return null;

  const cuando = diaYHoraDeTorneo(donde.scheduledAt);

  return (
    <View
      style={{
        backgroundColor: color.surface,
        borderWidth: 1,
        borderColor: color.line,
        borderRadius: radius.xl2,
        padding: space[4.5],
        gap: space[2],
        overflow: 'hidden',
      }}
    >
      {/* Verde, no dorado: es el color de la victoria en el resto de la app. */}
      <View style={{ height: 3, backgroundColor: color.live, borderRadius: 2, marginBottom: space[1] }} />

      <Text
        style={{
          fontFamily: font.display,
          fontSize: 10,
          color: color.live,
          textTransform: 'uppercase',
          letterSpacing: 1.2,
        }}
      >
        Ganaste
      </Text>

      <Text style={{ fontFamily: font.display, fontSize: fontSize.metric, color: color.goldBright }}>
        Estás {donde.ronda}
      </Text>

      {/* LA HORA Y LA CANCHA, SOLO SI EL PLAN LAS TIENE.
          Sin fila en `match_schedule` esta línea no existe — no se pone un
          guion ni un "por definir". Saber que estás en semifinales ya vale por
          sí solo; una hora inventada valdría menos que nada. */}
      {(cuando || donde.courtLabel) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2] }}>
          {!!cuando && (
            <View style={styleFicha}>
              <Icon name="clock" size={13} color={color.text} />
              <Text style={{ fontFamily: font.body, fontSize: fontSize.caption, color: color.text }}>
                {cuando}
              </Text>
            </View>
          )}
          {!!donde.courtLabel && (
            <View style={styleFicha}>
              <Text style={{ fontFamily: font.body, fontSize: fontSize.caption, color: color.text }} numberOfLines={1}>
                🎾 {donde.courtLabel}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Contra quién. Va en su propia línea: pegada a la hora, la incógnita
          contamina el dato cierto. */}
      <Text style={{ fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 }}>
        {donde.rivalSaleDe
          ? `Contra el ganador de ${donde.rivalSaleDe.parejaA} vs ${donde.rivalSaleDe.parejaB}`
          : 'Rival por definir'}
      </Text>
    </View>
  );
}

const styleFicha = {
  backgroundColor: color.surface2,
  borderRadius: radius.sm,
  paddingHorizontal: space[2.5],
  paddingVertical: space[1.5],
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 5,
  flexShrink: 0,
};
