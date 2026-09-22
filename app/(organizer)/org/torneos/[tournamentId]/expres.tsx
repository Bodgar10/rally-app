/**
 * app/(organizer)/org/torneos/[tournamentId]/expres.tsx
 *
 * RALLY · El panel del exprés: sortear, ver las tablas y resolver el empate.
 *
 * LA TABLA SE CALCULA AQUÍ, NO SE LEE DE `group_standings`
 *   Esa tabla existe y la escribe la captura, pero es una FOTO. Esta pantalla
 *   recalcula desde los marcadores con `computeTablaExpres`, que es la misma
 *   función que corre el servidor. Así, si una foto se quedó vieja porque una
 *   escritura falló, la pantalla enseña la verdad y no el residuo.
 *
 * EL DESEMPATE REUTILIZA LA RPC DEL TORNEO LARGO, SIN UNA LÍNEA NUEVA
 *   `sortear_desempate` (migración 065) guarda un orden ya decidido en un
 *   jsonb y exige que el grupo esté completo — `status <> 'finished'`—, que en
 *   un exprés se cumple igual: un suma 6 capturado queda 'finished' aunque no
 *   tenga ganador. Le da igual que el orden lo haya elegido un sorteo o una
 *   persona, que es justo la diferencia entre los dos modos.
 *
 * POR QUÉ EL BOTÓN DE SORTEAR DESAPARECE Y NO SE DESHABILITA
 *   Sortear dos veces daría otro reparto y borraría lo jugado. La base lo
 *   impide con `expres_config.sorteado_at`, pero un botón gris que no se puede
 *   pulsar invita a preguntarse por qué — y a buscar cómo. Una vez sorteado,
 *   lo que hay es el calendario.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { Card, SectionLabel } from '@/components/ui';
import BotonVolver from '@/components/ui/BotonVolver';
import TablaExpresGrupo from '@/components/expres/TablaExpresGrupo';
import PartidosYCaptura from '@/components/expres/PartidosYCaptura';
import DecisionDeEmpate from '@/components/expres/DecisionDeEmpate';
import { fetchParejasPublicas, nombreDePareja, type ParejaPublica } from '@/lib/parejas-publicas';
import {
  computeClinchExpres, computeTablaExpres,
  type ClinchExpresResult, type EmpateExpres, type ResultadoSuma6, type TablaExpres,
} from '@/lib/engine/expres';
import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';

interface GrupoEnPantalla {
  groupId: string;
  nombre: string;
  tabla: TablaExpres;
  clinch: ClinchExpresResult[];
}

export default function PanelExpresScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();

  const [cargando, setCargando] = useState(true);
  const [sorteando, setSorteando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sorteadoAt, setSorteadoAt] = useState<string | null>(null);
  const [cupo, setCupo] = useState<number | null>(null);
  const [inscritas, setInscritas] = useState(0);
  const [grupos, setGrupos] = useState<GrupoEnPantalla[]>([]);
  const [parejas, setParejas] = useState<Map<string, ParejaPublica>>(new Map());
  const [resolviendo, setResolviendo] = useState<{ groupId: string; empate: EmpateExpres } | null>(null);
  /** Id de la categoría, para armar el cuadro. */
  const [categoryId, setCategoryId] = useState<string | null>(null);
  /** Partidos de grupo que faltan por capturar. 0 = la fase terminó. */
  const [faltanGrupo, setFaltanGrupo] = useState<number | null>(null);
  /** Ya existe el cuadro: entonces no hay nada que armar. */
  const [hayCuadro, setHayCuadro] = useState(false);
  const [armando, setArmando] = useState(false);

  /**
   * Armar el cuadro con los que clasificaron.
   *
   * ► ES `generate-bracket`, EL MISMO DE LOS TORNEOS LARGOS
   *   Se valoró escribir un sembrador propio para el exprés y no hacía falta:
   *   con dos grupos y cuatro que pasan salen ocho clasificados, que es
   *   exactamente un cuadro de cuartos. Y `selectQualifiers` ya ordena por
   *   posición de grupo y desempata por saldo de games — que en un exprés es
   *   el único criterio que existe, porque los puntos siempre valen cero.
   *
   *   Lo único que no sabía hacer era poner el `formato` que un exprés exige
   *   en cada partido. Eso se resolvió en la base (migración 088): el trigger
   *   lo rellena desde `expres_etapa` en vez de rechazar el insert, así que
   *   ningún camino que cree partidos tiene que acordarse.
   */
  async function armarCuadro() {
    setError(null);
    setArmando(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Tu sesión expiró. Vuelve a entrar.');

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-bracket`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: 'seed', category_id: categoryId }),
        },
      );
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(cuerpo?.detail ?? cuerpo?.error ?? 'No se pudo armar el cuadro.');
      }
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo armar el cuadro.');
    } finally {
      setArmando(false);
    }
  }

  const nombre = useCallback(
    (pairId: string) => nombreDePareja(parejas.get(pairId)),
    [parejas],
  );

  const cargar = useCallback(async () => {
    if (!tournamentId) return;
    setCargando(true);
    setError(null);
    try {
      const [cfgRes, catRes] = await Promise.all([
        supabase.from('expres_config').select('cupo, sorteado_at').eq('tournament_id', tournamentId).maybeSingle(),
        supabase.from('categories').select('id').eq('tournament_id', tournamentId).limit(1).maybeSingle(),
      ]);
      if (!cfgRes.data) {
        setError('Este torneo no tiene configuración de exprés.');
        return;
      }
      setCupo(cfgRes.data.cupo);
      setSorteadoAt(cfgRes.data.sorteado_at);

      const categoryId = catRes.data?.id;
      if (!categoryId) {
        setError('El torneo no tiene categoría.');
        return;
      }
      setCategoryId(categoryId);

      const [parejasRes, gruposRes] = await Promise.all([
        supabase.from('pairs').select('id').eq('category_id', categoryId),
        supabase.from('groups').select('id, name').eq('category_id', categoryId).order('name'),
      ]);
      setInscritas((parejasRes.data ?? []).length);

      const gs = gruposRes.data ?? [];
      if (gs.length === 0) {
        setGrupos([]);
        return;
      }

      // Lo que decide si se puede armar el cuadro: que no quede ningún
      // partido de grupo sin capturar, y que el cuadro no exista ya.
      const { data: todos } = await supabase
        .from('matches')
        .select('id, stage, status')
        .eq('tournament_id', tournamentId);
      const deGrupo = (todos ?? []).filter((m) => m.stage === 'group');
      setFaltanGrupo(deGrupo.filter((m) => m.status !== 'finished').length);
      setHayCuadro((todos ?? []).some((m) => m.stage !== 'group'));

      const ids = gs.map((g) => g.id);
      const [standingsRes, partidosRes] = await Promise.all([
        supabase.from('group_standings').select('group_id, pair_id, desempate_manual').in('group_id', ids),
        supabase.from('matches').select('id, group_id, pair_a_id, pair_b_id').in('group_id', ids),
      ]);

      const partidos = partidosRes.data ?? [];
      const setsRes = partidos.length
        ? await supabase.from('match_sets').select('match_id, games_a, games_b')
            .in('match_id', partidos.map((m) => m.id)).eq('set_number', 1)
        : { data: [] as { match_id: string; games_a: number; games_b: number }[] };

      const games = new Map<string, { a: number; b: number }>();
      for (const s of setsRes.data ?? []) games.set(s.match_id, { a: s.games_a, b: s.games_b });

      setParejas(await fetchParejasPublicas((parejasRes.data ?? []).map((p) => p.id)));

      const armados: GrupoEnPantalla[] = gs.map((g) => {
        const pairIds = (standingsRes.data ?? []).filter((s) => s.group_id === g.id).map((s) => s.pair_id);
        const resultados: ResultadoSuma6[] = partidos
          .filter((m) => m.group_id === g.id)
          .map((m) => ({
            matchId: m.id,
            pairAId: m.pair_a_id!,
            pairBId: m.pair_b_id!,
            gamesA: games.get(m.id)?.a ?? null,
            gamesB: games.get(m.id)?.b ?? null,
          }));

        const ordenManual: Record<string, number> = {};
        for (const s of standingsRes.data ?? []) {
          if (s.group_id === g.id && s.desempate_manual != null) ordenManual[s.pair_id] = s.desempate_manual;
        }

        return {
          groupId: g.id,
          nombre: g.name,
          tabla: computeTablaExpres({
            grupo: g.name,
            pairIds,
            resultados,
            ordenManual: Object.keys(ordenManual).length ? ordenManual : undefined,
          }),
          clinch: computeClinchExpres({ pairIds, resultados }),
        };
      });
      setGrupos(armados);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el torneo.');
    } finally {
      setCargando(false);
    }
  }, [tournamentId]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function sortear() {
    setSorteando(true);
    setError(null);
    try {
      const catRes = await supabase.from('categories').select('id').eq('tournament_id', tournamentId!).limit(1).maybeSingle();
      const { data, error: fe } = await supabase.functions.invoke('expres-sortear', {
        body: { category_id: catRes.data?.id },
      });
      // `invoke` mete el cuerpo del error en `context`; sin leerlo, el
      // organizador ve "Edge Function returned a non-2xx status code" y no
      // sabe si le faltan parejas o le falta el horario.
      if (fe) {
        const detalle = await (fe as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(detalle?.detail ?? detalle?.error ?? fe.message);
      }
      if (data?.error) throw new Error(data.detail ?? data.error);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo sortear.');
    } finally {
      setSorteando(false);
    }
  }

  async function guardarDesempate(orden: Record<string, number>) {
    if (!resolviendo) return;
    const { error: e } = await supabase.rpc('sortear_desempate', {
      p_group_id: resolviendo.groupId,
      p_orden: Object.entries(orden).map(([pair_id, ord]) => ({ pair_id, orden: ord })),
    });
    if (e) throw new Error(e.message);
    setResolviendo(null);
    await cargar();
  }

  const bloqueados = useMemo(
    () => grupos.filter((g) => g.tabla.bloqueaClasificacion),
    [grupos],
  );

  if (resolviendo) {
    return (
      <SafeAreaView style={s.safe}>
        <DecisionDeEmpate
          empate={resolviendo.empate}
          nombreDePareja={nombre}
          plazasEnJuego={
            grupos.find((g) => g.groupId === resolviendo.groupId)!.tabla.clasifican -
            (resolviendo.empate.posiciones[0] - 1)
          }
          onConfirmar={guardarDesempate}
          onCancelar={() => setResolviendo(null)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.cont}>
        <BotonVolver texto="Volver" />
        <Text style={s.h1}>Torneo exprés</Text>

        {cargando && <ActivityIndicator color={color.gold} />}

        {error && (
          <View style={s.error}>
            <Text style={s.errorTexto}>{error}</Text>
          </View>
        )}

        {!cargando && !sorteadoAt && (
          <>
            <SectionLabel title="Sorteo" />
            <Card>
              <Text style={s.texto}>
                Hay {inscritas} de {cupo ?? '—'} parejas inscritas.
              </Text>
              <Text style={s.pista}>
                El sorteo reparte los dos grupos y arma el calendario de la tarde entero. Se hace
                UNA vez: después no se puede repetir, porque daría otro reparto.
              </Text>
              <Pressable
                onPress={sortear}
                disabled={sorteando || inscritas !== cupo}
                style={[s.boton, (sorteando || inscritas !== cupo) && s.botonOff]}
              >
                {sorteando
                  ? <ActivityIndicator color={color.bg} />
                  : <Text style={s.botonTexto}>
                      {inscritas === cupo ? 'Sortear grupos y armar el calendario' : 'Falta completar el cupo'}
                    </Text>}
              </Pressable>
            </Card>
          </>
        )}

        {bloqueados.length > 0 && (
          <View style={s.alerta}>
            <Text style={s.alertaTitulo}>
              {bloqueados.length === 1 ? 'Un grupo necesita' : `${bloqueados.length} grupos necesitan`} que
              decidas quién avanza
            </Text>
            <Text style={s.alertaTexto}>
              El cuadro no se puede armar hasta entonces: el orden decide los cruces de cuartos.
            </Text>
          </View>
        )}

        {/* ► LA AGENDA, CON HORA Y CANCHA, Y SE CAPTURA DESDE AQUÍ.
            Antes esta pantalla solo enseñaba las dos tablas: el organizador
            veía cómo iba el grupo pero no qué partido tocaba ni dónde, y para
            anotar un marcador tenía que irse a la pantalla del juez. En un
            exprés el organizador ESTÁ en el club esa tarde y muchas veces es
            él quien apunta, así que pedirle que cambie de rol para hacer su
            trabajo no tenía sentido.

            Va DEBAJO de las tablas: la primera pregunta al abrir es cómo va
            el grupo; la segunda, qué toca ahora. */}
        {grupos.map((g) => {
          const empate = g.tabla.empatesSinResolver.find((e) => e.decideClasificacion);
          return (
            <Card key={g.groupId}>
              <TablaExpresGrupo
                tabla={g.tabla}
                clinch={g.clinch}
                nombreDePareja={nombre}
                onDecidirEmpate={
                  empate && g.tabla.bloqueaClasificacion
                    ? () => setResolviendo({ groupId: g.groupId, empate })
                    : undefined
                }
              />
            </Card>
          );
        })}

        {/* ── ARMAR EL CUADRO ──────────────────────────────────────────
            Faltaba por completo: un exprés podía jugar sus 40 partidos de
            grupo y quedarse ahí, sin camino a cuartos. El botón sigue el
            mismo patrón que el torneo largo — visible desde el principio y
            APAGADO hasta que se puede — porque un botón que aparece de
            repente no se busca: quien no sabe que existe no lo espera. */}
        {sorteadoAt && faltanGrupo !== null && !hayCuadro && (
          <Card>
            <Text style={s.texto}>Armar el cuadro</Text>
            <Text style={s.pista}>
              {faltanGrupo > 0
                ? `Faltan ${faltanGrupo} ${faltanGrupo === 1 ? 'partido' : 'partidos'} de la `
                  + 'fase de grupos. Cuando estén todos, aquí se cruzan los 8 que pasan: '
                  + '1.º de A contra 4.º de B, y así.'
                : 'Los 8 que pasaron se cruzan en cuartos: el 1.º de cada grupo contra el '
                  + '4.º del otro. Se hace una sola vez.'}
            </Text>

            {bloqueados.length > 0 && faltanGrupo === 0 && (
              <Text style={s.avisoEmpate}>
                Hay un empate sin resolver que decide quién pasa. Resuélvelo antes:
                el orden decide los cruces.
              </Text>
            )}

            <Pressable
              onPress={armarCuadro}
              disabled={armando || faltanGrupo > 0 || bloqueados.length > 0}
              style={[
                s.boton,
                (armando || faltanGrupo > 0 || bloqueados.length > 0) && s.botonOff,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Armar el cuadro de cuartos"
            >
              {armando
                ? <ActivityIndicator color={color.bg} />
                : <Text style={s.botonTexto}>
                    {faltanGrupo > 0 ? 'Falta terminar la fase de grupos' : 'Armar cuartos de final'}
                  </Text>}
            </Pressable>
          </Card>
        )}

        {/* Ya existe: el cuadro se mira en su pantalla, no aquí. */}
        {hayCuadro && (
          <Card>
            <Text style={s.texto}>El cuadro ya está armado</Text>
            <Text style={s.pista}>
              Los cruces de cuartos, semis y final se ven en el calendario del
              torneo.
            </Text>
          </Card>
        )}

        {/* Al guardar un marcador cambian la tabla y el clinch, así que se
            recarga esta pantalla entera en vez de recalcularlo aquí. */}
        {grupos.length > 0 && (
          <PartidosYCaptura tournamentId={tournamentId} onCambio={() => void cargar()} />
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
  texto: { color: color.text, fontFamily: font.body, fontSize: fontSize.body, lineHeight: 20 },
  pista: { color: color.muted, fontFamily: font.body, fontSize: fontSize.caption, lineHeight: 18, marginTop: space[1] },

  boton: {
    minHeight: touchTarget, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.md, backgroundColor: color.gold, marginTop: space[3],
  },
  botonOff: { opacity: 0.4 },
  botonTexto: { color: color.bg, fontFamily: font.body, fontSize: fontSize.body, fontWeight: '700' },

  alerta: {
    gap: space[1], padding: space[3], borderRadius: radius.sm,
    backgroundColor: 'rgba(224,114,111,0.12)', borderWidth: 1, borderColor: 'rgba(224,114,111,0.32)',
  },
  alertaTitulo: {
    color: color.danger, fontFamily: font.display, fontSize: fontSize.section,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  alertaTexto: { color: color.text, fontFamily: font.body, fontSize: fontSize.caption, lineHeight: 18 },

  avisoEmpate: {
    color: color.danger, fontFamily: font.body, fontSize: fontSize.caption,
    lineHeight: 18, marginTop: space[2],
  },

  error: {
    padding: space[3], borderRadius: radius.sm, backgroundColor: 'rgba(224,114,111,0.13)',
    borderWidth: 1, borderColor: 'rgba(224,114,111,0.3)',
  },
  errorTexto: { color: color.danger, fontFamily: font.body, fontSize: fontSize.body, lineHeight: 20 },
});
