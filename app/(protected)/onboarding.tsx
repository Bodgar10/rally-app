/**
 * RALLY · Onboarding del Jugador
 * Perfil progresivo: el jugador completa su perfil después del registro.
 * Campos: género, fecha nacimiento, lado preferido, categoría declarada.
 * Se puede saltar (el organizador valida categoría manualmente al arranque).
 * Escribe en public.users (RLS: update propio perfil).
 */

import { useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';

import { supabase }                             from '@/lib/supabase/client';
import { Button, Card, SectionLabel }           from '@/components/ui';
import { color, font, fontSize, space, radius } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';

// ─── Opciones ──────────────────────────────────────────────────────────────

const GENDER_OPTIONS = [
  { value: 'male',   label: 'Hombre' },
  { value: 'female', label: 'Mujer' },
];

const SIDE_OPTIONS = [
  { value: 'drive', label: 'Drive', sub: 'Lado derecho' },
  { value: 'reves', label: 'Revés', sub: 'Lado izquierdo' },
  { value: 'ambos', label: 'Ambos lados', sub: 'Juego en los dos' },
];

const DIVISION_OPTIONS = [
  { value: 'sexta',    label: '6ª División', sub: 'Iniciando en el padel' },
  { value: 'quinta',   label: '5ª División', sub: 'Juego regularmente' },
  { value: 'cuarta',   label: '4ª División', sub: 'Competidor intermedio' },
  { value: 'tercera',  label: '3ª División', sub: 'Competidor avanzado' },
  { value: 'segunda',  label: '2ª División', sub: 'Nivel alto' },
  { value: 'primera',  label: '1ª División', sub: 'Nivel élite / profesional' },
];

// ─── Componente de opción seleccionable ────────────────────────────────────

function OptionButton({
  label, sub, active, onPress,
}: { label: string; sub?: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[s.optBtn, active && s.optBtnActive]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
    >
      <View style={[s.optCheck, active && s.optCheckActive]}>
        {active && <Text style={s.optCheckMark}>✓</Text>}
      </View>
      <View style={s.optTexts}>
        <Text style={[s.optLabel, active && s.optLabelActive]}>{label}</Text>
        {sub && <Text style={s.optSub}>{sub}</Text>}
      </View>
    </Pressable>
  );
}

// ─── Pantalla ────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const router = useRouter();

  const [gender, setGender]     = useState<string | null>(null);
  const [side, setSide]         = useState<string | null>(null);
  const [division, setDivision] = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleSave(skip = false) {
    setError(null);
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    if (!skip) {
      const updates: Record<string, string> = {};
      if (gender)   updates.gender          = gender;
      if (side)     updates.preferred_side  = side;

      const { error: updateError } = await supabase
        .from('users')
        .update(updates)
        .eq('id', user.id);

      if (updateError) {
        setError('No se pudo guardar. Intenta de nuevo.');
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    router.replace('/(protected)/dashboard');
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.eyebrow}>RALLY</Text>
          <Text style={s.title}>Cuéntanos sobre ti</Text>
          <Text style={s.subtitle}>
            Esta información nos ayuda a mostrarte las categorías correctas y mejorar tu experiencia. Puedes completarla después.
          </Text>
        </View>

        {/* Género */}
        <SectionLabel title="¿Cuál es tu género?" />
        <Card variant="standard">
          <View style={s.twoCol}>
            {GENDER_OPTIONS.map(opt => (
              <Pressable
                key={opt.value}
                style={[s.genderBtn, gender === opt.value && s.genderBtnActive]}
                onPress={() => setGender(opt.value)}
              >
                <Text style={[s.genderLabel, gender === opt.value && s.genderLabelActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {/* Lado preferido */}
        <SectionLabel title="¿En qué lado juegas?" />
        <Card variant="standard">
          <View style={s.optList}>
            {SIDE_OPTIONS.map(opt => (
              <OptionButton
                key={opt.value}
                label={opt.label}
                sub={opt.sub}
                active={side === opt.value}
                onPress={() => setSide(opt.value)}
              />
            ))}
          </View>
        </Card>

        {/* Categoría declarada */}
        <SectionLabel title="¿En qué categoría juegas?" />
        <View style={s.divisionNote}>
          <Text style={s.divisionNoteText}>
            El organizador valida la categoría al inscribirte. Esto nos ayuda a mostrarte los torneos correctos.
          </Text>
        </View>
        <Card variant="standard">
          <View style={s.optList}>
            {DIVISION_OPTIONS.map(opt => (
              <OptionButton
                key={opt.value}
                label={opt.label}
                sub={opt.sub}
                active={division === opt.value}
                onPress={() => setDivision(opt.value)}
              />
            ))}
          </View>
        </Card>

        {/* Error */}
        {error && <Text style={s.errorText}>{error}</Text>}

        {/* Botones */}
        <View style={s.btns}>
          <Button
            label={saving ? 'Guardando…' : 'Guardar y continuar'}
            variant="primary"
            loading={saving}
            onPress={() => handleSave(false)}
          />
          <Button
            label="Saltar por ahora"
            variant="link"
            onPress={() => handleSave(true)}
          />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space[4.5], paddingTop: space[5], paddingBottom: bottomInset, gap: space[3], ...webContentColumn },

  header:   { marginBottom: space[2] },
  eyebrow:  { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3, marginBottom: space[1] },
  title:    { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text, marginBottom: space[1] },
  subtitle: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20 },

  // Género — dos columnas
  twoCol:         { flexDirection: 'row', gap: space[2] },
  genderBtn:      { flex: 1, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, padding: space[3], alignItems: 'center', backgroundColor: color.surface2 },
  genderBtnActive:{ borderColor: color.gold, backgroundColor: 'rgba(212,175,55,0.08)' },
  genderLabel:    { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  genderLabelActive:{ color: color.goldBright },

  // Opciones generales
  optList: { gap: space[2] },
  optBtn:  { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, backgroundColor: color.surface2 },
  optBtnActive: { borderColor: color.gold, backgroundColor: 'rgba(212,175,55,0.08)' },
  optCheck:     { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: color.gold, backgroundColor: color.surface2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  optCheckActive:{ backgroundColor: color.gold },
  optCheckMark: { fontSize: 12, color: color.onGold, fontWeight: '700' },
  optTexts:     { flex: 1 },
  optLabel:     { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  optLabelActive:{ color: color.goldBright },
  optSub:       { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, marginTop: 2 },

  // Nota categoría
  divisionNote:     { backgroundColor: color.surface, borderRadius: radius.md, padding: space[3], borderWidth: 1, borderColor: color.lineSoft },
  divisionNoteText: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },

  errorText: { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, textAlign: 'center' },

  btns: { gap: space[2], marginTop: space[2] },
});
