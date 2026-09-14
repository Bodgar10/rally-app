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

import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import Icon from '@/components/ui/Icon';
import { color, font, fontSize, gradient, radius, space } from '@/lib/design-tokens';
import { diaYHoraDeTorneo } from '@/lib/fechas';
import {
  subscribeToTable, categoryChannel, pairChannel, combineUnsubs,
} from '@/lib/realtime/channels';
import { tratoDeNivel } from '@/lib/escala-de-ronda';
import {
  comoLlegaste, fetchSiguienteRonda, textoDelRival, type LecturaSiguienteRonda,
} from '@/lib/siguiente-ronda';

export default function YaEstasEnLaSiguiente({ pairIds }: { pairIds: string[] }) {
  const [lectura, setLectura] = useState<LecturaSiguienteRonda | null>(null);

  /**
   * QUÉ RESPUESTA MANDA CUANDO HAY VARIAS EN VUELO.
   *
   * Al completarse la ronda llegan varios eventos casi a la vez —su partido y
   * el del hermano de cuadro— y cada uno lanza su lectura. Con reintentos de
   * por medio pueden tardar cosas distintas, así que una lectura VIEJA puede
   * contestar después de una nueva.
   *
   * Eso no es un detalle: la vieja diría "estás en la final" (la calculó antes
   * de que naciera el partido) y pisaría al "nada" de la nueva. Resultado: esta
   * tarjeta encendida Y `MyNextMatch` enseñando el mismo partido — las dos a la
   * vez, que es justo lo que no puede pasar.
   *
   * Cada lectura se lleva un número. Solo escribe la última que se pidió; las
   * que lleguen tarde se tiran. Va en una ref porque cambiarlo no tiene que
   * repintar nada.
   */
  const ultimaPeticion = useRef(0);

  const cargar = useCallback(async () => {
    const mia = ++ultimaPeticion.current;
    const r = await fetchSiguienteRonda(pairIds);
    if (mia !== ultimaPeticion.current) return; // llegó tarde: ya hay una más nueva
    setLectura(r);
  }, [pairIds]);

  useEffect(() => {
    void cargar();
    // Al desmontar (o al cambiar de parejas) se invalida lo que siga en vuelo.
    return () => { ultimaPeticion.current++; };
  }, [cargar]);

  /**
   * QUE SE ENTERE DE QUE GANÓ, NO SOLO DE QUE SE ACABÓ.
   *
   * Antes esta tarjeta solo calculaba al montarse, y su única suscripción
   * existía para APAGARSE. O sea que el jugador con la app abierta ganaba su
   * semifinal, el juez capturaba, y no pasaba nada hasta que recargaba: la
   * noticia llegaba tarde justo el día que importa.
   *
   * Un canal por pareja y por lado, como `MyNextMatch` y `MisResultados`:
   * Realtime no acepta filtros `in`, así que no hay forma de escuchar "mis
   * partidos" en una sola suscripción. Sufijos propios para no pisar los tres
   * pares de canales que ya escuchan estas mismas filas.
   *
   * SOLO `matches`, y basta. El juez captura y la RPC escribe `winner_pair_id`
   * y `status='finished'` en la MISMA transacción, así que un evento trae ya el
   * resultado entero. `match_sets` no se escucha a propósito: un set suelto no
   * decide nada y solo traería lecturas que devuelven lo mismo.
   */
  useEffect(() => {
    if (pairIds.length === 0) return;
    const unsubs = pairIds.flatMap((pid) => [
      subscribeToTable({
        channelName: `${pairChannel(pid)}:siguiente_a`,
        table: 'matches', filter: `pair_a_id=eq.${pid}`,
        onData: () => void cargar(),
      }),
      subscribeToTable({
        channelName: `${pairChannel(pid)}:siguiente_b`,
        table: 'matches', filter: `pair_b_id=eq.${pid}`,
        onData: () => void cargar(),
      }),
    ]);
    return combineUnsubs(...unsubs);
  }, [pairIds, cargar]);

  /**
   * Lo que hay que pintar, o nada.
   *
   * `'no-se-pudo'` no pinta nada, IGUAL que `'nada'` — pero por una razón
   * distinta y ya no se confunden. No se inventa una tarjeta con huecos ni se
   * le enseña al jugador un error rojo por una lectura que falló: lo que vino a
   * buscar está debajo. Lo que sí queda es el rastro, con código y contexto,
   * que `leerConReintento` escribió después de reintentar.
   */
  const donde = lectura?.estado === 'hay' ? lectura.donde : null;

  /**
   * Y al resto de SU categoría, que es de donde sale el rival.
   *
   * Los canales de arriba solo traen SUS partidos, y hay algo que cambia sin
   * que él juegue: cuando se resuelve el otro cruce, "contra el ganador de A vs
   * B" pasa a ser un nombre. Eso vive en la categoría, no en sus filas.
   *
   * Depende del `categoryId` y no del objeto entero: cada lectura devuelve un
   * objeto nuevo, así que con `donde` en las dependencias este canal se cerraba
   * y se reabría en cada recálculo, sin que hubiera cambiado nada.
   */
  const categoryId = donde?.categoryId ?? null;

  useEffect(() => {
    if (!categoryId) return;
    return subscribeToTable({
      channelName: `${categoryChannel(categoryId)}:siguiente_ronda`,
      table: 'matches',
      filter: `category_id=eq.${categoryId}`,
      onData: () => void cargar(),
    });
  }, [categoryId, cargar]);

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

      {/* LO QUE YA ES SUYO POR ESTAR AQUÍ.
          Estaba en `MyNextMatch` y no aquí — o sea que faltaba justo en la
          final, que es donde más pesa: 650 puntos asegurados y 1000 si gana.

          GARANTIZADOS, no definitivos: un resultado corregido puede moverlos.
          Y no se pinta nada si el helper no pudo calcularlos — sin guiones y
          sin un número aproximado, que sería peor que el hueco.

          Su tamaño NO escala con la ronda, igual que la hora y la cancha: es un
          dato, y los datos se leen igual en octavos que en la final. El color
          sale del trato, que sobre el granate ya resuelve el contraste. */}
      {donde.puntos && (
        <Text
          style={{
            fontFamily: font.body,
            fontSize: fontSize.caption,
            fontWeight: '600',
            color: trato.colorTitular,
            lineHeight: 18,
          }}
        >
          {`Tienes ${donde.puntos.garantizados.toLocaleString()} pts de ranking garantizados`}
          {` · Si ganan, ${donde.puntos.siGanan.toLocaleString()}`}
        </Text>
      )}
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
