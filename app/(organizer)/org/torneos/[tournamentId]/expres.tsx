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
import SelectorPestanas from '@/components/ui/SelectorPestanas';
import LiveBracket from '@/components/realtime/LiveBracket';
import { pestanasDeFase, faseInicial, type FaseTorneo } from '@/lib/fase-torneo';
import DecisionDeEmpate from '@/components/expres/DecisionDeEmpate';
import { fetchParejasPublicas, nombreDePareja, type ParejaPublica } from '@/lib/parejas-publicas';
import {
  computeClinchExpres, computeTablaExpres,
  type ClinchExpresResult, type EmpateExpres, type ResultadoSuma6, type TablaExpres,
} from '@/lib/engine/expres';
import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';
import { terminarTorneo } from '@/lib/terminar-torneo';
import { fetchCierreDeTorneo, faltanRepartirPuntos } from '@/lib/cierre-de-torneo-datos';
import type { CierreDeTorneo } from '@/lib/cierre-de-torneo';

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
  /**
   * El cuadro existe pero le falta hora o cancha.
   *
   * Pasa cuando se armó con una versión que no programaba, y también cuando
   * el programado falla después de armar — que se permite a propósito: un
   * cruce sin hora se arregla, un cuadro a medio crear no.
   */
  const [cuadroSinHora, setCuadroSinHora] = useState(false);
  const [armando, setArmando] = useState(false);
  /**
   * LA FINAL YA TIENE GANADOR. Es el id de la pareja campeona.
   *
   * EL HUECO: se jugó la final, los 7 partidos quedaron capturados y esta
   * pantalla no decía nada. El torneo seguía 'in_progress' y el paso que
   * reparte los puntos de ranking —terminar el torneo— estaba en el panel,
   * dentro de la ZONA DE RIESGO, que es el último sitio donde alguien busca
   * el final feliz de su domingo.
   */
  const [campeonPairId, setCampeonPairId] = useState<string | null>(null);
  /** `tournaments.status`. Decide si todavía queda algo que cerrar. */
  const [estadoTorneo, setEstadoTorneo] = useState<string | null>(null);
  /**
   * Si se puede cerrar el torneo y qué falta si no — la misma regla y el mismo
   * texto que el panel del torneo largo. Ver `@/lib/cierre-de-torneo`.
   */
  const [cierre, setCierre] = useState<CierreDeTorneo | null>(null);
  /**
   * Cerrado y sin puntos escritos. Es un estado real, no hipotético: así acabó
   * el primer torneo que se cerró. Ver `faltanRepartirPuntos`.
   */
  const [sinPuntos, setSinPuntos] = useState(false);
  const [terminando, setTerminando] = useState(false);
  const [confirmarFin, setConfirmarFin] = useState(false);
  /**
   * Qué fase se está mirando.
   *
   * Mismas pestañas que un torneo largo, y por el mismo motivo: con el cuadro
   * armado, esta pantalla tenía las dos tablas de grupo, los 40 partidos y
   * nada del cuadro. `pestanasDeFase` devuelve vacío mientras solo hay una
   * fase, así que antes de armar el cuadro no aparece ningún selector.
   */
  const [fase, setFase] = useState<FaseTorneo>('grupos');

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

      // ► AQUÍ NO SE LLAMA A `schedule-knockout`, Y ES DELIBERADO.
      //
      //   Se probó y coloca el cuadro AL PRINCIPIO de la ventana del día —las
      //   12:00— encima de la fase de grupos: ocho jugadores con dos partidos
      //   a la vez. No es un fallo suyo. En un torneo largo el cuadro ES el
      //   último día y su ventana está libre; en un exprés los grupos ocupan
      //   esa misma ventana hasta las cinco de la tarde.
      //
      //   Las horas buenas ya las calculó `planificarExpres` al crear el
      //   torneo —grupos, y detrás cuartos, semis y final— y se reservan en
      //   `match_schedule` al sortear. De ahí las toma la RPC que crea cada
      //   ronda, así que el cuadro nace con su hora sin que nadie programe.
      //
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

  /**
   * Cerrar el torneo desde aquí, que es donde está el organizador.
   *
   * Es la MISMA llamada que el botón del panel —ver `@/lib/terminar-torneo`—,
   * no un atajo distinto: reparte los puntos de ranking y recalcula los
   * ratings. Por eso pregunta antes, aunque el sitio sea alegre.
   */
  async function cerrarTorneo() {
    setError(null);
    setTerminando(true);
    try {
      await terminarTorneo(tournamentId);
      setConfirmarFin(false);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo terminar el torneo.');
    } finally {
      setTerminando(false);
    }
  }

  const cargar = useCallback(async () => {
    if (!tournamentId) return;
    setCargando(true);
    setError(null);
    try {
      const [cfgRes, catRes, torneoRes] = await Promise.all([
        supabase.from('expres_config').select('cupo, sorteado_at').eq('tournament_id', tournamentId).maybeSingle(),
        supabase.from('categories').select('id').eq('tournament_id', tournamentId).limit(1).maybeSingle(),
        supabase.from('tournaments').select('status').eq('id', tournamentId).maybeSingle(),
      ]);
      setEstadoTorneo(torneoRes.data?.status ?? null);
      setCierre(
        torneoRes.data?.status === 'in_progress'
          ? await fetchCierreDeTorneo(tournamentId, 'aqui')
          : null,
      );
      setSinPuntos(await faltanRepartirPuntos(tournamentId, torneoRes.data?.status ?? null));
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
        .select('id, stage, status, scheduled_at, court_label, winner_pair_id')
        .eq('tournament_id', tournamentId);
      const deGrupo = (todos ?? []).filter((m) => m.stage === 'group');
      setFaltanGrupo(deGrupo.filter((m) => m.status !== 'finished').length);
      const delCuadro = (todos ?? []).filter((m) => m.stage !== 'group');
      setHayCuadro(delCuadro.length > 0);
      setCuadroSinHora(
        delCuadro.length > 0 && delCuadro.some((m) => !m.scheduled_at || !m.court_label),
      );
      // El campeón sale de la final capturada y de nada más. Sin final jugada
      // no hay campeón y esta pantalla no lo adelanta.
      setCampeonPairId(
        delCuadro.find((m) => m.stage === 'final')?.winner_pair_id ?? null,
      );

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

        {/* ► LAS PESTAÑAS VAN ARRIBA, PEGADAS AL TÍTULO.
            Estaban debajo de las tablas, o sea después de dieciséis filas y
            dos párrafos: para cambiar de fase había que bajar por todo el
            contenido de la fase en la que ya estabas. Un selector que hay que
            buscar scrolleando no se usa — y además leerlo después invierte el
            orden real, porque lo primero que se decide es QUÉ se mira. */}
        {hayCuadro && (
          <SelectorPestanas
            pestanas={pestanasDeFase(true, true)}
            activa={fase}
            onCambiar={(id) => setFase(id as FaseTorneo)}
          />
        )}

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
        {fase === 'grupos' && grupos.map((g) => {
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

        {/* Al guardar un marcador cambian la tabla y el clinch, así que se
            recarga esta pantalla entera en vez de recalcularlo aquí. */}
        {fase === 'grupos' && grupos.length > 0 && (
          <PartidosYCaptura
            tournamentId={tournamentId}
            fase="grupos"
            onCambio={() => void cargar()}
          />
        )}

        {/* ── ELIMINATORIAS ────────────────────────────────────────────
            El cuadro arriba —para ver los cruces de un vistazo— y debajo sus
            partidos con la captura. El mismo orden que en grupos: primero
            cómo va, después qué toca. */}
        {fase === 'eliminatorias' && categoryId && (
          <>
            {/* ── SE ACABÓ ──────────────────────────────────────
                Se jugó la final y esta pantalla se quedaba callada: "los 7
                partidos están capturados" y nada más. El paso que reparte los
                puntos vive en el panel, dentro de la ZONA DE RIESGO — el
                último sitio donde alguien busca el final de su domingo.

                El campeón se dice en cuanto la final tiene ganador, sin
                esperar al cierre: ya es verdad. Y el cierre se ofrece aquí,
                que es donde está el organizador cuando acaba. */}
            {campeonPairId && (
              <Card>
                <SectionLabel title={estadoTorneo === 'finished' ? 'Torneo terminado' : 'Campeón'} />
                <Text style={s.campeon}>{nombre(campeonPairId)} 🏆</Text>

                {estadoTorneo === 'finished' && !sinPuntos ? (
                  <Text style={s.pista}>
                    Los puntos de ranking ya están repartidos y los ratings
                    recalculados. No queda nada por hacer.
                  </Text>
                ) : estadoTorneo === 'finished' && sinPuntos ? (
                  /* CERRADO A MEDIAS. El estado cambió pero los puntos no se
                     escribieron. Se puede reintentar tal cual: las tres piezas
                     del cierre son idempotentes. */
                  <>
                    <Text style={s.texto}>
                      El torneo está cerrado, pero los puntos de ranking no se
                      repartieron.
                    </Text>
                    <Text style={s.pista}>
                      Nadie tiene todavía los puntos de este torneo. Se puede
                      reintentar sin riesgo: no duplica nada.
                    </Text>
                    <Pressable
                      onPress={cerrarTorneo}
                      disabled={terminando}
                      style={[s.boton, terminando && s.botonOff]}
                      accessibilityRole="button"
                      accessibilityLabel="Repartir los puntos de ranking"
                    >
                      {terminando
                        ? <ActivityIndicator color={color.bg} />
                        : <Text style={s.botonTexto}>Repartir los puntos de ranking</Text>}
                    </Pressable>
                  </>
                ) : confirmarFin ? (
                  <>
                    <Text style={s.texto}>¿Terminar el torneo?</Text>
                    <Text style={s.pista}>
                      Se reparten los puntos de ranking de todos los jugadores y
                      se recalculan sus ratings. No se puede deshacer.
                    </Text>
                    <View style={s.filaBotones}>
                      <Pressable
                        onPress={() => setConfirmarFin(false)}
                        style={[s.boton, s.botonSecundario]}
                        accessibilityRole="button"
                      >
                        <Text style={s.botonSecundarioTexto}>Cancelar</Text>
                      </Pressable>
                      <Pressable
                        onPress={cerrarTorneo}
                        disabled={terminando}
                        style={[s.boton, terminando && s.botonOff]}
                        accessibilityRole="button"
                      >
                        {terminando
                          ? <ActivityIndicator color={color.bg} />
                          : <Text style={s.botonTexto}>Sí, terminar</Text>}
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={s.pista}>
                      {cierre?.instruccion
                        ?? 'Falta un paso: al terminar el torneo se reparten los puntos '
                          + 'de ranking y se recalculan los ratings de todos.'}
                    </Text>
                    {/* BLOQUEADO SI QUEDA ALGO SIN CAPTURAR. Con un partido a
                        medias el reparto de puntos sale mal y no se deshace. */}
                    <Pressable
                      onPress={() => setConfirmarFin(true)}
                      disabled={!!cierre && !cierre.listo}
                      style={[s.boton, !!cierre && !cierre.listo && s.botonOff]}
                      accessibilityRole="button"
                      accessibilityLabel="Terminar torneo y repartir los puntos"
                      accessibilityState={{ disabled: !!cierre && !cierre.listo }}
                    >
                      <Text style={s.botonTexto}>
                        {cierre && !cierre.listo ? cierre.titular : 'Terminar torneo'}
                      </Text>
                    </Pressable>
                  </>
                )}
              </Card>
            )}

            <LiveBracket categoryId={categoryId} />
            <PartidosYCaptura
              tournamentId={tournamentId}
              fase="eliminatorias"
              onCambio={() => void cargar()}
            />
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
  texto: { color: color.text, fontFamily: font.body, fontSize: fontSize.body, lineHeight: 20 },
  pista: { color: color.muted, fontFamily: font.body, fontSize: fontSize.caption, lineHeight: 18, marginTop: space[1] },

  campeon: {
    color: color.goldBright, fontFamily: font.display, fontSize: fontSize.h1Inline,
    marginBottom: space[1],
  },
  filaBotones: { flexDirection: 'row', gap: space[2], marginTop: space[2] },
  botonSecundario: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.line },
  botonSecundarioTexto: {
    color: color.muted, fontFamily: font.display, fontSize: fontSize.body,
  },

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
