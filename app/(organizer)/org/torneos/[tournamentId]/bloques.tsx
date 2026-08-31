/**
 * RALLY · Ocupación por bloque (organizador)
 *
 * QUÉ RESPONDE
 *   Cuántas parejas lleva cada bloque, de qué categorías, y cuánto cupo queda.
 *   Y arriba, la única pregunta que de verdad urge: ¿cabe la gente que se está
 *   inscribiendo?
 *
 * EL AVISO LLEGA MIENTRAS SE INSCRIBEN, NO AL CERRAR
 *   Enterarse el viernes de que hay 20 parejas más de las que caben ya no tiene
 *   arreglo: las canchas se apalabran con días de anticipación. Por eso el
 *   aviso vive aquí y en la fila del panel, y aparece en cuanto la inscripción
 *   pasa de la capacidad — no al generar los grupos.
 *
 * LA CUENTA ES EN CARRILES, NO EN LUGARES
 *   Un grupo son 3 parejas de la MISMA categoría y ocupa un carril entero. Una
 *   categoría con 4 parejas gasta DOS carriles. Medir en "lugares libres" diría
 *   que caben y no es verdad. Ver `capacidadDelTorneo`.
 *
 * BLOQUES QUE SE VAN DE HORA
 *   El de 20:00 a 23:00 termina de verdad cerca de las 23:45. Es elegible y la
 *   gente lo elige, así que aquí lo que importa es CUÁNTA: si el sábado a las
 *   20:00 hay 24 parejas, eso son 24 parejas saliendo del club a medianoche, y
 *   es un dato que el organizador quiere tener antes del torneo y no durante.
 *
 * BLOQUES QUE YA NO EXISTEN
 *   `bloque_id` es derivado de las ventanas del torneo. Si el organizador
 *   cambia los horarios, hay elecciones apuntando a bloques que desaparecieron.
 *   No es un error de datos: es gente que hay que reubicar, y sale listada como
 *   tal al final.
 */

import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { carrilesDeGrupo, type Ocupacion } from '@/lib/engine/schedule/bloques';
import { cargarBloquesDelTorneo, type BloquesDelTorneo } from '@/lib/bloques-torneo';
import {
  capacidadDelTorneo, tamanosDeGrupo, horaLegible, partesDeBloqueId, type Capacidad,
} from '@/lib/bloques-formato';
import { formatearConDia } from '@/lib/fechas';
import { color, radius, space, font, fontSize } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';

// ── Modelo ──────────────────────────────────────────────────────────────────

interface FilaPareja  { id: string; category_id: string }
interface FilaEleccion { pair_id: string; bloque_id: string; forzado: boolean }

/** Lo que se pinta de un bloque: cuántas parejas y de qué categorías. */
interface Renglon {
  categoria: string;
  parejas:   number;
  forzadas:  number;
  /** Parejas por grupo de esa categoría. 3 casi siempre, 4 en las chicas. */
  tamanoGrupo: number;
  grupos:    number;
  carriles:  number;
  /** Parejas que le faltan al último grupo para cerrar. 0 si cierra justo. */
  faltan:    number;
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

