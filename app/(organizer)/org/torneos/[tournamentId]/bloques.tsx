/**
 * RALLY · Horarios de la fase de grupos (organizador)
 *
 * LA PANTALLA RESPONDE UNA PREGUNTA: ¿a qué hora juega mi gente, y cabe todo?
 *
 * LA VERSIÓN ANTERIOR HABLABA EL IDIOMA DEL MOTOR
 *   Decía "165 de 192 lugares · 55/64 carriles usados · 8 bloques". Un
 *   organizador abrió esa pantalla y no supo qué era un bloque, ni un carril,
 *   ni qué se suponía que tenía que hacer con esos números. Son unidades
 *   internas: el motor razona en carriles porque necesita repartir canchas,
 *   pero él piensa en HORARIOS y en GENTE.
 *
 *   Aquí no aparecen las palabras "bloque", "carril" ni "lugares". Un bloque es
 *   un horario. Un carril es una cancha durante ese horario. Y lo que se cuenta
 *   son parejas.
 *
 * EL ORDEN ES EL DE LAS PREGUNTAS, no el de los datos:
 *   1. ¿Cabe? Una línea, arriba, en español.
 *   2. ¿A qué hora juega cada quien? Los horarios, como los ve el jugador.
 *   3. ¿Quiénes? El desglose por categoría, secundario y en una línea.
 *   4. ¿Hay algo raro? Los horarios que se alargan y lo que quedó sin sitio.
 *
 * LA JERARQUÍA ES REAL
 *   El número grande de cada tarjeta es CUÁNTAS PAREJAS hay en ese horario. No
 *   un porcentaje: el porcentaje no le dice a nadie a quién tiene que llamar.
 *
 * DAR HORARIO A QUIEN NO LO TIENE
 *   Es el caso normal, no la excepción: alguien se inscribió tarde, el
 *   organizador lo metió a mano, o su horario se llenó mientras elegía. Sin una
 *   salida aquí el torneo se queda bloqueado — esas parejas no se pueden cerrar
 *   y nadie puede hacer nada al respecto.
 *
 *   Se asigna por categoría y de golpe: los restos de una categoría van juntos
 *   porque van a formar grupo entre ellos. Y se puede elegir un horario LLENO,
 *   igual que en el registro manual: esa gente ya pagó, y decirle que no cabe
 *   no es una respuesta. Queda marcado como forzado.
 */

