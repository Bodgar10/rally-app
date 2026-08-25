/**
 * RALLY · Parejas inscritas
 *
 * Destino de la fila "Inscritas". Solo lectura: dar de alta va por
 * `agregar-pareja`, y cancelar una inscripción tiene consecuencias de dinero
 * que no se resuelven con un botón en una lista.
 *
 * El estado de pago se traduce a lenguaje de organizador. `paid_online`,
 * `paid_offline`, `comp` y `pending` son valores del enum de la BD y no deben
 * salir a pantalla.
 */

import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import Icon from '@/components/ui/Icon';
import { color, font, fontSize, space, radius, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';

interface Pareja {
  id:        string;
  jugador1:  string;
  jugador2:  string;
  categoria: string;
  pago:      string;
}

/** Enum de BD → lo que entiende un organizador. */
const PAGO: Record<string, { texto: string; tinte: string }> = {
  paid_online:  { texto: 'Pagado en línea',   tinte: color.live   },
  paid_offline: { texto: 'Pagado por fuera',  tinte: color.champagne },
  comp:         { texto: 'Cortesía',          tinte: color.champagne },
  pending:      { texto: 'Pago pendiente',    tinte: color.alive  },
};

export default function ParejasTorneoScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();

  const [nombre, setNombre]     = useState('');
  const [parejas, setParejas]   = useState<Pareja[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const [{ data: t }, { data }] = await Promise.all([
      supabase.from('tournaments').select('name').eq('id', tournamentId).single(),
      // Va por organizer_pairs_admin (migración 041) y no por `pairs` con
      // embed: ese embed pasaba por users_select_own, que solo deja leer la
      // propia fila, así que el organizador veía '—' en TODOS los jugadores de
      // su propio torneo. La vista ya está acotada al owner por dentro.
      // Cast hasta que se aplique la 041 y se corra `npm run types:db`.
      (supabase.from as unknown as (v: string) => {
        select: (c: string) => { eq: (c: string, v: string) => { order: (c: string, o: { ascending: boolean }) => Promise<{ data: { pair_id: string; payment_status: string; category_id: string; player1_name: string; player2_name: string }[] | null; error: { message?: string } | null }> } };
      })('organizer_pairs_admin')
        .select('pair_id, payment_status, category_id, player1_name, player2_name')
        .eq('tournament_id', tournamentId)
        .order('created_at', { ascending: true }),
    ]);

    if (t) setNombre((t as { name: string }).name);

    // La vista no embebe la categoría, así que su nombre se resuelve aparte.
    // `categories_select` sí deja leerla, es solo que no viaja con la vista.
    const { data: cats } = await supabase
      .from('categories')
      .select('id, display_name')
      .eq('tournament_id', tournamentId);
    const nombreCat = new Map((cats ?? []).map((c) => [c.id, c.display_name]));

    setParejas(
      (data ?? []).map((row) => ({
        id:        row.pair_id,
        jugador1:  row.player1_name,
        jugador2:  row.player2_name,
        categoria: nombreCat.get(row.category_id) ?? '—',
        pago:      row.payment_status,
      })),
    );
    setCargando(false);
  }, [tournamentId]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  if (cargando) {
    return <View style={s.cargando}><ActivityIndicator color={color.gold} /></View>;
  }

  // Agrupadas por categoría: es como el organizador piensa el cuadro.
  const porCategoria = parejas.reduce<Record<string, Pareja[]>>((acc, p) => {
    (acc[p.categoria] ??= []).push(p);
    return acc;
  }, {});

  return (
    <SafeAreaView style={s.safe}>
      <BotonVolver texto={nombre || 'Torneo'} />

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.eyebrow}>PAREJAS</Text>
        <Text style={s.title}>Inscritas</Text>
        <Text style={s.ayuda}>
          {parejas.length === 0
            ? 'Todavía no hay parejas inscritas.'
            : `${parejas.length} ${parejas.length === 1 ? 'pareja inscrita' : 'parejas inscritas'} en ${Object.keys(porCategoria).length} ${Object.keys(porCategoria).length === 1 ? 'categoría' : 'categorías'}.`}
        </Text>

        {parejas.length === 0 ? (
          <View style={s.vacio}>
            <Text style={s.vacioTexto}>
              Cuando los jugadores se inscriban aparecerán aquí. También puedes
              registrarlos tú desde el panel.
            </Text>
          </View>
        ) : (
          Object.entries(porCategoria).map(([categoria, lista]) => (
            <View key={categoria} style={s.grupo}>
              <Text style={s.grupoTitulo}>{categoria.toUpperCase()}</Text>
              {lista.map((p) => {
                const pago = PAGO[p.pago] ?? { texto: p.pago, tinte: color.muted };
                return (
                  <View key={p.id} style={s.fila}>
                    <View style={s.filaIcono}>
                      <Icon name="users" size={20} color={color.champagne} />
                    </View>
                    <View style={s.filaTextos}>
                      <Text style={s.filaNombres} numberOfLines={2}>
                        {p.jugador1} · {p.jugador2}
                      </Text>
                      <Text style={[s.filaPago, { color: pago.tinte }]}>{pago.texto}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))
        )}

        <Pressable
          onPress={() => router.push(`/(organizer)/org/torneos/${tournamentId}/agregar-pareja`)}
          style={({ pressed }) => [s.btnSecundario, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel="Registrar pareja a mano"
        >
          <Text style={s.btnSecundarioTexto}>Registrar pareja a mano</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: color.bg },
  cargando: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  content:  { paddingHorizontal: space[4.5], paddingTop: space[3], paddingBottom: bottomInset, gap: space[3], ...webContentColumn },

  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3 },
  title:   { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },
  ayuda:   { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20, marginBottom: space[1] },

  vacio:      { backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, padding: space[4] },
  vacioTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },

  grupo:       { gap: space[2], marginTop: space[2] },
  grupoTitulo: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne, letterSpacing: 2 },

  fila:        { flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, paddingHorizontal: space[4], paddingVertical: space[3] },
  filaIcono:   { width: 24, alignItems: 'center', flexShrink: 0 },
  filaTextos:  { flex: 1, minWidth: 0, gap: 2 },
  filaNombres: { fontFamily: font.body, fontSize: fontSize.body, color: color.text, lineHeight: 20 },
  filaPago:    { fontFamily: font.body, fontSize: fontSize.caption, fontWeight: '600' },

  btnSecundario: {
    borderWidth:     1,
    borderColor:     color.lineSoft,
    backgroundColor: 'transparent',
    borderRadius:    radius.sm,
    minHeight:       touchTarget,
    alignItems:      'center',
    justifyContent:  'center',
    marginTop:       space[3],
  },
  btnSecundarioTexto: { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.champagne },
});
