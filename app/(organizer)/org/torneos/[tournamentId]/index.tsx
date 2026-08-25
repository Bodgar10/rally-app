/**
 * RALLY · Panel de torneo del organizador
 *
 * PRINCIPIO DE DISEÑO (rediseño fase 1):
 *   · UNA sola acción dorada por pantalla: el siguiente paso según el estado.
 *   · Lo que NAVEGA es una fila de ajuste (ícono, título, valor, chevron).
 *   · Lo secundario, gris perfilado. Lo irreversible, en danger y con confirmación.
 *
 * Antes había tres bloques dorados compitiendo (abrir, cerrar y asignar juez) y
 * "Cerrar inscripciones" se veía incluso en borrador. Ahora hay exactamente UNA
 * acción dorada y depende del estado: abrir en `draft`, cerrar en
 * `registration_open`. Nunca las dos a la vez.
 *
 * El rojo se reserva para lo que DESTRUYE: eliminar torneo, terminar torneo,
 * quitar categoría. Cerrar inscripciones no destruye nada — genera los grupos y
 * los partidos — así que pintarlo de rojo desalentaba el camino feliz.
 *
 * FASE 1: las filas cuya pantalla de destino aún no existe quedan visibles pero
 * deshabilitadas, mostrando su valor real. Se ve el diseño entero y se lee la
 * configuración; editar llega en la fase 2.
 */

import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';

import { supabase }               from '@/lib/supabase/client';
import SettingRow                 from '@/components/organizer/SettingRow';
import ChecklistApertura, { type ItemChecklist } from '@/components/organizer/ChecklistApertura';
import { formatearRango }     from '@/lib/fechas';
import { color, font, fontSize, space, radius, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';

// ── Tipos ───────────────────────────────────────────────────────────────────

interface Venue { name: string; city: string | null }

interface Tournament {
  id:               string;
  name:             string;
  start_date:       string;
  end_date:         string;
  status:           string;
  registration_fee: number;
  venues:           Venue | null;
}

interface Category { id: string; display_name: string }

type FinishState =
  | { status: 'idle' }
  | { status: 'confirming' }
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'error'; message: string };

// ── Presentación del estado ─────────────────────────────────────────────────

/**
 * El pill explica, no traduce. Antes decía `draft` en inglés y crudo, que no
 * le dice nada a un organizador — sobre todo el dato que más importa en
 * borrador: que los jugadores todavía no lo ven.
 */
const ESTADO: Record<string, { label: string; tinte: string }> = {
  draft:               { label: 'Borrador · no visible para jugadores', tinte: color.muted },
  registration_open:   { label: 'Inscripciones abiertas',              tinte: color.live  },
  registration_closed: { label: 'Inscripciones cerradas',              tinte: color.alive },
  in_progress:         { label: 'En curso',                            tinte: color.alive },
  finished:            { label: 'Finalizado',                          tinte: color.muted },
};

function resumenCategorias(cats: Category[]): string {
  if (cats.length === 0) return 'Ninguna todavía';
  const primeras = cats.slice(0, 3).map((c) => c.display_name).join(', ');
  return cats.length > 3 ? `${primeras} y ${cats.length - 3} más` : primeras;
}

// ── Pantalla ────────────────────────────────────────────────────────────────

