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
 * ── LA TARJETA CRECE CON LA RONDA ──────────────────────────────────────────
 *
 * Se veía igual en la ronda de 32 que en la final, y eso es plano de una forma
 * que el torneo no es. Llegar a la final es lo más grande que te pasa en el fin
 * de semana; la pantalla tiene que saberlo.
 *
 * Los cuatro tratos —qué color, qué tamaño, qué fondo— viven en
 * `@/lib/escala-de-ronda`, no aquí: `MyNextMatch` escala con la MISMA escala,
 * y una sola de las dos escalando sería peor que ninguna. El jugador vería su
 * final tratada como algo grande durante diez minutos y como un partido
 * cualquiera el resto del día.
 *
 * Aquí solo se decide qué hace ESTA tarjeta con esos valores: el titular es la
 * ronda a la que entra, y a partir de semifinales se parte en dos líneas
 * ("Estás en" pequeño y SEMIFINALES en grande).
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
import { LinearGradient } from 'expo-linear-gradient';

import Icon from '@/components/ui/Icon';
import { color, font, fontSize, gradient, radius, space } from '@/lib/design-tokens';
import { diaYHoraDeTorneo } from '@/lib/fechas';
import { subscribeToTable, categoryChannel } from '@/lib/realtime/channels';
import { tratoDeNivel } from '@/lib/escala-de-ronda';
import {
  comoLlegaste, fetchSiguienteRonda, textoDelRival, type SiguienteRonda,
} from '@/lib/siguiente-ronda';

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

  const trato = tratoDeNivel(donde.nivel);
  const cuando = diaYHoraDeTorneo(donde.scheduledAt);

  const contenido = (
    <>
      {/* La barra de acento. Verde de victoria abajo, oro pleno arriba: es la
          primera señal de que esta ronda pesa más que la anterior. */}
      {trato.acento.colors ? (
        <LinearGradient
          colors={[...trato.acento.colors] as [string, string, ...string[]]}
          start={gradient.rule.start}
          end={gradient.rule.end}
          style={{ height: trato.acento.alto, borderRadius: 2, marginBottom: space[1] }}
        />
      ) : (
        <View
          style={{
            height: trato.acento.alto,
            backgroundColor: trato.acento.plano,
            borderRadius: 2,
            marginBottom: space[1],
          }}
        />
      )}

      {/* GANAR Y PASAR NO SON LO MISMO.
          Un bye nace ya terminado y con ganador, así que por dentro avanza
          igual que una victoria. Pero felicitar por ganar a quien no jugó —y en
          este torneo son 12 parejas— le quita credibilidad a todo lo demás que
          dice la tarjeta. */}
      <Text
        style={{
          fontFamily: font.display,
          fontSize: 10,
          color: trato.colorEyebrow,
          textTransform: 'uppercase',
          letterSpacing: 1.2,
        }}
      >
        {comoLlegaste(donde.fueBye)}
      </Text>

      {/* EL TITULAR.
          En las rondas bajas, la frase entera en una línea. En semifinales y
          en la final se parte: la ronda pasa a ser la palabra grande, que es
          lo que el jugador va a enseñarle a alguien — y además es la única
          forma de que quepa sin empujar la hora fuera de la pantalla. */}
      {trato.titularPartido ? (
        <View style={{ gap: space[1] }}>
          <Text
            style={{
              fontFamily: font.body,
              fontSize: fontSize.section,
              color: color.champagne,
              letterSpacing: 0.6,
            }}
          >
            Estás en
          </Text>
          <Text
            style={{
              fontFamily: font.display,
              fontSize: trato.tamanoTitular,
              fontWeight: '600',
              color: trato.colorTitular,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              lineHeight: trato.tamanoTitular * 1.1,
            }}
          >
            {donde.rondaSola}
          </Text>
        </View>
      ) : (
        <Text
          style={{
            fontFamily: font.display,
            fontSize: trato.tamanoTitular,
            color: trato.colorTitular,
          }}
        >
          Estás {donde.ronda}
        </Text>
      )}

      {/* EL SELLO DE LA FINAL. Lo único que ninguna otra ronda tiene. Oro
          sólido sobre el granate: no hace falta nada más para que se note. */}
      {trato.sello && (
        <LinearGradient
          colors={[...gradient.seal.colors] as [string, string, ...string[]]}
          start={gradient.seal.start}
          end={gradient.seal.end}
          style={{
            alignSelf: 'flex-start',
            borderRadius: radius.pill,
            paddingHorizontal: space[3],
            paddingVertical: space[1.5],
          }}
        >
          <Text
            style={{
              fontFamily: font.display,
              fontSize: fontSize.eyebrow,
              fontWeight: '600',
              color: color.onGold,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            {trato.sello}
          </Text>
        </LinearGradient>
      )}

      {/* LA HORA Y LA CANCHA, SOLO SI EL PLAN LAS TIENE.
          Sin fila en `match_schedule` esta línea no existe — no se pone un
          guion ni un "por definir". Saber que estás en semifinales ya vale por
          sí solo; una hora inventada valdría menos que nada.

          Su tamaño NO escala con la ronda: es el dato que hace levantarse a
          alguien de la cama, y en la final tiene que leerse igual de bien que
          en octavos. Lo que crece es el titular. */}
      {(cuando || donde.courtLabel) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2] }}>
          {!!cuando && (
            <View style={[styleFicha, { backgroundColor: trato.ficha.fondo }]}>
              <Icon name="clock" size={13} color={trato.ficha.texto} />
              <Text style={{ fontFamily: font.body, fontSize: fontSize.caption, color: trato.ficha.texto }}>
                {cuando}
              </Text>
            </View>
          )}
          {!!donde.courtLabel && (
            <View style={[styleFicha, { backgroundColor: trato.ficha.fondo }]}>
              <Text
                style={{ fontFamily: font.body, fontSize: fontSize.caption, color: trato.ficha.texto }}
                numberOfLines={1}
              >
                🎾 {donde.courtLabel}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Contra quién. Va en su propia línea: pegada a la hora, la incógnita
          contamina el dato cierto.

          Y solo se dice "el ganador de…" cuando de verdad falta por decidirse.
          Si su hermano de cuadro ya tiene ganador —un bye, o un partido
          terminado— el rival es un hecho y se nombra: ver `@/lib/siguiente-ronda`. */}
      <Text style={{ fontFamily: font.body, fontSize: fontSize.caption, color: trato.colorTenue, lineHeight: 18 }}>
        {textoDelRival(donde.rivalSaleDe)}
      </Text>
    </>
  );

  const estiloTarjeta = {
    borderWidth: 1,
    borderColor: trato.borde,
    borderRadius: radius.xl2,
    padding: trato.padding,
    gap: space[2],
    overflow: 'hidden' as const,
  };

  // El degradado solo desde el nivel 3. Debajo, una superficie plana: una
  // tarjeta de octavos con fondo degradado competiría con la de la final, que
  // es justo lo que esto viene a arreglar.
  return trato.fondo ? (
    <LinearGradient
      colors={[...trato.fondo.colors] as [string, string, ...string[]]}
      start={trato.fondo.start}
      end={trato.fondo.end}
      style={estiloTarjeta}
    >
      {contenido}
    </LinearGradient>
  ) : (
    <View style={[estiloTarjeta, { backgroundColor: trato.fondoPlano }]}>{contenido}</View>
  );
}

const styleFicha = {
  borderRadius: radius.sm,
  paddingHorizontal: space[2.5],
  paddingVertical: space[1.5],
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 5,
  flexShrink: 0,
};
