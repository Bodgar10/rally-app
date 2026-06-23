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

import { supabase }                             from '@/lib/supabase/client';
import { Button, Card, SectionLabel }           from '@/components/ui';
import { color, font, fontSize, space, radius, touchTarget } from '@/lib/design-tokens';

interface Venue { id: string; name: string; city: string }

export default function NuevoTorneoScreen() {
  const router = useRouter();

  const [name, setName]             = useState('');
  const [startDate, setStartDate]   = useState('');
  const [endDate, setEndDate]       = useState('');
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
          .select('id, name, city')
          .order('name'),
      ]);

      if (membership) setOrganizerId(membership.organizer_id);
      if (venueList)  setVenues(venueList as Venue[]);
    }
    load();
  }, []);

  function validateDate(d: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(d);
  }

  async function handleSave() {
    setError(null);
    if (!name.trim())          { setError('El nombre es obligatorio.');          return; }
    if (!validateDate(startDate)) { setError('Fecha de inicio inválida (YYYY-MM-DD).'); return; }
    if (!validateDate(endDate))   { setError('Fecha de fin inválida (YYYY-MM-DD).');    return; }
    if (endDate < startDate)   { setError('La fecha de fin debe ser después del inicio.'); return; }
    if (!organizerId)          { setError('No se encontró tu organización.');    return; }

    setSaving(true);

    const { data, error: insertError } = await supabase
      .from('tournaments')
      .insert({
        organizer_id:     organizerId,
        venue_id:         selectedVenue?.id ?? null,
        name:             name.trim(),
        start_date:       startDate,
        end_date:         endDate,
        registration_fee: parseFloat(fee) || 0,
        status:           'draft',
      })
      .select('id')
      .single();

    setSaving(false);

    if (insertError) {
      setError('No se pudo crear el torneo. Intenta de nuevo.');
      return;
    }

    // Ir al detalle del torneo recién creado para agregar categorías
    router.replace(`/(organizer)/org/torneos/${data.id}/index`);
  }

  return (
    <SafeAreaView style={s.safe}>
      <Pressable onPress={() => router.back()} style={s.back}>
        <Text style={s.backText}>← Volver</Text>
      </Pressable>

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

        {/* Fechas */}
        <SectionLabel title="Fechas" />
        <View style={s.dateRow}>
          <View style={s.dateField}>
            <Text style={s.dateLabel}>Inicio</Text>
            <TextInput
              style={s.input}
              placeholder="2026-07-12"
              placeholderTextColor={color.muted}
              value={startDate}
              onChangeText={setStartDate}
              keyboardType="numbers-and-punctuation"
              selectionColor={color.gold}
            />
          </View>
          <View style={s.dateField}>
            <Text style={s.dateLabel}>Fin</Text>
            <TextInput
              style={s.input}
              placeholder="2026-07-13"
              placeholderTextColor={color.muted}
              value={endDate}
              onChangeText={setEndDate}
              keyboardType="numbers-and-punctuation"
              selectionColor={color.gold}
            />
          </View>
        </View>

        {/* Sede */}
        <SectionLabel title="Sede" />
        {venues.length === 0
          ? <Text style={s.noVenueText}>No hay sedes registradas. El admin debe agregar sedes primero.</Text>
          : venues.map(v => (
              <Pressable
                key={v.id}
                style={[s.venueBtn, selectedVenue?.id === v.id && s.venueBtnActive]}
                onPress={() => setSelectedVenue(v)}
              >
                <Text style={[s.venueName, selectedVenue?.id === v.id && s.venueNameActive]}>
                  {v.name}
                </Text>
                <Text style={s.venueCity}>{v.city}</Text>
              </Pressable>
            ))
        }

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
          <Button label="Cancelar" variant="secondary" onPress={() => router.back()} />
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
  back:    { paddingHorizontal: space[4.5], paddingTop: space[4] },
  backText:{ fontFamily: font.body, fontSize: fontSize.body, color: color.gold },
  content: { paddingHorizontal: space[4.5], paddingTop: space[3], paddingBottom: space[6] * 2, gap: space[3] },
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
  dateRow:   { flexDirection: 'row', gap: space[2] },
  dateField: { flex: 1, gap: space[1] },
  dateLabel: { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne },

  venueBtn:      { backgroundColor: color.surface2, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, padding: space[3] },
  venueBtnActive:{ borderColor: color.gold, backgroundColor: 'rgba(212,175,55,0.08)' },
  venueName:     { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  venueNameActive:{ color: color.goldBright },
  venueCity:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  noVenueText:   { fontFamily: font.body, fontSize: fontSize.body, color: color.muted },

  errorText: { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, textAlign: 'center' },
  btns:      { gap: space[2] },
  hint:      { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, textAlign: 'center', lineHeight: 18 },
});
