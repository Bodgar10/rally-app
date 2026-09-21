/**
 * app/(organizer)/org/torneos/nuevo-expres.tsx
 *
 * RALLY · Crear un torneo exprés.
 *
 * PANTALLA APARTE DE `nuevo.tsx`, NO UN INTERRUPTOR DENTRO
 *   Un torneo largo pregunta por un RANGO de fechas, varias categorías y un
 *   formato que se decide después. Un exprés pregunta por un día, una
 *   categoría y un formato que ya está fijado. Meter las dos en el mismo
 *   formulario obligaría a esconder la mitad de los campos según una casilla
 *   de arriba, que es la peor forma de un formulario.
 *
 * SE CREA TODO DE UNA VEZ, Y AQUÍ SÍ IMPORTA EL ORDEN
 *   Son cinco escrituras —torneo, horario, configuración, formato por etapa y
 *   categoría— y desde el cliente no hay transacción. Si una falla a mitad, se
 *   BORRA el torneo recién creado en vez de dejarlo a medias: está en 'draft'
 *   y sin nada colgando, así que el borrado es limpio y el organizador vuelve
 *   a intentarlo con el formulario lleno.
 *
 *   No se hace con una RPC como el sorteo porque aquí lo que queda a medias sí
 *   se puede deshacer. Un fixture a medio escribir, no.
 *
 * TODOS LOS VALORES VAN EXPLÍCITOS, NUNCA AL DEFAULT DE LA COLUMNA
 *   Mismo criterio que `nuevo.tsx` con `tercer_lugar` y `tercer_set_formato`:
 *   el default de una columna es una promesa de otro sistema, y si su
 *   migración no llegó a aplicarse el torneo nace con algo que nadie eligió.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { Card, SectionLabel } from '@/components/ui';
import BotonVolver from '@/components/ui/BotonVolver';
import VenuePicker, { type Venue } from '@/components/organizer/VenuePicker';
import CalendarioRango from '@/components/ui/CalendarioRango';
import { type RangoSeleccion } from '@/lib/rango-fechas';
import { TIER_EXPRES, opcionDeTier, puntosDelCampeon } from '@/lib/tier-torneo';
import { DIVISIONES_DESC, ETIQUETA_DIVISION, NOMBRE_DIVISION } from '@/lib/divisiones';
import type { Division } from '@/lib/engine/types';
import CrearExpres, { type ConfigExpres } from '@/components/expres/CrearExpres';
import type { PlanExpres } from '@/lib/engine/expres';
import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';

type Genero = 'male' | 'female' | 'mixed';

/**
 * ► LA LISTA Y LOS NOMBRES SALÍAN DE AQUÍ, ESCRITOS A MANO
 *   Esta pantalla tenía su propio `type Division` con las seis divisiones
 *   literales, su propia lista de chips y su propio `NOMBRE_DIVISION`. Al
 *   añadir la séptima (migración 084) nada de esto habría dejado de compilar:
 *   el alta del exprés se habría quedado sin la división nueva en silencio.
 *
 *   Ahora sale de `@/lib/divisiones`, que es el único sitio donde están las
 *   siete y donde la compilación comprueba que no falte ninguna.
 */
const DIVISIONES = DIVISIONES_DESC.map((v) => ({ v, t: ETIQUETA_DIVISION[v] }));

const GENEROS: { v: Genero; t: string }[] = [
  { v: 'male', t: 'Varonil' }, { v: 'female', t: 'Femenil' }, { v: 'mixed', t: 'Mixto' },
];

