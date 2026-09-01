/**
 * RALLY · Crear nuevo torneo
 * Campos: nombre, fechas, sede, cuota base.
 * Escribe en public.tournaments con status = 'draft'.
 * El organizador luego agrega categorías y abre inscripciones.
 */

import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useVolver } from '@/hooks/useVolver';

import { supabase }                             from '@/lib/supabase/client';
import { Button, Card, SectionLabel }           from '@/components/ui';
import VenuePicker, { type Venue }              from '@/components/organizer/VenuePicker';
import CalendarioRango                          from '@/components/ui/CalendarioRango';
import { rangoCompleto, type RangoSeleccion }   from '@/lib/rango-fechas';
import { color, font, fontSize, space, radius, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';

export default function NuevoTorneoScreen() {
  const router = useRouter();
  const volver = useVolver();

  const [name, setName]             = useState('');
  const [rango, setRango]           = useState<RangoSeleccion>({ inicio: null, fin: null });
  const [fee, setFee]               = useState('');
  const [venues, setVenues]         = useState<Venue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [organizerId, setOrganizerId] = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: membership }, { data: venueList }] = await Promise.all([
        supabase
          .from('organizer_members')
          .select('organizer_id')
          .eq('user_id', user.id)
          .eq('member_role', 'owner')
          .single(),
        supabase
          .from('venues')
          .select('id, name, city, name_normalized')
          .order('name'),
      ]);

      if (membership) setOrganizerId(membership.organizer_id);
      if (venueList)  setVenues(venueList as Venue[]);
    }
    load();
  }, []);

  async function handleSave() {
    setError(null);
    if (!name.trim())        { setError('El nombre es obligatorio.');                 return; }
    // El calendario no puede producir un rango inválido ni invertido (ver
    // rango-fechas.ts), así que solo queda comprobar que esté completo.
    if (!rangoCompleto(rango)) { setError('Elige las fechas del torneo.');              return; }
    if (!organizerId)        { setError('No se encontró tu organización.');            return; }

    setSaving(true);

    const { data, error: insertError } = await supabase
      .from('tournaments')
      .insert({
        organizer_id:     organizerId,
        venue_id:         selectedVenue?.id ?? null,
        name:             name.trim(),
        start_date:       rango.inicio,
        end_date:         rango.fin,
        registration_fee: parseFloat(fee) || 0,
        status:           'draft',
        // APAGADO Y EXPLÍCITO, no confiado al default de la columna.
        //
        // En un torneo real no se juega el 3.er lugar: la gente lleva tres
        // días, el domingo por la tarde los dos perdedores de semifinal
        // quieren irse a casa. Se enciende desde Formato quien lo quiera.
        //
        // Va aquí y no solo en el `default` de la tabla porque el default es
        // una promesa de otro sistema: si una migración no llega a aplicarse
        // —que es exactamente lo que pasó con la 057— el torneo nace con el
        // 3.er lugar encendido y nadie se entera hasta el domingo.
        tercer_lugar:     false,
      })
      .select('id')
      .single();

    setSaving(false);

    if (insertError) {
      setError('No se pudo crear el torneo. Intenta de nuevo.');
      return;
    }

    // Ir al detalle del torneo recién creado para agregar categorías
    router.replace(`/(organizer)/org/torneos/${data.id}`);
  }

  return (
    <SafeAreaView style={s.safe}>
      <BotonVolver texto="Volver" />

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.eyebrow}>ORGANIZADOR</Text>
        <Text style={s.title}>Nuevo torneo</Text>

        {/* Nombre */}
        <SectionLabel title="Nombre del torneo" />
        <TextInput
          style={s.input}
          placeholder="Ej. Torneo Apertura 2026"
          placeholderTextColor={color.muted}
          value={name}
          onChangeText={setName}
          selectionColor={color.gold}
        />

        {/* Fechas — bloquearPasado en true: se está CREANDO el torneo, y
            programarlo hacia atrás no tiene sentido. Al editar uno existente
            (fechas.tsx) sí se permite, por si se corrige uno ya jugado. */}
        <SectionLabel title="Fechas" />
        <CalendarioRango
          valor={rango}
          onChange={setRango}
          bloquearPasado
        />

        {/* Sede */}
        <SectionLabel title="Sede" />
        <VenuePicker
          venues={venues}
          selectedVenue={selectedVenue}
          onSelect={setSelectedVenue}
          onCreated={(v) => setVenues(prev => [...prev, v].sort((a, b) => a.name.localeCompare(b.name)))}
        />

        {/* Cuota base */}
        <SectionLabel title="Cuota de inscripción (MXN por pareja)" />
        <TextInput
          style={s.input}
          placeholder="Ej. 900 (0 si es gratuito)"
          placeholderTextColor={color.muted}
          value={fee}
          onChangeText={setFee}
          keyboardType="numeric"
          selectionColor={color.gold}
        />

        {error && <Text style={s.errorText}>{error}</Text>}

        <View style={s.btns}>
          <Button
            label={saving ? 'Guardando…' : 'Crear torneo (borrador)'}
            variant="primary"
            loading={saving}
            onPress={handleSave}
          />
          <Button label="Cancelar" variant="secondary" onPress={() => volver()} />
        </View>

        <Text style={s.hint}>
          El torneo se crea como borrador. Desde el panel del torneo agregas categorías y abres las inscripciones.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space[4.5], paddingTop: space[3], paddingBottom: bottomInset, gap: space[3], ...webContentColumn },
  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3 },
  title:   { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },
  input: {
    backgroundColor:   color.surface2,
    borderWidth:       1,
    borderColor:       color.lineSoft,
    borderRadius:      radius.md,
    minHeight:         touchTarget,
    paddingHorizontal: space[4],
    fontFamily:        font.body,
    fontSize:          fontSize.body,
    color:             color.text,
  },


  errorText: { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, textAlign: 'center' },
  btns:      { gap: space[2] },
  hint:      { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, textAlign: 'center', lineHeight: 18 },
});
