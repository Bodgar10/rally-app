/**
 * RALLY · Jueces del torneo
 *
 * Destino de la fila "Jueces" del panel. Es un TRASLADO de las ~150 líneas que
 * vivían incrustadas en el panel: misma lógica, sin cambios de comportamiento.
 * Lo único nuevo es la envoltura de pantalla y que el botón de asignar dejó de
 * ser dorado — la única acción dorada del flujo vive en el panel.
 *
 * Un juez debe estar registrado en RALLY y ser miembro del organizador; la
 * política de `tournament_judges` rechaza lo contrario, y ese rechazo se
 * traduce a un mensaje humano abajo.
 */

import { useCallback, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import Icon from '@/components/ui/Icon';
import { color, font, fontSize, space, radius, touchTarget } from '@/lib/design-tokens';
import { inputFontSize } from '@/lib/web-layout';

interface Juez {
  id:     string;
  userId: string;
  name:   string;
  email:  string;
}

export default function JuecesTorneoScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();

  const [nombre, setNombre]   = useState('');
  const [judges, setJudges]   = useState<Juez[]>([]);
  const [cargando, setCargando] = useState(true);
  const [correo, setCorreo]   = useState('');
  const [buscando, setBuscando] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [exito, setExito]     = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [{ data: t }, { data, error: dbError }] = await Promise.all([
      supabase.from('tournaments').select('name').eq('id', tournamentId).single(),
      supabase
        .from('tournament_judges')
        .select(`id, user_id, users:user_id ( full_name, email )`)
        .eq('tournament_id', tournamentId)
        .order('assigned_at', { ascending: true }),
    ]);

    if (t) setNombre((t as { name: string }).name);

    if (dbError) {
      console.error('[jueces] cargar', dbError);
    } else {
      setJudges(
        ((data ?? []) as unknown as Array<{
          id: string;
          user_id: string;
          users: { full_name: string; email: string };
        }>).map((row) => ({
          id:     row.id,
          userId: row.user_id,
          name:   row.users?.full_name ?? '—',
          email:  row.users?.email ?? '—',
        })),
      );
    }
    setCargando(false);
  }, [tournamentId]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  async function asignar() {
    setError(null);
    setExito(null);
    if (!correo.trim()) {
      setError('Escribe el correo del juez.');
      return;
    }

    setBuscando(true);
    try {
      // RPC SECURITY DEFINER: buscar por correo sin exponer la tabla users.
      const { data: encontrado, error: rpcErr } = await supabase.rpc(
        'find_user_by_email',
        { p_email: correo.trim().toLowerCase() },
      );

      if (rpcErr || !encontrado || encontrado.length === 0) {
        setError('No hay ninguna cuenta de RALLY con ese correo. El juez debe registrarse primero.');
        return;
      }

      const candidato = (encontrado as Array<{ id: string; full_name: string; email: string }>)[0];

      if (judges.some((j) => j.userId === candidato.id)) {
        setError(`${candidato.full_name} ya está asignado a este torneo.`);
        return;
      }

      const { data: tData } = await supabase
        .from('tournaments')
        .select('organizer_id')
        .eq('id', tournamentId)
        .single();

      if (!tData) {
        setError('No se pudo leer el torneo. Intenta de nuevo.');
        return;
      }

      const { error: insertErr } = await supabase
        .from('tournament_judges')
        .insert({
          tournament_id: tournamentId,
          user_id:       candidato.id,
          organizer_id:  (tData as { organizer_id: string }).organizer_id,
        });

      if (insertErr) {
        console.error('[jueces] insert', insertErr);
        setError('No se pudo asignar. Verifica que esa persona sea juez de tu organización.');
        return;
      }

      setCorreo('');
      setExito(`${candidato.full_name} asignado como juez.`);
      await cargar();
    } finally {
      setBuscando(false);
    }
  }

  async function quitar(filaId: string, nombreJuez: string) {
    const { error: dbError } = await supabase
      .from('tournament_judges')
      .delete()
      .eq('id', filaId);

    if (dbError) {
      console.error('[jueces] delete', dbError);
      setError('No se pudo quitar al juez. Intenta de nuevo.');
      return;
    }
    setExito(`${nombreJuez} ya no es juez de este torneo.`);
    await cargar();
  }

  if (cargando) {
    return <View style={s.cargando}><ActivityIndicator color={color.gold} /></View>;
  }

  return (
    <SafeAreaView style={s.safe}>
      <Pressable onPress={() => router.back()} style={s.back} accessibilityRole="button">
        <Text style={s.backText} numberOfLines={1}>← {nombre || 'Torneo'}</Text>
      </Pressable>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.eyebrow}>CONFIGURACIÓN</Text>
        <Text style={s.title}>Jueces</Text>
        <Text style={s.ayuda}>
          Quien captura los resultados durante el torneo. Puedes ser tú mismo.
        </Text>

        {/* Asignados */}
        {judges.length === 0 ? (
          <View style={s.vacio}>
            <Text style={s.vacioTexto}>
              Todavía no hay jueces. Sin al menos uno, nadie podrá capturar
              marcadores cuando empiecen los partidos.
            </Text>
          </View>
        ) : (
          <View style={s.lista}>
            {judges.map((j) => (
              <View key={j.id} style={s.fila}>
                <View style={s.filaIcono}>
                  <Icon name="whistle" size={20} color={color.champagne} />
                </View>
                <View style={s.filaTextos}>
                  <Text style={s.filaNombre}>{j.name}</Text>
                  <Text style={s.filaCorreo}>{j.email}</Text>
                </View>
                <Pressable
                  onPress={() => quitar(j.id, j.name)}
                  style={s.quitar}
                  accessibilityRole="button"
                  accessibilityLabel={`Quitar a ${j.name}`}
                >
                  <Text style={s.quitarTexto}>Quitar</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* Alta */}
        <View style={s.form}>
          <Text style={s.label}>Asignar por correo</Text>
          <TextInput
            style={s.input}
            value={correo}
            onChangeText={(v) => { setCorreo(v); setError(null); setExito(null); }}
            placeholder="correo@ejemplo.com"
            placeholderTextColor={color.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            selectionColor={color.gold}
            accessibilityLabel="Correo del juez"
          />
          <Text style={s.hint}>
            Debe tener cuenta en RALLY y pertenecer a tu organización.
          </Text>

          {error && <Text style={s.error}>{error}</Text>}
          {exito && <Text style={s.exito}>{exito}</Text>}

          <Pressable
            onPress={asignar}
            disabled={buscando || !correo.trim()}
            style={({ pressed }) => [
              s.btnSecundario,
              (buscando || !correo.trim()) && s.btnInactivo,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Asignar juez"
          >
            {buscando
              ? <ActivityIndicator color={color.champagne} size="small" />
              : <Text style={s.btnSecundarioTexto}>Asignar juez</Text>
            }
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: color.bg },
  cargando: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  back:     { paddingHorizontal: space[4.5], paddingTop: space[4] },
  backText: { fontFamily: font.body, fontSize: fontSize.body, color: color.gold },
  content:  { paddingHorizontal: space[4.5], paddingTop: space[3], paddingBottom: space[6] * 2, gap: space[3] },

  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3 },
  title:   { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },
  ayuda:   { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20, marginBottom: space[1] },

  vacio:      { backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, padding: space[4] },
  vacioTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },

  lista:      { gap: space[2] },
  fila:       { flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, paddingHorizontal: space[4], paddingVertical: space[3] },
  filaIcono:  { width: 24, alignItems: 'center', flexShrink: 0 },
  filaTextos: { flex: 1, minWidth: 0, gap: 2 },
  filaNombre: { fontFamily: font.body, fontSize: fontSize.body, color: color.text },
  filaCorreo: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  quitar:     { paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radius.sm, borderWidth: 1, borderColor: 'rgba(224,114,111,0.30)', flexShrink: 0 },
  quitarTexto:{ fontFamily: font.body, fontSize: fontSize.caption, color: color.danger },

  form:  { backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, padding: space[3], gap: space[2], marginTop: space[2] },
  label: { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, letterSpacing: 0.3 },
  input: {
    backgroundColor:   color.surface2,
    borderWidth:       1,
    borderColor:       color.lineSoft,
    borderRadius:      radius.md,
    minHeight:         touchTarget,
    paddingHorizontal: space[4],
    paddingVertical:   space[3],
    fontFamily:        font.body,
    fontSize:          inputFontSize(fontSize.body),
    color:             color.text,
  },
  hint:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, opacity: 0.8 },
  error: { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, lineHeight: 17 },
  exito: { fontFamily: font.body, fontSize: fontSize.caption, color: color.live },

  btnSecundario: {
    borderWidth:     1,
    borderColor:     color.lineSoft,
    backgroundColor: 'transparent',
    borderRadius:    radius.sm,
    minHeight:       touchTarget,
    alignItems:      'center',
    justifyContent:  'center',
    marginTop:       space[1],
  },
  btnInactivo:        { opacity: 0.45 },
  btnSecundarioTexto: { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.champagne },
});
