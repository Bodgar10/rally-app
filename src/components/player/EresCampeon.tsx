/**
 * RALLY · Ganaste el torneo
 *
 * El jugador ganaba la final y la app se callaba: `YaEstasEnLaSiguiente` se
 * apaga —después de la final no hay ronda siguiente— y `MyNextMatch` no tiene
 * partido que enseñar. El campeón se quedaba con la pantalla de alguien que no
 * juega, en el único momento del torneo que va a recordar.
 *
 * VA ARRIBA DEL TODO. Es lo único que importa de esa pantalla ese día.
 *
 * EL TRATO ES EL DEL NIVEL 4 de `@/lib/escala-de-ronda`: el granate con oro que
 * el design system ya reserva a campeón y finalista (`RankingBadge`), y que la
 * final de las otras dos tarjetas ya usaba. Si mañana cambia ese trato, cambia
 * aquí también sin tocar este archivo.
 *
 * APARECE en cuanto el juez captura la final: se suscribe a `matches` por sus
 * parejas, como las otras dos. No espera a que el organizador cierre el torneo.
 *
 * Y NO SE VA enseguida. Las otras dos anuncian algo que va a pasar y se apagan
 * cuando pasa; esta anuncia algo que ya pasó. Se queda hasta que haya otro
 * torneo del que hablar — ver `SIGUE_SIENDO_NOTICIA` en `@/lib/campeon`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import Confeti from '@/components/player/Confeti';
import { color, font, fontSize, gradient, radius, space, touchTarget } from '@/lib/design-tokens';
import { tratoDeNivel } from '@/lib/escala-de-ronda';
import { fetchCampeonato, type Campeonato } from '@/lib/campeon';
import { fraseCampeon } from '@/lib/puntos-de-la-ronda';
import { subscribeToTable, pairChannel, combineUnsubs } from '@/lib/realtime/channels';
import { marcarCelebrado, yaSeCelebro } from '@/lib/ya-se-celebro';
import BotonCompartir from '@/components/ui/BotonCompartir';
import { tarjetaDeCampeon } from '@/lib/tarjetas-compartibles';

export default function EresCampeon({ pairIds }: { pairIds: string[] }) {
  const router = useRouter();
  const [campeonato, setCampeonato] = useState<Campeonato | null>(null);
  const [celebrar, setCelebrar] = useState(false);

  /** Solo escribe la última lectura pedida: ver `YaEstasEnLaSiguiente`. */
  const ultimaPeticion = useRef(0);

  const cargar = useCallback(async () => {
    const mia = ++ultimaPeticion.current;
    const c = await fetchCampeonato(pairIds);
    if (mia !== ultimaPeticion.current) return;
    setCampeonato(c);
  }, [pairIds]);

  useEffect(() => {
    void cargar();
    return () => { ultimaPeticion.current++; };
  }, [cargar]);

  // Al capturarse la final llega un evento de SUS partidos: es lo que hace que
  // la tarjeta salga en ese momento y no al recargar.
  useEffect(() => {
    if (pairIds.length === 0) return;
    const unsubs = pairIds.flatMap((pid) => [
      subscribeToTable({
        channelName: `${pairChannel(pid)}:campeon_a`,
        table: 'matches', filter: `pair_a_id=eq.${pid}`,
        onData: () => void cargar(),
      }),
      subscribeToTable({
        channelName: `${pairChannel(pid)}:campeon_b`,
        table: 'matches', filter: `pair_b_id=eq.${pid}`,
        onData: () => void cargar(),
      }),
    ]);
    return combineUnsubs(...unsubs);
  }, [pairIds, cargar]);

  /**
   * El confeti, UNA vez por campeonato.
   *
   * Se pregunta al almacenamiento antes de lanzarlo y se marca al hacerlo, así
   * que al recargar la app queda el trofeo y no la fiesta. Ver
   * `@/lib/ya-se-celebro`.
   */
  const matchId = campeonato?.matchId ?? null;
  useEffect(() => {
    if (!matchId) return;
    let vivo = true;
    void (async () => {
      if (await yaSeCelebro(matchId)) return;
      if (!vivo) return;
      setCelebrar(true);
      await marcarCelebrado(matchId);
    })();
    return () => { vivo = false; };
  }, [matchId]);

  if (!campeonato) return null;

  const trato = tratoDeNivel(4);

  return (
    <LinearGradient
      colors={[...(trato.fondo?.colors ?? [])] as [string, string, ...string[]]}
      start={trato.fondo?.start}
      end={trato.fondo?.end}
      style={{
        borderWidth: 1,
        borderColor: trato.borde,
        borderRadius: radius.xl2,
        padding: trato.padding,
        gap: space[2],
        overflow: 'hidden',
      }}
    >
      {/* Cae por detrás de todo y no intercepta un solo toque. */}
      {celebrar && <Confeti />}

      <LinearGradient
        colors={[...trato.acento.colors!] as [string, string, ...string[]]}
        start={gradient.rule.start}
        end={gradient.rule.end}
        style={{ height: trato.acento.alto, borderRadius: 2, marginBottom: space[1] }}
      />

      <Text
        style={{
          fontFamily: font.display,
          fontSize: fontSize.displayL,
          fontWeight: '600',
          color: trato.colorTitular,
          letterSpacing: 1,
          lineHeight: fontSize.displayL * 1.1,
        }}
      >
        CAMPEÓN
      </Text>

      <Text style={{ fontFamily: font.display, fontSize: fontSize.cardName, color: trato.colorTexto }}>
        Ganaste {campeonato.categoria}
      </Text>

      {/* La noticia que el jugador ya está contando de todos modos. Ponerle el
          botón aquí es ahorrarle escribirla. */}
      <BotonCompartir
        tarjeta={tarjetaDeCampeon(campeonato.categoria)}
        etiqueta="Compartir"
      />

      {/* LOS PUNTOS, SI SE PUDIERON CALCULAR.
          El número definitivo lo escribe `ranking_points` cuando el organizador
          cierra el torneo, y eso puede tardar días: hasta entonces esto es un
          cálculo del cliente con la misma cuenta que le enseñaba la tarjeta
          antes de la final, para que el número no se mueva al ganarla. Sin
          número no se pinta la línea: ni un guion ni un aproximado. */}
      {campeonato.puntos !== null && (
        <Text
          style={{
            fontFamily: font.body,
            fontSize: fontSize.caption,
            fontWeight: '600',
            color: trato.colorTitular,
            lineHeight: 18,
          }}
        >
          {fraseCampeon(campeonato.puntos)}
        </Text>
      )}

      <Pressable
        onPress={() => router.push('/(protected)/ranking')}
        style={({ pressed }) => [
          {
            marginTop: space[2],
            borderRadius: radius.sm,
            minHeight: touchTarget,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: space[5],
            backgroundColor: color.goldBright,
            alignSelf: 'flex-start',
          },
          pressed && { opacity: 0.85 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Ver mi ranking"
      >
        <Text style={{ fontFamily: font.body, fontSize: 14, fontWeight: '600', color: color.onGold, letterSpacing: 0.3 }}>
          Ver mi ranking
        </Text>
      </Pressable>
    </LinearGradient>
  );
}