/** La semilla del sorteo. Se genera UNA vez y se guarda: ver expres_config. */
function nuevaSemilla(): string {
  const azar = globalThis.crypto?.randomUUID?.();
  return azar ?? `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export default function NuevoExpresScreen() {
  const router = useRouter();

  const [organizerId, setOrganizerId] = useState<string | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [sede, setSede] = useState<Venue | null>(null);

  const [nombre, setNombre] = useState('');
  const [rango, setRango] = useState<RangoSeleccion>({ inicio: null, fin: null });
  const [division, setDivision] = useState<Division | null>(null);
  const [genero, setGenero] = useState<Genero | null>(null);
  const [cuota, setCuota] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data: om }, { data: vs }] = await Promise.all([
        supabase.from('organizer_members').select('organizer_id').eq('user_id', user.id).maybeSingle(),
        supabase.from('venues').select('id, name, city').order('name'),
      ]);
      if (om?.organizer_id) setOrganizerId(om.organizer_id);
      setVenues((vs ?? []) as Venue[]);
    })();
  }, []);

  /**
   * Un exprés es UN día. El calendario va en modo `unDia`, así que el toque ya
   * devuelve inicio y fin iguales; se lee el inicio porque es el que existe
   * siempre.
   */
  const dia = rango.inicio;

  /** El tier no se pregunta: ver TIER_EXPRES. Se pinta para que se sepa. */
  const tierExpres = opcionDeTier(TIER_EXPRES);

  const faltan = useMemo(() => {
    const f: string[] = [];
    if (!nombre.trim()) f.push('el nombre');
    if (!dia) f.push('el día');
    if (!division) f.push('la división');
    if (!genero) f.push('la rama');
    if (!organizerId) f.push('tu organizador');
    return f;
  }, [nombre, dia, division, genero, organizerId]);

  async function crear(cfg: ConfigExpres, _plan: PlanExpres) {
    if (faltan.length > 0) {
      throw new Error(`Falta ${faltan.join(', ')} antes de crear el torneo.`);
    }
    setError(null);

    // 1 · El torneo. Todo explícito: ver la cabecera.
    const { data: torneo, error: te } = await supabase
      .from('tournaments')
      .insert({
        organizer_id: organizerId!,
        venue_id: sede?.id ?? null,
        name: nombre.trim(),
        start_date: dia!,
        end_date: dia!,
        registration_fee: parseFloat(cuota) || 0,
        status: 'draft',
        tier: TIER_EXPRES,
        modo: 'expres',
        courts: cfg.canchas,
        // El de los partidos de GRUPO. El resto de etapas vive en expres_etapa;
        // esta columna sigue existiendo para lo que aún la lee.
        match_minutes: cfg.minutos.group,
        // En un exprés no hay tercer lugar: son cuartos, semis y final.
        tercer_lugar: false,
        // No aplica —no hay tercer set en ninguna etapa— pero la columna es NOT
        // NULL, así que se escribe el valor de siempre en vez de confiarlo.
        tercer_set_formato: 'super_muerte' as const,
      })
      .select('id')
      .single();

    if (te || !torneo) throw new Error(te?.message ?? 'No se pudo crear el torneo.');

    // Si algo de lo que viene falla, el torneo recién creado se borra: está en
    // 'draft' y sin nada colgando, así que no deja rastro.
    const deshacer = async (msg: string) => {
      await supabase.from('tournaments').delete().eq('id', torneo.id);
      throw new Error(msg);
    };

    // 2 · El horario del día.
    const { error: we } = await supabase.from('tournament_windows').insert({
      tournament_id: torneo.id,
      dia: dia!,
      desde: `${cfg.ventana.desde}:00`,
      hasta: `${cfg.ventana.hasta}:00`,
    });
    if (we) await deshacer(`No se pudo guardar el horario: ${we.message}`);

    // 3 · La configuración, con la SEMILLA del sorteo.
    const { error: ce } = await supabase.from('expres_config').insert({
      tournament_id: torneo.id,
      cupo: cfg.cupo,
      partidos_por_pareja: cfg.partidosPorPareja,
      clasifican_por_grupo: 4,
      semilla_sorteo: nuevaSemilla(),
    });
    if (ce) await deshacer(`No se pudo guardar la configuración: ${ce.message}`);

    // 4 · El formato de cada etapa. Sin fila, esa etapa no se puede planificar.
    const { error: ee } = await supabase.from('expres_etapa').insert([
      { tournament_id: torneo.id, stage: 'group' as const, formato: 'suma_6' as const, minutos: cfg.minutos.group },
      { tournament_id: torneo.id, stage: 'quarter' as const, formato: 'set_oro' as const, minutos: cfg.minutos.quarter },
      { tournament_id: torneo.id, stage: 'semi' as const, formato: 'set_oro' as const, minutos: cfg.minutos.semi },
      { tournament_id: torneo.id, stage: 'final' as const, formato: cfg.finalFormato, minutos: cfg.minutos.final },
    ]);
    if (ee) await deshacer(`No se pudo guardar el formato por etapa: ${ee.message}`);

    // 5 · La categoría. Una sola, y ya sabe su forma: dos grupos, pasan 4, sin
    // repesca. En un torneo largo esto lo decide `computeFormat` al cerrar
    // inscripciones; aquí no hay nada que decidir.
    const { error: cate } = await supabase.from('categories').insert({
      tournament_id: torneo.id,
      division: division!,
      gender: genero!,
      display_name: `${NOMBRE_DIVISION[division!]} ${GENEROS.find((g) => g.v === genero)!.t}`,
      format_type: 'groups_then_knockout' as const,
      num_groups: 2,
      advance_per_group: 4,
      best_extra_qualifiers: 0,
      status: 'open' as const,
    });
    if (cate) await deshacer(`No se pudo crear la categoría: ${cate.message}`);

    router.replace(`/(organizer)/org/torneos/${torneo.id}`);
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.cont}>
        <BotonVolver texto="Volver" />

        <SectionLabel title="Datos del torneo" />
        <Card>
          <Text style={s.etiqueta}>Nombre</Text>
          <TextInput
            value={nombre}
            onChangeText={setNombre}
            placeholder="Exprés dominical"
            placeholderTextColor={color.muted}
            style={s.input}
          />

          <Text style={s.etiqueta}>Día</Text>
          <Text style={s.pista}>Un exprés es una tarde. Toca el día y ya está.</Text>
          <CalendarioRango valor={rango} onChange={setRango} bloquearPasado unDia />

          <Text style={s.etiqueta}>Sede</Text>
          <VenuePicker
            venues={venues}
            selectedVenue={sede}
            onSelect={setSede}
            onCreated={(v) => {
              setVenues((prev) => [...prev, v]);
              setSede(v);
            }}
          />

          <Text style={s.etiqueta}>Cuota por pareja</Text>
          <TextInput
            value={cuota}
            onChangeText={setCuota}
            placeholder="0"
            keyboardType="numeric"
            placeholderTextColor={color.muted}
            style={s.input}
          />
        </Card>

        <SectionLabel title="La categoría" />
        <Card>
          <Text style={s.pista}>Un exprés tiene una sola. Es la que se juega esa tarde.</Text>
          <Text style={s.etiqueta}>División</Text>
          <View style={s.chips}>
            {DIVISIONES.map((d) => (
              <Pressable
                key={d.v}
                onPress={() => setDivision(d.v)}
                style={[s.chip, division === d.v && s.chipOn]}
              >
                <Text style={[s.chipTexto, division === d.v && s.chipTextoOn]}>{d.t}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.etiqueta}>Rama</Text>
          <View style={s.chips}>
            {GENEROS.map((g) => (
              <Pressable
                key={g.v}
                onPress={() => setGenero(g.v)}
                style={[s.chip, s.chipAncho, genero === g.v && s.chipOn]}
              >
                <Text style={[s.chipTexto, genero === g.v && s.chipTextoOn]}>{g.t}</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {/* ── PUNTOS DE RANKING ────────────────────────────────────
            NO SE ELIGE, Y ESO ES LO CORRECTO. Un Major pide 3+ días y 24
            parejas por categoría; un P1, dos días y 12. Ninguno cabe en una
            tarde, así que ofrecerlos aquí era ofrecer dos respuestas
            equivocadas — y elegir mal no lo paga el organizador: reparte el
            doble de puntos de los que tocan y contamina la temporada de todos
            los que jugaron. Ver TIER_EXPRES. */}
        <SectionLabel title="Puntos de ranking" />
        <Card>
          <View style={s.tierFila}>
            <View style={s.tierTextos}>
              <Text style={s.tierTitulo}>{tierExpres.titulo}</Text>
              <Text style={s.tierSub}>{tierExpres.dias} · {tierExpres.sub}</Text>
            </View>
            <View style={s.tierMulti}>
              <Text style={s.tierMultiValor}>
                {puntosDelCampeon(TIER_EXPRES).toLocaleString('es-MX')}
              </Text>
              <Text style={s.tierMultiPie}>pts al campeón</Text>
            </View>
          </View>
          <Text style={s.pista}>
            Un exprés es siempre P2: dura una tarde. Major y P1 piden varios
            días y un mínimo de parejas que no caben aquí.
          </Text>
        </Card>

        {faltan.length > 0 && (
          <View style={s.aviso}>
            <Text style={s.avisoTexto}>
              Antes de crear falta {faltan.join(', ')}. El formato de abajo ya se puede
              ajustar mientras tanto.
            </Text>
          </View>
        )}

        {error && (
          <View style={s.error}>
            <Text style={s.errorTexto}>{error}</Text>
          </View>
        )}

        <CrearExpres onCrear={crear} onVolver={() => router.back()} />
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

  etiqueta: {
    color: color.muted, fontFamily: font.body, fontSize: fontSize.eyebrow,
    textTransform: 'uppercase', letterSpacing: 0.6, marginTop: space[2],
  },
  pista: { color: color.muted, fontFamily: font.body, fontSize: fontSize.minAbsolute, lineHeight: 17 },
  input: {
    minHeight: touchTarget, color: color.text, fontFamily: font.body, fontSize: fontSize.body,
    borderRadius: radius.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: color.surface, paddingHorizontal: space[3],
  },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip: {
    minHeight: touchTarget, minWidth: touchTarget, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: space[3], borderRadius: radius.sm, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)', backgroundColor: color.surface,
  },
  chipAncho: { flexGrow: 1 },
  chipOn: { borderColor: color.gold, backgroundColor: 'rgba(212,175,55,0.14)' },
  chipTexto: { color: color.text, fontFamily: font.body, fontSize: fontSize.body },
  chipTextoOn: { color: color.goldBright, fontWeight: '600' },

  tierFila: {
    flexDirection: 'row', alignItems: 'center', gap: space[3],
    paddingVertical: space[2], marginBottom: space[1],
  },
  tierTextos: { flex: 1, gap: 2 },
  tierTitulo: { color: color.goldBright, fontFamily: font.display, fontSize: fontSize.h1Inline },
  tierSub: { color: color.muted, fontFamily: font.body, fontSize: fontSize.minAbsolute, lineHeight: 16 },
  tierMulti: { alignItems: 'flex-end' },
  tierMultiValor: { color: color.champagne, fontFamily: font.display, fontSize: fontSize.metric },
  tierMultiPie: { color: color.muted, fontFamily: font.body, fontSize: fontSize.minAbsolute },

  aviso: {
    padding: space[3], borderRadius: radius.sm, backgroundColor: 'rgba(230,180,80,0.10)',
    borderWidth: 1, borderColor: 'rgba(230,180,80,0.28)',
  },
  avisoTexto: { color: color.alive, fontFamily: font.body, fontSize: fontSize.caption, lineHeight: 18 },
  error: {
    padding: space[3], borderRadius: radius.sm, backgroundColor: 'rgba(224,114,111,0.13)',
    borderWidth: 1, borderColor: 'rgba(224,114,111,0.3)',
  },
  errorTexto: { color: color.danger, fontFamily: font.body, fontSize: fontSize.body, lineHeight: 20 },
});
