/**
 * RALLY · Agregar categorías al torneo
 * El organizador elige división + género.
 * display_name se genera automáticamente.
 * Escribe en public.categories con status = 'open'.
 */

import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { supabase }                             from '@/lib/supabase/client';
import { Button, Card, SectionLabel }           from '@/components/ui';
import { color, font, fontSize, space, radius } from '@/lib/design-tokens';

const DIVISIONS = ['sexta','quinta','cuarta','tercera','segunda','primera'] as const;
const GENDERS   = [
  { value: 'male',   label: 'Varonil' },
  { value: 'female', label: 'Femenil' },
  { value: 'mixed',  label: 'Mixto' },
] as const;

const DIVISION_LABELS: Record<string, string> = {
  sexta: '6ª', quinta: '5ª', cuarta: '4ª',
  tercera: '3ª', segunda: '2ª', primera: '1ª',
};

function makeDisplayName(division: string, gender: string): string {
  const div = DIVISION_LABELS[division] ?? division;
  const gen = { male: 'Varonil', female: 'Femenil', mixed: 'Mixto' }[gender] ?? gender;
  return `${div} ${gen}`;
}

interface ExistingCategory { id: string; display_name: string }

export default function CategoriasScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();

  const [existing, setExisting] = useState<ExistingCategory[]>([]);
  const [division, setDivision] = useState<string>('quinta');
  const [gender, setGender]     = useState<string>('mixed');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function loadExisting() {
    const { data } = await supabase
      .from('categories')
      .select('id, display_name')
      .eq('tournament_id', tournamentId)
      .order('division');
    if (data) setExisting(data as ExistingCategory[]);
  }

  useEffect(() => { loadExisting(); }, [tournamentId]);

  async function handleAdd() {
    setError(null);
    const displayName = makeDisplayName(division, gender);

    // Verificar que no exista ya
    const duplicate = existing.find(e => e.display_name === displayName);
    if (duplicate) { setError(`${displayName} ya está agregada.`); return; }

    setSaving(true);
    const { error: insertError } = await supabase
      .from('categories')
      .insert({
        tournament_id: tournamentId,
        division,
        gender,
        display_name: displayName,
        status:        'open',
      });
    setSaving(false);

    if (insertError) { setError('No se pudo agregar. Intenta de nuevo.'); return; }
    await loadExisting();
  }

  async function handleDelete(id: string) {
    await supabase.from('categories').delete().eq('id', id);
    await loadExisting();
  }

  return (
    <SafeAreaView style={s.safe}>
      <Pressable onPress={() => router.back()} style={s.back}>
        <Text style={s.backText}>← Volver al torneo</Text>
      </Pressable>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.eyebrow}>CATEGORÍAS</Text>
        <Text style={s.title}>Agregar categoría</Text>

        {/* División */}
        <SectionLabel title="División" />
        <View style={s.chipRow}>
          {DIVISIONS.map(d => (
            <Pressable
              key={d}
              style={[s.chip, division === d && s.chipActive]}
              onPress={() => setDivision(d)}
            >
              <Text style={[s.chipLabel, division === d && s.chipLabelActive]}>
                {DIVISION_LABELS[d]}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Género */}
        <SectionLabel title="Género" />
        <View style={s.chipRow}>
          {GENDERS.map(g => (
            <Pressable
              key={g.value}
              style={[s.chip, gender === g.value && s.chipActive]}
              onPress={() => setGender(g.value)}
            >
              <Text style={[s.chipLabel, gender === g.value && s.chipLabelActive]}>
                {g.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Preview */}
        <Card variant="feature">
          <Text style={s.previewLabel}>Se agregará:</Text>
          <Text style={s.previewName}>{makeDisplayName(division, gender)}</Text>
        </Card>

        {error && <Text style={s.errorText}>{error}</Text>}

        <Button
          label={saving ? 'Agregando…' : 'Agregar categoría'}
          variant="primary"
          loading={saving}
          onPress={handleAdd}
        />

        {/* Categorías ya agregadas */}
        {existing.length > 0 && (
          <>
            <SectionLabel title="Categorías en este torneo" />
            {existing.map(cat => (
              <Card key={cat.id} variant="standard">
                <View style={s.existRow}>
                  <Text style={s.existName}>{cat.display_name}</Text>
                  <Pressable onPress={() => handleDelete(cat.id)} style={s.deleteBtn}>
                    <Text style={s.deleteText}>Eliminar</Text>
                  </Pressable>
                </View>
              </Card>
            ))}
          </>
        )}

        <Button label="Listo" variant="secondary" onPress={() => router.back()} />

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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip:    { borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: color.surface2 },
  chipActive:      { borderColor: color.gold, backgroundColor: 'rgba(212,175,55,0.12)' },
  chipLabel:       { fontFamily: font.display, fontSize: 13, color: color.text },
  chipLabelActive: { color: color.goldBright },
  previewLabel:    { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, marginBottom: space[1] },
  previewName:     { fontFamily: font.display, fontSize: fontSize.metric, color: color.goldBright },
  errorText:       { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, textAlign: 'center' },
  existRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  existName:       { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  deleteBtn:       { padding: space[2] },
  deleteText:      { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger },
});
