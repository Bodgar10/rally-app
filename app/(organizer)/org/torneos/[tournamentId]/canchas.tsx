/**
 * RALLY · Canchas del torneo
 *
 * POR QUÉ VA EN EL TORNEO Y NO EN LA SEDE
 *   Un club con 6 canchas puede cederle 3 al organizador, o 8 un fin de semana
 *   y 4 el siguiente. La capacidad es del EVENTO, no del lugar.
 *
 * ERA UN CONTADOR DEL 1 AL 30, Y ESO NO SABÍA DECIR DÓNDE ESTÁN
 *   Mundo Pádel juega su aniversario en DOS sucursales a la vez: Narvarte con
 *   2 canchas y Alberca Olímpica con 3. Con un número, el jugador leía
 *   "Cancha 4" sin saber a qué sucursal ir — que es exactamente el problema
 *   que esta app existe para resolver.
 *
 *   Ahora es una lista. Un torneo de una sola sede sigue siendo el caso fácil:
 *   se añaden canchas y se llaman Cancha 1, 2, 3 como siempre.
 *
 * LAS REGLAS VIVEN EN `@/lib/canchas-editor`
 *   Nombres repetidos, vacíos, demasiado largos y el orden que se guarda. Cada
 *   una se equivoca de una forma distinta y dentro de un `useState` no se
 *   prueban.
 */

import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useVolver } from '@/hooks/useVolver';

