/**
 * RALLY · Jueces del torneo
 *
 * Destino de la fila "Jueces" del panel. Es un TRASLADO de las ~150 líneas que
 * vivían incrustadas en el panel: misma lógica, sin cambios de comportamiento.
 * Lo único nuevo es la envoltura de pantalla y que el botón de asignar dejó de
 * ser dorado — la única acción dorada del flujo vive en el panel.
 *
 * EL JUEZ NO TIENE QUE SER DE TU ORGANIZACIÓN
 *   Solo necesita cuenta en RALLY. Este comentario decía lo contrario —"debe
 *   ser miembro del organizador"— y era falso: verificado asignando tres
 *   jueces sin membresía, los tres entraron y los tres capturaron. El texto de
 *   ayuda del buscador ya lo decía bien; era la cabecera la que mentía.
 *
 * EL OWNER PUEDE CAPTURAR SIN SER JUEZ
 *   `can_capture_tournament` es `is_admin() OR is_org_owner(...) OR
 *   is_tournament_judge(...)`. El owner entra por la segunda rama, sin fila en
 *   `tournament_judges`. NO es un hueco de seguridad: el organizador de un
 *   torneo chico ES el juez, y obligarle a asignarse a sí mismo para capturar
 *   su propio torneo sería ceremonia sin nadie a quien proteger.
 *
 *   Por eso la lista vacía no dice "nadie podrá capturar": sería mentira.
 *   Documentado también en la migración 054, para quien lea la función y no
 *   esta pantalla.
 *
 * VARIOS JUECES, QUE ES EL CASO NORMAL
 *   Con ocho canchas simultáneas una sola persona capturando no da abasto. El
 *   buscador sigue disponible después del primero a propósito, y
 *   `yaElegidos` solo impide repetir a la misma persona — que es lo que
 *   también impide el UNIQUE (tournament_id, user_id) de la tabla.
 */

import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Share,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import Icon from '@/components/ui/Icon';
import BuscadorDeUsuario, { type UsuarioEncontrado } from '@/components/ui/BuscadorDeUsuario';
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

/** Alguien del equipo del club con rol `judge`, todavía no asignado aquí. */
interface DelEquipo {
  userId: string;
  name:   string;
  email:  string;
}

/** Un torneo anterior del mismo organizador, con jueces que copiar. */
interface TorneoPrevio {
  id:      string;
  nombre:  string;
  fecha:   string | null;
  jueces:  DelEquipo[];
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

/**
 * `organizer_members_admin` es de la migración 056 y todavía no está en
 * `database.types.ts`: hay que correr `npm run types:db` después de aplicarla.
 * Hasta entonces, este cast — el mismo patrón que usó canchas.tsx con la 044.
 * Se acota a lo que de verdad se llama para que siga habiendo algo de tipo.
 */
interface FilaMiembro {
  user_id:     string | null;
  member_role: string | null;
  full_name:   string | null;
  email:       string | null;
}

const vistaMiembros = (cliente: typeof supabase) =>
  (cliente.from as unknown as (v: string) => {
    select: (cols: string) => {
      eq: (c: string, v: string) => {
        eq: (c: string, v: string) => Promise<{
          data: FilaMiembro[] | null;
          error: { message: string } | null;
        }>;
      };
    };
  })('organizer_members_admin');

export default function JuecesTorneoScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();

  const [nombre, setNombre]   = useState('');
  const [judges, setJudges]   = useState<Juez[]>([]);
  const [cargando, setCargando] = useState(true);
  const [asignando, setAsignando] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [exito, setExito]     = useState<string | null>(null);
  /** El equipo del club con rol `judge` que aún no es juez de este torneo. */
  const [equipo, setEquipo]   = useState<DelEquipo[]>([]);
  /** Torneos anteriores del organizador que tienen jueces. */
  const [previos, setPrevios] = useState<TorneoPrevio[]>([]);
  const [verPrevios, setVerPrevios] = useState(false);