import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator, StyleSheet, SafeAreaView, Pressable, Modal,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { cupoDeBloque, carrilesDeGrupo, type Bloque, type Ocupacion } from '@/lib/engine/schedule/bloques';
import { cargarBloquesDelTorneo, type BloquesDelTorneo } from '@/lib/bloques-torneo';
import {
  capacidadDelTorneo, tamanosDeGrupo, horaLegible, partesDeBloqueId, type Capacidad,
} from '@/lib/bloques-formato';
import { formatearConDia } from '@/lib/fechas';
import SelectorDeBloque from '@/components/tournament/SelectorDeBloque';
import { color, radius, space, font, fontSize, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';

// ── Modelo ──────────────────────────────────────────────────────────────────

interface FilaPareja   { id: string; category_id: string }
interface FilaEleccion { pair_id: string; bloque_id: string; forzado: boolean }

/** La categoría cuyas parejas sin hora se están asignando ahora mismo. */
interface Asignando {
  categoryId: string;
  categoria:  string;
  pairIds:    string[];
}

/** Lo que se pinta de un horario, ya masticado. */
interface Horario {
  bloque:   Bloque;
  parejas:  number;
  /** Categorías con gente aquí, de más a menos, para la línea de detalle. */
  detalle:  { categoria: string; parejas: number; forzadas: number }[];
  /** Cuántas parejas MÁS caben. 0 = lleno. */
  caben:    number;
  /** Hay más gente de la que cabe: alguien se quedará sin grupo completo. */
  pasado:   boolean;
}

export default function BloquesScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();

  const [nombre, setNombre]       = useState('');
  const [datos, setDatos]         = useState<BloquesDelTorneo | null>(null);
  const [canchas, setCanchas]     = useState(0);
  const [parejas, setParejas]     = useState<FilaPareja[]>([]);
  const [elecciones, setElec]     = useState<FilaEleccion[]>([]);
  const [nombreCat, setNombreCat] = useState<Record<string, string>>({});
  const [cargando, setCargando]   = useState(true);

  const [asignando, setAsignando] = useState<Asignando | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorAsig, setErrorAsig] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    // Las elecciones se leen crudas y no por la RPC agregada: aquí hace falta
    // el detalle —cuáles se forzaron, cuáles apuntan a un horario que ya no
    // existe— y la RLS del organizador se lo permite. La RPC es para el jugador.
    const [reticula, { data: t }, { data: ps }, { data: cats }, elecRes] = await Promise.all([
      cargarBloquesDelTorneo(tournamentId),
      supabase.from('tournaments').select('name, courts').eq('id', tournamentId).maybeSingle(),
      supabase.from('pairs').select('id, category_id').eq('tournament_id', tournamentId),
      supabase.from('categories').select('id, display_name').eq('tournament_id', tournamentId),
      supabase
        .from('pair_block_choices')
        .select('pair_id, bloque_id, forzado')
        .eq('tournament_id', tournamentId),
    ]);

    setDatos(reticula);
    if (t) {
      setNombre((t as { name: string }).name);
      setCanchas((t as { courts: number | null }).courts ?? 0);
    }
    setParejas((ps ?? []) as FilaPareja[]);
    setElec(elecRes.data ?? []);
    setNombreCat(Object.fromEntries(
      ((cats ?? []) as { id: string; display_name: string }[]).map((c) => [c.id, c.display_name]),
    ));
    setCargando(false);
  }, [tournamentId]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  /**
   * Le da horario a las parejas de una categoría que no lo tienen.
   *
   * Va TODO el grupo de restos junto: son las que van a jugar entre ellas, y
   * repartirlas por horarios distintos las dejaría sin poder formar grupo.
   *
   * `forzado` sale del cupo en el momento de guardar, no de lo que la pantalla
   * pintó: entre que se abre el selector y se pulsa, otra pareja pudo llenar
   * ese horario.
   */
  async function asignarHorario(bloqueId: string, cupoAlElegir: number) {
    if (!asignando) return;
    setGuardando(true);
    setErrorAsig(null);

    const filas = asignando.pairIds.map((pair_id) => ({
      pair_id,
      tournament_id: tournamentId as string,
      bloque_id:     bloqueId,
      // Si no caben todas, la asignación es forzada: queda marcada para que la
      // pantalla pueda explicar después por qué ese horario está sobrevendido.
      forzado:       cupoAlElegir < asignando.pairIds.length,
    }));

    const { error } = await supabase
      .from('pair_block_choices')
      .upsert(filas, { onConflict: 'pair_id' });

    setGuardando(false);

    if (error) {
      console.error('[horarios] asignar:', error);
      setErrorAsig('No se pudo guardar. Intenta de nuevo.');
      return;
    }
    setAsignando(null);
    await cargar();
  }

  if (cargando) {
    return <View style={s.centro}><ActivityIndicator color={color.gold} /></View>;
  }

  // ── Cruce ─────────────────────────────────────────────────────────────────
  const catDe = new Map(parejas.map((p) => [p.id, p.category_id]));
  const bloques = datos?.bloques ?? [];
  const idsVivos = new Set(bloques.map((b) => b.id));

  const ocupacion: Ocupacion = {};
  const forzadas: Record<string, Record<string, number>> = {};
  const conHorario = new Set<string>();
  const huerfanas: FilaEleccion[] = [];

  for (const e of elecciones) {
    const cat = catDe.get(e.pair_id);
    if (!cat) continue;                       // pareja borrada: la fila se va en cascada
    conHorario.add(e.pair_id);
    if (!idsVivos.has(e.bloque_id)) { huerfanas.push(e); continue; }
    (ocupacion[e.bloque_id] ??= {})[cat] = ((ocupacion[e.bloque_id] ?? {})[cat] ?? 0) + 1;
    if (e.forzado) (forzadas[e.bloque_id] ??= {})[cat] = ((forzadas[e.bloque_id] ?? {})[cat] ?? 0) + 1;
  }

  const sinHorario = parejas.filter((p) => !conHorario.has(p.id));

  const porCategoria: Record<string, number> = {};
  for (const p of parejas) porCategoria[p.category_id] = (porCategoria[p.category_id] ?? 0) + 1;

  const tamanos = tamanosDeGrupo(porCategoria);
  const tamanoDe = (cat: string) => tamanos[cat] ?? 3;
  const opciones = { parejasPorGrupo: tamanos };

  const cap: Capacidad | null = datos?.reticula
    ? capacidadDelTorneo({ reticula: datos.reticula, canchas, parejasPorCategoria: porCategoria })
    : null;

  const nombreDeCat = (id: string) => nombreCat[id] ?? 'Categoría';

  // ── Los horarios, ya masticados ───────────────────────────────────────────
  const horarios: Horario[] = bloques.map((b) => {
    const ocup = ocupacion[b.id] ?? {};

    const detalle = Object.keys(ocup)
      .map((cat) => ({
        categoria: nombreDeCat(cat),
        parejas:   ocup[cat] ?? 0,
        forzadas:  (forzadas[b.id] ?? {})[cat] ?? 0,
      }))
      .filter((d) => d.parejas > 0)
      .sort((x, y) => y.parejas - x.parejas || x.categoria.localeCompare(y.categoria));

    // Cuántas parejas más caben: el mejor caso entre las categorías del torneo.
    // No es una división —una categoría de grupos de 4 necesita dos canchas por
    // grupo— así que se pregunta al motor por cada una y se toma el máximo.
    const candidatas = Object.keys(porCategoria);
    const caben = candidatas.length === 0
      ? 0
      : Math.max(...candidatas.map((cat) => cupoDeBloque(b, ocup, cat, opciones)));

    const usadas = Object.keys(ocup).reduce((a, cat) => {
      const n = ocup[cat] ?? 0;
      if (n <= 0) return a;
      const g = tamanoDe(cat);
      return a + Math.ceil(n / g) * carrilesDeGrupo(g);
    }, 0);

    return {
      bloque: b,
      parejas: detalle.reduce((a, d) => a + d.parejas, 0),
      detalle,
      caben,
      pasado: usadas > b.carriles,
    };
  });

  const dias: string[] = [];
  for (const b of bloques) if (!dias.includes(b.dia)) dias.push(b.dia);

  const seAlargan = horarios.filter((h) => h.bloque.seSaleDeLaVentana && h.parejas > 0);

  return (
    <SafeAreaView style={s.safe}>
      <BotonVolver texto={nombre || 'Torneo'} />

      <ScrollView contentContainerStyle={s.contenido}>
        <Text style={s.eyebrow}>FASE DE GRUPOS</Text>
        <Text style={s.titulo}>Horarios</Text>

        {/* ── 1. ¿Cabe? ──────────────────────────────────────────────────── */}
        {bloques.length === 0 ? (
          <View style={s.respuestaMala}>
            <Text style={s.respuestaTexto}>Todavía no hay horarios que ofrecer</Text>
            <Text style={s.respuestaNota}>
              {datos?.motivoSinBloques
                ?? 'Captura las canchas y las horas de juego del torneo.'}
              {' '}Mientras tanto la gente se inscribe igual: hay{' '}
              {parejas.length} pareja{parejas.length === 1 ? '' : 's'} esperando horario.
            </Text>
          </View>
        ) : cap && cap.faltanCarriles > 0 ? (
          <View style={s.respuestaMala}>
            <Text style={s.respuestaTexto}>
              No caben las {cap.inscritas} parejas en las horas que capturaste
            </Text>
            <Text style={s.respuestaNota}>
              Cualquiera de estas tres cosas lo arregla:
            </Text>
            {cap.palancas.map((p, i) => (
              <Text key={i} style={s.palanca}>·  {p}</Text>
            ))}
          </View>
        ) : (
          <View style={s.respuestaBuena}>
            <Text style={s.respuestaTexto}>
              Las {cap?.inscritas ?? parejas.length} parejas caben en el horario que capturaste
            </Text>
            <Text style={s.respuestaNota}>
              {sinHorario.length > 0
                ? `${sinHorario.length} todavía no eligió a qué hora jugar.`
                : 'Todas eligieron a qué hora jugar.'}
            </Text>
          </View>
        )}

        {/* ── 2. Los horarios ────────────────────────────────────────────── */}
        {dias.map((dia) => (
          <View key={dia} style={s.dia}>
            <Text style={s.diaNombre}>{formatearConDia(dia)}</Text>

            {horarios.filter((h) => h.bloque.dia === dia).map((h) => (
              <View key={h.bloque.id} style={[s.tarjeta, h.pasado && s.tarjetaPasada]}>
                <View style={s.fila}>
                  <View style={s.cifra}>
                    <Text style={[s.cifraNumero, h.parejas === 0 && s.cifraVacia]}>
                      {h.parejas}
                    </Text>
                    <Text style={s.cifraPie}>
                      {h.parejas === 1 ? 'pareja' : 'parejas'}
                    </Text>
                  </View>

                  <View style={s.textos}>
                    <Text style={s.hora}>
                      {horaLegible(h.bloque.desde)} a {horaLegible(h.bloque.hasta)}
                    </Text>

                    <Text style={[
                      s.estado,
                      h.caben === 0 && !h.pasado && s.estadoLleno,
                      h.pasado && s.estadoPasado,
                    ]}>
                      {h.pasado
                        ? 'Hay más parejas de las que caben'
                        : h.caben === 0
                        ? 'Lleno'
                        : `Caben ${h.caben} pareja${h.caben === 1 ? '' : 's'} más`}
                    </Text>

                    {h.bloque.seSaleDeLaVentana && h.parejas > 0 && (
                      <Text style={s.alarga}>
                        Suele terminar cerca de las {horaLegible(h.bloque.hastaRealista)}
                      </Text>
                    )}
                  </View>
                </View>

                {/* El desglose: secundario, en una sola línea. */}
                {h.detalle.length > 0 && (
                  <Text style={s.desglose} numberOfLines={2}>
                    {h.detalle.map((d) =>
                      `${d.categoria} ${d.parejas}${d.forzadas > 0 ? '*' : ''}`,
                    ).join('  ·  ')}
                  </Text>
                )}
              </View>
            ))}
          </View>
        ))}

        {horarios.some((h) => h.detalle.some((d) => d.forzadas > 0)) && (
          <Text style={s.nota}>
            * Parejas que metiste tú en un horario que ya estaba lleno.
          </Text>
        )}

        {/* ── 3. Lo que hay que mirar ────────────────────────────────────── */}
        {seAlargan.length > 0 && (
          <View style={s.caja}>
            <Text style={s.cajaTitulo}>
              {seAlargan.reduce((a, h) => a + h.parejas, 0)} parejas salen tarde
            </Text>
            <Text style={s.cajaTexto}>
              Tres partidos seguidos se alargan unos 45 minutos, así que estos
              horarios terminan después de la hora de cierre que capturaste:
            </Text>
            {seAlargan.map((h) => (
              <Text key={h.bloque.id} style={s.cajaLinea}>
                ·  {formatearConDia(h.bloque.dia)} a las {horaLegible(h.bloque.desde)} —
                {' '}termina cerca de las {horaLegible(h.bloque.hastaRealista)}
                {' · '}{h.parejas} pareja{h.parejas === 1 ? '' : 's'}
              </Text>
            ))}
            <Text style={s.cajaTexto}>
              Avisa al club y a esa gente, o alarga el día en Horarios.
            </Text>
          </View>
        )}

        {sinHorario.length > 0 && bloques.length > 0 && (
          <View style={s.cajaAccion}>
            <Text style={s.cajaTitulo}>
              {sinHorario.length} pareja{sinHorario.length === 1 ? '' : 's'} sin hora
            </Text>
            <Text style={s.cajaTexto}>
              Se inscribieron tarde, las metiste a mano, o su horario se llenó
              mientras elegían. Sin hora no se pueden cerrar: dales una.
            </Text>

            {Object.entries(
              sinHorario.reduce<Record<string, string[]>>((a, p) => {
                (a[p.category_id] ??= []).push(p.id); return a;
              }, {}),
            ).map(([cat, ids]) => (
              <View key={cat} style={s.filaAsignar}>
                <Text style={s.filaAsignarTexto}>
                  {nombreDeCat(cat)} · {ids.length} pareja{ids.length === 1 ? '' : 's'}
                </Text>
                <Pressable
                  onPress={() => {
                    setErrorAsig(null);
                    setAsignando({ categoryId: cat, categoria: nombreDeCat(cat), pairIds: ids });
                  }}
                  style={({ pressed }) => [s.btnAsignar, pressed && { opacity: 0.85 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Dar horario a ${ids.length} parejas de ${nombreDeCat(cat)}`}
                >
                  <Text style={s.btnAsignarTexto}>Dar horario</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {huerfanas.length > 0 && (
          <View style={s.caja}>
            <Text style={s.cajaTitulo}>
              {huerfanas.length} pareja{huerfanas.length === 1 ? '' : 's'} eligió una hora que ya no existe
            </Text>
            <Text style={s.cajaTexto}>
              Cambiaste las horas de juego después de que eligieran. Hay que
              darles una hora nueva.
            </Text>
            {[...new Set(huerfanas.map((h) => h.bloque_id))].map((id) => {
              const partes = partesDeBloqueId(id);
              const cuantas = huerfanas.filter((h) => h.bloque_id === id).length;
              return (
                <Text key={id} style={s.cajaLinea}>
                  ·  {partes ? `${formatearConDia(partes.dia)} a las ${horaLegible(partes.desde)}` : id}
                  {' — '}{cuantas} pareja{cuantas === 1 ? '' : 's'}
                </Text>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Dar horario ────────────────────────────────────────────────────
          `permitirLlenos`: el organizador SÍ puede meterlas en un horario
          lleno. Esa gente ya pagó y decirle que no cabe no es una respuesta;
          lo que se le debe es el aviso de la consecuencia, que lo pone el
          propio selector. */}
      <Modal
        visible={asignando !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setAsignando(null)}
      >
        <View style={s.overlay}>
          <View style={s.hoja}>
            <View style={s.hojaCabecera}>
              <View style={s.hojaTextos}>
                <Text style={s.hojaTitulo}>{asignando?.categoria}</Text>
                <Text style={s.hojaSub}>
                  {asignando?.pairIds.length} pareja
                  {asignando?.pairIds.length === 1 ? '' : 's'} sin hora
                </Text>
              </View>
              <Pressable
                onPress={() => setAsignando(null)}
                style={s.hojaCerrar}
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
              >
                <Text style={s.hojaCerrarTexto}>Cancelar</Text>
              </Pressable>
            </View>

            {guardando ? (
              <View style={s.hojaCargando}>
                <ActivityIndicator color={color.gold} />
                <Text style={s.cajaTexto}>Guardando…</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={s.hojaCuerpo}>
                {errorAsig && <Text style={s.hojaError}>{errorAsig}</Text>}

                <Text style={s.cajaTexto}>
                  Van todas al mismo horario: son las que van a jugar entre
                  ellas, y repartirlas las dejaría sin grupo.
                </Text>

                {asignando && (
                  <SelectorDeBloque
                    bloques={bloques}
                    ocupacion={ocupacion}
                    categoriaId={asignando.categoryId}
                    valor={null}
                    pregunta={`¿Qué horario les das?`}
                    opcionesCupo={opciones}
                    minutosPorHorario={datos?.reticula?.minutosPorBloque}
                    permitirLlenos
                    onCambio={(id, cupo) => { void asignarHorario(id, cupo); }}
                  />
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: color.bg },
  centro:    { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  contenido: { paddingHorizontal: space[4.5], paddingBottom: bottomInset, gap: space[4], ...webContentColumn },

  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne, letterSpacing: 2 },
  titulo:  { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },

  // 1 · La respuesta
  respuestaBuena: {
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.live,
    borderRadius: radius.lg, padding: space[4], gap: space[1],
  },
  respuestaMala: {
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.alive,
    borderRadius: radius.lg, padding: space[4], gap: space[1.5],
  },
  respuestaTexto: { fontFamily: font.display, fontSize: fontSize.h1Inline, color: color.text, lineHeight: 25 },
  respuestaNota:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },
  palanca:        { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, lineHeight: 18 },

  // 2 · Los horarios
  dia:       { gap: space[2] },
  diaNombre: {
    fontFamily: font.display, fontSize: fontSize.section, color: color.champagne,
    letterSpacing: 1.2, textTransform: 'uppercase',
  },

  tarjeta: {
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft,
    borderRadius: radius.md, paddingVertical: space[3], paddingHorizontal: space[3.5],
    gap: space[2],
  },
  tarjetaPasada: { borderColor: color.danger },

  fila:  { flexDirection: 'row', alignItems: 'center', gap: space[3.5] },
  cifra: { alignItems: 'center', minWidth: 52 },
  // El número grande son PAREJAS. Es lo que el organizador cuenta.
  cifraNumero: { fontFamily: font.display, fontSize: fontSize.displayL, color: color.goldBright, lineHeight: 46 },
  cifraVacia:  { color: color.muted, opacity: 0.5 },
  cifraPie:    { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, marginTop: -4 },

  textos: { flex: 1, gap: space[1] },
  hora:   { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  estado: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  estadoLleno:  { color: color.champagne },
  estadoPasado: { color: color.danger },
  alarga: { fontFamily: font.body, fontSize: fontSize.caption, color: color.alive },

  desglose: {
    fontFamily: font.body, fontSize: fontSize.caption, color: color.muted,
    lineHeight: 17, borderTopWidth: 1, borderTopColor: color.lineSoft, paddingTop: space[2],
  },
  nota: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, opacity: 0.8, marginTop: -space[2] },

  // 3 · Lo que hay que mirar
  caja:       { backgroundColor: color.surface2, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, padding: space[3.5], gap: space[1.5] },
  // Ámbar: esto no es un aviso que se lee, es uno que se acciona.
  cajaAccion: { backgroundColor: color.surface2, borderWidth: 1, borderColor: color.alive, borderRadius: radius.md, padding: space[3.5], gap: space[2] },

  filaAsignar:      { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: touchTarget - 8 },
  filaAsignarTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.text, flex: 1 },
  btnAsignar:       { borderWidth: 1, borderColor: color.gold, borderRadius: radius.sm, paddingHorizontal: space[3], paddingVertical: space[2] },
  btnAsignarTexto:  { fontFamily: font.body, fontSize: fontSize.caption, fontWeight: '600', color: color.gold },

  overlay: { flex: 1, backgroundColor: 'rgba(6,6,8,0.82)', justifyContent: 'flex-end' },
  hoja: {
    backgroundColor: color.bg, borderTopWidth: 1, borderTopColor: color.gold,
    borderTopLeftRadius: radius.xl2, borderTopRightRadius: radius.xl2,
    maxHeight: '85%', paddingTop: space[4],
  },
  hojaCabecera: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4.5], gap: space[3] },
  hojaTextos:   { flex: 1 },
  hojaTitulo:   { fontFamily: font.display, fontSize: fontSize.h1Inline, color: color.text },
  hojaSub:      { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  hojaCerrar:   { minHeight: touchTarget, justifyContent: 'center' },
  hojaCerrarTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  hojaCuerpo:   { paddingHorizontal: space[4.5], paddingTop: space[3], paddingBottom: bottomInset, gap: space[3] },
  hojaCargando: { padding: space[6], alignItems: 'center', gap: space[3] },
  hojaError:    { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger },
  cajaTitulo: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  cajaTexto:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },
  cajaLinea:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, lineHeight: 18 },
});