import { supabase } from '@/lib/supabase/client';
import { cumplirPaso } from '@/lib/guia-store';
import {
  problemasDeCanchas, textoDelProblema, paraGuardar, nombreLibre,
  type CanchaEditada,
} from '@/lib/canchas-editor';
import { color, radius, space, font, fontSize, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';

interface Sede { id: string; name: string; city: string | null }

export default function CanchasScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const volver = useVolver();

  const [nombre, setNombre]   = useState('');
  const [canchas, setCanchas] = useState<CanchaEditada[]>([]);
  /** La sede del torneo. Las canchas sin `venueId` son suyas. */
  const [sedeTorneo, setSedeTorneo] = useState<Sede | null>(null);
  /** Las demás sucursales que se pueden usar. */
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [eligiendoSede, setEligiendoSede] = useState(false);
  const [cargando, setCargando]   = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [torneoRes, canchasRes, sedesRes] = await Promise.all([
      supabase
        .from('tournaments')
        .select('name, venue_id, venues:venue_id ( id, name, city )')
        .eq('id', tournamentId)
        .maybeSingle(),
      supabase
        .from('tournament_courts')
        .select('nombre, venue_id')
        .eq('tournament_id', tournamentId)
        .order('orden'),
      supabase.from('venues').select('id, name, city').order('name'),
    ]);

    const t = torneoRes.data as unknown as {
      name: string; venue_id: string | null; venues: Sede | null;
    } | null;

    if (t) {
      setNombre(t.name);
      setSedeTorneo(t.venues);
    }
    setSedes((sedesRes.data ?? []) as Sede[]);
    setCanchas(
      ((canchasRes.data ?? []) as Array<{ nombre: string; venue_id: string | null }>)
        .map((c) => ({ nombre: c.nombre, venueId: c.venue_id })),
    );
    setCargando(false);
  }, [tournamentId]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  /** Las sucursales presentes en la lista, en el orden en que aparecen. */
  const sedesUsadas: (string | null)[] = [];
  for (const c of canchas) if (!sedesUsadas.includes(c.venueId)) sedesUsadas.push(c.venueId);
  // Con la lista vacía se arranca por la sede del torneo, que es lo normal.
  if (sedesUsadas.length === 0) sedesUsadas.push(null);

  const nombreDeSede = (id: string | null): string | null => {
    if (id === null) return sedeTorneo?.name ?? null;
    return sedes.find((s) => s.id === id)?.name ?? null;
  };

  function anadir(venueId: string | null) {
    setError(null);
    setCanchas((prev) => {
      const propuesto = nombreLibre(prev, nombreDeSede(venueId));
      // La nueva va junto a las de su sede, no al final de todo: el orden que
      // se guarda sale de la posición, y el planificador recorre una sucursal
      // entera antes de pasar a la siguiente.
      const ultima = prev.map((c) => c.venueId).lastIndexOf(venueId);
      const fila = { nombre: propuesto, venueId };
      if (ultima === -1) return [...prev, fila];
      return [...prev.slice(0, ultima + 1), fila, ...prev.slice(ultima + 1)];
    });
  }

  function renombrar(indice: number, texto: string) {
    setError(null);
    setCanchas((prev) => prev.map((c, i) => (i === indice ? { ...c, nombre: texto } : c)));
  }

  function quitar(indice: number) {
    setError(null);
    setCanchas((prev) => prev.filter((_, i) => i !== indice));
  }

  async function guardar() {
    const problemas = problemasDeCanchas(canchas);
    if (problemas.length > 0) {
      setError(textoDelProblema(problemas[0]));
      return;
    }
    if (canchas.length === 0) {
      setError('Hace falta al menos una cancha.');
      return;
    }

    setError(null);
    setGuardando(true);

    // SE BORRA Y SE REINSERTA, como las ventanas horarias (044). Un upsert
    // dejaría vivas las canchas de una configuración anterior, y el orden es
    // semántico: el planificador reparte siguiéndolo.
    const { error: eBorrar } = await supabase
      .from('tournament_courts').delete().eq('tournament_id', tournamentId);

    if (eBorrar) {
      setGuardando(false);
      console.error('[canchas] borrar:', eBorrar.message);
      setError('No se pudo guardar. Intenta de nuevo.');
      return;
    }

    const { error: eInsertar } = await supabase
      .from('tournament_courts')
      .insert(paraGuardar(canchas).map((c) => ({ ...c, tournament_id: tournamentId })));

    setGuardando(false);

    if (eInsertar) {
      console.error('[canchas] insertar:', eInsertar.message);
      setError('No se pudo guardar. Intenta de nuevo.');
      return;
    }
    cumplirPaso('canchas-guardadas');
    volver();
  }

  if (cargando) {
    return <View style={s.centro}><ActivityIndicator color={color.gold} /></View>;
  }

  /** Sucursales que todavía no están en la lista. */
  const disponibles = sedes.filter(
    (v) => v.id !== sedeTorneo?.id && !sedesUsadas.includes(v.id),
  );

  return (
    <SafeAreaView style={s.safe}>
      <BotonVolver texto={nombre || 'Torneo'} />

      <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
        <Text style={s.eyebrow}>CONFIGURACIÓN</Text>
        <Text style={s.titulo}>Canchas</Text>
        <Text style={s.subtitulo}>
          Las que de verdad vas a usar, no las que tiene el club. El nombre que
          pongas es el que va a leer el jugador en su partido.
        </Text>

        {sedesUsadas.map((venueId) => {
          const deEstaSede = canchas
            .map((c, i) => ({ c, i }))
            .filter((x) => x.c.venueId === venueId);
          const titulo = nombreDeSede(venueId);

          return (
            <View key={venueId ?? 'principal'} style={s.sede}>
              {/* La cabecera solo con más de una sucursal: en un torneo normal
                  no hay nada que distinguir y sobra el renglón. */}
              {sedesUsadas.length > 1 && (
                <Text style={s.sedeTitulo}>
                  {(titulo ?? 'Sede del torneo').toUpperCase()}
                  {venueId === null ? ' · aquí se juegan las eliminatorias' : ''}
                </Text>
              )}

              {deEstaSede.map(({ c, i }) => (
                <View key={i} style={s.fila}>
                  <TextInput
                    value={c.nombre}
                    onChangeText={(t) => renombrar(i, t)}
                    style={s.input}
                    placeholder="Nombre de la cancha"
                    placeholderTextColor={color.muted}
                    maxLength={40}
                    accessibilityLabel={`Nombre de la cancha ${i + 1}`}
                  />
                  <Pressable
                    onPress={() => quitar(i)}
                    style={({ pressed }) => [s.quitar, pressed && { opacity: 0.6 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar ${c.nombre}`}
                  >
                    <Text style={s.quitarTexto}>✕</Text>
                  </Pressable>
                </View>
              ))}

              <Pressable
                onPress={() => anadir(venueId)}
                style={({ pressed }) => [s.anadir, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel={titulo ? `Añadir cancha en ${titulo}` : 'Añadir cancha'}
              >
                <Text style={s.anadirTexto}>+ Añadir cancha</Text>
              </Pressable>
            </View>
          );
        })}

        {/* ── OTRA SUCURSAL ────────────────────────────────────────────
            Solo si hay alguna más en el catálogo. Ofrecer el botón sin sitios
            que elegir manda al organizador a un callejón. */}
        {disponibles.length > 0 && (
          eligiendoSede ? (
            <View style={s.nota}>
              <Text style={s.notaTexto}>
                ¿En qué otra sucursal se juega? Los grupos se reparten entre las
                dos; las eliminatorias se juegan todas en la sede del torneo.
              </Text>
              {disponibles.map((v) => (
                <Pressable
                  key={v.id}
                  onPress={() => { anadir(v.id); setEligiendoSede(false); }}
                  style={({ pressed }) => [s.opcionSede, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                >
                  <Text style={s.opcionSedeTexto}>{v.name}</Text>
                  {v.city && <Text style={s.opcionSedeCiudad}>{v.city}</Text>}
                </Pressable>
              ))}
              <Pressable onPress={() => setEligiendoSede(false)} accessibilityRole="button">
                <Text style={s.cancelar}>Cancelar</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => setEligiendoSede(true)}
              style={({ pressed }) => [s.anadir, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
            >
              <Text style={s.anadirTexto}>+ Añadir otra sucursal</Text>
            </Pressable>
          )
        )}

        <View style={s.nota}>
          <Text style={s.notaTexto}>
            {canchas.length === 0
              ? 'Todavía no hay canchas. Sin ellas no se puede calcular si el torneo cabe.'
              : `${canchas.length} ${canchas.length === 1 ? 'cancha' : 'canchas'} en total. `
                + 'Con esto y los horarios calculamos cuántos partidos caben y te avisamos '
                + 'si el torneo no entra en los días que tienes.'}
          </Text>
        </View>

        {error && <Text style={s.error}>{error}</Text>}

        <Pressable
          onPress={guardar}
          disabled={guardando}
          style={({ pressed }) => [s.btn, guardando && s.btnInerte, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          {guardando
            ? <ActivityIndicator color={color.onGold} />
            : <Text style={s.btnTexto}>Guardar</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: color.bg },
  centro:    { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  contenido: { paddingHorizontal: space[4.5], paddingBottom: bottomInset, gap: space[3], ...webContentColumn },

  eyebrow:   { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne, letterSpacing: 2 },
  titulo:    { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },
  subtitulo: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 21 },

  sede:       { gap: space[2], marginTop: space[2] },
  sedeTitulo: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne, letterSpacing: 1.4 },

  fila:  { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  input: {
    flex: 1, minHeight: touchTarget,
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.line,
    borderRadius: radius.sm, paddingHorizontal: space[3],
    fontFamily: font.body, fontSize: fontSize.body, color: color.text,
  },
  quitar: {
    width: 44, height: 44, borderRadius: radius.sm,
    borderWidth: 1, borderColor: color.lineSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  quitarTexto: { fontFamily: font.body, fontSize: 16, color: color.muted },

  anadir: {
    minHeight: touchTarget, borderRadius: radius.sm,
    borderWidth: 1, borderColor: color.goldMuted, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  anadirTexto: { fontFamily: font.body, fontSize: fontSize.body, color: color.gold },

  opcionSede: {
    minHeight: touchTarget, justifyContent: 'center',
    borderTopWidth: 1, borderTopColor: color.lineSoft, paddingVertical: space[2],
  },
  opcionSedeTexto:  { fontFamily: font.body, fontSize: fontSize.body, color: color.text },
  opcionSedeCiudad: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  cancelar: {
    fontFamily: font.body, fontSize: fontSize.caption, color: color.muted,
    textAlign: 'center', paddingTop: space[2],
  },

  nota:      { backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, padding: space[3], gap: space[1] },
  notaTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 17 },

  error:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, textAlign: 'center' },

  btn:       { backgroundColor: color.gold, borderWidth: 1, borderColor: color.goldBright, borderRadius: radius.sm, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', marginTop: space[2] },
  btnInerte: { opacity: 0.7 },
  btnTexto:  { fontFamily: font.body, fontSize: 15, fontWeight: '600', color: color.onGold, letterSpacing: 0.3 },
});
