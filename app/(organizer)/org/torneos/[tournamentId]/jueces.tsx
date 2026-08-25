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
  View, Text, ScrollView, Pressable, Share,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import Icon from '@/components/ui/Icon';
import BuscadorDeUsuario, { type UsuarioEncontrado } from '@/components/organizer/BuscadorDeUsuario';
import { color, font, fontSize, space, radius, touchTarget } from '@/lib/design-tokens';
import { bottomInset, webContentColumn } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';

const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL ?? 'https://rallypadel.mx';

interface Juez {
  id:     string;
  userId: string;
  name:   string;
  email:  string;
}

/**
 * Traduce el error de Postgres SIN inventar causas. Si el código no se
 * reconoce, se dice que no se sabe y se remite a la consola — que es donde
 * está el error completo. Adivinar la causa fue justo lo que hizo perder
 * tiempo la vez anterior.
 */
function mensajeDeError(e: { code?: string; message?: string }): string {
  switch (e.code) {
    case '23505': return 'Esa persona ya es juez de este torneo.';
    case '42501': return 'No tienes permiso para asignar jueces en este torneo.';
    case '23503': return 'La persona o el torneo ya no existen. Recarga la pantalla.';
    case 'PGRST204':
    case '42703': return 'Error de configuración de la app. Avísanos: la tabla no tiene la forma esperada.';
    default:
      return `No se pudo asignar${e.code ? ` (${e.code})` : ''}. El detalle está en la consola.`;
  }
}

export default function JuecesTorneoScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();

  const [nombre, setNombre]   = useState('');
  const [judges, setJudges]   = useState<Juez[]>([]);
  const [cargando, setCargando] = useState(true);
  const [asignando, setAsignando] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [exito, setExito]     = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [{ data: t }, { data, error: dbError }] = await Promise.all([
      supabase.from('tournaments').select('name').eq('id', tournamentId).single(),
      supabase
        .from('tournament_judges')
        .select(`id, user_id, users:user_id ( full_name, email )`)
        .eq('tournament_id', tournamentId)
        .order('created_at', { ascending: true }),
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

  async function asignar(u: UsuarioEncontrado) {
    setError(null);
    setExito(null);
    setAsignando(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Solo tournament_id, user_id y assigned_by: `organizer_id` NO existe en
      // la tabla. La migración 013 del repo lo declara, pero nunca llegó a la
      // base — mandarlo daba PGRST204 y la asignación fallaba siempre.
      // `assigned_by` es nullable, pero llenarlo deja rastro de quién asignó.
      const { error: insertErr } = await supabase
        .from('tournament_judges')
        .insert({
          tournament_id: tournamentId,
          user_id:       u.id,
          assigned_by:   user?.id ?? null,
        });

      if (insertErr) {
        // SIEMPRE el error crudo de Postgres: la vez anterior el mensaje de la
        // UI inventó una causa ("ya es juez") y ocultó la real.
        console.error('[jueces] insert fallo:', {
          code: insertErr.code, message: insertErr.message,
          details: insertErr.details, hint: insertErr.hint,
        });
        setError(mensajeDeError(insertErr));
        return;
      }

      setExito(`${u.full_name} asignado como juez.`);
      await cargar();
    } finally {
      setAsignando(false);
    }
  }

  async function quitar(filaId: string, nombreJuez: string) {
    const { error: dbError } = await supabase
      .from('tournament_judges')
      .delete()
      .eq('id', filaId);

    if (dbError) {
      console.error('[jueces] delete fallo:', {
        code: dbError.code, message: dbError.message,
        details: dbError.details, hint: dbError.hint,
      });
      setError(mensajeDeError(dbError));
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
      <BotonVolver texto={nombre || 'Torneo'} />

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
          <BuscadorDeUsuario
            label="Asignar juez"
            placeholder="Nombre o correo"
            ayuda="Busca a cualquier persona con cuenta en RALLY. No hace falta que sea de tu organización."
            yaElegidos={judges.map((j) => j.userId)}
            textoYaElegido="Ya es juez"
            onElegir={asignar}
            renderSinResultados={(consulta) => (
              <View style={s.sinResultados}>
                <Text style={s.sinResultadosTexto}>
                  Nadie con ese nombre o correo. El juez tiene que tener cuenta
                  en RALLY.
                </Text>
                {consulta.includes('@') && (
                  <Pressable
                    onPress={() => Share.share({
                      message: `Te invito a RALLY para que puedas capturar resultados: ${SITE_URL}`,
                    })}
                    style={s.invitar}
                    accessibilityRole="button"
                    accessibilityLabel="Invitar a RALLY"
                  >
                    <Text style={s.invitarTexto}>Enviar invitación →</Text>
                  </Pressable>
                )}
              </View>
            )}
          />

          {asignando && <ActivityIndicator color={color.champagne} size="small" />}
          {error && <Text style={s.error}>{error}</Text>}
          {exito && <Text style={s.exito}>{exito}</Text>}
        </View>

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

  lista:      { gap: space[2] },
  fila:       { flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, paddingHorizontal: space[4], paddingVertical: space[3] },
  filaIcono:  { width: 24, alignItems: 'center', flexShrink: 0 },
  filaTextos: { flex: 1, minWidth: 0, gap: 2 },
  filaNombre: { fontFamily: font.body, fontSize: fontSize.body, color: color.text },
  filaCorreo: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  quitar:     { paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radius.sm, borderWidth: 1, borderColor: 'rgba(224,114,111,0.30)', flexShrink: 0 },
  quitarTexto:{ fontFamily: font.body, fontSize: fontSize.caption, color: color.danger },

  form:  { backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, padding: space[3], gap: space[2], marginTop: space[2] },
  error: { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, lineHeight: 17 },
  exito: { fontFamily: font.body, fontSize: fontSize.caption, color: color.live },

  sinResultados:      { gap: space[2] },
  sinResultadosTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },
  invitar:            { alignSelf: 'flex-start', minHeight: touchTarget, justifyContent: 'center' },
  invitarTexto:       { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.gold },

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