  const cargar = useCallback(async () => {
    const [{ data: t }, { data, error: dbError }] = await Promise.all([
      supabase.from('tournaments').select('name, organizer_id').eq('id', tournamentId).single(),
      // Va por organizer_judges_admin (migración 041): el embed a `users`
      // pasaba por users_select_own y dejaba la lista sin nombre ni correo.
      // La vista ya está acotada al owner por dentro.
      supabase
        .from('organizer_judges_admin')
        .select('id, user_id, full_name, email')
        .eq('tournament_id', tournamentId)
        .order('created_at', { ascending: true }),
    ]);

    const torneo = t as { name: string; organizer_id: string } | null;
    if (torneo) setNombre(torneo.name);

    if (dbError) {
      console.error('[jueces] cargar', dbError);
    } else {
      setJudges(
        // Es una VISTA: sus columnas llegan nullable aunque en origen no lo
        // sean. Sin id la fila no se puede usar como key de lista.
        (data ?? [])
          .filter((row): row is typeof row & { id: string } => row.id !== null)
          .map((row) => ({
            id:     row.id,
            userId: row.user_id ?? '',
            name:   row.full_name ?? '—',
            email:  row.email ?? '—',
          })),
      );
    }
    // ── Los dos atajos ────────────────────────────────────────────────────
    // Capturar es NOMINAL: hay que nombrar a la persona para ESTE torneo. Esa
    // decisión se mantiene —un permiso sin fecha ni alcance es el que nadie
    // revisa— pero su coste es un paso manual cada vez, y ese coste sí se
    // puede bajar. De ahí estas dos listas.
    const yaAsignados = new Set(
      (data ?? []).map((r) => r.user_id).filter((x): x is string => !!x),
    );

    if (torneo?.organizer_id) {
      // 1) El equipo del club. Va por organizer_members_admin (migración 056)
      //    por el mismo motivo que la lista de arriba: users_select_own impide
      //    leer el nombre de otros y un embed devolvería guiones.
      const { data: miembros, error: me } = await vistaMiembros(supabase)
        .select('user_id, member_role, full_name, email')
        .eq('organizer_id', torneo.organizer_id)
        .eq('member_role', 'judge');
      if (me) console.error('[jueces] equipo', me);
      setEquipo(
        (miembros ?? [])
          .filter((m) => m.user_id && !yaAsignados.has(m.user_id))
          .map((m) => ({
            userId: m.user_id as string,
            name:   m.full_name ?? '—',
            email:  m.email ?? '—',
          })),
      );

      // 2) Los torneos anteriores. `organizer_judges_admin` está acotada al
      //    OWNER, no a un torneo, así que se puede leer la de todos sus
      //    torneos de una vez y agrupar aquí.
      const [{ data: otros }, { data: jueces }] = await Promise.all([
        supabase.from('tournaments')
          .select('id, name, start_date')
          .eq('organizer_id', torneo.organizer_id)
          .neq('id', tournamentId)
          .order('start_date', { ascending: false })
          .limit(20),
        supabase.from('organizer_judges_admin')
          .select('tournament_id, user_id, full_name, email'),
      ]);

      const porTorneo = new Map<string, DelEquipo[]>();
      for (const j of jueces ?? []) {
        if (!j.tournament_id || !j.user_id) continue;
        const ya = porTorneo.get(j.tournament_id) ?? [];
        ya.push({ userId: j.user_id, name: j.full_name ?? '—', email: j.email ?? '—' });
        porTorneo.set(j.tournament_id, ya);
      }

      setPrevios(
        (otros ?? [])
          .map((o) => ({
            id: o.id, nombre: o.name, fecha: o.start_date,
            // Los que ya están aquí no se ofrecen: copiar no debe prometer
            // gente que no va a añadir.
            jueces: (porTorneo.get(o.id) ?? []).filter((j) => !yaAsignados.has(j.userId)),
          }))
          .filter((o) => o.jueces.length > 0),
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

  /**
   * Asigna a varios de una vez.
   *
   * En tandas de uno y no en un `insert` de N filas a propósito: si una falla
   * —esa persona ya es juez de otro modo, o la RLS la rechaza— el lote entero
   * se caería y el organizador se quedaría sin ninguno. Así entran los que
   * pueden y se cuenta lo que no.
   */
  async function asignarVarios(gente: DelEquipo[], comoSeLlama: string) {
    if (gente.length === 0) return;
    setError(null);
    setExito(null);
    setAsignando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let ok = 0;
      const fallos: string[] = [];

      for (const g of gente) {
        const { error: e } = await supabase
          .from('tournament_judges')
          .insert({ tournament_id: tournamentId, user_id: g.userId, assigned_by: user?.id ?? null });
        if (e) {
          console.error('[jueces] alta múltiple:', {
            userId: g.userId, code: e.code, message: e.message, details: e.details,
          });
          fallos.push(g.name);
        } else ok++;
      }

      if (ok > 0) {
        setExito(
          `${ok} ${ok === 1 ? 'juez asignado' : 'jueces asignados'} desde ${comoSeLlama}.` +
          (fallos.length ? ` No se pudo con ${fallos.join(', ')}.` : ''),
        );
      } else {
        setError(`No se pudo asignar a nadie desde ${comoSeLlama}. El detalle está en la consola.`);
      }
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
          Quien captura los resultados durante el torneo. Tú ya puedes hacerlo
          por ser el organizador; asigna jueces para repartir el trabajo — con
          varias canchas a la vez, una sola persona no da abasto.
        </Text>

        {/* Asignados */}
        {judges.length === 0 ? (
          <View style={s.vacio}>
            <Text style={s.vacioTexto}>
              Todavía no hay jueces asignados. Tú puedes capturar igual: el
              organizador no necesita asignarse a sí mismo. Añade jueces si vas
              a tener varias canchas jugando a la vez.
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

        {/* Atajos. Capturar sigue siendo NOMINAL —hay que nombrar a la persona
            para este torneo— pero nombrarla no tiene por qué costar ocho
            búsquedas. Solo se pintan cuando de verdad hay a quién añadir. */}
        {(equipo.length > 0 || previos.length > 0) && (
          <View style={s.atajos}>
            {equipo.length > 0 && (
              <Pressable
                onPress={() => asignarVarios(equipo, 'el equipo del club')}
                disabled={asignando}
                style={({ pressed }) => [s.atajo, pressed && { opacity: 0.75 }]}
                accessibilityRole="button"
                accessibilityLabel={`Añadir a los ${equipo.length} del equipo del club`}
              >
                <Text style={s.atajoTitulo}>
                  Añadir al equipo del club ({equipo.length})
                </Text>
                <Text style={s.atajoDetalle} numberOfLines={2}>
                  {equipo.map((e) => e.name).join(', ')}
                </Text>
              </Pressable>
            )}

            {previos.length > 0 && (
              <Pressable
                onPress={() => setVerPrevios((v) => !v)}
                style={({ pressed }) => [s.atajo, pressed && { opacity: 0.75 }]}
                accessibilityRole="button"
                accessibilityState={{ expanded: verPrevios }}
                accessibilityLabel="Copiar los jueces de otro torneo"
              >
                <Text style={s.atajoTitulo}>
                  Copiar de otro torneo {verPrevios ? '▾' : '▸'}
                </Text>
                <Text style={s.atajoDetalle}>
                  {previos.length} {previos.length === 1 ? 'torneo tuyo tiene' : 'torneos tuyos tienen'} jueces que no están aquí
                </Text>
              </Pressable>
            )}

            {verPrevios && previos.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => asignarVarios(t.jueces, t.nombre)}
                disabled={asignando}
                style={({ pressed }) => [s.previo, pressed && { opacity: 0.75 }]}
                accessibilityRole="button"
                accessibilityLabel={`Copiar los ${t.jueces.length} jueces de ${t.nombre}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.previoNombre}>{t.nombre}</Text>
                  <Text style={s.previoDetalle} numberOfLines={1}>
                    {t.jueces.map((j) => j.name).join(', ')}
                  </Text>
                </View>
                <Text style={s.previoCuenta}>+{t.jueces.length}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Alta */}
        <View style={s.form}>
          <BuscadorDeUsuario
            label="Asignar juez"
            placeholder="Nombre o correo"
            ayuda="Busca a cualquier persona con cuenta en RALLY. No hace falta que sea de tu organización. Puedes asignar todos los que necesites."
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
  atajos:       { gap: space[2] },
  atajo:        { backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.md, padding: space[3], gap: space[1] },
  atajoTitulo:  { fontFamily: font.body, fontSize: fontSize.body, color: color.gold, fontWeight: '600' as const },
  atajoDetalle: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 17 },

  previo:        { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space[2], backgroundColor: color.surface2, borderRadius: radius.md, paddingHorizontal: space[3], paddingVertical: space[2], marginLeft: space[3] },
  previoNombre:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.text },
  previoDetalle: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  previoCuenta:  { fontFamily: font.display, fontSize: fontSize.body, color: color.champagne },

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
