/**
 * RALLY · Selector de sede con alta inline
 *
 * Elige una sede existente o crea una nueva sin salir de la pantalla de crear
 * torneo. Escribe directo en `venues`: la política `venues_insert` (migr. 032)
 * permite INSERT a cualquier authenticated, así que no hace falta Edge Function
 * ni RPC — una sede no tiene el problema de auto-otorgarse pertenencia que sí
 * tenía el alta de organizador.
 *
 * DUPLICADOS: mientras se escribe el nombre se buscan sedes parecidas y se
 * muestran como SUGERENCIA con su ciudad visible. Nunca bloquean el alta: dos
 * sedes pueden llamarse igual en países distintos y eso es legítimo.
 */

import { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';

import { supabase } from '@/lib/supabase/client';
import { findSimilarVenues, normalizeVenueName } from '@/lib/venue-search';
import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';
import { inputFontSize } from '@/lib/web-layout';
import { fallo } from '@/lib/errores-red';

export interface Venue {
  id:               string;
  name:             string;
  city:             string;
  name_normalized?: string | null;
}

interface Props {
  venues:        Venue[];
  selectedVenue: Venue | null;
  onSelect:      (v: Venue) => void;
  /** La sede recién creada, para que el padre la añada a su lista. */
  onCreated:     (v: Venue) => void;
}

const CIUDAD_POR_DEFECTO = 'CDMX';

export default function VenuePicker({ venues, selectedVenue, onSelect, onCreated }: Props) {
  const [creando, setCreando]   = useState(false);
  const [nombre, setNombre]     = useState('');
  const [direccion, setDireccion] = useState('');
  const [ciudad, setCiudad]     = useState(CIUDAD_POR_DEFECTO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Se recalcula solo cuando cambia lo que importa, no en cada render.
  const parecidas = useMemo(
    () => findSimilarVenues(nombre, venues),
    [nombre, venues],
  );

  const puedeGuardar =
    nombre.trim().length >= 3 &&
    direccion.trim().length >= 5 &&
    ciudad.trim().length >= 2 &&
    !guardando;

  function usarSugerencia(v: Venue) {
    onSelect(v);
    setCreando(false);
    setNombre('');
    setDireccion('');
    setCiudad(CIUDAD_POR_DEFECTO);
    setError(null);
  }

  async function guardar() {
    setError(null);
    if (!puedeGuardar) return;

    setGuardando(true);
    try {
      // `created_by` se omite a propósito: la columna tiene DEFAULT auth.uid(),
      // y la política de INSERT rechaza cualquier valor que no sea el del
      // usuario actual. Mandarlo desde el cliente solo añadiría superficie.
      const { data, error: dbError } = await supabase
        .from('venues')
        .insert({
          name:            nombre.trim(),
          address:         direccion.trim(),
          city:            ciudad.trim(),
          name_normalized: normalizeVenueName(nombre),
        })
        .select('id, name, city, name_normalized')
        .single();

      if (dbError || !data) {
        setError('No se pudo guardar la sede. Intenta de nuevo.');
        return;
      }

      const nueva = data as Venue;
      onCreated(nueva);
      usarSugerencia(nueva);
    } catch (e) {
      setError(fallo('venue-picker', e, 'No se pudo guardar la sede. Intenta de nuevo.'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={s.raiz}>
      {/* ── Sedes existentes ─────────────────────────────────── */}
      {venues.length === 0 && !creando && (
        <Text style={s.vacio}>
          Todavía no hay sedes registradas. Agrega la primera.
        </Text>
      )}

      {venues.map((v) => {
        const activa = selectedVenue?.id === v.id;
        return (
          <Pressable
            key={v.id}
            style={[s.sedeBtn, activa && s.sedeBtnActiva]}
            onPress={() => onSelect(v)}
            accessibilityRole="button"
            accessibilityState={{ selected: activa }}
          >
            <Text style={[s.sedeNombre, activa && s.sedeNombreActiva]}>{v.name}</Text>
            <Text style={s.sedeCiudad}>{v.city}</Text>
          </Pressable>
        );
      })}

      {/* ── Alternar el alta ─────────────────────────────────── */}
      {!creando ? (
        <Pressable
          onPress={() => setCreando(true)}
          style={s.agregarBtn}
          accessibilityRole="button"
          accessibilityLabel="Agregar una sede nueva"
        >
          <Text style={s.agregarTexto}>＋ Agregar sede nueva</Text>
        </Pressable>
      ) : (
        <View style={s.form}>
          {/* Nombre ── el texto que alimentará el botón "Cómo llegar" */}
          <View style={s.campo}>
            <Text style={s.label}>Nombre de la sede</Text>
            <TextInput
              style={s.input}
              placeholder="Ej. Esta Padel Tlalpan"
              placeholderTextColor={color.muted}
              value={nombre}
              onChangeText={setNombre}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={80}
              selectionColor={color.gold}
              accessibilityLabel="Nombre de la sede"
            />
            <Text style={s.ayuda}>
              Escríbelo tal cual aparece en Google Maps o Apple Maps. De ese
              texto depende que el botón "Cómo llegar" lleve a los jugadores al
              lugar correcto — si no coincide, el mapa no la encuentra.
            </Text>
          </View>

          {/* Sugerencias de duplicado — nunca bloquean */}
          {parecidas.length > 0 && (
            <View style={s.sugerencias}>
              <Text style={s.sugerenciasTitulo}>¿Es alguna de estas?</Text>
              {parecidas.map((v) => (
                <Pressable
                  key={v.id}
                  onPress={() => usarSugerencia(v)}
                  style={s.sugerencia}
                  accessibilityRole="button"
                  accessibilityLabel={`Usar ${v.name}, ${v.city}`}
                >
                  <Text style={s.sugerenciaNombre}>{v.name}</Text>
                  {/* La ciudad es lo que distingue dos sedes homónimas */}
                  <Text style={s.sugerenciaCiudad}>{v.city}</Text>
                </Pressable>
              ))}
              <Text style={s.sugerenciasPie}>
                Si ninguna es, sigue y crea la tuya.
              </Text>
            </View>
          )}

          {/* Dirección */}
          <View style={s.campo}>
            <Text style={s.label}>Dirección</Text>
            <TextInput
              style={s.input}
              placeholder="Calle y número, colonia"
              placeholderTextColor={color.muted}
              value={direccion}
              onChangeText={setDireccion}
              autoCapitalize="words"
              maxLength={160}
              selectionColor={color.gold}
              accessibilityLabel="Dirección de la sede"
            />
            <Text style={s.ayuda}>
              Como la tienes en el mapa. Junto al nombre y la ciudad, es lo que
              se usa para buscarla.
            </Text>
          </View>

          {/* Ciudad */}
          <View style={s.campo}>
            <Text style={s.label}>Ciudad</Text>
            <TextInput
              style={s.input}
              placeholder="CDMX"
              placeholderTextColor={color.muted}
              value={ciudad}
              onChangeText={setCiudad}
              autoCapitalize="words"
              maxLength={60}
              selectionColor={color.gold}
              accessibilityLabel="Ciudad de la sede"
            />
            <Text style={s.ayuda}>
              Distingue sedes con el mismo nombre en distintas ciudades.
            </Text>
          </View>

          {error && <Text style={s.error}>{error}</Text>}

          <View style={s.acciones}>
            <Pressable
              onPress={() => { setCreando(false); setError(null); }}
              style={s.cancelar}
              accessibilityRole="button"
            >
              <Text style={s.cancelarTexto}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={guardar}
              disabled={!puedeGuardar}
              style={[s.guardar, !puedeGuardar && s.guardarInactivo]}
              accessibilityRole="button"
              accessibilityLabel="Guardar sede"
            >
              {guardando
                ? <ActivityIndicator color={color.onGold} />
                : <Text style={[s.guardarTexto, !puedeGuardar && s.guardarTextoInactivo]}>Guardar sede</Text>
              }
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  raiz:  { gap: space[2] },
  vacio: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted },

  sedeBtn:        { backgroundColor: color.surface2, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, padding: space[3] },
  sedeBtnActiva:  { borderColor: color.gold, backgroundColor: 'rgba(212,175,55,0.08)' },
  sedeNombre:     { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  sedeNombreActiva: { color: color.goldBright },
  sedeCiudad:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },

  agregarBtn: {
    borderWidth:     1,
    borderColor:     color.gold,
    borderStyle:     'dashed',
    borderRadius:    radius.md,
    minHeight:       touchTarget,
    alignItems:      'center',
    justifyContent:  'center',
  },
  agregarTexto: { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.champagne },

  form:  { backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, padding: space[3], gap: space[3] },
  campo: { gap: space[1] },
  label: { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, letterSpacing: 0.3 },
  input: {
    backgroundColor:   color.surface2,
    borderWidth:       1,
    borderColor:       color.lineSoft,
    borderRadius:      radius.md,
    minHeight:         touchTarget,
    paddingHorizontal: space[4],
    paddingVertical:   space[3],
    fontFamily:        font.body,
    fontSize:          inputFontSize(fontSize.body),
    color:             color.text,
  },
  ayuda: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, opacity: 0.8, lineHeight: 17 },

  sugerencias:       { backgroundColor: color.surface2, borderWidth: 1, borderColor: color.line, borderRadius: radius.md, padding: space[3], gap: space[2] },
  sugerenciasTitulo: { fontFamily: font.display, fontSize: fontSize.caption, color: color.champagne, letterSpacing: 1 },
  sugerencia:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2], paddingVertical: space[2] },
  sugerenciaNombre:  { fontFamily: font.body, fontSize: fontSize.body, color: color.text, flex: 1, minWidth: 0 },
  sugerenciaCiudad:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.gold, flexShrink: 0 },
  sugerenciasPie:    { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, opacity: 0.8 },

  error: { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger },

  acciones: { flexDirection: 'row', gap: space[2] },
  cancelar: { flex: 1, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color.line, borderRadius: radius.sm },
  cancelarTexto: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted },
  guardar: { flex: 2, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', backgroundColor: color.gold, borderWidth: 1, borderColor: color.goldBright, borderRadius: radius.sm },
  guardarInactivo: { backgroundColor: color.surface2, borderColor: color.line },
  guardarTexto: { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.onGold },
  guardarTextoInactivo: { color: color.muted },
});