export default function OrgTournamentScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();

  const [tournament, setTournament]   = useState<Tournament | null>(null);
  const [categories, setCategories]   = useState<Category[]>([]);
  const [judgeCount, setJudgeCount]   = useState(0);
  const [pairCount, setPairCount]     = useState(0);
  const [canCharge, setCanCharge]     = useState(false);
  const [loading, setLoading]         = useState(true);
  const [updating, setUpdating]       = useState(false);
  const [finishState, setFinishState] = useState<FinishState>({ status: 'idle' });

  const load = useCallback(async () => {
    // Una sola tanda: la pantalla necesita sede, conteos y el estado de Connect
    // del organizador para poder mostrar el valor de cada fila.
    const [{ data: t }, { data: cats }, { count: jueces }, { count: parejas }] = await Promise.all([
      supabase
        .from('tournaments')
        .select('id,name,start_date,end_date,status,registration_fee,organizer_id,venues:venue_id(name,city)')
        .eq('id', tournamentId)
        .single(),
      supabase
        .from('categories')
        .select('id,display_name')
        .eq('tournament_id', tournamentId)
        .order('division'),
      supabase
        .from('tournament_judges')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId),
      supabase
        .from('pairs')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId),
    ]);

    if (t) {
      const fila = t as unknown as Tournament & { organizer_id: string };
      setTournament(fila);

      // Connect activo = puede cobrar en línea. Mismo criterio que aplica
      // checkout-tournament antes de crear la sesión de pago.
      const { data: org } = await supabase
        .from('organizers')
        .select('connect_status')
        .eq('id', fila.organizer_id)
        .maybeSingle();
      setCanCharge(org?.connect_status === 'active');
    }

    if (cats) setCategories(cats as Category[]);
    setJudgeCount(jueces ?? 0);
    setPairCount(parejas ?? 0);
    setLoading(false);
  }, [tournamentId]);

  // useFocusEffect y no useEffect: al volver de una subpantalla (categorías,
  // fechas, jueces…) el componente sigue MONTADO, así que un efecto de montaje
  // no se vuelve a disparar y el panel enseña conteos viejos.
  //
  // El callback no puede ser async: useFocusEffect de expo-router lo detecta y
  // avisa por consola. De ahí el `void load()`.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function handleOpenRegistration() {
    setUpdating(true);
    await supabase.from('tournaments').update({ status: 'registration_open' }).eq('id', tournamentId);
    await load();
    setUpdating(false);
  }

  // Finalizar torneo → Edge Function. No hace UPDATE directo: el guard de la
  // migración 029 bloquea la transición cruda a 'finished'.
  const handleFinishConfirm = async () => {
    setFinishState({ status: 'loading' });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesión expirada');

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/finish-tournament`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ tournament_id: tournamentId }),
        },
      );

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? json.error ?? `Error ${res.status}`);
      setFinishState({ status: 'success' });
      await load();
    } catch (e: unknown) {
      setFinishState({
        status: 'error',
        message: e instanceof Error ? e.message : 'No se pudo terminar el torneo.',
      });
    }
  };

  if (loading) return (
    <View style={s.loadingContainer}><ActivityIndicator color={color.gold} /></View>
  );
  if (!tournament) return null;

  const estado    = ESTADO[tournament.status] ?? { label: tournament.status, tinte: color.muted };
  const esDraft   = tournament.status === 'draft';
  const esAbierto = tournament.status === 'registration_open';
  const enCurso   = tournament.status === 'in_progress';

  const tieneSede       = !!tournament.venues;
  const tieneCategorias = categories.length > 0;

  // El juez es el único no-obligatorio: no entra en `puedeAbrir`.
  const checklist: ItemChecklist[] = [
    { label: 'Nombre y fechas',        subtitle: formatearRango(tournament.start_date, tournament.end_date), done: true,            required: true },
    { label: 'Sede',                   subtitle: tournament.venues?.name ?? 'Sin asignar',                  done: tieneSede,       required: true },
    { label: 'Al menos una categoría', subtitle: tieneCategorias ? resumenCategorias(categories) : 'Ninguna todavía', done: tieneCategorias, required: true },
    { label: 'Al menos un juez',       subtitle: 'Puedes ser tú mismo',                                     done: judgeCount > 0,  required: false },
  ];
  const puedeAbrir = checklist.every((i) => !i.required || i.done);

  const valorCuota = tournament.registration_fee > 0
    ? `$${tournament.registration_fee.toLocaleString('es-MX')} MXN por pareja`
    : canCharge ? 'Gratis' : 'Gratis · conecta Stripe para cobrar';

  return (
    <SafeAreaView style={s.safe}>
      <BotonVolver texto="Mis torneos" onPress={() => router.replace('/(organizer)/org')} />

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── Cabecera ─────────────────────────────────────────── */}
        <Text style={s.eyebrow}>TORNEO</Text>
        <Text style={s.title}>{tournament.name}</Text>
        <View style={[s.pill, { borderColor: estado.tinte }]}>
          <View style={[s.pillDot, { backgroundColor: estado.tinte }]} />
          <Text style={[s.pillTexto, { color: estado.tinte }]}>{estado.label}</Text>
        </View>

        {/* ── Siguiente paso: la ÚNICA acción dorada ───────────── */}
        {esDraft && (
          <ChecklistApertura items={checklist}>
            <Pressable
              onPress={handleOpenRegistration}
              disabled={!puedeAbrir || updating}
              style={({ pressed }) => [
                s.btnDorado,
                (!puedeAbrir || updating) && s.btnDoradoInactivo,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Abrir inscripciones"
              accessibilityState={{ disabled: !puedeAbrir || updating }}
            >
              {updating
                ? <ActivityIndicator color={color.onGold} />
                : <Text style={[s.btnDoradoTexto, !puedeAbrir && s.btnDoradoTextoInactivo]}>
                    Abrir inscripciones
                  </Text>
              }
            </Pressable>
          </ChecklistApertura>
        )}

        {/* ── Configuración ────────────────────────────────────── */}
        <Text style={s.seccion}>CONFIGURACIÓN</Text>
        <View style={s.grupo}>
          <SettingRow
            icon="calendar"
            title="Fechas"
            value={formatearRango(tournament.start_date, tournament.end_date)}
            onPress={() => router.push(`/(organizer)/org/torneos/${tournamentId}/fechas`)}
          />
          <SettingRow
            icon="pin"
            title="Sede"
            value={tournament.venues
              ? [tournament.venues.name, tournament.venues.city].filter(Boolean).join(' · ')
              : 'Sin asignar'}
            iconColor={tieneSede ? undefined : color.alive}
            onPress={() => router.push(`/(organizer)/org/torneos/${tournamentId}/sede`)}
          />
          <SettingRow
            icon="grid"
            title="Categorías"
            value={resumenCategorias(categories)}
            badge={categories.length > 0 ? String(categories.length) : undefined}
            iconColor={tieneCategorias ? undefined : color.alive}
            onPress={() => router.push(`/(organizer)/org/torneos/${tournamentId}/categorias`)}
          />
          <SettingRow
            icon="money"
            title="Cuota de inscripción"
            value={valorCuota}
            onPress={() => router.push(`/(organizer)/org/torneos/${tournamentId}/cuota`)}
          />
          <SettingRow
            icon="clock"
            title="Horarios de partidos"
            value="Sin definir"
            disabled
          />
          <SettingRow
            icon="whistle"
            title="Jueces"
            value={judgeCount > 0
              ? `${judgeCount} ${judgeCount === 1 ? 'asignado' : 'asignados'}`
              : 'Ninguno asignado'}
            badge={judgeCount > 0 ? String(judgeCount) : undefined}
            iconColor={judgeCount > 0 ? undefined : color.alive}
            onPress={() => router.push(`/(organizer)/org/torneos/${tournamentId}/jueces`)}
          />
        </View>

        {/* ── Parejas ──────────────────────────────────────────── */}
        <Text style={s.seccion}>PAREJAS</Text>
        <View style={s.grupo}>
          <SettingRow
            icon="users"
            title="Inscritas"
            value={pairCount === 0
              ? 'Ninguna todavía'
              : `${pairCount} ${pairCount === 1 ? 'pareja' : 'parejas'}`}
            badge={pairCount > 0 ? String(pairCount) : undefined}
            onPress={() => router.push(`/(organizer)/org/torneos/${tournamentId}/parejas`)}
          />
          <SettingRow
            icon="userPlus"
            title="Registrar pareja a mano"
            value="Para quien te pagó por fuera"
            onPress={() => router.push(`/(organizer)/org/torneos/${tournamentId}/agregar-pareja`)}
          />
        </View>

        {/* ── Cerrar inscripciones: solo con inscripciones abiertas ─
             DORADA, igual que "Abrir inscripciones" en draft: es la acción
             principal del torneo en este estado y no destruye nada. Esta
             tarjeta solo NAVEGA; el cierre real se elige y se confirma
             categoría por categoría en la pantalla de destino. */}
        {esAbierto && (
          <>
            <Text style={s.seccion}>SIGUIENTE PASO</Text>
            <Pressable
              onPress={() => router.push(`/(organizer)/org/torneos/${tournamentId}/cerrar-inscripciones`)}
              style={({ pressed }) => [s.btnSiguientePaso, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel="Cerrar inscripciones"
            >
              <Text style={s.btnSiguientePasoTexto}>Cerrar inscripciones</Text>
              <Text style={s.btnSiguientePasoSub}>
                Eliges qué categorías cerrar y ves la vista previa de grupos y
                cuadro de cada una antes de confirmar.
              </Text>
            </Pressable>
          </>
        )}

        {/* ── Zona irreversible ────────────────────────────────── */}
        <Text style={s.seccion}>ZONA DE RIESGO</Text>
        <View style={s.grupo}>
          {enCurso && (
            <>
              {finishState.status === 'confirming' ? (
                <View style={s.confirmacion}>
                  <Text style={s.confirmacionTitulo}>¿Terminar el torneo?</Text>
                  <Text style={s.confirmacionCuerpo}>
                    Se calculará el ranking final y los ratings de todos los
                    jugadores. No se puede deshacer.
                  </Text>
                  <View style={s.confirmacionBotones}>
                    <Pressable
                      onPress={() => setFinishState({ status: 'idle' })}
                      style={s.btnCancelar}
                      accessibilityRole="button"
                    >
                      <Text style={s.btnCancelarTexto}>Cancelar</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleFinishConfirm}
                      style={s.btnConfirmarPeligro}
                      accessibilityRole="button"
                    >
                      <Text style={s.btnConfirmarPeligroTexto}>Sí, terminar</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={() => setFinishState({ status: 'confirming' })}
                  disabled={finishState.status === 'loading' || finishState.status === 'success'}
                  style={({ pressed }) => [s.btnPerfiladoPeligro, pressed && { opacity: 0.85 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Terminar torneo"
                >
                  {finishState.status === 'loading'
                    ? <ActivityIndicator color={color.danger} />
                    : <Text style={s.btnPerfiladoPeligroTexto}>
                        {finishState.status === 'success' ? 'Torneo terminado ✓' : 'Terminar torneo'}
                      </Text>
                  }
                </Pressable>
              )}

              {finishState.status === 'error' && (
                <View style={s.errorBox}>
                  <Text style={s.errorTexto}>{finishState.message}</Text>
                  <Pressable onPress={() => setFinishState({ status: 'idle' })}>
                    <Text style={s.errorReintentar}>Reintentar</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}

          <Pressable
            onPress={() => router.push(`/(organizer)/org/torneos/${tournamentId}/eliminar`)}
            style={({ pressed }) => [s.btnPerfiladoPeligro, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel="Eliminar torneo"
          >
            <Text style={s.btnPerfiladoPeligroTexto}>Eliminar torneo</Text>
          </Pressable>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: color.bg },
  loadingContainer: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  content:          { paddingHorizontal: space[4.5], paddingTop: space[3], paddingBottom: bottomInset, gap: space[3], ...webContentColumn },

  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3 },
  title:   { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },

  pill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               space[2],
    alignSelf:         'flex-start',
    borderWidth:       1,
    borderRadius:      radius.pill,
    paddingHorizontal: space[3],
    paddingVertical:   space[1],
  },
  pillDot:   { width: 6, height: 6, borderRadius: 3 },
  pillTexto: { fontFamily: font.body, fontSize: fontSize.caption, fontWeight: '600' },

  seccion: {
    fontFamily:    font.display,
    fontSize:      fontSize.eyebrow,
    color:         color.champagne,
    letterSpacing: 2,
    marginTop:     space[3],
  },
  grupo: { gap: space[2] },

  // Única acción dorada de la pantalla
  btnDorado: {
    backgroundColor: color.gold,
    borderWidth:     1,
    borderColor:     color.goldBright,
    borderRadius:    radius.sm,
    minHeight:       touchTarget,
    alignItems:      'center',
    justifyContent:  'center',
  },
  btnDoradoInactivo:     { backgroundColor: color.surface2, borderColor: color.line },
  btnDoradoTexto:        { fontFamily: font.body, fontSize: 15, fontWeight: '600', color: color.onGold, letterSpacing: 0.3 },
  btnDoradoTextoInactivo:{ color: color.muted },

  // Acción principal del estado, en oro macizo como btnDorado. Se separa de
  // btnDorado solo porque lleva subtítulo: necesita alinear a la izquierda y
  // padding propio en vez de centrar una línea única.
  btnSiguientePaso: {
    backgroundColor:   color.gold,
    borderWidth:       1,
    borderColor:       color.goldBright,
    borderRadius:      radius.md,
    paddingHorizontal: space[4],
    paddingVertical:   space[3],
    gap:               3,
  },
  btnSiguientePasoTexto: { fontFamily: font.display, fontSize: fontSize.cardName, fontWeight: '600', color: color.onGold },
  // onGold (#1A1407) al 78% sobre oro sigue muy por encima del 4.5:1 de WCAG;
  // color.muted es para fondos oscuros y aquí se volvería ilegible.
  btnSiguientePasoSub:   { fontFamily: font.body, fontSize: fontSize.caption, color: color.onGold, opacity: 0.78, lineHeight: 17 },

  // Perfilado gris con texto danger — irreversible, bajo perfil
  btnPerfiladoPeligro: {
    borderWidth:     1,
    borderColor:     color.lineSoft,
    backgroundColor: 'transparent',
    borderRadius:    radius.md,
    minHeight:       touchTarget,
    alignItems:      'center',
    justifyContent:  'center',
  },
  btnPerfiladoPeligroTexto: { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.danger },
  btnInerte: { opacity: 0.45 },

  confirmacion: {
    backgroundColor: color.surface,
    borderWidth:     1,
    borderColor:     color.danger,
    borderRadius:    radius.md,
    padding:         space[4],
    gap:             space[2],
  },
  confirmacionTitulo:  { fontFamily: font.display, fontSize: fontSize.cardName, fontWeight: '600', color: color.danger },
  confirmacionCuerpo:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },
  confirmacionBotones: { flexDirection: 'row', gap: space[2], marginTop: space[1] },

  btnCancelar: {
    flex: 1, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.sm,
  },
  btnCancelarTexto: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted },

  btnConfirmarPeligro: {
    flex: 1, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center',
    backgroundColor: color.danger, borderRadius: radius.sm,
  },
  btnConfirmarPeligroTexto: { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.bg },

  errorBox: {
    backgroundColor: 'rgba(224,114,111,0.10)',
    borderWidth:     1,
    borderColor:     'rgba(224,114,111,0.30)',
    borderRadius:    radius.md,
    padding:         space[3],
    gap:             space[2],
  },
  errorTexto:      { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, lineHeight: 18 },
  errorReintentar: { fontFamily: font.body, fontSize: fontSize.caption, fontWeight: '600', color: color.muted },
});
