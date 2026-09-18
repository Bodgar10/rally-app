/**
 * app/(protected)/perfil-editar.tsx
 *
 * RALLY · Editar tu perfil.
 *
 * EL BOTÓN EXISTÍA Y NO HACÍA NADA
 *   En el perfil había un "Editar perfil" con `onPress={() => {}}` y un
 *   `// TODO Sprint 1`. Un botón que no responde es peor que no tenerlo: el
 *   jugador lo toca tres veces, decide que la app está rota, y esa impresión
 *   se la lleva a todo lo demás.
 *
 * LO QUE SE PUEDE CAMBIAR Y LO QUE NO
 *   Nombre, teléfono, lado y mano. El correo no: es la identidad de la cuenta y
 *   cambiarlo es otra operación —con verificación— que no cabe en un formulario
 *   de perfil.
 *
 *   El lado y la mano se contestan normalmente desde la tarjeta del dashboard,
 *   de una en una. Esta pantalla existe para CORREGIR: alguien que tocó el
 *   botón equivocado con el móvil en la mano y el sol de frente necesita poder
 *   arreglarlo sin escribirle a nadie.
 *
 * SON PÚBLICOS Y SE RECUERDA AQUÍ TAMBIÉN
 *   Cambiar el lado cambia lo que ven los rivales en su ficha. Que se entere
 *   una sola vez, al contestar, no basta: aquí es donde alguien va a pensar
 *   "pongo lo que sea" sin recordar que se publica.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { Button, Card, SectionLabel } from '@/components/ui';
import BotonVolver from '@/components/ui/BotonVolver';
import { type Lado, type Mano } from '@/lib/lado-y-mano';
import { leerPerfilDeJuego } from '@/lib/lado-y-mano-datos';
import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';

const LADOS: { v: Lado; t: string }[] = [
  { v: 'drive', t: 'Drive' },
  { v: 'reves', t: 'Revés' },
  { v: 'ambos', t: 'Los dos' },
];
const MANOS: { v: Mano; t: string }[] = [
  { v: 'diestro', t: 'Diestro' },
  { v: 'zurdo', t: 'Zurdo' },
];

export default function EditarPerfilScreen() {
  const router = useRouter();

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [lado, setLado] = useState<Lado | null>(null);
  const [mano, setMano] = useState<Mano | null>(null);

  const cargar = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data: fila }, juego] = await Promise.all([
      supabase.from('users').select('full_name, phone').eq('id', user.id).maybeSingle(),
      leerPerfilDeJuego(user.id),
    ]);
    setNombre(fila?.full_name ?? '');
    setTelefono(fila?.phone ?? '');
    setLado(juego.lado);
    setMano(juego.mano);
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function guardar() {
    if (!nombre.trim()) {
      setError('El nombre no puede quedar vacío: es como te ven tus rivales.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No se pudo identificar tu sesión.');

      const { error: e } = await supabase
        .from('users')
        .update({
          full_name: nombre.trim(),
          phone: telefono.trim() || null,
          preferred_side: lado,
          mano,
        })
        .eq('id', user.id);
      if (e) throw new Error(e.message ?? 'No se pudo guardar.');
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.cont}>
        <BotonVolver texto="Volver" />
        <Text style={s.h1}>Editar perfil</Text>

        {cargando && <ActivityIndicator color={color.gold} />}

        {!cargando && (
          <>
            <SectionLabel title="Tus datos" />
            <Card>
              <Text style={s.etiqueta}>Nombre</Text>
              <TextInput
                value={nombre}
                onChangeText={setNombre}
                placeholder="Tu nombre y apellido"
                placeholderTextColor={color.muted}
                style={s.input}
              />
              <Text style={s.pista}>Es como apareces en los cuadros y en las tablas.</Text>

              <Text style={s.etiqueta}>Teléfono</Text>
              <TextInput
                value={telefono}
                onChangeText={setTelefono}
                placeholder="Opcional"
                keyboardType="phone-pad"
                placeholderTextColor={color.muted}
                style={s.input}
              />
              <Text style={s.pista}>Lo usa el organizador si hay un cambio de última hora.</Text>
            </Card>

            <SectionLabel title="Cómo juegas" />
            <Card>
              <Text style={s.aviso}>
                Esto lo ven tus rivales en la ficha previa al partido, igual que tú ves el suyo.
              </Text>

              <Text style={s.etiqueta}>Lado</Text>
              <View style={s.chips}>
                {LADOS.map((o) => (
                  <Pressable
                    key={o.v}
                    onPress={() => setLado(lado === o.v ? null : o.v)}
                    style={[s.chip, lado === o.v && s.chipOn]}
                  >
                    <Text style={[s.chipTexto, lado === o.v && s.chipTextoOn]}>{o.t}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={s.etiqueta}>Mano</Text>
              <View style={s.chips}>
                {MANOS.map((o) => (
                  <Pressable
                    key={o.v}
                    onPress={() => setMano(mano === o.v ? null : o.v)}
                    style={[s.chip, mano === o.v && s.chipOn]}
                  >
                    <Text style={[s.chipTexto, mano === o.v && s.chipTextoOn]}>{o.t}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={s.pista}>
                Tocar el que ya está elegido lo deja en blanco. Sin dato no se enseña nada, que es
                mejor que enseñar uno equivocado.
              </Text>
            </Card>

            {error && (
              <View style={s.error}>
                <Text style={s.errorTexto}>{error}</Text>
              </View>
            )}

            <Button
              label={guardando ? 'Guardando…' : 'Guardar cambios'}
              variant="primary"
              onPress={() => void guardar()}
              disabled={guardando}
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
  etiqueta: {
    color: color.muted, fontFamily: font.body, fontSize: fontSize.eyebrow,
    textTransform: 'uppercase', letterSpacing: 0.6, marginTop: space[2],
  },
  input: {
    minHeight: touchTarget, color: color.text, fontFamily: font.body, fontSize: fontSize.body,
    borderRadius: radius.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: color.surface, paddingHorizontal: space[3],
  },
  pista: { color: color.muted, fontFamily: font.body, fontSize: fontSize.minAbsolute, lineHeight: 17, marginTop: space[1] },
  aviso: { color: color.champagne, fontFamily: font.body, fontSize: fontSize.caption, lineHeight: 18 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip: {
    minHeight: touchTarget, flexGrow: 1, minWidth: 90, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: space[3], borderRadius: radius.sm, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)', backgroundColor: color.surface,
  },
  chipOn: { borderColor: color.gold, backgroundColor: 'rgba(212,175,55,0.14)' },
  chipTexto: { color: color.text, fontFamily: font.body, fontSize: fontSize.body },
  chipTextoOn: { color: color.goldBright, fontWeight: '600' },

  error: {
    padding: space[3], borderRadius: radius.sm, backgroundColor: 'rgba(224,114,111,0.13)',
    borderWidth: 1, borderColor: 'rgba(224,114,111,0.3)',
  },
  errorTexto: { color: color.danger, fontFamily: font.body, fontSize: fontSize.body, lineHeight: 20 },
});
