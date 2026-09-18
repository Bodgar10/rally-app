/**
 * app/(protected)/buscar-pareja.tsx
 *
 * RALLY · Con quién puedes hacer pareja.
 *
 * ES EL PRIMER PROBLEMA QUE TIENE UN JUGADOR, NO EL ÚLTIMO
 *   Antes de querer saber su win-rate, quiere conseguir pareja para el domingo.
 *   Hoy eso se resuelve preguntando a ciegas en un grupo de WhatsApp, sin saber
 *   de qué lado juega nadie ni si son del mismo nivel.
 *
 * QUÉ CUENTA COMO COMPATIBLE
 *   Del lado contrario —dos de drive no son pareja— y de nivel parecido. Las
 *   dos condiciones las aplica `buscar_pareja` en la base; aquí solo se pinta.
 *
 * ► CUANDO NO HAY NADIE, SE DICE POR QUÉ
 *   Una lista vacía sin explicación se lee como "no hay nadie en la app". Casi
 *   siempre el motivo es otro y tiene arreglo: que todavía no has dicho de qué
 *   lado juegas, o que tu nivel sigue siendo provisional. Se dice cuál de los
 *   dos es, con el botón para resolverlo.
 *
 * NO SE ENSEÑAN CORREOS
 *   Esta es una lista de gente que el jugador no buscó por nombre. Para
 *   invitar a alguien se usa el buscador de la inscripción, que pide teclear
 *   el nombre y enmascara el correo.
 */

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { Card, SectionLabel } from '@/components/ui';
import BotonVolver from '@/components/ui/BotonVolver';
import { Avatar } from '@/components/ui/Avatar';
import { textoDeJugador, type Lado, type Mano } from '@/lib/lado-y-mano';
import { leerPerfilDeJuego } from '@/lib/lado-y-mano-datos';
import { NOMBRE_DIVISION } from '@/lib/nivel-jugador';
import type { Division } from '@/lib/engine/types';
import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';

interface Candidato {
  player_id: string;
  full_name: string;
  photo_url: string | null;
  rating: number;
  lado: Lado | null;
  mano: Mano | null;
  diferencia: number;
}

/** Por qué la lista está vacía. Cada motivo tiene su salida. */
type Motivo = 'sin_lado' | 'sin_nivel' | 'sin_candidatos' | null;

export default function BuscarParejaScreen() {
  const router = useRouter();
  const [cargando, setCargando] = useState(true);
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [division, setDivision] = useState<Division | null>(null);
  const [motivo, setMotivo] = useState<Motivo>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [perfil, { data: ratings }] = await Promise.all([
        leerPerfilDeJuego(user.id),
        supabase
          .from('player_ratings')
          .select('division, rd')
          .eq('player_id', user.id)
          .order('last_played_at', { ascending: false, nullsFirst: false })
          .limit(1),
      ]);

      if (!perfil.lado) { setMotivo('sin_lado'); return; }

      const mio = (ratings ?? [])[0];
      if (!mio || Number(mio.rd) >= 100) { setMotivo('sin_nivel'); return; }

      setDivision(mio.division as Division);

      // `buscar_pareja` llega con la migración 082; los tipos se generan del
      // proyecto remoto, así que todavía no existe para TypeScript.
      const rpc = supabase.rpc as unknown as (
        fn: string, args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>;
      const { data } = await rpc('buscar_pareja', { p_division: mio.division, p_limite: 12 });

      const lista = (data as Candidato[] | null) ?? [];
      setCandidatos(lista);
      setMotivo(lista.length === 0 ? 'sin_candidatos' : null);
    } catch {
      setMotivo('sin_candidatos');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.cont}>
        <BotonVolver texto="Volver" />
        <Text style={s.h1}>Buscar pareja</Text>
        <Text style={s.bajada}>
          Jugadores del lado contrario al tuyo y de tu nivel
          {division ? `, en ${NOMBRE_DIVISION[division].toLowerCase()}` : ''}.
        </Text>

        {cargando && <ActivityIndicator color={color.gold} />}

        {!cargando && motivo === 'sin_lado' && (
          <Card>
            <Text style={s.vacioTitulo}>Falta saber de qué lado juegas</Text>
            <Text style={s.vacioTexto}>
              Sin eso no se puede buscar a alguien del lado contrario, que es de lo que va esto.
            </Text>
            <Pressable onPress={() => router.push('/(protected)/perfil-editar')} style={s.accion}>
              <Text style={s.accionTexto}>Decirlo ahora</Text>
            </Pressable>
          </Card>
        )}

        {!cargando && motivo === 'sin_nivel' && (
          <Card>
            <Text style={s.vacioTitulo}>Todavía te estamos midiendo</Text>
            <Text style={s.vacioTexto}>
              Para decir "de tu nivel" hace falta tener tu nivel medido, y eso llega con unos
              cuantos partidos más. Antes que sugerirte a ciegas, preferimos no sugerir.
            </Text>
          </Card>
        )}

        {!cargando && motivo === 'sin_candidatos' && (
          <Card>
            <Text style={s.vacioTitulo}>Nadie por ahora</Text>
            <Text style={s.vacioTexto}>
              No hay jugadores de tu nivel y del lado contrario con el perfil completo. Conforme
              más gente conteste de qué lado juega, esta lista se llena.
            </Text>
          </Card>
        )}

        {candidatos.length > 0 && (
          <>
            <SectionLabel title={`${candidatos.length} compatibles`} />
            {candidatos.map((c) => {
              const como = textoDeJugador({ lado: c.lado, mano: c.mano });
              return (
                <View key={c.player_id} style={s.fila}>
                  <Avatar name={c.full_name} size={40} />
                  <View style={s.datos}>
                    <Text style={s.nombre} numberOfLines={1}>{c.full_name}</Text>
                    {como && <Text style={s.como}>{como}</Text>}
                  </View>
                  <Text style={s.cerca}>
                    {c.diferencia < 40 ? 'mismo nivel' : `${Math.round(c.diferencia)} de dif.`}
                  </Text>
                </View>
              );
            })}
            <Text style={s.nota}>
              Para jugar con alguno, búscalo por su nombre al inscribirte al torneo. Aquí no
              enseñamos correos: esta lista no la pediste tú por nombre.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  cont: {
    paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: bottomInset,
    gap: space[3], ...webContentColumn,
  },
  h1: {
    color: color.champagne, fontFamily: font.display, fontSize: fontSize.screenH1,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  bajada: { color: color.muted, fontFamily: font.body, fontSize: fontSize.caption, lineHeight: 18 },

  vacioTitulo: { color: color.text, fontFamily: font.display, fontSize: fontSize.cardName },
  vacioTexto: { color: color.muted, fontFamily: font.body, fontSize: fontSize.caption, lineHeight: 18, marginTop: space[1] },
  accion: {
    minHeight: touchTarget, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.sm, backgroundColor: color.gold, marginTop: space[3],
  },
  accionTexto: { color: color.bg, fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600' },

  fila: {
    flexDirection: 'row', alignItems: 'center', gap: space[3],
    paddingVertical: space[2], paddingHorizontal: space[3],
    borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: color.surface,
  },
  datos: { flex: 1 },
  nombre: { color: color.text, fontFamily: font.body, fontSize: fontSize.body },
  como: { color: color.muted, fontFamily: font.body, fontSize: fontSize.minAbsolute },
  cerca: { color: color.champagne, fontFamily: font.body, fontSize: fontSize.minAbsolute },

  nota: { color: color.muted, fontFamily: font.body, fontSize: fontSize.minAbsolute, lineHeight: 17 },
});
