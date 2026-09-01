/**
 * RALLY · Horarios del torneo
 *
 * Una franja por día del rango, más la duración que se planifica por partido.
 *
 * EL ORDEN DE LOS DÍAS ES SEMÁNTICO, no de presentación: el planificador
 * reserva todos los días menos el último para la fase de grupos y el último
 * para las eliminatorias. Que sobre tiempo el domingo no ayuda si el sábado va
 * apretado, así que son dos presupuestos independientes.
 *
 * Los días salen de start_date/end_date del torneo: no se inventan aquí. Si el
 * organizador cambia las fechas, esta pantalla vuelve a leerlas y las ventanas
 * que queden fuera del rango dejan de contar.
 */

import { useCallback, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useVolver } from '@/hooks/useVolver';

import { supabase } from '@/lib/supabase/client';
import { generarBloques } from '@/lib/engine/schedule/bloques';
import { parseFechaISO, aFechaISO, formatearConDia } from '@/lib/fechas';
import { normalizarHora, formatearMientrasEscribe, esHoraValida } from '@/lib/hora-campo';
import { color, radius, space, font, fontSize, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset, inputFontSize } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';

interface Ventana {
  dia:   string;   // 'YYYY-MM-DD'
  desde: string;   // 'HH:MM'
  hasta: string;
  /** Sin marcar, el día no se juega y no aporta presupuesto. */
  activo: boolean;
}

/**
 * EL CAMPO DE HORA NO CASTIGA.
 *
 * Antes exigía `HH:MM` exacto y "22" daba "Revisa las horas del sábado: usa el
 * formato 14:00". El organizador no se había equivocado: escribió la hora bien
 * y la app le dijo que no.
 *
 * Ahora se acepta lo que una persona escribe —"22", "2200", "22.30", "9:5"— y
 * se normaliza al salir del campo. La validación de abajo trabaja sobre lo YA
 * normalizado, así que solo se queja de lo que de verdad no es una hora.
 */

const DEFECTO_DESDE = '09:00';
const DEFECTO_HASTA = '21:00';

/** Los días del rango del torneo, ambos incluidos. */
function diasDelRango(inicio: string, fin: string): string[] {
  const a = parseFechaISO(inicio), b = parseFechaISO(fin);
  if (!a || !b) return [];
  const salida: string[] = [];
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    salida.push(aFechaISO(new Date(d)));
  }
  return salida;
}

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Lo que se guarda de un día: la hora normalizada, o la cruda si no se pudo. */
const normalizada = (v: string) => normalizarHora(v) ?? v.trim();

