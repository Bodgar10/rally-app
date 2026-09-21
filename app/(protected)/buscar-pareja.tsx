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
 *   Del lado contrario —dos de drive no son pareja—, de nivel parecido y, en
 *   lo posible, de tu zona. Las tres las aplica `buscar_pareja` en la base;
 *   aquí solo se pinta.
 *
 * ► LA ZONA ORDENA, NO EXCLUYE
 *   Una pareja perfecta en nivel y en lado que juega a hora y media de coche
 *   no es una pareja: es una sugerencia que nadie va a usar. Por eso los de la
 *   misma ciudad van primero, en su propio apartado.
 *
 *   Pero filtrar duro por ciudad dejaría sin nadie a quien juega en una plaza
 *   pequeña, que es justo el que más necesita que le encuentren pareja. Los de
 *   fuera siguen saliendo, debajo y con su ciudad a la vista para que se sepa
 *   lo que implica. La zona sale de dónde se ha inscrito cada uno —ver
 *   `zona_del_jugador`, migración 083— y no de una pregunta más.
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
  /** La ciudad donde más juega. Null si aún no se ha inscrito a nada. */
  zona: string | null;
  misma_zona: boolean;
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

      const { data } = await supabase.rpc('buscar_pareja', {
        p_division: mio.division,
        p_limite: 12,
      });

      const lista = (data ?? []) as Candidato[];
      setCandidatos(lista);
      setMotivo(lista.length === 0 ? 'sin_candidatos' : null);
    } catch {
      setMotivo('sin_candidatos');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const cerca = candidatos.filter((c) => c.misma_zona);
  const lejos = candidatos.filter((c) => !c.misma_zona);
  /**
   * La zona propia se deduce de los candidatos que la base marcó como cercanos
   * —es la misma para todos ellos— en vez de pedirla en otra consulta. Sin
   * nadie cerca no hay encabezado que nombrar, y así también es correcto.
   */
  const miZona = cerca[0]?.zona ?? null;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.cont}>
        <BotonVolver texto="Volver" />
        <Text style={s.h1}>Buscar pareja</Text>
        <Text style={s.bajada}>
          Jugadores del lado contrario al tuyo y de tu nivel
          {division ? `, en ${NOMBRE_DIVISION[division].toLowerCase()}` : ''}.
          Los de tu zona, primero.
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
            {/* DOS APARTADOS, no una lista larga con etiquetas sueltas: "por
                tu zona" y "más lejos" son dos decisiones distintas, y quien
                solo quiere jugar cerca no debería tener que filtrar con la
                vista. El orden ya lo trae la base. */}
            {cerca.length > 0 && (
              <>
                <SectionLabel title={miZona ? `Por tu zona · ${miZona}` : 'Por tu zona'} />
                {cerca.map((c) => <Fila key={c.player_id} c={c} />)}
              </>
            )}

            {lejos.length > 0 && (
              <>
                <SectionLabel title={cerca.length > 0 ? 'Más lejos' : 'Compatibles'} />
                {cerca.length > 0 && (
                  <Text style={s.nota}>
                    No juegan por tu zona, pero encajan en nivel y en lado.
                  </Text>
                )}
                {lejos.map((c) => <Fila key={c.player_id} c={c} />)}
              </>
            )}

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

/**
 * Una fila de la lista. Se saca del cuerpo porque ahora se pinta desde dos
 * sitios —los de la zona y los de fuera— y copiarla sería el principio de que
 * las dos se vean distinto.
 */
function Fila({ c }: { c: Candidato }) {
  const como = textoDeJugador({ lado: c.lado, mano: c.mano });
  return (
    <View style={s.fila}>
      <Avatar name={c.full_name} size={40} />
      <View style={s.datos}>
        <Text style={s.nombre} numberOfLines={1}>{c.full_name}</Text>
        <Text style={s.como} numberOfLines={1}>
          {[como, !c.misma_zona ? c.zona : null].filter(Boolean).join(' · ') || ' '}
        </Text>
      </View>
      <Text style={s.cerca}>
        {c.diferencia < 40 ? 'mismo nivel' : `${Math.round(c.diferencia)} de dif.`}
      </Text>
    </View>
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