  const cargar = useCallback(async () => {
    // Las elecciones se leen crudas y no por la RPC agregada: el organizador
    // necesita el detalle (cuáles son forzadas, cuáles apuntan a bloques
    // muertos) y su RLS se lo permite. La RPC existe para el jugador.
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

  if (cargando) {
    return <View style={s.centro}><ActivityIndicator color={color.gold} /></View>;
  }

  // ── Cruce ─────────────────────────────────────────────────────────────────
  const catDe = new Map(parejas.map((p) => [p.id, p.category_id]));
  const idsDeBloque = new Set((datos?.bloques ?? []).map((b) => b.id));

  /** ocupacion[bloque][categoria] = parejas. Lo que come `cupoDeBloque`. */
  const ocupacion: Ocupacion = {};
  /** Igual, pero contando solo las forzadas. */
  const forzadas: Record<string, Record<string, number>> = {};
  const elegidos = new Set<string>();
  const huerfanas: FilaEleccion[] = [];

  for (const e of elecciones) {
    const cat = catDe.get(e.pair_id);
    if (!cat) continue;               // pareja borrada; la fila se va en cascada
    elegidos.add(e.pair_id);
    if (!idsDeBloque.has(e.bloque_id)) { huerfanas.push(e); continue; }
    (ocupacion[e.bloque_id] ??= {})[cat] = ((ocupacion[e.bloque_id] ?? {})[cat] ?? 0) + 1;
    if (e.forzado) (forzadas[e.bloque_id] ??= {})[cat] = ((forzadas[e.bloque_id] ?? {})[cat] ?? 0) + 1;
  }

  const sinBloque = parejas.filter((p) => !elegidos.has(p.id));

  const porCategoria: Record<string, number> = {};
  for (const p of parejas) porCategoria[p.category_id] = (porCategoria[p.category_id] ?? 0) + 1;

  /**
   * Tamaño de grupo por categoría, con las parejas que el organizador SÍ puede
   * contar (todas, incluidas las 'pending'). El jugador ve el mismo cálculo
   * sobre el agregado público, que excluye las pendientes: aquí la cifra es la
   * fina, y es la que manda para avisar de que no cabe.
   */
  const tamanos = tamanosDeGrupo(porCategoria);
  const tamanoDe = (cat: string) => tamanos[cat] ?? 3;

  const cap: Capacidad | null = datos?.reticula
    ? capacidadDelTorneo({ reticula: datos.reticula, canchas, parejasPorCategoria: porCategoria })
    : null;

  const dias: string[] = [];
  for (const b of datos?.bloques ?? []) if (!dias.includes(b.dia)) dias.push(b.dia);

  const nombreDeCat = (id: string) => nombreCat[id] ?? 'Categoría';

  return (
    <SafeAreaView style={s.safe}>
      <BotonVolver texto={nombre || 'Torneo'} />

      <ScrollView contentContainerStyle={s.contenido}>
        <Text style={s.eyebrow}>FASE DE GRUPOS</Text>
        <Text style={s.titulo}>Ocupación por bloque</Text>
        <Text style={s.subtitulo}>
          Cada bloque son {datos?.reticula ? datos.reticula.minutosPorBloque / 60 : 3} horas
          seguidas en una cancha: los 3 partidos de un grupo. Un carril = un grupo.
        </Text>

        {/* ── Sin configuración: no hay nada que ocupar ─────────────────── */}
        {!datos?.reticula || datos.bloques.length === 0 ? (
          <View style={s.cajaAviso}>
            <Text style={s.avisoTitulo}>Todavía no hay bloques</Text>
            <Text style={s.avisoTexto}>
              {datos?.motivoSinBloques
                ?? 'Captura las canchas y los horarios del torneo para generar los bloques.'}
            </Text>
            <Text style={s.avisoTexto}>
              Mientras tanto la gente se puede inscribir igual: quedan
              {' '}{parejas.length} pareja{parejas.length === 1 ? '' : 's'} sin bloque, y les
              podrás asignar uno en cuanto captures la configuración.
            </Text>
          </View>
        ) : (
          <>
            {/* ── Capacidad ─────────────────────────────────────────────── */}
            {cap && (
              <View style={[s.cajaTotal, cap.faltanCarriles > 0 && s.cajaTotalAlerta]}>
                <View style={s.totalFila}>
                  <View style={s.totalCelda}>
                    <Text style={s.totalCifra}>{cap.inscritas}</Text>
                    <Text style={s.totalPie}>parejas inscritas</Text>
                  </View>
                  <View style={s.totalCelda}>
                    <Text style={s.totalCifra}>{cap.capacidadParejas}</Text>
                    <Text style={s.totalPie}>lugares en {datos.bloques.length} bloques</Text>
                  </View>
                  <View style={s.totalCelda}>
                    <Text style={[
                      s.totalCifra,
                      cap.faltanCarriles > 0 && s.totalCifraAlerta,
                    ]}>
                      {cap.carrilesNecesarios}/{cap.capacidadCarriles}
                    </Text>
                    <Text style={s.totalPie}>carriles usados</Text>
                  </View>
                </View>

                {cap.faltanCarriles > 0 ? (
                  <View style={s.alerta}>
                    <Text style={s.alertaTitulo}>
                      No caben: faltan {cap.faltanCarriles} carril
                      {cap.faltanCarriles === 1 ? '' : 'es'}
                    </Text>
                    <Text style={s.alertaTexto}>
                      Se cuenta en carriles porque un grupo son 3 parejas de la
                      misma categoría y ocupa una cancha entera durante todo el
                      bloque. Cualquiera de estas tres cosas lo resuelve:
                    </Text>
                    {cap.palancas.map((p, i) => (
                      <Text key={i} style={s.alertaPalanca}>·  {p}</Text>
                    ))}
                  </View>
                ) : (
                  <Text style={s.holgura}>
                    Cabe con {cap.capacidadCarriles - cap.carrilesNecesarios} carril
                    {cap.capacidadCarriles - cap.carrilesNecesarios === 1 ? '' : 'es'} de holgura.
                  </Text>
                )}
              </View>
            )}

            {/* ── Los que se van de hora ────────────────────────────────── */}
            {(() => {
              const tarde = datos.bloques
                .filter((b) => b.seSaleDeLaVentana)
                .map((b) => ({
                  bloque: b,
                  parejas: Object.values(ocupacion[b.id] ?? {}).reduce((a, n) => a + n, 0),
                }))
                .filter((x) => x.parejas > 0);

              if (tarde.length === 0) return null;
              const total = tarde.reduce((a, x) => a + x.parejas, 0);

              return (
                <View style={s.cajaTarde}>
                  <Text style={s.tardeTitulo}>
                    {total} pareja{total === 1 ? '' : 's'} en horarios que se alargan
                  </Text>
                  <Text style={s.avisoTexto}>
                    Tres partidos seguidos en una cancha se alargan unos 45 minutos.
                    Estos bloques acaban después del cierre que capturaste:
                  </Text>
                  {tarde.map(({ bloque, parejas }) => (
                    <Text key={bloque.id} style={s.avisoLinea}>
                      ·  {formatearConDia(bloque.dia)} {horaLegible(bloque.desde)} —
                      {' '}termina cerca de las {horaLegible(bloque.hastaRealista)}
                      {' · '}{parejas} pareja{parejas === 1 ? '' : 's'}
                    </Text>
                  ))}
                  <Text style={s.avisoTexto}>
                    No hay que quitarlos: en el Cimepa real se jugó a las 22:00 y
                    funcionó. Sí conviene avisar al club y a esa gente, o alargar
                    la ventana del día en Horarios.
                  </Text>
                </View>
              );
            })()}

            {/* ── Bloque a bloque ───────────────────────────────────────── */}
            {dias.map((dia) => (
              <View key={dia} style={s.dia}>
                <Text style={s.diaNombre}>{formatearConDia(dia)}</Text>

                {datos.bloques.filter((b) => b.dia === dia).map((b) => {
                  const ocup = ocupacion[b.id] ?? {};
                  const renglones: Renglon[] = Object.keys(ocup)
                    .map((cat) => {
                      const parejas = ocup[cat] ?? 0;
                      const g = tamanoDe(cat);
                      const grupos = Math.ceil(parejas / g);
                      return {
                        categoria: nombreDeCat(cat),
                        parejas,
                        forzadas: (forzadas[b.id] ?? {})[cat] ?? 0,
                        tamanoGrupo: g,
                        grupos,
                        // Un grupo de 4 son 6 partidos: DOS carriles, no uno.
                        carriles: grupos * carrilesDeGrupo(g),
                        faltan: parejas % g === 0 ? 0 : g - (parejas % g),
                      };
                    })
                    .sort((x, y) => y.parejas - x.parejas);

                  const total = renglones.reduce((a, r) => a + r.parejas, 0);
                  const carriles = renglones.reduce((a, r) => a + r.carriles, 0);
                  const sobrevendido = carriles > b.carriles;

                  // Se dice en CARRILES libres y no en "quedan N lugares": los
                  // lugares dependen de qué categoría pregunte —una de grupos
                  // de 4 gasta dos carriles por grupo—, así que un solo número
                  // de parejas sería falso para alguna.
                  const libres = Math.max(0, b.carriles - carriles);

                  return (
                    <View key={b.id} style={[s.bloque, sobrevendido && s.bloqueAlerta]}>
                      <View style={s.bloqueCabecera}>
                        <Text style={s.bloqueHora}>{horaLegible(b.desde)}</Text>
                        <Text style={s.bloqueRango}>
                          a {horaLegible(b.hasta)}
                          {b.seSaleDeLaVentana && (
                            <Text style={s.bloqueTarde}> · real {horaLegible(b.hastaRealista)}</Text>
                          )}
                        </Text>
                        <View style={s.bloqueDerecha}>
                          <Text style={[s.bloqueCarriles, sobrevendido && s.textoAlerta]}>
                            {carriles}/{b.carriles} carriles
                          </Text>
                          <Text style={s.bloqueCupo}>
                            {total} pareja{total === 1 ? '' : 's'} ·{' '}
                            {libres === 0
                              ? 'lleno'
                              : `${libres} carril${libres === 1 ? '' : 'es'} libre${libres === 1 ? '' : 's'}`}
                          </Text>
                        </View>
                      </View>

                      {renglones.length === 0 ? (
                        <Text style={s.bloqueVacio}>Nadie lo ha elegido todavía.</Text>
                      ) : (
                        <View style={s.categorias}>
                          {renglones.map((r) => (
                            <View key={r.categoria} style={s.catFila}>
                              <Text style={s.catNombre} numberOfLines={1}>{r.categoria}</Text>
                              <Text style={s.catDato}>
                                {r.parejas} · {r.grupos} grupo{r.grupos === 1 ? '' : 's'} de {r.tamanoGrupo}
                                {r.carriles !== r.grupos && ` · ${r.carriles} carriles`}
                                {r.faltan > 0 && ` (falta${r.faltan === 1 ? '' : 'n'} ${r.faltan})`}
                                {r.forzadas > 0 && ` · ${r.forzadas} forzada${r.forzadas === 1 ? '' : 's'}`}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {sobrevendido && (
                        <Text style={s.textoAlerta}>
                          Sobrevendido: necesita {carriles} canchas y solo hay {b.carriles}.
                          {' '}Mueve parejas a otro bloque o abre otra cancha en este horario.
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
          </>
        )}

        {/* ── Pendientes ────────────────────────────────────────────────── */}
        {sinBloque.length > 0 && datos?.bloques.length ? (
          <View style={s.cajaAviso}>
            <Text style={s.avisoTitulo}>
              {sinBloque.length} pareja{sinBloque.length === 1 ? '' : 's'} sin bloque
            </Text>
            <Text style={s.avisoTexto}>
              Se inscribieron antes de que hubiera horarios, o el apartado falló.
              No tienen hora asignada todavía.
            </Text>
            {Object.entries(
              sinBloque.reduce<Record<string, number>>((a, p) => {
                a[p.category_id] = (a[p.category_id] ?? 0) + 1; return a;
              }, {}),
            ).map(([cat, n]) => (
              <Text key={cat} style={s.avisoLinea}>·  {nombreDeCat(cat)}: {n}</Text>
            ))}
          </View>
        ) : null}

        {huerfanas.length > 0 && (
          <View style={s.cajaAviso}>
            <Text style={s.avisoTitulo}>
              {huerfanas.length} elección{huerfanas.length === 1 ? '' : 'es'} apunta
              {huerfanas.length === 1 ? '' : 'n'} a un bloque que ya no existe
            </Text>
            <Text style={s.avisoTexto}>
              Cambiaste los horarios o las canchas después de que eligieran. Esas
              parejas hay que reubicarlas.
            </Text>
            {[...new Set(huerfanas.map((h) => h.bloque_id))].map((id) => {
              const partes = partesDeBloqueId(id);
              const cuantas = huerfanas.filter((h) => h.bloque_id === id).length;
              return (
                <Text key={id} style={s.avisoLinea}>
                  ·  {partes ? `${formatearConDia(partes.dia)} a las ${horaLegible(partes.desde)}` : id}
                  {' — '}{cuantas} pareja{cuantas === 1 ? '' : 's'}
                </Text>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: color.bg },
  centro:    { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  contenido: { paddingHorizontal: space[4.5], paddingBottom: bottomInset, gap: space[4], ...webContentColumn },

  eyebrow:   { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne, letterSpacing: 2 },
  titulo:    { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },
  subtitulo: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },

  // Capacidad
  cajaTotal: {
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.line,
    borderRadius: radius.lg, padding: space[4], gap: space[3],
  },
  cajaTotalAlerta: { borderColor: color.danger },
  totalFila:       { flexDirection: 'row', gap: space[3] },
  totalCelda:      { flex: 1, gap: space[1] },
  totalCifra:      { fontFamily: font.display, fontSize: fontSize.metric, color: color.goldBright },
  totalCifraAlerta:{ color: color.danger },
  totalPie:        { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 15 },

  holgura: { fontFamily: font.body, fontSize: fontSize.caption, color: color.live },

  alerta:        { gap: space[1.5], borderTopWidth: 1, borderTopColor: color.lineSoft, paddingTop: space[3] },
  alertaTitulo:  { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.danger },
  alertaTexto:   { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },
  alertaPalanca: { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, lineHeight: 18 },

  // Bloques
  dia:       { gap: space[2] },
  diaNombre: { fontFamily: font.display, fontSize: fontSize.section, color: color.champagne, letterSpacing: 1.2, textTransform: 'uppercase' },

  bloque: {
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft,
    borderRadius: radius.md, padding: space[3.5], gap: space[2],
  },
  bloqueAlerta:    { borderColor: color.danger },
  bloqueCabecera:  { flexDirection: 'row', alignItems: 'baseline', gap: space[2] },
  bloqueHora:      { fontFamily: font.display, fontSize: fontSize.h1Inline, color: color.text },
  bloqueRango:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, flex: 1 },
  bloqueDerecha:   { alignItems: 'flex-end' },
  bloqueCarriles:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne },
  bloqueCupo:      { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  bloqueVacio:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, opacity: 0.7 },

  categorias: { gap: space[1] },
  catFila:    { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  catNombre:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.text, flex: 1 },
  catDato:    { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },

  textoAlerta: { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, lineHeight: 17 },

  cajaTarde:   { backgroundColor: color.surface, borderWidth: 1, borderColor: color.alive, borderRadius: radius.md, padding: space[3.5], gap: space[1.5] },
  tardeTitulo: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.alive },
  bloqueTarde: { fontFamily: font.body, fontSize: fontSize.caption, color: color.alive },

  // Avisos
  cajaAviso:   { backgroundColor: color.surface2, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, padding: space[3.5], gap: space[1.5] },
  avisoTitulo: { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.text },
  avisoTexto:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },
  avisoLinea:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, lineHeight: 18 },
});