export default function HorariosScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();
  const volver = useVolver();

  const [nombre, setNombre]       = useState('');
  const [ventanas, setVentanas]   = useState<Ventana[]>([]);
  const [duracion, setDuracion]   = useState('60');
  const [cargando, setCargando]   = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [{ data: t }, { data: ws }] = await Promise.all([
      // Cast hasta que se aplique la 044 y se corra `npm run types:db`.
      (supabase.from as unknown as (v: string) => {
        select: (c: string) => { eq: (c: string, v: string) => {
          maybeSingle: () => Promise<{ data: {
            name: string; start_date: string; end_date: string; match_minutes: number | null;
          } | null }>;
        } };
      })('tournaments')
        .select('name, start_date, end_date, match_minutes')
        .eq('id', tournamentId).maybeSingle(),
      (supabase.from as unknown as (v: string) => {
        select: (c: string) => { eq: (c: string, v: string) => Promise<{ data: Array<{
          dia: string; desde: string; hasta: string;
        }> | null }> };
      })('tournament_windows')
        .select('dia, desde, hasta')
        .eq('tournament_id', tournamentId),
    ]);

    if (!t) { setCargando(false); return; }

    setNombre(t.name);
    if (t.match_minutes) setDuracion(String(t.match_minutes));

    // Las guardadas mandan; los días sin ventana nacen desmarcados con un
    // horario de partida razonable.
    const guardadas = new Map(
      (ws ?? []).map((w) => [w.dia, { desde: w.desde.slice(0, 5), hasta: w.hasta.slice(0, 5) }]),
    );

    setVentanas(diasDelRango(t.start_date, t.end_date).map((dia) => {
      const g = guardadas.get(dia);
      return {
        dia,
        desde:  g?.desde ?? DEFECTO_DESDE,
        hasta:  g?.hasta ?? DEFECTO_HASTA,
        activo: !!g,
      };
    }));

    setCargando(false);
  }, [tournamentId]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  const activas = ventanas.filter((v) => v.activo);

  function problema(): string | null {
    const d = Number(duracion);
    if (!Number.isFinite(d) || d < 30 || d > 180) {
      return 'La duración debe estar entre 30 y 180 minutos.';
    }
    if (activas.length === 0) return 'Marca al menos un día.';
    for (const v of activas) {
      // Se valida lo NORMALIZADO: "22" ya es 22:00 y no tiene por qué fallar.
      // Solo se queja de lo que de verdad no es una hora.
      const desde = normalizarHora(v.desde);
      const hasta = normalizarHora(v.hasta);
      if (!desde || !hasta) {
        return `Revisa las horas del ${formatearConDia(v.dia)}: escribe una hora del día, como 22 o 14:30.`;
      }
      if (minutos(hasta) <= minutos(desde)) {
        return `El ${formatearConDia(v.dia)} termina antes de empezar.`;
      }
    }
    return null;
  }

  async function guardar() {
    const mal = problema();
    if (mal) { setError(mal); return; }

    setError(null);
    setGuardando(true);

    // Se borra y se reinserta en vez de hacer upsert fila a fila: los días
    // desmarcados TIENEN que desaparecer, y un upsert los dejaría vivos.
    const del = await (supabase.from as unknown as (v: string) => {
      delete: () => { eq: (c: string, v: string) => Promise<{ error: { message?: string } | null }> };
    })('tournament_windows').delete().eq('tournament_id', tournamentId);

    if (del.error) {
      setGuardando(false);
      console.error('[horarios] borrar:', del.error);
      setError('No se pudo guardar. Intenta de nuevo.');
      return;
    }

    const ins = await (supabase.from as unknown as (v: string) => {
      insert: (rows: unknown[]) => Promise<{ error: { message?: string } | null }>;
    })('tournament_windows').insert(
      // Se guarda lo NORMALIZADO: en la base entra 'HH:MM:SS' siempre, escriba
      // lo que escriba el organizador.
      activas.map((v) => ({
        tournament_id: tournamentId,
        dia:   v.dia,
        desde: `${normalizada(v.desde)}:00`,
        hasta: `${normalizada(v.hasta)}:00`,
      })),
    );

    if (ins.error) {
      setGuardando(false);
      console.error('[horarios] insertar:', ins.error);
      setError('No se pudo guardar. Intenta de nuevo.');
      return;
    }

    const { error: eDur } = await supabase
      .from('tournaments')
      .update({ match_minutes: Number(duracion) } as never)
      .eq('id', tournamentId);

    setGuardando(false);

    if (eDur) {
      console.error('[horarios] duración:', eDur);
      setError('Los horarios se guardaron, pero no la duración del partido.');
      return;
    }
    volver();
  }

  function editar(dia: string, parche: Partial<Ventana>) {
    setVentanas((prev) => prev.map((v) => (v.dia === dia ? { ...v, ...parche } : v)));
  }

  if (cargando) {
    return <View style={s.centro}><ActivityIndicator color={color.gold} /></View>;
  }

  /**
   * Los días cuyo último bloque se sale de la ventana que se está capturando.
   *
   * Un bloque son tres partidos seguidos en una cancha y se alarga unos 45
   * minutos. Una ventana que cierra a las 23:00 produce un bloque de 20:00 que
   * en la práctica termina cerca de las 23:45, y quien captura el horario es
   * quien puede decidir si eso le sirve — pero solo si lo sabe AHORA, no
   * cuando ya hay veinte parejas inscritas ahí.
   *
   * Se recalcula en cada tecla a propósito: el aviso tiene que moverse
   * mientras se escribe la hora, no al guardar.
   */
  const bloquesTardios = (() => {
    const validas = activas.filter(
      (v) => esHoraValida(normalizada(v.desde)) && esHoraValida(normalizada(v.hasta))
        && minutos(normalizada(v.hasta)) > minutos(normalizada(v.desde)),
    );
    if (validas.length === 0) return [];
    const dur = Number(duracion);
    if (!Number.isFinite(dur) || dur < 30 || dur > 180) return [];
    try {
      return generarBloques({
        ventanas: validas.map((v) => ({
          dia: v.dia, desde: normalizada(v.desde), hasta: normalizada(v.hasta),
        })),
        canchas: 1,                    // el número no importa: solo las horas
        minutosPorPartido: dur,
      }).bloques.filter((b) => b.seSaleDeLaVentana);
    } catch {
      return [];
    }
  })();

  const total = activas.reduce((a, v) => {
    const d = normalizarHora(v.desde), h = normalizarHora(v.hasta);
    if (!d || !h) return a;
    const m = minutos(h) - minutos(d);
    return a + (m > 0 ? m : 0);
  }, 0);

  return (
    <SafeAreaView style={s.safe}>
      <BotonVolver texto={nombre || 'Torneo'} />

      <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
        <Text style={s.eyebrow}>CONFIGURACIÓN</Text>
        <Text style={s.titulo}>Horarios</Text>
        <Text style={s.subtitulo}>
          A qué hora se juega cada día. Marca solo los días que de verdad vas a
          usar, y escribe la hora como quieras: «22» son las 22:00.
        </Text>

        <View style={s.lista}>
          {ventanas.map((v, i) => (
            <View key={v.dia} style={[s.dia, !v.activo && s.diaInerte]}>
              <Pressable
                style={s.diaCabecera}
                onPress={() => editar(v.dia, { activo: !v.activo })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: v.activo }}
              >
                <View style={[s.check, v.activo && s.checkMarcado]}>
                  {v.activo && <Text style={s.checkPalomita}>✓</Text>}
                </View>
                <Text style={s.diaNombre}>{formatearConDia(v.dia)}</Text>
                {/* El último día activo es el de eliminatorias: decirlo aquí
                    evita la sorpresa de que el cuadro caiga donde no se espera. */}
                {v.activo && i === ventanas.map((x) => x.activo).lastIndexOf(true) && ventanas.filter((x) => x.activo).length > 1 && (
                  <Text style={s.etiquetaFinal}>eliminatorias</Text>
                )}
              </Pressable>

              {v.activo && (
                <>
                  <View style={s.horas}>
                    {/* Los dos puntos los mete `formatearMientrasEscribe` en
                        cuanto hacen falta, y al salir del campo se completa la
                        hora. Teclear "22" y ver cómo se convierte en 22:00 es
                        la prueba de que la app entendió, no de que se corrigió
                        un error. `keyboardType` numérico: aquí no hay letras. */}
                    <TextInput
                      style={s.hora}
                      value={v.desde}
                      onChangeText={(x) => editar(v.dia, { desde: formatearMientrasEscribe(x) })}
                      onBlur={() => editar(v.dia, { desde: normalizada(v.desde) })}
                      placeholder="9"
                      placeholderTextColor={color.muted}
                      keyboardType="number-pad"
                      maxLength={5}
                      selectionColor={color.gold}
                      accessibilityLabel={`Hora de inicio del ${formatearConDia(v.dia)}`}
                      accessibilityHint="Escribe la hora. Puedes poner solo el número: 9 son las 9:00."
                    />
                    <Text style={s.guion}>a</Text>
                    <TextInput
                      style={s.hora}
                      value={v.hasta}
                      onChangeText={(x) => editar(v.dia, { hasta: formatearMientrasEscribe(x) })}
                      onBlur={() => editar(v.dia, { hasta: normalizada(v.hasta) })}
                      placeholder="21"
                      placeholderTextColor={color.muted}
                      keyboardType="number-pad"
                      maxLength={5}
                      selectionColor={color.gold}
                      accessibilityLabel={`Hora de fin del ${formatearConDia(v.dia)}`}
                      accessibilityHint="Escribe la hora. Puedes poner solo el número: 22 son las 22:00."
                    />
                  </View>

                  {/* Lo que se va a guardar, dicho mientras se escribe. Quita
                      la duda de "¿habrá entendido el 22?" sin obligar a
                      guardar para comprobarlo. */}
                  <Text style={s.horasEco}>
                    {normalizarHora(v.desde) && normalizarHora(v.hasta)
                      ? `De ${normalizarHora(v.desde)} a ${normalizarHora(v.hasta)}`
                      : 'Escribe la hora: puede ser solo el número, como 9 o 22.'}
                  </Text>
                </>
              )}
            </View>
          ))}
        </View>

        <View style={s.campo}>
          <Text style={s.campoEtiqueta}>Minutos por partido</Text>
          <TextInput
            style={s.input}
            value={duracion}
            onChangeText={setDuracion}
            keyboardType="number-pad"
            maxLength={3}
            selectionColor={color.gold}
            accessibilityLabel="Minutos por partido"
          />
          <Text style={s.campoAyuda}>
            Se planifica con este número. En la práctica un partido a dos sets
            con super muerte dura entre 60 y 90 minutos.
          </Text>
        </View>

        {total > 0 && (
          <View style={s.nota}>
            <Text style={s.notaTexto}>
              {Math.round(total / 60)} horas de juego en {activas.length}{' '}
              {activas.length === 1 ? 'día' : 'días'}.
            </Text>
          </View>
        )}

        {/* No bloquea nada: es una consecuencia de lo que acaba de escribir,
            dicha en el momento en que todavía la puede cambiar. */}
        {bloquesTardios.length > 0 && (
          <View style={s.avisoTarde}>
            <Text style={s.avisoTardeTitulo}>El último bloque acaba más tarde de lo que parece</Text>
            {bloquesTardios.map((b) => (
              <Text key={b.id} style={s.avisoTardeLinea}>
                · El último bloque del {formatearConDia(b.dia)} empieza a las{' '}
                {b.desde} y terminaría cerca de las {b.hastaRealista} con los
                retrasos habituales.
              </Text>
            ))}
            <Text style={s.avisoTardeNota}>
              Un grupo son tres partidos seguidos en una cancha, y en la práctica
              se alargan unos 45 minutos. Puedes dejarlo así —en Cimepa se jugó a
              las 22:00— o cerrar el día antes para que el último bloque no salga.
            </Text>
          </View>
        )}

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

  lista: { gap: space[2] },
  dia: {
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft,
    borderRadius: radius.md, paddingHorizontal: space[4], paddingVertical: space[3], gap: space[3],
  },
  diaInerte:   { opacity: 0.55 },
  diaCabecera: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: touchTarget - 12 },
  diaNombre:   { fontFamily: font.body, fontSize: fontSize.body, color: color.text, flex: 1 },
  etiquetaFinal: { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne },

  check:         { width: 20, height: 20, borderRadius: radius.xs, borderWidth: 1, borderColor: color.gold, backgroundColor: color.surface2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkMarcado:  { backgroundColor: color.gold },
  checkPalomita: { fontSize: 12, color: color.onGold, fontWeight: '700' },

  horas: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  /**
   * `minWidth: 0` NO ES DECORATIVO: es lo que hace que la fila quepa en un iPhone.
   *
   * En el navegador, un hijo de una fila flex arranca con `min-width: auto`, y
   * para un `<input>` eso no es cero: es su ancho intrínseco (el `size` por
   * defecto, ~170px). Los dos campos se negaban a bajar de ahí, sumaban más que
   * la tarjeta y el de la derecha se salía por el borde — «14:00 a 23» con el
   * 23 cortado. En React Native nativo no pasa porque no existe esa regla, así
   * que el fallo solo se veía en Safari del móvil.
   *
   * Con `minWidth: 0` el `flex: 1` puede por fin repartir a partes iguales lo
   * que sobra, y el padding baja a space[2] para que las dos horas completas
   * quepan holgadas en 390px. Un solo layout: en nativo esta clave es inerte.
   */
  hora: {
    flex: 1, minWidth: 0,
    backgroundColor: color.surface2, borderWidth: 1, borderColor: color.lineSoft,
    borderRadius: radius.sm, minHeight: touchTarget, paddingHorizontal: space[2],
    fontFamily: font.body, fontSize: inputFontSize(fontSize.body), color: color.text, textAlign: 'center',
  },
  /** La «a» tiene su propio ancho y no encoge: no compite con los campos. */
  guion: {
    width: 14, flexShrink: 0, textAlign: 'center',
    fontFamily: font.body, fontSize: fontSize.caption, color: color.muted,
  },
  horasEco: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, marginTop: -space[1] },

  campo:         { gap: space[1], marginTop: space[2] },
  campoEtiqueta: { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, letterSpacing: 0.3 },
  campoAyuda:    { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, opacity: 0.8, lineHeight: 16 },
  input: {
    backgroundColor: color.surface2, borderWidth: 1, borderColor: color.lineSoft,
    borderRadius: radius.md, minHeight: touchTarget, paddingHorizontal: space[4],
    fontFamily: font.body, fontSize: inputFontSize(fontSize.body), color: color.text,
  },

  nota:      { backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, padding: space[3] },

  avisoTarde:       { backgroundColor: color.surface, borderWidth: 1, borderColor: color.alive, borderRadius: radius.md, padding: space[3.5], gap: space[1.5] },
  avisoTardeTitulo: { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.alive },
  avisoTardeLinea:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.text, lineHeight: 18 },
  avisoTardeNota:   { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },
  notaTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, lineHeight: 17 },

  error:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, textAlign: 'center' },

  btn:       { backgroundColor: color.gold, borderWidth: 1, borderColor: color.goldBright, borderRadius: radius.sm, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', marginTop: space[2] },
  btnInerte: { opacity: 0.7 },
  btnTexto:  { fontFamily: font.body, fontSize: 15, fontWeight: '600', color: color.onGold, letterSpacing: 0.3 },
});
