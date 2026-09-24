/**
 * src/components/player/Palmares.tsx
 *
 * RALLY · Lo que has hecho, torneo a torneo.
 *
 * VIVE EN PERFIL A PROPÓSITO. El dashboard contesta "¿qué pasa hoy?" y por eso
 * la tarjeta de campeón se apaga en cuanto hay otro torneo del que hablar. Esto
 * es lo contrario: no caduca, no compite con nada y no cambia en todo el día.
 *
 * Es donde aterriza el trofeo cuando el dashboard lo suelta — que hasta ahora
 * no era ningún sitio.
 */

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { supabase } from '@/lib/supabase/client';
import { fetchPalmares } from '@/lib/palmares-datos';
import { titulos, type LineaDePalmares } from '@/lib/palmares';
import { SectionLabel } from '@/components/ui';
import { color, font, fontSize, radius, space } from '@/lib/design-tokens';

/** '27 sep 2026'. Corta, porque va al final de una línea que ya dice cosas. */
function fechaCorta(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Palmares() {
  const [lineas, setLineas] = useState<LineaDePalmares[] | null>(null);

  const cargar = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) { setLineas([]); return; }

    const { data: pairs } = await supabase
      .from('pairs')
      .select('id')
      .or(`player1_id.eq.${uid},player2_id.eq.${uid}`);

    setLineas(await fetchPalmares((pairs ?? []).map((p) => p.id), uid));
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  if (lineas === null) {
    return (
      <View style={{ paddingVertical: space[4], alignItems: 'center' }}>
        <ActivityIndicator color={color.gold} />
      </View>
    );
  }

  // Sin un solo torneo jugado no se pinta nada, NI LA ETIQUETA: un "Palmarés"
  // seguido de un hueco es peor que no tener la sección. Por eso la etiqueta
  // vive aquí dentro y no en la pantalla, igual que en MIS RESULTADOS.
  if (lineas.length === 0) return null;

  const cuantos = titulos(lineas);

  return (
    <>
    <SectionLabel title="Palmarés" />
    <View
      style={{
        backgroundColor: color.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.lineSoft,
        overflow: 'hidden',
      }}
    >
      {/* La cabecera solo aparece con algo que presumir. Sin títulos, la lista
          se explica sola y una línea de "0 títulos" es un recordatorio que
          nadie pidió. */}
      {cuantos > 0 && (
        <View
          style={{
            paddingHorizontal: space[4],
            paddingVertical: space[3],
            borderBottomWidth: 1,
            borderBottomColor: color.lineSoft,
            backgroundColor: 'rgba(212,175,55,0.06)',
          }}
        >
          <Text style={{ fontFamily: font.display, fontSize: fontSize.h1Inline, color: color.goldBright }}>
            {cuantos} {cuantos === 1 ? 'título' : 'títulos'}
          </Text>
          <Text style={{ fontFamily: font.body, fontSize: fontSize.caption, color: color.muted }}>
            en {lineas.length} {lineas.length === 1 ? 'torneo jugado' : 'torneos jugados'}
          </Text>
        </View>
      )}

      {lineas.map((l, i) => (
        <View
          key={l.tournamentId}
          style={{
            paddingHorizontal: space[4],
            paddingVertical: space[3],
            gap: 2,
            borderTopWidth: i > 0 ? 1 : 0,
            borderTopColor: color.lineSoft,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space[2] }}>
            <Text
              style={{
                flex: 1, minWidth: 0,
                fontFamily: font.display,
                fontSize: fontSize.body,
                color: l.esTitulo ? color.goldBright : color.text,
              }}
              numberOfLines={1}
            >
              {l.esTitulo ? '🏆 ' : ''}{l.logro}
            </Text>
            {/* Los puntos solo si el torneo está cerrado. Un cero inventado
                diría que no valió nada, y lo que pasa es que aún no se ha
                repartido. */}
            {l.puntos != null && (
              <Text style={{ fontFamily: font.display, fontSize: fontSize.caption, color: color.champagne }}>
                {l.puntos.toLocaleString('es-MX')} pts
              </Text>
            )}
          </View>

          <Text style={{ fontFamily: font.body, fontSize: fontSize.caption, color: color.text }} numberOfLines={1}>
            {l.categoria} · {l.torneo}
          </Text>

          <Text style={{ fontFamily: font.body, fontSize: fontSize.minAbsolute, color: color.muted }}>
            {fechaCorta(l.fin)}
            {l.puntos == null ? ' · puntos pendientes de que el organizador cierre el torneo' : ''}
          </Text>
        </View>
      ))}
    </View>
    </>
  );
}
